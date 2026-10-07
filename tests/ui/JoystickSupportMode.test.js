import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	function entity(GID, hp, hpMax, extra = {}) {
		return Object.assign(
			{
				GID,
				remove_tick: 0,
				action: 0,
				ACTION: { DIE: 8 },
				_job: 4,
				life: { hp, hp_max: hpMax },
				display: { name: 'E' + GID },
				position: [10, 10, 0]
			},
			extra
		);
	}

	return {
		entity,
		session: {},
		entities: new Map(),
		lives: new Map(),
		party: [],
		category: { isSupport: vi.fn(() => true) },
		aim: { isActive: vi.fn(() => true), isOnScreen: vi.fn(() => false), project: vi.fn(), drawRing: vi.fn() },
		cursor: { moveMouseToEntity: vi.fn(), quickCastClick: vi.fn() },
		sts: {
			TYPE: { ENEMY: 1, PLACE: 2, SELF: 4, FRIEND: 16, HOMUN: 128 },
			flag: 16,
			skill: null,
			getFlag: vi.fn(() => mocks.sts.flag),
			getSkill: vi.fn(() => (mocks.sts.flag ? mocks.sts.skill : null)),
			intersectEntityId: vi.fn(),
			onUseSkillToId: vi.fn(),
			remove: vi.fn()
		}
	};
});

vi.mock('Engine/SessionStorage.js', () => ({ default: mocks.session }));
vi.mock('Renderer/EntityManager.js', () => ({
	default: {
		get: gid => mocks.entities.get(gid),
		getLife: gid => mocks.lives.get(gid) || null
	}
}));
vi.mock('Renderer/Entity/Entity.js', () => ({ default: function () {} }));
vi.mock('Renderer/SpriteRenderer.js', () => ({ default: {} }));
vi.mock('Renderer/Renderer.js', () => ({ default: { canvas: null } }));
vi.mock('Renderer/Camera.js', () => ({ default: {} }));
vi.mock('Core/Client.js', () => ({ default: { loadFile: vi.fn() } }));
vi.mock('DB/DBManager.js', () => ({ default: { INTERFACE_PATH: '' } }));
vi.mock('UI/Components/PartyFriends/PartyFriends.js', () => ({
	default: { getPartyMembers: () => mocks.party }
}));
vi.mock('UI/Components/SkillTargetSelection/SkillTargetSelection.js', () => ({ default: mocks.sts }));
vi.mock('DB/Skills/SkillConst.js', () => ({ default: { ALL_RESURRECTION: 54 } }));
vi.mock('DB/Skills/SkillInfo.js', () => ({
	default: { 54: { SpAmount: [60, 60, 60, 60], AttackRange: [9, 9, 9, 9] } }
}));
vi.mock('UI/Components/JoystickUI/JoystickTargetCategory.js', () => ({ default: mocks.category }));
vi.mock('UI/Components/JoystickUI/JoystickAimMode.js', () => ({ default: mocks.aim }));
vi.mock('UI/Components/JoystickUI/JoystickMouseCursorAdapter.js', () => ({ default: mocks.cursor }));

const { default: Support } = await import('UI/Components/JoystickUI/JoystickSupportMode.js');

const DEADZONE = 0.1;
let now = 0;

function stick(x, y) {
	return Support.update(x, y, Math.hypot(x, y), DEADZONE);
}

function setup() {
	mocks.entities.clear();
	mocks.lives.clear();

	const self = mocks.entity(1, 900, 1000);
	mocks.session.Entity = self;
	mocks.session.AID = 1;
	mocks.session.hasParty = true;
	mocks.session.homunId = 0;
	mocks.session.mercId = 0;

	mocks.entities.set(2, mocks.entity(2, 200, 1000)); // 20 %, in sight
	mocks.entities.set(3, mocks.entity(3, 600, 1000)); // 60 %, in sight
	mocks.lives.set(4, { hp: 100, hp_max: 1000 }); // known HP, out of sight

	mocks.party = [
		{ AID: 1, characterName: 'Me', state: 0 },
		{ AID: 2, characterName: 'Low', state: 0, class_: 1 },
		{ AID: 3, characterName: 'Mid', state: 0, class_: 2 },
		{ AID: 4, characterName: 'Far', state: 0, class_: 3 }
	];
	mocks.sts.skill = { SKID: 28, level: 10, spcost: 40, attackRange: 9 }; // Heal
}

