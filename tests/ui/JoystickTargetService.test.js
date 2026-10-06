import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	class FakeEntity {
		constructor(GID, objecttype, opts = {}) {
			this.GID = GID;
			this.objecttype = objecttype;
			this.action = 0;
			this.remove_tick = 0;
			this.ACTION = { DIE: 8 };
			this.attackable = !!opts.attackable;
			this.onFocus = () => {};
			this.onFocusEnd = () => {};
		}
		canAttackEntity() {
			return this.attackable;
		}
	}
	FakeEntity.TYPE_PC = 0;
	FakeEntity.TYPE_NPC = 1;
	FakeEntity.TYPE_ITEM = 2;
	FakeEntity.TYPE_MOB = 5;

	return {
		FakeEntity,
		session: { Entity: null },
		focus: null,
		list: new Map(),
		closest: null,
		controls: { attackTargetMode: 0, joyCycleMode: 0 }
	};
});

vi.mock('Engine/SessionStorage.js', () => ({ default: mocks.session }));
vi.mock('Renderer/EntityManager.js', () => ({
	default: {
		get: gid => mocks.list.get(gid),
		getFocusEntity: () => mocks.focus,
		setFocusEntity: e => {
			mocks.focus = e;
		},
		getClosestEntity: (src, type) => (mocks.closest && mocks.closest.objecttype === type ? mocks.closest : null),
		getLowestHpEntity: () => null,
		getEntitiesSortedByDistance: () => []
	}
}));
vi.mock('Preferences/Controls.js', () => ({ default: mocks.controls }));
vi.mock('UI/Components/JoystickUI/JoystickMouseCursorAdapter.js', () => ({ default: {} }));
vi.mock('UI/Components/ChatBox/ChatBox.js', () => ({ default: {} }));
vi.mock('UI/CursorManager.js', () => ({ default: { ACTION: {} } }));

const { default: Target } = await import('UI/Components/JoystickUI/JoystickTargetService.js');

const { FakeEntity } = mocks;

function spawn(entity) {
	mocks.list.set(entity.GID, entity);
	return entity;
}

describe('JoystickTargetService focus validity', () => {
	beforeEach(() => {
		mocks.list.clear();
		mocks.session.Entity = spawn(new FakeEntity(1, FakeEntity.TYPE_PC));
		mocks.focus = null;
		mocks.closest = null;
	});

	it('honours a focused live mob', () => {
		const mob = spawn(new FakeEntity(100, FakeEntity.TYPE_MOB));
		mocks.focus = mob;
		expect(Target.getAttackableFocus()).toBe(mob);
		expect(Target.getEntity()).toBe(mob);
	});

	it('ignores a focused NPC and falls back to the closest mob', () => {
		const npc = spawn(new FakeEntity(200, FakeEntity.TYPE_NPC));
		const mob = spawn(new FakeEntity(100, FakeEntity.TYPE_MOB));
		mocks.focus = npc;
		mocks.closest = mob;
		expect(Target.getAttackableFocus()).toBe(null);
		expect(Target.getEntity()).toBe(mob);
	});

	it('ignores a focused friendly player, honours one the map lets us attack', () => {
		const friend = spawn(new FakeEntity(300, FakeEntity.TYPE_PC));
		mocks.focus = friend;
		expect(Target.getAttackableFocus()).toBe(null);

		const enemy = spawn(new FakeEntity(301, FakeEntity.TYPE_PC, { attackable: true }));
		mocks.focus = enemy;
		expect(Target.getAttackableFocus()).toBe(enemy);
	});

	it('ignores a stale focus left over from the previous map', () => {
		// EntityManager.free() cleans entities (remove_tick 0) and empties
		// the list, but leaves the focus pointing at the old object.
		const old = new FakeEntity(100, FakeEntity.TYPE_MOB);
		mocks.focus = old;
		expect(Target.getAttackableFocus()).toBe(null);

		// Same GID, different object (re-spawned entity) is not the focus either
		spawn(new FakeEntity(100, FakeEntity.TYPE_MOB));
		expect(Target.getAttackableFocus()).toBe(null);
	});

	it('ignores a dead or vanishing mob', () => {
		const mob = spawn(new FakeEntity(100, FakeEntity.TYPE_MOB));
		mocks.focus = mob;
		mob.action = mob.ACTION.DIE;
		expect(Target.getAttackableFocus()).toBe(null);

		mob.action = 0;
		mob.remove_tick = 1234;
		expect(Target.getAttackableFocus()).toBe(null);
	});

	it('never targets the player', () => {
		mocks.focus = mocks.session.Entity;
		expect(Target.isAttackable(mocks.session.Entity)).toBe(false);
		expect(Target.getEntity()).toBe(mocks.session.Entity); // the "no target" sentinel
	});
});

describe('JoystickTargetService categories', () => {
	beforeEach(() => {
		mocks.focus = null;
		mocks.list.clear();
		mocks.controls.joyCycleMode = 0;
	});

	it('Support leaves the cycle and the aim nothing to pick (the radial does)', () => {
		mocks.controls.joyCycleMode = 4;
		expect(Target.getCycleTypes(FakeEntity)).toEqual([]);
		mocks.controls.joyCycleMode = 0;
		expect(Target.getCycleTypes(FakeEntity)).toEqual([FakeEntity.TYPE_MOB]);
	});

	it('clearTarget drops the focus and keeps the cursor where it is', () => {
		const mob = spawn(new FakeEntity(7, FakeEntity.TYPE_MOB));
		mob.onFocusEnd = vi.fn();
		mocks.focus = mob;
		Target.clearTarget();
		expect(mocks.focus).toBeNull();
		expect(mob.onFocusEnd).toHaveBeenCalled();
	});
});
