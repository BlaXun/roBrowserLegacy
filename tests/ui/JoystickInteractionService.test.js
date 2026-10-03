import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	target: { getAttackableFocus: vi.fn(() => null), getEntity: vi.fn(), snapCursorToFocus: vi.fn() },
	cursor: { quickCastClick: vi.fn(), moveMouseToEntity: vi.fn() },
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
vi.mock('UI/Components/JoystickUI/JoystickInputService.js', () => ({ default: {} }));
vi.mock('DB/DBManager.js', () => ({ default: {} }));
vi.mock('DB/Skills/SkillInfo.js', () => ({ default: {} }));
vi.mock('UI/Components/JoystickUI/JoystickShortcutMapper.js', () => ({ default: {} }));
vi.mock('UI/Components/JoystickUI/JoystickAimMode.js', () => ({ default: {} }));
vi.mock('UI/UIManager.js', () => ({ default: {} }));
vi.mock('UI/Components/JoystickUI/JoystickMenuNavigation.js', () => ({ default: {} }));
vi.mock('Engine/SessionStorage.js', () => ({ default: {} }));
vi.mock('UI/Components/SkillTargetSelection/SkillTargetSelection.js', () => ({ default: mocks.sts }));

const { default: Interaction } = await import('UI/Components/JoystickUI/JoystickInteractionService.js');

describe('JoystickInteractionService instant cast', () => {
	beforeEach(() => {
		vi.clearAllMocks();
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
