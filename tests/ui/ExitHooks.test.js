import { afterEach, describe, expect, it, vi } from 'vitest';
import ExitHooks from '../../src/UI/ExitHooks.js';

const removers = [];
const on = listener => {
	const remove = ExitHooks.on(listener);
	removers.push(remove);
	return remove;
};

afterEach(() => {
	removers.splice(0).forEach(remove => remove());
	vi.restoreAllMocks();
});

describe('ExitHooks', () => {
	it('tells every listener where the player is going and from where', () => {
		const first = vi.fn();
		const second = vi.fn();
		on(first);
		on(second);
		ExitHooks.emit('charSelect', 'escape');
		expect(first).toHaveBeenCalledWith({ to: 'charSelect', from: 'escape' });
		expect(second).toHaveBeenCalledWith({ to: 'charSelect', from: 'escape' });
	});

	it('stops telling a listener once it is removed', () => {
		const listener = vi.fn();
		const remove = on(listener);
		remove();
		remove();
		ExitHooks.emit('login', 'escape');
		expect(listener).not.toHaveBeenCalled();
	});

	it('keeps going past a listener that throws', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const after = vi.fn();
		on(() => {
			throw new Error('broken plugin');
		});
		on(after);
		expect(() => ExitHooks.emit('login', 'charSelect')).not.toThrow();
		expect(after).toHaveBeenCalledWith({ to: 'login', from: 'charSelect' });
		expect(console.error).toHaveBeenCalled();
	});

	it('hands listeners an event they cannot change for the next one', () => {
		const seen = [];
		on(event => {
			seen.push(event.to);
			expect(() => {
				event.to = 'somewhere';
			}).toThrow();
		});
		on(event => seen.push(event.to));
		ExitHooks.emit('login', 'escape');
		expect(seen).toEqual(['login', 'login']);
	});

	it('refuses a listener that is not a function', () => {
		expect(() => ExitHooks.on({})).toThrow();
	});
});
