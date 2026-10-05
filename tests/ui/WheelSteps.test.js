import { describe, expect, it } from 'vitest';
import WheelSteps from '../../src/UI/WheelSteps.js';

const list = () => ({ scrollTop: 0, clientHeight: 300 });
const wheel = (deltaY, timeStamp, deltaMode = 0) => ({ deltaY, deltaMode, timeStamp });

describe('WheelSteps', () => {
	it('steps once per notch of a plain wheel', () => {
		const el = list();
		expect(WheelSteps.steps(wheel(100, 1000), el)).toBe(1);
		expect(WheelSteps.steps(wheel(100, 1050), el)).toBe(1);
		expect(WheelSteps.steps(wheel(100, 1100), el)).toBe(1);
	});

	it('adds up the small events of a smooth wheel or touchpad', () => {
		const el = list();
		let total = WheelSteps.steps(wheel(5, 1000), el);
		for (let t = 1016; t < 1016 + 40 * 16; t += 16) {
			total += WheelSteps.steps(wheel(5, t), el);
		}
		// 41 events of 5px: the first steps, the other 200px make two more.
		expect(total).toBe(3);
	});

	it('steps on a single small event after a pause, as one notch on macOS reports', () => {
		const el = list();
		expect(WheelSteps.steps(wheel(4, 1000), el)).toBe(1);
		expect(WheelSteps.steps(wheel(4, 1400), el)).toBe(1);
		expect(WheelSteps.steps(wheel(-4, 1800), el)).toBe(-1);
	});

	it('starts again when the direction changes', () => {
		const el = list();
		expect(WheelSteps.steps(wheel(100, 1000), el)).toBe(1);
		expect(WheelSteps.steps(wheel(-30, 1020), el)).toBe(-1);
	});

	it('reads lines and pages', () => {
		const el = list();
		WheelSteps.steps(wheel(3, 1000, 1), el);
		expect(WheelSteps.steps(wheel(3, 1020, 1), el)).toBe(0); // 99px
		expect(WheelSteps.steps(wheel(1, 1040, 1), el)).toBe(1);
		expect(WheelSteps.steps(wheel(1, 1060, 2), el)).toBe(3); // a 300px page, plus 32 left over
	});

	it('keeps a separate count for each list', () => {
		const a = list();
		const b = list();
		WheelSteps.steps(wheel(100, 1000), a);
		expect(WheelSteps.steps(wheel(60, 1010), a)).toBe(0);
		expect(WheelSteps.steps(wheel(60, 1010), b)).toBe(1);
	});

	it('ignores events with no vertical movement', () => {
		expect(WheelSteps.steps(wheel(0, 1000), list())).toBe(0);
	});

	it('scrolls whole rows, snapping a list left between rows', () => {
		const el = list();
		el.scrollTop = 40;
		expect(WheelSteps.scrollRows(wheel(100, 1000), el, 32)).toBe(1);
		expect(el.scrollTop).toBe(64);
		WheelSteps.scrollRows(wheel(-100, 2000), el, 32);
		expect(el.scrollTop).toBe(32);
	});
});
