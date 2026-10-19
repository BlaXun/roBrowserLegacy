import { afterEach, describe, expect, it, vi } from 'vitest';
import Network from 'Network/NetworkManager.js';
import PACKET from 'Network/PacketStructure.js';
import PACKETVER from 'Network/PacketVerManager.js';

const originalVersion = PACKETVER.value;
const u16 = n => [n & 255, (n >>> 8) & 255];
const u32 = n => [...u16(n), ...u16(n >>> 16)];
afterEach(() => {
 Network.close(); Network.setSocketFactory(null); PACKETVER.value = originalVersion; vi.useRealTimers();
});
describe('store search wire contracts', () => {
 it('writes selected item/card IDs and server row tuples without truncation at the main width boundary', () => {
  for (const date of [20181120, 20181121, 20221005, 20250402, 20260930]) {
   PACKETVER.value = date;
   const modern = date >= 20181121;
   const id = modern ? 100123 : 501;
   const card = modern ? 100456 : 4001;
   const width = modern ? u32 : u16;
   const query = new PACKET.CZ.SEARCH_STORE_INFO();
   Object.assign(query, { StoreType: 1, minPrice: 20, maxPrice: 300, ItemIDList: [id], CardIDList: [card] });
   expect([...new Uint8Array(query.build().buffer)]).toEqual([...u16(0x835), ...u16(15 + (modern ? 8 : 4)), 1, ...u32(300), ...u32(20), 1, 1, ...width(id), ...width(card)]);
   const click = new PACKET.CZ.SSILIST_ITEM_CLICK();
			if (modern) expect(click.getPacketVersion().slice(1)).toEqual([0x83c,14,2,6,10]);
   Object.assign(click, { AID: 2000012, SSI_ID: 90001, ITID: id });
   expect([...new Uint8Array(click.build().buffer)]).toEqual([...u16(0x83c), ...u32(2000012), ...u32(90001), ...width(id)]);
  }
 });
 it('dispatches complete modern rows with options and leaves the following packet intact', () => {
  vi.useFakeTimers(); PACKETVER.value = 20260930;
  const socket = { close() {}, send() {} };
  Network.setSocketFactory(() => socket); Network.connect('127.0.0.1', 6900, () => {}, false); socket.onComplete(true);
  const received = [];
  expect(PACKET.ZC.SEARCH_STORE_INFO_ACK2).toBeTypeOf('function');
  Network.hookPacket(PACKET.ZC.SEARCH_STORE_INFO_ACK2, p => received.push(p));
  Network.hookPacket(PACKET.ZC.ITEM_DISAPPEAR, p => received.push(p.ITAID));
  const row = id => [...u32(123), ...u32(2000001), ...new Array(80).fill(0), ...u32(id), 4, ...u32(3000000000), ...u16(3), ...u32(100456), ...new Array(12).fill(0), ...u16(5), ...u16(-12), 2, ...new Array(20).fill(0), 9, 3];
  const body = [1, 1, 9, ...row(100123), ...row(100124), ...new Array(9).fill(0)];
  socket.onMessage(new Uint8Array([...u16(0xb64), ...u16(body.length + 4), ...body, ...u16(0xa1), ...u32(789)]));
  expect(received).toHaveLength(2);
  expect(received[0]).toMatchObject({ IsFirstPage: 1, IsNexPage: 1, RemainedSearchCnt: 9, SSI_List: [
   { ITID: 100123, price: 3000000000, slot: { card1: 100456 }, RefiningLevel: 9, enchantgrade: 3 }, { ITID: 100124 }
  ] });
  expect(received[0].SSI_List[0].Options[1]).toEqual({ index: 5, value: -12, param: 2 });
  expect(received[1]).toBe(789);
 });
});
