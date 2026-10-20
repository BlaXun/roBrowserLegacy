import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	controls: { joyUIFocus: true, joyDeadline: 0.1, joyButtonMap: null },
	components: {},
	cursor: { leftClick: vi.fn(), contextMenu: vi.fn(), elementAtCursor: vi.fn(() => null) },
	emoteGrid: { isActive: vi.fn(() => false) },
	selection: { active: vi.fn(() => false) }
}));

vi.mock('Preferences/Controls.js', () => ({ default: mocks.controls }));
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
vi.mock('UI/Components/JoystickUI/JoystickMouseCursorAdapter.js', async () => {
	const { default: Mouse } = await import('Controls/MouseEventHandler.js');
	mocks.cursor.moveTo = vi.fn((x, y) => {
		Mouse.screen.x = x;
		Mouse.screen.y = y;
	});
	return { default: mocks.cursor };
});
vi.mock('UI/Components/JoystickUI/JoystickEmoteGrid.js', () => ({ default: mocks.emoteGrid }));
vi.mock('UI/Components/JoystickUI/JoystickSelectionUI.js', () => ({ default: mocks.selection }));

const { default: UIFocus } = await import('UI/Components/JoystickUI/JoystickUIFocus.js');
const { default: Mouse } = await import('Controls/MouseEventHandler.js');

const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

let gp;
let now;

function frame(ms = 16) {
	now += ms;
	UIFocus.frame(gp, now);
}

function down(button) {
	gp.buttons[button].pressed = true;
	frame();
}

function up(button) {
	gp.buttons[button].pressed = false;
	frame();
}

function tap(button) {
	down(button);
	up(button);
}

/**
 * Let the dialogue scan run (every 100 ms).
 */
function settle() {
	for (let i = 0; i < 8; i++) {
		frame();
	}
}

function place(el, left, top, width, height) {
	el.getBoundingClientRect = () => ({ left, top, right: left + width, bottom: top + height, width, height });
	return el;
}

function makeWindow(id, html, z = 50) {
	const host = document.createElement('div');
	host.id = id;
	host.style.zIndex = String(z);
	const shadow = host.attachShadow({ mode: 'open' });
	const root = document.createElement('div');
	root.className = 'ui-component-root';
	root.innerHTML = html;
	shadow.appendChild(root);
	document.body.appendChild(host);
	return { host, shadow, $: selector => shadow.querySelector(selector), $$: selector => shadow.querySelectorAll(selector) };
}

/**
 * An inventory: a 3 x 2 grid of items at (100, 100), 32 px apart, and a title bar close button.
 * It is the frontmost window unless another is given a higher z-index.
 */
function inventory(x = 100) {
	const items = [0, 1, 2, 3, 4, 5]
		.map(i => `<div class="item" data-index="${i}"><div class="icon"></div></div>`)
		.join('');
	const win = makeWindow(
		'InventoryV3',
		`<div class="titlebar"><button class="close"></button></div><div class="content">${items}</div>`,
		55
	);
	place(win.$('.titlebar .close'), x + 80, 80, 12, 12);
	win.$$('.item').forEach((el, i) => {
		place(el, x + (i % 3) * 32, 100 + Math.floor(i / 3) * 32, 32, 32);
		place(el.querySelector('.icon'), x + (i % 3) * 32 + 4, 100 + Math.floor(i / 3) * 32 + 4, 24, 24);
	});
	return win;
}

function focused() {
	return UIFocus.getFocus().el;
}

function ring() {
	return document.querySelector('.joystick-focus-ring');
}

