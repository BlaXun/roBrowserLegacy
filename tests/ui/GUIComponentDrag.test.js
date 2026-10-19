/**
 * tests/ui/GUIComponentDrag.test.js
 *
 * Dragging an item out of a window must not leave the map without clicks. A
 * browser fires no mouseleave while a drag is under way, so the inventory's
 * STOP-mode guard stayed entered after an item was dragged into the trade
 * window, and when the trade closed the character would not move until the
 * pointer passed over the inventory again.
 *
 * Its own file for the same reason as GUIComponentHide.test.js.
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
function window_(hovered) {
	const component = new GUIComponent(`DragWindow${++seq}`, '');
	component.render = () => '<div></div>';
	component.append();
	// jsdom has no pointer, so no :hover; each window says whether it has it.
	const host = component._host;
	const matches = host.matches.bind(host);
	host.matches = selector => (selector === ':hover' ? hovered() : matches(selector));
	return component;
}

const drag = () => window.dispatchEvent(new Event('dragstart'));
const move = () => window.dispatchEvent(new Event('mousemove'));

describe('a drag out of a window', () => {
	it('gives the map its clicks back once the trade closes', () => {
		Mouse.intersect = true;
		Session.FreezeUI = false;
		let over = 'inventory';
		const inventory = window_(() => over === 'inventory');
		const trade = window_(() => over === 'trade');

		inventory._host.dispatchEvent(new Event('mouseenter'));
		drag(); // the item is dragged out: no mouseleave for the inventory
		over = 'trade';
		trade._host.dispatchEvent(new Event('mouseenter'));
		move(); // the first move after the drag
		trade.remove();

		expect(Mouse.intersect).toBe(true);
	});

	it('keeps blocking the map for a window the pointer is still over', () => {
		Mouse.intersect = true;
		const inventory = window_(() => true);
		inventory._host.dispatchEvent(new Event('mouseenter'));
		drag();
		move();
		expect(Mouse.intersect).toBe(false);
		inventory._host.dispatchEvent(new Event('mouseleave'));
		expect(Mouse.intersect).toBe(true);
	});

	it('leaves the guards alone when there was no drag', () => {
		Mouse.intersect = true;
		const inventory = window_(() => false);
		inventory._host.dispatchEvent(new Event('mouseenter'));
		move();
		expect(Mouse.intersect).toBe(false);
		inventory._host.dispatchEvent(new Event('mouseleave'));
	});
});


it('honors an opt-in drag guard while an ordinary window still moves', () => {
	const frames=[];
	vi.stubGlobal('requestAnimationFrame', callback=>frames.push(callback));
	vi.stubGlobal('cancelAnimationFrame',()=>{});
	const box=window_(()=>false);
	box._host.style.left='100px';
	box.draggable();
	box.canStartDrag=()=>false;
	const start=new MouseEvent('mousedown',{button:0,bubbles:true});
	Object.defineProperty(start,'which',{value:1});
	Mouse.screen.x=100;Mouse.screen.y=100;
	box._host.dispatchEvent(start);
	Mouse.screen.x=250;Mouse.screen.y=200;
	frames.splice(0).forEach(callback=>callback());
	expect(box._host.style.left).toBe('100px');
	const stop=new MouseEvent('mouseup',{button:0});
	Object.defineProperty(stop,'which',{value:1});
	window.dispatchEvent(stop);
	const ordinary=window_(()=>false);
	ordinary._host.style.left='100px';
	ordinary.draggable();
	Mouse.screen.x=100;Mouse.screen.y=100;
	ordinary._host.dispatchEvent(start);
	Mouse.screen.x=220;Mouse.screen.y=200;
	frames.splice(0).forEach(callback=>callback());
	expect(ordinary._host.style.left).not.toBe('100px');
	window.dispatchEvent(stop);
	box.remove();ordinary.remove();
	vi.unstubAllGlobals();
});
