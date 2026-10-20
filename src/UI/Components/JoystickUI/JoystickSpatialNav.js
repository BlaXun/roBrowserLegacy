/**
 * UI/Components/JoystickUI/JoystickSpatialNav.js
 *
 * Where a D-pad press moves the menu focus: to the nearest element in that
 * direction, judged by the rectangles the elements take up on screen. Pure
 * geometry, no DOM, so a window's layout (a grid of items, a column of
 * buttons, a form) needs no description of its own.
 *
 * The rules are the ones console and TV interfaces use:
 *  - a candidate must lie further that way than the focused element;
 *  - one that overlaps it across the direction (in its "beam": the same row
 *    for left / right, the same column for up / down) beats one that does
 *    not, so down in a grid goes straight down, not diagonally to a closer
 *    neighbour;
 *  - among the rest the distance along the direction counts far more than
 *    the sideways offset.
 *
 * Rectangles are {left, top, right, bottom} in screen pixels, as
 * getBoundingClientRect() returns them; scaled windows (UI/UIScale.js) need
 * nothing extra.
 */

const DIRECTIONS = ['up', 'down', 'left', 'right'];

/**
 * Weight of the distance along the direction against the sideways offset.
 */
const MAJOR_WEIGHT = 13;

function centerX(rect) {
	return (rect.left + rect.right) / 2;
}

function centerY(rect) {
	return (rect.top + rect.bottom) / 2;
}

/**
 * Whether dest lies further in the direction than src.
 *
 * @param {object} src focused rectangle
 * @param {object} dest candidate rectangle
 * @param {string} direction 'up', 'down', 'left' or 'right'
 * @return {boolean}
 */
function isCandidate(src, dest, direction) {
	switch (direction) {
		case 'left':
			return (src.right > dest.right || src.left >= dest.right) && src.left > dest.left;
		case 'right':
			return (src.left < dest.left || src.right <= dest.left) && src.right < dest.right;
		case 'up':
			return (src.bottom > dest.bottom || src.top >= dest.bottom) && src.top > dest.top;
		case 'down':
			return (src.top < dest.top || src.bottom <= dest.top) && src.bottom < dest.bottom;
	}
	return false;
}

/**
 * Whether two rectangles overlap across the direction: the same row for
 * left / right, the same column for up / down.
 */
function inBeam(src, dest, direction) {
	if (direction === 'left' || direction === 'right') {
		return dest.bottom > src.top && dest.top < src.bottom;
	}
	return dest.right > src.left && dest.left < src.right;
}

/**
 * Whether dest lies wholly beyond src's edge in the direction.
 */
function isBeyond(src, dest, direction) {
	switch (direction) {
		case 'left':
			return src.left >= dest.right;
		case 'right':
			return src.right <= dest.left;
		case 'up':
			return src.top >= dest.bottom;
		case 'down':
			return src.bottom <= dest.top;
	}
	return false;
}

/**
 * Gap between src's edge and dest's near edge, along the direction.
 */
function majorDistance(src, dest, direction) {
	switch (direction) {
		case 'left':
			return Math.max(0, src.left - dest.right);
		case 'right':
			return Math.max(0, dest.left - src.right);
		case 'up':
			return Math.max(0, src.top - dest.bottom);
		case 'down':
			return Math.max(0, dest.top - src.bottom);
	}
	return 0;
}

/**
 * Distance from src's edge to dest's far edge, along the direction.
 */
function majorDistanceToFarEdge(src, dest, direction) {
	switch (direction) {
		case 'left':
			return Math.max(1, src.left - dest.left);
		case 'right':
			return Math.max(1, dest.right - src.right);
		case 'up':
			return Math.max(1, src.top - dest.top);
		case 'down':
			return Math.max(1, dest.bottom - src.bottom);
	}
	return 1;
}

/**
 * Offset between the centres, across the direction.
 */
function minorDistance(src, dest, direction) {
	if (direction === 'left' || direction === 'right') {
		return Math.abs(centerY(src) - centerY(dest));
	}
	return Math.abs(centerX(src) - centerX(dest));
}

/**
 * Whether a, being in the beam, wins over b on that alone. Sideways, being
 * in the row always wins. Vertically only while b is not wholly closer: a
 * row of buttons right under a list still beats the far end of the list.
 */
function beamBeats(src, a, b, direction) {
	const aIn = inBeam(src, a, direction);
	const bIn = inBeam(src, b, direction);
	if (bIn || !aIn) {
		return false;
	}
	if (!isBeyond(src, b, direction)) {
		return true;
	}
	if (direction === 'left' || direction === 'right') {
		return true;
	}
	return majorDistance(src, a, direction) < majorDistanceToFarEdge(src, b, direction);
}

function weightedDistance(src, dest, direction) {
	const major = majorDistance(src, dest, direction);
	const minor = minorDistance(src, dest, direction);
	return MAJOR_WEIGHT * major * major + minor * minor;
}

/**
 * Whether a is a better move than b.
 */
function isBetter(src, a, b, direction) {
	if (!b) {
		return true;
	}
	if (beamBeats(src, a, b, direction)) {
		return true;
	}
	if (beamBeats(src, b, a, direction)) {
		return false;
	}
	return weightedDistance(src, a, direction) < weightedDistance(src, b, direction);
}

/**
 * The best candidate in the direction.
 *
 * @param {object} src the focused rectangle
 * @param {Array<object>} entries anything with a `rect`
 * @param {string} direction 'up', 'down', 'left' or 'right'
 * @return {?object} the entry to move to, or null if nothing lies that way
 */
function findNext(src, entries, direction) {
	if (!src || DIRECTIONS.indexOf(direction) === -1) {
		return null;
	}
	let best = null;
	for (let i = 0; i < entries.length; i++) {
		const rect = entries[i].rect;
		if (!rect || !isCandidate(src, rect, direction)) {
			continue;
		}
		if (isBetter(src, rect, best && best.rect, direction)) {
			best = entries[i];
		}
	}
	return best;
}

/**
 * Wrap around: the entry furthest the other way, in the beam if there is
 * one. Down from the last button of a menu comes back to the first.
 *
 * @param {object} src the focused rectangle
 * @param {Array<object>} entries anything with a `rect`
 * @param {string} direction the direction pressed
 * @return {?object}
 */
function findWrap(src, entries, direction) {
	if (!src) {
		return null;
	}
	const vertical = direction === 'up' || direction === 'down';
	const sign = direction === 'down' || direction === 'right' ? 1 : -1;
	let best = null;
	let bestEdge = 0;
	let bestInBeam = false;

	for (let i = 0; i < entries.length; i++) {
		const rect = entries[i].rect;
		if (!rect) {
			continue;
		}
		const beam = inBeam(src, rect, direction);
		// Furthest against the direction: the smallest top going down, ...
		const edge = sign * (vertical ? centerY(rect) : centerX(rect));
		if (!best || (beam && !bestInBeam) || (beam === bestInBeam && edge < bestEdge)) {
			best = entries[i];
			bestEdge = edge;
			bestInBeam = beam;
		}
	}
	return best;
}

/**
 * Reading order: top to bottom, then left to right. Elements whose tops
 * lie within half the smaller height of each other count as one row.
 */
function compareReadingOrder(a, b) {
	const rowTolerance = Math.min(a.bottom - a.top, b.bottom - b.top) / 2;
	if (Math.abs(a.top - b.top) > rowTolerance) {
		return a.top - b.top;
	}
	return a.left - b.left;
}

export default {
	DIRECTIONS,
	findNext,
	findWrap,
	isCandidate,
	inBeam,
	compareReadingOrder
};
