/**
 * UI/Components/JoystickUI/JoystickSlotDrop.js
 *
 * Drag and drop on the gamepad HUD: skills and items dropped on a slot
 * are mapped to that button, and HUD icons can be dragged to another slot
 * or to the shortcut bar.
 *
 * A thing already mapped elsewhere in the shown set is moved, not copied.
 * The same skill at another level counts as a different thing.
 *
 * While a skill or item is dragged with a gamepad connected, a hidden HUD
 * is shown, and hovering Set 1 / Set 2 switches the set.
 */

import ShortCut from 'UI/Components/ShortCut/ShortCut.js';
import SetManager from './JoystickSetManager.js';
import JoystickShortcutMapper from './JoystickShortcutMapper.js';
import JoystickUIRenderer from './JoystickUIRenderer.js';

// How long a dragged thing rests on Set 1 / Set 2 before the set switches
const SET_HOVER_DELAY = 400;

let _host = null;
let _root = null;
let _listeners = [];

let _dragging = false;
let _revealed = false;
let _dropped = false;
let _hoverSlot = null;
let _setTimer = null;
let _setTimerFor = null;

/**
 * Shortcut indices of the 20 slots in the set on screen, in DOM order
 *
 * @return {Array<number>}
 */
function visibleIndices() {
	const start = SetManager.getCurrentSet() === 1 ? 0 : 20;
	return JoystickShortcutMapper.slotMap.slice(start, start + 20);
}

/**
 * @param {HTMLElement} slot
 * @return {number} shortcut index, -1 if not a slot
 */
function shortcutIndexOf(slot) {
	const i = Array.from(_root.querySelectorAll('.slot')).indexOf(slot);
	return i === -1 ? -1 : visibleIndices()[i];
}

/**
 * Put a shortcut entry in a slot, moving it if the shown set already has it
 *
 * @param {number} index shortcut index
 * @param {{isSkill: boolean|number, ID: number, count: number}} entry
 */
function assign(index, entry) {
	const list = ShortCut.getList();

	visibleIndices().forEach(i => {
		const other = list[i];
		if (
			i !== index &&
			other &&
			other.ID === entry.ID &&
			Boolean(other.isSkill) === Boolean(entry.isSkill) &&
			(!entry.isSkill || other.count == entry.count)
		) {
			ShortCut.removeAt(i);
		}
	});

	ShortCut.addElement(index, entry.isSkill, entry.ID, entry.count);
	ShortCut.onChange(index, entry.isSkill, entry.ID, entry.count);
}

function gamepadConnected() {
	const pads = navigator.getGamepads ? navigator.getGamepads() : [];
	return Array.from(pads).some(Boolean);
}

function setHover(slot) {
	if (_hoverSlot === slot) {
		return;
	}
	if (_hoverSlot) {
		_hoverSlot.classList.remove('drop-target');
	}
	_hoverSlot = slot;
	if (slot) {
		slot.classList.add('drop-target');
	}
}

function cancelSetTimer() {
	clearTimeout(_setTimer);
	_setTimer = null;
	_setTimerFor = null;
}

/**
 * Switch to the set of the hovered Set button once the drag rests on it
 *
 * @param {HTMLElement} button
 */
function hoverSetButton(button) {
	if (_setTimerFor === button) {
		return;
	}
	cancelSetTimer();

	const set = Array.from(_root.querySelectorAll('.set-btn')).indexOf(button) + 1;
	if (set === SetManager.getCurrentSet()) {
		return;
	}

	_setTimerFor = button;
	_setTimer = setTimeout(() => {
		_setTimer = null;
		SetManager.set(set);
		JoystickUIRenderer.updateSetIndicator();
		JoystickUIRenderer.sync();
	}, SET_HOVER_DELAY);
}

function beginDrag() {
	_dragging = true;
	_dropped = false;
	_host.classList.add('dragging');

	if (!JoystickUIRenderer.isVisible() && gamepadConnected()) {
		JoystickUIRenderer.show();
		_revealed = true;
	}
}

