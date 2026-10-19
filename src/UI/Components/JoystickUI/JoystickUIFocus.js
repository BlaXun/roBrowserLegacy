/**
 * UI/Components/JoystickUI/JoystickUIFocus.js
 *
 * Menu navigation with the gamepad. While it is on, a ring marks one
 * element of an open window (a button, an item, a list row) and the buttons
 * act on it:
 *
 *   D-pad    move the ring to the nearest element that way; at a window's
 *            edge, into the next window (held: repeats). On a slider or a
 *            drop-down list, left and right change its value
 *   A        press it: a button, a row, an item (use / equip), a skill (use);
 *            on a text field, the on-screen keyboard (JoystickKeyboard),
 *            which has every button until it closes
 *   B        back: an item's or skill's info window first, else the
 *            window's cancel or close button, else leave menus
 *   X        a tap: what else can be done with it, as a menu (store some,
 *            put on a gamepad slot, drop...); held: pick it up
 *   Y        item or skill info (a right click on it)
 *   LB / RB  previous / next tab of the window (a tap)
 *   LT / RT  previous / next window (a tap; held, they stay modifiers)
 *   View     a tap turns menu navigation on or off; held alone, the info
 *            of what the cursor is on
 *
 * Something picked up (X held, or Move… in the X menu) is carried with the
 * ring, which turns blue: A (or X) puts it down on the focused element, as
 * dropping it there with the mouse does (storage, the shortcut bar, a
 * gamepad HUD slot, the equipment window, a tab...), and B puts it back.
 * Off the ring, it goes where the cursor is: on the map, to the ground.
 *
 * Shortcut combos (LB / RB / LT / RT held + a face button), the left stick,
 * Menu, L3 and R3 keep their jobs: JoystickButtonInput only leaves out the
 * map's A / B / X / Y and the D-pad while this is on. The right stick still
 * moves the cursor; the ring follows it onto whatever it rests on, and A
 * clicks at the cursor when that is nothing the ring can take.
 *
 * It turns itself on when a window opens that waits for an answer (an NPC
 * dialogue or menu, an amount, a message box, Escape, a right-click menu)
 * and the gamepad was used last, or when the gamepad opens a window (View +
 * A / B / X / Y). It turns off again when what it opened for is gone, when
 * a skill waits for a target on the map, and when the real mouse moves.
 *
 * Buttons are read here on every animation frame (JoystickCursorMotion),
 * not in the 10 Hz poll, where a quick D-pad tap could fall between two
 * polls. They are logical buttons (JoystickButtonMap): a remap carries over.
 */

import ControlsSettings from 'Preferences/Controls.js';
import Mouse from 'Controls/MouseEventHandler.js';
import UIManager from 'UI/UIManager.js';
import ButtonMap from './JoystickButtonMap.js';
import Scan from './JoystickFocusScan.js';
import SpatialNav from './JoystickSpatialNav.js';
import Overlay from './JoystickFocusOverlay.js';
import Events from './JoystickDomEvents.js';
import Cursor from './JoystickMouseCursorAdapter.js';
import EmoteGrid from './JoystickEmoteGrid.js';
import SelectionUI from './JoystickSelectionUI.js';
import StickFilter from './JoystickStickFilter.js';
import Carry from './JoystickCarry.js';
import Tabs from './JoystickFocusTabs.js';
import ActionMenu from './JoystickActionMenu.js';
import ValueInput from './JoystickValueInput.js';
import Keyboard from './JoystickKeyboard.js';

const BTN = ButtonMap.BUTTON;

const DPAD = {
	[BTN.UP]: 'up',
	[BTN.DOWN]: 'down',
	[BTN.LEFT]: 'left',
	[BTN.RIGHT]: 'right'
};

/**
 * Held, these make the face buttons shortcuts (JoystickShortcutMapper).
 */
const MODIFIERS = [BTN.LB, BTN.RB, BTN.LT, BTN.RT];

const HOLD_MS = 400; // View or X held alone this long: a hold (info at the cursor; pick up)
const TAP_MS = 400; // X, LB, RB, LT, RT let go within this, with nothing else pressed: a tap
const REPEAT_DELAY_MS = 350; // a held D-pad starts repeating after this
const REPEAT_EVERY_MS = 90;
const SCAN_EVERY_MS = 100; // how often to look for newly opened windows
const FOLLOW_MS = 600; // a window opening this soon after A was opened by it: the focus goes there
const TAB_FOCUS_MS = 600; // how long a switched tab may take to draw its content
const HINTS_EVERY_MS = 150;
const MOUSE_MOVE_PX = 6; // the real mouse moved this far: it has the UI now
const ACTIVITY_AXIS = 0.3; // a stick pushed this far counts as using the gamepad

/**
 * A window's close or cancel button, best first: what B presses when the
 * window's profile says nothing else.
 */
const CLOSE = [
	'.titlebar .close',
	'ui-button.close',
	'button.close',
	'.btn.close',
	'.close',
	'.btn.cancel',
	'.cancel',
	'.closeswap'
];

let _active = false;
let _auto = false; // turned on by a dialogue or a window the gamepad opened
let _win = null; // the focused window (JoystickFocusScan.describe)
let _el = null; // the focused element
let _key = null; // its key, to find it again after the window redraws
let _ordinal = 0; // its place in the window, for when it is gone
let _detached = false; // the right stick took the cursor off the ring
let _visited = []; // hosts of the windows focused this time, latest last
const _lastKey = new WeakMap(); // where the ring was in each window

