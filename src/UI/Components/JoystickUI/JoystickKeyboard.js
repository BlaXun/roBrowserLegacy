/**
 * UI/Components/JoystickUI/JoystickKeyboard.js
 *
 * An on-screen keyboard for the gamepad. Text fields (the chat, an NPC's
 * question, the storage search, prices, mail, names) are typed into with
 * it. It opens with A on a text field in menus (JoystickUIFocus), and when
 * Menu (Enter) opens the chat (JoystickButtonInput). While it is open it
 * has every button and the sticks: the map and the menus get none.
 *
 * Two ways to type, switched with RS click (the last one used is kept):
 *
 *   Grid   the D-pad or the left stick moves between keys (held: repeats),
 *          A presses the key. The letter rows follow the player's language:
 *          QWERTZ for German, QWERTY otherwise.
 *   Wheel  the left stick picks one of eight groups of four letters, and
 *          A / B / X / Y types the one at that button's place. Two inputs
 *          a letter, nothing to move to.
 *
 * In both:
 *   X                  delete the letter before the caret (held: repeats)
 *   Y                  space
 *   B                  close: the text stays in the field
 *   LB / RB            caret left / right (held: repeats)
 *   LT                 shift: the next letter, again: all letters, again: off
 *   RT                 the next page: letters, signs, accented letters
 *   View               saved phrases
 *   Menu               done: the text is entered as Enter enters it (the
 *                      chat sends it, an NPC's question takes it)
 * (On the wheel, X, Y and B are these with the stick at rest; pushed, they
 * type.)
 *
 * The text goes into the field as it is typed, and the window hears an
 * `input` event at each change. In the chat, what is already there (an item
 * link) stays, and the new text goes after it.
 *
 * Saved phrases (View, or the ★ key): A puts one in at the caret (on the
 * grid the focus then moves to Done, so a second A enters it); ✕ deletes
 * one; "Save text" keeps what has been typed. They are kept in the browser
 * (Preferences: JoystickKeyboard), with a few to start: greetings, and the
 * commands a player types most (@autoloot, @go).
 */

import ControlsSettings from 'Preferences/Controls.js';
import Preferences from 'Core/Preferences.js';
import ButtonMap from './JoystickButtonMap.js';
import StickFilter from './JoystickStickFilter.js';
import Overlay from './JoystickFocusOverlay.js';

const BTN = ButtonMap.BUTTON;

const REPEAT_DELAY_MS = 350; // a held key starts repeating after this
const REPEAT_EVERY_MS = 90;
const STICK_PUSH = 0.5; // the stick pushed this far is a direction
const UNIT = 30; // px: a key's width
const GAP = 3; // px between keys
const ROW_UNITS = 10; // every row is this many keys wide
const WIDTH = ROW_UNITS * UNIT + (ROW_UNITS - 1) * GAP; // px: the keyboard's inner width
const PHRASES_SHOWN = 6;
const PHRASES_MAX = 30;
const PHRASE_LENGTH_MAX = 255; // characters a saved phrase keeps
const DEFAULT_PHRASES = ['Hi!', 'Thanks!', '@autoloot', '@storage', '@go ', '@warp '];

/**
 * Fields typed into: text inputs, text areas, and editable elements (the chat).
 */
const TEXT_FIELD = [
	'input:not([type])',
	'input[type="text"]',
	'input[type="search"]',
	'input[type="password"]',
	'input[type="email"]',
	'input[type="number"]',
	'input[type="tel"]',
	'input[type="url"]',
	'textarea'
].join(',');

/**
 * Fields that take a number (amounts, prices): digits only, the digits first.
 */
const NUMBER_FIELD = 'input[type="number"], [inputmode="numeric"], [inputmode="decimal"]';

const PAGE_ORDER = ['letters', 'signs', 'accents'];
const PAGE_LABEL = { letters: 'abc', signs: '#+=', accents: 'äöü' };

/**
 * The wheel's groups, from the top round clockwise; in each, the letters
 * from the top round clockwise: Y, B, A, X.
 */
const WHEEL = {
	letters: ['abcd', 'efgh', 'ijkl', 'mnop', 'qrst', 'uvwx', 'yz,.', "?!@'"],
	signs: ['1234', '5678', '90-+', '=/\\:', ';"#$', '%&*(', ')_<>', '[]~|'],
	accents: ['äöüß', 'éèêë', 'àáâç', 'ñóòô', 'úùûí', 'ìîïœ', 'æøå€', '¿¡^`']
};

