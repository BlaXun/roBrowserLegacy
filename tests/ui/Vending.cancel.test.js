import { afterEach, expect, it, vi } from 'vitest';

// Keep Vending and GUIComponent real; isolate game services and unrelated windows.
vi.mock('Core/Client.js', () => ({
	default: { loadFile: (_path, done) => done?.(''), loadFiles: (_paths, done) => done?.('', '') }
}));
vi.mock('DB/DBManager.js', () => ({
	default: {
		INTERFACE_PATH: '',
		getMessage: () => '',
		getItemInfo: () => ({ identifiedResourceName: 'item' }),
		getItemName: () => 'Apple'
	}
}));
vi.mock('Network/NetworkManager.js', () => ({ default: { sendPacket() {} } }));
vi.mock('Renderer/Renderer.js', () => ({ default: { width: 1200, height: 800 } }));
vi.mock('Renderer/EntityManager.js', () => ({ default: { setOverEntity() {} } }));
vi.mock('UI/CursorManager.js', () => ({ default: { ACTION: { DEFAULT: 0 }, getActualType: () => 0, setType() {} } }));
vi.mock('UI/Scrollbar.js', () => ({ default: {} }));
vi.mock('UI/UIManager.js', () => ({ default: { addComponent: component => component } }));
vi.mock('UI/Components/ItemInfo/ItemInfo.js', () => ({ default: {} }));
vi.mock('UI/Components/InputBox/InputBox.js', () => ({ default: { append() {}, remove() {}, setType() {} } }));
vi.mock('UI/Components/CartItems/CartItems.js', () => ({
	default: { list: [{ ITID: 512, index: 0, type: 0, count: 1, IsIdentified: true }] }
}));
vi.mock('UI/Components/Inventory/Inventory.js', () => ({ default: {} }));
vi.mock('UI/Components/BasicInfo/BasicInfo.js', () => ({ default: {} }));
vi.mock('UI/Components/Vending/VendingModelMessage/VendingModelMessage.js', () => ({
	default: { onRemove() {}, setInit() {} }
}));

const Vending = (await import('UI/Components/Vending/Vending.js')).default;
const Network = (await import('Network/NetworkManager.js')).default;
const PACKET = (await import('Network/PacketStructure.js')).default;

afterEach(() => {
	Vending.remove();
	vi.restoreAllMocks();
});

it('sends one setup cancellation for Escape or Cancel while owner cleanup stays local', () => {
	const send = vi.spyOn(Network, 'sendPacket');
	const open = buying => {
		Vending.append();
		Vending.setType(buying ? Vending.Type.BUYING_STORE : Vending.Type.VENDING_STORE);
		Vending.onVendingSkill({ itemcount: 2 });
	};
	for (const [buying, editable, button] of [[false, false, false], [true, true, false], [true, false, true]]) {
		open(buying);
		send.mockClear();
		if (editable) {
			Vending.getRoot().querySelector('.shopname').focus();
			expect(Vending.isEditableFocused()).toBe(true);
		}
		const fallback = vi.fn();
		window.addEventListener('keydown', fallback);
		if (button) {
			Vending.getRoot().querySelector('.btn.cancel').click();
		} else {
			const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
			Vending._host.dispatchEvent(event);
			expect(event.defaultPrevented).toBe(true);
			expect(fallback).not.toHaveBeenCalled();
		}
		window.removeEventListener('keydown', fallback);
		expect(send).toHaveBeenCalledTimes(1);
		const packet = send.mock.calls[0][0];
		expect(packet).toBeInstanceOf(buying ? PACKET.CZ.REQ_OPEN_BUYING_STORE : PACKET.CZ.REQ_OPENSTORE2);
		expect(packet.result).toBe(0);
		expect(packet.storeList).toEqual([]);
		expect(Vending.isOpen).toBe(false);
		expect(Vending._host.style.display).toBe('none');
		Vending.onRemove();
		expect(send).toHaveBeenCalledTimes(1);
	}
	for (const close of [() => Vending.onClose(), () => Vending.onRemove(), () => Vending.remove()]) {
		open(false);
		send.mockClear();
		close();
		expect(send).not.toHaveBeenCalled();
		expect(Vending.isOpen).toBe(false);
	}
});