let _down = []; // logical buttons down, last frame
let _downAt = [];
let _used = []; // pressed together with another button while down: not a tap
let _claimed = new Set(); // buttons down while menus were on: not the map's until let go
let _armed = new Set(); // pressed while menus had the buttons: may be a tap or hold here
let _repeatButton = -1;
let _repeatAt = 0;
let _viewHoldFired = false;
let _viewArmed = false; // View was pressed where this reads it (not on the on-screen keyboard)
let _xHoldFired = false; // X was held long enough: it picked something up (or tried)
let _xTaken = false; // the X press put down what was carried: its release is no tap

let _dialogs = new Set(); // dialogue hosts open at the last scan
let _known = new Set(); // every window host open at the last scan
let _followUntil = -Infinity;
let _scanAt = -Infinity;
let _frameTime = 0;
let _hintsAt = -Infinity;
let _lostAt = -Infinity; // the window had nothing to focus when last looked
let _skillWait = false;
let _tabFocus = null; // a tab just switched: {host, before, until}, the focus goes into what it draws
let _afterRelease = []; // to run once every button is let go
let _pickSlot = null; // opens the gamepad slot picker for an item or skill (JoystickModule)

let _lastPadAt = 0;
let _lastMouseAt = 0;
let _mouseX = NaN;
let _mouseY = NaN;
let _listening = false;

function enabled() {
	return ControlsSettings.joyUIFocus !== false;
}

/**
 * Whether the gamepad was used more recently than the mouse.
 */
