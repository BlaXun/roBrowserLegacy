/**
 * UI/Components/JoystickUI/JoystickFocusOverlay.js
 *
 * What menu navigation draws: a ring around the focused element (yellow,
 * blue while something is carried), and a bar of button hints ("A Equip ·
 * Y Info · B Close") at the bottom of the screen, above the gamepad HUD.
 * Both are in the page, above every window, and never take the mouse.
 */

import ButtonMap from './JoystickButtonMap.js';

const Z_INDEX = 10000;
const RING_PAD = 2; // px between the element and the ring
const HINT_GAP = 6; // px between the hint bar and the HUD under it

/**
 * The ring's look: focusing, or carrying something to put down.
 */
const RING_STYLES = {
	focus: {
		borderColor: '#ffd740',
		boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.6), 0 0 6px rgba(255, 215, 64, 0.8)'
	},
	carry: {
		borderColor: '#4fc3f7',
		boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.6), 0 0 8px rgba(79, 195, 247, 0.9)'
	}
};

let _ring = null;
let _hints = null;
let _ringKey = '';
let _hintsKey = '';

function getRing() {
	if (_ring && _ring.parentNode) {
		return _ring;
	}
	if (typeof document === 'undefined' || !document.body) {
		return null;
	}
	_ring = document.createElement('div');
	_ring.className = 'joystick-focus-ring';
	Object.assign(_ring.style, {
		position: 'fixed',
		zIndex: Z_INDEX,
		pointerEvents: 'none',
		boxSizing: 'border-box',
		border: '2px solid #ffd740',
		borderRadius: '4px',
		boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.6), 0 0 6px rgba(255, 215, 64, 0.8)',
		transition: 'left 60ms ease-out, top 60ms ease-out, width 60ms ease-out, height 60ms ease-out',
		display: 'none'
	});
	document.body.appendChild(_ring);
	_ringKey = '';
	return _ring;
}

function getHints() {
	if (_hints && _hints.parentNode) {
		return _hints;
	}
	if (typeof document === 'undefined' || !document.body) {
		return null;
	}
	_hints = document.createElement('div');
	_hints.className = 'joystick-focus-hints';
	Object.assign(_hints.style, {
		position: 'fixed',
		left: '50%',
		transform: 'translateX(-50%)',
		zIndex: Z_INDEX,
		pointerEvents: 'none',
		background: 'rgba(0, 0, 0, 0.75)',
		borderRadius: '6px',
		padding: '3px 10px',
		fontFamily: 'sans-serif',
		fontSize: '12px',
		color: '#ddd',
		whiteSpace: 'nowrap',
		display: 'none'
	});
	document.body.appendChild(_hints);
	_hintsKey = '';
	return _hints;
}

/**
 * Put the ring around a rectangle on screen.
 *
 * @param {{left: number, top: number, width: number, height: number}} rect
 * @param {string} [mode] 'focus' (default) or 'carry'
 */
function showRing(rect, mode = 'focus') {
	const ring = getRing();
	if (!ring || !rect) {
		return;
	}
	const look = RING_STYLES[mode] || RING_STYLES.focus;
	const left = Math.round(rect.left - RING_PAD);
	const top = Math.round(rect.top - RING_PAD);
	const width = Math.round(rect.width + RING_PAD * 2);
	const height = Math.round(rect.height + RING_PAD * 2);
	const key = left + ',' + top + ',' + width + ',' + height + ',' + mode;
	if (key === _ringKey && ring.style.display !== 'none') {
		return;
	}
	_ringKey = key;
	ring.style.left = left + 'px';
	ring.style.top = top + 'px';
	ring.style.width = width + 'px';
	ring.style.height = height + 'px';
	ring.style.borderColor = look.borderColor;
	ring.style.boxShadow = look.boxShadow;
	ring.dataset.mode = mode;
	ring.style.display = 'block';
}

function hideRing() {
	if (_ring) {
		_ring.style.display = 'none';
	}
}

/**
 * The bar's distance from the bottom: above the gamepad HUD when it shows.
 */
function hintsBottom() {
	const hud = document.getElementById('JoystickUI');
	if (hud && hud.style.display !== 'none') {
		const rect = hud.getBoundingClientRect();
		if (rect.height > 0) {
			return Math.max(8, window.innerHeight - rect.top + HINT_GAP);
		}
	}
	return 8;
}

/**
 * Show the hint bar.
 *
 * @param {Array<Array>} entries [button, text]: a logical button (worded with the current
 *   mapping), a list of them, or a string (D-pad arrows); empty texts are left out
 */
function showHints(entries) {
	const bar = getHints();
	if (!bar) {
		return;
	}
	const parts = entries
		.filter(entry => entry && entry[1])
		.map(([keys, text]) => {
			const list = Array.isArray(keys) ? keys : [keys];
			const names = list.map(key => (typeof key === 'number' ? ButtonMap.nameOf(key) : key)).join('/');
			return [names, text];
		});
	const key = JSON.stringify(parts);
	bar.style.bottom = hintsBottom() + 'px';
	if (key === _hintsKey && bar.style.display !== 'none') {
		return;
	}
	_hintsKey = key;
	bar.textContent = '';
	parts.forEach(([names, text], i) => {
		if (i) {
			bar.appendChild(document.createTextNode('  ·  '));
		}
		const button = document.createElement('b');
		button.style.color = '#ffd740';
		button.textContent = names;
		bar.appendChild(button);
		bar.appendChild(document.createTextNode(' ' + text));
	});
	bar.style.display = parts.length ? 'block' : 'none';
}

function hideHints() {
	if (_hints) {
		_hints.style.display = 'none';
	}
	_hintsKey = '';
}

function hide() {
	hideRing();
	hideHints();
}

function dispose() {
	[_ring, _hints].forEach(el => {
		if (el && el.parentNode) {
			el.parentNode.removeChild(el);
		}
	});
	_ring = null;
	_hints = null;
	_ringKey = '';
	_hintsKey = '';
}

export default {
	showRing,
	hideRing,
	showHints,
	hideHints,
	hide,
	dispose,
	/**
	 * How far from the bottom of the screen a bar sits to clear the gamepad
	 * HUD (the hint bar, the on-screen keyboard).
	 */
	bottomAboveHud: hintsBottom
};
