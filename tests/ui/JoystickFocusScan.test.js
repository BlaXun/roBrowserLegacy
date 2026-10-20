import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ profiles: {} }));

vi.mock('UI/Components/JoystickUI/JoystickWindowProfiles.js', () => ({
	default: { forName: name => mocks.profiles[name] || {} }
}));

const { default: Scan } = await import('UI/Components/JoystickUI/JoystickFocusScan.js');

/**
 * jsdom has no layout: give an element its place on screen by hand.
 */
function place(el, left, top, width, height) {
	el.getBoundingClientRect = () => ({
		left,
		top,
		right: left + width,
		bottom: top + height,
		width,
		height,
		x: left,
		y: top
	});
	return el;
}

/**
 * A window as GUIComponent builds one: a <body> child with a shadow root holding .ui-component-root.
 */
function makeWindow(id, html) {
	const host = document.createElement('div');
	host.id = id;
	const shadow = host.attachShadow({ mode: 'open' });
	const root = document.createElement('div');
	root.className = 'ui-component-root';
	root.innerHTML = html;
	shadow.appendChild(root);
	document.body.appendChild(host);
	return { host, shadow, root, $: selector => shadow.querySelector(selector) };
}

function ids(list) {
	return list.map(el => el.id || el.className || el.getAttribute('data-index'));
}

describe('JoystickFocusScan windows', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		mocks.profiles = {};
	});

	it('lists open GUIComponent windows, frontmost first, and leaves out the rest', () => {
		const back = makeWindow('Inventory', '');
		back.host.style.zIndex = '50';
		const front = makeWindow('Equipment', '');
		front.host.style.zIndex = '52';
		makeWindow('Hidden', '').host.style.display = 'none';
		makeWindow('JoystickSelectionUI', '');
		const plain = document.createElement('div');
		plain.attachShadow({ mode: 'open' });
		document.body.appendChild(plain);

		expect(Scan.listWindows().map(win => win.name)).toEqual(['Equipment', 'Inventory']);
	});

	it('lists the gamepad HUD, which its profile passes by but as a place to put things', () => {
		makeWindow('JoystickUI', '');
		expect(Scan.listWindows().map(win => win.name)).toEqual(['JoystickUI']);
	});

	it('finds the window an element belongs to, through a window nested in it', () => {
		const outer = makeWindow('Equipment', '<div class="footer"></div>');
		const nested = document.createElement('div');
		nested.id = 'SwitchEquip';
		const nestedShadow = nested.attachShadow({ mode: 'open' });
		nestedShadow.innerHTML = '<button class="onswap"></button>';
		outer.$('.footer').appendChild(nested);

		expect(Scan.windowOf(nestedShadow.querySelector('.onswap')).name).toBe('Equipment');
		expect(Scan.windowOf(document.createElement('div'))).toBe(null);
	});
});