function isEngaged() {
	return _lastPadAt > 0 && _lastPadAt >= _lastMouseAt;
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

/**
 * Logical buttons down, from the pad's physical ones.
 */
function readButtons(gp) {
	const raw = [];
	for (let i = 0; i < ButtonMap.BUTTON_COUNT; i++) {
		const button = gp && gp.buttons ? gp.buttons[i] : null;
		raw.push(button && button.pressed ? 'holding' : 'unpressed');
	}
	return ButtonMap.toLogical(raw)
		.slice(0, ButtonMap.BUTTON_COUNT)
		.map(state => state !== 'unpressed');
}

/**
 * Presses and releases since the last frame.
 */
function track(down, now) {
	const pressed = [];
	const released = [];
	let count = 0;
	for (let i = 0; i < down.length; i++) {
		if (down[i]) {
			count++;
		}
		if (down[i] && !_down[i]) {
			pressed.push(i);
			_downAt[i] = now;
			_used[i] = false;
		} else if (!down[i] && _down[i]) {
			released.push({ button: i, held: now - (_downAt[i] || now), used: !!_used[i], armed: _armed.has(i) });
		}
		if (!down[i]) {
			_claimed.delete(i);
			_armed.delete(i);
		}
	}
	// A press while another button is down: neither is a tap any more
	if (pressed.length && count > 1) {
		for (let i = 0; i < down.length; i++) {
			if (down[i]) {
				_used[i] = true;
			}
		}
	}
	_down = down;
	return { pressed, released };
}

function noteActivity(gp, down, now) {
	if (down.some(Boolean)) {
		_lastPadAt = now;
		return;
	}
	// After drift correction: a drifting stick is no player at the pad
	const axes = gp && gp.axes ? StickFilter.filterAxes(gp.axes) : [];
	const threshold = Math.max(ACTIVITY_AXIS, ControlsSettings.joyDeadline || 0);
	for (let i = 0; i < axes.length; i++) {
		if (Math.abs(axes[i]) > threshold) {
			_lastPadAt = now;
			return;
		}
	}
}

/**
 * Run what waited for every button to be let go: a window that reads the
 * pad itself (the slot picker) must not get the press that opened it.
 */
function runAfterRelease() {
	if (!_afterRelease.length || _down.some(Boolean)) {
		return;
	}
	const list = _afterRelease;
	_afterRelease = [];
	list.forEach(fn => {
		try {
			fn();
		} catch (error) {
			console.error('[JoystickUIFocus] deferred action failed', error);
		}
	});
}

function afterRelease(fn) {
	_afterRelease.push(fn);
}

/**
 * View: a tap turns menus on or off, a hold alone shows the info of what
 * the cursor (or the ring) is on. With another button it is a modifier,
 * handled in JoystickButtonInput and JoystickCameraMotion.
 */
function handleView(events, now) {
	const view = BTN.VIEW;
	if (events.pressed.indexOf(view) !== -1) {
		_viewHoldFired = false;
		_viewArmed = true;
	}
	// A press made while the on-screen keyboard had the buttons is not a tap or hold here
	const release = events.released.find(entry => entry.button === view);
	const armed = _viewArmed;
	if (release) {
		_viewArmed = false;
	}
	if (!armed) {
		return;
	}
	if (_down[view] && !_used[view] && !_viewHoldFired && now - _downAt[view] >= HOLD_MS) {
		_viewHoldFired = true;
		if (_active && _el && !_detached) {
			info();
		} else {
			Cursor.contextMenu();
		}
	}
	if (release && !release.used && !_viewHoldFired && release.held < HOLD_MS) {
		if (enabled()) {
			toggle();
		} else {
			// Menu navigation turned off: a tap is the info at the cursor, as it was before
			Cursor.contextMenu();
		}
	}
}

/**
 * Whether a release ends a tap that belongs to menus.
 */
function isTap(entry) {
	return entry.armed && !entry.used && entry.held < TAP_MS;
}

function handleButtons(events, now) {
	const view = _down[BTN.VIEW];
	// Held shoulder buttons make the face buttons shortcuts, as outside menus
	const combo = MODIFIERS.some(button => _down[button]);

	if (view) {
		// View + D-pad turns the camera (JoystickCameraMotion)
		_repeatButton = -1;
	} else {
		events.pressed.forEach(button => {
			if (DPAD[button]) {
				move(DPAD[button]);
				_repeatButton = button;
				_repeatAt = now + REPEAT_DELAY_MS;
			}
		});
		if (_repeatButton !== -1) {
			if (!_down[_repeatButton]) {
				_repeatButton = -1;
			} else if (now >= _repeatAt) {
				_repeatAt = now + REPEAT_EVERY_MS;
				move(DPAD[_repeatButton]);
			}
		}
	}

	if (!view) {
		// Taps and holds count only from presses made in menus
		events.pressed.forEach(button => {
			if (button === BTN.X || MODIFIERS.indexOf(button) !== -1) {
				_armed.add(button);
			}
		});
	}

	if (!view && !combo && _active) {
		if (events.pressed.indexOf(BTN.A) !== -1) {
			if (Carry.isCarrying()) {
				placeCarried();
			} else {
				activate();
			}
		} else if (events.pressed.indexOf(BTN.B) !== -1) {
			if (Carry.isCarrying()) {
				cancelCarry();
			} else {
				back();
			}
		} else if (events.pressed.indexOf(BTN.Y) !== -1) {
			info();
		}
		if (events.pressed.indexOf(BTN.X) !== -1) {
			_xHoldFired = false;
			_xTaken = Carry.isCarrying();
			if (_xTaken) {
				placeCarried();
			}
		}
	}

	handleX(events, now, view);

	if (!view && _active) {
		events.released.forEach(entry => {
			if (!isTap(entry)) {
				return;
			}
			if (entry.button === BTN.LT || entry.button === BTN.RT) {
				cycleWindow(entry.button === BTN.RT ? 1 : -1);
			} else if (entry.button === BTN.LB || entry.button === BTN.RB) {
				switchTab(entry.button === BTN.RB ? 1 : -1);
			}
		});
	}
}

/**
 * X: held, it picks the focused element up; tapped, it opens what can be
 * done with it. Not with a shoulder button (a shortcut combo) or View.
 */
function handleX(events, now, view) {
	const x = BTN.X;
	if (
		_active &&
		!view &&
		_down[x] &&
		_armed.has(x) &&
		!_used[x] &&
		!_xHoldFired &&
		!_xTaken &&
		now - _downAt[x] >= HOLD_MS
	) {
		_xHoldFired = true;
		if (!_detached && _el && !Carry.isCarrying() && ActionMenu.canMove(_el, _win)) {
			startCarry(_el);
		}
	}
	const release = events.released.find(entry => entry.button === x);
	if (release && isTap(release) && !_xHoldFired && !_xTaken && !view && _active) {
		openActions();
	}
	if (release) {
		_xHoldFired = false;
		_xTaken = false;
	}
}

// ---------------------------------------------------------------------------
// Focus
// ---------------------------------------------------------------------------

/**
 * The registered component a window is, if any (popups are unregistered clones).
 */
function componentOf(win) {
	const components = UIManager.components;
	for (const name in components) {
		const component = components[name];
		if (component && component._host === win.host) {
			return component;
		}
	}
	return null;
}

/**
 * Bring a window to the front, as a click on it does.
 */
function raise(win) {
	const component = componentOf(win);
	if (component && component.focus) {
		component.focus();
	}
}

/**
 * The virtual cursor onto an element (the focused one), so that what the
 * cursor does elsewhere (a skill click over a window is meant for the
 * window) agrees with the ring.
 */
function parkCursor(el = _el) {
	if (!el) {
		return;
	}
	const at = Events.centerOf(el);
	Cursor.moveTo(at.x, at.y);
}

/**
 * Whether a window is passed by: never navigated, or not now (the gamepad
 * HUD, but while something is carried).
 */
function skipped(win) {
	return !!win.profile.skip;
}

function setFocus(win, el, list, moveCursor = true) {
	const newWindow = !_win || _win.host !== win.host;
	if (_el && _el !== el) {
		Events.hover(Scan.eventTarget(_el), false);
	}
	_win = win;
	_el = el;
	_key = Scan.keyOf(el, list);
	_ordinal = Math.max(0, list.indexOf(el));
	_lastKey.set(win.host, _key);
	_detached = false;
	_visited = _visited.filter(host => host !== win.host);
	_visited.push(win.host);

	if (newWindow) {
		raise(win);
	}
	Scan.reveal(el, win.host);
	Events.hover(Scan.eventTarget(el), true);
	if (win.profile.onFocus) {
		win.profile.onFocus(el, win);
	}
	if (moveCursor) {
		parkCursor();
	}
	_hintsAt = -Infinity;
	refresh();
}

/**
 * The first element in reading order, title bar buttons (close, minimise) last.
 */
function firstOf(list) {
	const body = list.filter(el => !el.closest('.titlebar'));
	return (body.length ? body : list)
		.map(el => ({ el, rect: el.getBoundingClientRect() }))
		.sort((a, b) => SpatialNav.compareReadingOrder(a.rect, b.rect))[0].el;
}

/**
 * Move the focus into a window: where it was the last time, else where its
 * profile starts (a dialogue always starts there), else its first element.
 *
 * @return {boolean} false when the window has nothing to focus
 */
function focusWindow(win) {
	const list = Scan.focusables(win);
	if (!list.length) {
		return false;
	}
	const profile = win.profile;
	let el = null;
	if (profile.dialog && profile.initial) {
		el = Scan.findFirst(list, profile.initial);
	}
	if (!el) {
		el = Scan.findByKey(list, _lastKey.get(win.host));
	}
	if (!el && profile.initial) {
		el = Scan.findFirst(list, profile.initial);
	}
	if (!el) {
		el = firstOf(list);
	}
	if ((!_win || _win.host !== win.host) && profile.onEnter) {
		profile.onEnter(win);
	}
	setFocus(win, el, list);
	return true;
}

/**
 * Where menu navigation starts when turned on by hand: a dialogue, else the
 * frontmost window the player opened, else the basic info window's menu
 * (which opens all the others), else whatever there is.
 */
function pickWindow(wins) {
	const usable = (wins || Scan.listWindows()).filter(win => !skipped(win) && Scan.focusables(win).length);
	return (
		usable.find(win => win.profile.dialog) ||
		usable.find(win => !win.profile.home && !win.profile.persistent) ||
		usable.find(win => win.profile.home) ||
		usable[0] ||
		null
	);
}

/**
 * Windows the D-pad crosses into from the focused one: dialogues among
 * dialogues, the rest among the rest.
 */
function neighbours(win) {
	const dialog = !!(win && win.profile.dialog);
	return Scan.listWindows().filter(
		other => (!win || other.host !== win.host) && !skipped(other) && !!other.profile.dialog === dialog
	);
}

function entriesOf(win, list) {
	return list.map(el => ({ el, win, rect: el.getBoundingClientRect() }));
}

/**
 * The windows the shoulder triggers go through, left to right on screen.
 */
function navigableWindows() {
	return Scan.listWindows()
		.filter(win => !skipped(win))
		.map(win => ({ win, list: Scan.focusables(win) }))
		.filter(entry => entry.list.length)
		.map(entry => ({ win: entry.win, bounds: Scan.boundsOf(entry.list) }))
		.sort((a, b) => a.bounds.left - b.bounds.left || a.bounds.top - b.bounds.top)
		.map(entry => entry.win);
}

/**
 * The focused window closed: on to another dialogue, else back to the
 * windows visited this time, else to a window the server opened (storage),
 * else out of menus if they were not turned on by hand.
 */
function windowGone() {
	const gone = _win;
	_win = null;
	_el = null;
	const wins = Scan.listWindows();

	const dialog = wins.find(win => win.profile.dialog && Scan.focusables(win).length);
	if (dialog && focusWindow(dialog)) {
		return;
	}
	for (let i = _visited.length - 1; i >= 0; i--) {
		const host = _visited[i];
		if (gone && host === gone.host) {
			continue;
		}
		const win = wins.find(candidate => candidate.host === host);
		if (win && !skipped(win) && focusWindow(win)) {
			return;
		}
	}
	// A window the server opened for this (storage behind an NPC's last line)
	const opened = wins.find(win => win.profile.takesFocus && Scan.focusables(win).length);
	if (opened && focusWindow(opened)) {
		return;
	}
	// A just pressed may be opening a window (an NPC's storage, a shop): wait for it
	if (_frameTime < _followUntil) {
		Overlay.hideRing();
		return;
	}
	settle(wins);
}

/**
 * Nowhere left to go: out of menus if they turned on by themselves, else
 * into whatever window is left.
 */
function settle(wins) {
	if (_auto) {
		exit();
		return;
	}
	const any = pickWindow(wins);
	if (!any || !focusWindow(any)) {
		exit();
	}
}

/**
 * Keep the focus on something real: the window may have closed, or drawn
 * its list again (the inventory does whenever an item changes).
 */
function validate(now) {
	if (!_win) {
		// Waiting for the window an A press opens (windowGone)
		if (now >= _followUntil) {
			settle();
		}
		return;
	}
	// Closed, or passed by now (the gamepad HUD once nothing is carried)
	if (!Scan.isOpen(_win) || skipped(_win)) {
		windowGone();
		return;
	}
	if (_detached || (_el && Scan.isStillFocusable(_el, _win))) {
		return;
	}
	if (!_el && now - _lostAt < SCAN_EVERY_MS) {
		return;
	}
	const list = Scan.focusables(_win);
	if (!list.length) {
		// Nothing to press for now (an NPC box between two lines): wait, the window is still open
		if (_el) {
			Events.hover(Scan.eventTarget(_el), false);
		}
		_el = null;
		_lostAt = now;
		Overlay.hideRing();
		return;
	}
	const profile = _win.profile;
	let el = Scan.findByKey(list, _key);
	if (!el && profile.dialog && profile.initial) {
		el = Scan.findFirst(list, profile.initial);
	}
	if (!el) {
		// The item is gone (used up, moved): the one now in its place
		el = list[Math.min(_ordinal, list.length - 1)];
	}
	setFocus(_win, el, list);
}

/**
 * The right stick moved the cursor: the ring goes to what it rests on.
 * Only the stick: a skill moving the cursor onto its target leaves the ring
 * where it is.
 */
function followCursor() {
	const hit = Scan.focusableAt(Mouse.screen.x, Mouse.screen.y);
	if (hit && !skipped(hit.win)) {
		if (hit.el !== _el) {
			setFocus(hit.win, hit.el, Scan.focusables(hit.win), false);
		} else if (_detached) {
			Events.hover(Scan.eventTarget(_el), true);
			_hintsAt = -Infinity;
		}
		_detached = false;
	} else if (!_detached) {
		if (_el) {
			Events.hover(Scan.eventTarget(_el), false);
		}
		_detached = true;
		_hintsAt = -Infinity;
	}
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * The D-pad: the profile first (an amount box counts), then the NPC text
 * scrolls, then the focus moves.
 */
function move(direction) {
	if (!_win) {
		return;
	}
	const profile = _win.profile;
	if (!_detached && _el && profile.direction && profile.direction(direction, _el, _win)) {
		_hintsAt = -Infinity;
		return;
	}
	// A slider or a drop-down list: left and right change its value
	if (!_detached && _el && ValueInput.step(_el, direction)) {
		_hintsAt = -Infinity;
		return;
	}
	if (!_detached && profile.scroll && (direction === 'up' || direction === 'down')) {
		if (Scan.scrollBy(_win.root.querySelector(profile.scroll), direction)) {
			return;
		}
	}

	const from =
		_detached || !_el
			? { left: Mouse.screen.x, top: Mouse.screen.y, right: Mouse.screen.x + 1, bottom: Mouse.screen.y + 1 }
			: _el.getBoundingClientRect();
	const list = Scan.focusables(_win);
	const own = entriesOf(
		_win,
		list.filter(el => el !== _el || _detached)
	);

	let next = SpatialNav.findNext(from, own, direction);
	if (!next) {
		const others = [];
		neighbours(_win).forEach(win => others.push(...entriesOf(win, Scan.focusables(win))));
		next = SpatialNav.findNext(from, others, direction);
	}
	if (!next && profile.wrap) {
		next = SpatialNav.findWrap(from, own, direction);
	}
	if (next) {
		_tabFocus = null;
		setFocus(next.win, next.el, next.win === _win ? list : Scan.focusables(next.win));
	}
}

function pressGeneric(el) {
	if (ValueInput.isSlider(el)) {
		// Left and right move it; there is nothing to press
		return;
	}
	if (el.matches('select')) {
		if (el.options.length) {
			el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
			el.dispatchEvent(new Event('change', { bubbles: true }));
		}
		return;
	}
	const typed =
		'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), ' +
		'textarea, [contenteditable="true"]';
	if (el.matches(typed)) {
		// Typed into with the on-screen keyboard; what it does not take (a file
		// or colour picker) gets the focus, for a real keyboard
		if (!Keyboard.open(el)) {
			el.focus();
			if (el.select) {
				el.select();
			}
		}
		return;
	}
	Events.press(Scan.eventTarget(el));
}

/**
 * A: the profile's action, else a click on the element. Off the ring, a
 * click at the cursor.
 */
function activate() {
	if (_detached) {
		Cursor.leftClick();
		return;
	}
	if (!_el || !_win) {
		return;
	}
	parkCursor();
	const profile = _win.profile;
	// A window this opens (BasicInfo's buttons, Escape's settings) gets the focus
	_followUntil = _frameTime + FOLLOW_MS;
	if (!(profile.primary && profile.primary(_el, _win))) {
		pressGeneric(_el);
	}
	_hintsAt = -Infinity;
}

/**
 * A window's cancel or close button.
 */
function findClose(win) {
	for (let i = 0; i < CLOSE.length; i++) {
		const found = Array.from(win.root.querySelectorAll(CLOSE[i])).find(el => Scan.isUsable(el, win.host));
		if (found) {
			return found;
		}
	}
	return null;
}

/**
 * The info windows open now (an item's, a skill's: what Y opens), when B
 * would close them: not while a dialogue has the focus, which gets B.
 */
function infoToClose() {
	if (_win && _win.profile.dialog) {
		return [];
	}
	return Scan.listWindows().filter(win => win.profile.info);
}

/**
 * Close a window with its own close button, else as its component.
 */
function closeWindow(win) {
	// Gone already: closed with another (ItemInfo takes its compare window along)
	if (!Scan.isOpen(win)) {
		return;
	}
	const close = findClose(win);
	if (close) {
		Events.press(close);
		return;
	}
	const component = componentOf(win);
	if (component && component.remove) {
		component.remove();
	}
}

/**
 * B: the info windows Y opened, all at once; else the profile's back, else
 * the window's cancel or close button, else out of menus (never from a
 * dialogue, which wants an answer).
 */
function back() {
	const popups = infoToClose();
	if (popups.length) {
		popups.forEach(closeWindow);
		_hintsAt = -Infinity;
		return;
	}
	if (!_win) {
		exit();
		return;
	}
	const profile = _win.profile;
	if (profile.back && profile.back(_win, _el)) {
		_hintsAt = -Infinity;
		return;
	}
	const close = findClose(_win);
	if (close) {
		Events.press(close);
		_hintsAt = -Infinity;
		return;
	}
	if (!profile.dialog) {
		exit();
	}
}

/**
 * The item's or skill's info window, as a right click opens it.
 */
function infoOn(el) {
	if (!el) {
		return;
	}
	parkCursor(el);
	Events.contextMenu(Scan.eventTarget(el));
}

/**
 * Y: info of the focused element, or of what the cursor is on.
 */
function info() {
	if (_detached) {
		Cursor.contextMenu();
		return;
	}
	infoOn(_el);
}

/**
 * LT / RT: the next window to the left or right.
 */
function cycleWindow(delta) {
	const wins = navigableWindows();
	if (!wins.length) {
		return;
	}
	let index = _win ? wins.findIndex(win => win.host === _win.host) : -1;
	index = index === -1 ? 0 : (index + delta + wins.length) % wins.length;
	if (_win && wins[index].host === _win.host && !_detached) {
		return;
	}
	_tabFocus = null;
	focusWindow(wins[index]);
}

/**
 * LB / RB: the window's previous or next tab. From a tab, the focus stays
 * on the tabs; from anywhere else it goes into what the tab shows, once it
 * is drawn (settleTabFocus).
 */
function switchTab(delta) {
	if (!_win) {
		return;
	}
	const focused = _detached ? null : _el;
	const next = Tabs.step(_win, focused, delta);
	if (!next) {
		return;
	}
	const fromTab = !!focused && Tabs.isTab(focused, _win);
	const before = new Set(Scan.focusables(_win));
	Events.press(Scan.eventTarget(next.tab));
	Tabs.remember(_win, next.index);
	_hintsAt = -Infinity;
	if (fromTab) {
		const list = Scan.focusables(_win);
		if (list.indexOf(next.tab) !== -1) {
			setFocus(_win, next.tab, list);
		}
		return;
	}
	_tabFocus = { host: _win.host, before, until: _frameTime + TAB_FOCUS_MS };
}

/**
 * After a tab switch: the focus goes to the first item the tab drew (or
 * showed), and to the open tab if it drew nothing.
 */
function settleTabFocus(now) {
	const pending = _tabFocus;
	if (!pending) {
		return;
	}
	if (!_win || _win.host !== pending.host || !Scan.isOpen(_win)) {
		_tabFocus = null;
		return;
	}
	const list = Scan.focusables(_win);
	const fresh = list.filter(el => !pending.before.has(el) && !Tabs.isTab(el, _win) && !el.closest('.titlebar'));
	if (fresh.length) {
		const items = fresh.filter(el => el.matches('[data-index], .item, .skill'));
		_tabFocus = null;
		setFocus(_win, firstOf(items.length ? items : fresh), list);
		return;
	}
	if (now >= pending.until) {
		_tabFocus = null;
		const open = Tabs.activeTab(_win);
		if (open && list.indexOf(open) !== -1) {
			setFocus(_win, open, list);
		}
	}
}

// ---------------------------------------------------------------------------
// X: the action menu, and carrying
// ---------------------------------------------------------------------------

/**
 * What action menu entries may call.
 */
function actionContext() {
	return {
		pickUp: el => startCarry(el),
		info: el => infoOn(el),
		pickSlot: _pickSlot ? el => afterRelease(() => _pickSlot(el)) : null
	};
}

/**
 * The element an entry chosen later runs on: the same one, or, if its
 * window drew it anew meanwhile, the one now in its place.
 */
function resolver(el, win, key) {
	return () => {
		if (el.isConnected || !Scan.isOpen(win)) {
			return el;
		}
		return Scan.findByKey(Scan.focusables(win), key) || el;
	};
}

/**
 * X tapped: what can be done with the focused element, as a menu.
 */
function openActions() {
	if (_detached || !_el || !_win || Carry.isCarrying()) {
		return;
	}
	const entries = ActionMenu.entriesFor(_el, _win, actionContext());
	if (!entries.length) {
		return;
	}
	parkCursor();
	const menu = ActionMenu.open(entries, _el.getBoundingClientRect(), resolver(_el, _win, _key));
	if (menu) {
		focusComponent(menu);
	}
}

/**
 * Pick an element up (X held, Move…).
 *
 * @return {boolean} whether something is carried now
 */
function startCarry(el) {
	if (!el || !Carry.pickUp(el)) {
		return false;
	}
	_hintsAt = -Infinity;
	refresh();
	return true;
}

/**
 * A (or X) while carrying: put it down on the focused element, or where
 * the cursor is (the map: on the ground).
 */
function placeCarried() {
	let target = null;
	if (_detached) {
		target = Cursor.elementAtCursor ? Cursor.elementAtCursor() : null;
	} else if (_el) {
		parkCursor();
		target = _el;
	}
	if (target) {
		Carry.place(target);
	} else {
		Carry.cancel();
	}
	_hintsAt = -Infinity;
	refresh();
}

function cancelCarry() {
	Carry.cancel();
	_hintsAt = -Infinity;
	refresh();
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function genericLabel(el) {
	if (ValueInput.isSlider(el)) {
		return '';
	}
	if (el.matches('input[type="checkbox"], input[type="radio"], .checkbox')) {
		return 'Toggle';
	}
	if (el.matches('select')) {
		return 'Next option';
	}
	if (el.matches('input, textarea, [contenteditable="true"]')) {
		return 'Type';
	}
	return 'Select';
}

function backLabel() {
	if (infoToClose().length) {
		return 'Close info';
	}
	const profile = _win.profile;
	if (profile.backLabel) {
		return profile.backLabel(_win);
	}
	if (findClose(_win)) {
		return 'Close';
	}
	return profile.dialog ? '' : 'Exit';
}

function hints() {
	const list = [];
	if (!_win) {
		return list;
	}
	const tabs = Tabs.tabsOf(_win, _detached ? null : _el).length > 0;
	if (Carry.isCarrying()) {
		list.push([BTN.A, 'Place'], [BTN.B, 'Cancel']);
		if (tabs) {
			list.push([[BTN.LB, BTN.RB], 'Tab']);
		}
		list.push([[BTN.LT, BTN.RT], 'Window']);
		return list;
	}
	if (_detached) {
		list.push([BTN.A, 'Click'], [BTN.Y, 'Info']);
	} else if (_el) {
		const profile = _win.profile;
		let label = profile.primaryLabel ? profile.primaryLabel(_el, _win) : null;
		if (label === null || label === undefined) {
			label = genericLabel(_el);
		}
		list.push([BTN.A, label]);
		list.push(...ValueInput.hints(_el));
		if (ActionMenu.entriesFor(_el, _win, actionContext()).length) {
			list.push([BTN.X, ActionMenu.canMove(_el, _win) ? 'Actions (hold: Move)' : 'Actions']);
		}
		if (Scan.isItemLike(_el)) {
			list.push([BTN.Y, 'Info']);
		}
		if (profile.hints) {
			list.push(...profile.hints(_el, _win));
		}
	}
	const backText = backLabel();
	list.push([BTN.B, backText]);
	if (tabs) {
		list.push([[BTN.LB, BTN.RB], 'Tab']);
	}
	list.push([[BTN.LT, BTN.RT], 'Window']);
	if (backText !== 'Exit') {
		list.push([BTN.VIEW, 'Exit']);
	}
	return list;
}

function refresh(now) {
	if (!_active) {
		return;
	}
	const carrying = Carry.isCarrying();
	// A focused element just taken away (X's menu, once an entry is chosen) is
	// not drawn: the next frame finds where the focus goes
	if (_detached || !_el || !_el.isConnected) {
		Overlay.hideRing();
		const x = Mouse.screen.x;
		const y = Mouse.screen.y;
		Carry.moveGhost(_detached ? { left: x, top: y, right: x + 1, bottom: y + 1 } : null);
	} else {
		const rect = _el.getBoundingClientRect();
		Overlay.showRing(rect, carrying ? 'carry' : 'focus');
		Carry.moveGhost(rect);
	}
	const time = typeof now === 'number' ? now : performance.now();
	if (time - _hintsAt >= HINTS_EVERY_MS) {
		_hintsAt = time;
		Overlay.showHints(hints());
	}
}

// ---------------------------------------------------------------------------
// On and off
// ---------------------------------------------------------------------------

/**
 * Turn menu navigation on.
 *
 * @param {?object} win the window to start in; null: the frontmost
 * @param {boolean} auto turned on by a dialogue or a window the gamepad opened, not by hand
 * @return {boolean} whether it is on now
 */
function enter(win, auto) {
	if (!enabled()) {
		return false;
	}
	const target = win || pickWindow();
	if (!target) {
		return false;
	}
	_active = true;
	_auto = !!auto;
	_visited = [];
	_detached = false;
	_repeatButton = -1;
	_skillWait = Mouse.state === Mouse.MOUSE_STATE.USESKILL;
	if (!focusWindow(target)) {
		exit();
		return false;
	}
	return true;
}

function exit() {
	if (_el) {
		Events.hover(Scan.eventTarget(_el), false);
	}
	// The press that ended menus (A on a dialogue's last button) is not the map's
	if (_active) {
		claimDown();
	}
	Carry.cancel();
	// A slider's change waiting for its steps to stop goes out now
	ValueInput.flush();
	_active = false;
	_auto = false;
	_win = null;
	_el = null;
	_key = null;
	_detached = false;
	_repeatButton = -1;
	_visited = [];
	_tabFocus = null;
	_xHoldFired = false;
	_xTaken = false;
	Overlay.hide();
}

function toggle() {
	if (_active) {
		exit();
	} else {
		enter(null, false);
	}
}

/**
 * Newly opened dialogues take the focus, and menu navigation turns on for
 * one if the gamepad was used last. A window that opens just after A (a
 * BasicInfo button, an Escape setting) takes the focus too.
 *
 * @param {number} now
 */
function scanWindows(now) {
	const wins = Scan.listWindows();
	const dialogs = new Set();
	const known = new Set();
	let fresh = null;
	let opened = null;
	wins.forEach(win => {
		known.add(win.host);
		if (skipped(win)) {
			return;
		}
		if (win.profile.dialog || win.profile.takesFocus) {
			// One with nothing to press yet (an NPC box before its buttons) is not open yet
			if (!Scan.focusables(win).length) {
				return;
			}
			dialogs.add(win.host);
			if (!fresh && !_dialogs.has(win.host)) {
				fresh = win;
			}
		} else if (!opened && _active && now < _followUntil && !_known.has(win.host)) {
			if (Scan.focusables(win).length) {
				opened = win;
			}
		}
	});
	_dialogs = dialogs;
	_known = known;

	if (fresh) {
		if (_active) {
			focusWindow(fresh);
		} else if (isEngaged()) {
			enter(fresh, true);
		}
	} else if (opened) {
		focusWindow(opened);
	}
}

/**
 * The buttons down now stay away from the map until let go.
 */
function claimDown() {
	for (let i = 0; i < _down.length; i++) {
		if (_down[i]) {
			_claimed.add(i);
		}
	}
}

/**
 * The gamepad opened a window (View + A / B / X / Y, X's menu): menu
 * navigation goes into it.
 *
 * @param {object} component a GUIComponent
 */
function focusComponent(component) {
	if (!enabled() || !component || !component._host) {
		return;
	}
	const host = component._host;
	if (host.parentNode !== document.body || !Scan.isShown(host)) {
		return;
	}
	const win = Scan.describe(host);
	if (skipped(win)) {
		return;
	}
	// Known from now on: the next scan must not take it for a new dialogue
	// and move the focus back to where it starts (X's menu, opened a moment ago)
	_known.add(host);
	if (win.profile.dialog || win.profile.takesFocus) {
		_dialogs.add(host);
	}
	if (_active) {
		focusWindow(win);
	} else {
		enter(win, true);
	}
}

/**
 * One animation frame, with the pad (JoystickCursorMotion).
 *
 * @param {Gamepad} gp
 * @param {number} [now] the frame's time
 */
function frame(gp, now) {
	const time = typeof now === 'number' ? now : performance.now();
	_frameTime = time;
	const down = readButtons(gp);
	const events = track(down, time);
	noteActivity(gp, down, time);
	runAfterRelease();

	// The on-screen keyboard has every button while it is open, menus or not
	// (it also opens on the chat). What is still held when it closes (Menu
	// that entered the text, B that closed it) stays away from the map.
	if (Keyboard.isOpen()) {
		claimDown();
		Keyboard.frame(gp, events, down, time);
		Overlay.hideHints();
		_hintsAt = -Infinity;
		return;
	}

	// Presses act only in menus that were already on: not the A that opened a dialogue
	const wasActive = _active;
	if (wasActive) {
		claimDown();
	}

	// The emote grid, the slot picker and a button remap take every button
	const owned = EmoteGrid.isActive() || SelectionUI.active() || ButtonMap.isCapturing();
	if (!owned) {
		handleView(events, time);
	}

	const waiting = Mouse.state === Mouse.MOUSE_STATE.USESKILL;
	if (!enabled()) {
		if (_active) {
			exit();
		}
		_skillWait = waiting;
		return;
	}

	if (time - _scanAt >= SCAN_EVERY_MS) {
		_scanAt = time;
		scanWindows(time);
	}

	if (!_active) {
		_skillWait = waiting;
		return;
	}

	// A skill now waits for a target on the map: the map's controls pick it
	if (waiting && !_skillWait) {
		_skillWait = true;
		exit();
		return;
	}
	_skillWait = waiting;

	settleTabFocus(time);
	validate(time);
	if (!_active) {
		return;
	}
	if (!owned && wasActive) {
		handleButtons(events, time);
	}
	refresh(time);
}

function onMouseMove(event) {
	if (!event.isTrusted) {
		return;
	}
	const x = event.clientX;
	const y = event.clientY;
	if (isNaN(_mouseX)) {
		_mouseX = x;
		_mouseY = y;
		return;
	}
	if (Math.hypot(x - _mouseX, y - _mouseY) < MOUSE_MOVE_PX) {
		return;
	}
	_mouseX = x;
	_mouseY = y;
	_lastMouseAt = performance.now();
	if (_active) {
		exit();
	}
}

/**
 * @param {object} [options]
 * @param {function(Element): boolean} [options.pickSlot] opens the gamepad slot picker for an
 *   inventory item or a skill (JoystickInteractionService.openSelectionWindow): X's "Gamepad slot…"
 */
function prepare(options) {
	_pickSlot = (options && options.pickSlot) || null;
	if (_listening || typeof window === 'undefined') {
		return;
	}
	window.addEventListener('mousemove', onMouseMove, { passive: true });
	_listening = true;
}

function dispose() {
	Keyboard.close();
	exit();
	if (_listening) {
		window.removeEventListener('mousemove', onMouseMove);
		_listening = false;
	}
	Overlay.dispose();
	_down = [];
	_downAt = [];
	_used = [];
	_claimed = new Set();
	_armed = new Set();
	_dialogs = new Set();
	_known = new Set();
	_followUntil = -Infinity;
	_scanAt = -Infinity;
	_hintsAt = -Infinity;
	_lostAt = -Infinity;
	_lastPadAt = 0;
	_lastMouseAt = 0;
	_mouseX = NaN;
	_mouseY = NaN;
	_skillWait = false;
	_viewHoldFired = false;
	_viewArmed = false;
	_afterRelease = [];
	_pickSlot = null;
}

export default {
	prepare,
	dispose,
	frame,
	enter(win) {
		return enter(win || null, false);
	},
	exit,
	toggle,
	focusComponent,
	/**
	 * The right stick moved the cursor (JoystickCursorMotion), in menus.
	 */
	cursorMoved() {
		if (_active) {
			followCursor();
			refresh();
		}
	},
	isActive() {
		return _active;
	},
	/**
	 * Whether a button belongs to menu navigation: down while it was on, and
	 * not let go since. JoystickButtonInput keeps such a press off the map.
	 *
	 * @param {number} button logical button
	 * @return {boolean}
	 */
	isClaimed(button) {
		return _active || _claimed.has(button);
	},
	/**
	 * The focused element and window, for tests and the settings window.
	 */
	getFocus() {
		return { win: _win, el: _el, detached: _detached, auto: _auto, carrying: Carry.isCarrying() };
	}
};
