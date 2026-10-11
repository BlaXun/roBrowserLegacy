/**
 * UI/Components/ShortCutOption/ShortCutOption.js
 *
 * Short Cut Settings
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
 */

import KEYS from 'Controls/KeyEventHandler.js';
import Preferences from 'Core/Preferences.js';
import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import 'UI/Elements/Elements.js';
import ShortCutControls from 'Preferences/ShortCutControls.js';
import BattleMode from 'Controls/BattleMode.js';
import htmlText from './ShortCutOption.html?raw';
import cssText from './ShortCutOption.css?raw';
import Controls from 'Preferences/Controls.js';
import ButtonMap from 'UI/Components/JoystickUI/JoystickButtonMap.js';
import JoystickUIRenderer from 'UI/Components/JoystickUI/JoystickUIRenderer.js';
import JoystickAim from 'UI/Components/JoystickUI/JoystickAimMode.js';
import StickFilter from 'UI/Components/JoystickUI/JoystickStickFilter.js';
import TargetCategory from 'UI/Components/JoystickUI/JoystickTargetCategory.js';

/**
 * Gamepad sliders that save as they move, with their value shown beside
 * them: settings key -> decimals shown.
 */
const JOY_RANGES = {
	joyCameraSpeed: 0,
	joyDriftLX: 2,
	joyDriftLY: 2,
	joyDriftRX: 2,
	joyDriftRY: 2
};

/**
 * Gamepad checkboxes reflected from the settings when the window opens.
 */
const JOY_CHECKBOXES = [
	'joyAimEnabled',
	'joyAimRing',
	'joyAimLine',
	'joyAimHideCursor',
	'joyReverseStick',
	'joyAutoHide',
	'joyDisableVirtualMouse'
];

const ShortCutOption = new GUIComponent('ShortCutOption', cssText);

const ShortCuts = ShortCutControls.ShortCuts;
let ShortCutsTemp = {};

ShortCutOption.isCapturing = false;

/**
 * @var {Preferences} structure
 */
const _preferences = Preferences.get(
	'ShortCutOption',
	{
		x: 300,
		y: 300
	},
	1.0
);

/**
 * Render HTML
 */
ShortCutOption.render = () => htmlText;

/**
 * Initialize UI
 */
