/**
 * UI/Components/JoystickUI/JoystickAimMode.js
 *
 * Twin-stick targeting for the right stick.
 *
 * In aim mode the right stick no longer moves the virtual cursor. Pushing
 * it aims from the character in that direction, straight across the
 * screen: the first mob (or ground item, following the D-pad cycle mode)
 * near that ray becomes the target, at once, at any on-screen distance.
 * X then attacks it, Y picks it up. A red ring on the ground marks the
 * target while aim mode is on. Tapping RS click switches between aim and
 * cursor mode (JoystickButtonInput).
 *
 * The ring is drawn on a 2D canvas laid over the game canvas, below the
 * UI windows, by projecting ground points through the camera.
 *
 * Only a firm push picks a new target (createRetargetGate). A released
 * stick springs back past the centre for a frame or two, which reads as
 * a push the other way; without the gate that swapped the target for a
 * mob behind the character.
 */

import glMatrix from 'Vendors/gl-matrix.js';
import Session from 'Engine/SessionStorage.js';
import Renderer from 'Renderer/Renderer.js';
import Camera from 'Renderer/Camera.js';
import Altitude from 'Renderer/Map/Altitude.js';
import ControlsSettings from 'Preferences/Controls.js';
import ChatBox from 'UI/Components/ChatBox/ChatBox.js';
import Target from './JoystickTargetService.js';
import Cursor from './JoystickMouseCursorAdapter.js';
import JoystickUIRenderer from './JoystickUIRenderer.js';

/**
 * Values of ControlsSettings.joyRightStickMode.
 */
const MODE = {
	CURSOR: 0,
	AIM: 1
};

/**
 * Values of ControlsSettings.joyQuick.
 */
const QUICK_CAST = {
	OFF: 0,
	RELEASE: 1,
	INSTANT: 2
};

// How far from the ray a target may stand and still count: HIT_RADIUS
// cells next to the character, widening by HIT_SPREAD cells per cell of
// distance (about 2 cells at 15 away), so a slightly-off stick still
// reaches distant mobs.
const HIT_RADIUS = 0.9;
const HIT_SPREAD = 0.075;

// Retarget gate: the stick must be pushed at least this far to pick a
// new target, and after it drops below that, or turns around in one
// frame, it picks none for RELEASE_LOCK_MS. A dot product of the stick
// direction with last frame's below FLIP_DOT (about 120 degrees) counts
// as turning around.
const RETARGET_MAGNITUDE = 0.5;
const RELEASE_LOCK_MS = 150;
const FLIP_DOT = -0.5;

const RING_RADIUS = 0.6; // cells
const RING_POINTS = 24;
const RING_FADE_MS = 2000; // the ring fades out over this long after a new target
const LINE_STEP = 0.5; // cells between projected line points, so it follows the ground
const LINE_IDLE_LENGTH = 3; // cells, the line while the aim is on nothing
const LINE_COLOR_HIT = 'rgba(255, 82, 82, 0.9)';
const LINE_COLOR_IDLE = 'rgba(255, 215, 64, 0.85)';

let _aimLastHit = null;
let _aimGate = null; // createRetargetGate(), made on first use
let _aimOverlay = null;
let _aimCtx = null;
let _aimDrawn = false;
let _aimRingTarget = null; // the target the aim selected last
let _aimRingAt = 0; // when, for the fade-out

let _cursorHidden = false;
let _mouseMoved = false; // the real mouse moved: cursor stays visible until the stick aims again
let _mouseListening = false;

const _aimWorld = glMatrix.vec4.create();
const _aimView = glMatrix.vec4.create();

function isEnabled() {
	return !!ControlsSettings.joyAimEnabled;
}

function isActive() {
	return isEnabled() && ControlsSettings.joyRightStickMode === MODE.AIM;
}

/**
 * The Quick-Cast mode in effect. With aiming available, Off is not: it
 * leaves a targeted skill waiting for an A click at the cursor, and the
 * aim does not keep the cursor on the target, so Instant stands in for it.
 *
 * @return {number} QUICK_CAST value
 */
function quickCastMode() {
	const mode = ControlsSettings.joyQuick | 0;
	return mode === QUICK_CAST.OFF && isEnabled() ? QUICK_CAST.INSTANT : mode;
}

/**
 * Turn a stick vector into a map direction.
 *
 * The camera's modelView is Rx(angle[0]) . Ry(angle[1]), so a map step
 * lands on screen rotated by -angle[1]; an on-screen intent therefore
 * becomes a map step through R(+angle[1]). Uses the continuous angle, not
 * Camera.direction, which is a 45 degree sprite bucket.
 *
 * @param {number} x stick x, right positive
 * @param {number} y stick y, down positive (Gamepad API)
 * @param {number} degrees camera yaw, Camera.angle[1]
 * @return {Array<number>} unit vector [dx, dy] in map cells
 */
