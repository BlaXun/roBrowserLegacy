import { beforeEach, describe, expect, it, vi } from 'vitest';

// Claim All claims mail that is not open. Its answers must neither throw when
// no mail has been opened, which dropped the mailbox list rAthena sends right
// after each one, nor empty a different mail that is open.
const mocks = vi.hoisted(() => ({ hooks: new Map() }));

vi.mock('Network/NetworkManager.js', () => ({
	default: { hookPacket: (struct, fn) => mocks.hooks.set(struct, fn), sendPacket: vi.fn() }
}));
vi.mock('DB/DBManager.js', () => ({ default: { getMessage: id => `msg ${id}` } }));
vi.mock('UI/Components/ChatBox/ChatBox.js', () => ({
	default: { addText: vi.fn(), TYPE: { INFO_MAIL: 1 }, FILTER: { PUBLIC_LOG: 1 } }
}));
vi.mock('Core/Client.js', () => ({ default: { loadFile: vi.fn() } }));
vi.mock('Core/Preferences.js', () => ({ default: { get: () => ({ x: 0, y: 0, show: false, save: vi.fn() }) } }));
vi.mock('Renderer/Renderer.js', () => ({ default: { width: 1200, height: 800 } }));
vi.mock('UI/UIManager.js', () => ({ default: { addComponent: c => c } }));
// Never appended: no host, no shadow root, as before the first mail is opened
vi.mock('UI/GUIComponent.js', () => ({
	default: class {
		constructor(name) {
			this.name = name;
			this._host = null;
			this._shadow = null;
		}
	}
}));
vi.mock('UI/Components/Rodex/Rodex.js', () => ({ default: {} }));
vi.mock('UI/Components/Rodex/RodexIcon.js', () => ({ default: {} }));
vi.mock('UI/Components/Rodex/WriteRodex.js', () => ({ default: {} }));

const RodexEngine = (await import('Engine/MapEngine/Rodex.js')).default;
const ReadRodex = (await import('UI/Components/Rodex/ReadRodex.js')).default;
const PACKET = (await import('Network/PacketStructure.js')).default;

describe('Rodex claim answers', () => {
	beforeEach(() => {
		mocks.hooks.clear();
		RodexEngine();
		ReadRodex.MailID = 0;
	});

	it('do not throw when no mail has been opened', () => {
		expect(() => mocks.hooks.get(PACKET.ZC.ACK_ITEM_FROM_RODEX)({ MailID: 7, result: 0 })).not.toThrow();
		expect(() => mocks.hooks.get(PACKET.ZC.ACK_ZENY_FROM_RODEX)({ MailID: 7, result: 0 })).not.toThrow();
	});

	it('empty the open mail only when it is the one claimed', () => {
		const clearItemList = vi.spyOn(ReadRodex, 'clearItemList');
		const clearZeny = vi.spyOn(ReadRodex, 'clearZeny');
		ReadRodex.MailID = 7;

		mocks.hooks.get(PACKET.ZC.ACK_ITEM_FROM_RODEX)({ MailID: 8, result: 0 });
		mocks.hooks.get(PACKET.ZC.ACK_ZENY_FROM_RODEX)({ MailID: 8, result: 0 });
		expect(clearItemList).not.toHaveBeenCalled();
		expect(clearZeny).not.toHaveBeenCalled();

		mocks.hooks.get(PACKET.ZC.ACK_ITEM_FROM_RODEX)({ MailID: 7, result: 0 });
		mocks.hooks.get(PACKET.ZC.ACK_ZENY_FROM_RODEX)({ MailID: 7, result: 0 });
		expect(clearItemList).toHaveBeenCalledTimes(1);
		expect(clearZeny).toHaveBeenCalledTimes(1);
	});
});
