/**
 * UI/Components/JoystickUI/JoystickMenuNavigation.js
 *
 * D-pad navigation for windows that are a column of buttons, like the
 * escape menu, the death menu (Escape.showDeathMenu) and the right-click
 * menu on a player (ContextMenu). While one is
 * open, the D-pad steps through its visible buttons: the virtual cursor
 * moves onto the button and it shows its hover image, so A (a click at the
 * cursor) presses it.
 */

import UIManager from 'UI/UIManager.js';
import Cursor from './JoystickMouseCursorAdapter.js';

/**
 * Button menus, by UIManager component name and the buttons to step
 * through. A closable one is closed by B (close()).
 */
const MENUS = [
	{ component: 'Escape', buttons: '.container button' },
	{ component: 'ContextMenu', buttons: '.menu > div', closable: true }
];

let _menuCurrent = null; // the menu entry being navigated
let _menuButton = null; // the highlighted button

function getComponent(name) {
	try {
		return UIManager.getComponent(name);
	} catch {
		return null;
	}
}

function isShown(component) {
	const host = component && component._host;
	return !!host && !!host.parentNode && host.style.display !== 'none';
}

function isVisible(el) {
	return el.style.display !== 'none' && el.getClientRects().length > 0;
}

function hover(el, on) {
	// A synthetic mouseover does not set :hover; menus without hover
	// images style this class instead (ContextMenu)
	el.classList.toggle('pad-hover', on);
	el.dispatchEvent(new MouseEvent(on ? 'mouseover' : 'mouseout', { bubbles: true, composed: true }));
}

/**
 * Step the highlight through the open menu's buttons. Wraps at both ends;
 * the first press selects the first (or last) button.
 *
 * @param {string} direction 'up', 'down', 'left' or 'right'
 * @return {boolean} true when a menu was open and took the press
 */
function navigate(direction) {
	let open = null;
	let component = null;
	for (let i = 0; i < MENUS.length; i++) {
		component = getComponent(MENUS[i].component);
		if (isShown(component)) {
			open = MENUS[i];
			break;
		}
	}

	if (!open) {
		_menuCurrent = null;
		_menuButton = null;
		return false;
	}

	const buttons = Array.from(component.getRoot().querySelectorAll(open.buttons)).filter(isVisible);
	if (buttons.length === 0) {
		return false;
	}

	const forward = direction === 'down' || direction === 'right';
	let index = open === _menuCurrent && _menuButton ? buttons.indexOf(_menuButton) : -1;
	if (index === -1) {
		index = forward ? 0 : buttons.length - 1;
	} else {
		index = (index + (forward ? 1 : -1) + buttons.length) % buttons.length;
	}

	if (_menuButton && _menuButton !== buttons[index]) {
		hover(_menuButton, false);
	}
	_menuCurrent = open;
	_menuButton = buttons[index];
	hover(_menuButton, true);

	const rect = _menuButton.getBoundingClientRect();
	Cursor.moveTo(rect.left + rect.width / 2, rect.top + rect.height / 2);
	return true;
}

/**
 * B: close an open closable menu.
 *
 * @return {boolean} true when one was open and is closed now
 */
function close() {
	for (let i = 0; i < MENUS.length; i++) {
		const component = getComponent(MENUS[i].component);
		if (MENUS[i].closable && isShown(component)) {
			component.remove();
			_menuCurrent = null;
			_menuButton = null;
			return true;
		}
	}
	return false;
}

export default {
	navigate,
	close
};
