import { describe, expect, it } from 'vitest';

const { default: SpatialNav } = await import('UI/Components/JoystickUI/JoystickSpatialNav.js');

function rect(left, top, width, height) {
	return { left, top, right: left + width, bottom: top + height, width, height };
}

/**
 * An inventory-like grid: `cols` items to a row, 32 px apart, from (100, 100).
 */
function grid(count, cols) {
	const out = [];
	for (let i = 0; i < count; i++) {
		out.push({ id: i, rect: rect(100 + (i % cols) * 32, 100 + Math.floor(i / cols) * 32, 32, 32) });
	}
	return out;
}

function from(entries, id) {
	return entries.find(entry => entry.id === id).rect;
}

function next(entries, id, direction) {
	const found = SpatialNav.findNext(
		from(entries, id),
		entries.filter(entry => entry.id !== id),
		direction
	);
	return found ? found.id : null;
}

describe('JoystickSpatialNav in a grid', () => {
	const items = grid(14, 7);

	it('steps to the neighbour on each side', () => {
		expect(next(items, 8, 'right')).toBe(9);
		expect(next(items, 8, 'left')).toBe(7);
		expect(next(items, 8, 'up')).toBe(1);
		expect(next(items, 1, 'down')).toBe(8);
	});

	it('goes straight down, not to a nearer item in the next column', () => {
		expect(next(items, 3, 'down')).toBe(10);
	});

	it('finds nothing past the edge', () => {
		expect(next(items, 6, 'right')).toBe(null);
		expect(next(items, 0, 'up')).toBe(null);
		expect(next(items, 10, 'down')).toBe(null);
	});

	it('down from a row with no item below it goes to the nearest one in the row under', () => {
		// 10 items: the second row ends under item 2
		const short = grid(10, 7);
		expect(next(short, 5, 'down')).toBe(9);
	});
});

describe('JoystickSpatialNav in a form', () => {
	// A list of rows, OK and Cancel under it, a close button in the corner
	const entries = [
		{ id: 'row0', rect: rect(20, 40, 200, 18) },
		{ id: 'row1', rect: rect(20, 58, 200, 18) },
		{ id: 'row2', rect: rect(20, 76, 200, 18) },
		{ id: 'cancel', rect: rect(120, 110, 48, 20) },
		{ id: 'ok', rect: rect(172, 110, 48, 20) },
		{ id: 'close', rect: rect(210, 10, 16, 16) }
	];

	it('down from the last row reaches a button under the list', () => {
		expect(next(entries, 'row2', 'down')).toBe('cancel');
	});

	it('up from a button goes back into the list', () => {
		expect(next(entries, 'ok', 'up')).toBe('row2');
	});

	it('left and right move between the buttons', () => {
		expect(next(entries, 'cancel', 'right')).toBe('ok');
		expect(next(entries, 'ok', 'left')).toBe('cancel');
	});

	it('up from the first row reaches the close button above it', () => {
		expect(next(entries, 'row0', 'up')).toBe('close');
	});

	it('sideways, what is in line wins over what is closer but off the row', () => {
		const row = [
			{ id: 'from', rect: rect(100, 100, 32, 32) },
			{ id: 'far', rect: rect(300, 100, 32, 32) },
			{ id: 'below', rect: rect(140, 140, 32, 32) }
		];
		expect(next(row, 'from', 'right')).toBe('far');
	});
});

describe('JoystickSpatialNav wrap and reading order', () => {
	const column = [0, 1, 2, 3].map(i => ({ id: i, rect: rect(10, 10 + i * 20, 100, 18) }));

	it('wraps down from the last entry to the first, and up from the first to the last', () => {
		expect(SpatialNav.findWrap(from(column, 3), column.slice(0, 3), 'down').id).toBe(0);
		expect(SpatialNav.findWrap(from(column, 0), column.slice(1), 'up').id).toBe(3);
	});

	it('orders rectangles top to bottom, then left to right', () => {
		const shuffled = [rect(50, 12, 10, 10), rect(10, 40, 10, 10), rect(10, 10, 10, 10)];
		shuffled.sort(SpatialNav.compareReadingOrder);
		expect(shuffled.map(r => [r.left, r.top])).toEqual([
			[10, 10],
			[50, 12],
			[10, 40]
		]);
	});

	it('ignores an unknown direction', () => {
		expect(SpatialNav.findNext(rect(0, 0, 10, 10), column, 'sideways')).toBe(null);
	});
});
