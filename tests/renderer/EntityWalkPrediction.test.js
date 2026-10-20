import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ serverTick: 0, serverTickSynced: true, ping: { value: 0 } }));

// Straight paths on an open map: diagonal steps first, then straight ones.
const pathFinding = vi.hoisted(() => ({
	MAX_WALKPATH: 64,
	search(x0, y0, x1, y1, range, out) {
		let x = x0;
		let y = y0;
		let n = 0;
		out[n * 2] = x;
		out[n * 2 + 1] = y;
		n++;
		while (x !== x1 || y !== y1) {
			x += Math.sign(x1 - x);
			y += Math.sign(y1 - y);
			out[n * 2] = x;
			out[n * 2 + 1] = y;
			n++;
		}
		return n;
	},
	searchLong(x0, y0, x1, y1, range, out) {
		return { success: pathFinding.straight, pathLength: pathFinding.search(x0, y0, x1, y1, range, out) - 1 };
	},
	straight: true
}));

vi.mock('Engine/SessionStorage.js', () => ({ default: session }));
vi.mock('Utils/PathFinding.js', () => ({ default: pathFinding }));
vi.mock('Renderer/Map/Altitude.js', () => ({ default: { getCellHeight: () => 0 } }));

vi.mock('DB/DBManager.js', () => ({ default: {} }));

const configs = vi.hoisted(() => ({ movePrediction: true }));
vi.mock('Core/Configs.js', () => ({
	default: { get: (key, defaultValue) => (key in configs ? configs[key] : defaultValue) }
}));

const { default: InitWalk, gridPathDuration } = await import('Renderer/Entity/EntityWalk.js');
const { default: InitAction } = await import('Renderer/Entity/EntityAction.js');

const ACTION = { IDLE: 0, WALK: 1, ATTACK: 2, READYFIGHT: 3, DIE: 4 };
const SPEED = 150;
let now = 0;

function makeEntity(x, y) {
	function Entity() {}
	Entity.TYPE_PC = 0;
	Entity.TYPE_MOB = 5;
	const entity = new Entity();
	Object.assign(entity, {
		objecttype: Entity.TYPE_MOB,
		position: new Float32Array([x, y, 0]),
		ACTION,
		action: ACTION.IDLE,
		cast: { display: false },
		setAction(option) {
			this.action = option.action;
		}
	});
	InitWalk.call(entity);
	entity.walk.speed = SPEED;
	return entity;
}

function step(entity, ms) {
	for (let t = 0; t < ms; t += 10) {
		now += 10;
		entity.walkProcess();
	}
}

beforeEach(() => {
	now = 1_000_000;
	vi.spyOn(Date, 'now').mockImplementation(() => now);
	session.serverTick = 50_000;
	session.serverTickSynced = true;
	session.ping.value = 0;
	configs.movePrediction = true;
});

describe('gridPathDuration', () => {
	it('counts straight and diagonal steps as the server does', () => {
		const path = new Int16Array([0, 0, 1, 0, 2, 1]);
		expect(gridPathDuration(path, 3, 100)).toBeCloseTo(100 + 141.4);
	});
});

