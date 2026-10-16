/**
 * UI/Components/JoystickUI/JoystickValueInput.js
 *
 * Controls whose value the D-pad's left and right change in menus
 * (JoystickUIFocus): sliders (`input type="range"`: volumes, the gamepad's
 * sensitivity and dead zone, graphics details) and drop-down lists
 * (`select`). Up and down still move the focus.
 *
 * A slider moves by a twentieth of its range (at least its step), and a held
 * D-pad repeats. As with a mouse drag, the window hears `input` at every
 * step and `change` once the steps stop, so a setting that is costly to
 * apply is applied once. A list moves to the previous or next choice, and
 * its `change` comes at once, as a mouse choice does.
 */

const STEPS = 20; // a slider's range in this many presses
const CHANGE_AFTER_MS = 250; // a slider's change, this long after its last step

const SLIDER = 'input[type="range"]';

const _pending = new Map(); // slider: timer of its coming change event

function isSlider(el) {
	return !!el && el.matches(SLIDER);
}

/**
 * Whether the D-pad's left and right change this element's value.
 *
 * @param {?Element} el
 * @return {boolean}
 */
function handles(el) {
	return !!el && !el.disabled && el.matches(SLIDER + ', select');
}

function fire(el, type) {
	el.dispatchEvent(new Event(type, { bubbles: true }));
}

function decimals(value) {
	const text = String(value);
	const dot = text.indexOf('.');
	return dot === -1 ? 0 : text.length - dot - 1;
}

/**
 * Move a slider one step left or right, within its range and on its grid.
 *
 * @return {boolean} whether the value changed
 */
function stepSlider(el, sign) {
	const min = el.min === '' ? 0 : parseFloat(el.min);
	const max = el.max === '' ? 100 : parseFloat(el.max);
	if (!(max > min)) {
		return false;
	}
	let grid = parseFloat(el.step);
	if (!(grid > 0)) {
		// No step, or "any": a hundredth of the range
		grid = (max - min) / 100;
	}
	const stride = Math.max(grid, Math.round((max - min) / STEPS / grid) * grid);
	const current = parseFloat(el.value);
	const from = isNaN(current) ? min : current;
	// Back onto the grid the slider counts from (its minimum), then within the range
	let next = min + Math.round((from + sign * stride - min) / grid) * grid;
	next = Math.min(max, Math.max(min, next));
	next = Number(next.toFixed(Math.max(decimals(grid), decimals(min))));
	if (next === from) {
		return false;
	}
	el.value = String(next);
	fire(el, 'input');
	clearTimeout(_pending.get(el));
	_pending.set(
		el,
		setTimeout(() => {
			_pending.delete(el);
			fire(el, 'change');
		}, CHANGE_AFTER_MS)
	);
	return true;
}

/**
 * Choose the previous or next choice of a list, past those that are off.
 * It stops at the ends.
 *
 * @return {boolean} whether the choice changed
 */
function stepSelect(el, sign) {
	const options = el.options;
	for (let i = el.selectedIndex + sign; i >= 0 && i < options.length; i += sign) {
		if (!options[i].disabled) {
			el.selectedIndex = i;
			fire(el, 'input');
			fire(el, 'change');
			return true;
		}
	}
	return false;
}

/**
 * A D-pad press on a value control: left and right change the value.
 *
 * @param {Element} el the focused element
 * @param {string} direction 'up', 'down', 'left' or 'right'
 * @return {boolean} true when the press was the control's: the focus stays
 */
function step(el, direction) {
	if (!handles(el) || (direction !== 'left' && direction !== 'right')) {
		return false;
	}
	const sign = direction === 'right' ? 1 : -1;
	if (isSlider(el)) {
		stepSlider(el, sign);
	} else {
		stepSelect(el, sign);
	}
	// At an end, the press stays the control's too: the focus does not slip off sideways
	return true;
}

/**
 * Send now a slider's change that waits for its steps to stop (menus end).
 */
function flush() {
	_pending.forEach((timer, el) => {
		clearTimeout(timer);
		fire(el, 'change');
	});
	_pending.clear();
}

/**
 * Hints for the hint bar.
 *
 * @param {?Element} el the focused element
 * @return {Array<Array>}
 */
function hints(el) {
	return handles(el) ? [['◀▶', 'Change']] : [];
}

export default {
	handles,
	isSlider,
	step,
	flush,
	hints
};
