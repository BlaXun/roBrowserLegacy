import { beforeEach, describe, expect, it, vi } from 'vitest';

// The pictures of a Basic Information bar load asynchronously. An older update
// whose pictures arrive after a newer one's used to paint over it: HP at 100%
// showed a bar about 30% full and red, when a heal followed a level change
// closely enough for the red pictures to be the last to land.
const mocks = vi.hoisted(() => ({ pending: [], root: null }));

class MockGUIComponent {
	getRoot() {
		return mocks.root;
	}
}
vi.mock('UI/GUIComponent.js', () => ({ default: MockGUIComponent }));
vi.mock('UI/UIManager.js', () => ({ default: { addComponent: component => component } }));
vi.mock('Core/Client.js', () => ({
	default: {
		// Answers when the test says so, and in any order.
		loadFile: (filename, onload) => mocks.pending.push({ filename, answer: () => onload(filename) })
	}
}));
vi.mock('Core/Preferences.js', () => ({ default: { get: () => ({ save: vi.fn() }) } }));
vi.mock('Core/Configs.js', () => ({ default: { get: () => false } }));
vi.mock('DB/DBManager.js', () => ({ default: { INTERFACE_PATH: '' } }));
vi.mock('Network/PacketVerManager.js', () => ({ default: { value: 20221005 } }));
const stub = vi.hoisted(() => () => ({ default: {} }));
vi.mock('DB/Monsters/MonsterTable.js', stub);
vi.mock('Renderer/Renderer.js', stub);
vi.mock('Engine/SessionStorage.js', stub);
vi.mock('UI/Components/Inventory/Inventory.js', stub);
vi.mock('UI/Components/Equipment/Equipment.js', stub);
vi.mock('UI/Components/PartyFriends/PartyFriends.js', stub);
vi.mock('UI/Components/Guild/Guild.js', stub);
vi.mock('UI/Components/Bank/Bank.js', stub);
vi.mock('UI/Components/Escape/Escape.js', stub);
vi.mock('UI/Components/WorldMap/WorldMap.js', stub);
vi.mock('UI/Components/CheckAttendance/CheckAttendance.js', stub);
vi.mock('UI/Components/ChatRoomCreate/ChatRoomCreate.js', stub);
vi.mock('UI/Components/Rodex/Rodex.js', stub);
vi.mock('UI/Components/WinStats/WinStats.js', stub);
vi.mock('UI/Components/Navigation/Navigation.js', stub);
vi.mock('UI/Components/SkillList/SkillList.js', stub);
vi.mock('UI/Components/Quest/Quest.js', stub);
vi.mock('UI/Components/Achievement/Achievement.js', stub);
vi.mock('UI/Components/Reputation/Reputation.js', stub);

const { createBasicInfo } = await import('UI/Components/BasicInfo/BasicInfoCommon.js');

function window_() {
	return createBasicInfo({ name: 'RaceTest', htmlText: '', cssText: '', prefKey: 'RaceTest', innerId: '#x' });
}

function bar() {
	const root = document.createElement('div');
	root.innerHTML = `
		<div class="hp_bar"><div class="hp_bar_left"></div><div class="hp_bar_middle"></div><div class="hp_bar_right"></div></div>
		<span class="hp_perc"></span><span class="hp_value"></span><span class="hp_max_value"></span>`;
	return root;
}

const landed = root => ({
	left: root.querySelector('.hp_bar_left').style.backgroundImage,
	width: root.querySelector('.hp_bar_middle').style.width
});

describe('a bar whose pictures arrive out of order', () => {
	beforeEach(() => {
		mocks.pending.length = 0;
		mocks.root = bar();
	});

	it('shows the newest update, not whichever finished loading last', () => {
		const info = window_();
		info.update('hp', 200, 1000); // red: under a quarter
		info.update('hp', 1000, 1000); // blue, full
		const [older, newer] = [mocks.pending.slice(0, 3), mocks.pending.slice(3)];
		expect(older[0].filename).toContain('gzered');
		expect(newer[0].filename).toContain('gzeblue');

		for (const request of newer) request.answer();
		for (const request of older) request.answer(); // the red pictures land last

		const { left, width } = landed(mocks.root);
		expect(left).toContain('gzeblue');
		expect(width).toBe(`${Math.floor(100 * 1.27)}px`);
		expect(mocks.root.querySelector('.hp_perc').textContent).toBe('100%');
	});

	it('still draws an update that nothing overtook', () => {
		const info = window_();
		info.update('hp', 200, 1000);
		for (const request of mocks.pending) request.answer();
		expect(landed(mocks.root).left).toContain('gzered');
		expect(landed(mocks.root).width).toBe(`${Math.floor(20 * 1.27)}px`);
	});

	it('keeps the bars apart: a newer SP update does not cancel an HP one', () => {
		mocks.root.innerHTML += '<div class="sp_bar"><div class="sp_bar_left"></div><div class="sp_bar_middle"></div><div class="sp_bar_right"></div></div>';
		const info = window_();
		info.update('hp', 200, 1000);
		info.update('sp', 50, 100);
		for (const request of mocks.pending) request.answer();
		expect(landed(mocks.root).left).toContain('gzered');
		expect(mocks.root.querySelector('.sp_bar_left').style.backgroundImage).toContain('gze');
	});
});
