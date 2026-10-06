import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	controls: { joyButtonMap: null, joyCameraSpeed: 90 },
	cursor: { changeCameraAngle: vi.fn(), changeCameraZoom: vi.fn() },
	selection: { active: vi.fn(() => false) }
}));

vi.mock('Preferences/Controls.js', () => ({ default: mocks.controls }));
vi.mock('UI/Components/JoystickUI/JoystickMouseCursorAdapter.js', () => ({ default: mocks.cursor }));
vi.mock('UI/Components/JoystickUI/JoystickSelectionUI.js', () => ({ default: mocks.selection }));

const { default: CameraMotion } = await import('UI/Components/JoystickUI/JoystickCameraMotion.js');

const VIEW = 8;
const UP = 12;
const DOWN = 13;
const LEFT = 14;
const RIGHT = 15;

function pad(...down) {
	const buttons = [];
	for (let i = 0; i < 17; i++) {
		buttons.push({ pressed: down.includes(i) });
	}
	return { buttons, axes: [0, 0, 0, 0] };
}

describe('JoystickCameraMotion', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.controls.joyButtonMap = null;
		mocks.controls.joyCameraSpeed = 90;
		mocks.selection.active.mockReturnValue(false);
	});

	it('turns by speed * elapsed time while View + D-pad left/right is held', () => {
		CameraMotion.update(pad(VIEW, RIGHT), 0.5);
		expect(mocks.cursor.changeCameraAngle).toHaveBeenCalledWith(45);

		mocks.controls.joyCameraSpeed = 180;
		CameraMotion.update(pad(VIEW, LEFT), 0.1);
		expect(mocks.cursor.changeCameraAngle).toHaveBeenLastCalledWith(-18);
	});

	it('zooms while View + D-pad up/down is held, up zooming in', () => {
		CameraMotion.update(pad(VIEW, UP), 0.1);
		expect(mocks.cursor.changeCameraZoom.mock.calls[0][0]).toBeLessThan(0);
		CameraMotion.update(pad(VIEW, DOWN), 0.1);
		expect(mocks.cursor.changeCameraZoom.mock.calls[1][0]).toBeGreaterThan(0);
	});

	it('does nothing without View, or while the selection window has the pad', () => {
		CameraMotion.update(pad(RIGHT), 0.1);
		mocks.selection.active.mockReturnValue(true);
		CameraMotion.update(pad(VIEW, RIGHT), 0.1);
		expect(mocks.cursor.changeCameraAngle).not.toHaveBeenCalled();
	});

	it('follows remapped buttons', () => {
		// View's role on physical button 0 (A), A's on physical 8
		const map = [8, 1, 2, 3, 4, 5, 6, 7, 0, 9, 10, 11, 12, 13, 14, 15];
		mocks.controls.joyButtonMap = map;
		CameraMotion.update(pad(0, RIGHT), 0.5);
		expect(mocks.cursor.changeCameraAngle).toHaveBeenCalledWith(45);
	});

	it('copes with a pad that reports no buttons', () => {
		expect(() => CameraMotion.update({ axes: [] }, 0.1)).not.toThrow();
	});
});
