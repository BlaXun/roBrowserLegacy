/**
 * tests/ui/MenuHooks.test.js
 *
 * Buttons a client plugin puts in the option menu (the Escape window).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import MenuHooks from '../../src/UI/MenuHooks.js';

const removers = [];
const add = button => {
	const remove = MenuHooks.add(button);
	removers.push(remove);
	return remove;
};
const onChange = listener => {
	const remove = MenuHooks.onChange(listener);
	removers.push(remove);
	return remove;
};

const pictures = { background: 'esc_uiscale_a.bmp', hover: 'esc_uiscale_b.bmp', down: 'esc_uiscale_c.bmp' };

afterEach(() => {
	removers.splice(0).forEach(remove => remove());
	vi.restoreAllMocks();
});

describe('MenuHooks', () => {
	it('starts with no buttons', () => {
		expect(MenuHooks.list()).toEqual([]);
	});

	it('keeps the buttons in the order they were added', () => {
		const first = vi.fn();
		const second = vi.fn();
		add({ ...pictures, title: 'UI Scale', onClick: first });
		add({ background: 'other_a.bmp', onClick: second });

		const buttons = MenuHooks.list();
		expect(buttons.map(button => button.background)).toEqual(['esc_uiscale_a.bmp', 'other_a.bmp']);
		expect(buttons[0]).toMatchObject({ ...pictures, title: 'UI Scale' });
		expect(Object.isFrozen(buttons[0])).toBe(true);
	});

	it('takes a button out, once', () => {
		const listener = vi.fn();
		const remove = add({ ...pictures, onClick() {} });
		onChange(listener);
		remove();
		remove();
		expect(MenuHooks.list()).toEqual([]);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('tells the menu when buttons come and go', () => {
		const listener = vi.fn();
		onChange(listener);
		const remove = add({ ...pictures, onClick() {} });
		remove();
		expect(listener).toHaveBeenCalledTimes(2);
	});

	it('calls the handler when the button is pressed, and survives one that throws', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const onClick = vi.fn();
		add({ ...pictures, onClick });
		add({
			...pictures,
			onClick() {
				throw new Error('boom');
			}
		});
		const [good, bad] = MenuHooks.list();
		MenuHooks.press(good);
		expect(onClick).toHaveBeenCalledTimes(1);
		expect(() => MenuHooks.press(bad)).not.toThrow();
		expect(console.error).toHaveBeenCalled();
	});

	it('keeps going past a listener that throws', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const after = vi.fn();
		onChange(() => {
			throw new Error('boom');
		});
		onChange(after);
		add({ ...pictures, onClick() {} });
		expect(after).toHaveBeenCalled();
	});

	it('only takes pictures from the interface folder', () => {
		const onClick = () => {};
		expect(() => MenuHooks.add({ onClick })).toThrow(TypeError);
		expect(() => MenuHooks.add({ background: '../../secret.bmp', onClick })).toThrow(TypeError);
		expect(() => MenuHooks.add({ background: '/abs/a.bmp', onClick })).toThrow(TypeError);
		expect(() => MenuHooks.add({ background: 'https://example.com/a.bmp', onClick })).toThrow(TypeError);
		expect(() => MenuHooks.add({ background: 'a.bmp', hover: 'b.exe', onClick })).toThrow(TypeError);
		expect(() => MenuHooks.add({ background: 'a.bmp', onClick: 'nope' })).toThrow(TypeError);
		expect(MenuHooks.list()).toEqual([]);

		add({ background: 'basic_interface/esc_uiscale_a.bmp', onClick });
		expect(MenuHooks.list()).toHaveLength(1);
	});
});