ShortCutOption.init = function () {
	const root = this.getRoot();

	let close = root.querySelector('.close');
	function closebtn(btn) {
		if (btn) {
			btn.addEventListener('mousedown', e => {
				e.stopImmediatePropagation();
				ShortCutOption.remove();
			});
			btn.addEventListener('click', e => {
				e.stopImmediatePropagation();
				ShortCutOption.remove();
			});
		}
	}
	closebtn(close);
	close = root.querySelector('.button.close');
	closebtn(close);
	root.querySelectorAll('.tabs button').forEach(function (btn) {
		btn.addEventListener('click', function () {
			root.querySelectorAll('.selectedtab').forEach(function (el) {
				el.classList.remove('selectedtab');
			});
			const tab = this.dataset.index;
			root.querySelectorAll('.' + tab).forEach(function (el) {
				el.classList.add('selectedtab');
			});
		});
	});

	root.querySelectorAll('td').forEach(function (td) {
		td.addEventListener('click', function () {
			if (this.classList.contains('customize')) {
				ShortCutOption.isCapturing = true;
				root.querySelectorAll('td.selected').forEach(function (el) {
					el.classList.remove('selected');
				});
				this.classList.add('selected');
			} else {
				ShortCutOption.isCapturing = false;
				root.querySelectorAll('td.selected').forEach(function (el) {
					el.classList.remove('selected');
				});
			}
		});
	});

	// Joystick
	const bindChange = function (selector, handler) {
		const el = root.querySelector(selector);
		if (el) el.addEventListener('change', handler);
	};

	bindChange('.attackTargetMode', onUpdateTargetOption);
	bindChange('.joyCycleMode', onUpdateCycleMode);
	bindChange('.joyAimEnabled', onUpdateAimEnabled);
	bindChange('.joyAimRing', onUpdateAimRing);
	bindChange('.joyAimLine', onUpdateAimLine);
	bindChange('.joyAimHideCursor', onUpdateAimHideCursor);

	Object.keys(JOY_RANGES).forEach(function (key) {
		const input = root.querySelector('.' + key);
		if (!input) {
			return;
		}
		input.addEventListener('input', function () {
			Controls[key] = parseFloat(this.value);
			showRangeValue(root, key);
		});
		input.addEventListener('change', function () {
			Controls.save();
		});
	});

	root.querySelector('.joyCalibrate').addEventListener('click', function () {
		onCalibrate(root);
	});
	root.querySelector('.joyCalibrateReset').addEventListener('click', function () {
		StickFilter.resetCalibration();
		showCalibration(root);
	});

	// Gamepad button mapping panel
	const gamepadTab = root.querySelector('.content.t_gamepad');
	root.querySelector('.joyMappingOpen').addEventListener('click', function () {
		renderMapping(root);
		gamepadTab.classList.add('mapping-open');
	});
	root.querySelector('.joyMappingBack').addEventListener('click', function () {
		ButtonMap.cancelCapture();
		gamepadTab.classList.remove('mapping-open');
	});
	root.querySelector('.joyMappingReset').addEventListener('click', function () {
		ButtonMap.cancelCapture();
		ButtonMap.reset();
		JoystickUIRenderer.relabel();
		renderMapping(root);
	});
	bindChange('.joySense', onUpdateSense);
	bindChange('.joyQuick', onUpdateJoyQuick);
	bindChange('.joyDeadline', onUpdateJoyDeadline);
	bindChange('.joyReverseStick', onUpdateReverseStick);
	bindChange('.joyAutoHide', onUpdateAutoHide);
	bindChange('.joyDisableVirtualMouse', onUpdateDisableVirtualMouse);

	const resetBtn = root.querySelector('.button.reset');
	if (resetBtn) {
		resetBtn.addEventListener('click', function () {
			resetKeysToDefault();
		});
	}

	const okBtn = root.querySelector('.button.ok');
	if (okBtn) {
		okBtn.addEventListener('click', function () {
			applySettings();
		});
	}

	const cancelBtn = root.querySelector('.button.cancel');
	if (cancelBtn) {
		cancelBtn.addEventListener('click', function () {
			cancelSettings();
		});
	}

	updateKeyList();
	this.draggable('.titlebar');
};

/**
 * Apply preferences once append to body
 */
ShortCutOption.onAppend = function () {
	// Reflect the current value; D-pad up / down can change it while the window is closed.
	const cycleMode = this.getRoot().querySelector('.joyCycleMode');
	if (cycleMode) {
		cycleMode.value = String(shownCategory());
	}
	reflectGamepadSettings(this.getRoot());

	this._host.style.left = _preferences.x + 'px';
	this._host.style.top = _preferences.y + 'px';
	this._host.style.zIndex = 100;
};

/**
 * Remove from window (and so clean up)
 */
ShortCutOption.onRemove = function () {
	ButtonMap.cancelCapture();
	StickFilter.cancelCalibration();
	_preferences.x = parseInt(this._host.style.left, 10);
	_preferences.y = parseInt(this._host.style.top, 10);
	_preferences.save();
};

/**
 * Checks if there is a match in the temporary settings
 * Returns the name of the conflicting shortcut, or false if no conflict
 */
