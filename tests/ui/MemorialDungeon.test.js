import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PACKET from 'Network/PacketStructure.js';

const state = vi.hoisted(() => ({ hooks: new Map(), sent: [], chat: [], storage: new Map() }));
vi.stubGlobal('localStorage', { getItem: key => state.storage.get(key) ?? null, setItem: (key, value) => state.storage.set(key, String(value)), removeItem: key => state.storage.delete(key) });
vi.mock('Core/Client.js', () => ({ default: { loadFile: (_path, done) => done?.('') } }));
const MESSAGES = {
	1333: 'Failed to create Memorial Dungeon %s. Please try again.',
	1337: '%s in Standby',
	1338: '%s Available',
	1339: '%s in Progress',
	1342: 'Your Standby Priority: ^ff0000%d^000000',
	1343: 'The requested dungeon will be removed if you do not enter before ^ff0000%s^000000.',
	1344: 'Dungeon Mission Time Limit:',
	1345: 'The Memorial Dungeon reservation has been canceled.',
	1348: 'The Memorial Dungeon has been removed.'
};
vi.mock('DB/DBManager.js', () => ({ default: { INTERFACE_PATH: '', getMessage: id => MESSAGES[id] ?? String(id) } }));
vi.mock('Network/NetworkManager.js', () => ({ default: { sendPacket: packet => state.sent.push(packet), hookPacket: (type, callback) => state.hooks.set(type, callback) } }));
vi.mock('Renderer/Renderer.js', () => ({ default: { width: 1200, height: 800 } }));
vi.mock('UI/CursorManager.js', () => ({ default: { setType() {}, ACTION: { DEFAULT: 0 } } }));
vi.mock('Renderer/EntityManager.js', () => ({ default: { get: () => null, setOverEntity() {} } }));
vi.mock('UI/Scrollbar.js', () => ({ default: {} }));
vi.mock('UI/UIManager.js', () => ({ default: { addComponent: component => component } }));
vi.mock('UI/Components/ChatBox/ChatBox.js', () => ({ default: { addText: text => state.chat.push(text), TYPE: { INFO: 0 }, FILTER: { PUBLIC_LOG: 0 } } }));

const Engine = (await import('Engine/MapEngine/MemorialDungeon.js')).default;
const Window = (await import('UI/Components/MemorialDungeon/MemorialDungeon.js')).default;
const receive = (type, packet) => {
	expect(state.hooks.get(type)).toBeTypeOf('function');
	state.hooks.get(type)(packet);
};
const text = selector => Window.getRoot().querySelector(selector).textContent;
const at = (hour, minute) => new Date(2026, 5, 29, hour, minute).getTime() / 1000;
const buttonShown = () => Window.getRoot().querySelector('.buttons').classList.contains('visible');

beforeEach(() => {
	state.hooks.clear();
	state.sent = [];
	state.chat = [];
	Engine();
});
afterEach(() => Window.clear());

it('opens in standby and follows the queue position', () => {
	receive(PACKET.ZC.MEMORIALDUNGEON_SUBSCRIPTION_INFO, { MemorialDungeonName: 'Tourney Hall', PriorityOrderNum: 2 });
	expect(Window.__active).toBe(true);
	expect(text('.name')).toBe('[Tourney Hall] in Standby');
	expect(text('.info')).toBe('Your Standby Priority: 2');
	expect(buttonShown()).toBe(false);
	receive(PACKET.ZC.MEMORIALDUNGEON_SUBSCRIPTION_NOTIFY, { PriorityOrderNum: 1 });
	expect(text('.info')).toBe('Your Standby Priority: 1');
});

it('closes when the reservation is canceled (position 0xffff)', () => {
	receive(PACKET.ZC.MEMORIALDUNGEON_SUBSCRIPTION_INFO, { MemorialDungeonName: 'Tourney Hall', PriorityOrderNum: 1 });
	receive(PACKET.ZC.MEMORIALDUNGEON_SUBSCRIPTION_NOTIFY, { PriorityOrderNum: -1 });
	expect(Window.__active).toBe(false);
	expect(state.chat).toEqual(['The Memorial Dungeon reservation has been canceled.']);
});

it('shows the entry deadline and the button until someone enters, then the end date', () => {
	receive(PACKET.ZC.MEMORIALDUNGEON_INFO, { MemorialDungeonName: 'Tourney Hall', DestroyDate: at(9, 33), EnterTimeOutDate: at(8, 38) });
	expect(text('.name')).toBe('[Tourney Hall] Available');
	expect(Window.getRoot().querySelector('.md-name').textContent).toBe('[Tourney Hall]');
	expect(text('.info')).toBe('The requested dungeon will be removed if you do not enter before 06/29 08:38.');
	expect(Window.getRoot().querySelector('.info span').style.color).toBe('rgb(255, 0, 0)');
	expect(buttonShown()).toBe(true);

	receive(PACKET.ZC.MEMORIALDUNGEON_NOTIFY, { Type: 0, EnterLimitDate: 0 });
	expect(text('.name')).toBe('[Tourney Hall] in Progress');
	expect(text('.info')).toBe('Dungeon Mission Time Limit:06/29 09:33');
	expect(text('.info .date')).toBe('06/29 09:33');
	expect(buttonShown()).toBe(false);
	expect(Window.__active).toBe(true);
});

it('closes with a message when the instance is destroyed or fails', () => {
	receive(PACKET.ZC.MEMORIALDUNGEON_INFO, { MemorialDungeonName: 'Tourney Hall', DestroyDate: at(9, 33), EnterTimeOutDate: 0 });
	receive(PACKET.ZC.MEMORIALDUNGEON_NOTIFY, { Type: 3, EnterLimitDate: 0 });
	expect(Window.__active).toBe(false);
	expect(Window.getData()).toBeNull();

	receive(PACKET.ZC.MEMORIALDUNGEON_SUBSCRIPTION_INFO, { MemorialDungeonName: 'Tourney Hall', PriorityOrderNum: 1 });
	receive(PACKET.ZC.MEMORIALDUNGEON_NOTIFY, { Type: 4, EnterLimitDate: 0 });
	expect(state.chat).toEqual(['The Memorial Dungeon has been removed.', 'Failed to create Memorial Dungeon Tourney Hall. Please try again.']);
});

it('sends the destroy command and closes at once, without asking', () => {
	receive(PACKET.ZC.MEMORIALDUNGEON_INFO, { MemorialDungeonName: 'Tourney Hall', DestroyDate: at(9, 33), EnterTimeOutDate: at(8, 38) });
	Window.getRoot().querySelector('.destroy').click();
	expect(Window.__active).toBe(false);
	expect(state.sent).toHaveLength(1);
	expect(state.sent[0]).toBeInstanceOf(PACKET.CZ.MEMORIALDUNGEON_COMMAND);
	expect(state.sent[0].Command).toBe(3);
	expect([...new Uint8Array(state.sent[0].build().buffer)]).toEqual([0xcf, 0x02, 3, 0, 0, 0]);
});
