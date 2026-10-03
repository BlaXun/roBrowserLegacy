import { beforeEach, describe, expect, it, vi } from 'vitest';

// A mail's type is a set of flags: zeny 0x2, item 0x4, sent by an NPC or the
// server 0x8 (rAthena enum mail_type). Achievement rewards are mailed by the
// server, so they arrive as 12, item + NPC.
vi.mock('DB/DBManager.js', () => ({ default: { getMessage: id => `msg ${id}` } }));
vi.mock('Core/Client.js', () => ({ default: { loadFile: vi.fn() } }));
vi.mock('Core/Preferences.js', () => ({ default: { get: () => ({ x: 0, y: 0, show: false, save: vi.fn() }) } }));
vi.mock('Renderer/Renderer.js', () => ({ default: { width: 1200, height: 800 } }));
vi.mock('UI/Components/ChatBox/ChatBox.js', () => ({
	default: { addText: vi.fn(), TYPE: { INFO_MAIL: 1 }, FILTER: { PUBLIC_LOG: 1 } }
}));
vi.mock('UI/UIManager.js', () => ({ default: { addComponent: c => c } }));
vi.mock('UI/GUIComponent.js', () => ({
	default: class {
		constructor(name) {
			this.name = name;
		}
	}
}));

const Rodex = (await import('UI/Components/Rodex/Rodex.js')).default;

function mail(MailID, type) {
	return { MailID, type, openType: 0 };
}

describe('Rodex mail types', () => {
	beforeEach(() => {
		Rodex.requestItemsFromRodex = vi.fn();
		Rodex.requestZenyFromRodex = vi.fn();
		Rodex.requestDeleteRodex = vi.fn();
	});

	it('claims every attachment, including mail sent by the server', () => {
		Rodex.list = [mail(1, 0), mail(2, 2), mail(3, 4), mail(4, 6), mail(5, 8), mail(6, 12), mail(7, 14)];
		Rodex.getAll();

		expect(Rodex.requestItemsFromRodex.mock.calls.map(c => c[1])).toEqual([3, 4, 6, 7]);
		expect(Rodex.requestZenyFromRodex.mock.calls.map(c => c[1])).toEqual([2, 4, 7]);
	});

	it('deletes letters with nothing attached, including ones sent by the server', () => {
		Rodex.list = [mail(1, 0), mail(2, 8), mail(3, 12), mail(4, 2)];
		Rodex.deleteAll();

		expect(Rodex.requestDeleteRodex.mock.calls.map(c => c[1])).toEqual([1, 2]);
	});

	it('shows the icon for what a mail holds, whoever sent it', () => {
		expect(Rodex.getAttachmentIcon(0)).toBe('');
		expect(Rodex.getAttachmentIcon(8)).toBe('');
		expect(Rodex.getAttachmentIcon(12)).toMatch(/icon_item\.bmp$/);
		expect(Rodex.getAttachmentIcon(10)).toMatch(/icon_zeny\.bmp$/);
		expect(Rodex.getAttachmentIcon(14)).toMatch(/icon_zeny_n_item\.bmp$/);
	});
});
