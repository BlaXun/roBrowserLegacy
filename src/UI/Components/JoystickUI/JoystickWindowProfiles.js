/**
 * UI/Components/JoystickUI/JoystickWindowProfiles.js
 *
 * What menu navigation (JoystickUIFocus) knows about particular windows.
 * Every window works without a profile: the D-pad reaches its buttons,
 * items and rows, A presses them, Y right-clicks them, B presses its cancel
 * or close button, X lists Move… and Info for an item, LB / RB switch its
 * tabs. A profile only covers what that cannot: a list row confirmed by a
 * double click, an item whose use is a double click, a box whose B must not
 * send Next, what else can be done with an item.
 *
 * Profiles name windows by component name (the host's id), and reach the
 * windows themselves through UIManager when called, never by import: the
 * windows import the gamepad code, and an import back would be circular.
 *
 * A profile may have:
 *   match         RegExp on the component name
 *   dialog        it waits for an answer: menu navigation turns on when it
 *                 opens, and the D-pad stays among such windows
 *   skip          never navigated (chat, minimap, signboards: HUD); a getter
 *                 for a window navigated only at times (the gamepad HUD,
 *                 while something is carried)
 *   takesFocus    an ordinary window, but one the server opens for an NPC or
 *                 a player (storage, shops, trade): it takes the focus when it
 *                 opens, as a dialogue does
 *   info          it shows what an item or skill is (Y opens it): B closes
 *                 every such window first, unless a dialogue has the focus
 *   home          where menu navigation starts when nothing else is open
 *   persistent    always open (the shortcut bar): not where it starts
 *   items         selector of more elements to focus
 *   only          selector of the only elements to focus
 *   exclude       selector of elements not to focus
 *   dropZones     selector of more elements to focus while something is
 *                 carried: where the window takes a drop
 *   initial       selectors, in order, of where the focus starts
 *   wrap          the D-pad wraps around at the ends instead of leaving
 *   scroll        selector of a text box D-pad up / down scrolls first
 *   tabs          selector of the window's tabs, when their look does not
 *                 say (JoystickFocusTabs finds the rest)
 *   activeTab(tabs, win)    LB / RB: the index of the open tab; -1: not known
 *   onEnter(win)            the focus comes into the window
 *   onFocus(el, win)        the focus lands on an element
 *   direction(dir, el, win) a D-pad press, before the focus moves; true: taken
 *   primary(el, win)        A; true: done, else the element is clicked
 *   primaryLabel(el, win)   what A does, for the hint bar ('' : nothing)
 *   back(win, el)           B; true: done, else cancel / close is pressed
 *   backLabel(win)          what B does
 *   hints(el, win)          more hints: [[keys, text], ...]
 *   actions(el, win, ctx)   X: what else can be done, [{label, run(el)}, ...],
 *                           listed before Move… and Info. run gets the element
 *                           as it is then; ctx.pickSlot(el), when not null,
 *                           opens the gamepad slot picker
 *   canMove(el, win)        whether it can be picked up (X held, Move…);
 *                           default: whether it is draggable
 */

import UIManager from 'UI/UIManager.js';
import ItemType from 'DB/Items/ItemType.js';
import { transferInventoryItemStack } from 'UI/Components/Inventory/InventoryItemTransfer.js';
import Events from './JoystickDomEvents.js';
import Spinner from './JoystickNumberSpinner.js';
import Carry from './JoystickCarry.js';

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

