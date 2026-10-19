import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('Preferences/Controls.js', () => ({ default: { joyReverseStick: false } }));
vi.mock('UI/Components/JoystickUI/JoystickStickFilter.js', () => ({
	default: { filterAxes: axes => Array.from(axes) }
}));

const { default: Keyboard } = await import('UI/Components/JoystickUI/JoystickKeyboard.js');

const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

let now;
let axes;
let down;

function frame(pressed = []) {
	now += 16;
	Keyboard.frame({ axes }, { pressed, released: [] }, down, now);
}

function tap(button) {
	down[button] = true;
	frame([button]);
	down[button] = false;
	frame();
}

function key() {
	return Keyboard.getState().key;
}

/**
 * A text field in a window's shadow root, as the client's windows have them.
 */
function field(html = '<input type="text" />') {
	const host = document.createElement('div');
	const shadow = host.attachShadow({ mode: 'open' });
	shadow.innerHTML = html;
	document.body.appendChild(host);
	const el = shadow.firstElementChild;
	const events = [];
	el.addEventListener('input', () => events.push('input'));
	el.addEventListener('change', () => events.push('change'));
	return { el, events, shadow };
}

function enters() {
	const seen = [];
	const listener = event => seen.push(event.key + ':' + event.keyCode);
	window.addEventListener('keydown', listener, true);
	return { seen, stop: () => window.removeEventListener('keydown', listener, true) };
}

