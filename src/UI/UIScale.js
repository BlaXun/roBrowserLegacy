/**
 * UI/UIScale.js
 *
 * Lets code from outside the client -- a client plugin -- draw some of the
 * client's windows larger or smaller: a bigger hotbar on a TV across the
 * room, a smaller chat on a laptop.
 *
 * A window's scale is a global factor times its own:
 *
 *   setGlobal(1.5)            every scalable window at 1.5
 *   set('ShortCut', 1.4)      the hotbar at 1.5 x 1.4 = 2.1
 *   set('ShortCut', 1)        the hotbar back to the global factor
 *
 * Only the windows named in SCALABLE can be scaled. Their code has been
 * checked to keep working at another size: dragging, snapping, resizing,
 * scrollbars and tooltips. A window that is not listed stays at 1 whatever
 * the global factor is. A version of a window (InventoryV3, MiniMapV2) goes
 * by its public name (Inventory, MiniMap), and a clone by the window it was
 * cloned from (every whisper window is a WhisperBox).
 *
 * Nothing here is remembered. Every value starts at 1, and with nobody
 * setting one the client looks and behaves exactly as it does without this
 * file. Remembering the player's choice is the plugin's job.
 *
 * The scale is the CSS `scale` of the window's host element, not `zoom`, so
 * the window keeps its place and the browser maps clicks through it. Window
 * code that turns screen distances into sizes inside the window divides by
 * `of(component)` (or `component.scale`); see the callers.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

/** Smallest and largest factor, for the global one and for each window. */
const MIN = 0.5;
const MAX = 3;

const TOP_LEFT = '0 0';
const TOP_RIGHT = '100% 0';
const TOP_CENTER = '50% 0';

/**
 * The windows that can be scaled, by public name, and the point each one
 * grows from. A window that can be moved grows from its top-left corner:
 * placement code assumes its on-screen corner is its `left`/`top`. A fixed
 * one grows away from the edge it is anchored to.
 *
 * Left out on purpose:
 * - full-screen hosts: ContextMenu, NpcStore, Vending, WorldMap (their
 *   windows are children of a screen-sized host);
 * - overlays drawn over the scene: Intro, MobileUI, JoystickUI,
 *   JoystickSelectionUI, SkillTargetSelection, EntitySignboard, EntityRoom,
 *   Announce;
 * - the asset viewers;
 * - the rest, until their window code has been checked.
 */
const SCALABLE = Object.freeze({
	// Always on screen
	BasicInfo: TOP_LEFT,
	ChatBox: TOP_LEFT,
	ShortCut: TOP_LEFT,
	ShortCuts: TOP_LEFT,
	MiniMap: TOP_RIGHT,
	StatusIcons: TOP_RIGHT,
	MapName: TOP_CENTER,
	PvPTimer: TOP_CENTER,
	CashShopIcon: TOP_RIGHT,
	RodexIcon: TOP_RIGHT,
	PCGoldTimer: TOP_RIGHT,

	// Windows
	Inventory: TOP_LEFT,
	Equipment: TOP_LEFT,
	SkillList: TOP_LEFT,
	SkillDescription: TOP_LEFT,
	Storage: TOP_LEFT,
	PartyFriends: TOP_LEFT,
	WhisperBox: TOP_LEFT,
	NpcBox: TOP_LEFT,
	NpcMenu: TOP_LEFT,
	ItemInfo: TOP_LEFT,
	ItemPreview: TOP_LEFT,
	ItemCompare: TOP_LEFT,
	ItemObtain: TOP_LEFT,
	WinStats: TOP_LEFT,
	Escape: TOP_LEFT,
	GraphicsOption: TOP_LEFT,
	SoundOption: TOP_LEFT,
	InputBox: TOP_LEFT,
	Emoticons: TOP_LEFT,
	CardIllustration: TOP_LEFT,
	PlayerViewEquip: TOP_LEFT,

	// Before the game
	WinLogin: TOP_LEFT,
	WinList: TOP_LEFT,
	CharSelect: TOP_LEFT,
	CharCreate: TOP_LEFT,
	PincodeWindow: TOP_LEFT
});

/** Each window's own factor, by public name. A window at 1 has no entry. */
const _scales = new Map();

/** The factor every scalable window is multiplied by. */
let _global = 1;

/** Mounted components, by host element. */
const _mounted = new Map();

/** Registered listeners, in the order they were added. */
const _listeners = [];

/**
 * The name a component is scaled by: the window it was cloned from (every
 * WhisperBox is one), without a version suffix (InventoryV3 is Inventory).
 */
