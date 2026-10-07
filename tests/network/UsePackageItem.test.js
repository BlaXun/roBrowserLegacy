import { describe, expect, it } from 'vitest';
import PACKET from 'Network/PacketStructure.js';
import PacketRegister from 'Network/PacketRegister.js';

describe('CZ_USE_PACKAGEITEM', () => {
	it('sends the server inventory index, account, full item ID and group zero in 16 bytes', () => {
		expect(PACKET.CZ.USE_PACKAGEITEM).toBeTypeOf('function');
		const packet = new PACKET.CZ.USE_PACKAGEITEM();
		Object.assign(packet, { index: 5, AID: 2000000, itemID: 101454, BoxIndex: 0 });
		const writer = packet.build();
		expect(Array.from(new Uint8Array(writer.buffer))).toEqual([
			0xaf, 0x0b, 5, 0, 0x80, 0x84, 0x1e, 0, 0x4e, 0x8c, 1, 0, 0, 0, 0, 0
		]);
		expect(PacketRegister[0x0baf]).toBe(PACKET.CZ.USE_PACKAGEITEM);
	});
});