describe('JoystickUIFocus', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		Object.keys(mocks.components).forEach(key => delete mocks.components[key]);
		vi.clearAllMocks();
		mocks.controls.joyUIFocus = true;
		gp = { buttons: Array.from({ length: 17 }, () => ({ pressed: false })), axes: [0, 0, 0, 0] };
		now = 1000;
		vi.spyOn(performance, 'now').mockImplementation(() => now);
		Mouse.state = Mouse.MOUSE_STATE.NORMAL;
		Mouse.screen.x = 0;
		Mouse.screen.y = 0;
		UIFocus.dispose();
		UIFocus.prepare();
	});

	afterEach(() => {
		UIFocus.dispose();
		vi.restoreAllMocks();
	});

	it('a View tap turns menus on at the first item of the frontmost window, another tap off', () => {
		const inv = inventory();
		tap(BTN.VIEW);
		expect(UIFocus.isActive()).toBe(true);
		expect(focused()).toBe(inv.$('[data-index="0"]'));
		expect(ring().style.display).toBe('block');
		expect(ring().style.left).toBe('98px');

		tap(BTN.VIEW);
		expect(UIFocus.isActive()).toBe(false);
		expect(ring().style.display).toBe('none');
	});

	it('View held alone shows the info of what the cursor is on, and is no tap', () => {
		inventory();
		down(BTN.VIEW);
		for (let i = 0; i < 30; i++) {
			frame();
		}
		up(BTN.VIEW);
		expect(mocks.cursor.contextMenu).toHaveBeenCalledTimes(1);
		expect(UIFocus.isActive()).toBe(false);
	});

	it('View with another button is a modifier, not a tap', () => {
		inventory();
		down(BTN.VIEW);
		tap(BTN.A);
		up(BTN.VIEW);
		expect(UIFocus.isActive()).toBe(false);
	});

	it('the D-pad moves through the grid and repeats when held', () => {
		const inv = inventory();
		tap(BTN.VIEW);
		tap(BTN.RIGHT);
		expect(focused()).toBe(inv.$('[data-index="1"]'));
		tap(BTN.DOWN);
		expect(focused()).toBe(inv.$('[data-index="4"]'));
		tap(BTN.LEFT);
		expect(focused()).toBe(inv.$('[data-index="3"]'));
		expect(ring().style.top).toBe('130px');

		tap(BTN.UP);
		down(BTN.RIGHT);
		expect(focused()).toBe(inv.$('[data-index="1"]'));
		frame(360);
		expect(focused()).toBe(inv.$('[data-index="2"]'));
		up(BTN.RIGHT);
	});

	it('the D-pad crosses into the next window at an edge', () => {
		inventory(100);
		const equip = makeWindow('EquipmentV4', '<div class="item" data-index="20"><button></button></div>');
		place(equip.$('.item'), 300, 100, 32, 32);
		tap(BTN.VIEW);
		tap(BTN.RIGHT);
		tap(BTN.RIGHT);
		tap(BTN.RIGHT);
		expect(focused()).toBe(equip.$('.item'));
		expect(UIFocus.getFocus().win.name).toBe('EquipmentV4');
	});

	it('A runs the window action, Y opens the info, B presses the close button', () => {
		const inv = inventory();
		const useItem = vi.fn();
		mocks.components.Inventory = { getItemByIndex: index => ({ index, type: 0 }), useItem };
		const info = vi.fn();
		const close = vi.fn();
		inv.$('.content').addEventListener('contextmenu', event => info(event.target.classList.contains('icon')));
		inv.$('.titlebar .close').addEventListener('click', close);

		tap(BTN.VIEW);
		tap(BTN.A);
		expect(useItem).toHaveBeenCalledWith({ index: 0, type: 0 });

		tap(BTN.Y);
		expect(info).toHaveBeenCalledWith(true);

		tap(BTN.B);
		expect(close).toHaveBeenCalledTimes(1);
	});

	it('the hint bar names what A does to the focused item', () => {
		inventory();
		mocks.components.Inventory = {
			getItemByIndex: index => ({ index, type: 4, IsIdentified: true }),
			useItem: vi.fn()
		};
		tap(BTN.VIEW);
		const hints = document.querySelector('.joystick-focus-hints');
		expect(hints.textContent).toContain('A Equip');
		expect(hints.textContent).toContain('Y Info');
		expect(hints.textContent).toContain('B Close');
	});

	it('a held shoulder button keeps A a shortcut, and a lone trigger tap switches windows', () => {
		inventory(100);
		const equip = makeWindow('EquipmentV4', '<div class="item" data-index="20"><button></button></div>');
		place(equip.$('.item'), 300, 100, 32, 32);
		const useItem = vi.fn();
		mocks.components.Inventory = { getItemByIndex: index => ({ index, type: 0 }), useItem };

		tap(BTN.VIEW);
		down(BTN.LB);
		tap(BTN.A);
		up(BTN.LB);
		expect(useItem).not.toHaveBeenCalled();

		// LT with a face button is a shortcut, not a window switch
		down(BTN.LT);
		tap(BTN.X);
		up(BTN.LT);
		expect(UIFocus.getFocus().win.name).toBe('InventoryV3');

		tap(BTN.RT);
		expect(UIFocus.getFocus().win.name).toBe('EquipmentV4');
		tap(BTN.LT);
		expect(UIFocus.getFocus().win.name).toBe('InventoryV3');
	});

	it('a dialogue that opens after the pad was used takes the focus, and ends menus when it closes', () => {
		tap(BTN.X); // the pad was used last
		const menu = makeWindow(
			'NpcMenu',
			`<div class="content"><div data-index="0">Yes</div><div data-index="1">No</div></div>
			<ui-button class="btn cancel"></ui-button><ui-button class="btn ok"></ui-button>`,
			60
		);
		place(menu.$('[data-index="0"]'), 50, 50, 200, 18);
		place(menu.$('[data-index="1"]'), 50, 68, 200, 18);
		place(menu.$('.cancel'), 150, 100, 40, 20);
		place(menu.$('.ok'), 200, 100, 40, 20);
		const selected = [];
		menu.$('.content').addEventListener('mousedown', event => selected.push(event.target.textContent));
		menu.$('.cancel').addEventListener('click', () => menu.host.remove());

		settle();
		expect(UIFocus.isActive()).toBe(true);
		expect(focused()).toBe(menu.$('[data-index="0"]'));
		expect(selected).toEqual(['Yes']);

		// Down from the last row wraps to the first; moving there selects it
		tap(BTN.DOWN);
		tap(BTN.DOWN);
		tap(BTN.DOWN);
		expect(focused()).toBe(menu.$('[data-index="0"]'));

		// B is Cancel; held on, it stays away from the map until let go
		down(BTN.B);
		frame();
		expect(UIFocus.isActive()).toBe(false);
		expect(UIFocus.isClaimed(BTN.B)).toBe(true);
		up(BTN.B);
		expect(UIFocus.isClaimed(BTN.B)).toBe(false);
	});

	it('a dialogue does not take over while the mouse was used last', () => {
		const dialog = makeWindow('WinMSG', '<div class="btns"><button class="btn"></button></div>', 100);
		place(dialog.$('button'), 10, 10, 40, 20);
		settle();
		expect(UIFocus.isActive()).toBe(false);
	});

	it('finds an item again after the window draws its list anew, or the one now in its place', () => {
		const inv = inventory();
		tap(BTN.VIEW);
		tap(BTN.RIGHT);
		expect(focused().getAttribute('data-index')).toBe('1');

		// Redrawn: new nodes, same items
		const content = inv.$('.content');
		const fresh = Array.from(content.children).map(el => {
			const copy = el.cloneNode(true);
			copy.getBoundingClientRect = el.getBoundingClientRect;
			return copy;
		});
		content.replaceChildren(...fresh);
		frame();
		expect(focused()).toBe(fresh[1]);

		// Item 1 used up: the list closes the gap
		fresh[1].remove();
		fresh.slice(2).forEach((el, i) => place(el, 100 + ((i + 1) % 3) * 32, 100 + Math.floor((i + 1) / 3) * 32, 32, 32));
		frame();
		expect(focused()).toBe(fresh[2]);
	});

	it('a window opened by A takes the focus', () => {
		const basic = makeWindow('BasicInfoV4', '<div class="buttons"><button id="item"></button></div>', 60);
		place(basic.$('#item'), 10, 300, 40, 20);
		basic.$('#item').addEventListener('click', () => inventory());
		tap(BTN.VIEW);
		expect(UIFocus.getFocus().win.name).toBe('BasicInfoV4');
		tap(BTN.A);
		settle();
		expect(UIFocus.getFocus().win.name).toBe('InventoryV3');
	});

	it('menus end when a skill waits for a target on the map', () => {
		inventory();
		tap(BTN.VIEW);
		Mouse.state = Mouse.MOUSE_STATE.USESKILL;
		frame();
		expect(UIFocus.isActive()).toBe(false);
	});

	it('the setting turns it all off', () => {
		inventory();
		mocks.controls.joyUIFocus = false;
		tap(BTN.VIEW);
		expect(UIFocus.isActive()).toBe(false);
		// A View tap is the info at the cursor again, as before menu navigation
		expect(mocks.cursor.contextMenu).toHaveBeenCalledTimes(1);
	});

	it('turned on by hand, starts in a window the player opened, else the basic info menu', () => {
		const bar = makeWindow('ShortCut', '<div class="container" data-index="0"><div class="icon"></div></div>', 70);
		place(bar.$('.container'), 300, 500, 34, 34);
		const basic = makeWindow('BasicInfoV4', '<div class="buttons"><button id="item"></button></div>', 65);
		place(basic.$('#item'), 10, 300, 40, 20);

		tap(BTN.VIEW);
		expect(UIFocus.getFocus().win.name).toBe('BasicInfoV4');
		tap(BTN.VIEW);

		inventory();
		tap(BTN.VIEW);
		expect(UIFocus.getFocus().win.name).toBe('InventoryV3');
	});

	it('storage opened by an NPC takes the focus, also after the NPC menu that asked for it closed', () => {
		tap(BTN.X); // the pad was used last
		const menu = makeWindow('NpcMenu', '<div class="content"><div data-index="0">Storage</div></div>', 60);
		place(menu.$('[data-index="0"]'), 50, 50, 200, 18);
		menu.$('.content').addEventListener('dblclick', () => menu.host.remove());
		settle();
		expect(UIFocus.getFocus().win.name).toBe('NpcMenu');

		tap(BTN.A);
		frame();
		frame();
		// The server's answer comes a moment later
		const storage = makeWindow('Storage', '<div class="content"><div class="item" data-index="0"><div class="icon"></div></div></div>');
		place(storage.$('.item'), 400, 100, 32, 32);
		settle();
		expect(UIFocus.isActive()).toBe(true);
		expect(UIFocus.getFocus().win.name).toBe('Storage');
	});

	it('menus that turned on by themselves end when nothing opens after the last answer', () => {
		tap(BTN.X);
		const box = makeWindow('WinMSG', '<div class="btns"><button class="btn"></button></div>', 100);
		place(box.$('button'), 10, 10, 40, 20);
		box.$('button').addEventListener('click', () => box.host.remove());
		settle();
		expect(UIFocus.isActive()).toBe(true);

		tap(BTN.A);
		for (let i = 0; i < 50; i++) {
			frame();
		}
		expect(UIFocus.isActive()).toBe(false);
	});

	it('the ring follows the cursor the right stick moves; off every element, A clicks at the cursor', () => {
		const inv = inventory();
		tap(BTN.VIEW);
		expect(focused()).toBe(inv.$('[data-index="0"]'));

		// The stick puts the cursor on item 4
		document.elementFromPoint = () => inv.host;
		inv.shadow.elementFromPoint = () => inv.$('[data-index="4"] .icon');
		Mouse.screen.x = 150;
		Mouse.screen.y = 150;
		UIFocus.cursorMoved();
		expect(focused()).toBe(inv.$('[data-index="4"]'));

		// ... then off the window, onto the map
		document.elementFromPoint = () => null;
		Mouse.screen.x = 600;
		UIFocus.cursorMoved();
		expect(UIFocus.getFocus().detached).toBe(true);
		expect(ring().style.display).toBe('none');
		tap(BTN.A);
		expect(mocks.cursor.leftClick).toHaveBeenCalledTimes(1);

		// The D-pad brings the ring back, from where the cursor is
		tap(BTN.LEFT);
		expect(UIFocus.getFocus().detached).toBe(false);
		expect(focused()).toBe(inv.$('[data-index="5"]'));
		delete document.elementFromPoint;
	});

	it('a window the gamepad opens gets the focus', () => {
		const inv = inventory();
		UIFocus.focusComponent({ _host: inv.host });
		expect(UIFocus.isActive()).toBe(true);
		expect(UIFocus.getFocus().auto).toBe(true);
		expect(focused()).toBe(inv.$('[data-index="0"]'));
	});
});

