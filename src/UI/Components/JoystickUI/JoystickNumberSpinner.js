/**
 * UI/Components/JoystickUI/JoystickNumberSpinner.js
 *
 * The amount box (InputBox) with the D-pad. Up and down add or take away
 * one step; left makes the step ten times larger and right ten times
 * smaller, like moving between the digits of the number. Any count or price
 * is a few presses away, and the box keeps its default (usually the whole
 * stack) until changed.
 *
 * Only number boxes (`#inputbox.number`: amounts, prices, NPC number
 * input). A text box is typed into with a keyboard, the Steam Deck's
 * included (Steam + X).
 */

const MAX_STEP = 1000000000;

let _step = 1;

/**
 * The number field of an amount box, or null for a text box.
 *
 * @param {ShadowRoot} root the InputBox window's root
 * @return {?HTMLInputElement}
 */
function numberField(root) {
	const box = root && root.querySelector('#inputbox');
	if (!box || !box.classList.contains('number')) {
		return null;
	}
	return box.querySelector('input');
}

function setValue(field, value) {
	field.value = String(value);
	field.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * One D-pad press on an amount box.
 *
 * @param {ShadowRoot} root the InputBox window's root
 * @param {string} direction 'up', 'down', 'left' or 'right'
 * @return {boolean} true when the box took the press
 */
function step(root, direction) {
	const field = numberField(root);
	if (!field) {
		return false;
	}
	const value = Math.max(0, parseInt(field.value, 10) || 0);
	switch (direction) {
		case 'up':
			setValue(field, value + _step);
			break;
		case 'down':
			setValue(field, Math.max(0, value - _step));
			break;
		case 'left':
			_step = Math.min(MAX_STEP, _step * 10);
			break;
		case 'right':
			_step = Math.max(1, Math.round(_step / 10));
			break;
		default:
			return false;
	}
	return true;
}

/**
 * Back to steps of one, for the next box.
 */
function reset() {
	_step = 1;
}

function getStep() {
	return _step;
}

/**
 * Hints for the button bar, or none for a text box.
 *
 * @param {ShadowRoot} root
 * @return {Array<Array<string>>} [keys, what they do]
 */
function hints(root) {
	if (!numberField(root)) {
		return [];
	}
	return [
		['▲▼', '±' + _step.toLocaleString('en-US')],
		['◀▶', 'Step ×10 / ÷10']
	];
}

export default {
	step,
	reset,
	hints,
	getStep,
	numberField
};