function stickToMapDirection(x, y, degrees) {
	const angle = (degrees * Math.PI) / 180;
	const sx = x;
	const sy = -y; // screen up is map "forward"
	const dx = sx * Math.cos(angle) - sy * Math.sin(angle);
	const dy = sx * Math.sin(angle) + sy * Math.cos(angle);
	const len = Math.hypot(dx, dy) || 1;
	return [dx / len, dy / len];
}

/**
 * First entity along a ray: the smallest distance along it among entities
 * within the (slightly widening) hit zone. No length limit; the caller
 * passes only entities on screen.
 *
 * @param {Array<number>} origin [x, y] map position
 * @param {Array<number>} dir unit [dx, dy]
 * @param {Array<Entity>} entities candidates
 * @return {{entity: Entity, along: number}|null}
 */
function findFirstHit(origin, dir, entities) {
	let best = null;
	for (let i = 0; i < entities.length; i++) {
		const entity = entities[i];
		const dx = entity.position[0] - origin[0];
		const dy = entity.position[1] - origin[1];
		const along = dx * dir[0] + dy * dir[1];
		if (along <= 0) {
			continue;
		}
		const off = Math.abs(dx * dir[1] - dy * dir[0]);
		if (off <= HIT_RADIUS + along * HIT_SPREAD && (!best || along < best.along)) {
			best = { entity: entity, along: along };
		}
	}
	return best;
}

/**
 * Decides, frame by frame, whether the stick may pick a new target: only
 * while pushed firmly, and not in the moment after a release or a sudden
 * turn-around, when the stick is springing back past the centre.
 *
 * @return {{step: function(number, number, number): boolean, isLocked: function(number): boolean, reset: function()}}
 *   step(x, y, now) once per frame, (0, 0) while the stick is in the deadzone
 */
function createRetargetGate() {
	let firm = false;
	let lastX = 0;
	let lastY = 0;
	let lockedUntil = 0;

	return {
		step(x, y, now) {
			const magnitude = Math.hypot(x, y);
			const nowFirm = magnitude >= Math.max(RETARGET_MAGNITUDE, ControlsSettings.joyDeadline || 0);

			if (firm && !nowFirm) {
				lockedUntil = now + RELEASE_LOCK_MS;
			} else if (firm && nowFirm && (x * lastX + y * lastY) / magnitude < FLIP_DOT) {
				lockedUntil = now + RELEASE_LOCK_MS;
			}

			firm = nowFirm;
			if (nowFirm) {
				lastX = x / magnitude;
				lastY = y / magnitude;
			}
			return nowFirm && now >= lockedUntil;
		},
		isLocked(now) {
			return now < lockedUntil;
		},
		reset() {
			firm = false;
			lockedUntil = 0;
		}
	};
}

/**
 * Screen position of a ground point, or null behind the camera.
 */
function project(x, y) {
	_aimWorld[0] = x + 0.5;
	_aimWorld[1] = -Altitude.getCellHeight(x, y);
	_aimWorld[2] = y + 0.5;
	_aimWorld[3] = 1.0;
	glMatrix.vec4.transformMat4(_aimView, _aimWorld, Camera.modelView);
	glMatrix.vec4.transformMat4(_aimView, _aimView, Camera.projection);
	if (_aimView[3] <= 0) {
		return null;
	}
	return [
		Renderer.width / 2 + (Renderer.width / 2) * (_aimView[0] / _aimView[3]),
		Renderer.height / 2 - (Renderer.height / 2) * (_aimView[1] / _aimView[3])
	];
}

function isOnScreen(entity) {
	const p = project(entity.position[0], entity.position[1]);
	return !!p && p[0] >= 0 && p[0] <= Renderer.width && p[1] >= 0 && p[1] <= Renderer.height;
}

/**
 * Overlay canvas over the game canvas, sized to it.
 */
function getContext() {
	const scene = Renderer.canvas;
	if (!scene || !scene.parentNode) {
		return null;
	}

	if (!_aimOverlay) {
		_aimOverlay = document.createElement('canvas');
		_aimOverlay.className = 'joystick-aim';
		_aimOverlay.style.position = 'absolute';
		_aimOverlay.style.top = '0px';
		_aimOverlay.style.left = '0px';
		_aimOverlay.style.zIndex = 1;
		_aimOverlay.style.pointerEvents = 'none';
		scene.parentNode.insertBefore(_aimOverlay, scene.nextSibling);
		_aimCtx = _aimOverlay.getContext('2d');
	}

	const dpr = window.devicePixelRatio || 1;
	const width = Math.round(Renderer.width * dpr);
	const height = Math.round(Renderer.height * dpr);
	if (_aimOverlay.width !== width || _aimOverlay.height !== height) {
		_aimOverlay.width = width;
		_aimOverlay.height = height;
		_aimOverlay.style.width = Renderer.width + 'px';
		_aimOverlay.style.height = Renderer.height + 'px';
	}
	return _aimCtx;
}

