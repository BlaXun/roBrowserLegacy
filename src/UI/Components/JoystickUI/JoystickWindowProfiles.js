/**
 * UI/Components/JoystickUI/JoystickWindowProfiles.js
 *
 * What menu navigation (JoystickUIFocus) knows about particular windows.
 * Every window works without a profile: the D-pad reaches its buttons,
 * items and rows, A presses them, Y right-clicks them, B presses its cancel
 * or close button. A profile only covers what that cannot: a list row
 * confirmed by a double click, an item whose use is a double click, a box
 * whose B must not send Next.
 *
 * Profiles name windows by component name (the host's id), and reach the
 * windows themselves through UIManager when called, never by import: the
 * windows import the gamepad code, and an import back would be circular.
 *
 * A profile may have:
 *   match         RegExp on the component name
 *   dialog        it waits for an answer: menu navigation turns on when it
 *                 opens, and the D-pad stays among such windows
 *   skip          never navigated (chat, minimap, signboards: HUD)
 *   takesFocus    an ordinary window, but one the server opens for an NPC or
 *                 a player (storage, shops, trade): it takes the focus when it
 *                 opens, as a dialogue does
 *   home          where menu navigation starts when nothing else is open
 *   persistent    always open (the shortcut bar): not where it starts
 *   items         selector of more elements to focus
 *   only          selector of the only elements to focus
 *   exclude       selector of elements not to focus
 *   initial       selectors, in order, of where the focus starts
 *   wrap          the D-pad wraps around at the ends instead of leaving
 *   scroll        selector of a text box D-pad up / down scrolls first
 *   onEnter(win)            the focus comes into the window
 *   onFocus(el, win)        the focus lands on an element
 *   direction(dir, el, win) a D-pad press, before the focus moves; true: taken
 *   primary(el, win)        A; true: done, else the element is clicked
 *   primaryLabel(el, win)   what A does, for the hint bar ('' : nothing)
 *   back(win, el)           B; true: done, else cancel / close is pressed
 *   backLabel(win)          what B does
 *   hints(el, win)          more hints: [[keys, text], ...]
 */

import UIManager from 'UI/UIManager.js';
import ItemType from 'DB/Items/ItemType.js';
import { transferInventoryItemStack } from 'UI/Components/Inventory/InventoryItemTransfer.js';
import Events from './JoystickDomEvents.js';
import Spinner from './JoystickNumberSpinner.js';

/**
 * A registered window, by name (version aliases resolve: 'Inventory' is InventoryV3).
 */
function component(name) {
	try {
		return UIManager.getComponent(name);
	} catch {
		return null;
	}
}

/**
 * Whether an element is on screen and can be pressed.
 */
