/**
 * UI/Components/JoystickUI/JoystickAimMode.js
 *
 * Twin-stick targeting for the right stick.
 *
 * In aim mode the right stick no longer moves the virtual cursor. Holding
 * it draws a line on the ground from the character in the pushed
 * direction; the line grows while the stick is held, and the first mob
 * (or ground item, following the D-pad cycle mode) on it becomes the
 * target. X then attacks it, Y picks it up. Tapping RS click switches
 * between aim and cursor mode (JoystickButtonInput).
 *
 * The line is drawn on a 2D canvas laid over the game canvas, below the
 * UI windows, by projecting ground points through the camera.
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

const START_LENGTH = 2; // cells, the moment the stick leaves the deadzone
const MAX_LENGTH = 15; // cells
const GROW_PER_SEC = 18; // cells per second while held
const HIT_RADIUS = 0.9; // cells either side of the line that still count
const SAMPLE_STEP = 0.5; // cells between projected points, so the line follows the ground

let _aimLength = 0;
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
 * First entity along a ray: the smallest distance along the line among
 * entities within HIT_RADIUS of it, up to length.
 *
 * @param {Array<number>} origin [x, y] map position
 * @param {Array<number>} dir unit [dx, dy]
 * @param {number} length cells
 * @param {Array<Entity>} entities candidates
 * @return {{entity: Entity, along: number}|null}
 */
function findFirstHit(origin, dir, length, entities) {
	let best = null;
	for (let i = 0; i < entities.length; i++) {
		const entity = entities[i];
		const dx = entity.position[0] - origin[0];
		const dy = entity.position[1] - origin[1];
		const along = dx * dir[0] + dy * dir[1];
		if (along <= 0 || along > length + HIT_RADIUS) {
			continue;
		}
		const off = Math.abs(dx * dir[1] - dy * dir[0]);
		if (off <= HIT_RADIUS && (!best || along < best.along)) {
			best = { entity: entity, along: along };
		}
	}
	return best;
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
	_aimCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
	return _aimCtx;
}

function clearLine() {
	if (_aimDrawn && _aimCtx) {
		_aimCtx.setTransform(1, 0, 0, 1, 0, 0);
		_aimCtx.clearRect(0, 0, _aimOverlay.width, _aimOverlay.height);
		_aimDrawn = false;
	}
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

function drawLine(origin, dir, length, hit) {
	const ctx = getContext();
	if (!ctx) {
		return;
	}
	clearLine();
	ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);

	const points = [];
	for (let t = 0; t < length; t += SAMPLE_STEP) {
		const p = project(origin[0] + dir[0] * t, origin[1] + dir[1] * t);
		if (p) {
			points.push(p);
		}
	}
	const end = project(origin[0] + dir[0] * length, origin[1] + dir[1] * length);
	if (end) {
		points.push(end);
	}
	if (points.length < 2) {
		return;
	}

	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	const color = hit ? 'rgba(255, 82, 82, 0.9)' : 'rgba(255, 215, 64, 0.85)';
	[
		['rgba(0, 0, 0, 0.45)', 6],
		[color, 3]
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

	const tip = points[points.length - 1];
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.arc(tip[0], tip[1], hit ? 6 : 4, 0, Math.PI * 2);
	ctx.fill();
	_aimDrawn = true;
}

/**
 * Stick back in the deadzone, or aim mode left: hide the line and start
 * the next aim short again. The target stays selected.
 */
function release() {
	_aimLength = 0;
	_aimLastHit = null;
	clearLine();
}

/**
 * One frame of aiming (JoystickCursorMotion).
 *
 * @param {number} x right stick x
 * @param {number} y right stick y
 * @param {boolean} held stick outside the deadzone
 * @param {number} dt seconds since the last frame
 */
function update(x, y, held, dt) {
	const player = Session.Entity;
	if (!held || !player) {
		release();
		return;
	}

	_aimLength = _aimLength === 0 ? START_LENGTH : Math.min(MAX_LENGTH, _aimLength + GROW_PER_SEC * dt);

	const origin = [player.position[0], player.position[1]];
	const dir = stickToMapDirection(x, y, Camera.angle[1]);
	const candidates = EntityManager.getEntitiesSortedByDistance(player, Target.getCycleTypes(player.constructor));
	const hit = findFirstHit(origin, dir, _aimLength, candidates);

	if (hit && hit.entity !== _aimLastHit) {
		Target.aimAt(hit.entity);
	}
	_aimLastHit = hit ? hit.entity : _aimLastHit;

	// Keep the virtual cursor on the target so A clicks it, as after a cycle
	const focus = Target.getItem() || EntityManager.getFocusEntity();
	if (focus) {
		Cursor.moveMouseToEntity(focus);
	}

	drawLine(origin, dir, hit ? Math.min(_aimLength, hit.along) : _aimLength, !!hit);
}

/**
 * Switch the right stick between aim and cursor (tap RS click).
 */
function toggle() {
	ControlsSettings.joyRightStickMode = isActive() ? MODE.CURSOR : MODE.AIM;
	ControlsSettings.save();
	release();
	JoystickUIRenderer.updateStickMode();
	ChatBox.addText(
		'Right stick: ' + (isActive() ? 'aim line' : 'cursor'),
		ChatBox.TYPE.INFO,
		ChatBox.FILTER.PUBLIC_LOG
	);
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
