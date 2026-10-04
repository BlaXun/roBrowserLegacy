/**
 * tests/ui/UIScale.test.js
 *
 * The per-window UI scale a client plugin sets. With nobody setting one the
 * client must look exactly as it does without the file, so most cases also
 * check that a factor of 1 leaves nothing behind on the window.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import UIScale from '../../src/UI/UIScale.js';

const removers = [];
const on = listener => {
	const remove = UIScale.on(listener);
	removers.push(remove);
	return remove;
};

const mounted = [];

/**
 * A stand-in for a GUIComponent: a named host with a shadow root.
 */
function component(name, extra = {}) {
	const host = document.createElement('div');
	host.attachShadow({ mode: 'open' }).innerHTML = '<div class="inner"></div>';
	document.body.appendChild(host);
	const result = { name, _host: host, _fixPositionOverflow: vi.fn(), ...extra };
	mounted.push(result);
	return result;
}

afterEach(() => {
	removers.splice(0).forEach(remove => remove());
	mounted.splice(0).forEach(item => {
		UIScale.detach(item);
		item._host.remove();
	});
	UIScale.names().forEach(name => UIScale.set(name, 1));
	UIScale.setGlobal(1);
	vi.restoreAllMocks();
});

describe('UIScale', () => {
	it('can scale the hotbar, the chat, the inventory and the buff icons', () => {
		expect(UIScale.names()).toEqual(expect.arrayContaining(['ShortCut', 'ChatBox', 'Inventory', 'StatusIcons']));
	});

	it('starts every window at 1', () => {
		expect(UIScale.getGlobal()).toBe(1);
		UIScale.names().forEach(name => expect(UIScale.effective(name)).toBe(1));
	});

	it('multiplies a window by the global factor', () => {
		UIScale.setGlobal(1.5);
		UIScale.set('ShortCut', 2);
		expect(UIScale.get('ShortCut')).toBe(2);
		expect(UIScale.effective('ShortCut')).toBe(3);
		expect(UIScale.effective('ChatBox')).toBe(1.5);
	});

	it('keeps a factor between 0.5 and 3', () => {
		expect(UIScale.set('Inventory', 10)).toBe(UIScale.MAX);
		expect(UIScale.set('Inventory', 0)).toBe(UIScale.MIN);
		expect(UIScale.setGlobal(-1)).toBe(UIScale.MIN);
	});

	it('refuses a window that cannot be scaled and a value that is not a number', () => {
		expect(() => UIScale.set('WorldMap', 2)).toThrow(TypeError);
		expect(() => UIScale.get('NotAWindow')).toThrow(TypeError);
		expect(() => UIScale.set('Inventory', NaN)).toThrow(TypeError);
		expect(() => UIScale.set('Inventory', '2')).toThrow(TypeError);
		expect(() => UIScale.setGlobal(Infinity)).toThrow(TypeError);
	});

	it('scales a version of a window and a clone as the window itself', () => {
		UIScale.set('Inventory', 2);
		UIScale.set('WhisperBox', 1.5);
		expect(UIScale.of({ name: 'InventoryV3' })).toBe(2);
		expect(UIScale.of({ name: 'SomePlayer', scaleName: 'WhisperBox' })).toBe(1.5);
	});

	it('leaves a window that cannot be scaled at 1, whatever the global factor', () => {
		UIScale.setGlobal(2);
		expect(UIScale.of({ name: 'WorldMap' })).toBe(1);
		expect(UIScale.of(null)).toBe(1);
	});
});