function tempMatch(key) {
	const TempState = {};
	let matchSC = false;

	Object.keys(ShortCuts).forEach(function (SC) {
		if (ShortCuts[SC].cust) {
			TempState[SC] = {};
			TempState[SC].key = ShortCuts[SC].cust.key;
			TempState[SC].alt = ShortCuts[SC].cust.alt;
			TempState[SC].ctrl = ShortCuts[SC].cust.ctrl;
			TempState[SC].shift = ShortCuts[SC].cust.shift;
		} else {
			TempState[SC] = {};
			TempState[SC].key = ShortCuts[SC].init.key;
			TempState[SC].alt = ShortCuts[SC].init.alt;
			TempState[SC].ctrl = ShortCuts[SC].init.ctrl;
			TempState[SC].shift = ShortCuts[SC].init.shift;
		}
	});

	Object.keys(ShortCutsTemp).forEach(function (SC) {
		if (ShortCutsTemp[SC].cust) {
			TempState[SC] = {};
			TempState[SC].key = ShortCutsTemp[SC].cust.key;
			TempState[SC].alt = ShortCutsTemp[SC].cust.alt;
			TempState[SC].ctrl = ShortCutsTemp[SC].cust.ctrl;
			TempState[SC].shift = ShortCutsTemp[SC].cust.shift;
		} else {
			TempState[SC] = {};
			TempState[SC].key = ShortCuts[SC].init.key;
			TempState[SC].alt = ShortCuts[SC].init.alt;
			TempState[SC].ctrl = ShortCuts[SC].init.ctrl;
			TempState[SC].shift = ShortCuts[SC].init.shift;
		}
	});

	Object.keys(TempState).every(function (SC) {
		if (TempState[SC]) {
			if (
				TempState[SC].key == key &&
				TempState[SC].alt == KEYS.ALT &&
				TempState[SC].ctrl == KEYS.CTRL &&
				TempState[SC].shift == KEYS.SHIFT
			) {
				matchSC = SC;
				return false;
			} else {
				return true;
			}
		}
	});

	return matchSC;
}

/**
 * Process key
 *
 * @param {object} key
 */
ShortCutOption.onKeyDown = function (event) {
	if (ShortCutOption.isCapturing) {
		if (16 != event.which && 17 != event.which && 18 != event.which) {
			const root = ShortCutOption.getRoot();
			const box = root.querySelector('td.selected');
			const currentSC = box ? box.dataset.button : null;

			if (!box || !currentSC || !ShortCuts[currentSC]) {
				if (box) {
					console.warn('Shortcut "' + currentSC + '" is not defined in ShortCutControls');
				}
				root.querySelectorAll('td.selected').forEach(function (el) {
					el.classList.remove('selected');
				});
				ShortCutOption.isCapturing = false;
				event.preventDefault();
				event.stopImmediatePropagation();
				return false;
			}

			if (event.which == 27) {
				// Escape — limpa o atalho
				ShortCutsTemp[currentSC] = {};
				ShortCutsTemp[currentSC].cust = {};
				ShortCutsTemp[currentSC].cust.key = '';
				ShortCutsTemp[currentSC].cust.alt = false;
				ShortCutsTemp[currentSC].cust.ctrl = false;
				ShortCutsTemp[currentSC].cust.shift = false;
			} else {
				const conflictSC = tempMatch(event.which);

				if (conflictSC && conflictSC !== currentSC) {
					const oldKey = getKey(currentSC);
					const oldAlt = getAlt(currentSC);
					const oldCtrl = getCtrl(currentSC);
					const oldShift = getShift(currentSC);

					ShortCutsTemp[conflictSC] = {};
					ShortCutsTemp[conflictSC].cust = {};
					ShortCutsTemp[conflictSC].cust.key = oldKey;
					ShortCutsTemp[conflictSC].cust.alt = oldAlt;
					ShortCutsTemp[conflictSC].cust.ctrl = oldCtrl;
					ShortCutsTemp[conflictSC].cust.shift = oldShift;

					const conflictCell = root.querySelector("td[data-button='" + conflictSC + "']");
					if (conflictCell) {
						conflictCell.classList.add('changed');
						conflictCell.textContent =
							(oldAlt ? 'ALT + ' : '') +
							(oldCtrl ? 'CTRL + ' : '') +
							(oldShift ? 'SHIFT + ' : '') +
							(oldKey ? KEYS.toReadableKey(parseInt(oldKey, 10)) : 'N/A');
					}
				}

				ShortCutsTemp[currentSC] = {};
				ShortCutsTemp[currentSC].cust = {};
				ShortCutsTemp[currentSC].cust.key = event.which;
				ShortCutsTemp[currentSC].cust.alt = KEYS.ALT;
				ShortCutsTemp[currentSC].cust.ctrl = KEYS.CTRL;
				ShortCutsTemp[currentSC].cust.shift = KEYS.SHIFT;
			}

			box.textContent =
				(getAlt(currentSC) ? 'ALT + ' : '') +
				(getCtrl(currentSC) ? 'CTRL + ' : '') +
				(getShift(currentSC) ? 'SHIFT + ' : '') +
				KEYS.toReadableKey(getKey(currentSC), 10);

			root.querySelectorAll('td.selected').forEach(function (el) {
				el.classList.add('changed');
				el.classList.remove('selected');
			});
			ShortCutOption.isCapturing = false;

			event.preventDefault();
			event.stopImmediatePropagation();
			return false;
		}
	}
};

