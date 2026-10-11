/**
 * UI/Components/JoystickUI/JoystickUIRenderer.js
 *
 * Manages the visual representation of the joystick HUD.
 * Handles icon loading, slot updates, group highlighting,
 * and automatic visibility based on user activity.
 *
 * @author AoShinHo
 */

import ShortCut from 'UI/Components/ShortCut/ShortCut.js';
import InventoryUI from 'UI/Components/Inventory/Inventory.js';
import SetManager from './JoystickSetManager.js';
import DB from 'DB/DBManager.js';
import Client from 'Core/Client.js';
import ControlsSettings from 'Preferences/Controls.js';
import ItemType from 'DB/Items/ItemType.js';
import JoystickShortcutMapper from './JoystickShortcutMapper.js';
import JoystickInputService from './JoystickInputService.js';
import SkillInfo from 'DB/Skills/SkillInfo.js';
import ButtonMap from './JoystickButtonMap.js';
import Category from './JoystickTargetCategory.js';

let ui = null;

/**
 * Get internal shadow root
 * @returns {ShadowRoot|HTMLElement}
 */
function _getShadow() {
	if (!ui) return null;
	const host = ui[0];
	return host.shadowRoot || host;
}

let _mouseMoveHandler = null;

function setupUIHide() {
	let lastMouseX = 0;
	let lastMouseY = 0;

	_mouseMoveHandler = event => {
		if (!ui || !_isVisible()) {
			return;
		}

		// A button held over the HUD is the start of dragging one of its icons
		if (event.buttons && event.composedPath().includes(ui[0])) {
			return;
		}

		const deltaX = Math.abs(event.clientX - lastMouseX);
		const deltaY = Math.abs(event.clientY - lastMouseY);

		if ((deltaX > 5 || deltaY > 5) && ControlsSettings.joyAutoHide) {
			hide();
			JoystickInputService.active = false;
		}
		lastMouseX = event.clientX;
		lastMouseY = event.clientY;
	};

	document.addEventListener('mousemove', _mouseMoveHandler);
}

function _isVisible() {
	if (!ui) return false;
	const host = ui[0];
	if (!host) return false;
	return host.style.display !== 'none';
}

function attach(root) {
	ui = root;
	setupUIHide();
}

function updateJoystickSlot(joystickSlotIndex, shortcutIndex) {
	const item = ShortCut.getList()[shortcutIndex];
	const shadow = _getShadow();
	if (!shadow) return;

	const slots = shadow.querySelectorAll('.slot');
	const slot = slots[joystickSlotIndex];
	if (!slot) return;

	const icon = slot.querySelector('.icon');
	const img = icon.querySelector('.img');
	const amount = icon.querySelector('.amount');

	if (!item || item.ID === 0) {
		icon.style.display = 'none';
		img.style.backgroundImage = 'none';
		amount.textContent = '';
		return;
	}

	icon.style.display = 'block';

	if (item.isSkill && item.count) {
		const skillInfo = SkillInfo[item.ID];
		if (skillInfo) {
			Client.loadFile(`${DB.INTERFACE_PATH}item/${skillInfo.Name}.bmp`, url => {
				img.style.backgroundImage = `url(${url})`;
				amount.textContent = item.count;
			});
		}
	} else {
		const inventoryItem = InventoryUI.getUI().getItemById(item.ID);
		if (inventoryItem) {
			const itemInfo = DB.getItemInfo(item.ID);
			const fileName = inventoryItem.IsIdentified
				? itemInfo.identifiedResourceName
				: itemInfo.unidentifiedResourceName;
			let count = inventoryItem.count;
			if (
				(inventoryItem.type === ItemType.WEAPON ||
					inventoryItem.type === ItemType.ARMOR ||
					inventoryItem.type === ItemType.SHADOWGEAR) &&
				count
			) {
				count = 1;
			}
			Client.loadFile(`${DB.INTERFACE_PATH}item/${fileName}.bmp`, url => {
				img.style.backgroundImage = `url(${url})`;
				amount.textContent = count;
			});
		}
	}
}

function updateById(Id) {
	if (!ui) {
		return;
	}
	const startIdx = SetManager.getCurrentSet() === 1 ? 0 : 20;
	for (let i = 0; i < 20; i++) {
		const shortcutIndex = JoystickShortcutMapper.slotMap[startIdx + i];
		const shortcut = ShortCut.getList()[shortcutIndex];
		if (shortcut && shortcut.ID === Id) {
			updateJoystickSlot(i, shortcutIndex);
		}
	}
}

