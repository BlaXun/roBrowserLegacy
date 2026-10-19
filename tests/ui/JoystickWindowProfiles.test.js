import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ components: {} }));

vi.mock('UI/UIManager.js', () => ({
	default: {
		components: mocks.components,
		getComponent: name => {
			if (!(name in mocks.components)) {
				throw new Error('not found');
			}
			return mocks.components[name];
		}
	}
}));

const { default: Profiles } = await import('UI/Components/JoystickUI/JoystickWindowProfiles.js');
const { default: Spinner } = await import('UI/Components/JoystickUI/JoystickNumberSpinner.js');
const { default: Events } = await import('UI/Components/JoystickUI/JoystickDomEvents.js');

function place(el, left, top, width, height) {
	el.getBoundingClientRect = () => ({ left, top, right: left + width, bottom: top + height, width, height });
	return el;
}

/**
 * A window root, its elements placed so that they count as shown.
 */
function windowOf(html) {
	const host = document.createElement('div');
	const root = host.attachShadow({ mode: 'open' });
	root.innerHTML = html;
	document.body.appendChild(host);
	root.querySelectorAll('*').forEach((el, i) => place(el, 0, i * 20, 40, 18));
	return { host, root, $: selector => root.querySelector(selector) };
}

function recordEvents(el, types) {
	const seen = [];
	types.forEach(type => el.addEventListener(type, event => seen.push(type + ':' + event.button)));
	return seen;
}

describe('JoystickWindowProfiles matching', () => {
	it('finds the profile by component name, versions included', () => {
		expect(Profiles.forName('NpcBox').dialog).toBe(true);
		expect(Profiles.forName('NpcMenu').wrap).toBe(true);
		expect(Profiles.forName('WinPrompt').dialog).toBe(true);
		expect(typeof Profiles.forName('InventoryV3').primary).toBe('function');
		expect(typeof Profiles.forName('EquipmentV4').primary).toBe('function');
		expect(typeof Profiles.forName('SkillListV2').primary).toBe('function');
	});

	it('passes the HUD by, but not windows whose names only start like it', () => {
		expect(Profiles.forName('ChatBox').skip).toBe(true);
		expect(Profiles.forName('ChatBox:tab:2').skip).toBe(true);
		expect(Profiles.forName('MiniMapV2').skip).toBe(true);
		expect(Profiles.forName('ChatBoxSettings').skip).toBeUndefined();
	});

	it('marks the windows that show what an item or skill is, which B closes first', () => {
		['ItemInfo', 'ItemCompare', 'SkillDescription', 'CardIllustration', 'ItemPreview'].forEach(name =>
			expect(Profiles.forName(name).info).toBe(true)
		);
		expect(Profiles.forName('InventoryV3').info).toBeUndefined();
		expect(Profiles.forName('ItemInfoExtra').info).toBeUndefined();
	});

	it('has an empty profile for every other window', () => {
		expect(Profiles.forName('WinStatsV2')).toEqual({});
		expect(Profiles.forName(undefined)).toEqual({});
	});
});

