import { afterEach, expect, it, vi } from 'vitest';
import Network from 'Network/NetworkManager.js';
import PACKET from 'Network/PacketStructure.js';
import PacketRegister from 'Network/PacketRegister.js';
import PACKETVER from 'Network/PacketVerManager.js';
import BinaryReader from 'Utils/BinaryReader.js';

const originalVersion = PACKETVER.value;
afterEach(() => {
	Network.close();
	Network.setSocketFactory(null);
	PACKETVER.value = originalVersion;
	vi.useRealTimers();
});

it('keeps the old buyer update and reads every modern field across the main item-width boundary', () => {
	const old = new BinaryReader(new Uint8Array([245, 1, 1, 0, 36, 19, 0, 0]).buffer);
	expect(new PACKET.ZC.UPDATE_ITEM_FROM_BUYING_STORE(old, 8)).toEqual({ ITID: 501, count: 1, limitZeny: 4900 });
	expect(old.tell()).toBe(8);
	expect(PacketRegister[0x81b]).toBe(PACKET.ZC.UPDATE_ITEM_FROM_BUYING_STORE);
	const Schema = PACKET.ZC.UPDATE_ITEM_FROM_BUYING_STORE2;
	expect(Schema).toBeTypeOf('function');
	for (const [date, itemBytes, itemId, size] of [
		[20181120, [245, 1], 501, 22],
		[20181121, [27, 135, 1, 0], 100123, 24]
	]) {
		PACKETVER.value = date;
		// Header omitted: item, bought amount, total paid, remaining budget,
		// seller character ID, Unix timestamp. All values are hand-derived.
		const bytes = new Uint8Array([...itemBytes, 1, 0, 100, 0, 0, 0, 36, 19, 0, 0, 241, 73, 2, 0, 128, 81, 208, 106]);
		const reader = new BinaryReader(bytes.buffer);
		expect(new Schema(reader, bytes.length)).toEqual({ ITID: itemId, count: 1, zeny: 100, limitZeny: 4900, charId: 150001, updateTime: 1792037248 });
		expect(reader.tell()).toBe(size - 2);
		expect(Schema.size).toBe(size);
	}
});

it('dispatches a full modern buyer update without consuming the next packet', () => {
	vi.useFakeTimers();
	PACKETVER.value = 20260930;
	const Schema = PACKET.ZC.UPDATE_ITEM_FROM_BUYING_STORE2;
	expect(Schema).toBeTypeOf('function');
	const socket = { close() {}, send() {} };
	Network.setSocketFactory(() => socket);
	Network.connect('127.0.0.1', 6900, () => {}, false);
	socket.onComplete(true);
	const received = [];
	Network.hookPacket(Schema, packet => received.push(packet));
	Network.hookPacket(PACKET.ZC.ITEM_DISAPPEAR, packet => received.push(packet.ITAID));
	socket.onMessage(new Uint8Array([230, 9, 27, 135, 1, 0, 1, 0, 100, 0, 0, 0, 36, 19, 0, 0, 241, 73, 2, 0, 128, 81, 208, 106, 161, 0, 21, 3, 0, 0]));
	expect(received).toEqual([{ ITID: 100123, count: 1, zeny: 100, limitZeny: 4900, charId: 150001, updateTime: 1792037248 }, 789]);
});
