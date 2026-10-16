/**
 * UI/Components/JoystickUI/JoystickFocusScan.js
 *
 * What menu navigation can focus: the open windows, and in each the
 * elements a mouse user would click.
 *
 * Windows are found in the page, not in UIManager: message and prompt boxes
 * are unregistered clones (UIManager.showMessageBox), and Storage's filter
 * windows are never registered. A window is a GUIComponent host, a child of
 * <body> whose shadow root holds a `.ui-component-root`. Windows nested in
 * another window's shadow root (SwitchEquip inside Equipment) count as part
 * of it.
 *
 * In a window the candidates are the controls GUIComponent itself treats as
 * clickable (its CLICKABLE_SELECTOR), plus anything with a `data-index`: the
 * item, skill and row elements of every list. A profile
 * (JoystickWindowProfiles) can add selectors or take some out. Hidden,
 * disabled and invisible ones (opacity 0, no pointer events, clipped away
 * by an `overflow: hidden` parent) are left out; ones scrolled out of a
 * list stay in, and are scrolled into view when the focus reaches them.
 * While something is carried (JoystickCarry), a profile's drop zones count
 * too: the places a window takes a drop that have nothing to focus in them.
 */

import { deepElementFromPoint } from 'UI/TouchDrag.js';
import Profiles from './JoystickWindowProfiles.js';
import Carry from './JoystickCarry.js';

/**
 * Elements a mouse user would click.
 */
const FOCUSABLE = [
	'button',
	'ui-button',
	'a[href]',
	'input:not([type="hidden"])',
	'select',
	'textarea',
	'label[for]',
	'[contenteditable="true"]',
	'.checkbox',
	'.item-link',
	'.navi-link',
	'[data-index]'
].join(',');

/**
 * Never focused: scrollbar parts, and the title bar's base button, which
 * only stops a drag from starting.
 */
const NEVER = ['.ro-custom-scrollbar', '.ro-custom-scrollbar *', '.titlebar .base'].join(',');

/**
 * Hosts that are no window to navigate: the gamepad's slot picker, which
 * reads the pad itself. (The gamepad HUD is one, skipped by its profile
 * except as a place to put what is carried.)
 */
const NOT_WINDOWS = new Set(['JoystickSelectionUI']);

/**
 * Data attributes that name an element in its window, best first.
 */
const KEY_ATTRIBUTES = ['data-index', 'data-id', 'data-group', 'data-tab', 'data-title', 'data-skin', 'data-motion'];

/**
 * Classes that only say what state an element is in, left out of its key.
 */
const STATE_CLASSES = new Set(['pad-hover', 'selected', 'select', 'active', 'hover', 'focus', 'on', 'off']);

/**
 * Two boxes this much the same are one control: the inner one is kept.
 */
const SAME_BOX = 0.9;

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

function isWindowHost(el) {
	const root = el && el.shadowRoot;
	if (!root) {
		return false;
	}
	for (let i = 0; i < root.children.length; i++) {
		if (root.children[i].classList && root.children[i].classList.contains('ui-component-root')) {
			return true;
		}
	}
	return false;
}

/**
 * Whether a host is in the page and not hidden.
 */
function isShown(host) {
	if (!host || !host.isConnected || host.style.display === 'none') {
		return false;
	}
	const style = getComputedStyle(host);
	return style.display !== 'none' && style.visibility !== 'hidden';
}

function zIndexOf(host) {
	const z = parseInt(host.style.zIndex || getComputedStyle(host).zIndex, 10);
	return isNaN(z) ? 0 : z;
}

/**
 * A window: its host, shadow root, name (the component name, the host's id) and profile.
 *
 * @param {HTMLElement} host
 * @return {object}
 */
function describe(host) {
	return {
		host,
		root: host.shadowRoot,
		name: host.id,
		profile: Profiles.forName(host.id)
	};
}

/**
 * The open windows, topmost first.
 *
 * @return {Array<object>}
 */
function listWindows() {
	if (typeof document === 'undefined' || !document.body) {
		return [];
	}
	const hosts = [];
	const children = document.body.children;
	for (let i = 0; i < children.length; i++) {
		const el = children[i];
		if (!NOT_WINDOWS.has(el.id) && isWindowHost(el) && isShown(el)) {
			hosts.push(el);
		}
	}
	return hosts
		.map((host, order) => ({ host, order, z: zIndexOf(host) }))
		.sort((a, b) => b.z - a.z || b.order - a.order)
		.map(entry => describe(entry.host));
}

