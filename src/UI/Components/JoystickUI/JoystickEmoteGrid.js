/**
 * UI/Components/JoystickUI/JoystickEmoteGrid.js
 *
 * Emotes with the gamepad: hold Menu to open a grid of every emote, in the
 * Emoticons window's order, 30 to a page, with the player's favourites in a
 * row on top.
 *
 *   D-pad   move the selection (held: repeats)
 *   LB/RB   previous / next page
 *   A       play the emote and close
 *   X       play the emote, stay open
 *   Y       pin / unpin as favourite
 *   B, Menu close
 *
 * The emote goes to the server as the chat command would send it
 * (CZ_REQ_EMOTION), so a half-typed chat line is left alone. While the
 * grid is open it has the buttons; the left stick still walks.
 *
 * Buttons are logical (JoystickButtonMap), so a remap carries over.
 */

import EmotionsDB from 'DB/Emotions.js';
import Client from 'Core/Client.js';
import Entity from 'Renderer/Entity/Entity.js';
import SpriteRenderer from 'Renderer/SpriteRenderer.js';
import Network from 'Network/NetworkManager.js';
import PACKET from 'Network/PacketStructure.js';
import ControlsSettings from 'Preferences/Controls.js';
import ButtonMap from './JoystickButtonMap.js';

const COLS = 6;
const ROWS_PER_PAGE = 5;
const PER_PAGE = COLS * ROWS_PER_PAGE;
const MAX_FAVORITES = COLS;
const CELL = 40;

const REPEAT_DELAY_MS = 350; // a held D-pad starts repeating after this
const REPEAT_EVERY_MS = 120;

const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, MENU: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

let _root = null;
let _open = false;
let _page = 0;
let _row = 0; // 0 is the favourites row when there are favourites
let _col = 0;
let _repeatButton = -1;
let _repeatAt = 0;

let _action = null;
let _sprite = null;
let _loading = false;
const _entity = new Entity();

/**
 * Sprite indices of every emote, in the Emoticons window's order.
 */
function allEmotes() {
	const list = [];
	const count = Object.keys(EmotionsDB.order).length;
	for (let i = 0; i < count; i++) {
		if (EmotionsDB.order[i] !== undefined) {
			list.push(EmotionsDB.order[i]);
		}
	}
	return list;
}

function pageCount() {
	return Math.max(1, Math.ceil(allEmotes().length / PER_PAGE));
}

function getFavorites() {
	const list = ControlsSettings.joyEmoteFavorites;
	return Array.isArray(list) ? list.filter(emo => EmotionsDB.names[emo] !== undefined).slice(0, MAX_FAVORITES) : [];
}

/**
 * The grid as rows of sprite indices: the favourites (if any), then the
 * current page.
 */
function getRows() {
	const rows = [];
	const favorites = getFavorites();
	if (favorites.length) {
		rows.push(favorites);
	}
	const page = allEmotes().slice(_page * PER_PAGE, (_page + 1) * PER_PAGE);
	for (let i = 0; i < page.length; i += COLS) {
		rows.push(page.slice(i, i + COLS));
	}
	return rows;
}

function hasFavoriteRow() {
	return getFavorites().length > 0;
}

function clampSelection() {
	const rows = getRows();
	if (rows.length === 0) {
		_row = 0;
		_col = 0;
		return;
	}
	_row = Math.max(0, Math.min(_row, rows.length - 1));
	_col = Math.max(0, Math.min(_col, rows[_row].length - 1));
}

/**
 * Sprite index of the selected emote, or -1.
 */
function getSelected() {
	const rows = getRows();
	const row = rows[_row];
	return row && row[_col] !== undefined ? row[_col] : -1;
}

/**
 * Send an emote, as typing its /command does.
 *
 * @param {number} emo sprite index
 */
function play(emo) {
	const name = EmotionsDB.names[emo];
	if (name === undefined || !(name in EmotionsDB.commands)) {
		return;
	}
	const pkt = new PACKET.CZ.REQ_EMOTION();
	pkt.type = EmotionsDB.commands[name];
	Network.sendPacket(pkt);
}