describe('JoystickUIFocus: X, carrying and tabs', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		Object.keys(mocks.components).forEach(key => delete mocks.components[key]);
		vi.clearAllMocks();
		mocks.controls.joyUIFocus = true;
		gp = { buttons: Array.from({ length: 17 }, () => ({ pressed: false })), axes: [0, 0, 0, 0] };
		now = 1000;
		vi.spyOn(performance, 'now').mockImplementation(() => now);
		Mouse.state = Mouse.MOUSE_STATE.NORMAL;
		Mouse.screen.x = 0;
		Mouse.screen.y = 0;
		UIFocus.dispose();
		UIFocus.prepare();
	});

	afterEach(() => {
		UIFocus.dispose();
		vi.restoreAllMocks();
		delete document.elementFromPoint;
	});

	function hold(button, ms = 420) {
		down(button);
		for (let t = 16; t < ms; t += 16) {
			frame();
		}
	}

	/**
	 * The client's right-click menu, as far as menu navigation uses it.
	 */
	function contextMenu() {
		const menu = { _host: null, win: null, focus: vi.fn() };
		menu.append = () => {
			menu.win = makeWindow('ContextMenu', '<div id="ContextMenu"><div class="menu"></div></div>', 200);
			menu._host = menu.win.host;
		};
		menu.remove = () => {
			if (menu._host) {
				menu._host.remove();
				menu._host = null;
			}
		};
		menu.getRoot = () => menu.win.shadow;
		menu.addElement = (text, callback) => {
			const box = menu.win.$('.menu');
			const entry = document.createElement('div');
			entry.textContent = text;
			entry.addEventListener('click', () => {
				menu.remove();
				callback();
			});
			box.appendChild(entry);
			place(entry, 140, 84 + box.children.length * 16, 80, 16);
		};
		mocks.components.ContextMenu = menu;
		return menu;
	}

	function entries(menu) {
		return Array.from(menu.win.$$('.menu > div')).map(el => el.textContent);
	}

	/**
	 * Items that can be dragged: the window says what they carry, as its dragstart handler does.
	 */
	function carryable(win, from) {
		win.$$('.item').forEach(el => el.setAttribute('draggable', 'true'));
		win.shadow.addEventListener('dragstart', event => {
			const item = event.target.closest('[data-index]');
			event.dataTransfer.setData('Text', JSON.stringify({ type: 'item', from, index: item.getAttribute('data-index') }));
		});
		return win;
	}

	function drops(target) {
		const list = [];
		target.addEventListener('drop', event => list.push(JSON.parse(event.dataTransfer.getData('Text')).index));
		return list;
	}

	function hintText() {
		return document.querySelector('.joystick-focus-hints').textContent;
	}

	it('X tapped lists what can be done with the item; A runs an entry, B closes, the focus comes back', () => {
		const inv = inventory();
		const useItem = vi.fn();
		mocks.components.Inventory = { getItemByIndex: index => ({ index, type: 0, count: 1 }), useItem };
		const menu = contextMenu();

		tap(BTN.VIEW);
		expect(hintText()).toContain('X Actions');
		tap(BTN.X);
		expect(entries(menu)).toEqual(['Use', 'Info']);
		expect(UIFocus.getFocus().win.name).toBe('ContextMenu');
		expect(focused().textContent).toBe('Use');
		// The next look for new windows leaves the focus where the D-pad put it
		tap(BTN.DOWN);
		settle();
		expect(focused().textContent).toBe('Info');
		tap(BTN.UP);

		tap(BTN.A);
		frame();
		expect(useItem).toHaveBeenCalledWith({ index: 0, type: 0, count: 1 });
		expect(UIFocus.getFocus().win.name).toBe('InventoryV3');
		expect(focused()).toBe(inv.$('[data-index="0"]'));

		tap(BTN.RIGHT);
		tap(BTN.X);
		tap(BTN.B);
		frame();
		expect(menu._host).toBe(null);
		expect(focused()).toBe(inv.$('[data-index="1"]'));
	});

	it('X held picks the item up, A puts it down in another window, as a drag there does', () => {
		settle();
		const inv = carryable(inventory(), 'Inventory');
		const storage = makeWindow('Storage', '<div class="content"><div class="item" data-index="40"><div class="icon"></div></div></div>');
		place(storage.$('.item'), 400, 100, 32, 32);
		const stored = drops(storage.host);
		const menu = contextMenu();
		const ended = [];
		inv.shadow.addEventListener('dragend', () => ended.push('end'));
		settle();

		tap(BTN.VIEW);
		hold(BTN.X);
		expect(UIFocus.getFocus().carrying).toBe(true);
		expect(ring().dataset.mode).toBe('carry');
		expect(document.querySelector('.joystick-carry-ghost')).not.toBe(null);
		up(BTN.X);
		expect(menu._host).toBe(null); // a hold is no tap: no menu
		expect(hintText()).toContain('A Place');

		tap(BTN.RT);
		expect(UIFocus.getFocus().win.name).toBe('Storage');
		tap(BTN.A);
		expect(stored).toEqual(['0']);
		expect(ended).toEqual(['end']);
		expect(UIFocus.getFocus().carrying).toBe(false);
		expect(ring().dataset.mode).toBe('focus');
		expect(document.querySelector('.joystick-carry-ghost')).toBe(null);
	});

	it('B puts it back, X pressed again puts it down here, and leaving menus drops nothing', () => {
		const inv = carryable(inventory(), 'Inventory');
		const here = drops(inv.host);
		const close = vi.fn();
		inv.$('.titlebar .close').addEventListener('click', close);

		tap(BTN.VIEW);
		hold(BTN.X);
		up(BTN.X);
		tap(BTN.B);
		expect(UIFocus.getFocus().carrying).toBe(false);
		expect(close).not.toHaveBeenCalled();
		expect(here).toEqual([]);

		hold(BTN.X);
		up(BTN.X);
		tap(BTN.RIGHT);
		tap(BTN.X);
		expect(here).toEqual(['0']);
		expect(UIFocus.getFocus().carrying).toBe(false);

		hold(BTN.X);
		up(BTN.X);
		tap(BTN.VIEW);
		expect(UIFocus.isActive()).toBe(false);
		expect(UIFocus.getFocus().carrying).toBe(false);
		expect(here).toEqual(['0']);
	});

	it('off the ring, what is carried goes where the cursor is: the map', () => {
		const inv = carryable(inventory(), 'Inventory');
		const map = document.createElement('canvas');
		const ground = drops(map);
		document.body.appendChild(map);

		tap(BTN.VIEW);
		hold(BTN.X);
		up(BTN.X);
		document.elementFromPoint = () => null;
		Mouse.screen.x = 600;
		Mouse.screen.y = 300;
		UIFocus.cursorMoved();
		expect(UIFocus.getFocus().detached).toBe(true);
		mocks.cursor.elementAtCursor.mockReturnValueOnce(map);
		tap(BTN.A);
		expect(ground).toEqual(['0']);
		expect(mocks.cursor.leftClick).not.toHaveBeenCalled();
		expect(inv.$('.item').isConnected).toBe(true);
	});

	it('the gamepad HUD is reached only while something is carried, and takes it', () => {
		const inv = carryable(inventory(), 'Inventory');
		const hud = makeWindow(
			'JoystickUI',
			'<div class="group-container" data-group="L1"><div class="slot top"></div><div class="slot bottom"></div></div>',
			1000
		);
		place(hud.$('.slot.top'), 100, 300, 32, 32);
		place(hud.$('.slot.bottom'), 100, 340, 32, 32);
		const slots = [];
		hud.shadow.addEventListener('drop', event => slots.push(event.target.classList.contains('top') ? 'top' : 'other'));

		tap(BTN.VIEW);
		expect(UIFocus.getFocus().win.name).toBe('InventoryV3');
		tap(BTN.DOWN);
		tap(BTN.DOWN);
		expect(focused()).toBe(inv.$('[data-index="3"]'));

		hold(BTN.X);
		up(BTN.X);
		tap(BTN.DOWN);
		expect(UIFocus.getFocus().win.name).toBe('JoystickUI');
		expect(focused()).toBe(hud.$('.slot.top'));
		tap(BTN.A);
		expect(slots).toEqual(['top']);
		frame();
		// Nothing carried: the HUD is passed by again
		expect(UIFocus.getFocus().win.name).not.toBe('JoystickUI');
	});

	it('LB / RB switch the window’s tabs; the focus goes into what the tab draws, or stays on the tabs', () => {
		const win = makeWindow(
			'Tabbed',
			'<div class="tabs"><button id="t0" class="selected"></button><button id="t1"></button><button id="t2"></button></div><div class="content"></div>',
			60
		);
		const tabs = Array.from(win.$$('.tabs button'));
		tabs.forEach((button, i) => place(button, 300, 100 + i * 24, 40, 20));
		const draw = tab => {
			const content = win.$('.content');
			content.innerHTML = [0, 1].map(i => `<div class="item" data-index="${tab * 10 + i}"><div class="icon"></div></div>`).join('');
			content.querySelectorAll('.item').forEach((el, i) => place(el, 100 + i * 32, 100, 32, 32));
		};
		draw(0);
		tabs.forEach((button, i) =>
			button.addEventListener('mousedown', () => {
				tabs.forEach(other => other.classList.remove('selected'));
				button.classList.add('selected');
				draw(i);
			})
		);

		tap(BTN.VIEW);
		expect(focused().getAttribute('data-index')).toBe('0');
		expect(hintText()).toContain('LB/RB Tab');

		tap(BTN.RB);
		frame();
		expect(tabs[1].classList.contains('selected')).toBe(true);
		expect(focused().getAttribute('data-index')).toBe('10');

		tap(BTN.LB);
		frame();
		expect(focused().getAttribute('data-index')).toBe('0');
		tap(BTN.LB);
		frame();
		expect(tabs[2].classList.contains('selected')).toBe(true);
		expect(focused().getAttribute('data-index')).toBe('20');

		// From a tab, the focus stays on the tabs
		tap(BTN.RIGHT);
		tap(BTN.RIGHT);
		expect(focused()).toBe(tabs[0]);
		tap(BTN.RB);
		expect(focused()).toBe(tabs[0]);
		expect(tabs[0].classList.contains('selected')).toBe(true);
		tap(BTN.RB);
		expect(focused()).toBe(tabs[1]);
	});

	it('a shoulder button with a face button stays a shortcut: no tab switch, no menu', () => {
		inventory();
		mocks.components.Inventory = { getItemByIndex: index => ({ index, type: 0, count: 1 }), useItem: vi.fn() };
		const menu = contextMenu();
		const win = makeWindow('Tabbed', '<div class="tabs"><button id="t0" class="selected"></button><button id="t1"></button></div>', 40);
		const switched = vi.fn();
		win.$$('button').forEach((button, i) => {
			place(button, 400, 100 + i * 24, 40, 20);
			button.addEventListener('mousedown', switched);
		});

		tap(BTN.VIEW);
		down(BTN.RB);
		tap(BTN.X);
		up(BTN.RB);
		expect(switched).not.toHaveBeenCalled();
		expect(menu._host).toBe(null);
	});

	it('"Gamepad slot…" opens the slot picker once the press that chose it is let go', () => {
		const pickSlot = vi.fn();
		UIFocus.prepare({ pickSlot });
		const inv = inventory();
		mocks.components.Inventory = { getItemByIndex: index => ({ index, type: 0, count: 1 }), useItem: vi.fn() };
		const menu = contextMenu();

		tap(BTN.VIEW);
		tap(BTN.X);
		expect(entries(menu)).toEqual(['Use', 'Gamepad slot…', 'Info']);
		tap(BTN.DOWN);
		down(BTN.A);
		frame();
		expect(pickSlot).not.toHaveBeenCalled();
		up(BTN.A);
		expect(pickSlot).toHaveBeenCalledWith(inv.$('[data-index="0"]'));
	});
});