describe('JoystickKeyboard', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		localStorage.clear();
		Keyboard.reload();
		now = 1000;
		axes = [0, 0, 0, 0];
		down = new Array(16).fill(false);
	});

	afterEach(() => {
		Keyboard.close();
	});

	it('opens on a text field and types the focused key; the D-pad moves, X deletes, Y spaces, LB / RB move the caret', () => {
		const { el, events } = field();

		expect(Keyboard.open(el)).toBe(true);
		expect(Keyboard.isOpen()).toBe(true);
		expect(document.querySelector('.joystick-keyboard')).not.toBe(null);
		expect(key().label).toBe('q');

		tap(BTN.A);
		tap(BTN.RIGHT);
		expect(key().label).toBe('w');
		tap(BTN.A);
		tap(BTN.Y);
		expect(el.value).toBe('qw ');
		tap(BTN.X);
		expect(el.value).toBe('qw');

		tap(BTN.LB);
		tap(BTN.A);
		expect(el.value).toBe('qww');
		expect(Keyboard.getState().caret).toBe(2);
		expect(events.filter(type => type === 'input').length).toBe(5);

		// Shift: the next letter only
		tap(BTN.LT);
		tap(BTN.A);
		tap(BTN.A);
		expect(el.value).toBe('qwWww');
	});

	it('Done (Menu) enters the text with Enter and lets go of the field; B closes, keeps the text, enters nothing', () => {
		const { el, events } = field();
		const keys = enters();

		Keyboard.open(el);
		tap(BTN.A);
		tap(BTN.MENU);
		expect(Keyboard.isOpen()).toBe(false);
		expect(keys.seen).toEqual(['Enter:13']);
		expect(events).toContain('change');
		expect(el.getRootNode().activeElement).not.toBe(el);
		expect(document.querySelector('.joystick-keyboard')).toBe(null);

		Keyboard.open(el);
		tap(BTN.A);
		tap(BTN.B);
		expect(Keyboard.isOpen()).toBe(false);
		expect(el.value).toBe('qq');
		expect(keys.seen).toEqual(['Enter:13']);
		keys.stop();
	});

	it('types into the chat after its item link, which stays; plain text in it can be edited', () => {
		const chat = field('<div contenteditable="true" class="message input-chatbox"></div>');
		chat.el.innerHTML = '<span data-item="501">&lt;Red Potion&gt;</span>';

		Keyboard.open(chat.el);
		tap(BTN.A);
		expect(chat.el.querySelector('span[data-item="501"]')).not.toBe(null);
		expect(chat.el.textContent).toBe('<Red Potion>q');
		expect(document.querySelector('.jk-preview').textContent).toContain('<Red Potion>');
		// Backspace stops at the link
		tap(BTN.X);
		tap(BTN.X);
		expect(chat.el.textContent).toBe('<Red Potion>');
		Keyboard.close();

		const plain = field('<div contenteditable="true"></div>');
		plain.el.textContent = 'hello';
		Keyboard.open(plain.el);
		tap(BTN.X);
		expect(plain.el.textContent).toBe('hell');
	});

	it('a number field starts on the digits and takes only digits', () => {
		const { el } = field('<input type="text" inputmode="numeric" />');
		Keyboard.open(el);
		expect(key().label).toBe('1');
		tap(BTN.A);
		tap(BTN.DOWN);
		expect(key().label).toBe('!');
		tap(BTN.A);
		expect(el.value).toBe('1');
	});

	it('keeps to the length a field takes', () => {
		const { el } = field('<input type="text" maxlength="2" />');
		Keyboard.open(el);
		tap(BTN.A);
		tap(BTN.A);
		tap(BTN.A);
		expect(el.value).toBe('qq');
	});

	it('phrases: View shows them, A puts one in and moves to Done, ✕ deletes one, Save text keeps the text', () => {
		const { el } = field();
		const keys = enters();
		Keyboard.open(el);

		tap(BTN.VIEW);
		expect(Keyboard.getState().page).toBe('phrases');
		expect(key().label).toBe('Hi!');
		tap(BTN.A);
		expect(el.value).toBe('Hi!');
		expect(Keyboard.getState().page).toBe('letters');
		expect(key().action).toBe('done');
		tap(BTN.A);
		expect(keys.seen).toEqual(['Enter:13']);
		keys.stop();

		Keyboard.open(el);
		tap(BTN.VIEW);
		tap(BTN.RIGHT);
		expect(key().label).toBe('✕');
		tap(BTN.A);
		expect(Keyboard.phrases()).not.toContain('Hi!');

		// Up from the first phrase wraps to the buttons under the list
		tap(BTN.LEFT);
		tap(BTN.UP);
		expect(key().action).toBe('save');
		tap(BTN.A);
		expect(Keyboard.phrases()[0]).toBe('Hi!');

		// Kept in the browser
		Keyboard.reload();
		expect(Keyboard.phrases()[0]).toBe('Hi!');
		expect(Keyboard.phrases()).toContain('@autoloot');
	});

	it('a password field offers no Save text, and its text is never kept', () => {
		const { el } = field('<input type="password" />');
		Keyboard.open(el);
		tap(BTN.A);
		tap(BTN.A);
		expect(el.value).toBe('qq');

		tap(BTN.VIEW);
		tap(BTN.UP);
		expect(key().action).toBe('letters');
		tap(BTN.RIGHT);
		expect(key().action).toBe('done');
		tap(BTN.RIGHT);
		expect(key().action).toBe('letters');
		expect(Keyboard.phrases()).not.toContain('qq');
	});

	it('saved phrases read back from the browser are text only, and not too long', () => {
		localStorage.setItem(
			'JoystickKeyboard',
			JSON.stringify({ phrases: ['Hi!', 42, null, '', 'x'.repeat(1000)], mode: 'grid', _version: 1 })
		);
		Keyboard.reload();
		const list = Keyboard.phrases();
		expect(list).toEqual(['Hi!', 'x'.repeat(255)]);
	});

	it('pages: RT goes to signs and accented letters, LT capitalises them too', () => {
		const { el } = field();
		Keyboard.open(el);
		tap(BTN.RT);
		expect(Keyboard.getState().page).toBe('signs');
		tap(BTN.RT);
		expect(Keyboard.getState().page).toBe('accents');
		tap(BTN.UP);
		tap(BTN.LT);
		tap(BTN.A);
		expect(el.value).toBe('Ä');
		tap(BTN.RT);
		expect(Keyboard.getState().page).toBe('letters');
	});

	it('the wheel: RS switches to it, the stick picks a group, A / B / X / Y type its letters', () => {
		const { el } = field();
		Keyboard.open(el);
		tap(BTN.RS);
		expect(Keyboard.getState().mode).toBe('wheel');
		expect(document.querySelectorAll('.jk-petal').length).toBe(8);

		axes = [0, -1, 0, 0]; // up: a b c d, from the top clockwise
		frame();
		expect(Keyboard.getState().petal).toBe(0);
		tap(BTN.Y);
		tap(BTN.B);
		tap(BTN.A);
		tap(BTN.X);
		expect(el.value).toBe('abcd');

		axes = [0.7, -0.7, 0, 0]; // up and right: e f g h
		tap(BTN.Y);
		axes = [1, 0, 0, 0]; // right: i j k l
		tap(BTN.A);
		expect(el.value).toBe('abcdek');

		// At rest: X deletes, Y spaces, A types nothing
		axes = [0, 0, 0, 0];
		tap(BTN.X);
		tap(BTN.Y);
		tap(BTN.A);
		expect(el.value).toBe('abcde ');

		// The way to type is kept
		Keyboard.close();
		Keyboard.reload();
		Keyboard.open(el);
		expect(Keyboard.getState().mode).toBe('wheel');
		tap(BTN.RS);
		expect(Keyboard.getState().mode).toBe('grid');
	});

	it('the grid: the stick moves between keys, but not with a push that was there when it opened', () => {
		const { el } = field();
		axes = [1, 0, 0, 0]; // walking right when the keyboard opened
		Keyboard.open(el);
		frame();
		frame();
		expect(key().label).toBe('q');
		axes = [0, 0, 0, 0];
		frame();
		axes = [1, 0, 0, 0];
		frame();
		expect(key().label).toBe('w');
		// Held: repeats after a moment
		for (let i = 0; i < 25; i++) {
			frame();
		}
		expect(key().label).not.toBe('w');
	});

	it('closes when its field goes away or its window is hidden, and opens only on text fields', () => {
		const { el } = field();
		Keyboard.open(el);
		el.remove();
		frame();
		expect(Keyboard.isOpen()).toBe(false);

		const other = field();
		Keyboard.open(other.el);
		other.el.getRootNode().host.style.display = 'none';
		frame();
		expect(Keyboard.isOpen()).toBe(false);

		expect(Keyboard.open(document.createElement('button'))).toBe(false);
		const box = document.createElement('input');
		box.type = 'checkbox';
		expect(Keyboard.open(box)).toBe(false);
		const readOnly = document.createElement('input');
		readOnly.readOnly = true;
		expect(Keyboard.isTextField(readOnly)).toBe(false);
	});

	it('a key pressed with the mouse or a finger types too', () => {
		const { el } = field();
		Keyboard.open(el);
		const w = Array.from(document.querySelectorAll('.jk-key')).find(k => k.textContent === 'w');
		w.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
		expect(el.value).toBe('w');
	});

	it('opens for a field that has just taken the focus (Menu opened the chat), not for one that had it', () => {
		const { el } = field();
		expect(Keyboard.openIfFocused(null)).toBe(false);
		el.focus();
		expect(Keyboard.focusedField()).toBe(el);
		expect(Keyboard.openIfFocused(el)).toBe(false);
		expect(Keyboard.openIfFocused(null)).toBe(true);
		expect(Keyboard.isOpen()).toBe(true);
	});
});