function toggleFavorite(emo) {
	if (emo < 0) {
		return;
	}
	const favorites = getFavorites();
	const at = favorites.indexOf(emo);
	if (at !== -1) {
		favorites.splice(at, 1);
	} else {
		if (favorites.length >= MAX_FAVORITES) {
			favorites.pop();
		}
		favorites.unshift(emo);
	}

	const hadRow = hasFavoriteRow();
	ControlsSettings.joyEmoteFavorites = favorites;
	ControlsSettings.save();

	// The page rows moved down (or up) by one: stay on the same emote
	if (!hadRow && favorites.length) {
		_row++;
	} else if (hadRow && !favorites.length) {
		_row = Math.max(0, _row - 1);
	}
	clampSelection();
}

function move(direction) {
	const rows = getRows();
	if (rows.length === 0) {
		return;
	}
	switch (direction) {
		case 'up':
			_row = (_row - 1 + rows.length) % rows.length;
			break;
		case 'down':
			_row = (_row + 1) % rows.length;
			break;
		case 'left':
			_col = (_col - 1 + rows[_row].length) % rows[_row].length;
			return;
		case 'right':
			_col = (_col + 1) % rows[_row].length;
			return;
	}
	_col = Math.min(_col, rows[_row].length - 1);
}

function changePage(delta) {
	const pages = pageCount();
	_page = (_page + delta + pages) % pages;
	clampSelection();
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function isActive() {
	return _open;
}

/**
 * A fresh press, or a held D-pad direction due to repeat.
 */
function fires(buttons, index, repeat) {
	const state = buttons[index];
	if (state === 'pressed') {
		if (repeat) {
			_repeatButton = index;
			_repeatAt = Date.now() + REPEAT_DELAY_MS;
		}
		return true;
	}
	if (repeat && state === 'holding' && _repeatButton === index && Date.now() >= _repeatAt) {
		_repeatAt = Date.now() + REPEAT_EVERY_MS;
		return true;
	}
	return false;
}

/**
 * Buttons while the grid is open (JoystickButtonInput, every poll).
 *
 * @param {Array<string>} buttons logical button states
 */
function handleInput(buttons) {
	if (!_open) {
		return;
	}

	if (_repeatButton !== -1 && buttons[_repeatButton] === 'unpressed') {
		_repeatButton = -1;
	}

	if (fires(buttons, BTN.B, false) || fires(buttons, BTN.MENU, false)) {
		close();
		return;
	}
	if (fires(buttons, BTN.A, false)) {
		play(getSelected());
		close();
		return;
	}
	if (fires(buttons, BTN.X, false)) {
		play(getSelected());
	} else if (fires(buttons, BTN.Y, false)) {
		toggleFavorite(getSelected());
	} else if (fires(buttons, BTN.LB, false)) {
		changePage(-1);
	} else if (fires(buttons, BTN.RB, false)) {
		changePage(1);
	} else if (fires(buttons, BTN.UP, true)) {
		move('up');
	} else if (fires(buttons, BTN.DOWN, true)) {
		move('down');
	} else if (fires(buttons, BTN.LEFT, true)) {
		move('left');
	} else if (fires(buttons, BTN.RIGHT, true)) {
		move('right');
	} else {
		return;
	}
	render();
}

function open() {
	_open = true;
	_repeatButton = -1;
	// Start on the first favourite, else the first emote of the page
	_row = 0;
	_col = 0;
	clampSelection();
	loadSprites();
	render();
}

function close() {
	_open = false;
	_repeatButton = -1;
	if (_root) {
		_root.style.display = 'none';
	}
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function loadSprites() {
	if (_action || _loading) {
		return;
	}
	_loading = true;
	try {
		Client.loadFiles(
			['data/sprite/\xc0\xcc\xc6\xd1\xc6\xae/emotion.act', 'data/sprite/\xc0\xcc\xc6\xd1\xc6\xae/emotion.spr'],
			(act, spr) => {
				_action = act;
				_sprite = spr;
				_loading = false;
				render();
			}
		);
	} catch {
		_loading = false;
	}
}

function getRoot() {
	if (_root && _root.parentNode) {
		return _root;
	}
	if (typeof document === 'undefined' || !document.body) {
		return null;
	}
	_root = document.createElement('div');
	_root.className = 'joystick-emote-grid';
	Object.assign(_root.style, {
		position: 'absolute',
		left: '50%',
		top: '45%',
		transform: 'translate(-50%, -50%)',
		zIndex: 1001,
		pointerEvents: 'none',
		background: 'rgba(0, 0, 0, 0.75)',
		borderRadius: '8px',
		padding: '8px',
		fontFamily: 'sans-serif',
		fontSize: '12px',
		color: '#ddd',
		display: 'none'
	});
	document.body.appendChild(_root);
	return _root;
}

/**
 * Draw one emote into a cell, as the Emoticons window does.
 */
function drawEmote(canvas, emo) {
	if (!_action || !_sprite || !_action.actions[emo]) {
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = '#bbb';
		ctx.font = '11px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('/' + EmotionsDB.names[emo], CELL / 2, CELL / 2);
		return;
	}
	const animations = _action.actions[emo].animations;
	const animation = animations[Math.floor(animations.length / 5)];
	const layers = animation.layers;
	if (!layers.length) {
		return;
	}
	SpriteRenderer.bind2DContext(canvas.getContext('2d'), CELL / 2 - layers[0].pos[0], CELL - layers[0].pos[1]);
	for (let i = 0; i < layers.length; ++i) {
		_entity.renderLayer(layers[i], _sprite, _sprite, 1.0, [0, 0], false);
	}
}

function render() {
	const root = getRoot();
	if (!root) {
		return;
	}
	if (!_open) {
		root.style.display = 'none';
		return;
	}

	root.textContent = '';
	root.style.display = 'block';

	const rows = getRows();
	const favoriteRow = hasFavoriteRow();
	const favorites = getFavorites();

	rows.forEach((row, r) => {
		const line = document.createElement('div');
		Object.assign(line.style, { display: 'flex', gap: '4px', marginBottom: '4px' });
		if (favoriteRow && r === 0) {
			line.style.paddingBottom = '4px';
			line.style.borderBottom = '1px solid rgba(255, 215, 64, 0.5)';
		}
		row.forEach((emo, c) => {
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = CELL;
			canvas.dataset.emote = String(emo);
			const selected = r === _row && c === _col;
			Object.assign(canvas.style, {
				width: CELL + 'px',
				height: CELL + 'px',
				borderRadius: '4px',
				background: selected ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.06)',
				outline: selected ? '2px solid #fff' : favorites.includes(emo) ? '1px solid #ffd740' : 'none'
			});
			if (selected) {
				canvas.classList.add('selected');
			}
			try {
				drawEmote(canvas, emo);
			} catch {
				// A frame the sprite does not have: leave the cell blank
			}
			line.appendChild(canvas);
		});
		root.appendChild(line);
	});

	const selected = getSelected();
	const info = document.createElement('div');
	info.className = 'info';
	info.style.marginTop = '4px';
	info.style.textAlign = 'center';
	info.textContent =
		(selected >= 0 ? '/' + EmotionsDB.names[selected] : '') + '  ·  page ' + (_page + 1) + '/' + pageCount();
	root.appendChild(info);

	const hint = document.createElement('div');
	hint.style.marginTop = '2px';
	hint.style.textAlign = 'center';
	hint.style.color = '#999';
	hint.style.fontSize = '11px';
	// Worded with the current mapping
	const n = ButtonMap.nameOf;
	hint.textContent =
		n(BTN.A) +
		' play · ' +
		n(BTN.X) +
		' play, stay · ' +
		n(BTN.Y) +
		' favourite · ' +
		n(BTN.LB) +
		'/' +
		n(BTN.RB) +
		' page · ' +
		n(BTN.B) +
		' close';
	root.appendChild(hint);
}

function dispose() {
	close();
	if (_root && _root.parentNode) {
		_root.parentNode.removeChild(_root);
	}
	_root = null;
}

export default {
	open,
	close,
	isActive,
	handleInput,
	getSelected,
	getRows,
	dispose
};