describe('JoystickWindowProfiles dialogues', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		Object.keys(mocks.components).forEach(key => delete mocks.components[key]);
	});

	it('NPC menu: landing on a row selects it, A double-clicks it', () => {
		const win = windowOf('<div class="content"><div data-index="0">A</div><div data-index="1">B</div></div>');
		const row = win.$('[data-index="1"]');
		const seen = recordEvents(win.$('.content'), ['mousedown', 'mouseup', 'dblclick']);
		const profile = Profiles.forName('NpcMenu');

		profile.onFocus(row, win);
		expect(seen).toEqual(['mousedown:0', 'mouseup:0']);

		expect(profile.primary(row, win)).toBe(true);
		expect(seen.slice(2)).toEqual(['mousedown:0', 'mouseup:0', 'dblclick:0']);
		expect(profile.primaryLabel(row, win)).toBe('Choose');
	});

	it('NPC box: B closes only when the box offers Close, and never sends Next', () => {
		const win = windowOf('<div class="btns"><ui-button class="btn close"></ui-button><ui-button class="btn next"></ui-button></div>');
		const close = vi.fn();
		const next = vi.fn();
		win.$('.close').addEventListener('click', close);
		win.$('.next').addEventListener('click', next);
		const profile = Profiles.forName('NpcBox');

		expect(profile.back(win)).toBe(true);
		expect(close).toHaveBeenCalledTimes(1);

		place(win.$('.close'), 0, 0, 0, 0);
		expect(profile.back(win)).toBe(true);
		expect(close).toHaveBeenCalledTimes(1);
		expect(next).not.toHaveBeenCalled();
		expect(profile.backLabel(win)).toBe('');
	});

	it('amount box: the D-pad counts, A presses OK, B cancels unless an NPC waits for it', () => {
		const win = windowOf('<div id="inputbox" class="number"><input type="text" value="5" /><ui-button></ui-button></div>');
		const ok = vi.fn();
		win.$('ui-button').addEventListener('click', ok);
		const box = { isPersistent: false, remove: vi.fn() };
		mocks.components.InputBox = box;
		const profile = Profiles.forName('InputBox');
		profile.onEnter(win);

		expect(profile.direction('up', win.$('input'), win)).toBe(true);
		expect(win.$('input').value).toBe('6');

		expect(profile.primary(win.$('input'), win)).toBe(true);
		expect(ok).toHaveBeenCalledTimes(1);

		profile.back(win);
		expect(box.remove).toHaveBeenCalledTimes(1);

		box.isPersistent = true;
		profile.back(win);
		expect(box.remove).toHaveBeenCalledTimes(1);
		expect(profile.backLabel(win)).toBe('');
	});

	it('message and prompt boxes: B is the last button', () => {
		const win = windowOf('<div class="btns"><button id="yes"></button><button id="no"></button></div>');
		const yes = vi.fn();
		const no = vi.fn();
		win.$('#yes').addEventListener('click', yes);
		win.$('#no').addEventListener('click', no);

		Profiles.forName('WinPrompt').back(win);
		expect(no).toHaveBeenCalledTimes(1);
		expect(yes).not.toHaveBeenCalled();
		expect(Profiles.forName('WinPrompt').backLabel(win)).toBe('Cancel');
	});

	it('right-click menu: B closes it; Escape: B presses Cancel', () => {
		const menu = { remove: vi.fn() };
		mocks.components.ContextMenu = menu;
		Profiles.forName('ContextMenu').back();
		expect(menu.remove).toHaveBeenCalled();

		const win = windowOf('<div class="container"><button class="exit"></button><button class="cancel"></button></div>');
		const cancel = vi.fn();
		win.$('.cancel').addEventListener('click', cancel);
		Profiles.forName('Escape').back(win);
		expect(cancel).toHaveBeenCalledTimes(1);
	});
});