describe('JoystickFocusScan focusable elements', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		mocks.profiles = {};
	});

	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('takes what a mouse user clicks, and leaves out what cannot be pressed', () => {
		const win = makeWindow(
			'Window',
			`<div class="titlebar"><button id="base" class="base"></button><button id="close"></button></div>
			<div class="item" data-index="4"><div class="icon"></div></div>
			<ui-button id="ok"></ui-button>
			<button id="hidden"></button>
			<button id="disabled" disabled></button>
			<ui-button id="greyed" disabled></ui-button>
			<button id="off" class="btn disabled"></button>
			<button id="clear" style="opacity: 0"></button>
			<button id="ghost" style="pointer-events: none"></button>
			<div id="text">just text</div>`
		);
		['#base', '#close', '.item', '#ok', '#disabled', '#greyed', '#off', '#clear', '#ghost', '#text'].forEach(
			(selector, i) => place(win.$(selector), 10 + i * 30, 10, 24, 24)
		);
		const scrollPart = document.createElement('div');
		scrollPart.className = 'ro-custom-scrollbar';
		scrollPart.innerHTML = '<button id="thumb"></button>';
		win.root.appendChild(scrollPart);
		place(scrollPart.firstChild, 400, 10, 8, 40);

		const list = Scan.focusables(Scan.listWindows()[0]);
		expect(ids(list)).toEqual(['close', 'item', 'ok']);
	});

	it('lets a profile add, limit and exclude', () => {
		const win = makeWindow(
			'Menu',
			'<div class="menu"><div id="a">One</div><div id="b">Two</div></div><button id="x"></button>'
		);
		place(win.$('#a'), 0, 0, 80, 16);
		place(win.$('#b'), 0, 16, 80, 16);
		place(win.$('#x'), 0, 40, 20, 20);

		mocks.profiles.Menu = { only: '.menu > div' };
		expect(ids(Scan.focusables(Scan.listWindows()[0]))).toEqual(['a', 'b']);

		mocks.profiles.Menu = { items: '.menu > div', exclude: '#b' };
		expect(ids(Scan.focusables(Scan.listWindows()[0]))).toEqual(['a', 'x']);
	});

	it('keeps a label only while the control it stands for is hidden (CSS tabs)', () => {
		const win = makeWindow(
			'Tabs',
			`<input type="radio" id="tab1" style="display: none" /><label id="l1" for="tab1">Tab</label>
			<input type="checkbox" id="check" /><label id="l2" for="check">Check</label>`
		);
		place(win.$('#l1'), 0, 0, 40, 16);
		place(win.$('#check'), 50, 0, 16, 16);
		place(win.$('#l2'), 70, 0, 40, 16);

		expect(ids(Scan.focusables(Scan.listWindows()[0]))).toEqual(['l1', 'check']);
	});

	it('counts a button filling its row as one stop: the button', () => {
		const win = makeWindow('Rows', '<div class="row" data-index="1"><button id="inner"></button></div>');
		place(win.$('.row'), 0, 0, 100, 20);
		place(win.$('#inner'), 0, 0, 100, 20);

		expect(ids(Scan.focusables(Scan.listWindows()[0]))).toEqual(['inner']);
	});

	it('leaves out what an overflow: hidden parent cuts off, keeps what a list scrolls to', () => {
		const win = makeWindow(
			'Bar',
			`<div class="clip" style="overflow: hidden"><div id="shown" data-index="0"></div><div id="cut" data-index="1"></div></div>
			<div class="list" style="overflow-y: auto"><div id="below" data-index="2"></div></div>`
		);
		place(win.$('.clip'), 0, 0, 100, 34);
		place(win.$('#shown'), 0, 0, 34, 34);
		place(win.$('#cut'), 0, 34, 34, 34);
		place(win.$('.list'), 0, 100, 100, 50);
		place(win.$('#below'), 0, 200, 34, 34);

		expect(ids(Scan.focusables(Scan.listWindows()[0]))).toEqual(['shown', 'below']);
	});

	it("takes a profile's drop zones only while something is carried", async () => {
		const { default: Carry } = await import('UI/Components/JoystickUI/JoystickCarry.js');
		const win = makeWindow(
			'Mail',
			'<div class="container_item"></div><button id="send"></button><div class="item" draggable="true" data-index="2"></div>'
		);
		place(win.$('.container_item'), 0, 0, 100, 40);
		place(win.$('#send'), 0, 50, 40, 20);
		place(win.$('.item'), 0, 80, 32, 32);
		win.shadow.addEventListener('dragstart', event => event.dataTransfer.setData('Text', '{"type":"item"}'));
		mocks.profiles.Mail = { dropZones: '.container_item' };

		expect(ids(Scan.focusables(Scan.listWindows()[0]))).toEqual(['send', 'item']);
		Carry.pickUp(win.$('.item'));
		expect(ids(Scan.focusables(Scan.listWindows()[0]))).toEqual(['container_item', 'send', 'item']);
		Carry.cancel();
		expect(ids(Scan.focusables(Scan.listWindows()[0]))).toEqual(['send', 'item']);
	});

	it('finds elements in a window nested in the window (SwitchEquip in Equipment)', () => {
		const outer = makeWindow('Equipment', '<button id="outer"></button><div class="footer"></div>');
		place(outer.$('#outer'), 0, 0, 20, 20);
		const nested = document.createElement('div');
		const shadow = nested.attachShadow({ mode: 'open' });
		shadow.innerHTML = '<button id="swap"></button>';
		place(shadow.querySelector('#swap'), 0, 30, 20, 20);
		outer.$('.footer').appendChild(nested);

		expect(ids(Scan.focusables(Scan.listWindows()[0]))).toEqual(['outer', 'swap']);
	});
});

