import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The 2018 login window is drawn on login_interface/bg_login.tga, which only
 * Korean client data has. Without it the window is bare inputs, so the
 * controller falls back to the classic window, whose art international clients
 * do ship.
 */

const files = { missing: new Set(), requested: [] };

vi.mock('Core/Client.js', () => ({
	default: {
		loadFile: (name, onload, onerror) => {
			files.requested.push(name);
			if (files.missing.has(name)) {
				onerror?.();
			} else {
				onload?.('data:');
			}
		}
	}
}));
vi.mock('DB/DBManager.js', () => ({ default: { INTERFACE_PATH: 'data/texture/ui/' } }));
vi.mock('Core/Configs.js', () => ({ default: { get: () => true } }));
vi.mock('Network/PacketVerManager.js', () => ({ default: { value: 20221005 } }));
vi.mock('UI/Components/WinLogin/WinLogin/WinLogin.js', () => ({ default: { name: 'WinLogin' } }));
vi.mock('UI/Components/WinLogin/WinLoginV2/WinLoginV2.js', () => ({ default: { name: 'WinLoginV2' } }));
vi.mock('UI/Components/WinLogin/WinLoginV3/WinLoginV3.js', () => ({ default: { name: 'WinLoginV3' } }));

const BACKGROUND = 'data/texture/ui/login_interface/bg_login.tga';

async function freshController() {
	vi.resetModules();
	return (await import('UI/Components/WinLogin/WinLogin.js')).default;
}

describe('WinLogin.selectUIVersionForData', () => {
	beforeEach(() => {
		files.missing.clear();
		files.requested.length = 0;
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	it('keeps the newer window when its background is in the client data', async () => {
		const WinLogin = await freshController();
		WinLogin.selectUIVersion();
		const done = vi.fn();
		WinLogin.selectUIVersionForData(done);
		expect(done).toHaveBeenCalledOnce();
		expect(WinLogin.getUI().name).toBe('WinLoginV2');
		expect(files.requested).toEqual([BACKGROUND]);
	});

	it('falls back to the classic window when the background is missing', async () => {
		files.missing.add(BACKGROUND);
		const WinLogin = await freshController();
		WinLogin.selectUIVersion();
		const done = vi.fn();
		WinLogin.selectUIVersionForData(done);
		expect(done).toHaveBeenCalledOnce();
		expect(WinLogin.getUI().name).toBe('WinLogin');
	});

	it('remembers the answer when the login screen is set up again', async () => {
		files.missing.add(BACKGROUND);
		const WinLogin = await freshController();
		WinLogin.selectUIVersion();
		WinLogin.selectUIVersionForData(() => {});
		WinLogin.selectUIVersion();
		expect(WinLogin.getUI().name).toBe('WinLoginV2');
		const done = vi.fn();
		WinLogin.selectUIVersionForData(done);
		expect(done).toHaveBeenCalledOnce();
		expect(WinLogin.getUI().name).toBe('WinLogin');
		expect(files.requested).toEqual([BACKGROUND]);
	});
});
