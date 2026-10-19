import { afterEach, expect, it, vi } from 'vitest';
import PACKET from 'Network/PacketStructure.js';
import Session from 'Engine/SessionStorage.js';

const state = vi.hoisted(() => ({ hooks: new Map(), sent: [], inventory: new Map(), storage: new Map() }));
vi.stubGlobal('localStorage', {
	getItem: key => state.storage.get(key) ?? null,
	setItem: (key, value) => state.storage.set(key, String(value)),
	removeItem: key => state.storage.delete(key)
});
vi.mock('Core/Client.js', () => ({ default: { loadFile: (_path, done) => done?.('') } }));
vi.mock('DB/DBManager.js', () => ({
	default: {
		INTERFACE_PATH: '',
		getItemInfo: () => ({ identifiedResourceName: 'item', unidentifiedResourceName: 'item' }),
		getMessage: id => String(id),
		getItemName: item => String(item.ITID)
	}
}));
vi.mock('Network/NetworkManager.js', () => ({
	default: {
		sendPacket: packet => state.sent.push(Array.from(new Uint8Array(packet.build().buffer))),
		hookPacket: (type, callback) => state.hooks.set(type, callback)
	}
}));
vi.mock('Renderer/Renderer.js', () => ({ default: { width: 1200, height: 800 } }));
vi.mock('UI/CursorManager.js', () => ({ default: { setType() {}, ACTION: { DEFAULT: 0 } } }));
vi.mock('Renderer/EntityManager.js', () => ({ default: { setOverEntity() {} } }));
vi.mock('UI/Scrollbar.js', () => ({ default: {} }));
vi.mock('UI/UIManager.js', () => ({ default: { addComponent: component => component } }));
vi.mock('UI/Components/Inventory/Inventory.js', () => ({
	default: {
		removeItem(index) {
			const item = state.inventory.get(index);
			state.inventory.delete(index);
			return item;
		}
	}
}));
vi.mock('UI/Components/ItemInfo/ItemInfo.js', () => ({ default: {} }));
vi.mock('UI/Components/ChatBox/ChatBox.js', () => ({
	default: { addText() {}, TYPE: { ERROR: 1 }, FILTER: { PUBLIC_LOG: 1 } }
}));

const Trade = (await import('UI/Components/Trade/Trade.js')).default;
const TradeEngine = (await import('Engine/MapEngine/Trade.js')).default;
const receive = (type, packet) => state.hooks.get(type)(packet);
afterEach(() => {
	Trade.remove();
	Session.Entity = null;
});

it('submits currency beside ten offered items while still refusing an eleventh item', () => {
	TradeEngine();
	Session.Entity = { money: 50000 };
	receive(PACKET.ZC.ACK_EXCHANGE_ITEM2, { result: 3, GID: 2000002, level: 1 });
	const root = Trade.getRoot();
	for (let index = 2; index <= 12; index++) {
		state.inventory.set(index, { index, ITID: index + 499, count: 1, IsIdentified: 1 });
	}
	for (let index = 2; index <= 11; index++) {
		Trade.receiveInventoryItemStack(state.inventory.get(index));
		receive(PACKET.ZC.ACK_ADD_EXCHANGE_ITEM, { Index: index, result: 0 });
	}
	expect(root.querySelectorAll('.box.send .item')).toHaveLength(10);
	expect(state.sent).toHaveLength(10);

	const sentBeforeExtraItem = state.sent.length;
	Trade.receiveInventoryItemStack(state.inventory.get(12));
	expect(state.sent).toHaveLength(sentBeforeExtraItem);
	expect(state.inventory.has(12)).toBe(true);
	expect(root.querySelectorAll('.box.send .item')).toHaveLength(10);

	root.querySelector('.zeny.send').value = '12345';
	root.querySelector('.ok.enabled').click();
	expect(state.sent.slice(sentBeforeExtraItem)).toEqual([
		[0xe8, 0, 0, 0, 0x39, 0x30, 0, 0],
		[0xeb, 0]
	]);
	receive(PACKET.ZC.ACK_ADD_EXCHANGE_ITEM, { Index: 0, result: 0 });
	expect(root.querySelector('.zeny.send').value).toBe('12,345');
	receive(PACKET.ZC.CONCLUDE_EXCHANGE_ITEM, { who: 0 });
	expect(root.querySelector('.zeny.send').disabled).toBe(true);
	expect(root.querySelector('.box.send').classList.contains('disabled')).toBe(true);
	expect(root.querySelector('.trade.enabled').style.display).toBe('none');
	receive(PACKET.ZC.CONCLUDE_EXCHANGE_ITEM, { who: 1 });
	expect(root.querySelector('.trade.enabled').style.display).toBe('');
});
