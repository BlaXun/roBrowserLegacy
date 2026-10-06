/**
 * UI/Components/JoystickUI/JoystickCursorMotion.js
 *
 * Moves the virtual cursor with the right stick once per animation frame,
 * and gives the same frame to the View + D-pad camera
 * (JoystickCameraMotion). Stick values pass JoystickStickFilter first.
 *
 * The button/left-stick poll runs at 10 Hz (JoystickPollingLoop), which is
 * fine for discrete actions but made the cursor jump joySense pixels ten
 * times a second. Here the stick is read every frame and the cursor moves
 * by speed * elapsed time, with a quadratic response curve: small
 * deflections give slow, precise movement (picking a small item off the
 * ground), full tilt keeps the old top speed of joySense px per 100 ms.
 *
 * The frame loop only runs while a gamepad is connected: start() arms it,
 * and it begins on 'gamepadconnected' or when the 1 Hz idle poll first sees
 * a pad (wake()), and stops itself on the first frame that finds none.
 * Without a pad, nothing runs per frame.
 */

import ControlsSettings from 'Preferences/Controls.js';
import Cursor from './JoystickMouseCursorAdapter.js';
import Aim from './JoystickAimMode.js';
import StickFilter from './JoystickStickFilter.js';
import CameraMotion from './JoystickCameraMotion.js';
import Support from './JoystickSupportMode.js';

// Old behaviour moved joySense px per 100 ms poll at full deflection.
const SENSE_TO_PX_PER_SEC = 10;

// Longest frame step honoured, so a stalled or backgrounded tab does not
// fling the cursor across the screen on its next frame.
const MAX_DT = 0.05;

let frameHandle = null;
let lastTime = 0;
let enabled = false;

function getGamepad() {
	const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
	for (let i = 0; i < gamepads.length; i++) {
		if (gamepads[i]) {
			return gamepads[i];
		}
	}
	return null;
}

function frame(time) {
	const gp = getGamepad();
	if (!gp) {
		// Last pad gone: stop until one connects again
		Aim.release();
		Support.release();
		frameHandle = null;
		return;
	}

	frameHandle = requestAnimationFrame(frame);

	const dt = Math.min(MAX_DT, (time - lastTime) / 1000);
	lastTime = time;

	if (dt > 0) {
		CameraMotion.update(gp, dt);
	}

	if (gp.axes.length < 4 || dt <= 0) {
		Aim.release();
		Support.release();
		return;
	}

	const axes = StickFilter.filterAxes(gp.axes);
	let x = axes[2];
	let y = axes[3];
	if (ControlsSettings.joyReverseStick) {
		x = axes[0];
		y = axes[1];
	}

	// Radial deadzone, then rescale so speed starts at 0 just past it
	const magnitude = Math.hypot(x, y);
	const deadzone = ControlsSettings.joyDeadline;

	// Support: the right stick picks a party member on the radial
	if (Support.update(x, y, magnitude, deadzone)) {
		Aim.release();
		return;
	}

	// Aim mode: the right stick picks a target instead
	if (Aim.isActive()) {
		Aim.update(x, y, magnitude > deadzone);
		return;
	}
	Aim.release();

	if (magnitude <= deadzone) {
		return;
	}
	const scaled = Math.min(1, (magnitude - deadzone) / (1 - deadzone));
	const speed = scaled * scaled * ControlsSettings.joySense * SENSE_TO_PX_PER_SEC;
	const step = (speed * dt) / magnitude;

	Cursor.moveBy(x * step, y * step);
}

/**
 * Begin the frame loop if it is armed, not already running, and a pad is
 * connected (or just announced itself).
 *
 * @param {boolean} [connected] skip the getGamepads() check
 */
function wake(connected) {
	if (!enabled || frameHandle !== null || typeof requestAnimationFrame !== 'function') {
		return;
	}
	if (!connected && !getGamepad()) {
		return;
	}
	lastTime = performance.now();
	frameHandle = requestAnimationFrame(frame);
}

function onConnect() {
	wake(true);
}

export default {
	start: function () {
		if (enabled) {
			return;
		}
		enabled = true;
		window.addEventListener('gamepadconnected', onConnect);
		wake();
	},
	/**
	 * Called by the poll whenever it sees a pad: a backstop for a pad that
	 * shows up in getGamepads() without a 'gamepadconnected' reaching us
	 * (the event fires once per pad, not again after a map change).
	 */
	wake: function () {
		wake();
	},
	stop: function () {
		enabled = false;
		window.removeEventListener('gamepadconnected', onConnect);
		if (frameHandle !== null) {
			cancelAnimationFrame(frameHandle);
			frameHandle = null;
		}
		// Gamepad UI gone: no ring left behind, and the cursor visible again
		Aim.release();
		Support.release();
	}
};
