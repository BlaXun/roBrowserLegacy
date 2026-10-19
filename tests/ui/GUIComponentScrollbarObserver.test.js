/**
 * tests/ui/GUIComponentScrollbarObserver.test.js
 *
 * Appending a window that is already open must not leave another
 * MutationObserver behind. The NPC dialog appends itself on every line the
 * server sends, and each append used to start an observer that nothing
 * disconnected, so the box gathered thousands of them over a long session and
 * every page of every NPC dialog ran all of them.
 *
 * Its own file because GUIComponent.test.js does not load in this test
 * environment (no localStorage); this one provides it first.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map();
vi.stubGlobal('localStorage', {
	getItem: key => (store.has(key) ? store.get(key) : null),
	setItem: (key, value) => store.set(key, String(value)),
	removeItem: key => store.delete(key)
});

// Counts the observers that are watching a window. The one GUIComponent keeps
// on document.body for the whole session (the native cursor) is not counted.
const live = new Set();
class CountingObserver {
	constructor(callback) {
		this._inner = new globalThis.__RealMutationObserver(callback);
	}
	observe(target, options) {
		if (target !== document.body) {
			live.add(this);
		}
		this._inner.observe(target, options);
	}
	disconnect() {
		live.delete(this);
		this._inner.disconnect();
	}
	takeRecords() {
		return this._inner.takeRecords();
	}
}
globalThis.__RealMutationObserver = globalThis.MutationObserver;
vi.stubGlobal('MutationObserver', CountingObserver);

vi.mock('UI/CursorManager.js', () => ({ default: { ACTION: { DEFAULT: 0 }, getActualType: () => 0, setType() {} } }));
vi.mock('DB/DBManager.js', () => ({ default: { INTERFACE_PATH: '' } }));
vi.mock('Core/Client.js', () => ({
	default: {
		loadFile(_path, callback) {
			callback?.('');
		},
		loadFiles(_paths, callback) {
			callback?.('', '');
		}
	}
}));
vi.mock('Renderer/Renderer.js', () => ({ default: { width: 1200, height: 800 } }));
vi.mock('Renderer/EntityManager.js', () => ({ default: { setOverEntity() {} } }));
vi.mock('UI/Scrollbar.js', () => ({ default: {} }));

const GUIComponent = (await import('UI/GUIComponent.js')).default;

let seq = 0;
function window_() {
	const component = new GUIComponent(`ScrollbarWindow${++seq}`, '');
	component.render = () => '<div class="content"></div>';
	return component;
}

describe('scrollbar observer', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		live.clear();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('keeps one observer however often an open window is appended', () => {
		const box = window_();
		for (let i = 0; i < 20; i++) {
			box.append();
			vi.runAllTimers();
		}
		expect(live.size).toBe(1);
	});

	it('keeps one observer when appends land in the same tick', () => {
		const box = window_();
		box.append();
		box.append();
		box.append();
		vi.runAllTimers();
		expect(live.size).toBe(1);
	});

	it('leaves none once the window is removed', () => {
		const box = window_();
		box.append();
		vi.runAllTimers();
		box.append();
		vi.runAllTimers();
		box.remove();
		expect(live.size).toBe(0);
	});

	it('starts none for a window removed before its check ran', () => {
		const box = window_();
		box.append();
		box.remove();
		vi.runAllTimers();
		expect(live.size).toBe(0);
	});
});