/**
 * Updates the key list on the UI
 */
function updateKeyList() {
	const root = ShortCutOption.getRoot();
	const cells = root.querySelectorAll('td[data-button]');
	for (let i = 0; i < cells.length; i++) {
		const btnName = cells[i].dataset.button;
		if (getKey(btnName)) {
			cells[i].textContent =
				(getAlt(btnName) ? 'ALT + ' : '') +
				(getCtrl(btnName) ? 'CTRL + ' : '') +
				(getShift(btnName) ? 'SHIFT + ' : '') +
				KEYS.toReadableKey(parseInt(getKey(btnName), 10));
		} else {
			cells[i].textContent = 'N/A';
		}
	}
}

/**
 * Resets key bindings to initial
 */
function resetKeysToDefault() {
	const root = ShortCutOption.getRoot();
	Object.keys(ShortCuts).forEach(function (SC) {
		// Set empty customs
		ShortCutsTemp[SC] = {};
		ShortCutsTemp[SC].cust = false;
		const cell = root.querySelector("td[data-button='" + SC + "']");
		if (cell) {
			if (ShortCuts[SC].cust != ShortCutsTemp[SC].cust) {
				cell.classList.add('changed');
			} else {
				cell.classList.remove('changed');
			}
		}
	});
	updateKeyList();
}

/**
 * Applies the key bindings
 */
function applySettings() {
	Object.keys(ShortCutsTemp).forEach(function (SC) {
		// Copy settings
		if (ShortCutsTemp[SC].cust) {
			ShortCuts[SC].cust = {};
			ShortCuts[SC].cust.key = ShortCutsTemp[SC].cust.key;
			ShortCuts[SC].cust.alt = ShortCutsTemp[SC].cust.alt;
			ShortCuts[SC].cust.ctrl = ShortCutsTemp[SC].cust.ctrl;
			ShortCuts[SC].cust.shift = ShortCutsTemp[SC].cust.shift;
		} else {
			ShortCuts[SC].cust = false;
		}
	});

	ShortCutControls.save();
	BattleMode.reload();
	ShortCutsTemp = {};
	updateKeyList();

	const root = ShortCutOption.getRoot();
	root.querySelectorAll('td.changed').forEach(function (el) {
		el.classList.remove('changed');
	});

	// Update ShortCut tooltips if the component is loaded
	const ShortCut = UIManager.getComponent('ShortCut');
	if (ShortCut && ShortCut.updateAllTooltips) {
		ShortCut.updateAllTooltips();
	}
}

/**
 * Cancels the key bindings
 */
function cancelSettings() {
	ShortCutsTemp = {};
	updateKeyList();

	const root = ShortCutOption.getRoot();
	root.querySelectorAll('td.changed').forEach(function (el) {
		el.classList.remove('changed');
	});
}

/**
 * Get shortcut key setting
 */
function getKey(sc) {
	if (ShortCutsTemp[sc]) {
		return ShortCutsTemp[sc].cust ? ShortCutsTemp[sc].cust.key : ShortCuts[sc].init.key;
	} else if (ShortCuts[sc]) {
		return ShortCuts[sc].cust ? ShortCuts[sc].cust.key : ShortCuts[sc].init.key;
	} else {
		return false;
	}
}

/**
 * Get shortcut alt setting
 */
function getAlt(sc) {
	if (ShortCutsTemp[sc]) {
		return ShortCutsTemp[sc].cust ? ShortCutsTemp[sc].cust.alt : ShortCuts[sc].init.alt;
	} else if (ShortCuts[sc]) {
		return ShortCuts[sc].cust ? ShortCuts[sc].cust.alt : ShortCuts[sc].init.alt;
	} else {
		return false;
	}
}

/**
 * Get shortcut ctrl setting
 */
