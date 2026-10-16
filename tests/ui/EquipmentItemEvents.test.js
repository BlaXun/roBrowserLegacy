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

		get scale() {
			return 1;
		}

		draggable() {}

		focus() {}

		parseHTML() {}
	}

	// A controller, as UIVersionManager.getUIController makes them: getUI(), and
	// everything else passed on to the selected window.
	const controller = selected =>
		new Proxy(
			{ getUI: selected },
			{
				get: (target, prop) => (prop in target ? target[prop] : selected()[prop]),
				set: (target, prop, value) => {
					selected()[prop] = value;
					return true;
				}
			}
		);

	return {
		MockGUIComponent,
		controller,
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
		getMessage: id => ({ 1590: 'Unequip All', 2986: 'Equipment Set' })[id] || '',
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
vi.mock('UI/Components/WinStats/WinStats.js', () => ({
	default: mocks.controller(() => ({ isEmbedded: () => false }))
}));
vi.mock('Preferences/Graphics.js', () => ({ default: { damageSkin: 0, save: vi.fn() } }));
vi.mock('UI/Components/Inventory/Inventory.js', () => ({ default: mocks.controller(() => mocks.inventory) }));
vi.mock('Renderer/Entity/Entity.js', () => ({ default: class {} }));

const { default: Equipment } = await import('UI/Components/Equipment/EquipmentV4/EquipmentV4.js');
const { default: EquipLocation } = await import('DB/Items/EquipmentLocation.js');
const { default: ItemType } = await import('DB/Items/ItemType.js');
const { default: Session } = await import('Engine/SessionStorage.js');

describe('Equipment visibility controls', () => {
	it('toggles equipment and costume visibility from either the box or its label', () => {
		Equipment.onConfigUpdate = vi.fn();
		const root = Equipment.getRoot();
		Equipment.setEquipConfig(false);
		root.querySelector('.show_equip').nextElementSibling.click();
		Equipment.setEquipConfig(true);
		root.querySelector('.show_equip').click();
		root.querySelector('a[href="#costume"]').click();
		expect(root.querySelector('.show_equip').nextElementSibling.style.display).toBe('none');
		expect(root.querySelector('.show_costume').nextElementSibling.style.display).not.toBe('none');
		Equipment.setCostumeConfig(false);
		root.querySelector('.show_costume').nextElementSibling.click();
		Equipment.setCostumeConfig(true);
		root.querySelector('.show_costume').click();
		root.querySelector('a[href="#general"]').click();
		expect(root.querySelector('.show_costume').nextElementSibling.style.display).toBe('none');
		expect(root.querySelector('.show_equip').nextElementSibling.style.display).not.toBe('none');

		expect(Equipment.onConfigUpdate.mock.calls).toEqual([
			[0, 1],
			[0, 0],
			[5, 1],
			[5, 0]
		]);
	});
});

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

	it('requests every worn item once from either gear tab and waits for server acknowledgement', () => {
		const root = Equipment.getRoot();
		const equipment = [
			[21, EquipLocation.HEAD_TOP | EquipLocation.HEAD_MID],
			[22, EquipLocation.ARMOR],
			[23, EquipLocation.COSTUME_HEAD_TOP],
			[24, EquipLocation.SHADOW_ARMOR],
			[25, EquipLocation.AMMO]
		];
		for (const tab of ['general', 'costume']) {
			Equipment.onUnEquip.mockClear();
			for (const [index, location] of equipment) worn(index, location);
			root.querySelector(`a[href="#${tab}"]`).click();
			root.querySelector('.remove_equip').click();
			expect(Equipment.onUnEquip.mock.calls).toEqual(equipment.map(([index]) => [index]));
			expect(root.querySelectorAll('.item[data-index="21"]')).toHaveLength(2);
			for (const [index, location] of equipment) Equipment.unEquip(index, location);
			expect(root.querySelectorAll('.content .item')).toHaveLength(0);
			root.querySelector('.remove_equip').click();
			expect(Equipment.onUnEquip).toHaveBeenCalledTimes(equipment.length);
		}
		const unequip = root.querySelector('.remove_equip');
		for (const tab of ['general', 'costume', 'title', 'damageskin', 'general']) {
			root.querySelector(`a[href="#${tab}"]`).click();
			expect(unequip.style.display === 'none').toBe(tab === 'title' || tab === 'damageskin');
		}

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

	it('shows equipment tooltips above their targets and dismisses them without changing focus', () => {
		worn(12, EquipLocation.ARMOR);
		const root = Equipment.getRoot();
		const overlay = root.querySelector('.overlay');
		overlay.showPopover = vi.fn();
		overlay.hidePopover = vi.fn();
		overlay.getBoundingClientRect = () => ({ width: 180, height: 24 });
		const focus = vi.spyOn(Equipment, 'focus');
		const item = root.querySelector('#general .armor .item button');
		const rect = () => ({ left: 980, top: 140, right: 1004, bottom: 164, width: 24, height: 24 });
		item.getBoundingClientRect = rect;
		item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		expect(overlay.textContent).toBe('item 19512');
		expect(overlay.showPopover).toHaveBeenCalledTimes(1);
		expect(parseFloat(overlay.style.top)).toBe(114);
		expect(parseFloat(overlay.style.left)).toBe(window.innerWidth - 180);
		item.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
		expect(overlay.hidePopover).toHaveBeenCalled();
		expect(overlay.style.display).toBe('none');

		const button = root.querySelector('.switch_equip');
		button.getBoundingClientRect = () => ({ ...rect(), left: 200 });
		button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		expect(overlay.textContent).toBe('Equipment Set');
		expect(overlay.style.left).toBe('200px');
		button.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
		root.querySelector('.remove_equip').getBoundingClientRect = button.getBoundingClientRect;
		root.querySelector('.remove_equip').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		expect(overlay.textContent).toBe('Unequip All');
		root.querySelector('.close').click();
		expect(overlay.style.display).toBe('none');
		expect(focus).not.toHaveBeenCalled();
		Equipment._host.style.display = '';
		button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		Equipment.toggle();
		expect(overlay.style.display).toBe('none');
		focus.mockRestore();
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
