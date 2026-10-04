/**
 * UI/Components/JoystickUI/JoystickCameraMotion.js
 *
 * Turns and zooms the camera while View + D-pad is held, once per
 * animation frame (called from JoystickCursorMotion).
 *
 * This used to run in the 10 Hz button poll, 5 degrees per poll and then a
 * 200 ms click lock: about 17 degrees a second, in visible steps. Here the
 * camera turns by speed * elapsed time, and the camera eases toward the
 * new angle on its own, so the turn is smooth.
 *
 * JoystickButtonInput leaves View + D-pad to this module. The one-shot
 * turns (View + LB/RB/LT/RT) stay in the poll.
 */

import ControlsSettings from 'Preferences/Controls.js';
import ButtonMap from './JoystickButtonMap.js';
import Cursor from './JoystickMouseCursorAdapter.js';
import SelectionUI from './JoystickSelectionUI.js';

// The old zoom moved 2 steps per ~300 ms; this is about twice that
const ZOOM_PER_SEC = 14;

const DEFAULT_TURN_PER_SEC = 90;

/**
 * Whether the physical button playing a role is down.
 */
function isDown(gp, map, logical) {
	const button = gp.buttons[map[logical]];
	return !!button && button.pressed;
}

/**
 * One frame.
 *
 * @param {Gamepad} gp
 * @param {number} dt seconds since the last frame
 */
function update(gp, dt) {
	if (!gp.buttons || ButtonMap.isCapturing()) {
		return;
	}

	const map = ButtonMap.getMap();
	const B = ButtonMap.BUTTON;
	if (!isDown(gp, map, B.VIEW) || SelectionUI.active()) {
		return;
	}

	const turn = (isDown(gp, map, B.RIGHT) ? 1 : 0) - (isDown(gp, map, B.LEFT) ? 1 : 0);
	if (turn) {
		const speed = Number(ControlsSettings.joyCameraSpeed) || DEFAULT_TURN_PER_SEC;
		Cursor.changeCameraAngle(turn * speed * dt);
	}

	// Up zooms in, as before
	const zoom = (isDown(gp, map, B.DOWN) ? 1 : 0) - (isDown(gp, map, B.UP) ? 1 : 0);
	if (zoom) {
		Cursor.changeCameraZoom(zoom * ZOOM_PER_SEC * dt);
	}
}

export default {
	update
};
