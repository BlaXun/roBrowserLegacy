import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	class MockGUIComponent {
		constructor(name) {
			this.name = name;
			this._host = document.createElement('div');
			this.ui = {
				show: vi.fn(),
				hide: vi.fn(),
				is: vi.fn(() => true)
			};
		}

		getRoot() {
			return this._host;
		}

		draggable() {}

		focus() {}

		parseHTML() {}
	}

	return {
		MockGUIComponent,
		inventory: {
			equippedItems: [],
			isInEquipSwitchList: () => true
		}
	};
});

vi.mock('DB/DBManager.js', () => ({
	default: {
		INTERFACE_PATH: 'data/texture/',
		getItemInfo: () => ({ identifiedResourceName: 'item' }),
		getItemName: item => `item ${item.ITID}`,
		getMessage: () => '',
		getTitleString: id => `title ${id}`
	}
}));
vi.mock('Network/NetworkManager.js', () => ({ default: { sendPacket: vi.fn(), hookPacket: vi.fn() } }));
vi.mock('Network/PacketVerManager.js', () => ({ default: { value: 20221005 } }));
vi.mock('Network/PacketStructure.js', () => ({ default: { CZ: {}, ZC: {} } }));
vi.mock('Core/Client.js', () => ({
	default: {
		loadFile(_path, callback) {
			callback?.('data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==');
		}
	}
}));
vi.mock('Core/Preferences.js', () => ({
	default: {
		get: () => ({ x: 0, y: 0, show: false, reduce: false, stats: true, save: vi.fn() })
	}
}));
vi.mock('Engine/SessionStorage.js', () => ({ default: { Entity: { hasCart: false } } }));
vi.mock('Renderer/Renderer.js', () => ({ default: { width: 1200, height: 800, render: vi.fn(), stop: vi.fn() } }));
vi.mock('Renderer/Camera.js', () => ({ default: {} }));
vi.mock('Renderer/SpriteRenderer.js', () => ({ default: {} }));
vi.mock('UI/UIVersionManager.js', () => ({ default: { getEquipmentVersion: () => 4 } }));
vi.mock('UI/UIManager.js', () => ({
	default: {
		addComponent(component) {
			component.getRoot().innerHTML = component.render();
			component.init();
			return component;
		}
	}
}));
vi.mock('UI/GUIComponent.js', () => ({ default: mocks.MockGUIComponent }));
vi.mock('UI/Elements/Elements.js', () => ({}));
vi.mock('UI/Components/ItemInfo/ItemInfo.js', () => ({ default: {} }));
vi.mock('UI/Components/CartItems/CartItems.js', () => ({ default: {} }));
vi.mock('UI/Components/SwitchEquip/SwitchEquip.js', () => ({ default: { equip: vi.fn(), ui: null } }));
vi.mock('UI/Components/WinStats/WinStats.js', () => ({ default: { getUI: () => ({ isEmbedded: () => false }) } }));
vi.mock('Preferences/Graphics.js', () => ({ default: { damageSkin: 0, save: vi.fn() } }));
vi.mock('UI/Components/Inventory/Inventory.js', () => ({ default: { getUI: () => mocks.inventory } }));
vi.mock('Renderer/Entity/Entity.js', () => ({ default: class {} }));

const { default: Equipment } = await import('UI/Components/Equipment/EquipmentV4/EquipmentV4.js');
const { default: EquipLocation } = await import('DB/Items/EquipmentLocation.js');
const { default: ItemType } = await import('DB/Items/ItemType.js');
const { default: Session } = await import('Engine/SessionStorage.js');

function worn(index, location) {
	const item = { index, ITID: 19500 + index, type: ItemType.ARMOR, IsIdentified: true, location };
	Equipment.equip(item, location);
	return item;
}

function dragEvent(type, dataTransfer) {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
	return event;
}

describe('Equipment item events', () => {
	beforeEach(() => {
		Equipment.onUnEquip = vi.fn();
		Equipment.onEquipItem = vi.fn();
		delete window._OBJ_DRAG_;
	});

	it('takes off a costume on double-click, not only gear on the first tab', () => {
		worn(7, EquipLocation.COSTUME_HEAD_TOP);
		worn(3, EquipLocation.HEAD_TOP);
		const root = Equipment.getRoot();

		root.querySelector('#costume .costume_head_top .item').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		root.querySelector('#general .head_top .item').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

		expect(Equipment.onUnEquip).toHaveBeenNthCalledWith(1, 7);
		expect(Equipment.onUnEquip).toHaveBeenNthCalledWith(2, 3);
	});

	it('starts a drag from a worn item, marked as coming from Equipment', () => {
		worn(9, EquipLocation.COSTUME_HEAD_MID);
		const element = Equipment.getRoot().querySelector('#costume .costume_head_mid .item');
		const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn() };

		expect(element.getAttribute('draggable')).toBe('true');
		element.dispatchEvent(dragEvent('dragstart', dataTransfer));

		expect(dataTransfer.setData).toHaveBeenCalledTimes(1);
		const [format, payload] = dataTransfer.setData.mock.calls[0];
		expect(format).toBe('Text');
		expect(JSON.parse(payload)).toMatchObject({ type: 'item', from: 'Equipment', data: { index: 9 } });

		element.dispatchEvent(dragEvent('dragend', dataTransfer));
		expect(window._OBJ_DRAG_).toBeUndefined();
	});

	it('does not re-equip an item dropped back onto the window it came from', () => {
		const item = worn(11, EquipLocation.COSTUME_HEAD_BOTTOM);
		const drop = from =>
			dragEvent('drop', { getData: () => JSON.stringify({ type: 'item', from, data: item }) });

		Equipment._host.dispatchEvent(drop('Equipment'));
		expect(Equipment.onEquipItem).not.toHaveBeenCalled();

		Equipment._host.dispatchEvent(drop('Inventory'));
		expect(Equipment.onEquipItem).toHaveBeenCalledWith(11, EquipLocation.COSTUME_HEAD_BOTTOM);
	});
});

describe('Equipment damage indicator style', () => {
	it('marks only the chosen style as picked', () => {
		const picked = () =>
			[...Equipment.getRoot().querySelectorAll('#damageskin .skin-option.active')].map(el =>
				el.getAttribute('data-skin')
			);

		Equipment.setDamageSkin(2);
		expect(picked()).toEqual(['2']);

		Equipment.setDamageSkin(0);
		expect(picked()).toEqual(['0']);
	});
});

describe('Equipment titles', () => {
	it('lists only the titles the character owns', () => {
		Session.Achievement = { titles: [1004, 1001] };
		Equipment.setTitle(1004);

		const options = [...Equipment.getRoot().querySelectorAll('#title_list .title-option')];
		expect(options.map(el => el.getAttribute('data-title'))).toEqual(['0', '1001', '1004']);
		expect(options[2].classList.contains('selected')).toBe(true);
	});

	it('asks for a title once per click however often the list is rebuilt', () => {
		Session.Achievement = { titles: [1001] };
		Equipment.selectTitle = vi.fn();
		Equipment.loadTitles();
		Equipment.loadTitles();

		Equipment.getRoot()
			.querySelector('#title_list .title-option[data-title="1001"]')
			.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(Equipment.selectTitle).toHaveBeenCalledTimes(1);
		expect(Equipment.selectTitle).toHaveBeenCalledWith(1001);
	});
});
