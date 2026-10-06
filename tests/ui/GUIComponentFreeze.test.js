/**
 * tests/ui/GUIComponentFreeze.test.js
 *
 * FREEZE-mode windows keep the map from taking clicks while they are open.
 * A shop (NpcStore) asks for an amount in an InputBox, and both freeze: when
 * the InputBox closed it handed the map its clicks back while the shop was
 * still open, so pressing Buy also walked the character to where Buy was
 * pressed. The map is unfrozen only when the last frozen window closes.
 *
 * Its own file because GUIComponent.test.js does not load in this test
 * environment (no localStorage); this one provides it first.
 */
import { describe, expect, it, vi } from 'vitest';

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

let seq = 0;
function frozen() {
	const component = new GUIComponent(`FrozenWindow${++seq}`, '');
	component.render = () => '<div></div>';
	component.mouseMode = GUIComponent.MouseMode.FREEZE;
	return component;
}

describe('FREEZE windows', () => {
	it('keep the map frozen until the last one closes', () => {
		Mouse.intersect = true;
		Session.FreezeUI = false;
		const shop = frozen();
		const amount = frozen();

		shop.append();
		expect(Mouse.intersect).toBe(false);
		expect(Session.FreezeUI).toBe(true);

		amount.append(); // the InputBox over the shop
		amount.remove();
		expect(Mouse.intersect).toBe(false);
		expect(Session.FreezeUI).toBe(true);

		shop.remove();
		expect(Mouse.intersect).toBe(true);
		expect(Session.FreezeUI).toBe(false);
	});

	it('unfreezes when the outer window closes first, too', () => {
		const shop = frozen();
		const amount = frozen();
		shop.append();
		amount.append();
		shop.remove();
		expect(Session.FreezeUI).toBe(true);
		amount.remove();
		expect(Session.FreezeUI).toBe(false);
		expect(Mouse.intersect).toBe(true);
	});
});
