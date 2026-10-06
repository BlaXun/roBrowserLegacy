/**
 * UI/WheelSteps.js
 *
 * Turns mouse-wheel events into whole steps for lists that scroll a row at a
 * time.
 *
 * Counting one step per wheel event is right for a plain mouse wheel, which
 * sends one event per notch. A smooth or free-spinning wheel, a precision
 * touchpad or a trackpad sends dozens of small events for the same movement,
 * so a list that steps on each one runs to its end on a single flick. Here
 * the movement is added up instead, and a step is taken per notch's worth.
 *
 * The first event of a gesture always steps, whatever its size: on macOS a
 * single notch of a plain wheel can report only a few pixels, and it should
 * still move the list. A gesture is a run of events in one direction, each
 * less than GESTURE_GAP ms after the last.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

/** Pixels of wheel movement that make one step: one notch of a wheel on Windows. */
const NOTCH = 100;

/** Pixels per line, for devices that report in lines (deltaMode 1). */
const LINE = 33;

/** A pause longer than this, in ms, starts a new gesture. */
const GESTURE_GAP = 150;

/** Per scrolled element: { acc, time, sign }. */
const _gestures = new WeakMap();

/**
 * How many steps this wheel event moves `element`: positive down, negative
 * up, often 0 while a smooth gesture is still adding up.
 *
 * @param {WheelEvent} event
 * @param {HTMLElement} element - the list being scrolled; each keeps its own count
 * @return {number}
 */
function steps(event, element) {
	let dy = event.deltaY || 0;
	if (!dy && event.wheelDelta) {
		dy = -event.wheelDelta; // events from code that sets only the legacy field
	}
	if (!dy) {
		return 0;
	}
	if (event.deltaMode === 1) {
		dy *= LINE;
	} else if (event.deltaMode === 2) {
		dy *= element.clientHeight || NOTCH;
	}

	const now = typeof event.timeStamp === 'number' && event.timeStamp > 0 ? event.timeStamp : performance.now();
	const sign = Math.sign(dy);
	const state = _gestures.get(element);

	if (!state || now - state.time > GESTURE_GAP || state.sign !== sign) {
		_gestures.set(element, { acc: 0, time: now, sign });
		return sign;
	}

	state.time = now;
	state.acc += dy;
	const whole = Math.trunc(state.acc / NOTCH);
	state.acc -= whole * NOTCH;
	return whole;
}

/**
 * Scroll `element` by this wheel event, `rowHeight` pixels a step, snapped to
 * whole rows. Returns the number of steps taken.
 *
 * @param {WheelEvent} event
 * @param {HTMLElement} element
 * @param {number} rowHeight
 * @return {number}
 */
function scrollRows(event, element, rowHeight) {
	const n = steps(event, element);
	if (n) {
		element.scrollTop = Math.floor(element.scrollTop / rowHeight) * rowHeight + n * rowHeight;
	}
	return n;
}

export default { steps, scrollRows, NOTCH, GESTURE_GAP };
