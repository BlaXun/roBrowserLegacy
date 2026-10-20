import { afterEach, expect, it, vi } from 'vitest';
import Network from 'Network/NetworkManager.js';
import PACKET from 'Network/PacketStructure.js';
import PacketLength from 'Network/PacketLength.js';

afterEach(() => {
	Network.hookPacket(PACKET.ZC.ITEM_DISAPPEAR, null);
	Network.close();
	Network.setSocketFactory(null);
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it('handles packets immediately and drains deferred logs when no idle budget is available', () => {
	vi.useFakeTimers();
	const idleCallbacks = [];
	vi.stubGlobal('requestIdleCallback', (callback, options) => {
		let timer;
		const run = deadline => {
			clearTimeout(timer);
			callback(deadline);
		};
		idleCallbacks.push(run);
		if (options?.timeout !== undefined) {
			timer = setTimeout(() => run({ timeRemaining: () => 0, didTimeout: true }), options.timeout);
		}
	});
	const log = vi.spyOn(console, 'log').mockImplementation(() => {});
	const receivedLogs = () => log.mock.calls.filter(args => args[0] === '%c[Network] Recv: %s');
	const socket = { close() {}, send() {} };
	const received = [];
	PacketLength.init(20260930);
	Network.setSocketFactory(() => socket);
	Network.connect('127.0.0.1', 5121, () => {}, false);
	socket.onComplete(true);
	Network.hookPacket(PACKET.ZC.ITEM_DISAPPEAR, packet => received.push(packet.ITAID));
	socket.onMessage(new Uint8Array([0xa1, 0, 0x15, 3, 0, 0]));
	expect(received).toEqual([789]);
	expect(receivedLogs()).toHaveLength(0);

	idleCallbacks.shift()({ timeRemaining: () => 0, didTimeout: false });
	expect(receivedLogs()).toHaveLength(0);
	vi.advanceTimersByTime(1000);
	expect(receivedLogs()).toHaveLength(1);
	expect(receivedLogs()[0][2]).toBe('0xa1 PACKET_ZC_ITEM_DISAPPEAR');
	expect(receivedLogs()[0][3]).toMatchObject({ ITAID: 789 });
});
