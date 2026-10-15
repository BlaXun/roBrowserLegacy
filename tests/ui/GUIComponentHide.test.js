/**
 * tests/ui/GUIComponentHide.test.js
 *
 * A window hidden while the pointer is over it must give the map its clicks
 * back. Hiding is display:none, which fires no mouseleave, so the window's
 * STOP-mode guard kept Mouse.intersect off and the character would not move
 * until the window was opened and closed again with the pointer outside it
 * (the skill window's close button and its hotkey both hide it this way).
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
const Mouse = (await import('Controls/MouseEventHandler.js')).default;
const Session = (await import('Engine/SessionStorage.js')).default;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {vi.clearAllTimers();vi.useRealTimers();});

let seq = 0;
function window_() {
	const component = new GUIComponent(`HideWindow${++seq}`, '');
	component.render = () => '<div><button>Action</button></div>';
	component.append();
	return component;
}

describe('hiding a window under the pointer', () => {
	it('hands the map its clicks back', () => {
		Mouse.intersect = true;
		Session.FreezeUI = false;
		const skills = window_();

		const mapPress=vi.fn();
		window.addEventListener('mousedown',mapPress);
		try {
			skills.getRoot().querySelector('button').dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true,composed:true}));
			expect(mapPress).not.toHaveBeenCalled();
		} finally {window.removeEventListener('mousedown',mapPress);}

		skills._host.dispatchEvent(new Event('mouseenter'));
		expect(Mouse.intersect).toBe(false);

		skills.ui.hide(); // no mouseleave follows a display:none
		expect(Mouse.intersect).toBe(true);
	});

	it('does the same when toggled away', () => {
		Mouse.intersect = true;
		const skills = window_();
		skills._host.dispatchEvent(new Event('mouseenter'));
		skills.ui.toggle();
		expect(Mouse.intersect).toBe(true);
	});

	it('leaves the map alone when the pointer was never over it', () => {
		Mouse.intersect = false; // something else owns it
		const skills = window_();
		skills.ui.hide();
		expect(Mouse.intersect).toBe(false);
	});

	it('still blocks the map while the window is shown and hovered', () => {
		Mouse.intersect = true;
		const skills = window_();
		skills._host.dispatchEvent(new Event('mouseenter'));
		expect(Mouse.intersect).toBe(false);
	});
});