function scaleName(component) {
	const name = String(component.scaleName || component.name);
	const base = name.replace(/V\d+$/, '');
	return Object.hasOwn(SCALABLE, base) ? base : name;
}

/**
 * Throw unless `name` is a scalable window.
 */
function checkName(name) {
	if (typeof name !== 'string' || !Object.hasOwn(SCALABLE, name)) {
		throw new TypeError(`UIScale: "${name}" is not a scalable window`);
	}
}

/**
 * A finite number, kept between MIN and MAX.
 */
function checkValue(value) {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new TypeError('UIScale: a scale is a finite number');
	}
	return Math.min(MAX, Math.max(MIN, value));
}

/**
 * The names of the windows that can be scaled.
 */
function names() {
	return Object.keys(SCALABLE);
}

/**
 * A window's own factor (1 when none was set).
 */
function get(name) {
	checkName(name);
	return _scales.get(name) ?? 1;
}

/**
 * The global factor.
 */
function getGlobal() {
	return _global;
}

/**
 * The factor a window is drawn at: global times its own.
 */
function effective(name) {
	checkName(name);
	return _global * (_scales.get(name) ?? 1);
}

/**
 * The factor a component is drawn at; 1 for a window that cannot be scaled.
 */
function of(component) {
	if (!component || !component.name) {
		return 1;
	}
	const name = scaleName(component);
	return Object.hasOwn(SCALABLE, name) ? effective(name) : 1;
}

/**
 * The factor of the window an element is drawn in; 1 outside any window.
 */
function ofElement(element) {
	const root = element?.getRootNode?.();
	const component = root?.host ? _mounted.get(root.host) : null;
	return component ? of(component) : 1;
}

/**
 * Draw a component's host at its factor. At 1 the host is left as it was.
 */
function apply(component) {
	const host = component._host;
	if (!host) {
		return;
	}
	const scale = of(component);

	if (scale === 1) {
		host.style.removeProperty('scale');
		host.style.removeProperty('transform-origin');
	} else {
		host.style.setProperty('scale', String(scale));
		host.style.setProperty('transform-origin', SCALABLE[scaleName(component)]);
	}
}

/**
 * Apply a change to the mounted windows it touches, keep them on screen,
 * and let them adjust (`onScale`).
 */
function refresh(name) {
	_mounted.forEach(component => {
		if (name !== null && scaleName(component) !== name) {
			return;
		}
		apply(component);
		try {
			component._fixPositionOverflow?.();
			component.onScale?.(of(component));
		} catch (error) {
			console.error(`[UIScale] ${component.name} failed to adjust:`, error);
		}
	});
}

/**
 * Tell the listeners. A listener that throws is reported and the rest
 * still run.
 */
function emit(name, scale) {
	const event = Object.freeze({ name, scale });
	_listeners.slice().forEach(listener => {
		try {
			listener(event);
		} catch (error) {
			console.error('[UIScale] a listener failed:', error);
		}
	});
}

/**
 * Set a window's own factor; 1 takes it back to the global factor.
 * Kept between 0.5 and 3. Returns the value set.
 */
function set(name, value) {
	checkName(name);
	const scale = checkValue(value);
	if (scale === get(name)) {
		return scale;
	}
	if (scale === 1) {
		_scales.delete(name);
	} else {
		_scales.set(name, scale);
	}
	refresh(name);
	emit(name, scale);
	return scale;
}

/**
 * Set the factor every scalable window is multiplied by. Kept between 0.5
 * and 3. Returns the value set.
 */
function setGlobal(value) {
	const scale = checkValue(value);
	if (scale === _global) {
		return scale;
	}
	_global = scale;
	refresh(null);
	emit(null, scale);
	return scale;
}

/**
 * Be told when a factor changes: `{ name, scale }`, with `name` null for the
 * global factor. Returns a function that stops it.
 */
function on(listener) {
	if (typeof listener !== 'function') {
		throw new Error('UIScale.on takes a function');
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
 * A component is going on screen (GUIComponent.append). Draws it at its
 * factor before it places itself.
 */
function attach(component) {
	if (!component?._host) {
		return;
	}
	_mounted.set(component._host, component);
	apply(component);
}

/**
 * A component left the screen (GUIComponent.remove).
 */
function detach(component) {
	if (component?._host) {
		_mounted.delete(component._host);
	}
}

export default {
	MIN,
	MAX,
	SCALABLE,
	names,
	get,
	set,
	getGlobal,
	setGlobal,
	effective,
	of,
	ofElement,
	on,
	attach,
	detach
};
