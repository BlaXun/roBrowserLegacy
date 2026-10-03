import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	cursor: { moveBy: vi.fn() },
	controls: { joyReverseStick: false, joyDeadline: 0.2, joySense: 10 }
}));

vi.mock('UI/Components/JoystickUI/JoystickMouseCursorAdapter.js', () => ({ default: mocks.cursor }));
vi.mock('Preferences/Controls.js', () => ({ default: mocks.controls }));

const { default: CursorMotion } = await import('UI/Components/JoystickUI/JoystickCursorMotion.js');

describe('JoystickCursorMotion frame loop', () => {
	let pads;
	let queued;
	let now;

	function runFrame() {
		const cb = queued;
		queued = null;
		now += 16;
		cb(now);
	}

	beforeEach(() => {
		pads = [];
		queued = null;
		now = 1000;
		navigator.getGamepads = vi.fn(() => pads);
		vi.stubGlobal(
			'requestAnimationFrame',
			vi.fn(cb => {
				queued = cb;
				return 1;
			})
		);
		vi.stubGlobal(
			'cancelAnimationFrame',
			vi.fn(() => {
				queued = null;
			})
		);
		vi.spyOn(performance, 'now').mockImplementation(() => now);
		mocks.cursor.moveBy.mockClear();
	});

	afterEach(() => {
		CursorMotion.stop();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('runs nothing per frame while no gamepad is connected', () => {
		CursorMotion.start();
		expect(requestAnimationFrame).not.toHaveBeenCalled();

		// The idle poll finding nothing does not start it either
		CursorMotion.wake();
		expect(requestAnimationFrame).not.toHaveBeenCalled();
	});

	it('starts on gamepadconnected and moves the cursor with the right stick', () => {
		CursorMotion.start();
		pads = [{ axes: [0, 0, 1, 0] }];
		window.dispatchEvent(new Event('gamepadconnected'));
		expect(queued).toBeTypeOf('function');

		runFrame();
		expect(mocks.cursor.moveBy).toHaveBeenCalledTimes(1);
		expect(mocks.cursor.moveBy.mock.calls[0][0]).toBeGreaterThan(0);
		expect(queued).toBeTypeOf('function'); // keeps going while the pad is there
	});

	it('starts when the poll first sees a pad, and only once', () => {
		CursorMotion.start();
		pads = [{ axes: [0, 0, 0, 0] }];
		CursorMotion.wake();
		CursorMotion.wake();
		expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
	});

	it('starts straight away when a pad is already connected', () => {
		pads = [{ axes: [0, 0, 0, 0] }];
		CursorMotion.start();
		expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
	});

	it('stops itself once the last pad is gone, and restarts on reconnect', () => {
		pads = [{ axes: [0, 0, 0, 0] }];
		CursorMotion.start();
		runFrame();
		expect(queued).toBeTypeOf('function');

		pads = [null];
		runFrame();
		expect(queued).toBe(null);

		pads = [{ axes: [0, 0, 0, 0] }];
		window.dispatchEvent(new Event('gamepadconnected'));
		expect(queued).toBeTypeOf('function');
	});

	it('ignores pads after stop()', () => {
		CursorMotion.start();
		CursorMotion.stop();
		pads = [{ axes: [0, 0, 0, 0] }];
		window.dispatchEvent(new Event('gamepadconnected'));
		CursorMotion.wake();
		expect(requestAnimationFrame).not.toHaveBeenCalled();
	});
});
