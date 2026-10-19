/**
 * UI/Components/JoystickUI/JoystickDomEvents.js
 *
 * The mouse events menu navigation sends to the element it has focused,
 * as a real mouse would send them there. Every window lives in a shadow
 * root and many listen on a parent (`content.addEventListener('dblclick',
 * e => e.target.closest('.item'))`), so the events bubble and are composed
 * (they leave the shadow root, and a window drag ends on its mouseup). They
 * carry the element's centre, and the button both ways: `button` and the
 * legacy `which` that handlers here still test (`event.which === 3`).
 *
 * They go to the element itself, never to whatever lies under the virtual
 * cursor: the focus decides what is pressed.
 */

/**
 * Centre of an element on screen.
 *
 * @param {Element} el
 * @return {{x: number, y: number}}
 */
function centerOf(el) {
	const rect = el.getBoundingClientRect();
	return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Send one mouse event.
 *
 * @param {Element} el target
 * @param {string} type event type
 * @param {object} [options]
 * @param {number} [options.button] 0 left, 2 right
 * @param {boolean} [options.altKey]
 * @param {number} [options.detail] click count
 * @return {boolean} false when a listener cancelled it
 */
function send(el, type, options = {}) {
	const button = options.button || 0;
	const at = centerOf(el);
	// mouseenter and mouseleave do not bubble, as with a real mouse
	const bubbles = type !== 'mouseenter' && type !== 'mouseleave';
	const event = new MouseEvent(type, {
		bubbles,
		cancelable: true,
		composed: true,
		clientX: at.x,
		clientY: at.y,
		screenX: at.x,
		screenY: at.y,
		button,
		buttons: type === 'mousedown' ? (button === 2 ? 2 : 1) : 0,
		detail: options.detail || 0,
		altKey: !!options.altKey,
		which: button + 1
	});
	return el.dispatchEvent(event);
}

/**
 * Pointer onto or off an element: its hover image, the item name a window
 * shows under the pointer, a tooltip. `pad-hover` is for styles that cannot
 * see a synthetic hover (`:hover` stays off): ContextMenu highlights it.
 *
 * @param {Element} el
 * @param {boolean} on
 */
function hover(el, on) {
	if (!el || !el.isConnected) {
		return;
	}
	el.classList.toggle('pad-hover', on);
	send(el, on ? 'mouseover' : 'mouseout');
	send(el, on ? 'mouseenter' : 'mouseleave');
}

/**
 * A left click: mousedown, mouseup, click. Buttons here answer either the
 * press (WinStats' stat buttons, Storage's tabs) or the click.
 *
 * @param {Element} el
 */
function press(el) {
	send(el, 'mousedown', { detail: 1 });
	send(el, 'mouseup', { detail: 1 });
	send(el, 'click', { detail: 1 });
}

/**
 * A double click on an element: the second click of the pair, then
 * dblclick. Lists that confirm on a double click (NPC menus, item
 * selections) take it; so does ItemDoubleClick, which counts clicks.
 *
 * @param {Element} el
 */
function doubleClick(el) {
	send(el, 'mousedown', { detail: 2 });
	send(el, 'mouseup', { detail: 2 });
	send(el, 'click', { detail: 2 });
	send(el, 'dblclick', { detail: 2 });
}

/**
 * A right click: item and skill windows open their info window on it, and
 * with Alt held they move the stack to the other window.
 *
 * @param {Element} el
 * @param {boolean} [altKey]
 */
function contextMenu(el, altKey) {
	send(el, 'mousedown', { button: 2, altKey });
	send(el, 'mouseup', { button: 2, altKey });
	send(el, 'contextmenu', { button: 2, altKey });
}

export default {
	centerOf,
	send,
	hover,
	press,
	doubleClick,
	contextMenu
};
