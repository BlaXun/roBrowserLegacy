/**
 * UI/ScreenHooks.js
 *
 * Points where code from outside the client -- a client plugin -- can draw
 * the screens before the game in the client's place: the login window, the
 * server list, character select and character creation.
 *
 * The client's own window stays what the engines talk to. It still receives
 * the character list, still sends the packets, still decides what OK means.
 * A hook only replaces what is shown: when one of these windows opens it calls
 * show(screen, ctx, host); if a hook is registered for that screen, the window
 * hides itself and the hook draws instead, reading the screen's data and
 * calling its actions through ctx. Dialogs the client raises on the way (a
 * wrong password, "delete this character?") are still the client's.
 *
 * Screens, and what each window puts in ctx (see the window for details):
 *
 *   'login'       WinLogin    savedId, saveId, login(user, pass, saveId),
 *                             signup(), exit()
 *   'serverList'  WinList     servers, index, select(index), exit()
 *   'charSelect'  CharSelect  characters, maxSlots, index, sex, enabled,
 *                             deleteReservation, select(slot), play(),
 *                             create(), requestDelete(), cancelDelete(),
 *                             confirmDelete(), exit()
 *   'charCreate'  CharCreate  sex, races, hasStats, create(look), exit()
 *
 * ctx is live: its fields always read the window's current state.
 *
 * A hook is an object with any of:
 *
 *   show(ctx)      the screen opened: draw it
 *   update(ctx)    something in ctx changed (a character arrived, the
 *                  selection moved, a deletion was answered)
 *   hide()         the screen closed: take down what show drew
 *
 * The last hook registered for a screen is the one used; taking it out
 * hands the screen to the one before it, or back to the client's window.
 * A hook that throws is taken out and says so once in the console, and the
 * client's own window comes back -- a broken mod never leaves the player
 * without a way to log in.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

const SCREENS = ['login', 'serverList', 'charSelect', 'charCreate'];

/** Registered hooks, by screen, oldest first. */
const _hooks = {};

/** Screens open now: { ctx, host, hook } -- hook is null when the client draws it. */
const _open = {};

function check(screen) {
	if (!SCREENS.includes(screen)) {
		throw new Error(`ScreenHooks: unknown screen '${screen}'`);
	}
}

function current(screen) {
	const list = _hooks[screen];
	return list && list.length ? list[list.length - 1] : null;
}

function setHidden(host, hidden) {
	if (host && host.style) {
		host.style.display = hidden ? 'none' : '';
	}
}

/** Take a hook out after it threw, and give the screen back. */
function fail(screen, hook, what, error) {
	console.error(
		`[ScreenHooks] ${hook.name || 'a hook'} failed in ${what} for ${screen}, and is switched off:`,
		error
	);
	const list = _hooks[screen] || [];
	const index = list.indexOf(hook);
	if (index > -1) {
		list.splice(index, 1);
	}
	const open = _open[screen];
	if (open && open.hook === hook) {
		open.hook = null;
		if (what !== 'hide') {
			quietHide(screen, hook);
		}
		take(screen);
	}
}

function quietHide(screen, hook) {
	if (typeof hook.hide !== 'function') {
		return;
	}
	try {
		hook.hide();
	} catch (error) {
		console.error(`[ScreenHooks] ${hook.name || 'a hook'} failed to hide ${screen}:`, error);
	}
}

/** Give an open screen to its current hook, or to the client's window. */
function take(screen) {
	const open = _open[screen];
	if (!open) {
		return;
	}
	const hook = current(screen);
	open.hook = hook;
	setHidden(open.host, Boolean(hook));
	if (hook && typeof hook.show === 'function') {
		try {
			hook.show(open.ctx);
		} catch (error) {
			fail(screen, hook, 'show', error);
		}
	}
}

/**
 * Add a hook for a screen. If that screen is open, the hook takes it now.
 * Returns a function that takes the hook out again.
 */
function register(screen, hook) {
	check(screen);
	if (!hook || typeof hook !== 'object') {
		throw new Error('ScreenHooks.register takes a screen name and an object');
	}
	(_hooks[screen] = _hooks[screen] || []).push(hook);
	const open = _open[screen];
	if (open) {
		if (open.hook) {
			quietHide(screen, open.hook);
		}
		take(screen);
	}
	return () => unregister(screen, hook);
}

function unregister(screen, hook) {
	const list = _hooks[screen] || [];
	const index = list.indexOf(hook);
	if (index < 0) {
		return;
	}
	list.splice(index, 1);
	const open = _open[screen];
	if (open && open.hook === hook) {
		open.hook = null;
		quietHide(screen, hook);
		take(screen);
	}
}

/**
 * A window opened. Returns whether a hook draws it (the window is then
 * hidden). `host` is the element to hide.
 */
function show(screen, ctx, host) {
	check(screen);
	if (_open[screen]) {
		hide(screen);
	}
	_open[screen] = { ctx, host, hook: null };
	take(screen);
	return Boolean(_open[screen] && _open[screen].hook);
}

/** Something the screen's ctx reports changed. */
function update(screen) {
	const open = _open[screen];
	if (!open || !open.hook || typeof open.hook.update !== 'function') {
		return;
	}
	const hook = open.hook;
	try {
		hook.update(open.ctx);
	} catch (error) {
		fail(screen, hook, 'update', error);
	}
}

/** A window closed. */
function hide(screen) {
	const open = _open[screen];
	if (!open) {
		return;
	}
	delete _open[screen];
	setHidden(open.host, false);
	if (open.hook) {
		const hook = open.hook;
		if (typeof hook.hide === 'function') {
			try {
				hook.hide();
			} catch (error) {
				fail(screen, hook, 'hide', error);
			}
		}
	}
}

/** Whether a hook is drawing this screen now. */
function active(screen) {
	return Boolean(_open[screen] && _open[screen].hook);
}

export default { SCREENS, register, show, update, hide, active };
