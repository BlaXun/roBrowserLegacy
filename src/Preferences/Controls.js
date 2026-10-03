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
		joyCycleMode: 0, // D-pad cycle: 0 mobs, 1 ground items, 2 both
		joyButtonMap: null, // remapped buttons, map[role] = physical; null = default
		joyAimEnabled: false, // right-stick aiming available (Settings > Gamepad)
		joyRightStickMode: 0, // right stick: 0 virtual cursor, 1 aim (tap RS click)
		joyQuick: 0,
		joyDeadline: 0.1,
		joyDisableVirtualMouse: false,
		joyAutoHide: false,
		joyReverseStick: false,
		joySense: 25.0
	},
	1.0
);
