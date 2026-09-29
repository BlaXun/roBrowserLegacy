import { beforeEach, describe, expect, it, vi } from 'vitest';

const STOCK = 30000;
const PRICE = 50;

const mocks = vi.hoisted(() => {
	class MockGUIComponent {
		constructor(name) {
			this.name = name;
			this._host = document.createElement('div');
			document.body.appendChild(this._host);
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

		remove() {}
	}

	MockGUIComponent.MouseMode = { FREEZE: 1 };

	return {
		MockGUIComponent,
		chatBox: {
			addText: vi.fn(),
			TYPE: { ERROR: 1 },
			FILTER: { PUBLIC_LOG: 1 }
		},
		inputBox: {
			append: vi.fn(),
			remove: vi.fn(),
			setType: vi.fn(),
			onSubmitRequest: null
		},
		session: {
			zeny: 0,
			isTouchDevice: false,
			Entity: { weight: 0, max_weight: 1000000 }
		}
	};
});

vi.mock('DB/DBManager.js', () => ({
	default: {
		INTERFACE_PATH: 'data/texture/interface/',
		getItemInfo: () => ({ identifiedResourceName: 'item', unidentifiedResourceName: 'item' }),
		getItemName: item => `Item ${item.ITID}`,
		getMessage: id => `message ${id}`
	}
}));
vi.mock('Core/Client.js', () => ({
	default: {
		loadFile(_path, callback) {
			callback?.('data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==');
		}
	}
}));
vi.mock('Core/Preferences.js', () => ({
	default: {
		get() {
			return { select_all: false, save: vi.fn() };
		}
	}
}));
vi.mock('Engine/SessionStorage.js', () => ({ default: mocks.session }));
vi.mock('Controls/MouseEventHandler.js', () => ({ default: { screen: { x: 0, y: 0 } } }));
vi.mock('Controls/KeyEventHandler.js', () => ({ default: { ESCAPE: 27 } }));
vi.mock('Network/NetworkManager.js', () => ({ default: { sendPacket: vi.fn() } }));
vi.mock('Network/PacketVerManager.js', () => ({ default: { value: 20180704 } }));
vi.mock('Network/PacketStructure.js', () => ({ default: { CZ: {} } }));
vi.mock('UI/GUIComponent.js', () => ({ default: mocks.MockGUIComponent }));
vi.mock('UI/UIManager.js', () => ({
	default: {
		addComponent(component) {
			component.getRoot().innerHTML = component.render();
			component.init();
			return component;
		},
		getComponent: vi.fn()
	}
}));
vi.mock('UI/Elements/Elements.js', () => ({}));
vi.mock('UI/Components/ItemInfo/ItemInfo.js', () => ({
	default: { uid: null, append: vi.fn(), remove: vi.fn(), setItem: vi.fn() }
}));
vi.mock('UI/Components/InputBox/InputBox.js', () => ({ default: mocks.inputBox }));
vi.mock('UI/Components/ChatBox/ChatBox.js', () => ({ default: mocks.chatBox }));
vi.mock('UI/Components/Inventory/Inventory.js', () => ({
	default: { getUI: () => ({ getItemById: () => null }) }
}));
vi.mock('UI/Components/Inventory/InventoryItemTransfer.js', () => ({
	InventoryItemTransferPriority: { NPC_STORE: 1 }
}));

const { default: NpcStore } = await import('UI/Components/NpcStore/NpcStore.js');
const { default: ItemType } = await import('DB/Items/ItemType.js');

const POTION = 0;
const DAGGER = 1;

function openMarketShop(stock = STOCK) {
	NpcStore.setType(NpcStore.Type.MARKETSHOP);
	NpcStore.setList([
		{ ITID: 501, type: ItemType.HEALING, price: PRICE, qty: stock, weight: 70 },
		{ ITID: 1201, type: ItemType.WEAPON, price: PRICE, qty: stock, weight: 400 }
	]);

	return NpcStore.getRoot();
}

function amountOf(root, windowName, index) {
	const item = root.querySelector(`.${windowName} .content .item[data-index="${index}"]`);
	return item ? item.querySelector('.amount').textContent : null;
}

function doubleClick(root, windowName, index) {
	const item = root.querySelector(`.${windowName} .content .item[data-index="${index}"]`);
	item.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
}

describe('NpcStore market shop quantities', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.inputBox.onSubmitRequest = null;
		mocks.session.zeny = 100000000;
	});

	it('shows the stall stock in the amount column', () => {
		const root = openMarketShop();

		expect(amountOf(root, 'InputWindow', POTION)).toBe(String(STOCK));
		expect(amountOf(root, 'InputWindow', DAGGER)).toBe(String(STOCK));
	});

	it('defaults the quantity prompt to one, not to the whole stall', () => {
		const root = openMarketShop();

		doubleClick(root, 'InputWindow', POTION);

		expect(mocks.inputBox.append).toHaveBeenCalled();
		expect(mocks.inputBox.setType).toHaveBeenCalledWith('number', false, 1);
	});

	it('buys one non-stackable item rather than the whole stall', () => {
		const root = openMarketShop();

		// Enough zeny for one dagger, nowhere near enough for the stall. Buying the
		// stall by default made every such item unbuyable: the cost check rejected
		// it before anything reached the purchase window.
		mocks.session.zeny = PRICE * 10;

		doubleClick(root, 'InputWindow', DAGGER);

		expect(mocks.inputBox.append).not.toHaveBeenCalled();
		expect(mocks.chatBox.addText).not.toHaveBeenCalled();
		expect(amountOf(root, 'OutputWindow', DAGGER)).toBe('1');
	});

	it('caps a quantity at the remaining stock and counts the stall down', () => {
		const root = openMarketShop();

		doubleClick(root, 'InputWindow', POTION);
		mocks.inputBox.onSubmitRequest(STOCK + 10);

		expect(amountOf(root, 'OutputWindow', POTION)).toBe(String(STOCK));
		expect(amountOf(root, 'InputWindow', POTION)).toBe('0');
	});

	it('charges for the stock it can supply, not for the whole request', () => {
		const SHORT_STOCK = 6;
		const root = openMarketShop(SHORT_STOCK);

		// Enough for every potion the stall holds, nowhere near enough for the 99
		// that were asked for. Pricing the request rather than the six that would
		// actually move turned away a purchase the player could afford.
		mocks.session.zeny = PRICE * SHORT_STOCK * 2;

		doubleClick(root, 'InputWindow', POTION);
		mocks.inputBox.onSubmitRequest(99);

		expect(mocks.chatBox.addText).not.toHaveBeenCalled();
		expect(amountOf(root, 'OutputWindow', POTION)).toBe(String(SHORT_STOCK));
	});

	it('leaves the amount column blank for a shop with no stock limit', () => {
		NpcStore.setType(NpcStore.Type.VENDING_STORE);
		NpcStore.setList([{ ITID: 501, type: ItemType.HEALING, price: PRICE, weight: 70 }]);

		expect(amountOf(NpcStore.getRoot(), 'InputWindow', POTION)).toBe('');
	});
});