/**
 * The place of each face button in a wheel group: top, right, bottom, left.
 */
const FACE_SLOT = { [BTN.Y]: 0, [BTN.B]: 1, [BTN.A]: 2, [BTN.X]: 3 };
const SLOT_COLOR = ['#e6c229', '#e04b4b', '#5cb85c', '#4a90e2'];

const DIRECTIONS = {
	[BTN.UP]: 'up',
	[BTN.DOWN]: 'down',
	[BTN.LEFT]: 'left',
	[BTN.RIGHT]: 'right'
};

let _open = false;
let _field = null; // the element typed into
let _kind = 'value'; // 'value' (input, textarea) or 'editable' (contenteditable)
let _node = null; // editable: the text node typed into
let _prefix = ''; // editable: the text before it (item links), shown, never edited
let _text = '';
let _caret = 0;
let _numeric = false;
let _password = false;

let _page = 'letters';
let _lastPage = 'letters'; // the page to go back to from the phrases
let _shift = 0; // 0 off, 1 the next letter, 2 all letters
let _row = 0; // grid and phrases: the focused key
let _col = 0;
let _petal = null; // wheel: the group the stick points at, 0 the top, then clockwise

let _panel = null;
let _nextAt = new Map(); // held button: when it repeats next
let _stickDir; // undefined: not read yet; a push already there when it opened is no move
let _stickNextAt = 0;
let _prefs = null;

// ---------------------------------------------------------------------------
// Settings: the phrases and the way to type
// ---------------------------------------------------------------------------

function prefs() {
	if (!_prefs) {
		_prefs = Preferences.get('JoystickKeyboard', { phrases: DEFAULT_PHRASES.slice(), mode: 'grid' }, 1.0);
		if (!Array.isArray(_prefs.phrases)) {
			_prefs.phrases = DEFAULT_PHRASES.slice();
		}
		// Only text, however the browser's copy came to be
		_prefs.phrases = cleanPhrases(_prefs.phrases);
		if (_prefs.mode !== 'wheel') {
			_prefs.mode = 'grid';
		}
	}
	return _prefs;
}

function cleanPhrases(list) {
	return list
		.filter(phrase => typeof phrase === 'string' && phrase.length > 0)
		.map(phrase => phrase.slice(0, PHRASE_LENGTH_MAX))
		.slice(0, PHRASES_MAX);
}

function phrases() {
	return prefs().phrases;
}

function storePhrases(list) {
	const stored = prefs();
	stored.phrases = cleanPhrases(list);
	stored.save();
}

function mode() {
	return prefs().mode;
}