describe('JoystickUIFocus: info windows and sliders', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		Object.keys(mocks.components).forEach(key => delete mocks.components[key]);
		vi.clearAllMocks();
		mocks.controls.joyUIFocus = true;
		gp = { buttons: Array.from({ length: 17 }, () => ({ pressed: false })), axes: [0, 0, 0, 0] };
		now = 1000;
		vi.spyOn(performance, 'now').mockImplementation(() => now);
		Mouse.state = Mouse.MOUSE_STATE.NORMAL;
		Mouse.screen.x = 0;
		Mouse.screen.y = 0;
		UIFocus.dispose();
		UIFocus.prepare();
	});

	afterEach(() => {
		UIFocus.dispose();
		vi.restoreAllMocks();
	});

	function hintText() {
		return document.querySelector('.joystick-focus-hints').textContent;
	}

	function wait(ms) {
		for (let t = 0; t < ms; t += 16) {
			frame();
		}
	}

	it('B closes the info windows Y opened, all at once, before the window they came from', () => {
		const inv = inventory();
		const closeInventory = vi.fn();
		inv.$('.titlebar .close').addEventListener('click', closeInventory);
		let info = null;
		let compare = null;
		inv.$('.content').addEventListener('contextmenu', () => {
			info = makeWindow('ItemInfo', '<div class="title"><button class="close"></button></div>', 70);
			place(info.$('.close'), 500, 50, 12, 12);
			info.$('.close').addEventListener('click', () => info.host.remove());
			// The compare window has no close button: it goes as its component does
			compare = makeWindow('ItemCompare', '<div class="title"></div>', 71);
			mocks.components.ItemCompare = { _host: compare.host, remove: vi.fn(() => compare.host.remove()) };
		});

		tap(BTN.VIEW);
		tap(BTN.Y);
		wait(160);
		expect(hintText()).toContain('B Close info');

		tap(BTN.B);
		expect(info.host.isConnected).toBe(false);
		expect(compare.host.isConnected).toBe(false);
		expect(closeInventory).not.toHaveBeenCalled();
		expect(UIFocus.isActive()).toBe(true);
		expect(focused()).toBe(inv.$('[data-index="0"]'));

		tap(BTN.B);
		expect(closeInventory).toHaveBeenCalledTimes(1);
	});

	it('a dialogue keeps B for its answer, even with an info window open', () => {
		tap(BTN.X); // the pad was used last
		const info = makeWindow('ItemInfo', '<button class="close"></button>', 70);
		place(info.$('.close'), 500, 50, 12, 12);
		const box = makeWindow('WinMSG', '<div class="btns"><button id="yes"></button><button id="no"></button></div>', 100);
		place(box.$('#yes'), 10, 10, 40, 20);
		place(box.$('#no'), 60, 10, 40, 20);
		const no = vi.fn();
		box.$('#no').addEventListener('click', no);

		settle();
		expect(UIFocus.getFocus().win.name).toBe('WinMSG');
		tap(BTN.B);
		expect(no).toHaveBeenCalledTimes(1);
		expect(info.host.isConnected).toBe(true);
	});

	it('left and right change a slider and keep the focus on it; A leaves it alone; up and down move on', () => {
		const win = makeWindow(
			'SoundOption',
			'<input class="bgm" type="range" min="0" max="100" step="1" value="50" /><button class="ok"></button>',
			60
		);
		const slider = win.$('.bgm');
		place(slider, 100, 100, 120, 16);
		place(win.$('.ok'), 100, 140, 40, 20);
		const seen = [];
		slider.addEventListener('input', () => seen.push('input:' + slider.value));
		slider.addEventListener('change', () => seen.push('change:' + slider.value));
		const pressed = vi.fn();
		slider.addEventListener('mousedown', pressed);

		tap(BTN.VIEW);
		expect(focused()).toBe(slider);
		expect(hintText()).toContain('◀▶ Change');

		tap(BTN.RIGHT);
		tap(BTN.RIGHT);
		expect(slider.value).toBe('60');
		expect(focused()).toBe(slider);
		tap(BTN.A);
		expect(pressed).not.toHaveBeenCalled();

		tap(BTN.DOWN);
		expect(focused()).toBe(win.$('.ok'));

		// Menus end: the change that waited for the steps to stop goes out
		tap(BTN.VIEW);
		expect(seen).toEqual(['input:55', 'input:60', 'change:60']);
	});
});

