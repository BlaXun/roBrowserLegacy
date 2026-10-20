/**
 * UI/Components/JoystickUI/JoystickFocusTabs.js
 *
 * A window's tabs, for LB / RB in menus (JoystickUIFocus): which of its
 * controls are tabs, which tab is open, and the one before or after it.
 *
 * Tabs are found by how this client's windows draw them: controls standing
 * in a tab strip (`.tabs`, `.tab-manager`, `.action_tabs`, `#panel-menu`,
 * `[role="tablist"]`), and controls that are tabs themselves (`.tab`,
 * `.tab-button`, the skill list's `.tab-label`). The strip of the focused
 * tab is used, else the window's first strip of two tabs or more. A profile
 * names a window's tabs when their look does not say (`tabs`), and which one
 * is open when nothing on them shows it (`activeTab`).
 *
 * The open tab is the one the profile names, else one drawn as open
 * (selected, active, selectedtab, aria-selected; a label whose radio button
 * is checked), else the last one switched to with the gamepad.
 */

import Scan from './JoystickFocusScan.js';

/**
 * Containers that hold a row (or column) of tabs.
 */
const STRIP = ['.tabs', '.tabs-mini', '.tab-manager', '.action_tabs', '#panel-menu', '[role="tablist"]'].join(',');

/**
 * Controls that are tabs whatever holds them.
 */
const TAB = ['.tab', '.tab-button', '.tab-label', '.tab-label-mini', '[role="tab"]'].join(',');

/**
 * What a mouse user clicks to open a tab.
 */
const CONTROL = ['button', 'ui-button', 'a[href]', 'label[for]', TAB].join(',');

/**
 * An element holding one of these is a tab's wrapper, not the tab (the
 * skill list's `.tab` around its label, Equipment's around its link).
 */
const INNER = 'button, ui-button, a[href], label[for]';

/**
 * Drawn as the open tab.
 */
const OPEN = ['.selected', '.active', '.selectedtab', '[aria-selected="true"]'].join(',');

/**
 * Tabs that will not open (a guild tab the player may not see).
 */
const REFUSED = '.denied, .disabled, [disabled]';

const _last = new WeakMap(); // window host: index of the tab last switched to

/**
 * Whether an element is one of a window's tabs.
 *
 * @param {Element} el
 * @param {object} [win] its window: its profile may name the tabs
 * @return {boolean}
 */
function isTab(el, win) {
	if (!el) {
		return false;
	}
	const profile = (win && win.profile) || {};
	if (profile.tabs) {
		return el.matches(profile.tabs);
	}
	if (!el.matches(CONTROL) || el.querySelector(INNER)) {
		return false;
	}
	if (el.matches(TAB)) {
		return true;
	}
	const parent = el.parentElement;
	return !!parent && (parent.matches(STRIP) || parent.matches('.tab'));
}

/**
 * The strip a tab belongs to: the nearest strip around it, else what holds it.
 */
function stripOf(el) {
	const parent = el.parentElement;
	if (!parent) {
		return null;
	}
	return parent.closest(STRIP) || (parent.matches('.tab') ? parent.parentElement : parent);
}

/**
 * The tabs that can be switched to now: shown, in page order, from the
 * focused tab's strip, else from the first strip with two tabs or more.
 *
 * @param {object} win from JoystickFocusScan
 * @param {?Element} focused the focused element
 * @return {Array<Element>} empty: the window has no tabs
 */
function tabsOf(win, focused) {
	if (!win || !win.root) {
		return [];
	}
	const profile = win.profile || {};
	const cache = new Map();
	const shown = Array.from(win.root.querySelectorAll(profile.tabs || CONTROL)).filter(
		el => isTab(el, win) && Scan.isUsable(el, win.host, cache)
	);
	if (profile.tabs) {
		return shown.length > 1 ? shown : [];
	}

	const strips = new Map();
	shown.forEach(el => {
		const strip = stripOf(el);
		if (!strips.has(strip)) {
			strips.set(strip, []);
		}
		strips.get(strip).push(el);
	});
	if (focused && shown.indexOf(focused) !== -1) {
		const own = strips.get(stripOf(focused));
		if (own.length > 1) {
			return own;
		}
	}
	for (const list of strips.values()) {
		if (list.length > 1) {
			return list;
		}
	}
	return [];
}

function isDrawnOpen(el) {
	if (el.matches(OPEN)) {
		return true;
	}
	if (el.tagName === 'LABEL') {
		const id = el.getAttribute('for');
		const root = el.getRootNode();
		const control = id && root.getElementById ? root.getElementById(id) : null;
		return !!control && !!control.checked;
	}
	return false;
}

/**
 * The index of the open tab, -1 when nothing says which.
 *
 * @param {object} win
 * @param {Array<Element>} tabs from tabsOf()
 * @return {number}
 */
function activeIndex(win, tabs) {
	const profile = win.profile || {};
	if (profile.activeTab) {
		const index = profile.activeTab(tabs, win);
		if (index >= 0 && index < tabs.length) {
			return index;
		}
	}
	const drawn = tabs.findIndex(isDrawnOpen);
	if (drawn !== -1) {
		return drawn;
	}
	const last = _last.get(win.host);
	return last !== undefined && last < tabs.length ? last : -1;
}

/**
 * The tab one step away from the open one, past those that will not open;
 * the first or the last when none is known to be open. It wraps around.
 *
 * @param {object} win
 * @param {?Element} focused
 * @param {number} delta 1: next, -1: previous
 * @return {?{tab: Element, index: number}} null: no tabs, or none other to go to
 */
function step(win, focused, delta) {
	const tabs = tabsOf(win, focused);
	if (!tabs.length) {
		return null;
	}
	const open = activeIndex(win, tabs);
	let index = open;
	for (let i = 0; i < tabs.length; i++) {
		if (index === -1) {
			index = delta > 0 ? 0 : tabs.length - 1;
		} else {
			index = (index + delta + tabs.length) % tabs.length;
		}
		if (index === open) {
			return null;
		}
		if (!tabs[index].matches(REFUSED)) {
			return { tab: tabs[index], index };
		}
	}
	return null;
}

/**
 * The open tab, if it is known.
 *
 * @param {object} win
 * @return {?Element}
 */
function activeTab(win) {
	const tabs = tabsOf(win, null);
	const index = tabs.length ? activeIndex(win, tabs) : -1;
	return index === -1 ? null : tabs[index];
}

/**
 * Remember the tab switched to, for windows that do not draw which is open.
 *
 * @param {object} win
 * @param {number} index
 */
function remember(win, index) {
	if (win && win.host) {
		_last.set(win.host, index);
	}
}

export default {
	isTab,
	tabsOf,
	activeIndex,
	activeTab,
	step,
	remember
};
