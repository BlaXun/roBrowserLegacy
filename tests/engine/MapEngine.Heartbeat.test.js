import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PACKET from 'Network/PacketStructure.js';

const state = vi.hoisted(() => ({
	session: { ping: {}, serverTickSynced: true },
	sent: [],
	timer: null
}));

vi.mock('Engine/SessionStorage.js', () => ({ default: state.session }));
vi.mock('Core/Configs.js', () => ({ default: { get: key => key === 'sec_HBT' } }));
vi.mock('Network/PacketVerManager.js', () => ({ default: { value: 20221005 } }));
vi.mock('Network/NetworkManager.js', () => ({
	default: {
		setPing(callback) {
			clearInterval(state.timer);
			state.timer = setInterval(callback, 10000);
		},
		sendPacket(packet) {
			state.sent.push({ type: packet.constructor, data: { ...packet } });
		}
	}
}));

import startMapHeartbeat from 'Engine/MapEngine/Heartbeat.js';

describe('map heartbeat', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(1000000);
		state.sent.length = 0;
		state.session.ping = {};
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
		const setMapReady = startMapHeartbeat();
		vi.advanceTimersByTime(20000);
		expect(state.sent.map(packet => packet.type)).toEqual([PACKET.CZ.HBT, PACKET.CZ.HBT]);
		expect(console.warn).not.toHaveBeenCalled();

		setMapReady(true);
		vi.advanceTimersByTime(10000);
		expect(state.sent.at(-1).type).toBe(PACKET.CZ.REQUEST_TIME2);
		expect(state.sent.at(-1).data.clientTime).toBe(30000);
		expect(state.session.ping.epoch).toBe(1000000);
		expect(state.session.serverTickSynced).toBe(false);

		// A warp begins while a request is still pending. Loading packets cannot
		// get a time reply, so resume without carrying that request into the map.
		setMapReady(false);
		state.sent.length = 0;
		vi.advanceTimersByTime(20000);
		expect(state.sent.map(packet => packet.type)).toEqual([PACKET.CZ.HBT, PACKET.CZ.HBT]);
		setMapReady(true);
		vi.advanceTimersByTime(10000);
		expect(state.sent.at(-1).data.clientTime).toBe(60000);
		expect(console.warn).not.toHaveBeenCalled();

		const newConnectionReady = startMapHeartbeat();
		vi.advanceTimersByTime(10000);
		expect(state.sent.at(-1).type).toBe(PACKET.CZ.HBT);
		newConnectionReady(true);
		vi.advanceTimersByTime(10000);
		expect(state.sent.at(-1).data.clientTime).toBe(20000);
		expect(state.session.ping.epoch).toBe(1060000);
		expect(console.warn).not.toHaveBeenCalled();
	});

	it('still warns about a genuinely unanswered request once the map is ready', () => {
		const setMapReady = startMapHeartbeat();
		setMapReady(true);
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