describe('JoystickUIFocus: the on-screen keyboard', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		Object.keys(mocks.components).forEach(key => delete mocks.components[key]);
		vi.clearAllMocks();
		mocks.controls.joyUIFocus = true;
		gp = { buttons: Array.from({ length: 17 }, () => ({ pressed: false })), axes: [0, 0, 0, 0] };
		now = 1000;
		vi.spyOn(performance, 'now').mockImplementation(() => now);
		Mouse.state = Mouse.MOUSE_STATE.NORMAL;
		Mouse.screen.x = 0;
		Mouse.screen.y = 0;
		localStorage.clear();
		UIFocus.dispose();
		UIFocus.prepare();
	});

	afterEach(() => {
		UIFocus.dispose();
		vi.restoreAllMocks();
	});

	function keyboard() {
		return document.querySelector('.joystick-keyboard');
	}

	it('A on a text field opens it; it has the buttons until Menu enters the text; menus go on after', async () => {
		const { default: Keyboard } = await import('UI/Components/JoystickUI/JoystickKeyboard.js');
		const win = makeWindow(
			'Search',
			'<input id="storage-search-input" type="text" class="search-input" /><button class="search"></button>',
			60
		);
		place(win.$('input'), 100, 100, 120, 18);
		place(win.$('.search'), 230, 100, 30, 18);
		const entered = [];
		const onKey = event => entered.push(event.keyCode);
		window.addEventListener('keydown', onKey, true);

		tap(BTN.VIEW);
		expect(focused()).toBe(win.$('input'));
		expect(document.querySelector('.joystick-focus-hints').textContent).toContain('A Type');
		tap(BTN.A);
		expect(Keyboard.isOpen()).toBe(true);
		expect(keyboard()).not.toBe(null);

		// The D-pad is the keyboard's now: the ring stays on the field
		tap(BTN.RIGHT);
		tap(BTN.A);
		expect(win.$('input').value).toBe('w');
		expect(focused()).toBe(win.$('input'));

		down(9); // Menu: done
		expect(Keyboard.isOpen()).toBe(false);
		expect(entered).toEqual([13]);
		up(9);
		expect(UIFocus.isActive()).toBe(true);
		tap(BTN.RIGHT);
		expect(focused()).toBe(win.$('.search'));
		window.removeEventListener('keydown', onKey, true);
	});

	it('an NPC asking for text starts on its field, where A opens the keyboard', async () => {
		const { default: Keyboard } = await import('UI/Components/JoystickUI/JoystickKeyboard.js');
		tap(BTN.X); // the pad was used last
		const box = makeWindow(
			'InputBox',
			'<div id="inputbox"><div class="text"></div><input type="text" /><ui-button></ui-button></div>',
			100
		);
		place(box.$('input'), 100, 100, 160, 18);
		place(box.$('ui-button'), 200, 130, 40, 20);
		settle();
		expect(focused()).toBe(box.$('input'));
		expect(document.querySelector('.joystick-focus-hints').textContent).toContain('A Type');
		tap(BTN.A);
		expect(Keyboard.isOpen()).toBe(true);
		tap(BTN.B);
		expect(Keyboard.isOpen()).toBe(false);
		expect(UIFocus.getFocus().win.name).toBe('InputBox');
	});
});
