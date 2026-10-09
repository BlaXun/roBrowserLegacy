import { describe, expect, it, vi } from 'vitest';

// Only the pure helpers are under test; stub what the module imports.
vi.mock('Engine/SessionStorage.js', () => ({ default: {} }));
vi.mock('Renderer/EntityManager.js', () => ({ default: {} }));
vi.mock('Renderer/Renderer.js', () => ({ default: {} }));
vi.mock('Renderer/Camera.js', () => ({ default: { angle: [0, 0] } }));
vi.mock('Renderer/Map/Altitude.js', () => ({ default: { getCellHeight: () => 0 } }));
const controls = vi.hoisted(() => ({ joyAimEnabled: false, joyRightStickMode: 0, save: () => {} }));
vi.mock('Preferences/Controls.js', () => ({ default: controls }));
vi.mock('UI/Components/ChatBox/ChatBox.js', () => ({ default: {} }));
vi.mock('UI/Components/JoystickUI/JoystickTargetService.js', () => ({ default: {} }));
vi.mock('UI/Components/JoystickUI/JoystickMouseCursorAdapter.js', () => ({ default: {} }));
vi.mock('UI/Components/JoystickUI/JoystickUIRenderer.js', () => ({ default: { updateStickMode: () => {} } }));

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

describe('JoystickAimMode enable switch', () => {
	it('is off by default and stays off even with the aim mode remembered', () => {
		controls.joyAimEnabled = false;
		controls.joyRightStickMode = Aim.MODE.AIM;
		expect(Aim.isActive()).toBe(false);
	});

	it('turning it on aims straight away; turning it off returns to the cursor', () => {
		Aim.setEnabled(true);
		expect(controls.joyRightStickMode).toBe(Aim.MODE.AIM);
		expect(Aim.isActive()).toBe(true);

		Aim.setEnabled(false);
		expect(controls.joyRightStickMode).toBe(Aim.MODE.CURSOR);
		expect(Aim.isActive()).toBe(false);
	});

	it('turning it on moves Quick-Cast Off to Instant, and keeps Release', () => {
		controls.joyQuick = Aim.QUICK_CAST.OFF;
		Aim.setEnabled(true);
		expect(controls.joyQuick).toBe(Aim.QUICK_CAST.INSTANT);

		controls.joyQuick = Aim.QUICK_CAST.RELEASE;
		Aim.setEnabled(true);
		expect(controls.joyQuick).toBe(Aim.QUICK_CAST.RELEASE);

		// Turning it off keeps the mode the player has
		Aim.setEnabled(false);
		expect(controls.joyQuick).toBe(Aim.QUICK_CAST.RELEASE);
	});

	it('treats a stored Off as Instant while aiming is on, and only then', () => {
		controls.joyQuick = Aim.QUICK_CAST.OFF;
		controls.joyAimEnabled = true;
		expect(Aim.quickCastMode()).toBe(Aim.QUICK_CAST.INSTANT);

		controls.joyAimEnabled = false;
		expect(Aim.quickCastMode()).toBe(Aim.QUICK_CAST.OFF);

		controls.joyQuick = Aim.QUICK_CAST.RELEASE;
		controls.joyAimEnabled = true;
		expect(Aim.quickCastMode()).toBe(Aim.QUICK_CAST.RELEASE);
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

describe('JoystickAimMode.createRetargetGate', () => {
	it('lets only a firm push pick a target', () => {
		const gate = Aim.createRetargetGate();
		expect(gate.step(0.3, 0, 0)).toBe(false);
		expect(gate.step(0.8, 0, 16)).toBe(true);
	});

	it('ignores the spring-back past the centre after a release', () => {
		const gate = Aim.createRetargetGate();
		expect(gate.step(1, 0, 0)).toBe(true);
		expect(gate.step(0.2, 0, 16)).toBe(false); // falling back
		expect(gate.step(-0.7, 0, 33)).toBe(false); // overshoot the other way
		expect(gate.isLocked(33)).toBe(true);
		expect(gate.step(0, 0, 50)).toBe(false);
	});

	it('also after a release that passed through the deadzone', () => {
		const gate = Aim.createRetargetGate();
		gate.step(0, 1, 0);
		gate.step(0, 0, 16); // in the deadzone
		expect(gate.step(0, -0.6, 33)).toBe(false);
	});

	it('ignores a turn-around within one frame at full tilt', () => {
		const gate = Aim.createRetargetGate();
		expect(gate.step(1, 0, 0)).toBe(true);
		expect(gate.step(-0.8, 0.1, 16)).toBe(false);
	});

	it('picks targets again once the lock has run out', () => {
		const gate = Aim.createRetargetGate();
		gate.step(1, 0, 0);
		gate.step(0, 0, 16);
		expect(gate.step(-1, 0, 100)).toBe(false);
		expect(gate.step(-1, 0, 200)).toBe(true);
		expect(gate.isLocked(200)).toBe(false);
	});

	it('keeps up with a steady sweep around the stick', () => {
		const gate = Aim.createRetargetGate();
		for (let i = 0; i < 12; i++) {
			const a = (i * Math.PI) / 6; // 30 degrees a frame
			expect(gate.step(Math.cos(a), Math.sin(a), i * 16)).toBe(true);
		}
	});

	it('forgets the lock on reset', () => {
		const gate = Aim.createRetargetGate();
		gate.step(1, 0, 0);
		gate.step(0, 0, 16);
		gate.reset();
		expect(gate.step(-1, 0, 33)).toBe(true);
	});

	it('never asks for less than the deadzone', () => {
		controls.joyDeadline = 0.6;
		try {
			const gate = Aim.createRetargetGate();
			expect(gate.step(0.55, 0, 0)).toBe(false);
			expect(gate.step(0.7, 0, 16)).toBe(true);
		} finally {
			delete controls.joyDeadline;
		}
	});
});
