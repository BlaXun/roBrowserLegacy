import { afterEach, expect, it, vi } from 'vitest';
import PACKET from 'Network/PacketStructure.js';
import Session from 'Engine/SessionStorage.js';
import Client from 'Core/Client.js';

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
		getItemInfo: ITID => ({ identifiedResourceName: `item${ITID}`, unidentifiedResourceName: `item${ITID}` }),
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
	state.inventory.clear();
	state.sent.length = 0;
	vi.restoreAllMocks();
});

const iconData = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const receiveItem = ITID =>
	receive(PACKET.ZC.ADD_EXCHANGE_ITEM, {
		ITID,
		count: 2,
		IsIdentified: 1,
		IsDamaged: 0,
		RefiningLevel: 0,
		slot: { card1: 0, card2: 0, card3: 0, card4: 0 }
	});

it('renders self and peer icons independently when their trade row indices match', () => {
	TradeEngine();
	Session.Entity = { money: 50000 };
	const pending = [];
	vi.spyOn(Client, 'loadFile').mockImplementation((path, done) => {
		if (/item\d+\.bmp$/.test(path)) {
			pending.push(done);
		} else {
			done?.('');
		}
	});
	receive(PACKET.ZC.ACK_EXCHANGE_ITEM2, { result: 3, GID: 2000002, level: 1 });
	const item = { index: 2, ITID: 501, count: 1, IsIdentified: 1 };
	state.inventory.set(2, item);
	Trade.receiveInventoryItemStack(item);
	receive(PACKET.ZC.ACK_ADD_EXCHANGE_ITEM, { Index: 2, result: 0 });
	receiveItem(512);
	pending[0](`${iconData}#self`);
	pending[1](`${iconData}#peer`);

	const root = Trade.getRoot();
	expect(root.querySelector('.box.send .icon').style.backgroundImage).toContain(`${iconData}#self`);
	expect(root.querySelector('.box.recv .icon').style.backgroundImage).toContain(`${iconData}#peer`);
});

it('keeps delayed self and peer images from painting replacement rows after a trade is reopened', () => {
	TradeEngine();
	Session.Entity = { money: 50000 };
	const pending = [];
	vi.spyOn(Client, 'loadFile').mockImplementation((path, done) => {
		if (/item\d+\.bmp$/.test(path)) {
			pending.push(done);
		} else {
			done?.('');
		}
	});

	for (const side of ['send', 'recv']) {
		const offer = ITID => {
			if (side === 'recv') {
				receiveItem(ITID);
				return;
			}
			const item = { index: 2, ITID, count: 1, IsIdentified: 1 };
			state.inventory.set(2, item);
			Trade.receiveInventoryItemStack(item);
			receive(PACKET.ZC.ACK_ADD_EXCHANGE_ITEM, { Index: 2, result: 0 });
		};
		receive(PACKET.ZC.ACK_EXCHANGE_ITEM2, { result: 3, GID: 2000002, level: 1 });
		offer(501);
		const previousImage = pending.pop();
		receive(PACKET.ZC.CANCEL_EXCHANGE_ITEM, {});
		receive(PACKET.ZC.ACK_EXCHANGE_ITEM2, { result: 3, GID: 2000002, level: 1 });
		offer(512);
		pending.pop()(`${iconData}#current`);
		previousImage(`${iconData}#previous`);
		expect.soft(Trade.getRoot().querySelector(`.box.${side} .icon`).style.backgroundImage).toContain(`${iconData}#current`);
		receive(PACKET.ZC.CANCEL_EXCHANGE_ITEM, {});
	}
});
