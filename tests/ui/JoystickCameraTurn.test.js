import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	camera: {
		angle: [0, 0],
		angleFinal: [0, 0],
		rotationFrom: -360,
		rotationTo: 360,
		indoorRotationFrom: -60,
		indoorRotationTo: -25,
		currentMap: 'prontera.rsw',
		updateState: vi.fn(),
		save: vi.fn()
	},
	db: { isIndoor: vi.fn(() => false) }
}));

vi.mock('Renderer/Camera.js', () => ({ default: mocks.camera }));
vi.mock('DB/DBManager.js', () => ({ default: mocks.db }));
vi.mock('Renderer/Renderer.js', () => ({ default: {} }));
vi.mock('Controls/MouseEventHandler.js', () => ({ default: { screen: {} } }));
vi.mock('Preferences/Controls.js', () => ({ default: {} }));
vi.mock('UI/Components/JoystickUI/JoystickInteractionService.js', () => ({ default: {} }));

const { default: Cursor } = await import('UI/Components/JoystickUI/JoystickMouseCursorAdapter.js');

describe('JoystickMouseCursorAdapter.changeCameraAngle', () => {
	const camera = mocks.camera;

	beforeEach(() => {
		camera.angle[1] = 0;
		camera.angleFinal[1] = 0;
		mocks.db.isIndoor.mockReturnValue(false);
	});

	it('turns the camera target and saves', () => {
		Cursor.changeCameraAngle(45);
		expect(camera.angleFinal[1]).toBe(45);
		expect(camera.save).toHaveBeenCalled();
	});

	it('never lets the target pass half a turn, so the camera cannot spin', () => {
		// Many 90 degree turns one way: the target stays within +-180, and
		// the current angle moves with it so the view does not jump.
		for (let i = 0; i < 20; i++) {
			const before = camera.angleFinal[1] - camera.angle[1];
			Cursor.changeCameraAngle(90);
			expect(Math.abs(camera.angleFinal[1])).toBeLessThanOrEqual(180);
			expect(camera.angleFinal[1] - camera.angle[1]).toBeCloseTo(before + 90, 6);
			camera.angle[1] = camera.angleFinal[1]; // the camera caught up
		}
		for (let i = 0; i < 20; i++) {
			Cursor.changeCameraAngle(-45);
			expect(Math.abs(camera.angleFinal[1])).toBeLessThanOrEqual(180);
			camera.angle[1] = camera.angleFinal[1];
		}
	});

	it('keeps indoor maps within their turn limits', () => {
		mocks.db.isIndoor.mockReturnValue(true);
		camera.angleFinal[1] = -40;
		Cursor.changeCameraAngle(90);
		expect(camera.angleFinal[1]).toBe(-25);
		Cursor.changeCameraAngle(-90);
		expect(camera.angleFinal[1]).toBe(-60);
	});
});

describe('JoystickMouseCursorAdapter null cursor target', () => {
	it('context menu and grid navigation cope with nothing under the cursor', () => {
		const original = document.elementFromPoint;
		document.elementFromPoint = () => null;
		try {
			expect(Cursor.contextMenu()).toBe(false);
			expect(() => Cursor.navigateDraggableItems('left')).not.toThrow();
		} finally {
			document.elementFromPoint = original;
		}
	});
});