function toggleMode() {
	const stored = prefs();
	stored.mode = stored.mode === 'wheel' ? 'grid' : 'wheel';
	stored.save();
	_petal = null;
	render();
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

/**
 * The element with the keyboard focus, through shadow roots.
 */
function deepActive() {
	let el = typeof document !== 'undefined' ? document.activeElement : null;
	while (el && el.shadowRoot && el.shadowRoot.activeElement) {
		el = el.shadowRoot.activeElement;
	}
	return el;
}

/**
 * Whether an element takes typed text.
 *
 * @param {?Element} el
 * @return {boolean}
 */
function isTextField(el) {
	if (!el || el.nodeType !== 1 || el.disabled || el.readOnly) {
		return false;
	}
	if (el.matches(TEXT_FIELD)) {
		return true;
	}
	const editable = el.getAttribute('contenteditable');
	return el.isContentEditable === true || editable === '' || editable === 'true';
}

/**
 * The longest text the field takes (the chat sets maxLength on its element), 0: no limit.
 */
function maxLength() {
	const max = _field ? Number(_field.maxLength) : 0;
	return max > 0 ? max : 0;
}

/**
 * An editable element: type into a text node of its own, after what is
 * there. When there is only text, that text is the node's, and can be edited.
 */
function attachNode() {
	const hasElements = Array.from(_field.childNodes).some(node => node.nodeType === 1 && node.tagName !== 'BR');
	if (hasElements) {
		_prefix = _field.textContent;
		_node = document.createTextNode('');
	} else {
		_prefix = '';
		_node = document.createTextNode(_field.textContent);
		_field.textContent = '';
	}
	_field.appendChild(_node);
	_text = _node.data;
	_caret = _text.length;
}

function placeCaret() {
	if (_kind !== 'value') {
		return;
	}
	try {
		_field.setSelectionRange(_caret, _caret);
	} catch {
		// Number fields have no selection
	}
}

/**
 * Put the text in the field, as typing would.
 */
function write() {
	if (!_field) {
		return;
	}
	if (_kind === 'value') {
		_field.value = _text;
		placeCaret();
	} else {
		if (_node.parentNode !== _field) {
			// The window emptied the field meanwhile
			_field.appendChild(_node);
		}
		_node.data = _text;
	}
	_field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
	render();
}

/**
 * The player typed on a real keyboard as well: take the field's text as it is.
 */
function onFieldInput(event) {
	if (!event.isTrusted || !_open) {
		return;
	}
	if (_kind === 'value') {
		_text = _field.value;
		_caret = typeof _field.selectionStart === 'number' ? _field.selectionStart : _text.length;
	} else if (_node && _node.parentNode === _field) {
		_text = _node.data;
		_caret = Math.min(_caret, _text.length);
	} else {
		attachNode();
	}
	render();
}

function insert(str) {
	let add = _numeric ? str.replace(/[^0-9]/g, '') : str;
	if (!add) {
		return;
	}
	const max = maxLength();
	if (max) {
		const room = max - (_prefix.length + _text.length);
		if (room <= 0) {
			return;
		}
		add = add.slice(0, room);
	}
	_text = _text.slice(0, _caret) + add + _text.slice(_caret);
	_caret += add.length;
	write();
}

function backspace() {
	if (_caret <= 0) {
		return;
	}
	_text = _text.slice(0, _caret - 1) + _text.slice(_caret);
	_caret--;
	write();
}

function moveCaret(delta) {
	const caret = Math.max(0, Math.min(_text.length, _caret + delta));
	if (caret === _caret) {
		return;
	}
	_caret = caret;
	placeCaret();
	render();
}

function isLetter(c) {
	return c.toLocaleUpperCase() !== c.toLocaleLowerCase();
}

function shifted(c) {
	if (!_shift || !isLetter(c) || c === 'ß') {
		return c;
	}
	return c.toLocaleUpperCase();
}

function typeChar(c) {
	insert(shifted(c));
	if (_shift === 1 && isLetter(c)) {
		_shift = 0;
		render();
	}
}

function cycleShift() {
	_shift = (_shift + 1) % 3;
	render();
}

/**
 * Let go of the field: without the keyboard focus, the next Menu press
 * opens the chat (and the keyboard) again instead of sending.
 */
function release(field) {
	if (deepActive() !== field) {
		return;
	}
	// The chat would take the focus back a second later (restoreChatFocus): this is a request to leave
	field.dataset.skipRestoreFocus = '1';
	field.blur();
	delete field.dataset.skipRestoreFocus;
}

/**
 * Enter on the field, as a keyboard's: the chat sends, a box takes its answer.
 */
function pressEnter(field) {
	field.dispatchEvent(
		new KeyboardEvent('keydown', {
			key: 'Enter',
			code: 'Enter',
			keyCode: 13,
			which: 13,
			bubbles: true,
			cancelable: true,
			composed: true
		})
	);
}

// ---------------------------------------------------------------------------
// Pages and keys
// ---------------------------------------------------------------------------

function isGerman() {
	const language = (typeof navigator !== 'undefined' && navigator.language) || '';
	return /^de\b/i.test(language);
}

function charRows(page) {
	if (page === 'signs') {
		return ['1234567890', '!\'"#$%&*()', '-_=+/\\:;<>', '[]{}^~|,.?'];
	}
	if (page === 'accents') {
		return ['äöüßéèêëàá', 'âçñóòôúùûí', 'ìîïœæøå¿¡€'];
	}
	return isGerman()
		? ['1234567890', 'qwertzuiop', 'asdfghjkl@', 'yxcvbnm,.?']
		: ['1234567890', 'qwertyuiop', 'asdfghjkl@', 'zxcvbnm,.?'];
}

function nextPage() {
	const page = _page === 'phrases' ? _lastPage : _page;
	return PAGE_ORDER[(PAGE_ORDER.indexOf(page) + 1) % PAGE_ORDER.length];
}

function onWheel() {
	return mode() === 'wheel' && _page !== 'phrases';
}

/**
 * The keys of the grid (or the phrase list) row by row; every row is
 * ROW_UNITS keys wide.
 */
function currentRows() {
	if (_page === 'phrases') {
		const rows = phrases().map((text, index) => [
			{ action: 'phrase', index, label: text, width: 8.5 },
			{ action: 'delete', index, label: '✕', width: 1.5 }
		]);
		// A password is never kept: no Save text in a password field
		rows.push(
			_password
				? [
						{ action: 'letters', label: PAGE_LABEL[_lastPage], width: 5 },
						{ action: 'done', label: 'Done', width: 5 }
					]
				: [
						{ action: 'letters', label: PAGE_LABEL[_lastPage], width: 3 },
						{ action: 'save', label: 'Save text', width: 4 },
						{ action: 'done', label: 'Done', width: 3 }
					]
		);
		return rows;
	}
	const rows = charRows(_page).map(chars =>
		Array.from(chars).map(value => ({ action: 'char', value, label: value, width: 1 }))
	);
	rows.push([
		{ action: 'shift', label: '⇧', width: 1.5 },
		{ action: 'page', label: PAGE_LABEL[nextPage()], width: 1.5 },
		{ action: 'phrases', label: '★', width: 1.5 },
		{ action: 'space', label: 'Space', width: 2.5 },
		{ action: 'backspace', label: '⌫', width: 1.5 },
		{ action: 'done', label: 'Done', width: 1.5 }
	]);
	return rows;
}

function currentKey() {
	const rows = currentRows();
	const row = rows[Math.min(_row, rows.length - 1)];
	return row[Math.min(_col, row.length - 1)];
}

function centerOf(row, col) {
	let x = 0;
	for (let i = 0; i < col; i++) {
		x += row[i].width;
	}
	return x + row[col].width / 2;
}

/**
 * The key of a row nearest to a point along it.
 */
function nearest(row, x) {
	let best = 0;
	for (let i = 1; i < row.length; i++) {
		if (Math.abs(centerOf(row, i) - x) < Math.abs(centerOf(row, best) - x)) {
			best = i;
		}
	}
	return best;
}

/**
 * The next key that way, wrapping around.
 */
function moveFocus(direction) {
	const rows = currentRows();
	_row = Math.min(_row, rows.length - 1);
	const row = rows[_row];
	_col = Math.min(_col, row.length - 1);
	if (direction === 'left' || direction === 'right') {
		_col = (_col + (direction === 'right' ? 1 : -1) + row.length) % row.length;
	} else {
		const x = centerOf(row, _col);
		_row = (_row + (direction === 'down' ? 1 : -1) + rows.length) % rows.length;
		_col = nearest(rows[_row], x);
	}
	render();
}

function setPage(page) {
	if (page === _page) {
		return;
	}
	const rows = currentRows();
	const row = rows[Math.min(_row, rows.length - 1)];
	const x = centerOf(row, Math.min(_col, row.length - 1));
	if (page === 'phrases') {
		_lastPage = _page;
		_page = page;
		_row = 0;
		_col = 0;
	} else {
		_page = page;
		const next = currentRows();
		_row = Math.min(_row, next.length - 1);
		_col = nearest(next[_row], x);
	}
	render();
}

function usePhrase(index) {
	const phrase = phrases()[index];
	if (phrase === undefined) {
		return;
	}
	setPage(_lastPage);
	insert(phrase);
	if (mode() === 'grid') {
		// A second A enters it
		const rows = currentRows();
		_row = rows.length - 1;
		_col = rows[_row].findIndex(key => key.action === 'done');
		render();
	}
}

function deletePhrase(index) {
	const list = phrases().slice();
	list.splice(index, 1);
	storePhrases(list);
	const rows = currentRows();
	_row = Math.min(_row, rows.length - 1);
	_col = Math.min(_col, rows[_row].length - 1);
	render();
}

/**
 * Keep the typed text as a phrase, first in the list.
 */
function saveText() {
	if (_password || !_text.trim()) {
		return;
	}
	storePhrases([_text].concat(phrases().filter(phrase => phrase !== _text)));
	render();
}

function activate(key) {
	switch (key.action) {
		case 'char':
			typeChar(key.value);
			break;
		case 'shift':
			cycleShift();
			break;
		case 'page':
			setPage(nextPage());
			break;
		case 'phrases':
			setPage('phrases');
			break;
		case 'letters':
			setPage(_lastPage);
			break;
		case 'space':
			insert(' ');
			break;
		case 'backspace':
			backspace();
			break;
		case 'done':
			done();
			break;
		case 'phrase':
			usePhrase(key.index);
			break;
		case 'delete':
			deletePhrase(key.index);
			break;
		case 'save':
			saveText();
			break;
	}
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/**
 * Keys pressed with the mouse or a touch screen. The press never takes the
 * focus from the field.
 */
function onPointerDown(event) {
	event.preventDefault();
	if (!_open || !event.target.closest) {
		return;
	}
	const key = event.target.closest('.jk-key');
	if (key) {
		_row = Number(key.dataset.row);
		_col = Number(key.dataset.col);
		activate(currentKey());
		return;
	}
	const letter = event.target.closest('.jk-letter');
	if (letter) {
		typeChar(letter.dataset.char);
	}
}

function ensurePanel() {
	if (_panel && _panel.parentNode) {
		return _panel;
	}
	_panel = document.createElement('div');
	_panel.className = 'joystick-keyboard';
	Object.assign(_panel.style, {
		position: 'fixed',
		left: '50%',
		transform: 'translateX(-50%)',
		zIndex: 10002,
		background: 'rgba(20, 20, 24, 0.95)',
		border: '1px solid #555',
		borderRadius: '8px',
		padding: '8px',
		fontFamily: 'sans-serif',
		color: '#eee',
		userSelect: 'none',
		boxShadow: '0 4px 12px rgba(0, 0, 0, 0.6)'
	});
	_panel.addEventListener('pointerdown', onPointerDown);
	_panel.addEventListener('mousedown', event => event.preventDefault());
	document.body.appendChild(_panel);
	return _panel;
}

function span(text, style) {
	const el = document.createElement('span');
	el.textContent = text;
	Object.assign(el.style, style || {});
	return el;
}

function renderPreview() {
	const box = document.createElement('div');
	box.className = 'jk-preview';
	Object.assign(box.style, {
		background: '#000',
		border: '1px solid #444',
		borderRadius: '4px',
		padding: '4px 6px',
		marginBottom: '6px',
		minHeight: '18px',
		width: WIDTH - 14 + 'px',
		whiteSpace: 'pre',
		overflow: 'hidden',
		fontSize: '14px'
	});
	const shown = _password ? '•'.repeat(_text.length) : _text;
	if (_prefix) {
		box.appendChild(span(_prefix, { color: '#888' }));
	}
	box.appendChild(span(shown.slice(0, _caret)));
	const caret = span('', { borderLeft: '2px solid #ffd740', marginLeft: '-1px' });
	caret.className = 'jk-caret';
	box.appendChild(caret);
	box.appendChild(span(shown.slice(_caret)));
	return box;
}

function renderGrid() {
	const grid = document.createElement('div');
	grid.className = 'jk-keys';
	Object.assign(grid.style, {
		display: 'grid',
		gridTemplateColumns: `repeat(${ROW_UNITS * 2}, ${(UNIT - GAP) / 2}px)`,
		columnGap: GAP + 'px',
		rowGap: GAP + 'px'
	});
	const rows = currentRows();
	// The phrases scroll: the rows around the focused one, and the buttons under them
	let first = 0;
	let last = rows.length - 1;
	if (_page === 'phrases' && rows.length - 1 > PHRASES_SHOWN) {
		const focus = Math.min(_row, rows.length - 2);
		first = Math.max(0, Math.min(focus - 2, rows.length - 1 - PHRASES_SHOWN));
		last = first + PHRASES_SHOWN - 1;
	}
	rows.forEach((row, r) => {
		if ((r < first || r > last) && r !== rows.length - 1) {
			return;
		}
		row.forEach((key, c) => {
			const el = document.createElement('div');
			el.className = 'jk-key';
			el.dataset.row = String(r);
			el.dataset.col = String(c);
			el.textContent = key.action === 'char' ? shifted(key.label) : key.label;
			const focused = r === _row && c === _col;
			const lit = key.action === 'shift' && _shift > 0;
			Object.assign(el.style, {
				gridColumn: `span ${key.width * 2}`,
				height: '26px',
				lineHeight: '26px',
				textAlign: key.action === 'phrase' ? 'left' : 'center',
				padding: key.action === 'phrase' ? '0 6px' : '0',
				overflow: 'hidden',
				textOverflow: 'ellipsis',
				whiteSpace: 'nowrap',
				fontSize: '13px',
				borderRadius: '3px',
				cursor: 'pointer',
				background: focused ? '#5a4a10' : '#333',
				border: focused ? '1px solid #ffd740' : '1px solid #666',
				color: lit ? '#ffd740' : '#eee',
				textDecoration: lit && _shift === 2 ? 'underline' : 'none'
			});
			if (focused) {
				el.classList.add('jk-focused');
			}
			grid.appendChild(el);
		});
	});
	if (_page === 'phrases' && rows.length === 1) {
		const empty = document.createElement('div');
		empty.textContent = 'No phrases yet: type one, then Save text.';
		Object.assign(empty.style, { gridColumn: `span ${ROW_UNITS * 2}`, color: '#888', fontSize: '12px' });
		grid.insertBefore(empty, grid.firstChild);
	}
	return grid;
}

function renderWheel() {
	const size = 236;
	const radius = 84;
	const petalSize = 60;
	const wheel = document.createElement('div');
	wheel.className = 'jk-wheel';
	Object.assign(wheel.style, { position: 'relative', width: size + 'px', height: size + 'px', margin: '0 auto' });
	const places = [
		{ left: '50%', top: '2px', transform: 'translateX(-50%)' },
		{ right: '5px', top: '50%', transform: 'translateY(-50%)' },
		{ left: '50%', bottom: '2px', transform: 'translateX(-50%)' },
		{ left: '5px', top: '50%', transform: 'translateY(-50%)' }
	];
	WHEEL[_page].forEach((group, i) => {
		const angle = (i * Math.PI) / 4;
		const petal = document.createElement('div');
		petal.className = 'jk-petal';
		const selected = i === _petal;
		if (selected) {
			petal.classList.add('jk-selected');
		}
		Object.assign(petal.style, {
			position: 'absolute',
			left: size / 2 + radius * Math.sin(angle) - petalSize / 2 + 'px',
			top: size / 2 - radius * Math.cos(angle) - petalSize / 2 + 'px',
			width: petalSize + 'px',
			height: petalSize + 'px',
			borderRadius: '50%',
			background: selected ? '#5a4a10' : '#333',
			border: selected ? '2px solid #ffd740' : '1px solid #666',
			boxSizing: 'border-box'
		});
		Array.from(group).forEach((c, slot) => {
			const letter = span(shifted(c), {
				position: 'absolute',
				fontSize: '14px',
				fontWeight: 'bold',
				cursor: 'pointer',
				color: selected ? SLOT_COLOR[slot] : '#ddd',
				...places[slot]
			});
			letter.className = 'jk-letter';
			letter.dataset.char = c;
			petal.appendChild(letter);
		});
		wheel.appendChild(petal);
	});
	const n = ButtonMap.nameOf;
	const middle = span(n(BTN.Y) + ' space\n' + n(BTN.X) + ' ⌫\n' + n(BTN.B) + ' close', {
		position: 'absolute',
		left: '50%',
		top: '50%',
		transform: 'translate(-50%, -50%)',
		whiteSpace: 'pre',
		textAlign: 'center',
		fontSize: '10px',
		color: '#999'
	});
	wheel.appendChild(middle);
	return wheel;
}

function renderHints() {
	const n = ButtonMap.nameOf;
	const wheel = onWheel();
	const parts = [
		wheel ? ['Stick + ' + [n(BTN.Y), n(BTN.B), n(BTN.A), n(BTN.X)].join('/'), 'Letter'] : [n(BTN.A), 'Type'],
		[n(BTN.X), '⌫'],
		[n(BTN.Y), 'Space'],
		[n(BTN.LB) + '/' + n(BTN.RB), 'Caret'],
		[n(BTN.LT), 'Shift'],
		[n(BTN.RT), 'Page'],
		[n(BTN.VIEW), 'Phrases'],
		[n(BTN.RS), mode() === 'wheel' ? 'Grid' : 'Wheel'],
		[n(BTN.MENU), 'Done'],
		[n(BTN.B), 'Close']
	];
	const bar = document.createElement('div');
	bar.className = 'jk-hints';
	Object.assign(bar.style, {
		marginTop: '6px',
		fontSize: '11px',
		color: '#bbb',
		width: WIDTH + 'px',
		lineHeight: '15px'
	});
	parts.forEach(([key, text], i) => {
		if (i) {
			bar.appendChild(document.createTextNode('  ·  '));
		}
		bar.appendChild(span(key, { color: '#ffd740', fontWeight: 'bold' }));
		bar.appendChild(document.createTextNode(' ' + text));
	});
	return bar;
}

function render() {
	if (!_open) {
		return;
	}
	const panel = ensurePanel();
	panel.style.bottom = Overlay.bottomAboveHud() + 'px';
	panel.textContent = '';
	const preview = renderPreview();
	panel.appendChild(preview);
	panel.appendChild(onWheel() ? renderWheel() : renderGrid());
	panel.appendChild(renderHints());
	// The caret in view
	const caret = preview.querySelector('.jk-caret');
	if (caret) {
		preview.scrollLeft = Math.max(0, caret.offsetLeft - preview.clientWidth + 24);
	}
}

// ---------------------------------------------------------------------------
// Buttons and sticks
// ---------------------------------------------------------------------------

/**
 * A button press while the keyboard is open.
 *
 * @param {number} button logical button
 * @return {boolean} whether holding it repeats what it did
 */
function press(button) {
	switch (button) {
		case BTN.LB:
			moveCaret(-1);
			return true;
		case BTN.RB:
			moveCaret(1);
			return true;
		case BTN.LT:
			cycleShift();
			return false;
		case BTN.RT:
			// From the phrases, back to the page they were opened from
			setPage(_page === 'phrases' ? _lastPage : nextPage());
			return false;
		case BTN.VIEW:
			setPage(_page === 'phrases' ? _lastPage : 'phrases');
			return false;
		case BTN.MENU:
			done();
			return false;
		case BTN.RS:
			toggleMode();
			return false;
	}

	// The wheel: with the stick on a group, the face buttons type its letters
	if (onWheel()) {
		if (FACE_SLOT[button] !== undefined && _petal !== null) {
			typeChar(WHEEL[_page][_petal][FACE_SLOT[button]]);
			return false;
		}
		if (button === BTN.LEFT || button === BTN.RIGHT) {
			moveCaret(button === BTN.RIGHT ? 1 : -1);
			return true;
		}
	} else if (DIRECTIONS[button]) {
		moveFocus(DIRECTIONS[button]);
		return true;
	} else if (button === BTN.A) {
		activate(currentKey());
		return false;
	}

	switch (button) {
		case BTN.B:
			close();
			return false;
		case BTN.X:
			backspace();
			return true;
		case BTN.Y:
			insert(' ');
			return false;
	}
	return false;
}

/**
 * The stick that walks (the left one, the right one with the sticks swapped).
 */
function walkStick(gp) {
	const axes = gp && gp.axes ? StickFilter.filterAxes(gp.axes) : [];
	const swapped = ControlsSettings.joyReverseStick && axes.length >= 4;
	return { x: axes[swapped ? 2 : 0] || 0, y: axes[swapped ? 3 : 1] || 0 };
}

/**
 * The wheel: the stick picks the group it points at.
 */
function pointWheel(gp) {
	const { x, y } = walkStick(gp);
	let petal = null;
	if (Math.hypot(x, y) >= STICK_PUSH) {
		// 0 at the top, clockwise (screen y grows downwards)
		const angle = Math.atan2(x, -y);
		petal = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
	}
	if (petal !== _petal) {
		_petal = petal;
		render();
	}
}

/**
 * The grid: the stick moves between keys as the D-pad does.
 */
function moveWithStick(gp, now) {
	const { x, y } = walkStick(gp);
	let direction = null;
	if (Math.max(Math.abs(x), Math.abs(y)) >= STICK_PUSH) {
		if (Math.abs(x) > Math.abs(y)) {
			direction = x > 0 ? 'right' : 'left';
		} else {
			direction = y > 0 ? 'down' : 'up';
		}
	}
	if (_stickDir === undefined) {
		// A push already there when the keyboard opened (walking) moves nothing until let go
		_stickDir = direction;
		_stickNextAt = Infinity;
		return;
	}
	if (direction !== _stickDir) {
		_stickDir = direction;
		if (direction) {
			moveFocus(direction);
			_stickNextAt = now + REPEAT_DELAY_MS;
		}
		return;
	}
	if (direction && now >= _stickNextAt) {
		moveFocus(direction);
		_stickNextAt = now + REPEAT_EVERY_MS;
	}
}

/**
 * One animation frame while the keyboard is open (JoystickUIFocus).
 *
 * @param {Gamepad} gp
 * @param {{pressed: Array<number>}} events logical buttons pressed since the last frame
 * @param {Array<boolean>} down logical buttons down now
 * @param {number} now
 */
function frame(gp, events, down, now) {
	if (!_open) {
		return;
	}
	const host = _field && _field.isConnected ? _field.getRootNode().host : null;
	if (!_field || !_field.isConnected || (host && host.style.display === 'none')) {
		// The window closed under it (an NPC's question timed out)
		finish();
		return;
	}
	// The stick first: a group picked and a button pressed in the same frame types from that group
	if (onWheel()) {
		pointWheel(gp);
		_stickDir = undefined;
	} else {
		moveWithStick(gp, now);
	}
	events.pressed.forEach(button => {
		if (_open && press(button)) {
			_nextAt.set(button, now + REPEAT_DELAY_MS);
		}
	});
	_nextAt.forEach((at, button) => {
		if (!_open || !down[button]) {
			_nextAt.delete(button);
		} else if (now >= at) {
			if (press(button)) {
				_nextAt.set(button, now + REPEAT_EVERY_MS);
			} else {
				_nextAt.delete(button);
			}
		}
	});
}

// ---------------------------------------------------------------------------
// Open and close
// ---------------------------------------------------------------------------

/**
 * Open the keyboard on a field.
 *
 * @param {Element} field
 * @return {boolean} false when the element takes no text
 */
function open(field) {
	if (!isTextField(field)) {
		return false;
	}
	if (_open) {
		close();
	}
	_field = field;
	_kind = field.matches(TEXT_FIELD) ? 'value' : 'editable';
	_numeric = field.matches(NUMBER_FIELD) || !!field.closest('#inputbox.number');
	_password = field.matches('input[type="password"]');
	if (_kind === 'value') {
		_node = null;
		_prefix = '';
		_text = field.value || '';
		_caret = _text.length;
	} else {
		attachNode();
	}
	_page = _numeric ? 'signs' : 'letters';
	_lastPage = _page;
	_shift = 0;
	// Digits on the first row, letters from the second
	_row = _numeric ? 0 : 1;
	_col = 0;
	_petal = null;
	_nextAt = new Map();
	_stickDir = undefined;
	_open = true;
	field.addEventListener('input', onFieldInput);
	if (typeof field.focus === 'function' && deepActive() !== field) {
		field.focus();
	}
	render();
	return true;
}

/**
 * Close the keyboard: the field keeps its text and hears `change`.
 */
function finish() {
	if (!_open) {
		return;
	}
	_open = false;
	const field = _field;
	_field = null;
	_node = null;
	_nextAt = new Map();
	_stickDir = undefined;
	_petal = null;
	if (_panel && _panel.parentNode) {
		_panel.parentNode.removeChild(_panel);
	}
	_panel = null;
	if (field) {
		field.removeEventListener('input', onFieldInput);
		if (_kind === 'value' && field.isConnected) {
			field.dispatchEvent(new Event('change', { bubbles: true }));
		}
	}
}

/**
 * Done (Menu): the text is entered, as Enter enters it. A text area takes
 * Enter as a new line, so there it is only closed.
 */
function done() {
	const field = _field;
	finish();
	if (!field || !field.isConnected) {
		return;
	}
	if (field.tagName !== 'TEXTAREA') {
		if (deepActive() !== field && typeof field.focus === 'function') {
			field.focus();
		}
		pressEnter(field);
	}
	if (field.isConnected) {
		release(field);
	}
}

/**
 * Close (B): the text stays in the field, nothing is entered.
 */
function close() {
	const field = _field;
	finish();
	if (field && field.isConnected) {
		release(field);
	}
}

/**
 * The keyboard for a field that has just taken the focus: Menu (Enter)
 * opened the chat.
 *
 * @param {?Element} before the field with the focus before
 * @return {boolean} whether the keyboard opened
 */
function openIfFocused(before) {
	const field = deepActive();
	if (!field || field === before || !isTextField(field)) {
		return false;
	}
	return open(field);
}

/**
 * The text field with the focus now, if any.
 */
function focusedField() {
	const el = deepActive();
	return isTextField(el) ? el : null;
}

export default {
	open,
	close,
	done,
	frame,
	isOpen() {
		return _open;
	},
	isTextField,
	focusedField,
	openIfFocused,
	/**
	 * What is being typed, for tests and the settings window.
	 */
	getState() {
		return {
			field: _field,
			text: _text,
			caret: _caret,
			page: _page,
			shift: _shift,
			mode: mode(),
			petal: _petal,
			key: _open && !onWheel() ? currentKey() : null
		};
	},
	/**
	 * Saved phrases, newest first.
	 */
	phrases() {
		return phrases().slice();
	},
	/**
	 * Read the phrases and the way to type from the browser again (tests).
	 */
	reload() {
		_prefs = null;
	}
};