describe('UIScale on a window', () => {
	it('draws the window at its factor, from the corner it is anchored to', () => {
		UIScale.set('StatusIcons', 2);
		const icons = component('StatusIcons');
		UIScale.attach(icons);
		expect(icons._host.style.getPropertyValue('scale')).toBe('2');
		expect(icons._host.style.getPropertyValue('transform-origin')).toBe('100% 0');
	});

	it('leaves nothing on the window at 1', () => {
		const inventory = component('InventoryV1');
		UIScale.attach(inventory);
		expect(inventory._host.getAttribute('style')).toBeNull();

		UIScale.set('Inventory', 1.25);
		expect(inventory._host.style.getPropertyValue('scale')).toBe('1.25');
		expect(inventory._host.style.getPropertyValue('transform-origin')).toBe('0 0');

		UIScale.set('Inventory', 1);
		expect(inventory._host.style.getPropertyValue('scale')).toBe('');
		expect(inventory._host.style.getPropertyValue('transform-origin')).toBe('');
	});

	it('redraws a mounted window, keeps it on screen and lets it adjust', () => {
		const onScale = vi.fn();
		const chat = component('ChatBox', { onScale });
		UIScale.attach(chat);

		UIScale.setGlobal(1.5);
		expect(chat._host.style.getPropertyValue('scale')).toBe('1.5');
		expect(chat._fixPositionOverflow).toHaveBeenCalledTimes(1);
		expect(onScale).toHaveBeenCalledWith(1.5);
	});

	it('only redraws the windows a change is about', () => {
		const chat = component('ChatBox');
		const hotbar = component('ShortCut');
		UIScale.attach(chat);
		UIScale.attach(hotbar);

		UIScale.set('ShortCut', 2);
		expect(hotbar._fixPositionOverflow).toHaveBeenCalledTimes(1);
		expect(chat._fixPositionOverflow).not.toHaveBeenCalled();
	});

	it('stops redrawing a window once it leaves the screen', () => {
		const hotbar = component('ShortCut');
		UIScale.attach(hotbar);
		UIScale.detach(hotbar);

		UIScale.set('ShortCut', 2);
		expect(hotbar._host.style.getPropertyValue('scale')).toBe('');
		expect(hotbar._fixPositionOverflow).not.toHaveBeenCalled();
	});

	it('keeps going past a window that fails to adjust', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const broken = component('ChatBox', {
			onScale() {
				throw new Error('boom');
			}
		});
		const hotbar = component('ShortCut');
		UIScale.attach(broken);
		UIScale.attach(hotbar);

		UIScale.setGlobal(2);
		expect(hotbar._host.style.getPropertyValue('scale')).toBe('2');
		expect(console.error).toHaveBeenCalled();
	});

	it('tells window code the factor of the window an element is in', () => {
		UIScale.set('Inventory', 2);
		const inventory = component('InventoryV0');
		UIScale.attach(inventory);

		expect(UIScale.ofElement(inventory._host.shadowRoot.querySelector('.inner'))).toBe(2);
		expect(UIScale.ofElement(document.body)).toBe(1);
		expect(UIScale.ofElement(null)).toBe(1);
	});
});

describe('UIScale listeners', () => {
	it('tells a listener which factor changed', () => {
		const listener = vi.fn();
		on(listener);
		UIScale.set('ChatBox', 0.75);
		UIScale.setGlobal(2);
		expect(listener).toHaveBeenNthCalledWith(1, { name: 'ChatBox', scale: 0.75 });
		expect(listener).toHaveBeenNthCalledWith(2, { name: null, scale: 2 });
	});

	it('says nothing when the factor does not change', () => {
		const listener = vi.fn();
		on(listener);
		UIScale.set('ChatBox', 1);
		UIScale.setGlobal(1);
		expect(listener).not.toHaveBeenCalled();
	});

	it('stops telling a listener once it is removed', () => {
		const listener = vi.fn();
		const remove = on(listener);
		remove();
		remove();
		UIScale.set('ChatBox', 2);
		expect(listener).not.toHaveBeenCalled();
	});

	it('keeps going past a listener that throws', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const after = vi.fn();
		on(() => {
			throw new Error('boom');
		});
		on(after);
		UIScale.set('ChatBox', 2);
		expect(after).toHaveBeenCalled();
		expect(console.error).toHaveBeenCalled();
	});

	it('hands out events that cannot be changed', () => {
		let event;
		on(e => {
			event = e;
		});
		UIScale.set('ChatBox', 2);
		expect(Object.isFrozen(event)).toBe(true);
	});

	it('takes a function', () => {
		expect(() => UIScale.on('nope')).toThrow();
	});
});