/**
 * Whether a window is still open.
 */
function isOpen(win) {
	return !!win && isShown(win.host);
}

/**
 * The window an element belongs to: the <body> child whose shadow tree holds it.
 *
 * @param {Element} el
 * @return {?object}
 */
function windowOf(el) {
	let node = el;
	while (node) {
		const root = node.getRootNode ? node.getRootNode() : null;
		if (!root || !root.host) {
			return null;
		}
		const host = root.host;
		if (host.parentNode === document.body && isWindowHost(host)) {
			return NOT_WINDOWS.has(host.id) ? null : describe(host);
		}
		node = host;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Focusable elements
// ---------------------------------------------------------------------------

/**
 * The parent of a node, stepping out of a shadow root to its host.
 */
function parentOf(node) {
	if (node.parentElement) {
		return node.parentElement;
	}
	const root = node.getRootNode ? node.getRootNode() : null;
	return root && root.host ? root.host : null;
}

function clipsAxis(value) {
	return value === 'hidden' || value === 'clip';
}

/**
 * Whether an `overflow: hidden` parent (up to and with the window host) cuts
 * the element off entirely. A scrolling parent does not: the element is
 * scrolled into view when focused.
 *
 * @param {Element} el
 * @param {DOMRect} rect the element's rectangle
 * @param {HTMLElement} host the window host, the last parent looked at
 * @param {Map} cache per-scan clip info by element
 * @return {boolean}
 */
function isClippedAway(el, rect, host, cache) {
	let node = parentOf(el);
	while (node) {
		let info = cache.get(node);
		if (!info) {
			const style = getComputedStyle(node);
			const x = clipsAxis(style.overflowX) || clipsAxis(style.overflow);
			const y = clipsAxis(style.overflowY) || clipsAxis(style.overflow);
			info = { x, y, rect: x || y ? node.getBoundingClientRect() : null };
			cache.set(node, info);
		}
		if (info.y && (rect.bottom <= info.rect.top || rect.top >= info.rect.bottom)) {
			return true;
		}
		if (info.x && (rect.right <= info.rect.left || rect.left >= info.rect.right)) {
			return true;
		}
		if (node === host) {
			return false;
		}
		node = parentOf(node);
	}
	return false;
}

/**
 * Whether an element can take the focus: shown, enabled, visible, and not clipped away.
 *
 * @param {Element} el
 * @param {HTMLElement} host its window's host
 * @param {Map} [cache] clip info, shared within one scan
 * @return {boolean}
 */
function isUsable(el, host, cache) {
	if (!el || !el.isConnected) {
		return false;
	}
	if (el.disabled || el.hasAttribute('disabled')) {
		return false;
	}
	// Buttons drawn as switched off (Trade's .btn.ok.disabled, Emoticons' paging)
	if (el.classList.contains('disabled') && el.matches('button, ui-button, .btn')) {
		return false;
	}
	const rect = el.getBoundingClientRect();
	if (!rect.width || !rect.height) {
		return false;
	}
	const style = getComputedStyle(el);
	if (style.visibility === 'hidden' || style.pointerEvents === 'none' || parseFloat(style.opacity) === 0) {
		return false;
	}
	return !isClippedAway(el, rect, host, cache || new Map());
}

/**
 * Every element in a shadow root matching a selector, and in the shadow roots nested in it.
 */
function collect(root, selector, out) {
	root.querySelectorAll(selector).forEach(el => out.push(el));
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (node.shadowRoot) {
			collect(node.shadowRoot, selector, out);
		}
	}
	return out;
}

function area(rect) {
	return Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
}

function overlap(a, b) {
	const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
	const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
	return w > 0 && h > 0 ? w * h : 0;
}

/**
 * A label stands in for its control only while the control itself is not
 * shown: the CSS tabs of the skill list are labels for hidden radio buttons.
 */
function isRedundantLabel(el, root, host, cache) {
	if (el.tagName !== 'LABEL') {
		return false;
	}
	const id = el.getAttribute('for');
	const control = id && root.getElementById ? root.getElementById(id) : null;
	return !!control && isUsable(control, host, cache);
}

/**
 * What to take in a window, and what to leave out, by its profile.
 *
 * @param {object} profile
 * @return {{selector: string, exclude: string}}
 */
function selectorsOf(profile) {
	let selector = profile.only || (profile.items ? FOCUSABLE + ',' + profile.items : FOCUSABLE);
	if (profile.dropZones && Carry.isCarrying()) {
		selector += ',' + profile.dropZones;
	}
	return { selector, exclude: profile.exclude ? NEVER + ',' + profile.exclude : NEVER };
}

/**
 * The focusable elements of a window, in page order.
 *
 * @param {object} win from listWindows() / windowOf()
 * @return {Array<Element>}
 */
function focusables(win) {
	if (!win || !win.root) {
		return [];
	}
	const { selector, exclude } = selectorsOf(win.profile || {});
	const cache = new Map();

	const seen = new Set();
	const candidates = [];
	collect(win.root, selector, []).forEach(el => {
		if (seen.has(el)) {
			return;
		}
		seen.add(el);
		if (el.matches(exclude) || !isUsable(el, win.host, cache)) {
			return;
		}
		if (isRedundantLabel(el, el.getRootNode(), win.host, cache)) {
			return;
		}
		candidates.push(el);
	});

	// A control drawn on the whole of another (a button filling its row) is one stop, the inner one
	const set = new Set(candidates);
	const rects = new Map();
	const rectOf = el => {
		if (!rects.has(el)) {
			rects.set(el, el.getBoundingClientRect());
		}
		return rects.get(el);
	};
	const dropped = new Set();
	candidates.forEach(inner => {
		for (let node = inner.parentElement; node; node = node.parentElement) {
			if (!set.has(node) || dropped.has(node)) {
				continue;
			}
			const shared = overlap(rectOf(node), rectOf(inner));
			if (shared >= SAME_BOX * area(rectOf(node)) && shared >= SAME_BOX * area(rectOf(inner))) {
				dropped.add(node);
			}
		}
	});
	return dropped.size ? candidates.filter(el => !dropped.has(el)) : candidates;
}

/**
 * Whether an element focused earlier can still keep the focus.
 */
function isStillFocusable(el, win) {
	return !!win && !!el && isUsable(el, win.host);
}

/**
 * The focusable element at a point on screen (the virtual cursor), and its
 * window: the element there or the nearest of its parents that is one.
 *
 * @param {number} x
 * @param {number} y
 * @return {?{win: object, el: Element}}
 */
function focusableAt(x, y) {
	if (typeof document === 'undefined' || !document.elementFromPoint) {
		return null;
	}
	const hit = deepElementFromPoint(x, y);
	const win = hit ? windowOf(hit) : null;
	if (!win) {
		return null;
	}
	const { selector, exclude } = selectorsOf(win.profile || {});
	const cache = new Map();

	let node = hit;
	while (node && node !== win.host) {
		if (
			node.nodeType === 1 &&
			node.matches(selector) &&
			!node.matches(exclude) &&
			isUsable(node, win.host, cache)
		) {
			return { win, el: node };
		}
		node = parentOf(node);
	}
	return null;
}

// ---------------------------------------------------------------------------
// Finding an element again
// ---------------------------------------------------------------------------

function signature(el) {
	const classes = Array.from(el.classList)
		.filter(name => !STATE_CLASSES.has(name))
		.sort()
		.join('.');
	return el.tagName.toLowerCase() + (classes ? '.' + classes : '');
}

function attributeKey(el) {
	for (let i = 0; i < KEY_ATTRIBUTES.length; i++) {
		if (el.hasAttribute(KEY_ATTRIBUTES[i])) {
			return KEY_ATTRIBUTES[i] + '=' + el.getAttribute(KEY_ATTRIBUTES[i]);
		}
	}
	return el.id ? '#' + el.id : null;
}

/**
 * A name for an element that survives the window drawing its list again
 * (the inventory redraws all of it when one item changes): its data-index
 * or id, else what it is (tag and classes) and how many like it come first.
 *
 * @param {Element} el
 * @param {Array<Element>} list the window's focusables
 * @return {string}
 */
function keyOf(el, list) {
	const own = attributeKey(el);
	if (own) {
		return own;
	}
	const sig = signature(el);
	const holder = el.parentElement ? el.parentElement.closest(KEY_ATTRIBUTES.map(a => '[' + a + ']').join(',')) : null;
	if (holder) {
		return attributeKey(holder) + '>' + sig;
	}
	let nth = 0;
	for (let i = 0; i < list.length && list[i] !== el; i++) {
		if (signature(list[i]) === sig) {
			nth++;
		}
	}
	return sig + '#' + nth;
}

/**
 * The element in a window's list with a key.
 */
function findByKey(list, key) {
	if (!key) {
		return null;
	}
	for (let i = 0; i < list.length; i++) {
		if (keyOf(list[i], list) === key) {
			return list[i];
		}
	}
	return null;
}

/**
 * The first element of the list that matches one of the selectors, the
 * selectors tried in order.
 *
 * @param {Array<Element>} list
 * @param {Array<string>} selectors
 * @return {?Element}
 */
function findFirst(list, selectors) {
	for (let i = 0; i < selectors.length; i++) {
		const el = list.find(candidate => candidate.matches(selectors[i]));
		if (el) {
			return el;
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// Scrolling
// ---------------------------------------------------------------------------

function scrollsAxis(value) {
	return value === 'auto' || value === 'scroll' || value === 'overlay';
}

/**
 * Scroll the lists an element sits in so that it can be seen. Only its own
 * window's scrolling parents move, never the page.
 *
 * @param {Element} el
 * @param {HTMLElement} host its window's host
 */
function reveal(el, host) {
	let rect = el.getBoundingClientRect();
	let node = parentOf(el);
	while (node && node !== host) {
		const style = getComputedStyle(node);
		const y = scrollsAxis(style.overflowY) && node.scrollHeight > node.clientHeight;
		const x = scrollsAxis(style.overflowX) && node.scrollWidth > node.clientWidth;
		if (x || y) {
			const box = node.getBoundingClientRect();
			// Screen pixels to the list's own: a scaled window (UI/UIScale.js) is drawn larger
			const ratioY = box.height ? node.offsetHeight / box.height || 1 : 1;
			const ratioX = box.width ? node.offsetWidth / box.width || 1 : 1;
			if (y) {
				if (rect.top < box.top) {
					node.scrollTop -= (box.top - rect.top) * ratioY;
				} else if (rect.bottom > box.bottom) {
					node.scrollTop += (rect.bottom - box.bottom) * ratioY;
				}
			}
			if (x) {
				if (rect.left < box.left) {
					node.scrollLeft -= (box.left - rect.left) * ratioX;
				} else if (rect.right > box.right) {
					node.scrollLeft += (rect.right - box.right) * ratioX;
				}
			}
			rect = el.getBoundingClientRect();
		}
		node = parentOf(node);
	}
}

/**
 * The scrolling parent of an element that can still scroll in a direction,
 * if any: NPC text longer than its box.
 *
 * @param {Element} container the box to scroll
 * @param {string} direction 'up' or 'down'
 * @return {boolean} whether it scrolled
 */
function scrollBy(container, direction) {
	if (!container || (direction !== 'up' && direction !== 'down')) {
		return false;
	}
	const max = container.scrollHeight - container.clientHeight;
	if (max <= 0) {
		return false;
	}
	const step = Math.max(16, Math.round(container.clientHeight * 0.6));
	const before = container.scrollTop;
	if (direction === 'up' && before > 0) {
		container.scrollTop = Math.max(0, before - step);
	} else if (direction === 'down' && before < max) {
		container.scrollTop = Math.min(max, before + step);
	}
	return container.scrollTop !== before;
}

/**
 * The rectangle around a list of elements.
 */
function boundsOf(list) {
	let bounds = null;
	list.forEach(el => {
		const r = el.getBoundingClientRect();
		if (!bounds) {
			bounds = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
		} else {
			bounds.left = Math.min(bounds.left, r.left);
			bounds.top = Math.min(bounds.top, r.top);
			bounds.right = Math.max(bounds.right, r.right);
			bounds.bottom = Math.max(bounds.bottom, r.bottom);
		}
	});
	return bounds;
}

/**
 * Whether an element is an item, skill or slot, which has info to show.
 */
function isItemLike(el) {
	return !!el && el.matches('.item, .skill, [data-index]') && !!el.querySelector('.icon, img, button');
}

/**
 * Where events for an item go: its icon, so that a window listening on the
 * icon (`.skill .icon`, NpcStore's `.icon`) or on the icon button
 * (Equipment's tooltip, `closest('button')`) hears them, and one listening
 * on the item (`closest('.item')`) still does.
 */
function eventTarget(el) {
	if (el && el.matches('.item, .skill, [data-index]')) {
		return el.querySelector('.icon') || el.querySelector('button') || el;
	}
	return el;
}

export default {
	FOCUSABLE,
	listWindows,
	isOpen,
	isShown,
	windowOf,
	describe,
	focusables,
	isUsable,
	isStillFocusable,
	focusableAt,
	keyOf,
	findByKey,
	findFirst,
	reveal,
	scrollBy,
	boundsOf,
	isItemLike,
	eventTarget
};
