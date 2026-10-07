import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PACKET from 'Network/PacketStructure.js';

const state = vi.hoisted(() => ({ packets: [], item: null, groups: [], version: 20221005, account: 2000000 }));
vi.mock('Core/Client.js', () => ({ default: { loadFile: (_path, done) => done(''), loadFiles: (_paths, done) => done('', '') } }));
vi.mock('DB/DBManager.js', () => ({ default: {
	INTERFACE_PATH: '', getItemPackage: () => state.groups,
	getItemInfo: id => ({ identifiedDisplayName: `Item ${id}`, identifiedResourceName: 'icon' })
} }));
vi.mock('Network/NetworkManager.js', () => ({ default: { sendPacket: packet => state.packets.push(packet) } }));
vi.mock('Network/PacketVerManager.js', () => ({ default: { get value() { return state.version; } } }));
vi.mock('Engine/SessionStorage.js', () => ({ default: { get AID() { return state.account; } } }));
vi.mock('Renderer/Renderer.js', () => ({ default: { width: 1200, height: 800 } }));
vi.mock('Renderer/EntityManager.js', () => ({ default: {} }));
vi.mock('UI/UIManager.js', () => ({ default: { addComponent: component => component } }));
vi.mock('UI/CursorManager.js', () => ({ default: {} }));
vi.mock('UI/Scrollbar.js', () => ({ default: {} }));

vi.mock('Core/Preferences.js', () => ({ default: { get: (_name, defaults) => defaults } }));
vi.mock('UI/UIVersionManager.js', () => ({ default: { getInventoryVersion: () => 0 } }));
vi.mock('Controls/MouseEventHandler.js', () => ({ default: {} }));
vi.mock('Core/Configs.js', () => ({ default: { get: () => false } }));
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

const Selection = (await import('UI/Components/PackageSelection/PackageSelection.js')).default;
const { createInventory } = await import('UI/Components/Inventory/InventoryCommon.js');
const inventory = { getItemByIndex: () => state.item };
const click = selector => Selection.getRoot().querySelector(selector).click();

beforeEach(() => {
	state.packets = [];
	state.version = 20221005;
	state.account = 2000000;
	state.item = { index: 5, ITID: 101454, count: 1 };
	state.groups = [{ id: 0, name: '+7 Sword', items: [{ id: 21005, amount: 1, refine: 7 }] },
		{ id: 10, name: '+7 Foxtail', items: [{ id: 26111, amount: 1, refine: 7 }] }];
});
afterEach(async () => {
	Selection.remove();
	await new Promise(resolve => setTimeout(resolve, 20));
});

describe('package selection', () => {
	it('confirms group zero once, without locally consuming the box', () => {
		Selection.open(state.item, inventory);
		expect(Selection.getRoot().textContent).toContain('+7 Sword');
		click('[data-group="0"]');
		const confirm = Selection.getRoot().querySelector('.confirm');
		confirm.click();
		confirm.click();
		expect(state.packets).toHaveLength(1);
		expect(state.packets[0]).toBeInstanceOf(PACKET.CZ.USE_PACKAGEITEM);
		expect(state.packets[0]).toMatchObject({ index: 5, AID: 2000000, itemID: 101454, BoxIndex: 0 });
		expect(state.item.count).toBe(1);
	});

	it('sends the selected group ID rather than its position', () => {
		Selection.open(state.item, inventory);
		click('[data-group="10"]');
		click('.confirm');
		expect(state.packets[0].BoxIndex).toBe(10);
	});

	it('cancels without sending or consuming anything', () => {
		Selection.open(state.item, inventory);
		click('.cancel');
		expect(state.packets).toHaveLength(0);
		expect(state.item.count).toBe(1);
	});

	it('rejects confirmation if the inventory slot now contains another item', () => {
		Selection.open(state.item, inventory);
		state.item = { index: 5, ITID: 501, count: 1 };
		click('[data-group="0"]');
		click('.confirm');
		expect(state.packets).toHaveLength(0);
	});

	it('rejects confirmation after the account changes or the box disappears', () => {
		Selection.open(state.item, inventory);
		state.account = 2000001;
		state.item = null;
		click('[data-group="0"]');
		click('.confirm');
		expect(state.packets).toHaveLength(0);
	});

	it('does not open on an unsupported packet version or without package metadata', () => {
		state.version = 20220215;
		Selection.open(state.item, inventory);
		expect(Selection.__active).toBe(false);
		state.version = 20221005;
		state.groups = [];
		Selection.open(state.item, inventory);
		expect(Selection.__active).toBe(false);
	});
});


describe('inventory package routing', () => {
	const makeInventory = () => {
		const component = createInventory({ name: 'PackageRoutingTest', htmlText: '', cssText: '', defaultHeight: 3 });
		component.list = [state.item];
		component.onUseItem = vi.fn();
		return component;
	};

	it('opens selection for a package sent by rAthena as an ordinary usable item', () => {
		state.item.type = 2;
		const component = makeInventory();
		component.useItem(state.item);
		expect(Selection.__active).toBe(true);
		expect(component.onUseItem).not.toHaveBeenCalled();
		click('[data-group="0"]');
		click('.confirm');
		expect(state.packets[0]).toMatchObject({ index: 5, itemID: 101454, BoxIndex: 0 });
	});

	it('keeps ordinary usable items on their existing use path', () => {
		state.item = { index: 6, ITID: 501, count: 2, type: 2 };
		state.groups = [];
		const component = makeInventory();
		component.useItem(state.item);
		expect(component.onUseItem).toHaveBeenCalledWith(6);
		expect(Selection.__active).toBe(false);
	});

	it('keeps the ordinary use path before package packets are supported', () => {
		state.item.type = 2;
		state.version = 20220215;
		const component = makeInventory();
		component.useItem(state.item);
		expect(component.onUseItem).toHaveBeenCalledWith(5);
		expect(Selection.__active).toBe(false);
	});
});
