import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	class MockGUIComponent {
		constructor(name) {
			this.name = name;
			this.magnet = {};
			this._host = document.createElement('div');
			this.ui = { show: () => { this._host.style.display = ''; }, hide: () => { this._host.style.display = 'none'; }, is: () => this._host.style.display !== 'none' };
		}

		getRoot() {
			return this._host;
		}

		append() {
			if (!this.__loaded) {
				this._host.innerHTML = this.render();
				this.init?.();
				this.__loaded = true;
			}
			document.body.appendChild(this._host);
		}

		draggable() {}

		focus() {}

		parseHTML() {}
	}
	MockGUIComponent.MouseMode = { CROSS: 'cross', DEFAULT: 'default' };

	return { MockGUIComponent };
});

vi.mock('DB/DBManager.js', () => ({
	default: {
		INTERFACE_PATH: '',
		getMessage: (id, defaultText) => (defaultText !== undefined ? defaultText : `NO MSG ${id}`)
	}
}));
vi.mock('Renderer/Renderer.js', () => ({
	default: { width: 1200, height: 800, tick: 0, render: vi.fn(), stop: vi.fn() }
}));
vi.mock('Renderer/EntityManager.js', () => ({ default: { get: vi.fn(), getOverEntity: vi.fn() } }));
vi.mock('Core/Client.js', () => ({
	default: {
		loadFile(_path, callback) {
			callback?.('');
		},
		loadFiles(_paths, callback) {
			callback?.('');
		}
	}
}));
vi.mock('Core/Events.js', () => ({ default: { setTimeout: vi.fn(), clearTimeout: vi.fn() } }));
vi.mock('Core/Preferences.js', () => ({
	default: {
		get: (_name, defaults) => ({ ...defaults, save: vi.fn() })
	}
}));
vi.mock('Core/Configs.js', () => ({ default: { get: vi.fn() } }));
vi.mock('Controls/MouseEventHandler.js', () => ({ default: { screen: { x: 0, y: 0 } } }));
vi.mock('Controls/BattleMode.js', () => ({ default: { process: vi.fn(() => false) } }));
vi.mock('Controls/ProcessCommand.js', () => ({ default: { add: vi.fn(), processCommand: vi.fn() } }));
vi.mock('UI/CursorManager.js', () => ({ default: { setType: vi.fn(), ACTION: {} } }));
vi.mock('UI/GUIComponent.js', () => ({ default: mocks.MockGUIComponent }));
vi.mock('UI/UIManager.js', () => ({ default: { addComponent: c => c, showMessageBox: vi.fn() } }));
vi.mock('UI/Elements/Elements.js', () => ({}));
vi.mock('UI/Components/ContextMenu/ContextMenu.js', () => ({
	default: { __loaded: true, remove: vi.fn(), append: vi.fn(), addElement: vi.fn() }
}));
vi.mock('Utils/Texture.js', () => ({ default: {} }));

const Client = (await import('Core/Client.js')).default;
const ChatBox = (await import('UI/Components/ChatBox/ChatBox.js')).default;
const ChatBoxSettings = (await import('UI/Components/ChatBoxSettings/ChatBoxSettings.js')).default;
const ScrollBar = (await import('UI/Scrollbar.js')).default;

let frames;
let root;
function flush() {
	const scheduled = frames.splice(0);
	scheduled.forEach(callback => callback());
}
function log(id) {
	return root.querySelector(`.content[data-content="${id}"]`);
}