describe('walkTo', () => {
	it('starts from where the entity is drawn, even for an old packet', () => {
		const mob = makeEntity(10, 10);
		session.ping.value = 100;
		// The server started this walk 150 ms ago.
		mob.walkTo(10, 10, 16, 10, 0, session.serverTick - 150);
		mob.walkProcess();
		expect(mob.position[0]).toBe(10);
		// ...and makes up the time by walking a little faster.
		const total = mob.walk.segmentDurations.slice(0, 6).reduce((a, b) => a + b, 0);
		expect(total).toBeCloseTo(6 * SPEED - 150);
	});

	it('takes over a walk where it is drawn when a new packet arrives', () => {
		const mob = makeEntity(10, 10);
		mob.walkTo(10, 10, 16, 10, 0, session.serverTick);
		step(mob, 220);
		const before = mob.position[0];
		mob.walkTo(11, 10, 16, 12, 0, session.serverTick);
		mob.walkProcess();
		expect(mob.position[0]).toBeCloseTo(before, 5);
	});

	it('makes up at most one cell of an old packet for a monster, all of it for a player', () => {
		session.ping.value = 300;
		const mob = makeEntity(10, 10);
		mob.walkTo(10, 10, 16, 10, 0, session.serverTick - 300);
		const mobTotal = mob.walk.segmentDurations.slice(0, 6).reduce((a, b) => a + b, 0);
		expect(mobTotal).toBeCloseTo(6 * SPEED - SPEED);

		const player = makeEntity(10, 10);
		player.objecttype = player.constructor.TYPE_PC;
		player.walkTo(10, 10, 16, 10, 0, session.serverTick - 300);
		const playerTotal = player.walk.segmentDurations.slice(0, 6).reduce((a, b) => a + b, 0);
		expect(playerTotal).toBeCloseTo(6 * SPEED - 300);
	});

	it('searches one path per move packet, from where the entity is drawn', () => {
		const mob = makeEntity(10, 10);
		const search = vi.spyOn(pathFinding, 'search');
		// The server has it a cell further on than it is drawn.
		mob.walkTo(11, 10, 16, 10, 0, session.serverTick);
		expect(search).toHaveBeenCalledOnce();
		expect(search.mock.calls[0].slice(0, 2)).toEqual([10, 10]);
		search.mockRestore();
	});
});

describe('predictWalkTo', () => {
	it('starts walking before the server answers', () => {
		const me = makeEntity(10, 10);
		expect(me.predictWalkTo(15, 10, 400)).toBe(true);
		step(me, 150);
		expect(me.position[0]).toBeCloseTo(11, 1);
		expect(me.action).toBe(ACTION.WALK);
	});

	it('does not move a player who cannot', () => {
		const me = makeEntity(10, 10);
		me.action = ACTION.ATTACK;
		expect(me.predictWalkTo(15, 10, 400)).toBe(false);
		me.action = ACTION.IDLE;
		me._bodyState = 1; // stunned, frozen, ...
		expect(me.predictWalkTo(15, 10, 400)).toBe(false);
	});

	it('does not start a walk the server would refuse', () => {
		const me = makeEntity(10, 10);
		expect(me.predictWalkTo(28, 10, 400)).toBe(false);
		pathFinding.straight = false;
		expect(me.predictWalkTo(26, 10, 400)).toBe(false);
		expect(me.predictWalkTo(24, 10, 400)).toBe(true);
		pathFinding.straight = true;
		expect(me.predictWalkTo(26, 10, 400)).toBe(true);
	});

	it('hands the walk to the server reply without a jump', () => {
		const me = makeEntity(10, 10);
		me.predictWalkTo(15, 10, 400);
		step(me, 100);
		const before = me.position[0];
		me.walkTo(10, 10, 15, 10, 0, session.serverTick);
		expect(me.walk.predicted).toBe(null);
		me.walkProcess();
		expect(me.position[0]).toBeCloseTo(before, 5);
		step(me, 2000);
		expect(me.position[0]).toBe(15);
	});

	it('ignores a reply to an older click', () => {
		const me = makeEntity(10, 10);
		me.predictWalkTo(15, 10, 400);
		step(me, 100);
		me.predictWalkTo(10, 15, 400);
		step(me, 50);
		me.walkTo(10, 10, 15, 10, 0, session.serverTick);
		// Still heading for the second click.
		expect(me.walk.path[me.walk.total - 2]).toBe(10);
		expect(me.walk.path[me.walk.total - 1]).toBe(15);
		expect(me.walk.predicted.fallback).toEqual([15, 10]);
	});

	it('walks back when the server never answers', () => {
		const me = makeEntity(10, 10);
		me.predictWalkTo(15, 10, 400);
		step(me, 410);
		expect(me.position[0]).toBeGreaterThan(12);
		step(me, 2000);
		expect(me.position[0]).toBe(10);
		expect(me.position[1]).toBe(10);
		expect(me.action).toBe(ACTION.IDLE);
	});

	it('walks back from a short walk the server never answers', () => {
		const me = makeEntity(10, 10);
		me.predictWalkTo(11, 10, 400);
		step(me, 300); // there at 150 ms, no reply
		expect(me.position[0]).toBe(11);
		step(me, 2000);
		expect([me.position[0], me.position[1]]).toEqual([10, 10]);
		expect(me.walk.predicted).toBe(null);
	});

	it('stays put when the reply comes after a short walk ended', () => {
		const me = makeEntity(10, 10);
		me.predictWalkTo(11, 10, 400);
		step(me, 250);
		me.walkTo(10, 10, 11, 10, 0, session.serverTick);
		expect(me.walk.predicted).toBe(null);
		step(me, 2000);
		expect([me.position[0], me.position[1]]).toEqual([11, 10]);
	});

	it('walks back when a hit stops a walk the server never answers', () => {
		// The real setAction, which drops the route when a walk turns into a hurt.
		function Pc() {}
		Pc.TYPE_PC = 0;
		const me = Object.assign(new Pc(), {
			objecttype: Pc.TYPE_PC,
			position: new Float32Array([10, 10, 0]),
			cast: { display: false },
			sound: { free() {} }
		});
		InitAction.call(me);
		InitWalk.call(me);
		me.action = me.ACTION.IDLE;
		me.walk.speed = SPEED;
		me.predictWalkTo(15, 10, 400);
		step(me, 200);
		me.setAction({ action: me.ACTION.HURT, frame: 0, play: true });
		const stoppedAt = me.position[0];
		expect(stoppedAt).toBeGreaterThan(10);
		step(me, 2000);
		expect([me.position[0], me.position[1]]).toEqual([10, 10]);
	});

	it('puts a player who died meanwhile where the server has it, without a walk', () => {
		const me = makeEntity(10, 10);
		me.predictWalkTo(15, 10, 400);
		step(me, 200);
		me.resetRoute(); // what the real setAction does on the way into DIE
		me.walk.predicted = { queue: [[15, 10]], fallback: [10, 10], deadline: now + 200 };
		me.action = ACTION.DIE;
		step(me, 1000);
		expect(me.action).toBe(ACTION.DIE);
		expect([me.position[0], me.position[1]]).toEqual([10, 10]);
	});
});

