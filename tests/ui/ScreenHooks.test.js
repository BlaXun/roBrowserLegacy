import { afterEach, describe, expect, it, vi } from 'vitest';
import ScreenHooks from '../../src/UI/ScreenHooks.js';

const host = () => ({ style: { display: '' } });
const removers = [];
const register = (screen, hook) => {
	const remove = ScreenHooks.register(screen, hook);
	removers.push(remove);
	return remove;
};

afterEach(() => {
	removers.splice(0).forEach(remove => remove());
	ScreenHooks.SCREENS.forEach(screen => ScreenHooks.hide(screen));
	vi.restoreAllMocks();
});

describe('ScreenHooks', () => {
	it('leaves the window alone when no hook is registered', () => {
		const el = host();
		expect(ScreenHooks.show('login', {}, el)).toBe(false);
		expect(el.style.display).toBe('');
		expect(ScreenHooks.active('login')).toBe(false);
	});

	it('hides the window and hands the hook the context', () => {
		const show = vi.fn();
		const hide = vi.fn();
		const update = vi.fn();
		register('charSelect', { show, hide, update });
		const ctx = { characters: [] };
		const el = host();

		expect(ScreenHooks.show('charSelect', ctx, el)).toBe(true);
		expect(el.style.display).toBe('none');
		expect(show).toHaveBeenCalledWith(ctx);

		ScreenHooks.update('charSelect');
		expect(update).toHaveBeenCalledWith(ctx);

		ScreenHooks.hide('charSelect');
		expect(hide).toHaveBeenCalledTimes(1);
		expect(el.style.display).toBe('');
	});

	it('takes over a screen that is already open, and gives it back when removed', () => {
		const el = host();
		ScreenHooks.show('login', {}, el);
		const hook = { show: vi.fn(), hide: vi.fn() };
		const remove = register('login', hook);
		expect(hook.show).toHaveBeenCalledTimes(1);
		expect(el.style.display).toBe('none');

		remove();
		expect(hook.hide).toHaveBeenCalledTimes(1);
		expect(el.style.display).toBe('');
		expect(ScreenHooks.active('login')).toBe(false);
	});

	it('uses the last hook, and falls back to the one before it', () => {
		const first = { show: vi.fn(), hide: vi.fn() };
		const second = { show: vi.fn(), hide: vi.fn() };
		register('charCreate', first);
		const removeSecond = register('charCreate', second);
		ScreenHooks.show('charCreate', {}, host());
		expect(second.show).toHaveBeenCalledTimes(1);
		expect(first.show).not.toHaveBeenCalled();

		removeSecond();
		expect(second.hide).toHaveBeenCalledTimes(1);
		expect(first.show).toHaveBeenCalledTimes(1);
	});

	it('switches off a hook that throws and shows the client window again', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const el = host();
		register('serverList', {
			show() {},
			update() {
				throw new Error('broken');
			}
		});
		expect(ScreenHooks.show('serverList', {}, el)).toBe(true);
		ScreenHooks.update('serverList');
		expect(el.style.display).toBe('');
		expect(ScreenHooks.active('serverList')).toBe(false);
		expect(console.error).toHaveBeenCalledTimes(1);

		// Gone for good: the next opening is the client's
		const again = host();
		expect(ScreenHooks.show('serverList', {}, again)).toBe(false);
		expect(again.style.display).toBe('');
	});

	it('a hook that throws in show never hides the window', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const el = host();
		register('login', {
			show() {
				throw new Error('broken');
			}
		});
		expect(ScreenHooks.show('login', {}, el)).toBe(false);
		expect(el.style.display).toBe('');
	});

	it('refuses screens it does not know', () => {
		expect(() => ScreenHooks.register('shop', {})).toThrow();
		expect(() => ScreenHooks.register('login', null)).toThrow();
	});
});