function getCtrl(sc) {
	if (ShortCutsTemp[sc]) {
		return ShortCutsTemp[sc].cust ? ShortCutsTemp[sc].cust.ctrl : ShortCuts[sc].init.ctrl;
	} else if (ShortCuts[sc]) {
		return ShortCuts[sc].cust ? ShortCuts[sc].cust.ctrl : ShortCuts[sc].init.ctrl;
	} else {
		return false;
	}
}

/**
 * Get shortcut shift setting
 */
function getShift(sc) {
	if (ShortCutsTemp[sc]) {
		return ShortCutsTemp[sc].cust ? ShortCutsTemp[sc].cust.shift : ShortCuts[sc].init.shift;
	} else if (ShortCuts[sc]) {
		return ShortCuts[sc].cust ? ShortCuts[sc].cust.shift : ShortCuts[sc].init.shift;
	} else {
		return false;
	}
}

// Joystick
function onUpdateTargetOption() {
	Controls.attackTargetMode = parseInt(this.value, 10);
	Controls.save();
}

/**
 * Roles a single button plays, in the order the mapping panel lists them.
 */
const MAPPING_ROLES = [
	[
		ButtonMap.BUTTON.A,
		'Click / confirm - selected NPC: talk, selected player: shop or menu (Support radial: cast the waiting skill on the chosen member)'
	],
	[
		ButtonMap.BUTTON.B,
		'Right click (hold on item/skill: options) - Support radial: close it, or cancel the waiting skill - player menu: close it'
	],
	[ButtonMap.BUTTON.X, 'Attack target'],
	[ButtonMap.BUTTON.Y, 'Pick up item'],
	[ButtonMap.BUTTON.LEFT, 'Previous target (Support: party member; grid left on items)'],
	[ButtonMap.BUTTON.RIGHT, 'Next target (Support: party member, lowest HP first; grid right on items)'],
	[ButtonMap.BUTTON.UP, 'Previous target category (up in item grids and NPC menus)'],
	[ButtonMap.BUTTON.DOWN, 'Next target category (down in item grids and NPC menus)'],
	[ButtonMap.BUTTON.LS, 'Tap: clear target - Hold: sit / stand'],
	[
		ButtonMap.BUTTON.RS,
		() => (Controls.joyAimEnabled ? 'Tap: right stick aim/cursor - Hold: recenter cursor' : 'Recenter cursor')
	],
	[ButtonMap.BUTTON.MENU, 'Tap: Enter - Hold: emotes'],
	[ButtonMap.BUTTON.VIEW, 'Camera & menu modifier'],
	[ButtonMap.BUTTON.LB, 'Shortcuts: skill bar 1, slots 1-4'],
	[ButtonMap.BUTTON.LT, 'Shortcuts: skill bar 1, slots 5-8'],
	[ButtonMap.BUTTON.RB, 'Shortcuts: skill bar 2, slots 1-4'],
	[ButtonMap.BUTTON.RT, 'Shortcuts: skill bar 2, slots 5-8']
];

/**
 * Combinations, worded with the current button names.
 */
