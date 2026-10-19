import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import PACKET from 'Network/PacketStructure.js';

const state = vi.hoisted(() => ({
	session: { ping: {}, serverTickSynced: true },
	sent: [],
	timer: null
}));

// Load the complete MapEngine with inert rendering/UI dependencies. Exercise the
// real connection and map-load callbacks rather than a separate heartbeat helper.
function loadMapEngine() {
	const code = fs.readFileSync('src/Engine/MapEngine.js', 'utf8');
	const inert = () => new Proxy(function () {}, { get: (_target, key) => key === Symbol.toPrimitive ? () => 0 : inert() });
	const bindings = {};
	const body = code.replace(/^import (.+?) from ['"].+?['"];\r?$/gm, (_line, names) => {
		for (const name of names.replace(/[{}]/g, '').split(',')) bindings[name.trim()] = inert();
		return '';
	});
	const hooks = new Map();
	const mapRenderer = { currentMap: '', setMap() {} };
	const network = {
		utils: { longToIP: () => '127.0.0.1' },
		connect: (_ip, _port, connected) => connected(true),
		read() {},
		hookPacket: (packet, handler) => hooks.set(packet, handler),
		setPing(callback) {
			clearInterval(state.timer);
			state.timer = setInterval(callback, 10000);
		},
		sendPacket(packet) {
			state.sent.push({ type: packet.constructor, data: { ...packet } });
		}
	};
	const context = vm.createContext({
		...bindings, console, Date, PACKET, PACKETVER: { value: 20221005 },
		Session: state.session, Network: network, MapRenderer: mapRenderer,
		Configs: { get: key => key === 'sec_HBT', getServer: () => ({}) },
		DB: { getAllSignboardsForMap: () => null }
	});
	vm.runInContext(body.replace('export default MapEngine;', 'this.MapEngine = MapEngine;'), context);
	return {
		connect() {
			context.MapEngine.init(0, 5121, 'test.gat');
			state.sent.length = 0;
		},
		loadMap() {
			hooks.get(PACKET.ZC.NPCACK_MAPMOVE)({ mapName: 'test.gat', xPos: 1, yPos: 1 });
		},
		finishMap() {
			mapRenderer.onLoad();
		}
	};
}

describe('map heartbeat', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(1000000);
		state.sent.length = 0;
		state.session.ping = {};
		state.session.Entity = { resetRoute() {}, set() {}, effectState: 0, aura: { free() {}, load() {} } };
		state.session.serverTickSynced = true;
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('waits for map readiness and clears pending requests across map loads and connections', () => {
		state.session.ping = { pingTime: 9000, returned: false };
		const map = loadMapEngine();
		map.connect();
		map.loadMap();
		vi.advanceTimersByTime(20000);
		expect(state.sent.map(packet => packet.type)).toEqual([PACKET.CZ.HBT, PACKET.CZ.HBT]);
		expect(console.warn).not.toHaveBeenCalled();

		map.finishMap();
		vi.advanceTimersByTime(10000);
		expect(state.sent.at(-1).type).toBe(PACKET.CZ.REQUEST_TIME2);
		expect(state.sent.at(-1).data.clientTime).toBe(30000);
		expect(state.session.ping.epoch).toBe(1000000);
		expect(state.session.serverTickSynced).toBe(false);

		// A warp begins while a request is still pending. Loading packets cannot
		// get a time reply, so resume without carrying that request into the map.
		map.loadMap();
		state.sent.length = 0;
		vi.advanceTimersByTime(20000);
		expect(state.sent.map(packet => packet.type)).toEqual([PACKET.CZ.HBT, PACKET.CZ.HBT]);
		map.finishMap();
		vi.advanceTimersByTime(10000);
		expect(state.sent.at(-1).data.clientTime).toBe(60000);
		expect(console.warn).not.toHaveBeenCalled();

		map.connect();
		vi.advanceTimersByTime(10000);
		expect(state.sent.at(-1).type).toBe(PACKET.CZ.HBT);
		map.loadMap();
		map.finishMap();
		vi.advanceTimersByTime(10000);
		expect(state.sent.at(-1).data.clientTime).toBe(20000);
		expect(state.session.ping.epoch).toBe(1060000);
		expect(console.warn).not.toHaveBeenCalled();
	});

	it('still warns about a genuinely unanswered request once the map is ready', () => {
		const map = loadMapEngine();
		map.connect();
		map.loadMap();
		map.finishMap();
		vi.advanceTimersByTime(10000);
		expect(console.warn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(10000);
		expect(console.warn).toHaveBeenCalledTimes(1);
		expect(state.sent.filter(packet => packet.type === PACKET.CZ.REQUEST_TIME2)).toHaveLength(2);
		expect(state.session.ping.pingTime).toBe(20000);
		expect(state.session.ping.returned).toBe(false);

		// The unchanged pong handler marks a received response before the next tick.
		state.session.ping.returned = true;
		vi.advanceTimersByTime(10000);
		expect(console.warn).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(10000);
		expect(console.warn).toHaveBeenCalledTimes(2);
		expect(state.sent.filter(packet => packet.type === PACKET.CZ.HBT)).toHaveLength(4);
	});
});
