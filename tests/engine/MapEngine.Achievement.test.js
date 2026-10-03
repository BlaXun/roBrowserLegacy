import { beforeEach, describe, expect, it, vi } from 'vitest';

// Which titles the character owns, following rAthena: every completed
// achievement's title when the character enters the map-server
// (achievement_get_titles), and after that only titles whose reward is claimed
// (achievement_get_reward).
const mocks = vi.hoisted(() => ({
	hooks: new Map(),
	equipment: { loadTitles: vi.fn() }
}));

vi.mock('Network/NetworkManager.js', () => ({
	default: { hookPacket: (struct, fn) => mocks.hooks.set(struct, fn), sendPacket: vi.fn() }
}));
vi.mock('DB/DBManager.js', () => ({
	default: {
		getMessage: () => '%s',
		getAchievementTable: () => ({
			1: { title: 'One', reward: { title: 1001 } },
			2: { title: 'Two', reward: { title: 1002 } },
			3: { title: 'Three', reward: { item: 501 } },
			4: { title: 'Four', reward: { title: 1004 } }
		})
	}
}));
vi.mock('UI/UIManager.js', () => ({ default: { components: {} } }));
vi.mock('UI/Components/Announce/Announce.js', () => ({ default: { append: vi.fn(), set: vi.fn() } }));
vi.mock('UI/Components/Achievement/Achievement.js', () => ({ default: {} }));
vi.mock('Renderer/EffectManager.js', () => ({ default: { spam: vi.fn() } }));
vi.mock('DB/Effects/EffectConst.js', () => ({ default: {} }));
vi.mock('UI/Components/Equipment/Equipment.js', () => ({ default: { getUI: () => mocks.equipment } }));

const AchievementEngine = (await import('Engine/MapEngine/Achievement.js')).default;
const PACKET = (await import('Network/PacketStructure.js')).default;
const Session = (await import('Engine/SessionStorage.js')).default;

function ach(ach_id, completed, reward = 0) {
	return { ach_id, completed, reward, objective: [], completed_at: 0 };
}

function deliver(struct, fields) {
	mocks.hooks.get(struct)({ total_points: 0, rank: 0, current_rank_points: 0, next_rank_points: 0, ...fields });
}

describe('Achievement engine: owned titles', () => {
	beforeEach(() => {
		mocks.hooks.clear();
		mocks.equipment.loadTitles.mockClear();
		Session.Achievement = null;
		AchievementEngine();
	});

	it('owns the title of every completed achievement in the list sent on entering the map-server', () => {
		deliver(PACKET.ZC.ALL_ACH_LIST, { ach_list: [ach(1, 1), ach(2, 0), ach(3, 1), ach(4, 1, 1)] });

		expect(Session.Achievement.titles.sort()).toEqual([1001, 1004]);
		expect(mocks.equipment.loadTitles).toHaveBeenCalled();
	});

	it('does not own a title for an achievement completed during play until its reward is claimed', () => {
		deliver(PACKET.ZC.ALL_ACH_LIST, { ach_list: [ach(1, 0), ach(2, 0)] });

		deliver(PACKET.ZC.ACH_UPDATE, { ach_list: [ach(1, 1)] });
		expect(Session.Achievement.titles).toEqual([]);

		// Claiming a title reward makes the server send the whole list again,
		// with the reward marked. The other completion is still unclaimed.
		deliver(PACKET.ZC.ACH_UPDATE, { ach_list: [ach(2, 1)] });
		deliver(PACKET.ZC.ALL_ACH_LIST, { ach_list: [ach(1, 1, 1), ach(2, 1)] });
		expect(Session.Achievement.titles).toEqual([1001]);
	});

	it('owns a title when the update after a claim marks its reward, not on the claim ACK', () => {
		deliver(PACKET.ZC.ALL_ACH_LIST, { ach_list: [ach(4, 0)] });
		deliver(PACKET.ZC.ACH_UPDATE, { ach_list: [ach(4, 1)] });

		// rAthena answers a refused claim with 0
		mocks.hooks.get(PACKET.ZC.REQ_ACH_REWARD_ACK)({ failed: 0, ach_id: 4 });
		expect(Session.Achievement.list[4].reward).toBe(0);
		expect(Session.Achievement.titles).toEqual([]);

		deliver(PACKET.ZC.ALL_ACH_LIST, { ach_list: [ach(4, 1, 1)] });
		expect(Session.Achievement.titles).toEqual([1004]);
	});

	it('takes the list after the empty update as the login list', () => {
		deliver(PACKET.ZC.ALL_ACH_LIST, { ach_list: [ach(1, 0)] });
		deliver(PACKET.ZC.ACH_UPDATE, { ach_list: [ach(1, 1)] });

		// Entering another map-server: the empty update, then the full list
		deliver(PACKET.ZC.ACH_UPDATE, { ach_list: [] });
		deliver(PACKET.ZC.ALL_ACH_LIST, { ach_list: [ach(1, 1)] });
		expect(Session.Achievement.titles).toEqual([1001]);
	});

	it('does not take a claim re-send as the login list when none was sent on login', () => {
		// No achievements yet, so rAthena sends no list after the empty update
		deliver(PACKET.ZC.ACH_UPDATE, { ach_list: [] });

		deliver(PACKET.ZC.ACH_UPDATE, { ach_list: [ach(1, 1)] });
		deliver(PACKET.ZC.ACH_UPDATE, { ach_list: [ach(2, 1)] });
		deliver(PACKET.ZC.ALL_ACH_LIST, { ach_list: [ach(1, 1), ach(2, 1, 1)] });
		expect(Session.Achievement.titles).toEqual([1002]);
	});

	it('takes the first list after connecting to a map-server as the login list', () => {
		deliver(PACKET.ZC.ALL_ACH_LIST, { ach_list: [ach(1, 0)] });
		deliver(PACKET.ZC.ACH_UPDATE, { ach_list: [ach(1, 1)] });

		// What MapEngine.init does when connecting to a map-server
		Session.Achievement.titles = [];
		Session.Achievement.loginListPending = true;

		deliver(PACKET.ZC.ALL_ACH_LIST, { ach_list: [ach(1, 1)] });
		expect(Session.Achievement.titles).toEqual([1001]);
	});
});