describe('JoystickSupportMode members', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setup();
		Support.clearFocus();
	});

	it('lists yourself, the whole party in its order, then your companions, each in a fixed place', () => {
		mocks.party.push({ AID: 5, characterName: 'Offline', state: 1 });
		mocks.entities.set(5, mocks.entity(5, 100, 100)); // a stale entity is not used for the offline
		mocks.session.homunId = 50;
		mocks.entities.set(50, mocks.entity(50, 10, 100));
		mocks.session.mercId = 60; // not in sight: greyed, still in its place

		const members = Support.getMembers();
		expect(members.map(m => m.key)).toEqual(['self', 'aid:2', 'aid:3', 'aid:4', 'aid:5', 'homun', 'merc']);
		expect(members.map(m => m.selectable)).toEqual([true, true, true, false, false, true, false]);
		expect(members[4].offline).toBe(true);
		expect(members[3].hp).toBe(100); // from the party HP packets
		expect(members[5].name).toBe('E50');
	});

	it('marks the dead', () => {
		mocks.entities.get(3).action = 8;
		mocks.party[1].isDead = true;
		const members = Support.getMembers();
		expect(members[1].dead).toBe(true);
		expect(members[2].dead).toBe(true);
	});

	it('D-pad steps through the members in sight, lowest HP first, the dead last', () => {
		mocks.entities.set(6, mocks.entity(6, 0, 1000));
		mocks.party.push({ AID: 6, characterName: 'Dead', state: 0 });

		const order = [];
		for (let i = 0; i < 4; i++) {
			Support.cycle('next');
			order.push(Support.getFocus().key);
		}
		expect(order).toEqual(['aid:2', 'aid:3', 'self', 'aid:6']);

		Support.cycle('next');
		expect(Support.getFocus().key).toBe('aid:2');
		Support.cycle('prev');
		expect(Support.getFocus().key).toBe('aid:6');
	});
});

