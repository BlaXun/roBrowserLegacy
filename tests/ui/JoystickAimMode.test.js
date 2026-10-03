import { describe, expect, it, vi } from 'vitest';

// Only the pure helpers are under test; stub what the module imports.
vi.mock('Engine/SessionStorage.js', () => ({ default: {} }));
vi.mock('Renderer/EntityManager.js', () => ({ default: {} }));
vi.mock('Renderer/Renderer.js', () => ({ default: {} }));
vi.mock('Renderer/Camera.js', () => ({ default: { angle: [0, 0] } }));
vi.mock('Renderer/Map/Altitude.js', () => ({ default: { getCellHeight: () => 0 } }));
vi.mock('Preferences/Controls.js', () => ({ default: { joyRightStickMode: 0, save: () => {} } }));
vi.mock('UI/Components/ChatBox/ChatBox.js', () => ({ default: {} }));
vi.mock('UI/Components/JoystickUI/JoystickTargetService.js', () => ({ default: {} }));
vi.mock('UI/Components/JoystickUI/JoystickMouseCursorAdapter.js', () => ({ default: {} }));
vi.mock('UI/Components/JoystickUI/JoystickUIRenderer.js', () => ({ default: {} }));

const { default: Aim } = await import('UI/Components/JoystickUI/JoystickAimMode.js');

function entity(x, y) {
	return { position: [x, y, 0] };
}

describe('JoystickAimMode.stickToMapDirection', () => {
	// The camera shows a map step at R(-angle); projecting the result back
	// must give the on-screen intent (x right, up = -stick y). A sign error
	// in the rotation cannot satisfy this at any angle but 0 and 180.
	const angles = [0, 17.5, 45, 90, -45, -122.5, 180];
	const intents = [
		[1, 0],
		[0, -1],
		[-0.7, 0.7],
		[0.3, -0.9]
	];

	angles.forEach(degrees => {
		intents.forEach(([x, y]) => {
			it(`round-trips stick (${x}, ${y}) at ${degrees} degrees`, () => {
				const [dx, dy] = Aim.stickToMapDirection(x, y, degrees);
				const a = (-degrees * Math.PI) / 180;
				const sx = dx * Math.cos(a) - dy * Math.sin(a);
				const sy = dx * Math.sin(a) + dy * Math.cos(a);
				const len = Math.hypot(x, y);
				expect(sx).toBeCloseTo(x / len, 6);
				expect(sy).toBeCloseTo(-y / len, 6);
			});
		});
	});

	it('maps stick up to map north with the camera unrotated', () => {
		const [dx, dy] = Aim.stickToMapDirection(0, -1, 0);
		expect(dx).toBeCloseTo(0, 6);
		expect(dy).toBeCloseTo(1, 6);
	});
});

describe('JoystickAimMode.findFirstHit', () => {
	const origin = [10, 10];
	const east = [1, 0];

	it('picks the nearest entity on the ray, not the nearest overall', () => {
		const behind = entity(8, 10);
		const offLine = entity(11, 12);
		const far = entity(16, 10.3);
		const near = entity(13, 9.5);
		const hit = Aim.findFirstHit(origin, east, [behind, offLine, far, near]);
		expect(hit.entity).toBe(near);
		expect(hit.along).toBeCloseTo(3, 6);
	});

	it('reaches far along the ray with no length limit', () => {
		const hit = Aim.findFirstHit(origin, east, [entity(40, 10)]);
		expect(hit.along).toBeCloseTo(30, 6);
	});

	it('ignores entities too far from the ray next to the character', () => {
		expect(Aim.findFirstHit(origin, east, [entity(12, 11.5)])).toBeNull();
	});

	it('widens the hit zone with distance, so an off-centre far mob still counts', () => {
		// 1.5 cells off the ray: too far at 2 cells away, close enough at 15
		expect(Aim.findFirstHit(origin, east, [entity(12, 11.5)])).toBeNull();
		expect(Aim.findFirstHit(origin, east, [entity(25, 11.5)])).not.toBeNull();
	});

	it('returns null with no candidates', () => {
		expect(Aim.findFirstHit(origin, east, [])).toBeNull();
	});
});