function updateByIndex(index) {
	if (!ui) {
		return;
	}
	const startIdx = SetManager.getCurrentSet() === 1 ? 0 : 20;
	for (let i = 0; i < 20; i++) {
		const shortcutIndex = JoystickShortcutMapper.slotMap[startIdx + i];
		if (shortcutIndex === index) {
			updateJoystickSlot(i, shortcutIndex);
		}
	}
}

/**
 * Write the current physical button names into the HUD: group headers
 * (LB, LT, ...) and the face-button labels on each slot cross.
 */
function relabel() {
	const shadow = _getShadow();
	if (!shadow) return;

	const B = ButtonMap.BUTTON;
	const groups = {
		L1: ButtonMap.nameOf(B.LB),
		L2: ButtonMap.nameOf(B.LT),
		R1: ButtonMap.nameOf(B.RB),
		R2: ButtonMap.nameOf(B.RT),
		L1R1: ButtonMap.nameOf(B.LB) + '+' + ButtonMap.nameOf(B.RB)
	};
	const faces = {
		top: ButtonMap.nameOf(B.Y),
		left: ButtonMap.nameOf(B.X),
		right: ButtonMap.nameOf(B.B),
		bottom: ButtonMap.nameOf(B.A)
	};

	shadow.querySelectorAll('.group-container').forEach(group => {
		const header = group.querySelector('.group-header');
		if (header && groups[group.dataset.group]) {
			header.textContent = groups[group.dataset.group];
		}
		Object.keys(faces).forEach(position => {
			const label = group.querySelector('.slot.' + position + ' .key-label');
			if (label) {
				label.textContent = faces[position];
			}
		});
	});
}

/**
 * Show the right stick mode (aim line / cursor) next to the set indicator.
 */
function updateStickMode() {
	const shadow = _getShadow();
	if (!shadow) return;

	const el = shadow.querySelector('.stick-mode');
	if (el) {
		// Only worth showing when aiming is switched on in the settings
		const aim = ControlsSettings.joyAimEnabled && ControlsSettings.joyRightStickMode === 1;
		el.style.display = ControlsSettings.joyAimEnabled ? '' : 'none';
		el.textContent = aim ? 'Aim' : 'Cursor';
		el.classList.toggle('aim', aim);
	}
}

/**
 * Show the target category (D-pad up / down) next to the stick mode.
 */
function updateCategory() {
	const shadow = _getShadow();
	if (!shadow) return;

	const el = shadow.querySelector('.target-category');
	if (el) {
		el.textContent = Category.nameOf(Category.get());
		el.classList.toggle('support', Category.isSupport());
	}
}

Category.onChange(updateCategory);

function sync() {
	if (!ui) {
		return;
	}

	relabel();
	updateStickMode();
	updateCategory();

	const startIdx = SetManager.getCurrentSet() === 1 ? 0 : 20;
	for (let i = 0; i < 20; i++) {
		const shortcutIndex = JoystickShortcutMapper.slotMap[startIdx + i];
		updateJoystickSlot(i, shortcutIndex);
	}
}

function updateSetIndicator() {
	const shadow = _getShadow();
	if (!shadow) return;

	shadow.querySelectorAll('.set-btn').forEach(el => el.classList.remove('active'));

	const currentSet = SetManager.getCurrentSet();
	const activeBtn = shadow.querySelector(`.set-btn:nth-child(${currentSet})`);
	if (activeBtn) {
		activeBtn.classList.add('active');
	}
}

function updateVisuals(buttons) {
	const shadow = _getShadow();
	if (!shadow) return;

	shadow.querySelectorAll('.group-container').forEach(el => el.classList.remove('active'));

	const activeGroup = JoystickShortcutMapper.getGroup(buttons);
	if (activeGroup !== '') {
		const active = shadow.querySelector(`[data-group="${activeGroup}"]`);
		if (active) {
			active.classList.add('active');
		}
	}
}

function show() {
	if (ui && !_isVisible()) {
		ui.show();
	}
}

function hide() {
	if (ui && _isVisible()) {
		ui.hide();
	}
}

function dispose() {
	hide();
	if (_mouseMoveHandler) {
		document.removeEventListener('mousemove', _mouseMoveHandler);
		_mouseMoveHandler = null;
	}
	ui = null;
}

export default {
	attach,
	dispose,
	sync,
	updateById,
	updateByIndex,
	updateSetIndicator,
	updateVisuals,
	relabel,
	updateStickMode,
	updateCategory,
	show,
	hide,
	isVisible: _isVisible
};
