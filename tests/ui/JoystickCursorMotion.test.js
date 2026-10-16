import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	cursor: { moveBy: vi.fn() },
	controls: { joyReverseStick: false, joyDeadline: 0.2, joySense: 10 },
	aim: { isActive: vi.fn(() => false), update: vi.fn(), release: vi.fn() },
	camera: { update: vi.fn() },
	support: { update: vi.fn(() => false), release: vi.fn() },
	uiFocus: { frame: vi.fn(), isActive: vi.fn(() => false), exit: vi.fn(), cursorMoved: vi.fn() },
	keyboard: { isOpen: vi.fn(() => false), close: vi.fn() }
}));

vi.mock('UI/Components/JoystickUI/JoystickMouseCursorAdapter.js', () => ({ default: mocks.cursor }));
vi.mock('Preferences/Controls.js', () => ({ default: mocks.controls }));
vi.mock('UI/Components/JoystickUI/JoystickAimMode.js', () => ({ default: mocks.aim }));
vi.mock('UI/Components/JoystickUI/JoystickCameraMotion.js', () => ({ default: mocks.camera }));
vi.mock('UI/Components/JoystickUI/JoystickSupportMode.js', () => ({ default: mocks.support }));
vi.mock('UI/Components/JoystickUI/JoystickUIFocus.js', () => ({ default: mocks.uiFocus }));
vi.mock('UI/Components/JoystickUI/JoystickKeyboard.js', () => ({ default: mocks.keyboard }));

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
		mocks.camera.update.mockClear();
		mocks.controls.joyDriftRX = 0;
		mocks.controls.joyDriftRY = 0;
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

	it('moves neither the cursor nor the camera while the on-screen keyboard is open', () => {
		CursorMotion.start();
		pads = [{ axes: [0, 0, 1, 0] }];
		window.dispatchEvent(new Event('gamepadconnected'));
		mocks.keyboard.isOpen.mockReturnValue(true);
		runFrame();
		expect(mocks.cursor.moveBy).not.toHaveBeenCalled();
		expect(mocks.camera.update).not.toHaveBeenCalled();
		// It reads its buttons there
		expect(mocks.uiFocus.frame).toHaveBeenCalled();

		mocks.keyboard.isOpen.mockReturnValue(false);
		runFrame();
		expect(mocks.cursor.moveBy).toHaveBeenCalledTimes(1);
	});

	it('closes the keyboard when the last pad goes', () => {
		CursorMotion.start();
		pads = [{ axes: [0, 0, 0, 0] }];
		window.dispatchEvent(new Event('gamepadconnected'));
		pads = [];
		mocks.keyboard.close.mockClear();
		runFrame();
		expect(mocks.keyboard.close).toHaveBeenCalledTimes(1);
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
		mocks.aim.release.mockClear();
		runFrame();
		expect(queued).toBe(null);
		expect(mocks.aim.release).toHaveBeenCalled(); // no ring left behind

		pads = [{ axes: [0, 0, 0, 0] }];
		window.dispatchEvent(new Event('gamepadconnected'));
		expect(queued).toBeTypeOf('function');
	});

	it('hands every frame to the camera, with the elapsed seconds', () => {
		const pad = { axes: [0, 0, 0, 0] };
		pads = [pad];
		CursorMotion.start();
		runFrame();
		expect(mocks.camera.update).toHaveBeenCalledWith(pad, 0.016);
	});

	it('ignores a drifting stick axis below its drift threshold', () => {
		mocks.controls.joyDriftRY = 0.3;
		pads = [{ axes: [0, 0, 0, 0.25] }];
		CursorMotion.start();
		runFrame();
		expect(mocks.cursor.moveBy).not.toHaveBeenCalled();
	});

	it('shows the cursor again on stop()', () => {
		CursorMotion.start();
		mocks.aim.release.mockClear();
		CursorMotion.stop();
		expect(mocks.aim.release).toHaveBeenCalled();
	});

	it('ignores pads after stop()', () => {
		CursorMotion.start();
		CursorMotion.stop();
		pads = [{ axes: [0, 0, 0, 0] }];
		window.dispatchEvent(new Event('gamepadconnected'));
		CursorMotion.wake();
		expect(requestAnimationFrame).not.toHaveBeenCalled();
	});

	it('hands every frame to menu navigation, with the pad and the frame time', () => {
		const pad = { axes: [0, 0, 0, 0] };
		pads = [pad];
		CursorMotion.start();
		mocks.uiFocus.frame.mockClear();
		runFrame();
		expect(mocks.uiFocus.frame).toHaveBeenCalledWith(pad, now);
	});

	it('in menus the right stick is the cursor, whatever the aim and Support settings', () => {
		mocks.uiFocus.isActive.mockReturnValue(true);
		mocks.aim.isActive.mockReturnValue(true);
		mocks.support.update.mockClear();
		mocks.aim.update.mockClear();
		pads = [{ axes: [0, 0, 1, 0] }];
		CursorMotion.start();
		runFrame();
		expect(mocks.cursor.moveBy).toHaveBeenCalledTimes(1);
		expect(mocks.uiFocus.cursorMoved).toHaveBeenCalledTimes(1);
		expect(mocks.aim.update).not.toHaveBeenCalled();
		expect(mocks.support.update).not.toHaveBeenCalled();
		mocks.uiFocus.isActive.mockReturnValue(false);
		mocks.aim.isActive.mockReturnValue(false);
	});

	it('ends menu navigation when the last pad is gone', () => {
		pads = [{ axes: [0, 0, 0, 0] }];
		CursorMotion.start();
		runFrame();
		mocks.uiFocus.exit.mockClear();
		pads = [null];
		runFrame();
		expect(mocks.uiFocus.exit).toHaveBeenCalled();
	});
});
