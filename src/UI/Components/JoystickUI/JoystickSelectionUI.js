/**
 * UI/Components/JoystickUI/JoystickSelectionUI.js
 *
 * Handles the UI for selecting a shortcut slot when an item/skill is selected via Context Menu.
 *
 */

import GUIComponent from 'UI/GUIComponent.js';
import UIManager from 'UI/UIManager.js';
import ShortCut from 'UI/Components/ShortCut/ShortCut.js';
import htmlText from './JoystickSelectionUI.html?raw';
import ButtonMap from './JoystickButtonMap.js';
import cssText from './JoystickSelectionUI.css?raw';

const JoystickSelectionUI = new GUIComponent('JoystickSelectionUI', cssText);
JoystickSelectionUI.render = () => htmlText;

// State variables
let currentTab = 0;
let slotInTab = 0;
let itemData = null;
let clickLock = null;

// Internal Helper: Debounce for gamepad input
function setClickInterval() {
	if (clickLock) {
		clearTimeout(clickLock);
	}
	clickLock = setTimeout(function () {
		clickLock = null;
	}, 200);
}

function isLocked() {
	return clickLock !== null;
}

/**
 * Button combination for a shortcut slot, worded with the current button
 * mapping. Mirrors JoystickShortcutMapper: bar 1 is LB (slots 1-4) and LT
 * (5-8), bar 2 RB and RT, bars 3 and 4 the same in set 2, and slot 9 of
 * bar 1-4 is LB+RB with Y / X / B / A.
 *
 * @param {number} slotIndex 0-35, bar * 9 + slot
 * @return {string}
 */
function getJoystickComboForSlot(slotIndex) {
	const B = ButtonMap.BUTTON;
	const n = ButtonMap.nameOf;
	const bar = Math.floor(slotIndex / 9);
	const slot = slotIndex % 9;
	const faces = [n(B.Y), n(B.X), n(B.B), n(B.A)];

	if (slot === 8) {
		return n(B.LB) + '+' + n(B.RB) + '+' + faces[bar];
	}

	const left = bar === 0 || bar === 2;
	const modifier = slot < 4 ? (left ? n(B.LB) : n(B.RB)) : left ? n(B.LT) : n(B.RT);
	const combo = modifier + '+' + faces[slot % 4];
	return bar >= 2 ? combo + ' (Set2)' : combo;
}

function updateGrid() {
	const root = JoystickSelectionUI.getRoot();
	const grid = root.querySelector('.shortcut-grid');
	if (!grid) return;

	grid.innerHTML = '';

	const startIdx = currentTab * 9;

	for (let i = 0; i < 9; i++) {
		const globalIndex = startIdx + i;
		const slot = ShortCut.getList()[globalIndex];
		const isEmpty = !slot || (!slot.isSkill && !slot.ID);

		const joystickCombo = getJoystickComboForSlot(globalIndex);
		const displayText = joystickCombo || (i + 1).toString();

		const slotDiv = document.createElement('div');
		slotDiv.className = 'slot-btn';
		slotDiv.dataset.index = i;
		slotDiv.textContent = displayText;

		if (isEmpty) {
			slotDiv.classList.add('empty');
		}

		grid.appendChild(slotDiv);
	}

	updateSelection();
}

function updateSelection() {
	const root = JoystickSelectionUI.getRoot();
	const grid = root.querySelector('.shortcut-grid');
	if (!grid) return;

	grid.querySelectorAll('.slot-btn').forEach(el => el.classList.remove('selected'));
	const selected = grid.querySelector(`.slot-btn[data-index="${slotInTab}"]`);
	if (selected) {
		selected.classList.add('selected');
	}
}

function updateTabButtons() {
	const root = JoystickSelectionUI.getRoot();
	const tabButtons = root.querySelector('.tab-buttons');
	if (!tabButtons) return;

	tabButtons.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
	const active = tabButtons.querySelector(`.tab-btn[data-tab="${currentTab}"]`);
	if (active) {
		active.classList.add('active');
	}
}

