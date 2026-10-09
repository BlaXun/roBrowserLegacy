/**
 * Preferences/Controls.js
 *
 * Control user preferences
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
 * @author Vincent Thibault
 */

import Preferences from 'Core/Preferences.js';

/**
 * Export
 */
export default Preferences.get(
	'Controls',
	{
		noctrl: true,
		noshift: false,
		snap: false,
		itemsnap: false,
		/* Joystick */
		attackTargetMode: 0,
		joyCycleMode: 0, // target category (D-pad up/down): 0 mobs, 1 items, 2 mobs+items (legacy), 3 NPCs/portals, 4 support, 5 players, 6 NPCs/portals + players
		joyEmoteFavorites: [], // emote grid (hold Menu): pinned emotes, sprite indices
		joyButtonMap: null, // remapped buttons, map[role] = physical; null = default
		joyAimEnabled: false, // right-stick aiming available (Settings > Gamepad)
		joyAimRing: false, // aim: ring under a newly selected target, fading out
		joyAimLine: false, // aim: line from the character to the target it hits
		joyAimHideCursor: false, // aim: hide the game cursor while the right stick aims
		joyRightStickMode: 0, // right stick: 0 virtual cursor, 1 aim (tap RS click)
		joyQuick: 0,
		joyDeadline: 0.1,
		joyDriftLX: 0, // drift threshold per stick axis (JoystickStickFilter)
		joyDriftLY: 0,
		joyDriftRX: 0,
		joyDriftRY: 0,
		joyStickCenter: null, // calibrated rest position [lx, ly, rx, ry]; null = none
		joyCameraSpeed: 90, // View + D-pad left/right, degrees per second
		joyDisableVirtualMouse: false,
		joyAutoHide: false,
		joyReverseStick: false,
		joySense: 25.0
	},
	1.0
);