function getMappingCombos() {
	const B = ButtonMap.BUTTON;
	const n = ButtonMap.nameOf;
	const faces = [n(B.Y), n(B.X), n(B.B), n(B.A)].join(' / ');
	const sticks = Controls.joyReverseStick ? ['Right stick', 'Left stick'] : ['Left stick', 'Right stick'];

	return [
		[
			n(B.LB) + ' / ' + n(B.RB) + ' / ' + n(B.LT) + ' / ' + n(B.RT) + ' + ' + faces,
			'Shortcut slot 1 / 2 / 3 / 4 of that group'
		],
		[n(B.LB) + ' + ' + n(B.RB) + ' + ' + faces, 'Slot 9 of skill bar 1 / 2 / 3 / 4'],
		[n(B.LT) + ' + ' + n(B.RT), 'Switch shortcut set (bars 1-2 / 3-4)'],
		[n(B.VIEW) + ' + ' + n(B.UP) + ' / ' + n(B.DOWN), 'Camera zoom'],
		[n(B.VIEW) + ' + ' + n(B.LEFT) + ' / ' + n(B.RIGHT), 'Camera rotate'],
		[n(B.VIEW) + ' + ' + n(B.LB) + ' / ' + n(B.RB), 'Turn camera 45 degrees left / right'],
		[n(B.VIEW) + ' + ' + n(B.LT) + ' / ' + n(B.RT), 'Turn camera 90 degrees left / right'],
		[n(B.VIEW) + ' + ' + n(B.MENU), 'Escape'],
		[n(B.VIEW) + ' + ' + [n(B.A), n(B.B), n(B.X), n(B.Y)].join(' / '), 'Inventory / equipment / skills / status'],
		[n(B.VIEW) + ' (cursor on item/skill)', 'Context menu'],
		[
			n(B.LB) + ' / ' + n(B.RB) + ' / ' + n(B.LT) + ' / ' + n(B.RT) + ' + ' + faces + ' (hold)',
			'Support: the support skill on yourself'
		],
		[n(B.UP) + ' / ' + n(B.DOWN) + ' / ' + n(B.LEFT) + ' / ' + n(B.RIGHT) + ' (emotes open)', 'Choose an emote'],
		[
			[n(B.A), n(B.X), n(B.Y), n(B.B)].join(' / ') + ' (emotes open)',
			'Play / play and stay open / favourite / close'
		],
		[n(B.LB) + ' / ' + n(B.RB) + ' (emotes open)', 'Previous / next emote page'],
		[sticks[0], 'Move'],
		[
			sticks[1],
			Controls.joyAimEnabled
				? 'Cursor, or aim (tap ' + n(B.RS) + '); Support: party radial'
				: 'Cursor; Support: party radial'
		]
	];
}

/**
 * Fill the mapping panel's tables from the current map.
 */
function renderMapping(root) {
	const status = root.querySelector('.joyMappingStatus');
	status.classList.remove('capturing');
	status.textContent = 'Remap: press Remap, then a button on the gamepad. The two buttons trade places.';

	const roles = root.querySelector('.joyMappingRoles tbody');
	roles.textContent = '';
	MAPPING_ROLES.forEach(function ([logical, roleLabel]) {
		const label = typeof roleLabel === 'function' ? roleLabel() : roleLabel;
		const tr = document.createElement('tr');
		const name = document.createElement('td');
		const button = document.createElement('td');
		const action = document.createElement('td');
		const remap = document.createElement('button');

		name.textContent = label;
		button.textContent = ButtonMap.nameOf(logical);
		remap.type = 'button';
		remap.className = 'joyBtn';
		remap.textContent = 'Remap';
		remap.addEventListener('click', function () {
			startRemap(root, logical, label, remap);
		});

		action.appendChild(remap);
		tr.append(name, button, action);
		roles.appendChild(tr);
	});

	const combos = root.querySelector('.joyMappingCombos tbody');
	combos.textContent = '';
	getMappingCombos().forEach(function ([buttons, label]) {
		const tr = document.createElement('tr');
		const keys = document.createElement('td');
		const what = document.createElement('td');
		keys.textContent = buttons;
		what.textContent = label;
		tr.append(keys, what);
		combos.appendChild(tr);
	});
}

/**
 * Wait for a gamepad button for one role. Pressing Remap again cancels.
 */
function startRemap(root, logical, label, remapButton) {
	const wasThisOne = remapButton.classList.contains('capturing');
	ButtonMap.cancelCapture();
	root.querySelectorAll('.joyMappingRoles .joyBtn.capturing').forEach(function (el) {
		el.classList.remove('capturing');
	});

	const status = root.querySelector('.joyMappingStatus');
	if (wasThisOne) {
		renderMapping(root);
		return;
	}

	remapButton.classList.add('capturing');
	status.classList.add('capturing');
	status.textContent = 'Press a gamepad button for "' + label + '"... (press Remap again to cancel)';

	ButtonMap.startCapture(function (physical) {
		ButtonMap.assign(logical, physical);
		JoystickUIRenderer.relabel();
		renderMapping(root);
	});
}

function onUpdateAimEnabled() {
	JoystickAim.setEnabled(this.checked);
	showQuickCast(ShortCutOption.getRoot());
}

/**
 * Quick-Cast select: the mode in effect, with Off greyed out while aiming
 * is on (JoystickAimMode.quickCastMode).
 */
