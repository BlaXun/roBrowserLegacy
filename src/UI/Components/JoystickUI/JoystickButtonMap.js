/**
 * UI/Components/JoystickUI/JoystickButtonMap.js
 *
 * Player button remapping for the gamepad.
 *
 * Every other joystick module reads buttons by their standard-mapping
 * index (0 = A, 2 = X, 4 = LB, ...): the "logical" button, the role. This
 * module owns the table that says which physical button plays each role.
 * JoystickInputService translates raw gamepad buttons through it once per
 * poll, so the rest of the code never sees a remap.
 *
 * Remapping swaps two buttons: giving a role a new button hands that
 * button's old role to the button being replaced. Nothing ends up unbound
 * or doubly bound, and combos (LB + Y, View + D-pad) follow the roles.
 *
 * Stored in ControlsSettings.joyButtonMap as map[logical] = physical, or
 * null for the default layout.
 */

import ControlsSettings from 'Preferences/Controls.js';

/**
 * Buttons that can be remapped: standard mapping 0-15. 16 (Xbox/Home) is
 * usually taken by the OS or browser and stays out of it.
 */
const BUTTON_COUNT = 16;

/**
 * Xbox names by standard-mapping index.
 */
const BUTTON_NAMES = [
	'A',
	'B',
	'X',
	'Y',
	'LB',
	'RB',
	'LT',
	'RT',
	'View',
	'Menu',
	'LS click',
	'RS click',
	'D-pad ▲',
	'D-pad ▼',
	'D-pad ◀',
	'D-pad ▶'
];

const BUTTON = {
	A: 0,
	B: 1,
	X: 2,
	Y: 3,
	LB: 4,
	RB: 5,
	LT: 6,
	RT: 7,
	VIEW: 8,
	MENU: 9,
	LS: 10,
	RS: 11,
	UP: 12,
	DOWN: 13,
	LEFT: 14,
	RIGHT: 15
};

let _capture = null;
let _waitForRelease = false;

function identity() {
	const map = [];
	for (let i = 0; i < BUTTON_COUNT; i++) {
		map.push(i);
	}
	return map;
}

/**
 * The stored map if it is a complete permutation of 0-15, else the default.
 */
function getMap() {
	const map = ControlsSettings.joyButtonMap;
	if (!Array.isArray(map) || map.length !== BUTTON_COUNT) {
		return identity();
	}
	const seen = new Set();
	for (let i = 0; i < BUTTON_COUNT; i++) {
		const b = map[i];
		if (!Number.isInteger(b) || b < 0 || b >= BUTTON_COUNT || seen.has(b)) {
			return identity();
		}
		seen.add(b);
	}
	return map.slice();
}

function save(map) {
	const isDefault = map.every((physical, logical) => physical === logical);
	ControlsSettings.joyButtonMap = isDefault ? null : map;
	ControlsSettings.save();
}

/**
 * Translate physical button states into logical ones.
 *
 * @param {Array<string>} physical states by physical index
 * @return {Array<string>} states by logical index
 */
function toLogical(physical) {
	const map = getMap();
	const logical = physical.slice();
	for (let i = 0; i < BUTTON_COUNT; i++) {
		logical[i] = physical[map[i]] || 'unpressed';
	}
	return logical;
}

/**
 * Name of the physical button currently playing a role.
 */
function nameOf(logical) {
	return BUTTON_NAMES[getMap()[logical]] || '?';
}

/**
 * Give a role to a physical button; the button's previous role moves to
 * the button the role had before.
 */
function assign(logical, physical) {
	const map = getMap();
	const other = map.indexOf(physical);
	if (other === -1 || other === logical) {
		return;
	}
	map[other] = map[logical];
	map[logical] = physical;
	save(map);
}

function reset() {
	save(identity());
}

/**
 * Wait for the next gamepad button press and hand its physical index to
 * the callback instead of to the game.
 */
function startCapture(callback) {
	_capture = callback;
}

function cancelCapture() {
	_capture = null;
}

function isCapturing() {
	return _capture !== null;
}

/**
 * Called by JoystickInputService with the raw states of each poll. While a
 * capture runs, and afterwards until every button is released, the game
 * gets no button input: the button just bound must not also act.
 *
 * @return {boolean} true when this poll's buttons were consumed
 */
function consume(physical) {
	if (_capture) {
		for (let i = 0; i < BUTTON_COUNT; i++) {
			if (physical[i] === 'pressed') {
				const callback = _capture;
				_capture = null;
				_waitForRelease = true;
				callback(i);
				break;
			}
		}
		return true;
	}

	if (_waitForRelease) {
		if (physical.some(state => state && state !== 'unpressed')) {
			return true;
		}
		_waitForRelease = false;
	}
	return false;
}

export default {
	BUTTON,
	BUTTON_COUNT,
	BUTTON_NAMES,
	getMap,
	toLogical,
	nameOf,
	assign,
	reset,
	startCapture,
	cancelCapture,
	isCapturing,
	consume
};
