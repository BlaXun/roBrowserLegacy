/**
 * UI/ExitHooks.js
 *
 * Tells code from outside the client -- a client plugin -- that the player
 * asked to leave: back to character select, or out to the login screen.
 *
 * The client still does the leaving. A listener is told what the player
 * chose, when they chose it, and nothing it returns or throws changes what
 * happens next. It is for keeping something of the plugin's own in step with
 * the player's intent: a plugin that remembers the last character played
 * should forget it when the player goes back to choose another.
 *
 * Told on the player's choice, not on its outcome: the server can still
 * refuse to let a character leave mid-fight, and the client's own message
 * says so. A disconnect, a kick or a closed window is not a choice and is
 * never reported here.
 *
 *   { to: 'charSelect', from: 'escape' }      Escape menu, "Character select"
 *   { to: 'login',      from: 'escape' }      Escape menu, "Exit"
 *   { to: 'login',      from: 'charSelect' }  Character select, Cancel (or
 *                                             the Escape key), once confirmed
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

/** Registered listeners, in the order they were added. */
const _listeners = [];

/**
 * Be told when the player asks to leave. Returns a function that stops it.
 */
function on(listener) {
	if (typeof listener !== 'function') {
		throw new Error('ExitHooks.on takes a function');
	}
	_listeners.push(listener);
	return () => {
		const index = _listeners.indexOf(listener);
		if (index > -1) {
			_listeners.splice(index, 1);
		}
	};
}

/**
 * The player chose to leave. Called by the window that owns the button,
 * before it acts. A listener that throws is reported and the rest still run.
 */
function emit(to, from) {
	const event = Object.freeze({ to, from });
	_listeners.slice().forEach(listener => {
		try {
			listener(event);
		} catch (error) {
			console.error('[ExitHooks] a listener failed:', error);
		}
	});
}

export default { on, emit };
