/**
 * UI/Components/JoystickUI/JoystickAxisInput.js
 *
 * Processes analog stick movements (axes).
 * Responsible for translating stick coordinates into character
 * movement and mouse cursor positioning based on defined deadzones.
 *
 * @author AoShinHo
 */

import Interaction from './JoystickInteractionService.js';
import ControlsSettings from 'Preferences/Controls.js';
import JoystickUIRenderer from './JoystickUIRenderer.js';

// A released stick springs back past centre for a moment. If a poll lands
// on that overshoot it reads as a small push the other way, and the
// character took one step back. Within REBOUND_MS of the last move, a push
// against that move weaker than REBOUND_MAX is treated as centre; a real
// reversal is a firm push and goes through at once.
const REBOUND_MS = 250;
const REBOUND_MAX = 0.6;

let lastMove = null; // [x, y] of the last stick move
let lastMoveAt = 0;

function isRebound(x, y) {
	if (!lastMove || Date.now() - lastMoveAt > REBOUND_MS) {
		return false;
	}
	const magnitude = Math.hypot(x, y);
	return magnitude < REBOUND_MAX && x * lastMove[0] + y * lastMove[1] < 0;
}

export default {
	update: function (axes) {
		let active = false;

		// Left stick = movement
		let lx = axes[0];
		let ly = axes[1];

		if (ControlsSettings.joyReverseStick && axes.length >= 4) {
			lx = axes[2];
			ly = axes[3];
		}

		const deflected = Math.abs(lx) > ControlsSettings.joyDeadline || Math.abs(ly) > ControlsSettings.joyDeadline;

		if (deflected && !isRebound(lx, ly)) {
			lastMove = [lx, ly];
			lastMoveAt = Date.now();
			Interaction.moveCharacter(lx, -ly);
			Interaction.cancelQuick = true;
			active = true;
		} else {
			// Back at centre: re-arm stick movement after an X attack
			Interaction.releaseStick();
		}

		// Right stick = cursor
		if (axes.length >= 4) {
			let rx = axes[2];
			let ry = axes[3];

			if (ControlsSettings.joyReverseStick) {
				rx = axes[0];
				ry = axes[1];
			}

			// The cursor itself moves per frame in JoystickCursorMotion; here
			// the right stick only counts as activity (keeps the UI shown).
			if (Math.abs(rx) > ControlsSettings.joyDeadline || Math.abs(ry) > ControlsSettings.joyDeadline) {
				active = true;
			}
		}

		if (active) {
			JoystickUIRenderer.show();
		}

		return active;
	}
};