function showQuickCast(root) {
	const select = root.querySelector('.joyQuick');
	if (!select) {
		return;
	}
	const off = select.querySelector('option[value="' + JoystickAim.QUICK_CAST.OFF + '"]');
	if (off) {
		off.disabled = JoystickAim.isEnabled();
	}
	select.value = String(JoystickAim.quickCastMode());
}

function onUpdateAimRing() {
	Controls.joyAimRing = this.checked;
	Controls.save();
}

function onUpdateAimLine() {
	Controls.joyAimLine = this.checked;
	Controls.save();
}

function onUpdateAimHideCursor() {
	Controls.joyAimHideCursor = this.checked;
	Controls.save();
}

/**
 * Put the stored gamepad settings into the controls. The HTML only holds
 * the defaults, and L3 or RS click change some settings while the window
 * is closed.
 */
function reflectGamepadSettings(root) {
	const setValue = function (selector, value) {
		const el = root.querySelector(selector);
		if (el) {
			el.value = String(value);
		}
	};
	setValue('.joyCycleMode', shownCategory());
	setValue('.attackTargetMode', Controls.attackTargetMode | 0);
	showQuickCast(root);
	setValue('.joySense', Controls.joySense);
	setValue('.joyDeadline', Controls.joyDeadline);

	JOY_CHECKBOXES.forEach(function (key) {
		const el = root.querySelector('.' + key);
		if (el) {
			el.checked = !!Controls[key];
		}
	});

	Object.keys(JOY_RANGES).forEach(function (key) {
		setValue('.' + key, Controls[key]);
		showRangeValue(root, key);
	});

	showCalibration(root);
}

function showRangeValue(root, key) {
	const label = root.querySelector('.joyValue[data-for="' + key + '"]');
	if (label) {
		label.textContent = (Number(Controls[key]) || 0).toFixed(JOY_RANGES[key]);
	}
}

/**
 * Calibration state under the Calibrate button.
 *
 * @param {Element} root
 * @param {string} [message] shown instead of the stored state
 */
function showCalibration(root, message) {
	const status = root.querySelector('.joyCalibrateStatus');
	if (!status) {
		return;
	}
	if (message) {
		status.textContent = message;
		return;
	}
	const center = StickFilter.getCenter();
	status.textContent = center
		? 'Rest offsets: L ' +
			center[0].toFixed(2) +
			' / ' +
			center[1].toFixed(2) +
			', R ' +
			center[2].toFixed(2) +
			' / ' +
			center[3].toFixed(2)
		: 'Not calibrated';
}

function onCalibrate(root) {
	showCalibration(root, 'Leave both sticks alone...');
	StickFilter.calibrate(function (result) {
		if (result === 'ok') {
			showCalibration(root);
		} else if (result === 'moved') {
			showCalibration(root, 'A stick moved, nothing saved. Try again without touching them.');
		} else {
			showCalibration(root, 'No gamepad found. Press a button on it, then try again.');
		}
	});
}

/**
 * The target category as the select offers it: the old "mobs and items"
 * setting, no longer offered, shows as Mobs.
 */
function shownCategory() {
	const category = TargetCategory.get();
	return TargetCategory.ORDER.includes(category) ? category : TargetCategory.CATEGORY.MOBS;
}

function onUpdateCycleMode() {
	TargetCategory.set(parseInt(this.value, 10));
}

function onUpdateSense() {
	Controls.joySense = parseFloat(this.value, 10);
	Controls.save();
}

function onUpdateJoyQuick() {
	Controls.joyQuick = parseInt(this.value, 10);
	Controls.save();
}

function onUpdateJoyDeadline() {
	// A fraction (0-1): parseInt turned every position but the last into 0
	Controls.joyDeadline = parseFloat(this.value);
	Controls.save();
}

function onUpdateAutoHide() {
	Controls.joyAutoHide = !!this.checked;
	Controls.save();
}

function onUpdateReverseStick() {
	Controls.joyReverseStick = !!this.checked;
	Controls.save();
}

function onUpdateDisableVirtualMouse() {
	Controls.joyDisableVirtualMouse = !!this.checked;
	Controls.save();
}

ShortCutOption.mouseMode = GUIComponent.MouseMode.STOP;
ShortCutOption.needFocus = true;
export default UIManager.addComponent(ShortCutOption);
