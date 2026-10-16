import { afterEach, describe, expect, it } from 'vitest';
import PACKET from 'Network/PacketStructure.js';
import PACKETVER from 'Network/PacketVerManager.js';
import BinaryReader from 'Utils/BinaryReader.js';

const originalVersion = PACKETVER.value;
afterEach(() => { PACKETVER.value = originalVersion; });

function u16(value) { return [value & 0xff, (value >>> 8) & 0xff]; }
function u32(value) { return [...u16(value), ...u16(value >>> 16)]; }
function parse(Struct, bytes) {
	const fp = new BinaryReader(new Uint8Array(bytes));
	const packet = new Struct(fp, bytes.length);
	expect(fp.tell()).toBe(bytes.length);
	return packet;
}

describe('item IDs in companion feeding replies', () => {
	it('preserves the old feeding layout and reads full item IDs after the main-client width change', () => {
		for (const [date, item, encoded] of [
			[20181120, 501, u16(501)],
			[20181121, 101454, u32(101454)],
			[20260930, 101454, u32(101454)]
		]) {
			PACKETVER.value = date;
			for (const Struct of [PACKET.ZC.FEED_PET, PACKET.ZC.FEED_MER]) {
				expect(parse(Struct, [0, ...encoded])).toEqual({ cRet: 0, ITID: item });
			}
		}
	});

});
