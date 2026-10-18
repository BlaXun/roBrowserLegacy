import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PACKET from 'Network/PacketStructure.js';

const state = vi.hoisted(() => ({ packets: [], hooks: new Map(), version: 20260930, deferImages: false, images: [] }));
vi.mock('Core/Client.js', () => ({ default: { loadFile: (path, done) => state.deferImages ? state.images.push(() => done(`asset:${path}`)) : done(`asset:${path}`) } }));
vi.mock('DB/DBManager.js', () => ({ default: {
	INTERFACE_PATH: 'data/texture/',
	getItemInfo: id => ({ identifiedDisplayName: `Reward ${id}`, identifiedResourceName: `resource_${id}` })
} }));
vi.mock('Network/NetworkManager.js', () => ({ default: {
	sendPacket: packet => state.packets.push(packet),
	hookPacket: (type, handler) => state.hooks.set(type, handler)
} }));
vi.mock('Network/PacketVerManager.js', () => ({ default: { get value() { return state.version; } } }));
vi.mock('Renderer/Renderer.js', () => ({ default: { width: 1200, height: 800 } }));
vi.mock('UI/CursorManager.js', () => ({ default: {} }));
vi.mock('Renderer/EntityManager.js', () => ({ default: {} }));
vi.mock('UI/Scrollbar.js', () => ({ default: {} }));
vi.mock('UI/UIManager.js', () => ({ default: { addComponent: component => component } }));
vi.mock('Core/Preferences.js', () => ({ default: { get: (_name, defaults) => ({ ...defaults, save() {} }) } }));

const Roulette = (await import('UI/Components/Roulette/Roulette.js')).default;
const initialize = (await import('Engine/MapEngine/Roulette.js')).default;
const receive = (type, packet) => state.hooks.get(type)(packet);
const root = () => Roulette.getRoot();
const button = selector => root().querySelector(selector);
const open = () => {
	document.querySelector('.rouletteIcon').click();
	expect(state.packets.at(-1)).toBeInstanceOf(PACKET.CZ.REQ_OPEN_ROULETTE);
	receive(PACKET.ZC.ACK_OPEN_ROULETTE, { result: 0, step: 0, idx: -1, goldPoint: 10, silverPoint: 20, bronzePoint: 30 });
};
const rewards = [
	{ row: 0, position: 0, itemId: 501, count: 2 },
	{ row: 0, position: 1, itemId: 502, count: 1 },
	{ row: 2, position: 0, itemId: 101454, count: 3 },
	{ row: 2, position: 1, itemId: 503, count: 4 }
];