describe('JoystickSupportMode radial', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setup();
		Support.clearFocus();
		Support.cancelPending(false);
		mocks.sts.flag = 16;
		now = 1000;
		vi.spyOn(performance, 'now').mockImplementation(() => now);
		stick(0, 0);
	});

	it('segment 0 is straight up, the rest follow clockwise', () => {
		expect(Support.segmentAt(0, -1, 4)).toBe(0);
		expect(Support.segmentAt(1, 0, 4)).toBe(1);
		expect(Support.segmentAt(0, 1, 4)).toBe(2);
		expect(Support.segmentAt(-1, 0, 4)).toBe(3);
	});

	it('takes the right stick in Support, in aim and cursor mode alike', () => {
		expect(stick(0, 0)).toBe(true);
		mocks.aim.isActive.mockReturnValue(false);
		expect(stick(1, 0)).toBe(true);
		mocks.aim.isActive.mockReturnValue(true);
		mocks.category.isSupport.mockReturnValue(false);
		expect(stick(1, 0)).toBe(false);
		mocks.category.isSupport.mockReturnValue(true);
	});

	it('holding the stick on a member focuses it, letting go closes the radial', () => {
		stick(1, 0); // 4 members: right is segment 1 (aid:2)
		expect(Support.isRadialOpen()).toBe(true);
		expect(Support.getFocus()).toBeNull();
		now += 300;
		stick(1, 0);
		expect(Support.getFocus().key).toBe('aid:2');
		stick(0, 0);
		expect(Support.isRadialOpen()).toBe(false);
		expect(Support.getFocus().key).toBe('aid:2');
	});

	it('sweeping past a member does not pick it', () => {
		stick(1, 0);
		now += 300;
		stick(1, 0);
		now += 16;
		stick(0, 1); // a frame on segment 2 on the way back
		now += 16;
		stick(0, 0);
		expect(Support.getFocus().key).toBe('aid:2');
	});

	it('a member out of sight cannot be picked', () => {
		stick(-1, 0); // segment 3: aid:4, out of sight
		now += 300;
		stick(-1, 0);
		stick(0, 0);
		expect(Support.getFocus()).toBeNull();
	});

	it('a pending skill waits for A, then goes to the member the stick chose', () => {
		Support.openPending(0, 'Heal');
		expect(stick(0, 0)).toBe(true); // owns the stick even if the radial just opened
		expect(Support.isPending()).toBe(true);

		stick(0, 1); // segment 2: aid:3
		now += 300;
		stick(0, 1);
		stick(0, 0);
		expect(mocks.sts.intersectEntityId).not.toHaveBeenCalled();
		expect(Support.isRadialOpen()).toBe(true);
		expect(Support.getHighlight()).toBe(2);

		expect(Support.confirmPending()).toBe(true);
		expect(mocks.sts.intersectEntityId).toHaveBeenCalledWith(3);
		expect(mocks.sts.remove).toHaveBeenCalled();
		expect(Support.isPending()).toBe(false);
		expect(Support.isRadialOpen()).toBe(false);
		expect(Support.getFocus().key).toBe('aid:3');
	});

	it('a pending radial opens on yourself, and A casts on you', () => {
		Support.openPending(0, 'Heal');
		stick(0, 0);
		expect(Support.getHighlight()).toBe(0);
		Support.confirmPending();
		expect(mocks.sts.onUseSkillToId).toHaveBeenCalledWith(28, 10, 1); // yourself: past the enemy-skill self check
	});

	it('the stick springing back keeps the settled member, an unsettled push goes back to you', () => {
		Support.openPending(0, 'Heal');
		stick(1, 0);
		now += 300;
		stick(1, 0);
		now += 16;
		stick(0, 1); // a frame on segment 2 on the way back
		stick(0, 0);
		expect(Support.getHighlight()).toBe(1);

		Support.cancelPending(false);
		Support.openPending(0, 'Heal');
		stick(1, 0);
		stick(0, 0);
		expect(Support.getHighlight()).toBe(0);
	});

	it('a skill pressed with the radial open goes to the highlighted member, settled or not', () => {
		stick(1, 0);
		now += 300;
		stick(1, 0); // aid:2 is the focus
		stick(0, 0);
		stick(0, -1); // the radial again, on yourself, not settled yet
		expect(Support.getFocus().key).toBe('aid:2');
		expect(Support.getFocusForSkill()).toBe(mocks.session.Entity);
		expect(Support.getFocus().key).toBe('self');
	});

	it('B closes the radial until the stick is let go', () => {
		stick(1, 0);
		expect(Support.dismiss()).toBe(true);
		expect(Support.isRadialOpen()).toBe(false);
		stick(1, 0); // still pushed: stays closed
		expect(Support.isRadialOpen()).toBe(false);
		stick(0, 0);
		stick(1, 0);
		expect(Support.isRadialOpen()).toBe(true);
	});

	it('B leaves a pending radial to the cancel', () => {
		Support.openPending(0, 'Heal');
		expect(Support.dismiss()).toBe(false);
		expect(Support.isPending()).toBe(true);
	});

	it('a stick resting slightly off centre still closes the radial', () => {
		stick(1, 0);
		stick(0.2, 0.1); // past the deadzone, under the release threshold
		expect(Support.isRadialOpen()).toBe(false);
	});

	it('without a skill pending, A is not taken', () => {
		expect(Support.confirmPending()).toBe(false);
	});

	it('the dead cannot take Heal, only Resurrection', () => {
		mocks.entities.get(3).action = 8; // aid:3, segment 2
		Support.openPending(0, 'Heal');
		stick(0, 1);
		now += 300;
		stick(0, 1);
		stick(0, 0);
		Support.confirmPending();
		expect(mocks.sts.intersectEntityId).not.toHaveBeenCalled();
		expect(Support.isPending()).toBe(true);
		Support.cancelPending(false);

		mocks.sts.skill = { SKID: 54, level: 4, spcost: 60, attackRange: 9 };
		Support.openPending(0, 'Resurrection');
		Support.confirmPending(); // yourself: alive
		expect(mocks.sts.intersectEntityId).not.toHaveBeenCalled();
		stick(0, 1);
		now += 300;
		stick(0, 1);
		Support.confirmPending();
		expect(mocks.sts.intersectEntityId).toHaveBeenCalledWith(3);
	});

	it('a ground skill takes the dead too', () => {
		mocks.sts.flag = 2;
		mocks.entities.get(3).action = 8;
		Support.openPending(0, 'Sanctuary');
		stick(0, 1);
		now += 300;
		stick(0, 1);
		Support.confirmPending();
		expect(mocks.cursor.moveMouseToEntity).toHaveBeenCalledWith(mocks.entities.get(3));
	});

	it('a focus the skill cannot take is no target for it', () => {
		mocks.entities.get(3).action = 8;
		stick(0, 1);
		now += 300;
		stick(0, 1); // no skill pending: the stick focuses aid:3
		expect(Support.getFocus().key).toBe('aid:3');
		expect(Support.getFocusForSkill()).toBeNull(); // Heal waiting

		mocks.sts.skill = { SKID: 54, level: 4, spcost: 60, attackRange: 9 };
		expect(Support.getFocusForSkill()).toBe(mocks.entities.get(3));
	});

	it('a member beyond the range can still be chosen', () => {
		mocks.entities.get(3).position = [30, 10, 0];
		Support.openPending(0, 'Heal');
		stick(0, 1);
		now += 300;
		stick(0, 1);
		Support.confirmPending();
		expect(mocks.sts.intersectEntityId).toHaveBeenCalledWith(3);
	});

	it('the pending radial owns the stick in cursor mode too', () => {
		mocks.aim.isActive.mockReturnValue(false);
		Support.openPending(0, 'Heal');
		expect(stick(1, 0)).toBe(true);
		mocks.aim.isActive.mockReturnValue(true);
	});

	it('picking nobody keeps the skill pending', () => {
		Support.openPending(0, 'Heal');
		stick(-1, 0); // out of sight
		now += 300;
		stick(-1, 0);
		stick(0, 0);
		Support.confirmPending();
		expect(Support.isPending()).toBe(true);
		expect(Support.isRadialOpen()).toBe(true);
		expect(mocks.sts.intersectEntityId).not.toHaveBeenCalled();
	});

	it('closes when the skill is cancelled elsewhere', () => {
		Support.openPending(0, 'Heal');
		mocks.sts.flag = 0;
		stick(0, 0);
		expect(Support.isPending()).toBe(false);
		expect(Support.isRadialOpen()).toBe(false);
	});

	it('the same shortcut again casts on yourself', () => {
		Support.openPending(3, 'Heal');
		expect(Support.pendingIndex()).toBe(3);
		Support.castPendingOnSelf();
		expect(mocks.sts.onUseSkillToId).toHaveBeenCalledWith(28, 10, 1); // yourself: past the enemy-skill self check
		expect(Support.isPending()).toBe(false);
	});

	it('cancelling can take the skill off the cursor', () => {
		Support.openPending(0, 'Heal');
		Support.cancelPending(true);
		expect(mocks.sts.remove).toHaveBeenCalled();
		expect(Support.isRadialOpen()).toBe(false);
	});
});

describe('JoystickSupportMode casting', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setup();
	});

	it('a ground skill lands where the member stands', () => {
		mocks.sts.flag = 2;
		const member = mocks.entities.get(2);
		expect(Support.castOn(member)).toBe(true);
		expect(mocks.cursor.moveMouseToEntity).toHaveBeenCalledWith(member);
		expect(mocks.cursor.quickCastClick).toHaveBeenCalled();
		expect(mocks.sts.intersectEntityId).not.toHaveBeenCalled();
	});

	it('nothing happens without a skill waiting', () => {
		mocks.sts.flag = 0;
		expect(Support.castOn(mocks.entities.get(2))).toBe(false);
		expect(mocks.sts.intersectEntityId).not.toHaveBeenCalled();
	});

	it('friend, homunculus and ground skills are Support, enemy-only ones are not', () => {
		expect(Support.isSupportSkill(16)).toBe(true);
		expect(Support.isSupportSkill(128)).toBe(true);
		expect(Support.isSupportSkill(2)).toBe(true);
		expect(Support.isSupportSkill(1)).toBe(false);
	});
});
