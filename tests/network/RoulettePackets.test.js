import { afterEach, describe, expect, it, vi } from 'vitest';
import Network from 'Network/NetworkManager.js';
import PACKET from 'Network/PacketStructure.js';
import PACKETVER from 'Network/PacketVerManager.js';
import BinaryReader from 'Utils/BinaryReader.js';

const originalVersion = PACKETVER.value;

afterEach(() => {
	Network.close();
	Network.setSocketFactory(null);
	PACKETVER.value = originalVersion;
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function u16(value) {
	return [value & 0xff, (value >>> 8) & 0xff];
}

function u32(value) {
	return [...u16(value), ...u16(value >>> 16)];
}

function parse(Struct, bytes) {
	const fp = new BinaryReader(new Uint8Array(bytes));
	const packet = new Struct(fp, bytes.length);
	expect(fp.tell()).toBe(bytes.length);
	return packet;
}

describe('roulette packet decoding', () => {
	it('keeps roulette balances aligned after the item ID and preserves the old short form', () => {
		for (const [date, item, encoded] of [
			[20181120, 501, u16(501)],
			[20181121, 101454, u32(101454)],
			[20260930, 101454, u32(101454)]
		]) {
			PACKETVER.value = date;
			const balances = [...u32(10), ...u32(20), ...u32(30)];
			expect(parse(PACKET.ZC.ACK_OPEN_ROULETTE, [0, ...u32(77), 1, 2, ...encoded, ...balances])).toEqual({
				result: 0,
				serial: 77,
				step: 1,
				idx: 2,
				additionItemID: item,
				goldPoint: 10,
				silverPoint: 20,
				bronzePoint: 30
			});
			expect(parse(PACKET.ZC.ACK_GENERATE_ROULETTE, [0, ...u16(1), ...u16(2), ...encoded, ...balances])).toEqual({
				result: 0,
				step: 1,
				idx: 2,
				additionItemID: item,
				remainGold: 10,
				remainSilver: 20,
				remainBronze: 30
			});
			expect(parse(PACKET.ZC.RECV_ROULETTE_ITEM, [0, ...encoded])).toEqual({ result: 0, additionItemID: item });
		}
	});

	it('reads roulette rows after the network variable header and leaves the following packet intact', () => {
		vi.useFakeTimers();
		for (const [date, row1, row2, expectedItem, tail] of [
			[
				20180510,
				[...u16(0), ...u16(1), ...u16(501), ...u16(2)],
				[...u16(1), ...u16(2), ...u16(502), ...u16(3)],
				502,
				[]
			],
			[
				20180511,
				[...u16(0), ...u16(1), ...u32(501), ...u16(2), ...u16(0)],
				[...u16(1), ...u16(2), ...u32(101454), ...u16(3), ...u16(0)],
				101454,
				new Array(8).fill(0) // Short modern row must not consume the following packet.
			]
		]) {
			PACKETVER.value = date;
			const socket = { close() {}, send() {} };
			Network.setSocketFactory(() => socket);
			Network.connect('127.0.0.1', 6900, () => {}, false);
			socket.onComplete(true);
			const received = [];
			Network.hookPacket(PACKET.ZC.ACK_ROULETTE_INFO, packet => received.push(packet));
			Network.hookPacket(PACKET.ZC.ITEM_DISAPPEAR, packet => received.push(packet.ITAID));
			const body = [...u32(77), ...row1, ...row2, ...tail];
			const packet = [...u16(0x0a1c), ...u16(body.length + 4), ...body];
			socket.onMessage(new Uint8Array([...packet, ...u16(0x00a1), ...u32(123)]));
			expect(received).toEqual([
				{
					serial: 77,
					items: [
						{ row: 0, position: 1, itemId: 501, count: 2 },
						{ row: 1, position: 2, itemId: expectedItem, count: 3 }
					]
				},
				123
			]);
			Network.close();
		}
	});
});