function clearOverlay() {
	if (_aimDrawn && _aimCtx) {
		_aimCtx.setTransform(1, 0, 0, 1, 0, 0);
		_aimCtx.clearRect(0, 0, _aimOverlay.width, _aimOverlay.height);
		_aimDrawn = false;
	}
}

/**
 * A red ring flat on the ground under the entity, in perspective.
 *
 * @param {CanvasRenderingContext2D} ctx overlay, already cleared
 * @param {Entity} entity
 * @param {number} alpha 0-1, for the fade-out
 * @param {string} [rgb] ring colour as 'r, g, b', red by default
 */
function drawRing(ctx, entity, alpha, rgb = '255, 64, 64') {
	const points = [];
	for (let i = 0; i < RING_POINTS; i++) {
		const a = (i / RING_POINTS) * Math.PI * 2;
		const p = project(
			entity.position[0] + Math.cos(a) * RING_RADIUS,
			entity.position[1] + Math.sin(a) * RING_RADIUS
		);
		if (!p) {
			return;
		}
		points.push(p);
	}

	ctx.beginPath();
	ctx.moveTo(points[0][0], points[0][1]);
	for (let i = 1; i < points.length; i++) {
		ctx.lineTo(points[i][0], points[i][1]);
	}
	ctx.closePath();
	ctx.fillStyle = 'rgba(' + rgb + ', ' + 0.2 * alpha + ')';
	ctx.fill();
	ctx.lineWidth = 2.5;
	ctx.strokeStyle = 'rgba(' + rgb + ', ' + 0.9 * alpha + ')';
	ctx.stroke();
	_aimDrawn = true;
}

/**
 * The aim line along the ground from the character, sampled so it follows
 * the terrain: to the target the aim hit, or a short stub in the aimed
 * direction while it hits nothing.
 *
 * @param {CanvasRenderingContext2D} ctx overlay, already cleared
 * @param {Array<number>} from [x, y] map position
 * @param {Array<number>} to [x, y] map position
 * @param {string} color stroke colour
 */
function drawAimLine(ctx, from, to, color) {
	const dx = to[0] - from[0];
	const dy = to[1] - from[1];
	const length = Math.hypot(dx, dy);
	if (length === 0) {
		return;
	}

	const points = [];
	for (let t = 0; t < length; t += LINE_STEP) {
		const p = project(from[0] + (dx / length) * t, from[1] + (dy / length) * t);
		if (p) {
			points.push(p);
		}
	}
	const end = project(to[0], to[1]);
	if (end) {
		points.push(end);
	}
	if (points.length < 2) {
		return;
	}

	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	[
		['rgba(0, 0, 0, 0.45)', 5],
		[color, 2.5]
	].forEach(([stroke, width]) => {
		ctx.strokeStyle = stroke;
		ctx.lineWidth = width;
		ctx.beginPath();
		ctx.moveTo(points[0][0], points[0][1]);
		for (let i = 1; i < points.length; i++) {
			ctx.lineTo(points[i][0], points[i][1]);
		}
		ctx.stroke();
	});
	_aimDrawn = true;
}

/**
 * The entity aim mode marks: the marked item, NPC or portal, else the
 * focus if it is still an attackable target on this map (not an NPC or
 * friendly player the player clicked, nor a focus left over from the
 * previous map).
 */
function getTarget() {
	return Target.getMarked() || Target.getAttackableFocus();
}

/**
 * Show or hide the game's cursor (CursorManager's .cursor element). Only
 * its visibility changes: Mouse.screen still follows the target, so A
 * clicks it as before.
 */
function setCursorHidden(hidden) {
	if (hidden === _cursorHidden) {
		return;
	}
	const cursor = document.querySelector('.cursor');
	if (!cursor) {
		return;
	}
	cursor.style.visibility = hidden ? 'hidden' : '';
	_cursorHidden = hidden;
}

/**
 * A real mouse move shows the cursor again, so the player taking the mouse
 * is never left without one. Synthetic events (isTrusted false) do not
 * count.
 */
function onMouseMove(event) {
	if (event.isTrusted) {
		_mouseMoved = true;
		setCursorHidden(false);
	}
}

