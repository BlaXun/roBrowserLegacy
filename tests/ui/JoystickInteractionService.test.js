import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	target: {
		getAttackableFocus: vi.fn(() => null),
		getEntity: vi.fn(),
		snapCursorToFocus: vi.fn(),
		getInteractTarget: vi.fn(() => null)
	},
	cursor: {
		quickCastClick: vi.fn(),
		moveMouseToEntity: vi.fn(),
		leftClick: vi.fn(),
		elementAtCursor: vi.fn(() => null)
	},
	aim: {
		QUICK_CAST: { OFF: 0, RELEASE: 1, INSTANT: 2 },
		isActive: vi.fn(() => false),
		quickCastMode: () => mocks.controls.joyQuick
	},
	input: { buttonStates: [] },
	mapper: { getGroup: vi.fn(() => '') },
	controls: { joyQuick: 2, attackTargetMode: 0 },
	shortcut: { getList: vi.fn(() => [{ isSkill: true, ID: 1 }]), onShortCut: vi.fn() },
	sts: {
		TYPE: { ENEMY: 1, PLACE: 2, FRIEND: 4 },
		getFlag: vi.fn(() => 1),
		intersectEntityId: vi.fn(),
		remove: vi.fn()
	}
}));

vi.mock('UI/Components/ShortCut/ShortCut.js', () => ({ default: mocks.shortcut }));
vi.mock('UI/Components/Inventory/Inventory.js', () => ({ default: {} }));
vi.mock('DB/Items/ItemType.js', () => ({ default: {} }));
vi.mock('UI/Components/JoystickUI/JoystickCharacterControl.js', () => ({ default: {} }));
vi.mock('UI/Components/JoystickUI/JoystickTargetService.js', () => ({ default: mocks.target }));
vi.mock('UI/Components/JoystickUI/JoystickMouseCursorAdapter.js', () => ({ default: mocks.cursor }));
vi.mock('Preferences/Controls.js', () => ({ default: mocks.controls }));
vi.mock('UI/Components/JoystickUI/JoystickSelectionUI.js', () => ({ default: {} }));
vi.mock('UI/Components/JoystickUI/JoystickInputService.js', () => ({ default: mocks.input }));
vi.mock('DB/DBManager.js', () => ({ default: {} }));
vi.mock('DB/Skills/SkillInfo.js', () => ({ default: {} }));
vi.mock('UI/Components/JoystickUI/JoystickShortcutMapper.js', () => ({ default: mocks.mapper }));
vi.mock('UI/Components/JoystickUI/JoystickAimMode.js', () => ({ default: mocks.aim }));
vi.mock('UI/UIManager.js', () => ({ default: {} }));
vi.mock('UI/Components/JoystickUI/JoystickMenuNavigation.js', () => ({ default: {} }));
vi.mock('Engine/SessionStorage.js', () => ({ default: {} }));
vi.mock('UI/Components/SkillTargetSelection/SkillTargetSelection.js', () => ({ default: mocks.sts }));

const { default: Interaction } = await import('UI/Components/JoystickUI/JoystickInteractionService.js');

describe('JoystickInteractionService instant cast', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.controls.joyQuick = 2;
		mocks.sts.getFlag.mockReturnValue(mocks.sts.TYPE.ENEMY);
		mocks.target.getAttackableFocus.mockReturnValue(null);
	});

	it('casts an enemy skill on an attackable focus', () => {
		mocks.target.getAttackableFocus.mockReturnValue({ GID: 100 });
		Interaction.executeShortcut(0, 0);

		expect(mocks.sts.intersectEntityId).toHaveBeenCalledWith(100);
		expect(mocks.sts.remove).toHaveBeenCalled();
		expect(mocks.cursor.quickCastClick).not.toHaveBeenCalled();
	});

	it('falls through to the quick-cast click when the focus is refused (NPC, friend, stale)', () => {
		Interaction.executeShortcut(0, 0);

		// The pending skill must not be cancelled on a target it refuses
		expect(mocks.sts.intersectEntityId).not.toHaveBeenCalled();
		expect(mocks.sts.remove).not.toHaveBeenCalled();
		expect(mocks.cursor.quickCastClick).toHaveBeenCalledTimes(1);
	});
});

describe('JoystickInteractionService skills in aim mode', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.controls.joyQuick = 0;
		mocks.aim.isActive.mockReturnValue(true);
		mocks.sts.getFlag.mockReturnValue(mocks.sts.TYPE.ENEMY);
		mocks.target.getAttackableFocus.mockReturnValue({ GID: 100 });
		mocks.cursor.elementAtCursor.mockReturnValue(null);
	});

	it('A casts a waiting enemy skill on the aimed target, not at the cursor', () => {
		Interaction.leftClick(false);
		expect(mocks.sts.intersectEntityId).toHaveBeenCalledWith(100);
		expect(mocks.cursor.leftClick).not.toHaveBeenCalled();
	});

	it('A puts the cursor on the target before a ground skill click', () => {
		mocks.sts.getFlag.mockReturnValue(mocks.sts.TYPE.PLACE);
		Interaction.leftClick(false);
		expect(mocks.sts.intersectEntityId).not.toHaveBeenCalled();
		expect(mocks.target.snapCursorToFocus).toHaveBeenCalled();
		expect(mocks.cursor.leftClick).toHaveBeenCalled();
	});

	it('A is a plain click in cursor mode, with no skill waiting, or over a window', () => {
		mocks.aim.isActive.mockReturnValue(false);
		Interaction.leftClick(false);

		mocks.aim.isActive.mockReturnValue(true);
		mocks.sts.getFlag.mockReturnValue(0);
		Interaction.leftClick(false);

		mocks.sts.getFlag.mockReturnValue(mocks.sts.TYPE.ENEMY);
		mocks.cursor.elementAtCursor.mockReturnValue({ tagName: 'DIV' });
		Interaction.leftClick(false);

		expect(mocks.sts.intersectEntityId).not.toHaveBeenCalled();
		expect(mocks.cursor.leftClick).toHaveBeenCalledTimes(3);
	});

	it('Release mode casts on the aimed target when the shortcut buttons are let go', () => {
		vi.useFakeTimers();
		try {
			mocks.controls.joyQuick = 1;
			mocks.mapper.getGroup.mockReturnValue('L1');
			Interaction.executeShortcut(0, 'L1');
			vi.advanceTimersByTime(60);
			expect(mocks.sts.intersectEntityId).not.toHaveBeenCalled(); // still held

			mocks.mapper.getGroup.mockReturnValue('');
			vi.advanceTimersByTime(60);
			expect(mocks.sts.intersectEntityId).toHaveBeenCalledWith(100);
			expect(mocks.cursor.quickCastClick).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});
