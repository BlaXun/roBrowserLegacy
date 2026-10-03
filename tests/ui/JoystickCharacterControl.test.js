import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	sent: [],
	session: { Entity: null, moveAction: null },
	camera: { angle: [0, 0] }
}));

vi.mock('Engine/SessionStorage.js', () => ({ default: mocks.session }));
vi.mock('Renderer/EntityManager.js', () => ({ default: {} }));
vi.mock('Network/NetworkManager.js', () => ({ default: { sendPacket: pkt => mocks.sent.push(pkt) } }));
vi.mock('Network/PacketStructure.js', () => {
	function REQUEST_MOVE() {
		this.dest = [0, 0];
	}
	return { default: { CZ: { REQUEST_MOVE, REQUEST_MOVE2: REQUEST_MOVE } } };
});
vi.mock('Network/PacketVerManager.js', () => ({ default: { value: 20221005 } }));
vi.mock('Renderer/Camera.js', () => ({ default: mocks.camera }));
vi.mock('Utils/PathFinding.js', () => ({ default: {} }));
vi.mock('UI/Components/JoystickUI/JoystickTargetService.js', () => ({ default: {} }));

const { default: Character } = await import('UI/Components/JoystickUI/JoystickCharacterControl.js');

describe('JoystickCharacterControl.move with a rotated camera', () => {
	beforeEach(() => {
		mocks.sent.length = 0;
		mocks.session.Entity = { position: [100, 100, 0] };
		Character.releaseStick();
	});

	// The camera shows a map step at R(-angle). Projecting the walk back to
	// the screen must point where the stick was pushed (x right, y up). This
	// guards the sign; whole-cell destinations are too coarse to tell the
	// continuous angle from the old 45 degree bucket.
	const angles = [0, 17.5, 45, 90, -45, -122.5, 180];
	const pushes = [
		[1, 0],
		[0, 1],
		[-1, 0],
		[0.7, -0.7]
	];

	angles.forEach(degrees => {
		pushes.forEach(([x, y]) => {
			it(`walks toward screen (${x}, ${y}) at ${degrees} degrees`, () => {
				mocks.camera.angle[1] = degrees;
				mocks.camera.direction = Math.round(degrees / 45); // the old sprite bucket
				Character.move(x, y);

				const pkt = mocks.sent[mocks.sent.length - 1];
				const dx = pkt.dest[0] - 100;
				const dy = pkt.dest[1] - 100;
				const a = (-degrees * Math.PI) / 180;
				const sx = dx * Math.cos(a) - dy * Math.sin(a);
				const sy = dx * Math.sin(a) + dy * Math.cos(a);

				// Destinations are whole cells, so allow the rounding error
				const cos = (sx * x + sy * y) / (Math.hypot(sx, sy) * Math.hypot(x, y));
				expect(cos).toBeGreaterThan(0.9);
			});
		});
	});
});
