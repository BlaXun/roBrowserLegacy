/**
 * The Damage Indicator tab's style buttons draw their pick with the shared
 * data-active image, on the button markup EquipmentV4.html ships. It must
 * survive the pointer leaving the button and the button's own image loads.
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';

const mocks = vi.hoisted(() => ({ pending: [] }));

// Images load later, in the order a test releases them
vi.mock('Core/Client.js', () => ({
	default: {
		loadFile(path, callback) {
			mocks.pending.push(() => callback?.(`img:${path}`));
		},
		loadFiles() {}
	}
}));
vi.mock('DB/DBManager.js', () => ({ default: { INTERFACE_PATH: '', getMessage: () => '' } }));
vi.mock('UI/CursorManager.js', () => ({ default: { ACTION: {}, getActualType: () => 0, setType: vi.fn() } }));
vi.mock('Renderer/Renderer.js', () => ({ default: {} }));
vi.mock('Renderer/EntityManager.js', () => ({ default: {} }));
vi.mock('UI/Scrollbar.js', () => ({ default: {} }));
vi.mock('Core/Preferences.js', () => ({ default: { get: (_k, def) => ({ ...def, save: vi.fn() }) } }));

const { default: GUIComponent } = await import('UI/GUIComponent.js');

function styleButton() {
	const html = fs.readFileSync('src/UI/Components/Equipment/EquipmentV4/EquipmentV4.html', 'utf8');
	const host = document.createElement('div');
	host.innerHTML = html;
	const button = host.querySelector('#damageskin .skin-option[data-skin="1"]');
	document.body.appendChild(button);
	return button;
}

// GUIComponent loads Client and DB itself before it handles a node
async function requested(count) {
	for (let i = 0; i < 100 && mocks.pending.length < count; i++) {
		await new Promise(r => setTimeout(r, 5));
	}
	expect(mocks.pending.length).toBe(count);
}

function image(button) {
	return button.style.backgroundImage.match(/showdamage\/(\w+)\.bmp/)?.[1];
}

function loadAll() {
	while (mocks.pending.length) mocks.pending.shift()();
}

describe('Damage Indicator style button', () => {
	it('keeps its picked image when the pointer leaves it', async () => {
		const button = styleButton();
		GUIComponent.processDataAttrs(button);
		// plain, active, hover and down images
		await requested(4);
		loadAll();
		expect(image(button)).toBe('btn_damage');

		button.classList.add('active');
		await Promise.resolve(); // the class is seen by a MutationObserver
		expect(image(button)).toBe('btn_damage_pick');

		button.dispatchEvent(new MouseEvent('mouseover'));
		button.dispatchEvent(new MouseEvent('mousedown'));
		button.dispatchEvent(new MouseEvent('mouseup'));
		button.dispatchEvent(new MouseEvent('mouseout'));
		expect(image(button)).toBe('btn_damage_pick');

		button.classList.remove('active');
		await Promise.resolve();
		expect(image(button)).toBe('btn_damage');
	});

	it('keeps its pick when its plain image finishes loading after it', async () => {
		const button = styleButton();
		button.classList.add('active');
		GUIComponent.processDataAttrs(button);
		await requested(4);

		// The picked image first, the plain one last
		mocks.pending.reverse();
		loadAll();
		expect(image(button)).toBe('btn_damage_pick');
	});

	it('follows the pick after its window is removed and appended again', async () => {
		const button = styleButton();
		GUIComponent.processDataAttrs(button);
		await requested(4);
		loadAll();

		// What GUIComponent.remove() sends every node, as on a map change
		button.dispatchEvent(new Event('x_remove'));

		button.classList.add('active');
		await Promise.resolve();
		expect(image(button)).toBe('btn_damage_pick');

		button.classList.remove('active');
		await Promise.resolve();
		expect(image(button)).toBe('btn_damage');
	});
});