function shown(el) {
	if (!el || !el.isConnected || el.hasAttribute('disabled')) {
		return false;
	}
	const rect = el.getBoundingClientRect();
	return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/**
 * Press the first shown element matching one of the selectors.
 *
 * @return {boolean} whether one was pressed
 */
function pressFirst(root, selectors) {
	for (let i = 0; i < selectors.length; i++) {
		const el = root.querySelector(selectors[i]);
		if (shown(el)) {
			Events.press(el);
			return true;
		}
	}
	return false;
}

function shownIn(root, selector) {
	return shown(root.querySelector(selector));
}

/**
 * A list row: moving onto it selects it, as a click does, so the window's
 * own highlight follows the ring and OK / Enter take the row that is
 * focused; A confirms it with a double click.
 */
function listRows(selector) {
	return {
		onFocus(el) {
			if (el.matches(selector)) {
				Events.send(el, 'mousedown', { detail: 1 });
				Events.send(el, 'mouseup', { detail: 1 });
			}
		},
		primary(el) {
			if (!el.matches(selector)) {
				return false;
			}
			Events.doubleClick(el);
			return true;
		},
		primaryLabel(el) {
			return el.matches(selector) ? 'Choose' : null;
		}
	};
}

/**
 * What A does with an inventory item: what a double click does (InventoryCommon useItem).
 */
function inventoryAction(item) {
	if (!item) {
		return '';
	}
	switch (item.type) {
		case ItemType.WEAPON:
		case ItemType.ARMOR:
		case ItemType.SHADOWGEAR:
		case ItemType.PETARMOR:
		case ItemType.AMMO:
			return item.IsIdentified && !item.IsDamaged ? 'Equip' : '';
		case ItemType.HEALING:
		case ItemType.USABLE:
		case ItemType.CASH:
		case ItemType.CARD:
		case ItemType.DELAYCONSUME:
			return 'Use';
	}
	return '';
}

function inventoryItem(el) {
	const inventory = component('Inventory');
	const index = parseInt(el.getAttribute('data-index'), 10);
	return inventory && inventory.getItemByIndex ? inventory.getItemByIndex(index) : null;
}

/**
 * Whether a registered window is open on screen.
 */
function isOpen(name) {
	const found = component(name);
	const host = found && found._host;
	return !!host && host.isConnected && host.style.display !== 'none';
}

/**
 * Where A sends an inventory item instead of using it, as Alt + right click
 * does: an NPC's sell list, the trade, storage. (Not the cart: merchants
 * keep it open, and A would stop using items.)
 *
 * @return {string} what A does there, '' if nowhere
 */
function inventoryTransfer() {
	const store = component('NpcStore');
	if (isOpen('NpcStore') && store.getCurrentType && store.getCurrentType() === store.Type.SELL) {
		return 'Sell';
	}
	const trade = component('Trade');
	if (isOpen('Trade')) {
		const send = trade.getRoot && trade.getRoot().querySelector('.box.send');
		if (send && !send.classList.contains('disabled')) {
			return 'Offer';
		}
	}
	return isOpen('Storage') ? 'Store' : '';
}

/**
 * The count shown on a stack's row; 1 when none is shown (a single item).
 */
function rowCount(el) {
	const count = el.querySelector('.count');
	return (count && parseInt(count.textContent, 10)) || 1;
}

const PROFILES = [
	// HUD: the D-pad and the window switch pass them by
	{
		match: /^(ChatBox(:.*)?|MiniMap(V\d+)?|QuestWindow|SkillTargetSelection|StatusIcons|Announce|ItemObtain|MapName|FPS|PCGoldTimer|Sense|EntityRoom|EntitySignboard)$/,
		skip: true
	},

	// NPC dialogue: A is Next (or Close when that is all there is), B is only ever Close
	{
		match: /^NpcBox$/,
		dialog: true,
		initial: ['.btns .next', '.btns .close'],
		scroll: '.content',
		primaryLabel(el) {
			if (el.matches('.next')) {
				return 'Next';
			}
			return el.matches('.close') ? 'Close' : null;
		},
		back(win) {
			pressFirst(win.root, ['.btns .close']);
			return true;
		},
		backLabel(win) {
			return shownIn(win.root, '.btns .close') ? 'Close' : '';
		}
	},

	// NPC menu: rows; Cancel answers the NPC (255) as the window's own button does
	Object.assign(listRows('.content div[data-index]'), {
		match: /^NpcMenu$/,
		dialog: true,
		wrap: true,
		initial: ['.content div.selected', '.content div[data-index]'],
		back(win) {
			pressFirst(win.root, ['.cancel']);
			return true;
		},
		backLabel() {
			return 'Cancel';
		}
	}),

	// Amounts, prices, NPC input
	{
		match: /^InputBox$/,
		dialog: true,
		initial: ['ui-button', 'input'],
		onEnter() {
			Spinner.reset();
		},
		direction(direction, el, win) {
			return Spinner.step(win.root, direction);
		},
		primary(el, win) {
			// A is OK wherever the focus is: the field gets typed into, not pressed
			pressFirst(win.root, ['ui-button']);
			return true;
		},
		primaryLabel() {
			return 'OK';
		},
		back() {
			// An NPC waiting for an answer gets one: the persistent box has no cancel
			const box = component('InputBox');
			if (box && !box.isPersistent) {
				box.remove();
			}
			return true;
		},
		backLabel() {
			const box = component('InputBox');
			return box && !box.isPersistent ? 'Cancel' : '';
		},
		hints(el, win) {
			return Spinner.hints(win.root);
		}
	},

	// Message, prompt and deal boxes (UIManager clones of WinPopup): B is the last button
	{
		match: /^(WinMSG|WinPrompt|WinDeal|WinError)$/,
		dialog: true,
		initial: ['.btns button'],
		back(win) {
			const buttons = Array.from(win.root.querySelectorAll('.btns button')).filter(shown);
			if (buttons.length) {
				Events.press(buttons[buttons.length - 1]);
			}
			return true;
		},
		backLabel(win) {
			return win.root.querySelectorAll('.btns button').length > 1 ? 'Cancel' : 'OK';
		}
	},

	// Item, arrow, weapon and crafting choices: rows, OK, Cancel
	Object.assign(listRows('.item[data-index]'), {
		match: /^(ItemSelection|MakeArrowSelection|RefineWeaponSelection|MakeItemSelection)$/,
		dialog: true,
		initial: ['.item.select', '.item[data-index]'],
		back(win) {
			pressFirst(win.root, ['.cancel']);
			return true;
		},
		backLabel() {
			return 'Cancel';
		}
	}),

	{
		match: /^PackageSelection$/,
		dialog: true,
		initial: ['.groups button'],
		back(win) {
			pressFirst(win.root, ['.cancel']);
			return true;
		},
		backLabel() {
			return 'Cancel';
		}
	},

	// A player's menu (and every other right-click menu)
	{
		match: /^ContextMenu$/,
		dialog: true,
		wrap: true,
		only: '.menu > div',
		back() {
			const menu = component('ContextMenu');
			if (menu) {
				menu.remove();
			}
			return true;
		},
		backLabel() {
			return 'Close';
		}
	},

	// Escape and the death menu
	{
		match: /^Escape$/,
		dialog: true,
		wrap: true,
		only: '.container button',
		back(win) {
			pressFirst(win.root, ['.container .cancel']);
			return true;
		},
		backLabel(win) {
			return shownIn(win.root, '.container .cancel') ? 'Cancel' : '';
		}
	},

	// The basic info window's menu opens every other window: where menus start.
	// The fourth-job version's menu buttons are divs.
	{
		match: /^BasicInfo(V\d+)?$/,
		home: true,
		items: '.buttons > div[id]'
	},

	// Opened by the server for an NPC or a player: the focus goes there
	{
		match: /^(NpcStore|Trade|VendingShop|Refine|Mail|ReadMail|Rodex|WriteRodex|CashShop)$/,
		takesFocus: true
	},

	// Items: A uses or equips, as a double click does; with an NPC's sell
	// list, a trade or storage open it moves the stack there instead
	{
		match: /^Inventory(V\d+)?$/,
		primary(el) {
			if (!el.matches('.item[data-index]')) {
				return false;
			}
			const inventory = component('Inventory');
			const item = inventoryItem(el);
			if (!item) {
				return true;
			}
			const transfer = inventoryTransfer();
			if (transfer === 'Store') {
				component('Storage').reqAddItem(item.index, item.count || 1);
			} else if (transfer) {
				transferInventoryItemStack(item, UIManager.components);
			} else if (inventory.useItem) {
				inventory.useItem(item);
			}
			return true;
		},
		primaryLabel(el) {
			if (!el.matches('.item[data-index]')) {
				return null;
			}
			return inventoryTransfer() || inventoryAction(inventoryItem(el));
		}
	},

	// Storage: A takes the stack into the inventory, as Alt + right click does
	{
		match: /^Storage$/,
		takesFocus: true,
		primary(el) {
			if (!el.matches('.content .item[data-index]')) {
				return false;
			}
			const storage = component('Storage');
			if (storage && storage.reqRemoveItem) {
				storage.reqRemoveItem(parseInt(el.getAttribute('data-index'), 10), rowCount(el));
			}
			return true;
		},
		primaryLabel(el) {
			return el.matches('.content .item[data-index]') ? 'Take' : null;
		}
	},

	// Cart: A moves the stack to storage when it is open, else into the inventory
	{
		match: /^CartItems$/,
		primary(el) {
			if (!el.matches('.content .item[data-index]')) {
				return false;
			}
			const cart = component('CartItems');
			const item =
				cart && cart.getItemByIndex ? cart.getItemByIndex(parseInt(el.getAttribute('data-index'), 10)) : null;
			if (!item) {
				return true;
			}
			if (isOpen('Storage')) {
				component('Storage').reqAddItemFromCart(item.index, item.count || 1);
			} else {
				cart.reqRemoveItem(item.index, item.count || 1);
			}
			return true;
		},
		primaryLabel(el) {
			if (!el.matches('.content .item[data-index]')) {
				return null;
			}
			return isOpen('Storage') ? 'Store' : 'Take';
		}
	},

	// Worn items: A takes it off. The icon button inside is part of the item, not a stop of its own.
	{
		match: /^Equipment(V\d+)?$/,
		exclude: '.item button',
		primary(el) {
			if (!el.matches('.item[data-index]')) {
				return false;
			}
			const equipment = component('Equipment');
			if (equipment && equipment.onUnEquip) {
				equipment.onUnEquip(parseInt(el.getAttribute('data-index'), 10));
			}
			return true;
		},
		primaryLabel(el) {
			return el.matches('.item[data-index]') ? 'Unequip' : null;
		}
	},

	// Skills: A uses one, as a double click does; its + button is a stop of its own
	{
		match: /^SkillList(V\d+)?$/,
		primary(el) {
			if (!el.matches('.skill[data-index]')) {
				return false;
			}
			const list = component('SkillList');
			if (list && list.useSkillID) {
				list.useSkillID(parseInt(el.getAttribute('data-index'), 10));
			}
			return true;
		},
		primaryLabel(el) {
			if (!el.matches('.skill[data-index]')) {
				return null;
			}
			const list = component('SkillList');
			const skill =
				list && list.getSkillById ? list.getSkillById(parseInt(el.getAttribute('data-index'), 10)) : null;
			return skill && skill.level && skill.type ? 'Use' : '';
		}
	},

	// The shortcut bar: its slots; A uses one, as its hotkey does
	{
		match: /^ShortCut$/,
		persistent: true,
		only: '.container[data-index]',
		primary(el) {
			const bar = component('ShortCut');
			if (bar && el.querySelector('.icon')) {
				bar.onShortCut({ cmd: 'EXECUTE' + el.getAttribute('data-index') });
			}
			return true;
		},
		primaryLabel(el) {
			return el.querySelector('.icon') ? 'Use' : '';
		}
	}
];

const DEFAULT = Object.freeze({});

/**
 * The profile of a window, by component name; an empty one for the rest.
 *
 * @param {string} name
 * @return {object}
 */
function forName(name) {
	for (let i = 0; i < PROFILES.length; i++) {
		if (PROFILES[i].match.test(name || '')) {
			return PROFILES[i];
		}
	}
	return DEFAULT;
}

export default {
	forName,
	inventoryAction
};