beforeEach(() => {
	vi.useFakeTimers();
	document.body.innerHTML = '';
	root = document.createElement('div');
	root.innerHTML = ChatBox.render();
	document.body.appendChild(root);
	ChatBox._host = root;
	ChatBox._shadow = null;
	ChatBox.tabs = [];
	ChatBoxSettings.tabOption = [];
	ChatBoxSettings._host = document.createElement('div');
	ChatBoxSettings.__loaded = false;
	ChatBoxSettings.activeTab = null;
	ChatBoxSettings.append();
	ChatBoxSettings._host.style.display = 'none';
	frames = [];
	vi.stubGlobal('requestAnimationFrame', callback => frames.push(callback));
	vi.stubGlobal('cancelAnimationFrame', vi.fn());
	window.URL.createObjectURL = vi.fn(() => 'blob:chat-export');
	window.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
	ChatBox.clean();
	document.body.innerHTML = '';
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('chat logs and export resources', () => {
	it('keeps an export alive until its last displayed copy is removed, without trimming the scrollbar', () => {
		const first = ChatBox.addNewTab('First', [ChatBox.FILTER.PUBLIC_LOG]);
		const second = ChatBox.addNewTab('Second', [ChatBox.FILTER.PUBLIC_LOG]);
		ChatBox.saveCurrentTabChat();
		flush();
		const scrollbar = document.createElement('div');
		scrollbar.className = 'ro-custom-scrollbar';
		log(first).appendChild(scrollbar);
		ChatBoxSettings.tabOption[second] = [];
		for (let i = 0; i < 400; i++) ChatBox.addText(`message ${i}`, ChatBox.TYPE.PUBLIC);
		flush();

		expect(window.URL.revokeObjectURL).not.toHaveBeenCalled();
		expect(log(second).querySelector('a').href).toBe('blob:chat-export');
		expect(log(first).contains(scrollbar)).toBe(true);
		ChatBox.removeTab();
		expect(window.URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:chat-export');
		ChatBox.clean();
		expect(log(first).contains(scrollbar)).toBe(true);
		expect(log(first).textContent).toBe('');
	});

	it('releases a queued export on cleanup and prevents an old frame from delivering a new session queue', () => {
		ChatBox.addNewTab('First', [ChatBox.FILTER.PUBLIC_LOG]);
		ChatBox.saveCurrentTabChat();
		const oldFrame = frames.shift();
		ChatBox.clean();
		expect(window.URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:chat-export');
		ChatBox.addText('new session', ChatBox.TYPE.PUBLIC);
		oldFrame();
		expect(log(ChatBox.activeTab).textContent).toBe('');
		flush();
		expect(log(ChatBox.activeTab).textContent).toBe('new session');
	});

	it('installs scrollbar CSS in the receiving shadow root while keeping the existing scrollbar', () => {
		const source = document.createElement('div').attachShadow({mode: 'open'});
		const target = document.createElement('div').attachShadow({mode: 'open'});
		const content = document.createElement('div');
		source.appendChild(content);
		ScrollBar.complete = false;
		ScrollBar._cssText = undefined;
		ScrollBar.applyDOMScrollbar(content);
		ScrollBar._cssText = '.ro-custom-scrollbar { position: absolute; }';
		ScrollBar.skins.default = { name: 'default', colors: {}, up: '', down: '', width: 13 };
		ScrollBar.complete = true;
		vi.advanceTimersByTime(100);
		expect(source.querySelector('style[data-scrollbar]').textContent).toContain('.ro-custom-scrollbar');
		const original = content.querySelector('.ro-custom-scrollbar');
		target.appendChild(content);
		ScrollBar.applyDOMScrollbar(content);
		expect(target.querySelector('style[data-scrollbar]').textContent).toContain('.ro-custom-scrollbar');
		expect(content.querySelectorAll('.ro-custom-scrollbar')).toHaveLength(1);
		expect(content.querySelector('.ro-custom-scrollbar')).toBe(original);
	});
});


describe('tab identity, captions and settings', () => {
	it('copies settings independently and enforces the total/last-docked boundaries without reusing IDs', () => {
		const filters = [ChatBox.FILTER.PUBLIC_LOG];
		const first = ChatBox.addNewTab('First', filters);
		const second = ChatBox.addNewTab('Second', filters);
		filters.push(ChatBox.FILTER.PARTY);
		expect(ChatBoxSettings.tabOption[first]).toEqual([ChatBox.FILTER.PUBLIC_LOG]);
		ChatBoxSettings.tabOption[second].push(ChatBox.FILTER.GUILD);
		expect(ChatBoxSettings.tabOption[first]).toEqual([ChatBox.FILTER.PUBLIC_LOG]);
		ChatBox.removeTab();
		const replacement = ChatBox.addNewTab();
		expect(replacement).toBeGreaterThan(second);
		expect(ChatBox.tabs[replacement].name).toMatch(/^New Tab \d+$/);
		for (let i = 0; i < 8; i++) ChatBox.addNewTab();
		expect(ChatBox.tabCount).toBe(10);
		expect(ChatBox.addNewTab()).toBeNull();
		expect(ChatBox.tabCount).toBe(10);
		while (ChatBox.tabCount > 1) ChatBox.removeTab();
		expect(ChatBox.removeTab()).toBe(false);
		expect(ChatBox.tabs[first].name).toBe('First');
	});

	it('selects with one click and renames literal captions only on double-click, supporting commit and cancel', () => {
		ChatBox.init();
		ChatBox.onAppend();
		ChatBox.setLocked(false);
		const input = root.querySelector('.header input');
		input.click();
		expect(input.type).toBe('button');
		input.dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
		expect(input.type).toBe('text');
		const name = 'A "quoted" <b>literal</b> name';
		input.value = name;
		input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
		expect(input.type).toBe('button');
		expect(ChatBox.tabs[Number(input.closest('[data-tab]').dataset.tab)].name).toBe(name);
		expect(input.parentNode.querySelector('b')).toBeNull();
		input.dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
		input.value = 'discard me';
		input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
		expect(input.value).toBe(name);
		ChatBox.saveCurrentTabChat();
		flush();
		expect(log(ChatBox.activeTab).querySelector('a').download).toContain(name);
		ChatBox.removeTab(1);
		const originalRect = HTMLElement.prototype.getBoundingClientRect;
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
			if (this.tagName === 'SPAN' && this.style.width === 'max-content') return { width: root.style.display === 'none' ? 0 : this.textContent.length * 7 };
			return originalRect.call(this);
		});
		const box = root.querySelector('#chatbox');
		box.style.width = '200px';
		root.style.display = 'none';
		input.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		input.value = 'A very long caption '.repeat(20);
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		expect(input.closest('td').style.width).toBe('97px');
		expect(root.style.display).toBe('none');
		box.style.width = '600px';
		ChatBox.onAppend();
		expect(input.closest('td').style.width).toBe('497px');
	});

	it('keeps settings on their chosen tab across selection changes and closes them before deleting that target', () => {
		ChatBox.init();
		ChatBox.onAppend();
		ChatBox.setLocked(false);
		ChatBox.switchTab(0);
		const pending = [];
		vi.spyOn(Client, 'loadFile').mockImplementation((path, callback) => pending.push({path, callback}));
		root.querySelector('.battleopt').click();
		const initial = pending.splice(0);
		expect(ChatBoxSettings.activeTab).toBe(0);
		ChatBox.switchTab(1);
		const before = [...ChatBoxSettings.tabOption[1]];
		const button = ChatBoxSettings.getRoot().querySelector('.listoption button[data-id="15"]');
		button.click();
		expect(ChatBoxSettings.tabOption[0]).toContain(15);
		expect(ChatBoxSettings.tabOption[1]).toEqual(before);
		pending.pop().callback('enabled');
		initial.forEach(request => request.callback('stale-initial'));
		expect(button.style.backgroundImage).toContain('enabled');
		button.click();
		const oldToggle = pending.pop();
		root.querySelector('.battleopt').click();
		pending.splice(0).forEach(request => request.callback('current-target'));
		oldToggle.callback('stale-target');
		expect(button.style.backgroundImage).toContain('current-target');
		ChatBox.openTabSettings(0);
		const filters = ChatBoxSettings.tabOption[0];
		const otherFilters = [...ChatBoxSettings.tabOption[1]];
		const all = ChatBoxSettings.getRoot().querySelector('.all-on input');
		const label = ChatBoxSettings.getRoot().querySelector('.all-on span');
		expect(all).not.toBeNull();
		expect(all.checked).toBe(false);
		label.click();
		expect(all.checked).toBe(true);
		expect(ChatBoxSettings.tabOption[0]).toBe(filters);
		expect(filters).toEqual(Object.values(ChatBox.FILTER));
		button.click();
		expect(all.checked).toBe(false);
		label.click();
		expect(all.checked).toBe(true);
		all.click();
		expect(filters).toEqual([]);
		expect(ChatBoxSettings.tabOption[1]).toEqual(otherFilters);
		ChatBox.removeTab(0);
		expect(ChatBoxSettings._host.style.display).toBe('none');
		expect(ChatBoxSettings.activeTab).toBeNull();
		expect(ChatBox.activeTab).toBe(1);
	});
});
