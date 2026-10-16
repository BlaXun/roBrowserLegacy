/**
 * UI/Components/JoystickUI/JoystickActionMenu.js
 *
 * X in menus: what can be done with the focused item, skill or slot, listed
 * in the client's right-click menu (ContextMenu), which menu navigation then
 * moves through like any other window.
 *
 * The entries are the window's own (its profile's `actions`: use, store,
 * take some, put on a gamepad slot...), then the two every item has:
 * Move… (pick it up, JoystickCarry: A puts it down) and Info.
 */

import UIManager from 'UI/UIManager.js';
import Scan from './JoystickFocusScan.js';
import Carry from './JoystickCarry.js';

const GAP = 4; // px between the element and the menu

/**
 * Whether the element can be picked up: what its profile says, else
 * whether it is draggable.
 *
 * @param {Element} el
 * @param {object} win
 * @return {boolean}
 */
function canMove(el, win) {
	if (!el) {
		return false;
	}
	const profile = (win && win.profile) || {};
	if (profile.canMove) {
		return !!profile.canMove(el, win);
	}
	return Carry.canPickUp(el);
}

/**
 * The entries for an element.
 *
 * @param {Element} el
 * @param {object} win
 * @param {object} ctx what entries may call: pickUp(el), info(el), pickSlot(el) (null without a slot picker)
 * @return {Array<{label: string, run: function(Element)}>}
 */
function entriesFor(el, win, ctx) {
	if (!el || !win) {
		return [];
	}
	const profile = win.profile || {};
	const out = profile.actions ? (profile.actions(el, win, ctx) || []).filter(Boolean) : [];
	if (canMove(el, win)) {
		out.push({ label: 'Move…', run: live => ctx.pickUp(live) });
	}
	if (Scan.isItemLike(el)) {
		out.push({ label: 'Info', run: live => ctx.info(live) });
	}
	return out;
}

function contextMenu() {
	try {
		return UIManager.getComponent('ContextMenu');
	} catch {
		return null;
	}
}

/**
 * Put the menu beside a rectangle, on screen.
 */
function placeBeside(ui, rect) {
	const root = ui.getRoot ? ui.getRoot() : null;
	const box = root ? root.querySelector('.menu') : null;
	if (!box || !rect) {
		return;
	}
	const width = box.offsetWidth;
	const height = box.offsetHeight;
	let x = rect.right + GAP;
	if (x + width > window.innerWidth) {
		x = Math.max(0, rect.left - width - GAP);
	}
	const y = Math.max(0, Math.min(rect.top, window.innerHeight - height));
	box.style.left = Math.round(x) + 'px';
	box.style.top = Math.round(y) + 'px';
}

/**
 * Show entries as a menu beside the element they are for. An entry runs
 * on the element as it is then: resolve() finds it again if its window
 * drew it anew meanwhile.
 *
 * @param {Array<{label: string, run: function(Element)}>} entries
 * @param {DOMRect} rect the element's rectangle
 * @param {function(): Element} resolve
 * @return {?object} the ContextMenu component; null when there is nothing to show
 */
function open(entries, rect, resolve) {
	const ui = contextMenu();
	if (!ui || !entries.length) {
		return null;
	}
	ui.remove();
	ui.append();
	entries.forEach(entry =>
		ui.addElement(entry.label, () => {
			try {
				entry.run(resolve());
			} catch (error) {
				console.error('[JoystickActionMenu] ' + entry.label + ' failed', error);
			}
		})
	);
	placeBeside(ui, rect);
	return ui;
}

export default {
	canMove,
	entriesFor,
	open
};
