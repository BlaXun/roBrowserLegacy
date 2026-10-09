import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	target: {
		getAttackableFocus: vi.fn(() => null),
		getEntity: vi.fn(),
		snapCursorToFocus: vi.fn(),
		getInteractTarget: vi.fn(() => null),
		getMarkedPlayer: vi.fn(() => null),
		isAttackable: vi.fn(() => true),
		cycle: vi.fn(),
		clearTarget: vi.fn()
	},
	cursor: {
		quickCastClick: vi.fn(),
		moveMouseToEntity: vi.fn(),
		leftClick: vi.fn(),
		elementAtCursor: vi.fn(() => null),
		navigateDraggableItems: vi.fn(),
		recenter: vi.fn(),
		rightClick: vi.fn()
	},
	aim: {
		QUICK_CAST: { OFF: 0, RELEASE: 1, INSTANT: 2 },
		isActive: vi.fn(() => false),
		quickCastMode: () => mocks.controls.joyQuick,
		toggle: vi.fn()
	},
	input: { buttonStates: [] },
	mapper: { getGroup: vi.fn(() => '') },
	controls: { joyQuick: 2, attackTargetMode: 0 },
	shortcut: { getList: vi.fn(() => [{ isSkill: true, ID: 1 }]), onShortCut: vi.fn() },
	category: { isSupport: vi.fn(() => false), step: vi.fn() },
	support: {
		isPending: vi.fn(() => false),
		pendingIndex: vi.fn(() => -1),
		cancelPending: vi.fn(),
		castPendingOnSelf: vi.fn(),
		isSupportSkill: vi.fn(flag => (flag & (2 | 16)) !== 0),
		getFocusForSkill: vi.fn(() => null),
		confirmPending: vi.fn(() => false),
		dismiss: vi.fn(() => false),
		castOn: vi.fn(() => true),
		openPending: vi.fn(),
		cycle: vi.fn(),
		clearFocus: vi.fn()
	},
	session: {},
	menuNav: { navigate: vi.fn(() => false), close: vi.fn(() => false) },
	uiManager: { getComponent: vi.fn(() => null) },
	sts: {
		TYPE: { ENEMY: 1, PLACE: 2, FRIEND: 16 },
		getFlag: vi.fn(() => 1),
		getSkill: vi.fn(() => ({ SKID: 28 })),
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
vi.mock('DB/Skills/SkillInfo.js', () => ({ default: { 1: { SkillName: 'Heal' } } }));
vi.mock('UI/Components/JoystickUI/JoystickShortcutMapper.js', () => ({ default: mocks.mapper }));
vi.mock('UI/Components/JoystickUI/JoystickAimMode.js', () => ({ default: mocks.aim }));
vi.mock('UI/UIManager.js', () => ({ default: mocks.uiManager }));
vi.mock('UI/Components/JoystickUI/JoystickMenuNavigation.js', () => ({ default: mocks.menuNav }));
vi.mock('Engine/SessionStorage.js', () => ({ default: mocks.session }));
vi.mock('UI/Components/JoystickUI/JoystickTargetCategory.js', () => ({ default: mocks.category }));
vi.mock('UI/Components/JoystickUI/JoystickSupportMode.js', () => ({ default: mocks.support }));
vi.mock('UI/Components/JoystickUI/JoystickEmoteGrid.js', () => ({ default: {} }));
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

describe('JoystickInteractionService support category', () => {
	const member = { GID: 200 };

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.controls.joyQuick = 2;
		mocks.category.isSupport.mockReturnValue(true);
		mocks.support.isPending.mockReturnValue(false);
		mocks.support.getFocusForSkill.mockReturnValue(null);
		mocks.sts.getFlag.mockReturnValue(mocks.sts.TYPE.FRIEND);
		mocks.aim.isActive.mockReturnValue(true);
		mocks.cursor.elementAtCursor.mockReturnValue(null);
	});

	it('a support skill goes to the focused member', () => {
		mocks.support.getFocusForSkill.mockReturnValue(member);
		Interaction.executeShortcut(0, 'L1');
		expect(mocks.support.castOn).toHaveBeenCalledWith(member);
		expect(mocks.cursor.quickCastClick).not.toHaveBeenCalled();
	});

	it('with nobody focused the radial opens with the skill pending', () => {
		Interaction.executeShortcut(0, 'L1');
		expect(mocks.support.openPending).toHaveBeenCalledWith(0, 'Heal');
		expect(mocks.support.castOn).not.toHaveBeenCalled();
		expect(mocks.cursor.quickCastClick).not.toHaveBeenCalled();
	});

	it('a ground skill counts as support too', () => {
		mocks.sts.getFlag.mockReturnValue(mocks.sts.TYPE.PLACE);
		mocks.support.getFocusForSkill.mockReturnValue(member);
		Interaction.executeShortcut(0, 'L1');
		expect(mocks.support.castOn).toHaveBeenCalledWith(member);
	});

	it('an enemy-only skill is left to the mob target', () => {
		mocks.sts.getFlag.mockReturnValue(mocks.sts.TYPE.ENEMY);
		mocks.target.getAttackableFocus.mockReturnValue({ GID: 100 });
		Interaction.executeShortcut(0, 'L1');
		expect(mocks.support.openPending).not.toHaveBeenCalled();
		expect(mocks.sts.intersectEntityId).toHaveBeenCalledWith(100);
	});

	it('an enemy-only skill with no mob picked goes to the nearest mob', () => {
		mocks.sts.getFlag.mockReturnValue(mocks.sts.TYPE.ENEMY);
		mocks.target.getAttackableFocus.mockReturnValue(null);
		mocks.target.getEntity.mockReturnValue({ GID: 300 });
		Interaction.executeShortcut(0, 'L1');
		expect(mocks.sts.intersectEntityId).toHaveBeenCalledWith(300);
		expect(mocks.cursor.quickCastClick).not.toHaveBeenCalled();
	});

	it('outside Support nothing changes', () => {
		mocks.category.isSupport.mockReturnValue(false);
		Interaction.executeShortcut(0, 'L1');
		expect(mocks.support.openPending).not.toHaveBeenCalled();
		expect(mocks.cursor.quickCastClick).toHaveBeenCalled();
	});

	it('the same shortcut again casts the pending skill on yourself', () => {
		mocks.support.isPending.mockReturnValue(true);
		mocks.support.pendingIndex.mockReturnValue(0);
		Interaction.executeShortcut(0, 'L1');
		expect(mocks.support.castPendingOnSelf).toHaveBeenCalled();
		expect(mocks.shortcut.onShortCut).not.toHaveBeenCalled();
	});

	it('another shortcut replaces the pending skill', () => {
		mocks.support.isPending.mockReturnValue(true);
		mocks.support.pendingIndex.mockReturnValue(5);
		Interaction.executeShortcut(0, 'L1');
		expect(mocks.support.cancelPending).toHaveBeenCalledWith(false);
		expect(mocks.shortcut.onShortCut).toHaveBeenCalled();
	});

	it('A confirms the member chosen in the radial, a held A does not', () => {
		mocks.support.confirmPending.mockReturnValue(true);
		Interaction.leftClick(true);
		expect(mocks.support.confirmPending).not.toHaveBeenCalled();
		Interaction.leftClick(false);
		expect(mocks.support.confirmPending).toHaveBeenCalledTimes(1);
		mocks.support.confirmPending.mockReturnValue(false);
	});

	it('B closes an open radial instead of right-clicking', () => {
		mocks.support.dismiss.mockReturnValueOnce(true);
		Interaction.rightClick(false);
		expect(mocks.support.dismiss).toHaveBeenCalled();
		expect(mocks.cursor.rightClick).not.toHaveBeenCalled();
	});

	it('B cancels a pending skill instead of right-clicking', () => {
		mocks.support.isPending.mockReturnValue(true);
		Interaction.rightClick(false);
		expect(mocks.support.cancelPending).toHaveBeenCalledWith(true);
		expect(mocks.cursor.rightClick).not.toHaveBeenCalled();
	});

	it('D-pad left / right step through the party', () => {
		Interaction.cycleTarget('next');
		expect(mocks.support.cycle).toHaveBeenCalledWith('next');
		expect(mocks.target.cycle).not.toHaveBeenCalled();
	});

	it('a quick tap of the face button casts on the focused member', () => {
		vi.useFakeTimers();
		try {
			mocks.support.getFocusForSkill.mockReturnValue(member);
			mocks.input.buttonStates = ['unpressed', 'unpressed', 'pressed', 'unpressed'];
			Interaction.executeShortcut(0, 'L1');
			expect(mocks.support.castOn).not.toHaveBeenCalled(); // decided on release

			mocks.input.buttonStates = ['unpressed', 'unpressed', 'unpressed', 'unpressed'];
			vi.advanceTimersByTime(40);
			expect(mocks.support.castOn).toHaveBeenCalledWith(member);
		} finally {
			mocks.input.buttonStates = [];
			vi.useRealTimers();
		}
	});

	it('holding the face button casts on yourself and keeps the focus', () => {
		vi.useFakeTimers();
		try {
			const self = { GID: 1 };
			mocks.session.Entity = self;
			mocks.support.getFocusForSkill.mockReturnValue(member);
			mocks.input.buttonStates = ['unpressed', 'unpressed', 'pressed', 'unpressed'];
			Interaction.executeShortcut(0, 'L1');

			mocks.input.buttonStates = ['unpressed', 'unpressed', 'holding', 'unpressed'];
			vi.advanceTimersByTime(200);
			expect(mocks.support.castOn).not.toHaveBeenCalled();
			vi.advanceTimersByTime(150);
			expect(mocks.support.castOn).toHaveBeenCalledTimes(1);
			expect(mocks.support.castOn).toHaveBeenCalledWith(self);
			expect(mocks.support.clearFocus).not.toHaveBeenCalled();
		} finally {
			mocks.input.buttonStates = [];
			vi.useRealTimers();
		}
	});

	it('the hold watch stops when the skill is cancelled meanwhile', () => {
		vi.useFakeTimers();
		try {
			mocks.input.buttonStates = ['pressed', 'unpressed', 'unpressed', 'unpressed'];
			Interaction.executeShortcut(0, 'L1');
			mocks.sts.getFlag.mockReturnValue(0);
			vi.advanceTimersByTime(400);
			expect(mocks.support.castOn).not.toHaveBeenCalled();
			expect(mocks.support.openPending).not.toHaveBeenCalled();
		} finally {
			mocks.input.buttonStates = [];
			vi.useRealTimers();
		}
	});

	it('the hold watch stops when another skill is waiting by then', () => {
		vi.useFakeTimers();
		try {
			mocks.input.buttonStates = ['pressed', 'unpressed', 'unpressed', 'unpressed'];
			Interaction.executeShortcut(0, 'L1');
			// Another shortcut, within the hold window, put a different skill in waiting
			mocks.sts.getSkill.mockReturnValue({ SKID: 34 });
			vi.advanceTimersByTime(400);
			expect(mocks.support.castOn).not.toHaveBeenCalled();
			expect(mocks.support.openPending).not.toHaveBeenCalled();
		} finally {
			mocks.input.buttonStates = [];
			mocks.sts.getSkill.mockReturnValue({ SKID: 28 });
			vi.useRealTimers();
		}
	});

	it('L3 tap clears every kind of target', () => {
		Interaction.clearTarget();
		expect(mocks.target.clearTarget).toHaveBeenCalled();
		expect(mocks.support.clearFocus).toHaveBeenCalled();
		expect(mocks.support.cancelPending).toHaveBeenCalledWith(true);
	});
});

