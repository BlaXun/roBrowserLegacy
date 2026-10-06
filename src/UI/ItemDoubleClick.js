/**
 * UI/ItemDoubleClick.js
 *
 * A double click on an item in a list that redraws when an item moves.
 *
 * In the NPC shop and the vending windows, a double click moves an item to the
 * other list, and the list redraws: the next item slides up under the pointer.
 * A player selling a run of items double-clicks the same spot again and again,
 * and the browser counts that as one long run of clicks (3, 4, ...). It fires
 * `dblclick` only on the second, so every double click after the first did
 * nothing until the player paused.
 *
 * So the double click is counted here instead: two clicks on the same item
 * (by its data-index) within GAP_MS, whatever the browser's count says.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

/** Two clicks this close together are a double click: Windows' default. */
export const GAP_MS = 500;

/**
 * Call `handler(item, event)` when an item matching `selector` inside
 * `container` is double-clicked.
 *
 * @param {HTMLElement} container the list
 * @param {string} selector the items, e.g. '.item'
 * @param {function(HTMLElement, MouseEvent)} handler
 * @param {object} [options]
 * @param {number} [options.gap] milliseconds between the two clicks
 * @param {function(): number} [options.now] the clock, for tests
 * @return {function} removes the listener
 */
export function onItemDoubleClick(container, selector, handler, options = {}) {
	const gap = options.gap ?? GAP_MS;
	const now = options.now ?? (() => performance.now());
	let last = null; // { key, time } of an unanswered first click

	const onClick = event => {
		if (event.button !== 0) {
			return;
		}
		const item = event.target.closest && event.target.closest(selector);
		if (!item || !container.contains(item)) {
			last = null;
			return;
		}
		const key = item.getAttribute('data-index');
		const time = now();
		if (last && last.key === key && time - last.time <= gap) {
			last = null;
			handler(item, event);
		} else {
			last = { key, time };
		}
	};

	container.addEventListener('click', onClick);
	return () => container.removeEventListener('click', onClick);
}

export default { onItemDoubleClick, GAP_MS };
