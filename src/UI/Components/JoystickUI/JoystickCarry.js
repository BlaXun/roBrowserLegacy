/**
 * UI/Components/JoystickUI/JoystickCarry.js
 *
 * Pick up and place with the gamepad: a drag and drop, as the windows know
 * it from the mouse. Every item, skill and shortcut window already says
 * what it carries when a drag starts (its dragstart handler fills
 * window._OBJ_DRAG_ and the `Text` data) and what it accepts when one ends
 * (its drop handler reads `event.dataTransfer.getData('Text')`). This sends
 * those events with a stand-in dataTransfer, the way TouchDrag does for
 * touch, so inventory, storage, cart, trade, equipment, the equipment
 * switch set, the shortcut bar, the gamepad HUD, the NPC shop lists and the
 * ground all work without code of their own.
 *
 *   pickUp(el)   dragstart on el: false when it carries nothing
 *   place(el)    dragover and drop on el, then dragend at the source
 *   cancel()     dragend at the source, nothing dropped
 *
 * A small copy of the carried icon follows the focus ring (moveGhost).
 */

let _carry = null; // { source, data, ghost }

/**
 * A stand-in for the browser's DataTransfer: what the handlers here use of it.
 */
function makeTransfer() {
	const store = {};
	return {
		dropEffect: 'move',
		effectAllowed: 'all',
		types: [],
		files: [],
		items: [],
		setData(type, value) {
			store[type] = String(value);
			if (this.types.indexOf(type) === -1) {
				this.types.push(type);
			}
		},
		getData(type) {
			return store[type] || '';
		},
		clearData(type) {
			if (type) {
				delete store[type];
			} else {
				Object.keys(store).forEach(key => delete store[key]);
			}
		},
		setDragImage() {}
	};
}

function dragEvent(type, data) {
	const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
	Object.defineProperty(event, 'dataTransfer', { value: data });
	return event;
}

/**
 * The element a window's dragstart handler looks for: the element itself if
 * draggable, else the draggable inside it (a shortcut slot's icon).
 */
function dragSource(el) {
	if (!el) {
		return null;
	}
	if (el.getAttribute('draggable') === 'true') {
		return el;
	}
	return el.querySelector('[draggable="true"]');
}

/**
 * Whether an element can be picked up at all (it does not say whether its
 * window lets it go: an unlearned skill, say, refuses on dragstart).
 */
function canPickUp(el) {
	return !!dragSource(el);
}

/**
 * The picture of what is carried: the first image in its icon (an item's
 * `.icon` background, a skill's <img>, a worn item's button, a slot's `.img`).
 */
function iconImage(source) {
	const scopes = [source.querySelector('.icon'), source];
	for (let i = 0; i < scopes.length; i++) {
		if (!scopes[i]) {
			continue;
		}
		const nodes = [scopes[i], ...scopes[i].querySelectorAll('*')];
		for (let j = 0; j < nodes.length; j++) {
			const node = nodes[j];
			if (node.tagName === 'IMG' && node.getAttribute('src')) {
				return `url("${node.src}")`;
			}
			const background = node.style && node.style.backgroundImage;
			if (background && background !== 'none') {
				return background;
			}
		}
	}
	return '';
}

function makeGhost(source) {
	if (typeof document === 'undefined' || !document.body) {
		return null;
	}
	const ghost = document.createElement('div');
	ghost.className = 'joystick-carry-ghost';
	const image = iconImage(source);
	Object.assign(ghost.style, {
		position: 'fixed',
		zIndex: 10001,
		pointerEvents: 'none',
		width: '24px',
		height: '24px',
		backgroundImage: image || 'none',
		backgroundRepeat: 'no-repeat',
		backgroundPosition: 'center',
		backgroundSize: 'contain',
		opacity: '0.85',
		display: 'none'
	});
	document.body.appendChild(ghost);
	return ghost;
}

/**
 * Pick an element up.
 *
 * @param {Element} el an item, skill or slot
 * @return {boolean} true when its window gave something to carry
 */
function pickUp(el) {
	cancel();
	const source = dragSource(el);
	if (!source) {
		return false;
	}
	const data = makeTransfer();
	const start = dragEvent('dragstart', data);
	source.dispatchEvent(start);
	if (start.defaultPrevented || !data.getData('Text')) {
		// Refused (an empty slot, a skill not learned): end what may have begun
		source.dispatchEvent(dragEvent('dragend', data));
		delete window._OBJ_DRAG_;
		return false;
	}
	_carry = { source, data, ghost: makeGhost(source) };
	return true;
}

/**
 * Put what is carried down on an element: its window decides what that
 * means (move, equip, assign, ask how many).
 *
 * @param {Element} target
 * @return {boolean} false when nothing was carried
 */
function place(target) {
	if (!_carry || !target) {
		return false;
	}
	const data = _carry.data;
	target.dispatchEvent(dragEvent('dragenter', data));
	target.dispatchEvent(dragEvent('dragover', data));
	target.dispatchEvent(dragEvent('drop', data));
	finish();
	return true;
}

/**
 * The drag ends at its source (the shortcut bar shows the icon again,
 * windows forget window._OBJ_DRAG_), or at the page when the source is gone.
 */
function finish() {
	const carry = _carry;
	_carry = null;
	if (!carry) {
		return;
	}
	if (carry.ghost && carry.ghost.parentNode) {
		carry.ghost.parentNode.removeChild(carry.ghost);
	}
	const end = dragEvent('dragend', carry.data);
	(carry.source.isConnected ? carry.source : document).dispatchEvent(end);
	delete window._OBJ_DRAG_;
}

function cancel() {
	finish();
}

function isCarrying() {
	return _carry !== null;
}

/**
 * What is carried, as its window described it ({type, from, data}), or null.
 */
function payload() {
	if (!_carry) {
		return null;
	}
	try {
		return JSON.parse(_carry.data.getData('Text'));
	} catch {
		return null;
	}
}

/**
 * The icon follows the ring: at the top right of the focused element, or
 * hidden with nothing focused.
 *
 * @param {?{right: number, top: number}} rect
 */
function moveGhost(rect) {
	const ghost = _carry && _carry.ghost;
	if (!ghost) {
		return;
	}
	if (!rect) {
		ghost.style.display = 'none';
		return;
	}
	ghost.style.left = Math.round(rect.right - 8) + 'px';
	ghost.style.top = Math.round(rect.top - 16) + 'px';
	ghost.style.display = 'block';
}

export default {
	pickUp,
	place,
	cancel,
	isCarrying,
	canPickUp,
	payload,
	moveGhost
};
