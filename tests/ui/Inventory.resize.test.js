import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	class MockGUIComponent {
		constructor(name) {
			this.name = name;
			this._host = document.createElement('div');
			this.magnet = {};
			this.scale = 1;
			for (const [property, style] of Object.entries({
				offsetWidth: 'width',
				offsetHeight: 'height',
				offsetTop: 'top',
				offsetLeft: 'left'
			})) {
				Object.defineProperty(this._host, property, {
					get: () => (this._host.style.display === 'none' ? 0 : parseInt(this._host.style[style], 10) || 0)
				});
			}
		}
		getRoot() {
			return this._host;
		}
		draggable() {}
	}
	return { MockGUIComponent, preferences: null };
});
vi.mock('UI/GUIComponent.js', () => ({ default: mocks.MockGUIComponent }));
vi.mock('Core/Preferences.js', () => ({
	default: { get: (_name, defaults) => (mocks.preferences ||= { ...defaults, show: true, save: vi.fn() }) }
}));
vi.mock('UI/UIManager.js', () => ({
	default: {
		addComponent(component) {
			component.getRoot().innerHTML = component.render();
			component.init();
			return component;
		}
	}
}));
vi.mock('UI/UIVersionManager.js', () => ({ default: { getInventoryVersion: () => 3 } }));
vi.mock('Renderer/Renderer.js', () => ({ default: { width: 1600, height: 1200 } }));
vi.mock('UI/Elements/Elements.js', () => ({}));
vi.mock('UI/TouchDrag.js', () => ({ attachTouchDrag: vi.fn() }));
vi.mock('DB/DBManager.js', () => ({ default: {} }));
vi.mock('Network/NetworkManager.js', () => ({ default: { hookPacket: vi.fn() } }));
vi.mock('Network/PacketStructure.js', () => ({ default: { ZC: {} } }));
vi.mock('Core/Client.js', () => ({ default: { loadFile: vi.fn() } }));
vi.mock('Core/Configs.js', () => ({ default: {} }));
vi.mock('Network/PacketVerManager.js', () => ({ default: {} }));
vi.mock('UI/Components/PackageSelection/PackageSelection.js', () => ({ default: {} }));
vi.mock('UI/Components/CartItems/CartItems.js', () => ({ default: {} }));
vi.mock('UI/Components/InputBox/InputBox.js', () => ({ default: {} }));
vi.mock('UI/Components/ItemCompare/ItemCompare.js', () => ({ default: {} }));
vi.mock('UI/Components/ItemInfo/ItemInfo.js', () => ({ default: {} }));
vi.mock('UI/Components/ChatBox/ChatBox.js', () => ({ default: {} }));
vi.mock('UI/Components/Equipment/Equipment.js', () => ({ default: {} }));
vi.mock('UI/Components/Storage/Storage.js', () => ({ default: {} }));
vi.mock('UI/Components/SwitchEquip/SwitchEquip.js', () => ({ default: {} }));
vi.mock('UI/Components/BasicInfo/BasicInfo.js', () => ({ default: {} }));
vi.mock('UI/Components/Refine/Refine.js', () => ({ default: {} }));
vi.mock('UI/Components/EnchantGrade/EnchantGrade.js', () => ({ default: {} }));
vi.mock('UI/Components/Enchant/Enchant.js', () => ({ default: {} }));
vi.mock('UI/Components/Mail/Mail.js', () => ({ default: {} }));
vi.mock('UI/Components/Rodex/WriteRodex.js', () => ({ default: {} }));

const { createInventory } = await import('UI/Components/Inventory/InventoryCommon.js');
const { default: Mouse } = await import('Controls/MouseEventHandler.js');
const { default: Inventory } = await import('UI/Components/Inventory/InventoryV3/InventoryV3.js');

function fresh() {
	return createInventory({
		name: 'InventoryV3',
		htmlText: Inventory.render(),
		cssText: '',
		defaultHeight: 194,
		extraRows: 2
	});
}
function release() {
	const event = new MouseEvent('mouseup', { button: 0 });
	Object.defineProperty(event, 'which', { value: 1 });
	window.dispatchEvent(event);
}
afterEach(() => {
	release();
	vi.useRealTimers();
});

describe('Inventory vertical resizing', () => {
	it('drags in whole rows at either scale, clamps both dimensions and stops on release', () => {
		vi.useFakeTimers();
		for (const scale of [1, 2]) {
			Inventory.scale = scale;
			Inventory.resize(7, 194);
			Inventory._host.style.top = '80px';
			Inventory._host.style.left = '100px';
			Mouse.screen.x = 100 + (55 + 7 * 32 - 4) * scale;
			Mouse.screen.y = 80 + (194 - 4) * scale;
			Inventory.getRoot()
				.querySelector('.extend')
				.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
			vi.advanceTimersByTime(30);
			expect(Inventory._host.style.height).toBe('194px');
			Mouse.screen.y += 32 * scale;
			vi.advanceTimersByTime(30);
			expect(Inventory._host.style.height).toBe('226px');
			Mouse.screen.x += 1000;
			Mouse.screen.y += 1000;
			vi.advanceTimersByTime(30);
			expect(Inventory._host.style.height).toBe('258px');
			expect(Inventory._host.style.width).toBe('311px');
			Mouse.screen.x = 100;
			Mouse.screen.y = 80;
			vi.advanceTimersByTime(30);
			expect(Inventory._host.style.height).toBe('194px');
			expect(Inventory._host.style.width).toBe('247px');
			release();
			Mouse.screen.y += 1000;
			vi.advanceTimersByTime(60);
			expect(Inventory._host.style.height).toBe('194px');
		}
	});

	it('restores the expanded height after removal, including a minimized window', () => {
		mocks.preferences.reduce = false;
		const inventory = fresh();
		inventory.onAppend();
		inventory.resize(7, 258);
		inventory.getRoot().querySelector('.mini').click();
		expect(inventory._host.style.height).toBe('17px');
		inventory.onRemove();
		expect(mocks.preferences.height).toBe(258);
		expect(mocks.preferences.reduce).toBe(true);
		const restored = fresh();
		restored.onAppend();
		expect(restored._host.style.height).toBe('17px');
		restored.getRoot().querySelector('.mini').click();
		expect(restored._host.style.height).toBe('258px');
		restored.onRemove();
		expect(mocks.preferences.height).toBe(258);
		expect(mocks.preferences.reduce).toBe(false);

		// Hidden elements report zero layout dimensions, but must retain their chosen height.
		restored._host.style.display = 'none';
		restored.onRemove();
		expect(mocks.preferences.height).toBe(258);
		mocks.preferences.reduce = true;
		const hidden = fresh();
		hidden.onAppend();
		expect(hidden._host.style.display).toBe('none');
		expect(hidden._host.style.height).toBe('17px');
		hidden.onRemove();
		expect(mocks.preferences.height).toBe(258);
		hidden.getRoot().querySelector('.mini').click();
		expect(hidden._host.style.height).toBe('258px');
	});
});