describe('JoystickInteractionService D-pad up / down', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.session.Entity = {};
		mocks.cursor.elementAtCursor.mockReturnValue(null);
		mocks.uiManager.getComponent.mockReturnValue(null);
		mocks.menuNav.navigate.mockReturnValue(false);
	});

	it('switch the target category over the map', () => {
		Interaction.navigateDpad('down');
		expect(mocks.category.step).toHaveBeenCalledWith('down', expect.any(Function));
		expect(mocks.cursor.navigateDraggableItems).not.toHaveBeenCalled();
	});

	it('stay with an item grid under the cursor', () => {
		mocks.cursor.elementAtCursor.mockReturnValue({ tagName: 'DIV', closest: () => ({}) });
		Interaction.navigateDpad('up');
		expect(mocks.category.step).not.toHaveBeenCalled();
		expect(mocks.cursor.navigateDraggableItems).toHaveBeenCalledWith('up');
	});

	it('stay with an open NPC menu', () => {
		mocks.uiManager.getComponent.mockReturnValue({ _host: { parentNode: {}, style: { display: 'block' } } });
		Interaction.navigateDpad('down');
		expect(mocks.category.step).not.toHaveBeenCalled();
		expect(mocks.cursor.navigateDraggableItems).toHaveBeenCalledWith('down');
	});

	it('stay with an open button menu', () => {
		mocks.menuNav.navigate.mockReturnValue(true);
		Interaction.navigateDpad('down');
		expect(mocks.category.step).not.toHaveBeenCalled();
	});

	it('back in cursor mode the cursor returns to the character, not off a window', () => {
		mocks.aim.isActive.mockReturnValue(false);
		Interaction.toggleStickMode();
		expect(mocks.cursor.recenter).toHaveBeenCalledTimes(1);

		mocks.cursor.elementAtCursor.mockReturnValue({ tagName: 'DIV' });
		Interaction.toggleStickMode();
		expect(mocks.cursor.recenter).toHaveBeenCalledTimes(1);
	});
});

