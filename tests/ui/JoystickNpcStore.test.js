/**
 * tests/ui/JoystickNpcStore.test.js
 *
 * A in an NPC shop with the gamepad: the item is picked up and put down on
 * the other list (JoystickCarry), and the shop's own drop handler moves it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	class MockGUIComponent {
		constructor(name) {
			this.name = name;
			this._host = document.createElement('div');
			document.body.appendChild(this._host);
			this.ui = { show: vi.fn(), hide: vi.fn(), is: vi.fn(() => true) };
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
		components: {},
		chatBox: { addText: vi.fn(), TYPE: { ERROR: 1 }, FILTER: { PUBLIC_LOG: 1 } },
		inputBox: { append: vi.fn(), remove: vi.fn(), setType: vi.fn(), onSubmitRequest: null },
		session: { zeny: 100000000, isTouchDevice: false, Entity: { weight: 0, max_weight: 1000000 } }
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
		components: mocks.components,
		addComponent(component) {
			component.getRoot().innerHTML = component.render();
			component.init();
			mocks.components[component.name] = component;
			return component;
		},
		getComponent(name) {
			if (!(name in mocks.components)) {
				throw new Error('not found');
			}
			return mocks.components[name];
		}
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
	InventoryItemTransferPriority: { NPC_STORE: 1 },
	transferInventoryItemStack: vi.fn()
}));

const { default: NpcStore } = await import('UI/Components/NpcStore/NpcStore.js');
const { default: ItemType } = await import('DB/Items/ItemType.js');
const { default: Profiles } = await import('UI/Components/JoystickUI/JoystickWindowProfiles.js');
const { default: Carry } = await import('UI/Components/JoystickUI/JoystickCarry.js');

const POTION = 0;
const DAGGER = 1;

function openShop() {
	NpcStore.setType(NpcStore.Type.BUY);
	NpcStore.setList([
		{ ITID: 501, type: ItemType.HEALING, price: 50, weight: 70 },
		{ ITID: 1201, type: ItemType.WEAPON, price: 100, weight: 400 }
	]);
	const root = NpcStore.getRoot();
	return { root, host: NpcStore._host, name: 'NpcStore', profile: Profiles.forName('NpcStore') };
}

function itemIn(win, list, index) {
	return win.root.querySelector(`.${list} .content .item[data-index="${index}"]`);
}

describe('NPC shop with the gamepad', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.inputBox.onSubmitRequest = null;
	});

	it('A puts a dagger in the deal at once, and takes it out again', () => {
		const win = openShop();

		expect(win.profile.primaryLabel(itemIn(win, 'InputWindow', DAGGER), win)).toBe('Add');
		win.profile.primary(itemIn(win, 'InputWindow', DAGGER), win);
		expect(itemIn(win, 'OutputWindow', DAGGER)).not.toBe(null);
		expect(Carry.isCarrying()).toBe(false);
		expect(window._OBJ_DRAG_).toBeUndefined();

		expect(win.profile.primaryLabel(itemIn(win, 'OutputWindow', DAGGER), win)).toBe('Remove');
		win.profile.primary(itemIn(win, 'OutputWindow', DAGGER), win);
		expect(itemIn(win, 'OutputWindow', DAGGER)).toBe(null);
	});

	it('A on potions asks how many, as dragging them does', () => {
		const win = openShop();

		win.profile.primary(itemIn(win, 'InputWindow', POTION), win);
		expect(mocks.inputBox.append).toHaveBeenCalledTimes(1);
		mocks.inputBox.onSubmitRequest(3);
		expect(itemIn(win, 'OutputWindow', POTION).querySelector('.amount').textContent).toBe('3');
	});
});
