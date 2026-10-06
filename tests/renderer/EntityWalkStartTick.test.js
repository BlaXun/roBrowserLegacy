import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ serverTick: 0, serverTickSynced: true, ping: { value: 0 } }));

vi.mock('Engine/SessionStorage.js', () => ({ default: session }));
vi.mock('Utils/PathFinding.js', () => ({ default: {} }));
vi.mock('Renderer/Map/Altitude.js', () => ({ default: {} }));

const { computeWalkStartTick } = await import('Renderer/Entity/EntityWalk.js');

const NOW = 1_000_000;
const MOVE_START = 50_000;

describe('computeWalkStartTick', () => {
	beforeEach(() => {
		session.serverTickSynced = true;
		session.ping.value = 30;
	});

	it('rolls a walk back by the time its packet took', () => {
		session.serverTick = MOVE_START + 20;
		expect(computeWalkStartTick(NOW, MOVE_START, 3000, 3000)).toBe(NOW - 20);
	});

	it('does not read clock drift as latency', () => {
		// A server clock at 0.889x, ten seconds after the last pong: the local
		// estimate is 1.1 s ahead, well inside the whole-path clamp.
		session.serverTick = MOVE_START + 1110;
		expect(computeWalkStartTick(NOW, MOVE_START, 3000, 3000)).toBe(NOW - 130);
	});

	it('fast-forwards nothing before a pong', () => {
		session.serverTickSynced = false;
		session.serverTick = MOVE_START + 500;
		expect(computeWalkStartTick(NOW, MOVE_START, 3000, 3000)).toBe(NOW);
	});

	it('still honours a tighter caller clamp', () => {
		session.ping.value = 400;
		session.serverTick = MOVE_START + 450;
		expect(computeWalkStartTick(NOW, MOVE_START, 3000, 150)).toBe(NOW - 150);
	});
});