describe('JoystickInteractionService marked player', () => {
	function player(room) {
		return { GID: 500, room: room || null, onContextMenu: vi.fn() };
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.controls.joyQuick = 2;
		mocks.aim.isActive.mockReturnValue(false);
		mocks.cursor.elementAtCursor.mockReturnValue(null);
		mocks.target.getAttackableFocus.mockReturnValue(null);
		mocks.target.getInteractTarget.mockReturnValue(null);
		mocks.sts.getFlag.mockReturnValue(0);
		mocks.category.isSupport.mockReturnValue(false);
		mocks.support.isPending.mockReturnValue(false);
	});

	it('A opens the menu of the marked player, at them', () => {
		const p = player();
		mocks.target.getMarkedPlayer.mockReturnValue(p);
		Interaction.leftClick(false);
		expect(mocks.cursor.moveMouseToEntity).toHaveBeenCalledWith(p);
		expect(p.onContextMenu).toHaveBeenCalled();
		expect(mocks.cursor.leftClick).not.toHaveBeenCalled();
	});

	it('A enters the shop or chat room the marked player has open', () => {
		const onEnter = vi.fn();
		const p = player({ display: true, node: { onEnter } });
		mocks.target.getMarkedPlayer.mockReturnValue(p);
		Interaction.leftClick(false);
		expect(onEnter).toHaveBeenCalled();
		expect(p.onContextMenu).not.toHaveBeenCalled();
	});

	it('A over a window is a click on the window', () => {
		mocks.target.getMarkedPlayer.mockReturnValue(player());
		mocks.cursor.elementAtCursor.mockReturnValue({ tagName: 'DIV' });
		Interaction.leftClick(false);
		expect(mocks.cursor.leftClick).toHaveBeenCalled();
	});

	it('casts a friendly skill on the marked player', () => {
		const p = player();
		mocks.target.getMarkedPlayer.mockReturnValue(p);
		mocks.sts.getFlag.mockReturnValue(mocks.sts.TYPE.FRIEND);
		Interaction.executeShortcut(0, 0);
		expect(mocks.support.castOn).toHaveBeenCalledWith(p);
		expect(mocks.cursor.quickCastClick).not.toHaveBeenCalled();
	});

	it('leaves an enemy skill to the focus', () => {
		mocks.target.getMarkedPlayer.mockReturnValue(player());
		mocks.target.getAttackableFocus.mockReturnValue({ GID: 100 });
		mocks.sts.getFlag.mockReturnValue(mocks.sts.TYPE.ENEMY);
		Interaction.executeShortcut(0, 0);
		expect(mocks.support.castOn).not.toHaveBeenCalled();
		expect(mocks.sts.intersectEntityId).toHaveBeenCalledWith(100);
	});

	it('B closes an open player menu first', () => {
		mocks.menuNav.close.mockReturnValueOnce(true);
		Interaction.rightClick(false);
		expect(mocks.cursor.rightClick).not.toHaveBeenCalled();
	});
});