describe('JoystickFocusScan keys, cursor and scrolling', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		mocks.profiles = {};
	});

	afterEach(() => {
		delete document.elementFromPoint;
	});

	it('names an element by its data-index, else by what it is and how many like it come first', () => {
		const win = makeWindow(
			'Keys',
			`<div class="item" data-index="7"><button class="use"></button></div>
			<button class="btn ok"></button><button class="btn ok selected"></button>`
		);
		const [item, use, ok1, ok2] = ['.item', '.use', '.ok', '.ok.selected'].map(s => win.$(s));
		[item, use, ok1, ok2].forEach((el, i) => place(el, i * 40, 0, 30, 20));
		const list = [item, use, ok1, ok2];

		expect(Scan.keyOf(item, list)).toBe('data-index=7');
		expect(Scan.keyOf(use, list)).toBe('data-index=7>button.use');
		expect(Scan.keyOf(ok1, list)).toBe('button.btn.ok#0');
		// "selected" is a state, not part of what the button is
		expect(Scan.keyOf(ok2, list)).toBe('button.btn.ok#1');

		// Drawn again: the same key finds the new node
		const redrawn = win.$('.item').cloneNode(true);
		place(redrawn, 0, 0, 30, 20);
		expect(Scan.findByKey([redrawn, ok1], 'data-index=7')).toBe(redrawn);
	});

	it('finds the focusable element under the cursor, or the nearest parent that is one', () => {
		const win = makeWindow('Inv', '<div class="item" data-index="3"><div class="icon"></div></div>');
		place(win.$('.item'), 10, 10, 32, 32);
		place(win.$('.icon'), 14, 14, 24, 24);
		document.elementFromPoint = () => win.host;
		win.shadow.elementFromPoint = () => win.$('.icon');

		const hit = Scan.focusableAt(20, 20);
		expect(hit.el).toBe(win.$('.item'));
		expect(hit.win.name).toBe('Inv');
	});

	it('scrolls a list so that an element below it can be seen', () => {
		const win = makeWindow('List', '<div class="list" style="overflow-y: auto"><div id="row" data-index="9"></div></div>');
		const list = win.$('.list');
		place(list, 0, 100, 100, 50);
		Object.defineProperty(list, 'scrollHeight', { value: 400 });
		Object.defineProperty(list, 'clientHeight', { value: 50 });
		Object.defineProperty(list, 'offsetHeight', { value: 50 });
		place(win.$('#row'), 0, 200, 100, 20);

		Scan.reveal(win.$('#row'), win.host);
		expect(list.scrollTop).toBe(70);
	});

	it('sends item events to the icon, so windows listening on the icon or the item both hear them', () => {
		const win = makeWindow(
			'Items',
			`<div class="item" data-index="1"><div class="icon"></div></div>
			<div class="item" data-index="2"><button></button></div>
			<button id="plain"></button>`
		);
		expect(Scan.eventTarget(win.$('[data-index="1"]'))).toBe(win.$('.icon'));
		expect(Scan.eventTarget(win.$('[data-index="2"]'))).toBe(win.$('[data-index="2"] button'));
		expect(Scan.eventTarget(win.$('#plain'))).toBe(win.$('#plain'));
		expect(Scan.isItemLike(win.$('[data-index="1"]'))).toBe(true);
		expect(Scan.isItemLike(win.$('#plain'))).toBe(false);
	});
});