describe('JoystickWindowProfiles item windows', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		Object.keys(mocks.components).forEach(key => delete mocks.components[key]);
	});

	it('inventory: A uses or equips the item, as a double click does', () => {
		const items = {
			3: { index: 3, type: 4, IsIdentified: true, IsDamaged: false },
			4: { index: 4, type: 0 },
			5: { index: 5, type: 3 }
		};
		const inventory = { getItemByIndex: vi.fn(index => items[index]), useItem: vi.fn() };
		mocks.components.Inventory = inventory;
		const win = windowOf(
			'<div class="item" data-index="3"></div><div class="item" data-index="4"></div><div class="item" data-index="5"></div><button class="close"></button>'
		);
		const profile = Profiles.forName('InventoryV3');

		expect(profile.primary(win.$('[data-index="3"]'), win)).toBe(true);
		expect(inventory.useItem).toHaveBeenCalledWith(items[3]);
		expect(profile.primaryLabel(win.$('[data-index="3"]'), win)).toBe('Equip');
		expect(profile.primaryLabel(win.$('[data-index="4"]'), win)).toBe('Use');
		expect(profile.primaryLabel(win.$('[data-index="5"]'), win)).toBe('');

		// Not an item: the button is clicked as usual
		expect(profile.primary(win.$('.close'), win)).toBe(false);
	});

	it('inventory: with storage, a trade or an NPC sell list open, A moves the stack there', () => {
		const item = { index: 3, type: 0, count: 7 };
		mocks.components.Inventory = { getItemByIndex: () => item, useItem: vi.fn() };
		const win = windowOf('<div class="item" data-index="3"></div>');
		const profile = Profiles.forName('InventoryV3');
		const openHost = () => {
			const host = document.createElement('div');
			document.body.appendChild(host);
			return host;
		};

		const storage = { _host: openHost(), reqAddItem: vi.fn() };
		mocks.components.Storage = storage;
		expect(profile.primaryLabel(win.$('.item'), win)).toBe('Store');
		profile.primary(win.$('.item'), win);
		expect(storage.reqAddItem).toHaveBeenCalledWith(3, 7);

		// A trade comes first: it takes the stack through its receiver, as Alt + right click does
		const tradeRoot = document.createElement('div');
		tradeRoot.innerHTML = '<div class="box send"></div>';
		const trade = {
			_host: openHost(),
			__active: true,
			getRoot: () => tradeRoot,
			receiveInventoryItemStack: vi.fn(() => true)
		};
		mocks.components.Trade = trade;
		expect(profile.primaryLabel(win.$('.item'), win)).toBe('Offer');
		profile.primary(win.$('.item'), win);
		expect(trade.receiveInventoryItemStack).toHaveBeenCalledWith(item);
		expect(mocks.components.Inventory.useItem).not.toHaveBeenCalled();
	});

	it('storage: A takes the whole stack into the inventory', () => {
		const storage = { reqRemoveItem: vi.fn() };
		mocks.components.Storage = storage;
		const win = windowOf(
			'<div class="content"><div class="item" data-index="40"><div class="icon"></div><div class="amount"><span class="count">12</span></div></div><div class="item" data-index="41"><div class="icon"></div><div class="amount"></div></div></div>'
		);
		const profile = Profiles.forName('Storage');

		profile.primary(win.$('[data-index="40"]'), win);
		profile.primary(win.$('[data-index="41"]'), win);
		expect(storage.reqRemoveItem.mock.calls).toEqual([
			[40, 12],
			[41, 1]
		]);
		expect(profile.takesFocus).toBe(true);
	});

	it('cart: A moves the stack to storage when it is open, else into the inventory', () => {
		const cart = { getItemByIndex: index => ({ index, count: 5 }), reqRemoveItem: vi.fn() };
		mocks.components.CartItems = cart;
		const win = windowOf('<div class="content"><div class="item" data-index="2"><div class="icon"></div></div></div>');
		const profile = Profiles.forName('CartItems');

		profile.primary(win.$('.item'), win);
		expect(cart.reqRemoveItem).toHaveBeenCalledWith(2, 5);

		const host = document.createElement('div');
		document.body.appendChild(host);
		mocks.components.Storage = { _host: host, reqAddItemFromCart: vi.fn() };
		expect(profile.primaryLabel(win.$('.item'), win)).toBe('Store');
		profile.primary(win.$('.item'), win);
		expect(mocks.components.Storage.reqAddItemFromCart).toHaveBeenCalledWith(2, 5);
	});

	it('equipment: A takes the item off; the icon button inside is no stop of its own', () => {
		const equipment = { onUnEquip: vi.fn() };
		mocks.components.Equipment = equipment;
		const win = windowOf('<div class="item" data-index="12"><button></button></div>');
		const profile = Profiles.forName('EquipmentV4');

		expect(profile.exclude).toBe('.item button');
		profile.primary(win.$('.item'), win);
		expect(equipment.onUnEquip).toHaveBeenCalledWith(12);
	});

	it('skills: A uses a learned active skill, passive ones show no action', () => {
		const skills = { 28: { SKID: 28, level: 10, type: 16 }, 2: { SKID: 2, level: 10, type: 0 } };
		const list = { useSkillID: vi.fn(), getSkillById: id => skills[id] };
		mocks.components.SkillList = list;
		const win = windowOf('<div class="skill" data-index="28"></div><div class="skill" data-index="2"></div>');
		const profile = Profiles.forName('SkillListV2');

		profile.primary(win.$('[data-index="28"]'), win);
		expect(list.useSkillID).toHaveBeenCalledWith(28);
		expect(profile.primaryLabel(win.$('[data-index="28"]'), win)).toBe('Use');
		expect(profile.primaryLabel(win.$('[data-index="2"]'), win)).toBe('');
	});

	it('shortcut bar: A uses a filled slot, as its hotkey does', () => {
		const bar = { onShortCut: vi.fn() };
		mocks.components.ShortCut = bar;
		const win = windowOf(
			'<div class="container" data-index="10"><div class="icon"></div></div><div class="container" data-index="11"></div>'
		);
		const profile = Profiles.forName('ShortCut');

		profile.primary(win.$('[data-index="10"]'), win);
		profile.primary(win.$('[data-index="11"]'), win);
		expect(bar.onShortCut).toHaveBeenCalledTimes(1);
		expect(bar.onShortCut).toHaveBeenCalledWith({ cmd: 'EXECUTE10' });
	});
});

