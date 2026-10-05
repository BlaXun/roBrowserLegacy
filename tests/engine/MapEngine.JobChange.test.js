import { beforeEach, describe, expect, it, vi } from 'vitest';

// Changing job redraws the Basic Information window, and the redraw used to
// show the level the character had before: novice to any first job read "Job
// Lv. 10" until something else refreshed it. The server sends the new job's
// level and experience first and the job itself afterwards, and the redraw read
// the level from an entity field the level packet never wrote.
const mocks = vi.hoisted(() => {
	const makeUI = () => ({
		base_exp: 0,
		base_exp_next: 1,
		job_exp: 0,
		job_exp_next: -1,
		update: vi.fn(),
		remove: vi.fn(),
		prepare: vi.fn(),
		append: vi.fn()
	});
	return { hooks: new Map(), makeUI, ui: makeUI(), uiAfterSwitch: null, skillList: { onLevelUp: vi.fn() } };
});

const stub = vi.hoisted(() => () => ({ default: {} }));
vi.mock('Network/NetworkManager.js', () => ({
	default: { hookPacket: (struct, fn) => mocks.hooks.set(struct, fn), sendPacket: vi.fn() }
}));
vi.mock('UI/Components/BasicInfo/BasicInfo.js', () => ({
	default: {
		getUI: () => mocks.uiAfterSwitch || mocks.ui,
		selectUIVersionWithJob: vi.fn(() => {
			mocks.uiAfterSwitch = mocks.switchTo || null;
		})
	}
}));
vi.mock('UI/Components/SkillList/SkillList.js', () => ({ default: { getUI: () => mocks.skillList } }));
vi.mock('UI/Components/WinStats/WinStats.js', () => ({ default: { getUI: () => ({ update: vi.fn() }) } }));
vi.mock('DB/DBManager.js', () => ({ default: { getJobClass: job => (job >= 4252 ? 'Fourth_Class' : 'default') } }));
vi.mock('Renderer/EntityManager.js', () => ({ default: { get: () => mocks.entity, forEach: vi.fn() } }));
vi.mock('Renderer/Entity/Entity.js', () => ({
	default: { TYPE_EFFECT: 1, TYPE_UNIT: 2, TYPE_TRAP: 3, TYPE_PC: 0 }
}));
vi.mock('Renderer/Renderer.js', () => ({ default: { tick: 0 } }));
vi.mock('Renderer/EffectManager.js', stub);
vi.mock('Renderer/Effects/Damage.js', stub);
vi.mock('Renderer/Effects/MagicTarget.js', stub);
vi.mock('Renderer/Effects/LockOnTarget.js', stub);
vi.mock('Renderer/Effects/MagicRing.js', stub);
vi.mock('Renderer/Map/Altitude.js', stub);
vi.mock('Renderer/ScreenEffectManager.js', stub);
vi.mock('Audio/SoundManager.js', stub);
vi.mock('Core/Events.js', stub);
vi.mock('Engine/MapEngine/Guild.js', stub);
vi.mock('UI/Components/ChatBox/ChatBox.js', stub);
vi.mock('UI/Components/ChatRoom/ChatRoom.js', stub);
vi.mock('UI/Components/Announce/Announce.js', stub);
vi.mock('UI/Components/ChangeCart/ChangeCart.js', stub);
vi.mock('UI/Components/Equipment/Equipment.js', stub);
vi.mock('UI/Components/Escape/Escape.js', stub);
vi.mock('UI/Components/HomunInformations/HomunInformations.js', stub);
vi.mock('UI/Components/MercenaryInformations/MercenaryInformations.js', stub);
vi.mock('UI/Components/Inventory/Inventory.js', stub);
vi.mock('UI/Components/ShortCut/ShortCut.js', stub);
vi.mock('UI/Components/StatusIcons/StatusIcons.js', stub);
vi.mock('UI/Components/MiniMap/MiniMap.js', stub);
vi.mock('UI/Components/PartyFriends/PartyFriends.js', stub);
vi.mock('DB/Skills/SkillInfo.js', stub);
vi.mock('DB/Skills/SkillEffect.js', stub);
vi.mock('DB/Skills/SkillAction.js', stub);

const PACKET = (await import('Network/PacketStructure.js')).default;
const PACKETVER = (await import('Network/PacketVerManager.js')).default;
const StatusProperty = (await import('DB/Status/StatusProperty.js')).default;
const Session = (await import('Engine/SessionStorage.js')).default;
const MainEngine = (await import('Engine/MapEngine/Main.js')).default;
const EntityEngine = (await import('Engine/MapEngine/Entity.js')).default;

function sprite(job) {
	return { GID: 1, type: 0, value: job };
}