beforeEach(() => {
	vi.useFakeTimers();
	globalThis.ROConfig = { enableRoulette: true };
	state.version = 20260930;
	state.packets = [];
	state.deferImages = false;
	state.images = [];
	initialize();
	Roulette.append();
});
afterEach(() => {
	Roulette.remove();
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe('roulette UI workflow', () => {
	it('opens through its icon, loads row rewards, displays balances and closes separately from claiming', () => {
		open();
		expect(state.packets.at(-1)).toBeInstanceOf(PACKET.CZ.REQ_ROULETTE_INFO);
		receive(PACKET.ZC.ACK_ROULETTE_INFO, { serial: 1, items: rewards });
		expect(root().querySelector('.points-value').textContent).toMatch(/Gold: 10.*Silver: 20.*Bronze: 30/);
		expect(root().querySelectorAll('.wheel-slot')).toHaveLength(2);
		expect(root().querySelector('.item-icon').style.backgroundImage).toContain('item/resource_501.bmp');
		button('.close').click();
		expect(state.packets.at(-1)).toBeInstanceOf(PACKET.CZ.REQ_CLOSE_ROULETTE);
		expect(Roulette._host.style.display).toBe('none');
	});

	it('uses row and position for the result and waits for the server stall before a single claim', () => {
		open();
		receive(PACKET.ZC.ACK_ROULETTE_INFO, { serial: 1, items: rewards });
		button('.btn-spin').click();
		button('.btn-spin').click();
		expect(state.packets.filter(p => p instanceof PACKET.CZ.REQ_GENERATE_ROULETTE)).toHaveLength(1);
		receive(PACKET.ZC.ACK_GENERATE_ROULETTE, { result: 0, step: 2, idx: 0, remainGold: 10, remainSilver: 10, remainBronze: 0 });
		vi.advanceTimersByTime(3000);
		expect(button('.btn-claim').disabled).toBe(true);
		// A timeout may run before the wall-clock deadline used by the controls.
		const wallClock = Date.now.bind(Date);
		const earlyClock = vi.spyOn(Date, 'now').mockImplementation(() => wallClock() - 1);
		vi.advanceTimersByTime(1000);
		expect(button('.btn-claim').disabled).toBe(true);
		earlyClock.mockRestore();
		vi.advanceTimersByTime(1);
		expect(button('.btn-claim').disabled).toBe(false);
		expect(root().querySelector('.result-item').textContent).toContain('Reward 101454');
		expect(root().querySelector('.result-item').textContent).toContain('3');
		expect(root().querySelector('.result-item').style.backgroundImage).toContain('resource_101454.bmp');
		state.deferImages = true;
		button('.btn-claim').click();
		button('.btn-claim').click();
		expect(state.packets.filter(p => p instanceof PACKET.CZ.RECV_ROULETTE_ITEM)).toHaveLength(1);
		expect(Roulette._host.style.display).not.toBe('none');
		receive(PACKET.ZC.RECV_ROULETTE_ITEM, { result: 0, additionItemID: 502 });
		state.deferImages = false;
		state.images.forEach(done => done());
		expect(root().querySelector('.result-item').style.backgroundImage).toBe('');
		expect(button('.btn-claim').disabled).toBe(true);
		expect(button('.btn-spin').disabled).toBe(false);
		button('.close').click();
		document.querySelector('.rouletteIcon').click();
		receive(PACKET.ZC.ACK_OPEN_ROULETTE, { result: 0, step: 2, idx: 0, goldPoint: 10, silverPoint: 10, bronzePoint: 0 });
		expect(button('.btn-claim').disabled).toBe(true);
		vi.advanceTimersByTime(4000);
		expect(root().querySelector('.result-item').textContent).toContain('Reward 101454');
		expect(button('.btn-claim').disabled).toBe(false);
		receive(PACKET.ZC.ACK_OPEN_ROULETTE, { result: 0, step: 255, idx: 0 });
		expect(button('.btn-claim').disabled).toBe(true);
		expect(root().querySelector('.status').textContent).toMatch(/invalid/i);
	});

	it('accepts losing rewards, recovers from failures, and keeps the first-row claim blocked for six seconds', () => {
		open();
		receive(PACKET.ZC.ACK_ROULETTE_INFO, { serial: 1, items: rewards });
		button('.btn-spin').click();
		receive(PACKET.ZC.ACK_GENERATE_ROULETTE, { result: 0, step: 0, idx: 1, remainGold: 0, remainSilver: 0, remainBronze: 0 });
		vi.advanceTimersByTime(6000);
		expect(button('.btn-claim').disabled).toBe(false);
		button('.btn-spin').click();
		receive(PACKET.ZC.ACK_GENERATE_ROULETTE, { result: 2, remainGold: 0, remainSilver: 0, remainBronze: 0 });
		expect(root().querySelector('.status').textContent).toMatch(/points/i);
		expect(button('.btn-claim').disabled).toBe(true);
		expect(root().querySelector('.result-item').textContent).toBe('');
		expect(button('.btn-spin').disabled).toBe(false);
		button('.btn-spin').click();
		receive(PACKET.ZC.ACK_GENERATE_ROULETTE, { result: 3, step: 0, idx: 0, remainBronze: 0 });
		vi.advanceTimersByTime(5999);
		expect(button('.btn-claim').disabled).toBe(true);
		vi.advanceTimersByTime(1);
		button('.btn-claim').click();
		expect(state.packets.at(-1)).toBeInstanceOf(PACKET.CZ.RECV_ROULETTE_ITEM);
		expect(state.packets.at(-1).condition).toBe(1);
		receive(PACKET.ZC.RECV_ROULETTE_ITEM, { result: 3 });
		expect(root().querySelector('.status').textContent).toMatch(/weight/i);
		expect(button('.btn-spin').disabled).toBe(false);
		expect(button('.btn-claim').disabled).toBe(true);
	});

	it('honors the feature and packet-date gates and removes pending work on map departure', () => {
		Roulette.remove();
		globalThis.ROConfig.enableRoulette = false;
		Roulette.append();
		expect(document.querySelector('.rouletteIcon')).toBeNull();
		Roulette.remove();
		globalThis.ROConfig.enableRoulette = true;
		state.version = 20141007;
		Roulette.append();
		expect(document.querySelector('.rouletteIcon')).toBeNull();
		Roulette.remove();
		state.version = 20260930;
		Roulette.append();
		open();
		button('.btn-spin').click();
		Roulette.remove();
		vi.advanceTimersByTime(10000);
		expect(document.querySelector('.rouletteIcon')).toBeNull();
		expect(state.packets.filter(p => p instanceof PACKET.CZ.RECV_ROULETTE_ITEM)).toHaveLength(0);
	});
});
