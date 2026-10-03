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
 * Module-level names carry an _aim prefix on purpose: the bundler renames
 * clashing top-level names with $N suffixes, and the app's bundle patches
 * anchor on other modules' suffixed names (e.g. Navigation's _ctx$2).
 */

import glMatrix from 'Vendors/gl-matrix.js';
import Session from 'Engine/SessionStorage.js';
import EntityManager from 'Renderer/EntityManager.js';
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

// How far from the ray a target may stand and still count: HIT_RADIUS
// cells next to the character, widening by HIT_SPREAD cells per cell of
// distance (about 2 cells at 15 away), so a slightly-off stick still
// reaches distant mobs.
const HIT_RADIUS = 0.9;
const HIT_SPREAD = 0.075;

const RING_RADIUS = 0.6; // cells
const RING_POINTS = 24;

let _aimLastHit = null;
let _aimOverlay = null;
let _aimCtx = null;
let _aimDrawn = false;

const _aimWorld = glMatrix.vec4.create();
const _aimView = glMatrix.vec4.create();

function isActive() {
	return ControlsSettings.joyRightStickMode === MODE.AIM;
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
 */
function drawRing(entity) {
	const ctx = getContext();
	if (!ctx) {
		return;
	}
	clearOverlay();

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

	const dpr = window.devicePixelRatio || 1;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.beginPath();
	ctx.moveTo(points[0][0], points[0][1]);
	for (let i = 1; i < points.length; i++) {
		ctx.lineTo(points[i][0], points[i][1]);
	}
	ctx.closePath();
	ctx.fillStyle = 'rgba(255, 64, 64, 0.2)';
	ctx.fill();
	ctx.lineWidth = 2.5;
	ctx.strokeStyle = 'rgba(255, 64, 64, 0.9)';
	ctx.stroke();
	_aimDrawn = true;
}

/**
 * The entity aim mode marks: the cycled item, else the focused mob, if
 * still alive and in the scene.
 */
function getTarget() {
	const target = Target.getItem() || EntityManager.getFocusEntity();
	if (!target || target.remove_tick !== 0 || target.action === target.ACTION.DIE) {
		return null;
	}
	return target;
}

/**
 * Aim mode left: remove the ring and forget the last hit.
 */
function release() {
	_aimLastHit = null;
	clearOverlay();
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

	if (held) {
		const origin = [player.position[0], player.position[1]];
		const dir = stickToMapDirection(x, y, Camera.angle[1]);
		const candidates = EntityManager.getEntitiesSortedByDistance(
			player,
			Target.getCycleTypes(player.constructor)
		).filter(isOnScreen);
		const hit = findFirstHit(origin, dir, candidates);

		if (hit && hit.entity !== _aimLastHit) {
			Target.aimAt(hit.entity);
			_aimLastHit = hit.entity;
		}
	} else {
		_aimLastHit = null;
	}

	const target = getTarget();
	if (!target) {
		clearOverlay();
		return;
	}

	// Keep the virtual cursor on the target while aiming, so A clicks it
	if (held) {
		Cursor.moveMouseToEntity(target);
	}
	drawRing(target);
}

/**
 * Switch the right stick between aim and cursor (tap RS click).
 */
function toggle() {
	ControlsSettings.joyRightStickMode = isActive() ? MODE.CURSOR : MODE.AIM;
	ControlsSettings.save();
	release();
	JoystickUIRenderer.updateStickMode();
	ChatBox.addText('Right stick: ' + (isActive() ? 'aim' : 'cursor'), ChatBox.TYPE.INFO, ChatBox.FILTER.PUBLIC_LOG);
}

export default {
	MODE,
	isActive,
	update,
	release,
	toggle,
	stickToMapDirection,
	findFirstHit
};