describe('settleTo', () => {
	it('glides to a stop cell nearby instead of jumping', () => {
		const mob = makeEntity(10, 10);
		mob.walkTo(10, 10, 16, 10, 0, session.serverTick);
		step(mob, 220);
		const before = mob.position[0];
		expect(mob.settleTo(12, 10)).toBe(true);
		mob.walkProcess();
		expect(mob.position[0]).toBeCloseTo(before, 1);
		step(mob, 250);
		expect(mob.position[0]).toBe(12);
		expect(mob.action).toBe(ACTION.IDLE);
	});

	it('keeps an attack that starts while it glides', () => {
		const mob = makeEntity(10, 10);
		mob.walkTo(10, 10, 16, 10, 0, session.serverTick);
		step(mob, 220);
		mob.settleTo(12, 10);
		mob.action = ACTION.ATTACK;
		step(mob, 250);
		expect(mob.position[0]).toBe(12);
		expect(mob.action).toBe(ACTION.ATTACK);
	});

	it('jumps when the stop cell is far away', () => {
		const mob = makeEntity(10, 10);
		expect(mob.settleTo(20, 10)).toBe(false);
		expect(mob.position[0]).toBe(20);
	});
});

describe('with movePrediction off (the default)', () => {
	beforeEach(() => {
		delete configs.movePrediction;
	});

	it('keeps the old timing: an old packet starts the walk ahead, by at most a cell for a monster', () => {
		session.ping.value = 300;
		const mob = makeEntity(10, 10);
		mob.walkTo(10, 10, 16, 10, 0, session.serverTick - 300);
		expect(mob.walk.tick).toBe(now - SPEED);
		// FixPathTime adds the difference to each segment; none here, as both paths are straight.
		const total = mob.walk.segmentDurations.slice(0, 6).reduce((a, b) => a + b, 0);
		expect(total).toBeCloseTo(6 * SPEED);

		const player = makeEntity(10, 10);
		player.objecttype = player.constructor.TYPE_PC;
		player.walkTo(10, 10, 16, 10, 0, session.serverTick - 300);
		expect(player.walk.tick).toBe(now - 300);
	});

	it('searches one path per move packet', () => {
		const mob = makeEntity(10, 10);
		const search = vi.spyOn(pathFinding, 'search');
		mob.walkTo(11, 10, 16, 10, 0, session.serverTick);
		expect(search).toHaveBeenCalledOnce();
		search.mockRestore();
	});
});