function endDrag() {
	if (!_dragging) {
		return;
	}
	_dragging = false;
	_host.classList.remove('dragging');
	setHover(null);
	cancelSetTimer();

	// Keep the HUD up after a drop on it, so the result can be seen
	if (_revealed && !_dropped) {
		JoystickUIRenderer.hide();
	}
	_revealed = false;
}

function onDocumentDragStart() {
	// Component dragstart handlers have set the payload by now
	if (ShortCut.fromDragData(window._OBJ_DRAG_)) {
		beginDrag();
	}
}

function onDocumentDrop() {
	// A drop can re-render its source, which then never sees dragend
	setTimeout(endDrag, 0);
}

function onDragOver(event) {
	const slot = event.target.closest('.slot');
	if (slot && ShortCut.fromDragData(window._OBJ_DRAG_)) {
		event.preventDefault();
		event.stopImmediatePropagation();
		setHover(slot);
		cancelSetTimer();
		return;
	}

	setHover(null);
	const button = event.target.closest('.set-btn');
	if (button && _dragging) {
		hoverSetButton(button);
	} else {
		cancelSetTimer();
	}
}

function onDragLeave(event) {
	const slot = event.target.closest('.slot');
	if (slot && slot === _hoverSlot && !slot.contains(event.relatedTarget)) {
		setHover(null);
	}
	const button = event.target.closest('.set-btn');
	if (button && button === _setTimerFor && !button.contains(event.relatedTarget)) {
		cancelSetTimer();
	}
}

function onDrop(event) {
	const slot = event.target.closest('.slot');
	if (!slot) {
		return;
	}

	event.preventDefault();
	event.stopImmediatePropagation();
	setHover(null);

	let data;
	try {
		data = JSON.parse(event.dataTransfer.getData('Text'));
	} catch (_e) {
		return;
	}

	const entry = ShortCut.fromDragData(data);
	const index = shortcutIndexOf(slot);
	if (!entry || index === -1) {
		return;
	}

	_dropped = true;
	assign(index, entry);
}

function onDragStart(event) {
	const icon = event.target.closest('.icon');
	const slot = icon && icon.closest('.slot');
	const index = slot ? shortcutIndexOf(slot) : -1;
	const entry = ShortCut.getList()[index];

	if (!entry || !entry.ID) {
		event.preventDefault();
		return;
	}

	const url = icon.querySelector('.img').style.backgroundImage.match(/\(([^)]+)/);
	if (url) {
		const img = new Image();
		img.decoding = 'async';
		img.src = url[1].replace(/"/g, '');
		event.dataTransfer.setDragImage(img, 12, 12);
	}

	event.dataTransfer.setData(
		'Text',
		JSON.stringify(
			(window._OBJ_DRAG_ = {
				type: entry.isSkill ? 'skill' : 'item',
				from: 'ShortCut',
				data: entry
			})
		)
	);
}

function onDragEnd() {
	delete window._OBJ_DRAG_;
}

function listen(target, type, handler, capture) {
	target.addEventListener(type, handler, capture);
	_listeners.push(() => target.removeEventListener(type, handler, capture));
}

/**
 * @param {HTMLElement} host the JoystickUI element
 */
function attach(host) {
	detach();
	_host = host;
	_root = host.shadowRoot || host;

	listen(_root, 'dragstart', onDragStart);
	listen(_root, 'dragend', onDragEnd);
	listen(_root, 'dragover', onDragOver);
	listen(_root, 'dragleave', onDragLeave);
	listen(_root, 'drop', onDrop);

	listen(document, 'dragstart', onDocumentDragStart);
	listen(document, 'dragend', endDrag);
	listen(document, 'drop', onDocumentDrop, true);
}

function detach() {
	endDrag();
	_listeners.forEach(remove => remove());
	_listeners = [];
	_host = null;
	_root = null;
}

export default {
	attach,
	detach,
	assign
};
