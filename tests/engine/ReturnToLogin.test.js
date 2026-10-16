import { beforeEach, describe, expect, it, vi } from 'vitest';

// Returning to the login screen after a ban or a reload: the old map must be
// gone before the login dialog shows, and a map still loading must not come
// back. onServerClosed is module-private and only reachable through the hook
// init() registers, so the Network mock keeps the packet name -> handler map.
const mocks = vi.hoisted(() => {
	const calls = [];
	const record = name => vi.fn(() => calls.push(name));

	return {
		calls,
		hooks: {},
		box: null,
		renderer: { width: 1200, height: 800, stop: record('Renderer.stop') },
		mapRenderer: { cancelLoad: record('MapRenderer.cancelLoad'), free: record('MapRenderer.free') },
		background: {
			setLoginBackground: record('Background.setLoginBackground'),
			init: vi.fn(),
			resize: vi.fn(),
			setPercent: vi.fn(),
			setImage: record('Background.setImage')
		},
		bgm: { play: vi.fn(), setAvailableExtensions: vi.fn() },
		winLogin: { append: record('WinLogin.append') },
		skillTarget: { remove: vi.fn() },
		uiManager: {
			removeComponents: record('UIManager.removeComponents'),
			showErrorBox: vi.fn(),
			showMessageBox: vi.fn(),
			addComponent: vi.fn()
		}
	};
});

const packet = name => ({ name });

vi.mock('Network/NetworkManager.js', () => ({
	default: {
		hookPacket: (struct, fn) => {
			mocks.hooks[struct.name] = fn;
		},
		close: vi.fn()
	}
}));
vi.mock('Network/PacketStructure.js', () => ({
	default: new Proxy(
		{},
		{ get: (_t, group) => new Proxy({}, { get: (_g, name) => packet(group + '.' + name) }) }
	)
}));
vi.mock('Network/PacketVerManager.js', () => ({ default: { value: 20180704 } }));
vi.mock('DB/DBManager.js', () => ({ default: { getMessage: id => 'MSG ' + id } }));
vi.mock('Core/Configs.js', () => ({ default: { setServer: vi.fn(), get: (_k, d) => d, set: vi.fn() } }));
vi.mock('Core/Thread.js', () => ({ default: { send: vi.fn() } }));
vi.mock('Utils/CodepageManager.js', () => ({ default: { detectEncodingByLangtype: vi.fn() } }));
vi.mock('Audio/BGM.js', () => ({ default: mocks.bgm }));
vi.mock('Audio/SoundManager.js', () => ({ default: { play: vi.fn() } }));
vi.mock('Engine/SessionStorage.js', () => ({ default: {} }));
vi.mock('Engine/CharEngine.js', () => ({ default: { init: vi.fn() } }));
vi.mock('Plugins/PluginManager.js', () => ({ default: { init: vi.fn() } }));
vi.mock('Renderer/Renderer.js', () => ({ default: mocks.renderer }));
vi.mock('Renderer/MapRenderer.js', () => ({ default: mocks.mapRenderer }));
vi.mock('UI/UIManager.js', () => ({ default: mocks.uiManager }));
vi.mock('UI/Background.js', () => ({ default: mocks.background }));
vi.mock('UI/Components/WinList/WinList.js', () => ({ default: {} }));
vi.mock('UI/Components/WinPopup/WinPopup.js', () => ({ default: { clone: () => ({}) } }));
vi.mock('UI/Components/WinLogin/WinLogin.js', () => ({
	default: Object.assign(mocks.winLogin, {
		selectUIVersion: vi.fn(),
		selectUIVersionForData: callback => callback()
	})
}));
vi.mock('UI/Components/SkillTargetSelection/SkillTargetSelection.js', () => ({ default: mocks.skillTarget }));
vi.mock('Vendors/spark-md5.min.js', () => ({ default: {} }));
vi.mock('Utils/Rijndael.js', () => ({ default: {} }));

vi.mock('Core/Client.js', () => ({ default: {} }));
vi.mock('UI/CursorManager.js', () => ({ default: {} }));
vi.mock('UI/Scrollbar.js', () => ({ default: {} }));
vi.mock('UI/Components/Intro/Intro.js', () => ({ default: {} }));
vi.mock('Utils/ConsoleManager.js', () => ({ default: {} }));
vi.mock('App/PreLoader.js', () => ({ roInitSpinner: {} }));

import LoginEngine from 'Engine/LoginEngine.js';
import GameEngine from 'Engine/GameEngine.js';

describe('returning to the login screen', () => {
	beforeEach(() => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		LoginEngine.init({ address: '127.0.0.1', port: 6900 });
		mocks.calls.length = 0;
		mocks.uiManager.showMessageBox.mockClear();
	});

	it('shows the login dialog only once the login background covers the map', () => {
		mocks.hooks['SC.NOTIFY_BAN']({ ErrorCode: 2 });
		const [, , onAcknowledge] = mocks.uiManager.showMessageBox.mock.calls[0];
		onAcknowledge();

		expect(mocks.calls).not.toContain('WinLogin.append');
		const [showLogin] = mocks.background.setLoginBackground.mock.calls.at(-1);
		showLogin();
		expect(mocks.calls.at(-1)).toBe('WinLogin.append');
	});

	it('cancels a map load before the reload fades out', () => {
		GameEngine.reload();

		expect(mocks.calls.slice(0, 3)).toEqual([
			'MapRenderer.cancelLoad',
			'UIManager.removeComponents',
			'Background.setImage'
		]);
	});
});
