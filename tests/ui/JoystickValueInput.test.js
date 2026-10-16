import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { default: ValueInput } = await import('UI/Components/JoystickUI/JoystickValueInput.js');

function make(html) {
	const holder = document.createElement('div');
	holder.innerHTML = html;
	document.body.appendChild(holder);
	const el = holder.firstElementChild;
	const seen = [];
	el.addEventListener('input', () => seen.push('input:' + el.value));
	el.addEventListener('change', () => seen.push('change:' + el.value));
	return { el, seen };
}

describe('JoystickValueInput sliders', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	});

	afterEach(() => {
		ValueInput.flush();
		vi.useRealTimers();
	});

	it('moves a twentieth of the range at a time, input at once, change when the steps stop', () => {
		const { el, seen } = make('<input type="range" min="0" max="100" step="1" value="50" />');

		expect(ValueInput.step(el, 'right')).toBe(true);
		expect(el.value).toBe('55');
		expect(ValueInput.step(el, 'right')).toBe(true);
		expect(el.value).toBe('60');
		expect(seen).toEqual(['input:55', 'input:60']);

		vi.advanceTimersByTime(300);
		expect(seen).toEqual(['input:55', 'input:60', 'change:60']);

		ValueInput.step(el, 'left');
		expect(el.value).toBe('55');
	});

	it('stays on the grid and in the range, and keeps the press at an end', () => {
		const details = make('<input type="range" min="25" max="100" step="5" value="95" />');
		ValueInput.step(details.el, 'right');
		expect(details.el.value).toBe('100');
		expect(ValueInput.step(details.el, 'right')).toBe(true);
		expect(details.el.value).toBe('100');

		const fine = make('<input type="range" min="0" max="0.5" step="0.01" value="0.1" />');
		ValueInput.step(fine.el, 'right');
		expect(fine.el.value).toBe('0.13');
		ValueInput.step(fine.el, 'left');
		ValueInput.step(fine.el, 'left');
		expect(fine.el.value).toBe('0.07');
	});

	it('sends a waiting change at once when asked (menus end)', () => {
		const { el, seen } = make('<input type="range" min="0" max="100" value="50" />');
		ValueInput.step(el, 'left');
		ValueInput.flush();
		expect(seen).toEqual(['input:45', 'change:45']);
		vi.advanceTimersByTime(300);
		expect(seen).toEqual(['input:45', 'change:45']);
	});

	it('leaves up and down, and disabled controls, to the focus', () => {
		const { el } = make('<input type="range" min="0" max="100" value="50" />');
		expect(ValueInput.step(el, 'up')).toBe(false);
		expect(ValueInput.step(el, 'down')).toBe(false);
		el.disabled = true;
		expect(ValueInput.handles(el)).toBe(false);
		expect(ValueInput.step(el, 'right')).toBe(false);
		expect(ValueInput.handles(document.createElement('button'))).toBe(false);
	});
});

describe('JoystickValueInput lists', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('goes to the previous or next choice, past switched-off ones, and stops at the ends', () => {
		const { el, seen } = make(
			'<select><option value="base">Base</option><option value="up" disabled>Up</option><option value="down">Down</option></select>'
		);

		expect(ValueInput.step(el, 'right')).toBe(true);
		expect(el.value).toBe('down');
		expect(seen).toEqual(['input:down', 'change:down']);
		expect(ValueInput.step(el, 'right')).toBe(true);
		expect(el.value).toBe('down');
		ValueInput.step(el, 'left');
		expect(el.value).toBe('base');
		expect(ValueInput.hints(el)).toEqual([['◀▶', 'Change']]);
	});
});