describe('JoystickWindowProfiles X menus, shop lists and tabs', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		Object.keys(mocks.components).forEach(key => delete mocks.components[key]);
	});

	/**
	 * A window in the page whose drops are recorded, as a registered component's host.
	 */
	function openHost() {
		const host = document.createElement('div');
		host.drops = [];
		host.addEventListener('drop', event => host.drops.push(JSON.parse(event.dataTransfer.getData('Text'))));
		document.body.appendChild(host);
		return host;
	}

	/**
	 * Items in it say what they carry when dragged, as the client's windows do.
	 */
	function draggable(win, from) {
		win.root.addEventListener('dragstart', event => {
			const item = event.target.closest('[data-index]');
			event.dataTransfer.setData('Text', JSON.stringify({ type: 'item', from, index: item.dataset.index }));
		});
		return win;
	}

	function labels(entries) {
		return entries.map(entry => entry.label);
	}

	function run(entries, label, el) {
		entries.find(entry => entry.label === label).run(el);
	}

	it('inventory: X lists use, where the stack can go (all, or some), a gamepad slot and the ground', () => {
		const item = { index: 3, type: 0, count: 7 };
		const inventory = { getItemByIndex: () => item, useItem: vi.fn(), reqMoveItemToCart: vi.fn() };
		mocks.components.Inventory = inventory;
		const storage = { _host: openHost(), reqAddItem: vi.fn() };
		mocks.components.Storage = storage;
		mocks.components.CartItems = { _host: openHost() };
		const map = document.createElement('canvas');
		map.className = 'ro-scene';
		map.drops = [];
		map.addEventListener('drop', event => map.drops.push(JSON.parse(event.dataTransfer.getData('Text'))));
		document.body.appendChild(map);
		const win = draggable(windowOf('<div class="item" draggable="true" data-index="3"></div>'), 'Inventory');
		const el = win.$('.item');
		const ctx = { pickSlot: vi.fn() };
		const actions = Profiles.forName('InventoryV3').actions(el, win, ctx);

		expect(labels(actions)).toEqual([
			'Use',
			'Store all',
			'Store some…',
			'All to cart',
			'Some to cart…',
			'Gamepad slot…',
			'Drop…'
		]);
		run(actions, 'Use', el);
		expect(inventory.useItem).toHaveBeenCalledWith(item);
		run(actions, 'Store all', el);
		expect(storage.reqAddItem).toHaveBeenCalledWith(3, 7);
		run(actions, 'All to cart', el);
		expect(inventory.reqMoveItemToCart).toHaveBeenCalledWith(3, 7);
		run(actions, 'Gamepad slot…', el);
		expect(ctx.pickSlot).toHaveBeenCalledWith(el);

		// "Some" drops the stack on the window, whose drop handler asks how many
		run(actions, 'Store some…', el);
		expect(storage._host.drops).toEqual([{ type: 'item', from: 'Inventory', index: '3' }]);
		run(actions, 'Drop…', el);
		expect(map.drops).toEqual([{ type: 'item', from: 'Inventory', index: '3' }]);
	});

	it('inventory: one etc item with nothing open can only be dropped, and nothing else is', () => {
		mocks.components.Inventory = { getItemByIndex: () => ({ index: 5, type: 3, count: 1 }) };
		const win = windowOf('<div class="item" data-index="5"></div><button class="close"></button>');
		const profile = Profiles.forName('InventoryV3');

		expect(profile.actions(win.$('.item'), win, { pickSlot: vi.fn() })).toEqual([]);
		const map = document.createElement('canvas');
		map.className = 'ro-scene';
		document.body.appendChild(map);
		expect(labels(profile.actions(win.$('.item'), win, {}))).toEqual(['Drop']);
		expect(profile.actions(win.$('.close'), win, {})).toEqual([]);
	});

	it('storage and cart: X takes all or some, and moves stacks between them', () => {
		const inventoryHost = openHost();
		mocks.components.Inventory = { _host: inventoryHost };
		const storage = { _host: openHost(), reqRemoveItem: vi.fn(), reqMoveItemToCart: vi.fn(), reqAddItemFromCart: vi.fn() };
		mocks.components.Storage = storage;
		const cart = { _host: openHost(), getItemByIndex: index => ({ index, count: 4 }), reqRemoveItem: vi.fn() };
		mocks.components.CartItems = cart;

		const stored = draggable(
			windowOf(
				'<div class="content"><div class="item" draggable="true" data-index="40"><div class="icon"></div><span class="count">12</span></div></div>'
			),
			'Storage'
		);
		const fromStorage = Profiles.forName('Storage').actions(stored.$('.item'), stored, {});
		expect(labels(fromStorage)).toEqual(['Take all', 'Take some…', 'All to cart', 'Some to cart…']);
		run(fromStorage, 'Take all', stored.$('.item'));
		expect(storage.reqRemoveItem).toHaveBeenCalledWith(40, 12);
		run(fromStorage, 'All to cart', stored.$('.item'));
		expect(storage.reqMoveItemToCart).toHaveBeenCalledWith(40, 12);
		run(fromStorage, 'Take some…', stored.$('.item'));
		expect(inventoryHost.drops).toEqual([{ type: 'item', from: 'Storage', index: '40' }]);

		const carted = draggable(
			windowOf('<div class="content"><div class="item" draggable="true" data-index="2"></div></div>'),
			'CartItems'
		);
		const fromCart = Profiles.forName('CartItems').actions(carted.$('.item'), carted, {});
		expect(labels(fromCart)).toEqual(['Take all', 'Take some…', 'Store all', 'Store some…']);
		run(fromCart, 'Take all', carted.$('.item'));
		expect(cart.reqRemoveItem).toHaveBeenCalledWith(2, 4);
		run(fromCart, 'Store all', carted.$('.item'));
		expect(storage.reqAddItemFromCart).toHaveBeenCalledWith(2, 4);
		run(fromCart, 'Store some…', carted.$('.item'));
		expect(storage._host.drops).toEqual([{ type: 'item', from: 'CartItems', index: '2' }]);
	});

	it('skills: X uses, levels up and slots a usable skill; only those can be picked up', () => {
		const skills = { 28: { SKID: 28, level: 10, type: 16 }, 2: { SKID: 2, level: 10, type: 0 } };
		const list = { useSkillID: vi.fn(), getSkillById: id => skills[id] };
		mocks.components.SkillList = list;
		const win = windowOf(
			'<div class="skill" draggable="true" data-index="28"><ui-button class="btn levelup"></ui-button></div><div class="skill" draggable="true" data-index="2"><ui-button class="btn levelup"></ui-button></div>'
		);
		place(win.$('[data-index="2"] .levelup'), 0, 0, 0, 0);
		const levelUp = vi.fn();
		win.$('[data-index="28"] .levelup').addEventListener('click', levelUp);
		const profile = Profiles.forName('SkillListV2');
		const ctx = { pickSlot: vi.fn() };

		const actions = profile.actions(win.$('[data-index="28"]'), win, ctx);
		expect(labels(actions)).toEqual(['Use', 'Level up', 'Gamepad slot…']);
		run(actions, 'Use', win.$('[data-index="28"]'));
		expect(list.useSkillID).toHaveBeenCalledWith(28);
		run(actions, 'Level up', win.$('[data-index="28"]'));
		expect(levelUp).toHaveBeenCalledTimes(1);

		expect(profile.actions(win.$('[data-index="2"]'), win, ctx)).toEqual([]);
		expect(profile.canMove(win.$('[data-index="28"]'), win)).toBe(true);
		expect(profile.canMove(win.$('[data-index="2"]'), win)).toBe(false);
	});

	it('shortcut bar and equipment: X uses or clears a slot, takes a worn item off', () => {
		const bar = { onShortCut: vi.fn(), removeAt: vi.fn() };
		mocks.components.ShortCut = bar;
		const slots = windowOf(
			'<div class="container" data-index="10"><div class="icon"></div></div><div class="container" data-index="11"></div>'
		);
		const actions = Profiles.forName('ShortCut').actions(slots.$('[data-index="10"]'), slots, {});
		expect(labels(actions)).toEqual(['Use', 'Clear']);
		run(actions, 'Clear');
		expect(bar.removeAt).toHaveBeenCalledWith(10);
		expect(Profiles.forName('ShortCut').actions(slots.$('[data-index="11"]'), slots, {})).toEqual([]);

		const equipment = { onUnEquip: vi.fn() };
		mocks.components.Equipment = equipment;
		const worn = windowOf('<div class="item" data-index="12"><button></button></div>');
		run(Profiles.forName('EquipmentV4').actions(worn.$('.item'), worn, {}), 'Unequip');
		expect(equipment.onUnEquip).toHaveBeenCalledWith(12);
	});

	it('NPC shop: A moves an item into the deal and back, through the lists’ own drop handlers', () => {
		const store = { Type: { BUY: 0, SELL: 1, BUYING_STORE: 3 }, getCurrentType: () => 0 };
		mocks.components.NpcStore = store;
		const win = windowOf(
			`<div class="InputWindow"><div class="content"><div class="item" draggable="true" data-index="1"><div class="icon"></div></div></div></div>
			<div class="OutputWindow"><div class="content"><div class="item" draggable="true" data-index="4"><div class="icon"></div></div></div></div>
			<div class="AvailableItemsWindow"><div class="content"><div class="item" draggable="true" data-index="9"><div class="icon"></div></div></div></div>`
		);
		win.root.addEventListener('dragstart', event => {
			const item = event.target.closest('.item');
			const box = item.closest('.InputWindow, .OutputWindow, .AvailableItemsWindow').className;
			event.dataTransfer.setData('Text', JSON.stringify({ type: 'item', from: 'NpcStore', container: box, index: item.dataset.index }));
		});
		const drops = [];
		['.InputWindow', '.OutputWindow', '.AvailableItemsWindow'].forEach(selector =>
			win.$(selector).addEventListener('drop', function (event) {
				drops.push([this.className, JSON.parse(event.dataTransfer.getData('Text')).index]);
			})
		);
		const profile = Profiles.forName('NpcStore');
		const input = win.$('.InputWindow .item');
		const output = win.$('.OutputWindow .item');
		const available = win.$('.AvailableItemsWindow .item');

		expect(profile.primaryLabel(input, win)).toBe('Add');
		expect(profile.primaryLabel(output, win)).toBe('Remove');
		expect(profile.primary(input, win)).toBe(true);
		expect(profile.primary(output, win)).toBe(true);
		expect(drops).toEqual([
			['OutputWindow', '1'],
			['InputWindow', '4']
		]);

		// A buying store: what the player has goes in the deal, the buyer's own list stays
		store.getCurrentType = () => 3;
		drops.length = 0;
		expect(profile.primaryLabel(input, win)).toBe('');
		expect(profile.primary(input, win)).toBe(true);
		profile.primary(available, win);
		profile.primary(output, win);
		expect(drops).toEqual([
			['OutputWindow', '9'],
			['AvailableItemsWindow', '4']
		]);

		// Not an item: its buttons are clicked as usual
		expect(profile.primary(win.$('.InputWindow .content'), win)).toBe(false);
		expect(profile.dropZones).toContain('.OutputWindow .content');

		// A merchant's own stall being set up has the same two lists
		drops.length = 0;
		const stall = Profiles.forName('Vending');
		expect(stall.takesFocus).toBe(true);
		expect(stall.primaryLabel(input, win)).toBe('Add');
		stall.primary(input, win);
		expect(drops).toEqual([['OutputWindow', '1']]);
	});

	it('the gamepad HUD is passed by until something is carried', async () => {
		const { default: Carry } = await import('UI/Components/JoystickUI/JoystickCarry.js');
		const profile = Profiles.forName('JoystickUI');
		expect(profile.skip).toBe(true);

		const win = draggable(windowOf('<div class="item" draggable="true" data-index="1"></div>'), 'Inventory');
		expect(Carry.pickUp(win.$('.item'))).toBe(true);
		expect(profile.skip).toBe(false);
		Carry.cancel();
		expect(profile.skip).toBe(true);
	});

	it('inventory and storage say themselves which tab is open', () => {
		mocks.components.Inventory = { getTab: () => 2 };
		mocks.components.Storage = { getTab: () => 5 };
		expect(Profiles.forName('InventoryV0').activeTab([], {})).toBe(2);
		expect(Profiles.forName('Storage').activeTab([], {})).toBe(5);
		delete mocks.components.Storage;
		expect(Profiles.forName('Storage').activeTab([], {})).toBe(-1);
	});
});

