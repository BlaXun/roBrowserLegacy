import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PACKET from 'Network/PacketStructure.js';

const state = vi.hoisted(() => ({ hooks: new Map(), sent: [], storage: new Map() }));
vi.stubGlobal('localStorage', { getItem: key => state.storage.get(key) ?? null, setItem: (key, value) => state.storage.set(key, String(value)), removeItem: key => state.storage.delete(key) });
vi.mock('Core/Client.js', () => ({ default: { loadFile: (_path, done) => done?.('') } }));
vi.mock('DB/DBManager.js', () => ({ default: { INTERFACE_PATH: '', getItemInfo: () => ({ identifiedResourceName: 'item', unidentifiedResourceName: 'item' }), getMessage: id => String(id), getItemName: item => String(item.ITID) } }));
vi.mock('Network/NetworkManager.js', () => ({ default: { sendPacket: packet => state.sent.push(packet), hookPacket: (type, callback) => state.hooks.set(type, callback) } }));
vi.mock('Engine/MapEngine/StoreSearch.js', () => ({ canOpenSearchStore: () => true, onSearchStoreOpened() {} }));
vi.mock('Renderer/Renderer.js', () => ({ default: { width: 1200, height: 800 } }));
vi.mock('UI/CursorManager.js', () => ({ default: { setType() {}, ACTION: { DEFAULT: 0 } } }));
vi.mock('Renderer/EntityManager.js', () => ({ default: { get: () => null, setOverEntity() {} } }));
vi.mock('UI/Scrollbar.js', () => ({ default: {} }));
vi.mock('UI/UIManager.js', () => ({ default: { addComponent: component => component } }));
vi.mock('UI/Components/Inventory/Inventory.js', () => ({ default: { getUI: () => ({}) } }));
vi.mock('UI/Components/ItemInfo/ItemInfo.js', () => ({ default: {} }));
vi.mock('UI/Components/NpcStore/NpcStore.js', () => ({ default: {} }));
vi.mock('UI/Components/Vending/Vending.js', () => ({ default: { _shopname: 'Buying baseline' } }));
vi.mock('UI/Components/VendingReport/VendingReport.js', () => ({ default: {} }));
vi.mock('UI/Components/ChatBox/ChatBox.js', () => ({ default: { addText() {}, TYPE: { BLUE: 0 }, FILTER: { PUBLIC_LOG: 0 } } }));

const Store = (await import('Engine/MapEngine/Store.js')).default;
const Shop = (await import('UI/Components/VendingShop/VendingShop.js')).default;
const receive = (type, packet) => {
	expect(state.hooks.get(type)).toBeTypeOf('function');
	state.hooks.get(type)(packet);
};
const wanted = () => [...Shop.getRoot().querySelectorAll('.item .count')].map(el => el.textContent);
const items = () => [{ index: 0, ITID: 508, count: 3, price: 100 }, { index: 1, ITID: 501, count: 7, price: 20 }];
const open = () => receive(PACKET.ZC.MYITEMLIST_BUYING_STORE, { AID: 2000001, limitZeny: 5000, itemList: items() });

beforeEach(() => { state.hooks.clear(); state.sent = []; Store(); });
afterEach(() => { Shop.remove(); });

it('updates the actual buying-owner rows by item ID and bought delta for both packet families', () => {
	for (const Schema of [PACKET.ZC.UPDATE_ITEM_FROM_BUYING_STORE, PACKET.ZC.UPDATE_ITEM_FROM_BUYING_STORE2]) {
		open();
		receive(Schema, { ITID: 508, count: 1, limitZeny: 4900 });
		expect(wanted()).toEqual(['2', '7']);
		expect(Shop.getItemById(508).count).toBe(2);
		receive(Schema, { ITID: 508, count: 2, limitZeny: 4700 });
		expect(wanted()).toEqual(['7']);
		expect(Shop.getItemById(508)).toBeNull();
		Shop.remove();
	}
	expect(state.sent).toEqual([]);
});

it('ignores unrelated items and vending rows, and does not revive a closed buying window', () => {
	open();
	const update = PACKET.ZC.UPDATE_ITEM_FROM_BUYING_STORE2;
	receive(update, { ITID: 999999, count: 1, limitZeny: 4900 });
	expect(wanted()).toEqual(['3', '7']);
	Shop.setType(Shop.Type.VENDING_LIST);
	receive(update, { ITID: 508, count: 1, limitZeny: 4900 });
	expect(wanted()).toEqual(['3', '7']);
	Shop.remove();
	receive(update, { ITID: 508, count: 1, limitZeny: 4900 });
	expect(Shop.__active).toBe(false);
	expect(Shop.list).toEqual([]);
	expect(state.sent).toEqual([]);
});

it('retires the buying-owner window when the server closes it without sending another close', () => {
	open();
	receive(PACKET.ZC.FAILED_TRADE_BUYING_STORE_TO_BUYER, { Result: 4 });
	expect(Shop.__active).toBe(false);
	expect(Shop.list).toEqual([]);
	expect(state.sent).toEqual([]);
	Shop.append();
	Shop.setType(Shop.Type.VENDING_LIST);
	Shop.setItems(items());
	receive(PACKET.ZC.FAILED_TRADE_BUYING_STORE_TO_BUYER, { Result: 4 });
	expect(Shop.__active).toBe(true);
	expect(wanted()).toEqual(['3', '7']);
});
