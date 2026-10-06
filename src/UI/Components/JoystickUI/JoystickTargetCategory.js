/**
 * UI/Components/JoystickUI/JoystickTargetCategory.js
 *
 * What the gamepad targets: mobs, NPCs and portals, ground items, or the
 * party (support). D-pad up / down steps through the categories, wrapping
 * at both ends, and a list on the left of the screen shows all of them
 * with the active one highlighted, for a moment after each step. The HUD's
 * stick-mode pill keeps showing the active one (JoystickUIRenderer).
 *
 * The category is ControlsSettings.joyCycleMode. Its values stay those of
 * the old L3 cycle so saved settings keep their meaning; 2 (mobs and items
 * together) is no longer offered but still works if it was saved.
 */

import ControlsSettings from 'Preferences/Controls.js';

const CATEGORY = {
	MOBS: 0,
	ITEMS: 1,
	BOTH: 2, // legacy, not in ORDER
	INTERACT: 3,
	SUPPORT: 4
};

/**
 * The order D-pad up / down walks through, top to bottom on screen.
 */
const ORDER = [CATEGORY.MOBS, CATEGORY.INTERACT, CATEGORY.ITEMS, CATEGORY.SUPPORT];

const NAMES = {
	[CATEGORY.MOBS]: 'Mobs',
	[CATEGORY.ITEMS]: 'Items',
	[CATEGORY.BOTH]: 'Mobs & items',
	[CATEGORY.INTERACT]: 'NPCs',
	[CATEGORY.SUPPORT]: 'Support'
};

const LIST_VISIBLE_MS = 2000; // the list stays this long after a step, then fades
const LIST_FADE_MS = 400;

let _list = null;
let _hideTimer = null;
const _listeners = [];

function get() {
	const value = ControlsSettings.joyCycleMode | 0;
	return NAMES[value] !== undefined ? value : CATEGORY.MOBS;
}

function nameOf(category) {
	return NAMES[category] || NAMES[CATEGORY.MOBS];
}

function isSupport() {
	return get() === CATEGORY.SUPPORT;
}

/**
 * Change the category, save it and tell the listeners (the target service
 * drops a mark the new category cannot reach, the HUD relabels).
 *
 * @param {number} category CATEGORY value
 */
function set(category) {
	const previous = get();
	ControlsSettings.joyCycleMode = category;
	ControlsSettings.save();
	for (let i = 0; i < _listeners.length; i++) {
		_listeners[i](category, previous);
	}
}

/**
 * One D-pad step: 'up' to the previous category, 'down' to the next,
 * wrapping. A legacy value outside ORDER counts as Mobs.
 *
 * @param {string} direction 'up' or 'down'
 */
function step(direction) {
	let index = ORDER.indexOf(get());
	if (index === -1) {
		index = 0;
	}
	index = (index + (direction === 'up' ? -1 : 1) + ORDER.length) % ORDER.length;
	set(ORDER[index]);
	showList();
}

function onChange(callback) {
	_listeners.push(callback);
}

function getList() {
	if (_list && _list.parentNode) {
		return _list;
	}
	if (typeof document === 'undefined' || !document.body) {
		return null;
	}

	_list = document.createElement('div');
	_list.className = 'joystick-target-category';
	Object.assign(_list.style, {
		position: 'absolute',
		left: '12px',
		top: '40%',
		transform: 'translateY(-50%)',
		zIndex: 1000,
		pointerEvents: 'none',
		display: 'flex',
		flexDirection: 'column',
		gap: '3px',
		fontFamily: 'sans-serif',
		fontSize: '13px',
		transition: 'opacity ' + LIST_FADE_MS + 'ms',
		opacity: '0'
	});
	document.body.appendChild(_list);
	return _list;
}

/**
 * Show every category, the active one highlighted, then fade out.
 */
function showList() {
	const list = getList();
	if (!list) {
		return;
	}

	const active = get();
	list.textContent = '';
	ORDER.forEach(category => {
		const row = document.createElement('div');
		const on = category === active;
		row.textContent = (on ? '▶ ' : '') + nameOf(category);
		row.dataset.category = String(category);
		Object.assign(row.style, {
			padding: '3px 10px',
			borderRadius: '4px',
			color: on ? '#fff' : '#bbb',
			background: on ? 'rgba(46, 125, 50, 0.85)' : 'rgba(0, 0, 0, 0.55)',
			fontWeight: on ? 'bold' : 'normal'
		});
		list.appendChild(row);
	});

	list.style.display = 'flex';
	list.style.opacity = '1';

	if (_hideTimer) {
		clearTimeout(_hideTimer);
	}
	_hideTimer = setTimeout(function () {
		_hideTimer = null;
		list.style.opacity = '0';
	}, LIST_VISIBLE_MS);
}

function dispose() {
	if (_hideTimer) {
		clearTimeout(_hideTimer);
		_hideTimer = null;
	}
	if (_list && _list.parentNode) {
		_list.parentNode.removeChild(_list);
	}
	_list = null;
}

export default {
	CATEGORY,
	ORDER,
	get,
	set,
	step,
	nameOf,
	isSupport,
	onChange,
	showList,
	dispose
};