describe('JoystickNumberSpinner', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		Spinner.reset();
	});

	it('counts by a step that left makes larger and right smaller, never below 0', () => {
		const win = windowOf('<div id="inputbox" class="number"><input type="text" value="40" /></div>');
		const input = win.$('input');

		Spinner.step(win.root, 'down');
		expect(input.value).toBe('39');
		Spinner.step(win.root, 'left');
		Spinner.step(win.root, 'down');
		expect(input.value).toBe('29');
		Spinner.step(win.root, 'left');
		Spinner.step(win.root, 'down');
		expect(input.value).toBe('0');
		Spinner.step(win.root, 'right');
		Spinner.step(win.root, 'up');
		expect(input.value).toBe('10');
		expect(Spinner.hints(win.root)[0]).toEqual(['▲▼', '±10']);
	});

	it('leaves a text box to the keyboard', () => {
		const win = windowOf('<div id="inputbox"><input type="text" value="hello" /></div>');
		expect(Spinner.step(win.root, 'up')).toBe(false);
		expect(Spinner.hints(win.root)).toEqual([]);
	});
});

describe('JoystickDomEvents', () => {
	it('sends a right click that leaves the shadow root, with Alt and the right button', () => {
		const win = windowOf('<div class="content"><div class="item"><div class="icon"></div></div></div>');
		const events = [];
		document.addEventListener('contextmenu', event => events.push(event), { once: true });

		Events.contextMenu(win.$('.icon'), true);
		expect(events.length).toBe(1);
		expect(events[0].button).toBe(2);
		expect(events[0].altKey).toBe(true);
	});

	it('marks the hovered element for styles that cannot see a synthetic hover', () => {
		const win = windowOf('<button></button>');
		Events.hover(win.$('button'), true);
		expect(win.$('button').classList.contains('pad-hover')).toBe(true);
		Events.hover(win.$('button'), false);
		expect(win.$('button').classList.contains('pad-hover')).toBe(false);
	});
});
