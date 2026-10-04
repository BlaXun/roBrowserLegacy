import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	controls: { save: vi.fn() }
}));

vi.mock('Preferences/Controls.js', () => ({ default: mocks.controls }));

const { default: StickFilter } = await import('UI/Components/JoystickUI/JoystickStickFilter.js');

describe('JoystickStickFilter', () => {
	beforeEach(() => {
		Object.assign(mocks.controls, {
			joyDriftLX: 0,
			joyDriftLY: 0,
			joyDriftRX: 0,
			joyDriftRY: 0,
			joyStickCenter: null
		});
		mocks.controls.save.mockClear();
	});

	it('passes axes through untouched by default', () => {
		expect(StickFilter.filterAxes([0.05, -0.3, 1, -1, 0.7])).toEqual([0.05, -0.3, 1, -1, 0.7]);
	});

	it('drops values within an axis threshold and rescales the rest from 0', () => {
		mocks.controls.joyDriftRY = 0.2;
		const [, , rx, ryDrift] = StickFilter.filterAxes([0, 0, 0.1, 0.15]);
		expect(rx).toBe(0.1); // other axes keep their values
		expect(ryDrift).toBe(0);

		expect(StickFilter.filterAxes([0, 0, 0, 0.6])[3]).toBeCloseTo(0.5);
		expect(StickFilter.filterAxes([0, 0, 0, -1])[3]).toBe(-1); // full tilt stays full
	});

	it('leaves axes past the two sticks alone (triggers on some pads)', () => {
		mocks.controls.joyDriftRY = 0.5;
		expect(StickFilter.filterAxes([0, 0, 0, 0, 0.2])[4]).toBe(0.2);
	});

	it('subtracts the calibrated rest position and keeps the full range', () => {
		mocks.controls.joyStickCenter = [0, 0, 0, 0.1];
		const at = value => StickFilter.filterAxes([0, 0, 0, value])[3];
		expect(at(0.1)).toBeCloseTo(0);
		expect(at(1)).toBeCloseTo(1);
		expect(at(-1)).toBeCloseTo(-1);
		expect(at(0.55)).toBeCloseTo(0.5);
	});

	it('ignores a malformed stored calibration', () => {
		mocks.controls.joyStickCenter = [0.1, 'x'];
		expect(StickFilter.getCenter()).toBe(null);
		expect(StickFilter.filterAxes([0.1, 0, 0, 0])[0]).toBe(0.1);
	});

	it('averages calibration samples, and refuses them when a stick was touched', () => {
		expect(
			StickFilter.computeCenter([
				[0.02, 0, 0, 0.1],
				[0.04, 0, 0, 0.06]
			])
		).toEqual([0.03, 0, 0, 0.08]);
		expect(StickFilter.computeCenter([[0, 0, 0.9, 0]])).toBe(null);
		expect(StickFilter.computeCenter([])).toBe(null);
	});

	describe('calibrate()', () => {
		let pads;

		beforeEach(() => {
			vi.useFakeTimers();
			pads = [{ axes: [0.01, 0, 0, 0.09] }];
			navigator.getGamepads = vi.fn(() => pads);
		});

		afterEach(() => {
			StickFilter.cancelCalibration();
			vi.useRealTimers();
		});

		it('stores the rest position after a second', () => {
			const done = vi.fn();
			StickFilter.calibrate(done);
			vi.advanceTimersByTime(500);
			expect(done).not.toHaveBeenCalled();

			vi.advanceTimersByTime(600);
			expect(done).toHaveBeenCalledWith('ok');
			expect(mocks.controls.joyStickCenter[0]).toBeCloseTo(0.01);
			expect(mocks.controls.joyStickCenter[3]).toBeCloseTo(0.09);
			expect(mocks.controls.save).toHaveBeenCalled();
		});

		it('saves nothing when a stick moves meanwhile', () => {
			const done = vi.fn();
			StickFilter.calibrate(done);
			vi.advanceTimersByTime(300);
			pads = [{ axes: [0, -0.8, 0, 0] }];
			vi.advanceTimersByTime(800);
			expect(done).toHaveBeenCalledWith('moved');
			expect(mocks.controls.joyStickCenter).toBe(null);
		});

		it('reports a missing pad', () => {
			pads = [null];
			const done = vi.fn();
			StickFilter.calibrate(done);
			expect(done).toHaveBeenCalledWith('nopad');
		});

		it('forgets the calibration on reset', () => {
			mocks.controls.joyStickCenter = [0, 0, 0, 0.1];
			StickFilter.resetCalibration();
			expect(mocks.controls.joyStickCenter).toBe(null);
		});
	});
});
