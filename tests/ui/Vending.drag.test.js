import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
const Mouse = (await import('Controls/MouseEventHandler.js')).default;
const InputBox = (await import('UI/Components/InputBox/InputBox.js')).default;
const frames = new Map();
const dragListeners = new Map();
const errors = [];
let frameId = 0;
const windows = () => [...Vending.getRoot().querySelectorAll('.InputWindow, .OutputWindow')];
const position = win => [win.style.left, win.style.top];

function mouseEvent(type) {
	const event = new MouseEvent(type, { button: 0, bubbles: true });
	Object.defineProperty(event, 'which', { value: 1 });
	return event;
}

function open() {
	if (!Vending._host?.isConnected) {
		Vending.append();
	}
	Vending.setType(Vending.Type.VENDING_STORE);
	Vending.onVendingSkill({ itemcount: 2 });
	for (const win of windows()) {
		// jsdom has no layout; use the real styles for the drag's initial offset.
		Object.defineProperties(win, {
			offsetLeft: { configurable: true, get: () => parseInt(win.style.left, 10) },
			offsetTop: { configurable: true, get: () => parseInt(win.style.top, 10) }
		});
	}
}

function start(win) {
	Mouse.screen.x = 300;
	Mouse.screen.y = 300;
	win.querySelector('.titlebar').dispatchEvent(mouseEvent('mousedown'));
	expect(errors).toEqual([]);
	expect(frames.size).toBe(1);
}

function move(dx, dy) {
	Mouse.screen.x += dx;
	Mouse.screen.y += dy;
	const pending = [...frames.values()];
	frames.clear();
	pending.forEach(callback => callback());
}

beforeEach(() => {
	vi.useFakeTimers();
	frames.clear();
	dragListeners.clear();
	errors.length = 0;
	vi.stubGlobal('requestAnimationFrame', callback => {
		frames.set(++frameId, callback);
		return frameId;
	});
	vi.stubGlobal('cancelAnimationFrame', id => frames.delete(id));
	const add = window.addEventListener.bind(window);
	const remove = window.removeEventListener.bind(window);
	vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
		if (['mouseup', 'touchend', 'blur'].includes(type)) {
			const listeners = dragListeners.get(type) || new Set();
			listeners.add(listener);
			dragListeners.set(type, listeners);
		}
		add(type, listener, options);
	});
	vi.spyOn(window, 'removeEventListener').mockImplementation((type, listener, options) => {
		if (['mouseup', 'touchend', 'blur'].includes(type)) {
			const listeners = dragListeners.get(type);
			listeners?.delete(listener);
			if (!listeners?.size) {
				dragListeners.delete(type);
			}
		}
		remove(type, listener, options);
	});
	window.addEventListener('error', captureError);
	open();
});

function captureError(event) {
	errors.push(event.error?.message);
	event.preventDefault();
}

afterEach(() => {
	window.dispatchEvent(mouseEvent('mouseup'));
	Vending.remove();
	window.removeEventListener('error', captureError);
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('Vending subwindow drag ownership', () => {
	it('moves each real titlebar independently and stops on release', () => {
		const [input, output] = windows();
		input.style.left = '100px';
		input.style.top = '100px';
		output.style.left = '390px';
		output.style.top = '260px';

		start(input);
		move(60, 40);
		expect(position(input)).toEqual(['160px', '140px']);
		expect(position(output)).toEqual(['390px', '260px']);
		window.dispatchEvent(mouseEvent('mouseup'));
		expect(frames.size).toBe(0);
		expect(dragListeners.size).toBe(0);

		start(output);
		move(30, 20);
		expect(position(output)).toEqual(['420px', '280px']);
		expect(position(input)).toEqual(['160px', '140px']);
		window.dispatchEvent(mouseEvent('mouseup'));
		move(200, 200);
		expect(position(output)).toEqual(['420px', '280px']);
		expect(frames.size).toBe(0);
		expect(dragListeners.size).toBe(0);
	});

	it('cancels active drags on owner exits and keeps the handles usable on reopening', () => {
		const submit = () => {
			// Select a real item through Vending's drop/price flow, then submit directly.
			const drop = new Event('drop', { bubbles: true });
			Object.defineProperty(drop, 'dataTransfer', {
				value: { getData: () => JSON.stringify({ type: 'item', from: 'Vending', container: 'InputWindow', index: 0 }) }
			});
			windows()[1].dispatchEvent(drop);
			InputBox.onSubmitRequest(50);
			Vending.getRoot().querySelector('.shopname').value = 'Fruit';
			Vending.onSubmit();
		};
		const exits = [() => Vending.onClose(), () => Vending.onRemove(), () => Vending.remove(), submit];
		for (const [index, exit] of exits.entries()) {
			const win = windows()[index % 2];
			start(win);
			move(30, 20);
			const closedPosition = position(win);
			exit();
			expect(Vending.isOpen).toBe(false);
			expect(Vending._host.style.display).toBe('none');
			expect(frames.size).toBe(0);
			expect(dragListeners.size).toBe(0);
			expect(win.style.opacity).toBe('1');
			move(100, 100);
			expect(position(win)).toEqual(closedPosition);

			open();
			const [left, top] = position(win).map(value => parseInt(value, 10));
			start(win);
			move(40, 20);
			expect(position(win)).toEqual([`${left + 40}px`, `${top + 20}px`]);
			window.dispatchEvent(mouseEvent('mouseup'));
			expect(frames.size).toBe(0);
			expect(dragListeners.size).toBe(0);
		}
	});
});