function createTabButtons() {
	const root = JoystickSelectionUI.getRoot();
	const tabButtons = root.querySelector('.tab-buttons');
	if (!tabButtons) return;

	tabButtons.innerHTML = '';

	for (let t = 0; t < 4; t++) {
		const tabBtn = document.createElement('button');
		tabBtn.className = 'tab-btn';
		tabBtn.dataset.tab = t;
		tabBtn.textContent = `Tab ${t + 1}`;
		tabButtons.appendChild(tabBtn);
	}
}

function selectSlot() {
	if (!itemData) {
		return;
	}

	const row = currentTab;
	const pos = row * 9 + slotInTab;

	ShortCut.removeElement(itemData.isSkill, itemData.ID, row, itemData.value);
	ShortCut.addElement(pos, itemData.isSkill, itemData.ID, itemData.value);
	ShortCut.onChange(pos, itemData.isSkill, itemData.ID, itemData.value);

	JoystickSelectionUI.hideSelection();
}

/**
 * Main input handler
 * as expected by JoystickButtonInput.js
 */
JoystickSelectionUI.handleGamepadInput = function handleGamepadInput(buttons) {
	if (isLocked()) {
		return true;
	}

	// A - select
	if (buttons[0] !== 'unpressed') {
		setClickInterval();
		selectSlot();
		return true;
	}

	// Select - cancel
	if (buttons[8] !== 'unpressed') {
		setClickInterval();
		JoystickSelectionUI.hideSelection();
		return true;
	}

	// L2 - Previous Tab
	if (buttons[6] !== 'unpressed') {
		setClickInterval();
		if (currentTab > 0) {
			currentTab--;
			slotInTab = 0;
			updateGrid();
			updateTabButtons();
		}
		return true;
	}

	// R2 - Next Tab
	if (buttons[7] !== 'unpressed') {
		setClickInterval();
		if (currentTab < 3) {
			currentTab++;
			slotInTab = 0;
			updateGrid();
			updateTabButtons();
		}
		return true;
	}

	// D-pad up
	if (buttons[12] !== 'unpressed') {
		setClickInterval();
		if (slotInTab >= 3) {
			slotInTab -= 3;
			updateSelection();
		}
		return true;
	}

	// D-pad down
	if (buttons[13] !== 'unpressed') {
		setClickInterval();
		if (slotInTab < 6) {
			slotInTab += 3;
			updateSelection();
		}
		return true;
	}

	// D-pad left
	if (buttons[14] !== 'unpressed') {
		setClickInterval();
		if (slotInTab > 0) {
			slotInTab--;
			updateSelection();
		}
		return true;
	}

	// D-pad right
	if (buttons[15] !== 'unpressed') {
		setClickInterval();
		if (slotInTab < 8) {
			slotInTab++;
			updateSelection();
		}
		return true;
	}

	return false;
};

JoystickSelectionUI.init = function () {
	// Initialize structure once attached
	createTabButtons();
	this._host.style.position = 'fixed';
	this._host.style.display = 'none';
};

JoystickSelectionUI.showSelection = function (data) {
	itemData = data;
	currentTab = 0;
	slotInTab = 0;

	updateGrid();
	updateTabButtons();

	// Footer in the current button names
	const B = ButtonMap.BUTTON;
	const n = ButtonMap.nameOf;
	const footer = this.getRoot().querySelector('.footer-instructions');
	if (footer) {
		footer.textContent =
			'Use ' +
			n(B.LT) +
			'/' +
			n(B.RT) +
			' to change tab, D-pad to navigate slot, ' +
			n(B.A) +
			' to select, ' +
			n(B.VIEW) +
			' to cancel';
	}

	this.focus();
	this._host.style.display = 'block';
	this._fixPositionOverflow();
};

JoystickSelectionUI.hideSelection = function () {
	this._host.style.display = 'none';
	itemData = null;
};

JoystickSelectionUI.active = function () {
	return this._host && this._host.style.display !== 'none';
};

export default UIManager.addComponent(JoystickSelectionUI);
