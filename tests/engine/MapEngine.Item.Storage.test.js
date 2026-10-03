import { beforeEach, describe, expect, it, vi } from 'vitest';

// The split item-list handlers in Engine/MapEngine/Item.js are module-private
// and only reachable through the hooks ItemEngine() registers, so the Network
// mock keeps the map of packet structure -> handler.
const mocks = vi.hoisted(() => ({
	hooks: new Map(),
	storage: null
}));

vi.mock('Network/NetworkManager.js', () => ({
	default: {
		hookPacket: (struct, fn) => mocks.hooks.set(struct, fn),
		sendPacket: vi.fn()
	}
}));

vi.mock('DB/DBManager.js', () => ({ default: { getMessage: () => '', INTERFACE_PATH: '' } }));
vi.mock('Core/Configs.js', () => ({ default: { get: (_k, d) => d } }));
vi.mock('Renderer/ItemObject.js', () => ({ default: {} }));
vi.mock('Renderer/Map/Altitude.js', () => ({ default: {} }));
vi.mock('Renderer/EffectManager.js', () => ({ default: {} }));
vi.mock('UI/Components/ChatBox/ChatBox.js', () => ({ default: { addText: vi.fn(), TYPE: {}, FILTER: {} } }));
vi.mock('UI/Components/ItemObtain/ItemObtain.js', () => ({ default: {} }));
vi.mock('UI/Components/ItemSelection/ItemSelection.js', () => ({ default: {} }));
vi.mock('UI/Components/Inventory/Inventory.js', () => ({ default: { getUI: () => ({ setItems: vi.fn() }) } }));
vi.mock('UI/Components/CartItems/CartItems.js', () => ({ default: { setItems: vi.fn() } }));
vi.mock('UI/Components/Equipment/Equipment.js', () => ({ default: {} }));
vi.mock('UI/Components/PlayerViewEquip/PlayerViewEquip.js', () => ({ default: {} }));
vi.mock('UI/Components/SwitchEquip/SwitchEquip.js', () => ({ default: {} }));
vi.mock('UI/Components/MakeItemSelection/MakeItemSelection.js', () => ({ default: {} }));
vi.mock('UI/Components/MakeItemSelection/ItemListWindowSelection.js', () => ({ default: {} }));
vi.mock('UI/Components/Storage/Storage.js', () => ({ default: { getUI: () => mocks.storage } }));

const ItemEngine = (await import('Engine/MapEngine/Item.js')).default;
const PACKET = (await import('Network/PacketStructure.js')).default;

ItemEngine();

const STORAGE = 2;

/**
 * A stand-in for the storage window. Like GUIComponent, it is built (loaded)
 * on its first append, and setItems records whether the window was open when
 * the items reached it: the real one throws on a window that was never built.
 */
function storageWindow() {
	return {
		__loaded: false,
		__active: false,
		appended: 0,
		received: [],
		append() {
			this.appended++;
			this.__loaded = true;
			this.__active = true;
		},
		setItems(items) {
			this.received.push({ open: this.__loaded && this.__active, count: items.length });
		}
	};
}

function deliver(struct, itemInfo) {
	const handler = mocks.hooks.get(struct);
	if (!handler) {
		throw new Error('no handler hooked for that packet');
	}
	handler({ invType: STORAGE, itemInfo });
}

describe('Storage split item lists', () => {
	beforeEach(() => {
		mocks.storage = storageWindow();
	});

	// rAthena sends the NORMAL list only when the storage holds a stackable
	// item, so a storage of nothing but equipment arrives as an EQUIP list alone.
	it('opens the window for a storage that holds only equipment', () => {
		deliver(PACKET.ZC.SPLIT_SEND_ITEMLIST_EQUIP, [{ index: 1 }, { index: 2 }]);

		expect(mocks.storage.appended).toBe(1);
		expect(mocks.storage.received).toEqual([{ open: true, count: 2 }]);
	});

	it('opens the window once when both lists arrive', () => {
		deliver(PACKET.ZC.SPLIT_SEND_ITEMLIST_NORMAL, [{ index: 1 }]);
		deliver(PACKET.ZC.SPLIT_SEND_ITEMLIST_EQUIP, [{ index: 2 }]);

		expect(mocks.storage.appended).toBe(1);
		expect(mocks.storage.received).toEqual([
			{ open: true, count: 1 },
			{ open: true, count: 1 }
		]);
	});

	it('opens the window for a storage that holds only stackable items', () => {
		deliver(PACKET.ZC.SPLIT_SEND_ITEMLIST_NORMAL, [{ index: 1 }]);

		expect(mocks.storage.appended).toBe(1);
		expect(mocks.storage.received).toEqual([{ open: true, count: 1 }]);
	});
});
