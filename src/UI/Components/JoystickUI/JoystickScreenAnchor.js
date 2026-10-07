/**
 * UI/Components/JoystickUI/JoystickScreenAnchor.js
 *
 * Places gamepad overlays (the emote grid, the target category list) just
 * below the character, so the eyes stay near the action.
 */

const EDGE = 8; // kept from the screen's edges

/**
 * Centre an absolutely positioned element horizontally under the feet,
 * gap pixels below them, kept on screen. It must be laid out (displayed)
 * so its size can be measured.
 *
 * @param {HTMLElement} element
 * @param {?Array<number>} feet [x, y] of the character's feet on screen;
 *   null puts the element in the lower middle of the screen
 * @param {number} gap pixels between the feet and the element's top
 */
function placeBelowFeet(element, feet, gap) {
	const viewWidth = window.innerWidth;
	const viewHeight = window.innerHeight;
	const width = element.offsetWidth;
	const height = element.offsetHeight;

	const x = feet ? feet[0] : viewWidth / 2;
	const y = feet ? feet[1] + gap : viewHeight * 0.6;
	const left = Math.max(EDGE, Math.min(x - width / 2, viewWidth - width - EDGE));
	const top = Math.max(EDGE, Math.min(y, viewHeight - height - EDGE));
	element.style.left = Math.round(left) + 'px';
	element.style.top = Math.round(top) + 'px';
}

/**
 * Call an anchor function safely.
 *
 * @param {?function(): ?Array<number>} anchor
 * @return {?Array<number>} the feet, or null
 */
function feetFrom(anchor) {
	try {
		return anchor ? anchor() : null;
	} catch {
		return null;
	}
}

export default {
	placeBelowFeet,
	feetFrom
};