/**
 * Aim mode left: remove the ring, forget the last hit, show the cursor.
 */
function release() {
	_aimLastHit = null;
	if (_aimGate) {
		_aimGate.reset();
	}
	_aimRingTarget = null;
	clearOverlay();
	setCursorHidden(false);
}

/**
 * One frame of aim mode (JoystickCursorMotion).
 *
 * @param {number} x right stick x
 * @param {number} y right stick y
 * @param {boolean} held stick outside the deadzone
 */
function update(x, y, held) {
	const player = Session.Entity;
	if (!player) {
		release();
		return;
	}

	// Settings > Gamepad > Aim Settings > Hide Cursor, off by default
	if (held) {
		_mouseMoved = false;
	}
	if (ControlsSettings.joyAimHideCursor && !_mouseListening) {
		window.addEventListener('mousemove', onMouseMove);
		_mouseListening = true;
	}
	setCursorHidden(!!ControlsSettings.joyAimHideCursor && !_mouseMoved);

	const origin = [player.position[0], player.position[1]];
	let hit = null;
	let dir = null;
	let locked = false;

	if (!_aimGate) {
		_aimGate = createRetargetGate();
	}

	if (held) {
		const now = performance.now();
		const canRetarget = _aimGate.step(x, y, now);
		locked = _aimGate.isLocked(now);

		dir = stickToMapDirection(x, y, Camera.angle[1]);
		const candidates = Target.getCycleCandidates(player).filter(isOnScreen);
		hit = findFirstHit(origin, dir, candidates);

		if (canRetarget && hit && hit.entity !== _aimLastHit) {
			Target.aimAt(hit.entity);
			_aimLastHit = hit.entity;
			_aimRingTarget = hit.entity;
			_aimRingAt = now;
		}
	} else {
		_aimLastHit = null;
		_aimGate.step(0, 0, performance.now());
	}

	const target = getTarget();

	// Keep the virtual cursor on the target while aiming, so A clicks it
	if (held && target) {
		Cursor.moveMouseToEntity(target);
	}

	// Both indicators are off by default (Settings > Gamepad > Aim Settings)
	let line = null;
	// Not while the gate is locked: the stick is springing back, not aiming
	if (ControlsSettings.joyAimLine && held && !locked) {
		line =
			hit && hit.entity === target
				? { to: [target.position[0], target.position[1]], color: LINE_COLOR_HIT }
				: {
						to: [origin[0] + dir[0] * LINE_IDLE_LENGTH, origin[1] + dir[1] * LINE_IDLE_LENGTH],
						color: LINE_COLOR_IDLE
					};
	}
	const fade = 1 - (performance.now() - _aimRingAt) / RING_FADE_MS;
	const ring = ControlsSettings.joyAimRing && _aimRingTarget === target && target && fade > 0 ? target : null;

	clearOverlay();
	if (!line && !ring) {
		return;
	}
	const ctx = getContext();
	if (!ctx) {
		return;
	}
	const dpr = window.devicePixelRatio || 1;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	if (line) {
		drawAimLine(ctx, origin, line.to, line.color);
	}
	if (ring) {
		drawRing(ctx, ring, fade);
	}
}

/**
 * Switch the right stick between aim and cursor (tap RS click).
 */
function toggle() {
	if (!isEnabled()) {
		return;
	}
	ControlsSettings.joyRightStickMode = isActive() ? MODE.CURSOR : MODE.AIM;
	ControlsSettings.save();
	release();
	JoystickUIRenderer.updateStickMode();
	ChatBox.addText('Right stick: ' + (isActive() ? 'aim' : 'cursor'), ChatBox.TYPE.INFO, ChatBox.FILTER.PUBLIC_LOG);
}

/**
 * Settings checkbox. Turning aiming on puts the right stick in aim mode
 * straight away; turning it off returns it to the cursor for good.
 */
function setEnabled(enabled) {
	ControlsSettings.joyAimEnabled = !!enabled;
	ControlsSettings.joyRightStickMode = enabled ? MODE.AIM : MODE.CURSOR;
	// Quick-Cast Off is not available with aiming (quickCastMode)
	if (enabled && (ControlsSettings.joyQuick | 0) === QUICK_CAST.OFF) {
		ControlsSettings.joyQuick = QUICK_CAST.INSTANT;
	}
	ControlsSettings.save();
	release();
	JoystickUIRenderer.updateStickMode();
}

export default {
	MODE,
	QUICK_CAST,
	isEnabled,
	isActive,
	quickCastMode,
	setEnabled,
	update,
	release,
	toggle,
	stickToMapDirection,
	findFirstHit,
	createRetargetGate,
	project,
	isOnScreen,
	drawRing
};
