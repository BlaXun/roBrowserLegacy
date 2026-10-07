/**
 * UI/Components/JoystickUI/JoystickButtonInput.js
 *
 * Manages the logic for digital button presses.
 * Handles input states (pressed, holding, unpressed),
 * button combination mapping for shortcuts, and world interactions
 * like attacking or interacting with NPCs.
 *
 * @author AoShinHo
 */

import ShortcutMapper from './JoystickShortcutMapper.js';
import Interaction from './JoystickInteractionService.js';
import SetManager from './JoystickSetManager.js';
import JoystickUIRenderer from './JoystickUIRenderer.js';
import SelectionUI from './JoystickSelectionUI.js';
import ControlsSettings from 'Preferences/Controls.js';

let clickLock = false;
const lockTimeout = 200;

// View + LB/RB and View + LT/RT: one press turns the camera this far
const CAMERA_STEP_SMALL = 45;
const CAMERA_STEP_LARGE = 90;

// RS click: a tap switches the right stick between aim and cursor, a hold
// recenters the cursor. LS click: a tap clears the target, a hold sits down
// or stands up. Decided on release (tap) or after STICK_HOLD_MS (hold).
const STICK_HOLD_MS = 400;
let rsDownAt = 0;
let rsHoldFired = false;
let lsDownAt = 0;
let lsHoldFired = false;

// Menu (without View): a tap is Enter, a hold opens the emote grid
let menuDownAt = 0;
let menuHoldFired = false;

// A, B, X, Y, LB and RB still down when the emote grid last had them. A press that closes the
// grid (A plays an emote, B closes) is still held on the next frame, when the grid is gone: it
// belonged to the grid, and must not reach the map as a click until it is let go.
const GRID_BUTTONS = [0, 1, 2, 3, 4, 5];
let gridHeld = [];

function setClickLock() {
	clickLock = true;
	setTimeout(function () {
		clickLock = false;
	}, lockTimeout);
}