function cartItem(el) {
	const cart = component('CartItems');
	const index = parseInt(el.getAttribute('data-index'), 10);
	return cart && cart.getItemByIndex ? cart.getItemByIndex(index) : null;
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
 * A window's host, where its drop handler listens; null if it is not in the page.
 */
function hostOf(name) {
	const found = component(name);
	const host = found && found._host;
	return host && host.isConnected ? host : null;
}

/**
 * The map: an item put there is dropped on the ground (MapControl).
 */
function ground() {
	return typeof document !== 'undefined' ? document.querySelector('canvas.ro-scene') : null;
}

/**
 * Pick an element up and put it down on a target at once: the target's
 * drop handler does what a mouse drag there does, asking how many first
 * when it is a stack.
 */
function moveTo(el, target) {
	if (target && Carry.pickUp(el)) {
		Carry.place(target);
	}
}

/**
 * Whether the trade takes items now (not after the player has locked it).
 */
function tradeTakesItems() {
	if (!isOpen('Trade')) {
		return false;
	}
	const trade = component('Trade');
	const send = trade.getRoot && trade.getRoot().querySelector('.box.send');
	return !!send && !send.classList.contains('disabled');
}

function npcSells() {
	const store = component('NpcStore');
	return isOpen('NpcStore') && !!store.getCurrentType && store.getCurrentType() === store.Type.SELL;
}

/**
 * Where A sends an inventory item instead of using it, as Alt + right click
 * does: an NPC's sell list, the trade, storage. (Not the cart: merchants
 * keep it open, and A would stop using items.)
 *
 * @return {string} what A does there, '' if nowhere
 */
function inventoryTransfer() {
	if (npcSells()) {
		return 'Sell';
	}
	if (tradeTakesItems()) {
		return 'Offer';
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

/**
 * Menu entries that move an item somewhere: for a stack, all of it at once
 * and some of it (a drop on the window, which asks how many); for one item,
 * just the move.
 *
 * @param {{one: string, all: string, some: string}} labels
 * @param {number} count
 * @param {function(Element)} all
 * @param {?Element} dropOn the window that asks how many; null: no "some" entry
 */
function allOrSome(labels, count, all, dropOn) {
	if (count <= 1) {
		return [{ label: labels.one, run: all }];
	}
	const out = [{ label: labels.all, run: all }];
	if (dropOn) {
		out.push({ label: labels.some, run: live => moveTo(live, dropOn) });
	}
	return out;
}

const STORE = { one: 'Store', all: 'Store all', some: 'Store some…' };
const TAKE = { one: 'Take', all: 'Take all', some: 'Take some…' };
const TO_CART = { one: 'To cart', all: 'All to cart', some: 'Some to cart…' };
const OFFER = { one: 'Offer', all: 'Offer all', some: 'Offer some…' };

/**
 * Whether an inventory item can go on a gamepad slot (what
 * JoystickInteractionService.openSelectionWindow takes).
 */
function slottable(item) {
	return (
		!!item &&
		item.type !== ItemType.UNKNOWN &&
		item.type !== ItemType.ETC &&
		item.type !== ItemType.CARD &&
		item.type !== ItemType.PETEGG &&
		item.type !== ItemType.PETARMOR
	);
}

/**
 * X on an inventory item: use or equip it, send it to an open storage,
 * cart, trade or sell list (all, or some), put it on a gamepad slot, drop it.
 */
function inventoryActions(el, win, ctx) {
	const inventory = component('Inventory');
	const item = el.matches('.item[data-index]') ? inventoryItem(el) : null;
	if (!inventory || !item) {
		return [];
	}
	const count = item.count || 1;
	const withItem = fn => live => {
		const now = inventoryItem(live);
		if (now) {
			fn(now);
		}
	};
	const out = [];

	const use = inventoryAction(item);
	if (use && inventory.useItem) {
		out.push({ label: use, run: withItem(it => inventory.useItem(it)) });
	}
	if (npcSells()) {
		out.push({ label: 'Sell', run: withItem(it => component('NpcStore').receiveInventoryItemStack(it)) });
	}
	if (tradeTakesItems()) {
		const trade = component('Trade');
		out.push(
			...allOrSome(
				OFFER,
				count,
				withItem(it => trade.receiveInventoryItemStack(it)),
				hostOf('Trade')
			)
		);
	}
	if (isOpen('Storage')) {
		const storage = component('Storage');
		out.push(
			...allOrSome(
				STORE,
				count,
				withItem(it => storage.reqAddItem(it.index, it.count || 1)),
				hostOf('Storage')
			)
		);
	}
	if (isOpen('CartItems') && inventory.reqMoveItemToCart) {
		out.push(
			...allOrSome(
				TO_CART,
				count,
				withItem(it => inventory.reqMoveItemToCart(it.index, it.count || 1)),
				hostOf('CartItems')
			)
		);
	}
	if (ctx && ctx.pickSlot && slottable(item)) {
		out.push({ label: 'Gamepad slot…', run: live => ctx.pickSlot(live) });
	}
	const map = ground();
	if (map) {
		out.push({ label: count > 1 ? 'Drop…' : 'Drop', run: live => moveTo(live, map) });
	}
	return out;
}

/**
 * X on a stored item: take it (all, or some), or send it to the cart.
 */
function storageActions(el) {
	const storage = component('Storage');
	if (!storage || !el.matches('.content .item[data-index]')) {
		return [];
	}
	const index = parseInt(el.getAttribute('data-index'), 10);
	const count = rowCount(el);
	const out = allOrSome(TAKE, count, live => storage.reqRemoveItem(index, rowCount(live)), hostOf('Inventory'));
	if (isOpen('CartItems') && storage.reqMoveItemToCart) {
		out.push(
			...allOrSome(TO_CART, count, live => storage.reqMoveItemToCart(index, rowCount(live)), hostOf('CartItems'))
		);
	}
	return out;
}

/**
 * X on an item in the cart: take it (all, or some), or store it.
 */
function cartActions(el) {
	const cart = component('CartItems');
	const item = el.matches('.content .item[data-index]') ? cartItem(el) : null;
	if (!cart || !item) {
		return [];
	}
	const count = item.count || 1;
	const withItem = fn => live => {
		const now = cartItem(live);
		if (now) {
			fn(now);
		}
	};
	const out = allOrSome(
		TAKE,
		count,
		withItem(it => cart.reqRemoveItem(it.index, it.count || 1)),
		hostOf('Inventory')
	);
	if (isOpen('Storage')) {
		const storage = component('Storage');
		out.push(
			...allOrSome(
				STORE,
				count,
				withItem(it => storage.reqAddItemFromCart(it.index, it.count || 1)),
				hostOf('Storage')
			)
		);
	}
	return out;
}

function skillOf(el) {
	const list = component('SkillList');
	return list && list.getSkillById ? list.getSkillById(parseInt(el.getAttribute('data-index'), 10)) : null;
}

/**
 * A skill the player has and can use: what can be cast, dragged and put on a slot.
 */
function usableSkill(skill) {
	return !!skill && !!skill.level && !!skill.type;
}

/**
 * Whether the NPC shop window shows a player's buying store.
 */
function isBuyingStore() {
	const store = component('NpcStore');
	return !!store && !!store.getCurrentType && store.getCurrentType() === store.Type.BUYING_STORE;
}

/**
 * Where A moves an item in a shop window of two lists: from the list on
 * offer (in a player's buying store, from the player's own matching items)
 * into the deal, and from the deal back. The window's drop handler does
 * the move, asking how many when it is a stack.
 *
 * @param {Element} el
 * @param {object} win
 * @param {boolean} buying a player's buying store
 * @return {?Element|undefined} the list to put it in; null: nowhere; undefined: not a shop item
 */
function dealTarget(el, win, buying) {
	if (!el.matches('.item[data-index]')) {
		return undefined;
	}
	const box = el.closest('.InputWindow, .OutputWindow, .AvailableItemsWindow');
	if (!box) {
		return undefined;
	}
	let name;
	if (box.classList.contains('OutputWindow')) {
		name = buying ? 'AvailableItemsWindow' : 'InputWindow';
	} else if (box.classList.contains('AvailableItemsWindow')) {
		name = 'OutputWindow';
	} else {
		// A buying store's own list says what the buyer wants: it is not sold from
		name = buying ? null : 'OutputWindow';
	}
	const list = name ? win.root.querySelector('.' + name) : null;
	return list ? list.querySelector('.content') || list : null;
}

/**
 * A shop window of two lists (NPC shops, stalls and buying stores; a
 * merchant's own stall being set up): A moves an item into the deal and
 * back, as dragging it does (only some of them take a double click).
 *
 * @param {function(): boolean} [buying] whether it is a player's buying store now
 */
function dealLists(buying = () => false) {
	return {
		takesFocus: true,
		dropZones: '.InputWindow .content, .OutputWindow .content, .AvailableItemsWindow .content',
		primary(el, win) {
			const target = dealTarget(el, win, buying());
			if (target === undefined) {
				return false;
			}
			if (target) {
				moveTo(el, target);
			}
			return true;
		},
		primaryLabel(el, win) {
			const target = dealTarget(el, win, buying());
			if (target === undefined) {
				return null;
			}
			if (!target) {
				return '';
			}
			return target.closest('.OutputWindow') ? 'Add' : 'Remove';
		}
	};
}

/**
 * The Quest window's open tab: the one whose list is shown.
 */
function questTab(tabs, win) {
	return tabs.findIndex(tab => {
		const list = tab.id ? win.root.querySelector('#' + tab.id + '-quest-list') : null;
		return !!list && list.style.display === 'block';
	});
}

/**
 * A window's own record of its open tab (InventoryCommon, StorageCommon getTab).
 */
function tabOf(name) {
	return () => {
		const found = component(name);
		return found && found.getTab ? found.getTab() : -1;
	};
}

const PROFILES = [
	// HUD: the D-pad and the window switch pass them by
	{
		match: /^(ChatBox(:.*)?|MiniMap(V\d+)?|QuestWindow|SkillTargetSelection|StatusIcons|Announce|ItemObtain|MapName|FPS|PCGoldTimer|Sense|EntityRoom|EntitySignboard)$/,
		skip: true
	},

	// What an item or skill is, opened by Y (a right click) and from there: B closes them first
	{
		match: /^(ItemInfo|ItemCompare|SkillDescription|CardIllustration|ItemPreview)$/,
		info: true
	},

	// The gamepad HUD: a place to put a skill or item that is carried (JoystickSlotDrop)
	{
		match: /^JoystickUI$/,
		get skip() {
			return !Carry.isCarrying();
		},
		only: '.slot'
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

	// Amounts, prices, NPC input. A number is counted with the D-pad; a text
	// answer (a name, a password) is typed: the focus starts on its field,
	// where A opens the on-screen keyboard
	{
		match: /^InputBox$/,
		dialog: true,
		initial: ['#inputbox:not(.number) input', 'ui-button', 'input'],
		onEnter() {
			Spinner.reset();
		},
		direction(direction, el, win) {
			return Spinner.step(win.root, direction);
		},
		primary(el, win) {
			if (el.matches('input') && !Spinner.numberField(win.root)) {
				// Typed into: the on-screen keyboard
				return false;
			}
			// A number box: A is OK wherever the focus is
			pressFirst(win.root, ['ui-button']);
			return true;
		},
		primaryLabel(el, win) {
			return el.matches('input') && !Spinner.numberField(win.root) ? 'Type' : 'OK';
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

	// A player's menu (and every other right-click menu, and the gamepad's X menu):
	// each one opens at its first entry
	{
		match: /^ContextMenu$/,
		dialog: true,
		wrap: true,
		only: '.menu > div',
		initial: ['.menu > div'],
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

	// NPC shops, vending stalls and buying stores; a merchant's own stall being set up
	Object.assign(dealLists(isBuyingStore), { match: /^NpcStore$/ }),
	Object.assign(dealLists(), { match: /^Vending$/ }),

	// Opened by the server, and a place to put an item (carried: X held, or Move…)
	{
		match: /^Mail$/,
		takesFocus: true,
		dropZones: '.container_item'
	},
	{
		match: /^WriteRodex$/,
		takesFocus: true,
		dropZones: '.items'
	},
	{
		match: /^Refine$/,
		takesFocus: true,
		dropZones: '.item_to_refine'
	},

	// Opened by the server for an NPC or a player: the focus goes there
	{
		match: /^(Trade|VendingShop|ReadMail|Rodex|CashShop)$/,
		takesFocus: true
	},

	// Items: A uses or equips, as a double click does; with an NPC's sell
	// list, a trade or storage open it moves the stack there instead
	{
		match: /^Inventory(V\d+)?$/,
		activeTab: tabOf('Inventory'),
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
		},
		actions: inventoryActions
	},

	// Storage: A takes the stack into the inventory, as Alt + right click does
	{
		match: /^Storage$/,
		takesFocus: true,
		activeTab: tabOf('Storage'),
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
		},
		actions: storageActions
	},

	// Cart: A moves the stack to storage when it is open, else into the inventory
	{
		match: /^CartItems$/,
		primary(el) {
			if (!el.matches('.content .item[data-index]')) {
				return false;
			}
			const cart = component('CartItems');
			const item = cartItem(el);
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
		},
		actions: cartActions
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
		},
		actions(el) {
			const equipment = component('Equipment');
			if (!equipment || !equipment.onUnEquip || !el.matches('.item[data-index]')) {
				return [];
			}
			const index = parseInt(el.getAttribute('data-index'), 10);
			return [{ label: 'Unequip', run: () => equipment.onUnEquip(index) }];
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
			return usableSkill(skillOf(el)) ? 'Use' : '';
		},
		actions(el, win, ctx) {
			const list = component('SkillList');
			if (!list || !el.matches('.skill[data-index]')) {
				return [];
			}
			const id = parseInt(el.getAttribute('data-index'), 10);
			const usable = usableSkill(skillOf(el));
			const out = [];
			if (usable && list.useSkillID) {
				out.push({ label: 'Use', run: () => list.useSkillID(id) });
			}
			if (shown(el.querySelector('.levelup'))) {
				out.push({
					label: 'Level up',
					run: live => {
						const button = live.querySelector('.levelup');
						if (shown(button)) {
							Events.press(button);
						}
					}
				});
			}
			if (usable && ctx && ctx.pickSlot) {
				out.push({ label: 'Gamepad slot…', run: live => ctx.pickSlot(live) });
			}
			return out;
		},
		canMove(el) {
			// Only what can be cast leaves the window (its dragstart refuses the rest)
			return el.matches('.skill[data-index]') ? usableSkill(skillOf(el)) : Carry.canPickUp(el);
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
		},
		actions(el) {
			const bar = component('ShortCut');
			if (!bar || !el.querySelector('.icon')) {
				return [];
			}
			const index = parseInt(el.getAttribute('data-index'), 10);
			return [
				{ label: 'Use', run: () => bar.onShortCut({ cmd: 'EXECUTE' + index }) },
				{ label: 'Clear', run: () => bar.removeAt(index) }
			];
		}
	},

	// Quests: the tabs and the rows are list items, not buttons
	{
		match: /^Quest(V\d+)?$/,
		items: '.quest-menu-item, .quest-item',
		tabs: '.quest-menu-item',
		activeTab: questTab
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
