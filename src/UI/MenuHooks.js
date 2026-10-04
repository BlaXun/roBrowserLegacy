/**
 * UI/MenuHooks.js
 *
 * Lets code from outside the client -- a client plugin -- put a button of its
 * own in the game's option menu: the window Escape opens, which the Option
 * button of the basic info window opens too.
 *
 * A button is drawn the way the menu draws its own: three pictures from the
 * client's interface folder (data/texture/유저인터페이스/), for the button at
 * rest, under the pointer and pressed. The menu's are 221 x 20, like
 * esc_06a.bmp. A plugin ships its pictures in its data/ folder.
 *
 *   const remove = MenuHooks.add({
 *       background: 'esc_uiscale_a.bmp',
 *       hover: 'esc_uiscale_b.bmp',
 *       down: 'esc_uiscale_c.bmp',
 *       title: 'UI Scale',
 *       onClick() { ... }
 *   });
 *
 * Added buttons come after the menu's own settings buttons (graphics, sound,
 * shortcuts) and before exit and cancel, in the order they were added, and
 * they hide with the settings buttons on the death menu.
 * Pressing one leaves the menu open, as the settings buttons do. A handler
 * that throws is reported and changes nothing else. With no button added the
 * menu is exactly the client's own.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

/**
 * A picture in the interface folder: a relative path of plain names, no `..`.
 */
const PICTURE = /^(?!.*\.\.)[A-Za-z0-9_][A-Za-z0-9_./-]*\.(bmp|tga|png|jpe?g)$/i;

/** The buttons added, in the order they were added. */
const _buttons = [];

/** Told when the buttons change (the menu redraws them). */
const _listeners = [];

/**
 * Tell the listeners. A listener that throws is reported and the rest
 * still run.
 */
function changed() {
	_listeners.slice().forEach(listener => {
		try {
			listener();
		} catch (error) {
			console.error('[MenuHooks] a listener failed:', error);
		}
	});
}

/**
 * Add a button to the option menu. Returns a function that takes it out.
 *
 * @param {object} button
 * @param {string} button.background - picture at rest
 * @param {string} [button.hover] - picture under the pointer
 * @param {string} [button.down] - picture while pressed
 * @param {string} [button.title] - what the button does, for a tooltip and screen readers
 * @param {function} button.onClick - called when it is pressed
 * @return {function}
 */
function add({ background, hover, down, title, onClick } = {}) {
	for (const [key, value] of Object.entries({ background, hover, down })) {
		if ((key === 'background' || value !== undefined) && (typeof value !== 'string' || !PICTURE.test(value))) {
			throw new TypeError(`MenuHooks.add: ${key} must be a picture in the interface folder`);
		}
	}
	if (typeof onClick !== 'function') {
		throw new TypeError('MenuHooks.add: onClick must be a function');
	}

	const button = Object.freeze({
		background,
		hover,
		down,
		title: typeof title === 'string' ? title.slice(0, 80) : '',
		onClick
	});
	_buttons.push(button);
	changed();

	return () => {
		const index = _buttons.indexOf(button);
		if (index > -1) {
			_buttons.splice(index, 1);
			changed();
		}
	};
}

/**
 * The buttons added, in order.
 *
 * @return {Array<object>}
 */
function list() {
	return _buttons.slice();
}

/**
 * The button was pressed. Called by the menu.
 */
function press(button) {
	try {
		button.onClick();
	} catch (error) {
		console.error('[MenuHooks] a button failed:', error);
	}
}

/**
 * Be told when buttons are added or taken out. Returns a function that
 * stops it.
 */
function onChange(listener) {
	if (typeof listener !== 'function') {
		throw new Error('MenuHooks.onChange takes a function');
	}
	_listeners.push(listener);
	return () => {
		const index = _listeners.indexOf(listener);
		if (index > -1) {
			_listeners.splice(index, 1);
		}
	};
}

export default { add, list, press, onChange };