describe('changing job', () => {
	beforeEach(() => {
		mocks.hooks.clear();
		mocks.ui = mocks.makeUI();
		mocks.uiAfterSwitch = null;
		mocks.switchTo = null;
		PACKETVER.value = 20221005;
		mocks.entity = Session.Entity = {
			objecttype: 0,
			GID: 1,
			clevel: 99,
			joblevel: 10,
			money: 5,
			display: { name: 'Tester' },
			life: { hp: -1, sp: -1, ap: -1, hp_max: -1, sp_max: -1, ap_max: -1, update: vi.fn() }
		};
		MainEngine();
		EntityEngine();
	});

	it('remembers the job level the server sends', () => {
		mocks.hooks.get(PACKET.ZC.PAR_CHANGE)({ varID: StatusProperty.JOBLEVEL, value: 1 });
		expect(Session.Entity.joblevel).toBe(1);
		expect(mocks.ui.update).toHaveBeenCalledWith('jlvl', 1);
	});

	it('shows the new job level and experience after the window is redrawn', () => {
		const change = mocks.hooks.get(PACKET.ZC.SPRITE_CHANGE);
		// What rAthena sends on a job change: level and experience, then the job.
		mocks.hooks.get(PACKET.ZC.PAR_CHANGE)({ varID: StatusProperty.JOBLEVEL, value: 1 });
		mocks.hooks.get(PACKET.ZC.PAR_CHANGE)({ varID: StatusProperty.JOBEXP, value: 0 });
		mocks.hooks.get(PACKET.ZC.PAR_CHANGE)({ varID: StatusProperty.MAXJOBEXP, value: 144 });
		mocks.ui.update.mockClear();

		change(sprite(1)); // Swordman

		expect(mocks.ui.update).toHaveBeenCalledWith('jlvl', 1);
		expect(mocks.ui.update).not.toHaveBeenCalledWith('jlvl', 10);
		expect(mocks.ui.update).toHaveBeenCalledWith('jexp', 0, 144);
		expect(mocks.ui.remove).toHaveBeenCalledTimes(1);
		expect(mocks.ui.prepare).toHaveBeenCalledTimes(1);
		expect(mocks.ui.append).toHaveBeenCalledTimes(1);
	});

	it('carries experience into a different version of the window', () => {
		const change = mocks.hooks.get(PACKET.ZC.SPRITE_CHANGE);
		mocks.hooks.get(PACKET.ZC.PAR_CHANGE)({ varID: StatusProperty.EXP, value: 5000 });
		mocks.hooks.get(PACKET.ZC.PAR_CHANGE)({ varID: StatusProperty.JOBEXP, value: 7 });
		mocks.hooks.get(PACKET.ZC.PAR_CHANGE)({ varID: StatusProperty.MAXJOBEXP, value: 900 });
		mocks.switchTo = mocks.makeUI(); // a fourth class gets the other window

		change(sprite(4252));

		expect(mocks.switchTo.base_exp).toBe(mocks.ui.base_exp);
		expect(mocks.switchTo.job_exp).toBe(7);
		expect(mocks.switchTo.job_exp_next).toBe(900);
		expect(mocks.switchTo.update).toHaveBeenCalledWith('jexp', 7, 900);
		expect(mocks.switchTo.append).toHaveBeenCalled();
		expect(mocks.ui.append).not.toHaveBeenCalled();
	});

	it('leaves a window that has never been told its experience hidden', () => {
		mocks.hooks.get(PACKET.ZC.SPRITE_CHANGE)(sprite(1));
		expect(mocks.ui.update).not.toHaveBeenCalledWith('jexp', expect.anything(), expect.anything());
	});

	it('refills the bars the new window starts without', () => {
		const change = mocks.hooks.get(PACKET.ZC.SPRITE_CHANGE);
		Object.assign(Session.Entity.life, { hp: 900, hp_max: 1000, sp: 80, sp_max: 100, ap: 200, ap_max: 200 });
		Session.Entity.weight = 300;
		Session.Entity.max_weight = 2000;
		mocks.ui.update.mockClear();

		change(sprite(4306)); // Night Watch, whose window shows AP

		expect(mocks.ui.update).toHaveBeenCalledWith('hp', 900, 1000);
		expect(mocks.ui.update).toHaveBeenCalledWith('sp', 80, 100);
		// A full bar is exactly the case the server never sends again.
		expect(mocks.ui.update).toHaveBeenCalledWith('ap', 200, 200);
		expect(mocks.ui.update).toHaveBeenCalledWith('weight', 300, 2000);
		expect(mocks.ui.weight_max).toBe(2000);
	});

	it('shows no bar for a value the server has not sent', () => {
		mocks.hooks.get(PACKET.ZC.SPRITE_CHANGE)(sprite(1));
		for (const bar of ['hp', 'sp', 'ap', 'weight']) {
			expect(mocks.ui.update).not.toHaveBeenCalledWith(bar, expect.anything(), expect.anything());
		}
	});
});
