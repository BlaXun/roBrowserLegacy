import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const list = [];
	const shortcut = {
		getList: () => list,
		removeAt: vi.fn(index => {
			list[index] = { isSkill: 0, ID: 0, count: 0 };
		}),
		addElement: vi.fn((index, isSkill, ID, count) => {
			list[index] = { isSkill, ID, count };
		}),
		onChange: vi.fn(),
		fromDragData: vi.fn()
	};
	return { list, shortcut };
});

vi.mock('UI/Components/ShortCut/ShortCut.js', () => ({ default: mocks.shortcut }));
vi.mock('UI/Components/JoystickUI/JoystickUIRenderer.js', () => ({ default: {} }));

const { default: SlotDrop } = await import('UI/Components/JoystickUI/JoystickSlotDrop.js');
const { default: SetManager } = await import('UI/Components/JoystickUI/JoystickSetManager.js');

const FIREBOLT = 19;
const RED_POTION = 501;

describe('JoystickSlotDrop.assign', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.list.length = 0;
		for (let i = 0; i < 36; i++) {
			mocks.list.push({ isSkill: 0, ID: 0, count: 0 });
		}
		SetManager.set(1);
	});

	it('puts the entry in the slot and tells the server', () => {
		SlotDrop.assign(13, { isSkill: true, ID: FIREBOLT, count: 10 });
		expect(mocks.shortcut.addElement).toHaveBeenCalledWith(13, true, FIREBOLT, 10);
		expect(mocks.shortcut.onChange).toHaveBeenCalledWith(13, true, FIREBOLT, 10);
		expect(mocks.shortcut.removeAt).not.toHaveBeenCalled();
	});

	it('moves a skill of the same level from anywhere in the shown set', () => {
		// L1 + Y and L1 + R1 + A (slot 9 of bar 4), both in set 1
		mocks.list[0] = { isSkill: 1, ID: FIREBOLT, count: 10 };
		mocks.list[35] = { isSkill: 1, ID: FIREBOLT, count: 10 };

		SlotDrop.assign(13, { isSkill: true, ID: FIREBOLT, count: 10 });

		expect(mocks.shortcut.removeAt.mock.calls.map(c => c[0]).sort()).toEqual([0, 35]);
		expect(mocks.list[13]).toMatchObject({ ID: FIREBOLT, count: 10 });
	});

	it('keeps the same skill at another level', () => {
		mocks.list[0] = { isSkill: 1, ID: FIREBOLT, count: 3 };

		SlotDrop.assign(13, { isSkill: true, ID: FIREBOLT, count: 10 });

		expect(mocks.shortcut.removeAt).not.toHaveBeenCalled();
		expect(mocks.list[0]).toMatchObject({ ID: FIREBOLT, count: 3 });
	});

	it('moves an item whatever its stored count', () => {
		mocks.list[4] = { isSkill: false, ID: RED_POTION, count: 0 };

		SlotDrop.assign(5, { isSkill: false, ID: RED_POTION, count: 7 });

		expect(mocks.shortcut.removeAt).toHaveBeenCalledWith(4);
	});

	it('does not treat a skill and an item with the same ID as the same thing', () => {
		mocks.list[4] = { isSkill: 1, ID: RED_POTION, count: 1 };

		SlotDrop.assign(5, { isSkill: false, ID: RED_POTION, count: 0 });

		expect(mocks.shortcut.removeAt).not.toHaveBeenCalled();
	});

	it('leaves slots of the other set alone', () => {
		// 18 is L1 + Y in set 2
		mocks.list[18] = { isSkill: 1, ID: FIREBOLT, count: 10 };

		SlotDrop.assign(0, { isSkill: true, ID: FIREBOLT, count: 10 });
		expect(mocks.shortcut.removeAt).not.toHaveBeenCalled();

		SetManager.set(2);
		SlotDrop.assign(19, { isSkill: true, ID: FIREBOLT, count: 10 });
		expect(mocks.shortcut.removeAt).toHaveBeenCalledWith(18);
		expect(mocks.shortcut.removeAt).not.toHaveBeenCalledWith(0);
	});
});
