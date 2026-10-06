import { describe, expect, it, vi } from 'vitest';

/**
 * StorageFilter inherits from GUIComponent, which is an ES6 class. It must not
 * be constructed by calling the parent as a function, because calling a class
 * without `new` is a TypeError and takes the storage search down with it.
 *
 * The real GUIComponent is used deliberately -- it is the half of the
 * relationship under test. Only StorageFilter's other imports are stubbed.
 */

vi.mock('DB/DBManager.js', () => ({
	default: {
		INTERFACE_PATH: '',
		getItemInfo: () => ({ identifiedResourceName: '', unidentifiedResourceName: '' }),
		getItemName: () => '',
		getMessage: () => ''
	}
}));
vi.mock('Core/Client.js', () => ({ default: { loadFile: () => {} } }));
vi.mock('Core/Preferences.js', () => ({
	default: { get: (name, defaults) => ({ ...defaults, save: () => {} }) }
}));
vi.mock('Renderer/Renderer.js', () => ({ default: { width: 800, height: 600 } }));
vi.mock('Controls/MouseEventHandler.js', () => ({ default: { screen: { x: 0, y: 0 } } }));
vi.mock('UI/Elements/Elements.js', () => ({}));
vi.mock('UI/Components/ItemInfo/ItemInfo.js', () => ({
	default: { uid: -1, append: () => {}, remove: () => {}, setItem: () => {} }
}));

import GUIComponent from 'UI/GUIComponent.js';
import StorageFilter from 'UI/Components/Storage/StorageV3/StorageFilter.js';

describe('StorageFilter', () => {
	it('can be constructed', () => {
		expect(() => new StorageFilter(0)).not.toThrow();
	});

	it('is a GUIComponent', () => {
		expect(new StorageFilter(0)).toBeInstanceOf(GUIComponent);
	});

	it('keeps its own name per tab', () => {
		expect(new StorageFilter(3).name).toBe('StorageFilter_3');
	});

	it('still carries the prototype methods and mouse mode', () => {
		const filter = new StorageFilter(0);
		expect(typeof filter.setItems).toBe('function');
		expect(typeof filter.renderItem).toBe('function');
		expect(filter.mouseMode).toBe(GUIComponent.MouseMode.STOP);
	});
});
