/**
 * Not every client's data has every window's textures: iRO's 2026 data has no
 * bank/ folder. A node whose data-background fails to load is marked
 * .no-texture, so the window's CSS can draw it without one (Bank.css does).
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';

const mocks = vi.hoisted(() => ({ pending: [], missing: new Set() }));

// Images answer later, in the order a test releases them
vi.mock('Core/Client.js', () => ({
	default: {
		loadFile(path, onload, onerror) {
			mocks.pending.push(() =>
				mocks.missing.has(path) ? onerror?.("Can't get file") : onload?.(`img:${path}`)
			);
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

function bankNode(selector) {
	const host = document.createElement('div');
	host.innerHTML = fs.readFileSync('src/UI/Components/Bank/Bank.html', 'utf8');
	const node = host.querySelector(selector);
	document.body.appendChild(node);
	return node;
}

// GUIComponent loads Client and DB itself before it handles a node
async function requested(count) {
	for (let i = 0; i < 100 && mocks.pending.length < count; i++) {
		await new Promise(r => setTimeout(r, 5));
	}
	expect(mocks.pending.length).toBe(count);
}

function answerAll() {
	while (mocks.pending.length) mocks.pending.shift()();
}

describe('a window texture the client data does not have', () => {
	it('marks the node, and leaves it without a background image', async () => {
		mocks.missing = new Set(['bank/bg_bank.bmp']);
		const container = bankNode('.container');
		GUIComponent.processDataAttrs(container);
		await requested(1);
		answerAll();
		expect(container.classList.contains('no-texture')).toBe(true);
		expect(container.style.backgroundImage).toBe('');
	});

	it('does not mark a node whose texture loads', async () => {
		mocks.missing = new Set(['bank/btn_upper_over.bmp']);
		const plus = bankNode('.plus');
		GUIComponent.processDataAttrs(plus);
		// plain, hover and down images; only a missing plain image counts
		await requested(3);
		answerAll();
		expect(plus.classList.contains('no-texture')).toBe(false);
		expect(plus.style.backgroundImage).toContain('bank/btn_upper_out.bmp');
	});
});
