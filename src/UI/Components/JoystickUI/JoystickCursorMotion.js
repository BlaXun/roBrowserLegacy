/**
 * UI/Components/JoystickUI/JoystickCursorMotion.js
 *
 * Moves the virtual cursor with the right stick once per animation frame.
 *
 * The button/left-stick poll runs at 10 Hz (JoystickPollingLoop), which is
 * fine for discrete actions but made the cursor jump joySense pixels ten
 * times a second. Here the stick is read every frame and the cursor moves
 * by speed * elapsed time, with a quadratic response curve: small
 * deflections give slow, precise movement (picking a small item off the
 * ground), full tilt keeps the old top speed of joySense px per 100 ms.
 */

import ControlsSettings from 'Preferences/Controls.js';
import Cursor from './JoystickMouseCursorAdapter.js';

// Old behaviour moved joySense px per 100 ms poll at full deflection.
const SENSE_TO_PX_PER_SEC = 10;

// Longest frame step honoured, so a stalled or backgrounded tab does not
// fling the cursor across the screen on its next frame.
const MAX_DT = 0.05;

let frameHandle = null;
let lastTime = 0;

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
	frameHandle = requestAnimationFrame(frame);

	const dt = Math.min(MAX_DT, (time - lastTime) / 1000);
	lastTime = time;

	const gp = getGamepad();
	if (!gp || gp.axes.length < 4 || dt <= 0) {
		return;
	}

	let x = gp.axes[2];
	let y = gp.axes[3];
	if (ControlsSettings.joyReverseStick) {
		x = gp.axes[0];
		y = gp.axes[1];
	}

	// Radial deadzone, then rescale so speed starts at 0 just past it
	const magnitude = Math.hypot(x, y);
	const deadzone = ControlsSettings.joyDeadline;
	if (magnitude <= deadzone) {
		return;
	}
	const scaled = Math.min(1, (magnitude - deadzone) / (1 - deadzone));
	const speed = scaled * scaled * ControlsSettings.joySense * SENSE_TO_PX_PER_SEC;
	const step = (speed * dt) / magnitude;

	Cursor.moveBy(x * step, y * step);
}

export default {
	start: function () {
		if (frameHandle !== null || typeof requestAnimationFrame !== 'function') {
			return;
		}
		lastTime = performance.now();
		frameHandle = requestAnimationFrame(frame);
	},
	stop: function () {
		if (frameHandle !== null) {
			cancelAnimationFrame(frameHandle);
			frameHandle = null;
		}
	}
};