const ButtonInput = {
	update: function (buttons) {
		// The emote grid has every button while it is open. The Menu hold that
		// opened it must not end in an Enter when it is let go.
		if (Interaction.isEmoteGridOpen()) {
			menuDownAt = buttons[9] !== 'unpressed' ? menuDownAt || Date.now() : 0;
			menuHoldFired = true;
			Interaction.emoteGridInput(buttons);
			gridHeld = GRID_BUTTONS.filter(i => buttons[i] && buttons[i] !== 'unpressed');
			return true;
		}
		if (gridHeld.length) {
			gridHeld = gridHeld.filter(i => buttons[i] && buttons[i] !== 'unpressed');
			if (gridHeld.length) {
				return false;
			}
		}

		// Before the click lock: a release must not be missed, or a tap is lost
		let stickButton = this._handleRightStickButton(buttons);
		stickButton = this._handleLeftStickButton(buttons) || stickButton;
		stickButton = this._handleMenuButton(buttons) || stickButton;

		if (clickLock) {
			return stickButton;
		}

		if (SelectionUI.active()) {
			SelectionUI.handleGamepadInput(buttons);
			return false;
		}

		let pressed = false;

		JoystickUIRenderer.updateVisuals(buttons);

		// special buttons
		pressed |= this._handleSpecial(buttons);

		// set switching
		pressed |= this._handleSetChange(buttons);

		if (!pressed) {
			// basic actions (Left Click, Attack, etc)
			pressed |= this._handleWorldActions(buttons);

			// skills/items
			pressed |= this._handleShortcuts(buttons);
		}

		return pressed;
	},

	_handleWorldActions: function (btn) {
		let pressed = false;

		if (ShortcutMapper.getGroup(btn) !== '') {
			return false;
		}

		// A → left click
		if (btn[0] !== 'unpressed') {
			Interaction.leftClick(btn[0] === 'holding');
			pressed = true;
		}

		// B → right click
		if (btn[1] !== 'unpressed') {
			Interaction.rightClick(btn[1] === 'holding');
			pressed = true;
		}

		// X → attack. A fresh press always attacks. While held, attack only
		// when the target changes (previous one died, D-pad cycled): the
		// server keeps attacking on its own (action 7), and re-sending every
		// poll restarted the walk -- zig-zag that mouse combat does not have.
		// Handling 'holding' too means a press that lands inside the click
		// lock is not lost.
		if (btn[2] !== 'unpressed' && Interaction.attackTargeted(btn[2] === 'holding')) {
			pressed = true;
		}

		// Y → pickup item (single-fire; nothing to do while held)
		if (btn[3] === 'pressed') {
			Interaction.pickUpItem();
			pressed = true;
		}

		if (pressed) {
			setClickLock();
		}

		return pressed;
	},

	_handleRightStickButton: function (btn) {
		const state = btn[11];

		// Aiming switched off in the settings: there is no mode to switch,
		// so RS click recenters the cursor as soon as it is pressed.
		if (!ControlsSettings.joyAimEnabled) {
			rsDownAt = 0;
			if (state === 'pressed') {
				Interaction.recenterCursor();
			}
			return state !== 'unpressed';
		}

		if (state !== 'unpressed') {
			if (!rsDownAt) {
				rsDownAt = Date.now();
				rsHoldFired = false;
			} else if (!rsHoldFired && Date.now() - rsDownAt >= STICK_HOLD_MS) {
				// Hold: recenter the cursor, once per hold
				Interaction.recenterCursor();
				rsHoldFired = true;
			}
			return true;
		}

		if (rsDownAt) {
			if (!rsHoldFired && !SelectionUI.active()) {
				// Tap: right stick aim <-> cursor
				Interaction.toggleStickMode();
			}
			rsDownAt = 0;
			return true;
		}
		return false;
	},

	/**
	 * LS click. A tap clears the target, whatever it is; a hold sits down
	 * or stands up, once per hold. Not while the selection window is open:
	 * it has the pad then.
	 */
	_handleLeftStickButton: function (btn) {
		const state = btn[10];

		if (state !== 'unpressed') {
			if (!lsDownAt) {
				lsDownAt = Date.now();
				lsHoldFired = false;
			} else if (!lsHoldFired && Date.now() - lsDownAt >= STICK_HOLD_MS) {
				if (!SelectionUI.active()) {
					Interaction.toggleSit();
				}
				lsHoldFired = true;
			}
			return true;
		}

		if (lsDownAt) {
			if (!lsHoldFired && !SelectionUI.active()) {
				Interaction.clearTarget();
			}
			lsDownAt = 0;
			return true;
		}
		return false;
	},

	/**
	 * Menu on its own (View + Menu is Escape, in _handleSpecial). A tap
	 * presses Enter on release, a hold opens the emote grid.
	 */
	_handleMenuButton: function (btn) {
		const state = btn[9];

		if (btn[8] !== 'unpressed') {
			menuDownAt = 0;
			return false;
		}

		if (state !== 'unpressed') {
			if (!menuDownAt) {
				menuDownAt = Date.now();
				menuHoldFired = false;
			} else if (!menuHoldFired && Date.now() - menuDownAt >= STICK_HOLD_MS) {
				menuHoldFired = true;
				if (!SelectionUI.active()) {
					Interaction.openEmoteGrid();
				}
			}
			return true;
		}

		if (menuDownAt) {
			if (!menuHoldFired && !SelectionUI.active()) {
				Interaction.enter();
			}
			menuDownAt = 0;
			return true;
		}
		return false;
	},

	_handleSetChange: function (btn) {
		const l2 = btn[6] === 'holding';
		const r2 = btn[7] === 'holding';

		// With View held the triggers turn the camera
		if (l2 && r2 && btn[8] === 'unpressed') {
			SetManager.toggle();
			JoystickUIRenderer.updateSetIndicator();
			JoystickUIRenderer.sync();
			setClickLock();
			return true;
		}
		return false;
	},

	_handleSpecial: function (buttons) {
		let pressed = false;
		const selectPressed = buttons[8] === 'holding';

		if (selectPressed) {
			if (
				buttons[12] !== 'unpressed' ||
				buttons[13] !== 'unpressed' ||
				buttons[14] !== 'unpressed' ||
				buttons[15] !== 'unpressed'
			) {
				// View + D-pad: zoom and turn, every frame in
				// JoystickCameraMotion. No click lock, so other View combos
				// still answer while the camera moves.
				return true;
			}

			// View + LB / RB: a 45 degree turn, LT / RT: 90 degrees. Once per
			// press, so no click lock: a quick second tap turns again.
			const turn = this._cameraStep(buttons);
			if (turn) {
				Interaction.cameraAngle(turn);
				return true;
			}

			if (buttons[9] !== 'unpressed') {
				// Start button
				Interaction.escape();
				pressed = true;
			} else if (buttons[0] === 'pressed') {
				// View + A/B/X/Y: windows, as Alt+E / Alt+Q / Alt+S / Alt+A
				Interaction.toggleWindow('Inventory');
				pressed = true;
			} else if (buttons[1] === 'pressed') {
				Interaction.toggleWindow('Equipment');
				pressed = true;
			} else if (buttons[2] === 'pressed') {
				Interaction.toggleWindow('SkillList');
				pressed = true;
			} else if (buttons[3] === 'pressed') {
				Interaction.toggleWindow('WinStats');
				pressed = true;
			} else {
				pressed = Interaction.showinfo();
			}

			if (pressed) {
				setClickLock();
				return pressed;
			}
		}

		// D-Pad
		if (buttons[12] !== 'unpressed') {
			// D-pad Up: previous target category (or a window's own navigation)
			Interaction.navigateDpad('up');
			pressed = true;
		} else if (buttons[13] !== 'unpressed') {
			// D-pad Down: next target category (or a window's own navigation)
			Interaction.navigateDpad('down');
			pressed = true;
		} else if (buttons[14] !== 'unpressed') {
			// D-pad Left: cycle to the previous nearby mob/item (or grid nav over a UI)
			Interaction.cycleTarget('prev');
			pressed = true;
		} else if (buttons[15] !== 'unpressed') {
			// D-pad Right: cycle to the next nearby mob/item (or grid nav over a UI)
			Interaction.cycleTarget('next');
			pressed = true;
		}

		if (pressed) {
			setClickLock();
		}

		return pressed;
	},

	/**
	 * Degrees a fresh LB / RB / LT / RT press turns the camera (with View
	 * held), or 0.
	 */
	_cameraStep: function (btn) {
		if (btn[4] === 'pressed') {
			return -CAMERA_STEP_SMALL;
		}
		if (btn[5] === 'pressed') {
			return CAMERA_STEP_SMALL;
		}
		if (btn[6] === 'pressed') {
			return -CAMERA_STEP_LARGE;
		}
		if (btn[7] === 'pressed') {
			return CAMERA_STEP_LARGE;
		}
		return 0;
	},

	_handleShortcuts: function (btn) {
		const idx = ShortcutMapper.getShortcutIndex(btn);
		if (idx !== -1) {
			Interaction.executeShortcut(idx, ShortcutMapper.getGroup(btn));
			setClickLock();
			return true;
		}
		return false;
	}
};

export default ButtonInput;
