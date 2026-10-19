import { afterEach, describe, expect, it, vi } from 'vitest';
import Network from 'Network/NetworkManager.js';
import PACKET from 'Network/PacketStructure.js';
import PACKETVER from 'Network/PacketVerManager.js';
import PacketLength from 'Network/PacketLength.js';

afterEach(() => {
	Network.close();
	Network.setSocketFactory(null);
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('September 2026 packet framing', () => {
	it('selects the extracted lengths from their build date without changing older clients', () => {
		PacketLength.init(20260929);
		expect(PacketLength.getPacketLength(0x0c12)).toBe(7);
		expect(PacketLength.getPacketLength(0x0c48)).toBe(false);

		PacketLength.init(20260930);
		expect(PacketLength.getPacketLength(0x0c12)).toBe(16);
		expect(PacketLength.getPacketLength(0x0c48)).toBe(46);
		expect(PacketLength.getPacketLength(0x0c46)).toBe(-1);

		PacketLength.init(20250402);
		expect(PacketLength.getPacketLength(0x0c12)).toBe(7);
		expect(PacketLength.getPacketLength(0x0c48)).toBe(false);
	});

	it('waits for fragmented unsupported packets and preserves the following registered packet', () => {
		vi.useFakeTimers();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		PACKETVER.value = 20260930;
		const socket = { close() {}, send() {} };
		Network.setSocketFactory(() => socket);
		Network.connect('127.0.0.1', 6900, () => {}, false);
		socket.onComplete(true);
		const received = [];
		Network.hookPacket(PACKET.ZC.ITEM_DISAPPEAR, packet => received.push(packet.ITAID));

		// One changed fixed length, one newly known variable length, then a
		// registered six-byte packet. Payload bytes have no assumed field layout.
		const fixed = [0x12, 0x0c, ...new Array(14).fill(0)];
		const variable = [0x46, 0x0c, 0x06, 0x00, 0x11, 0x22];
		const following = [0xa1, 0x00, 0x78, 0x56, 0x34, 0x12];
		socket.onMessage(new Uint8Array(fixed.slice(0, 8)));
		expect(received).toEqual([]);
		socket.onMessage(new Uint8Array([...fixed.slice(8), ...variable.slice(0, 3)]));
		expect(received).toEqual([]);
		socket.onMessage(new Uint8Array([...variable.slice(3), ...following]));
		expect(received).toEqual([0x12345678]);
		vi.runAllTimers();
	});
});
