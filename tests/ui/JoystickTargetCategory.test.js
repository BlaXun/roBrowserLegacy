import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	controls: { joyCycleMode: 0, save: vi.fn() }
}));

vi.mock('Preferences/Controls.js', () => ({ default: mocks.controls }));

const { default: Category } = await import('UI/Components/JoystickUI/JoystickTargetCategory.js');
const { CATEGORY } = Category;

describe('JoystickTargetCategory', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.controls.joyCycleMode = CATEGORY.MOBS;
	});

	it('steps Mobs > NPCs > Players > NPCs & players > Items > Support and wraps both ways', () => {
		const seen = [];
		for (let i = 0; i < 6; i++) {
			Category.step('down');
			seen.push(Category.get());
		}
		expect(seen).toEqual([
			CATEGORY.INTERACT,
			CATEGORY.PLAYERS,
			CATEGORY.PEOPLE,
			CATEGORY.ITEMS,
			CATEGORY.SUPPORT,
			CATEGORY.MOBS
		]);

		Category.step('up');
		expect(Category.get()).toBe(CATEGORY.SUPPORT);
		expect(mocks.controls.save).toHaveBeenCalled();
	});

	it('treats the old mobs-and-items setting as Mobs when stepping', () => {
		mocks.controls.joyCycleMode = CATEGORY.BOTH;
		expect(Category.get()).toBe(CATEGORY.BOTH);
		Category.step('down');
		expect(Category.get()).toBe(CATEGORY.INTERACT);
	});

	it('falls back to Mobs for an unknown value', () => {
		mocks.controls.joyCycleMode = 42;
		expect(Category.get()).toBe(CATEGORY.MOBS);
	});

	it('tells listeners the new and the previous category', () => {
		const listener = vi.fn();
		Category.onChange(listener);
		Category.set(CATEGORY.SUPPORT);
		expect(listener).toHaveBeenCalledWith(CATEGORY.SUPPORT, CATEGORY.MOBS);
		expect(Category.isSupport()).toBe(true);
	});

	it('shows the list with the active category highlighted', () => {
		Category.step('down');
		const list = document.querySelector('.joystick-target-category');
		expect(list).not.toBeNull();
		const rows = Array.from(list.children).map(row => row.textContent);
		expect(rows).toEqual(['Mobs', '▶ NPCs', 'Players', 'NPCs & players', 'Items', 'Support']);
		Category.dispose();
		expect(document.querySelector('.joystick-target-category')).toBeNull();
	});

	it('places the list below the feet of the character', () => {
		Category.step('down', () => [400, 300]);
		const list = document.querySelector('.joystick-target-category');
		expect(parseInt(list.style.top, 10)).toBeGreaterThan(300);
		Category.dispose();
	});
});
