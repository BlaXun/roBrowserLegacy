import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PACKET from 'Network/PacketStructure.js';
const state = vi.hoisted(() => ({ packets: [], hooks: new Map(), marks: new Map(), detail: null, retired: 0, shop: null }));
vi.mock('Core/Client.js', () => ({ default: { loadFile: (path, done) => done(`asset:${path}`) } }));
vi.mock('DB/Items/ItemTable.js', () => ({ default: Object.fromEntries(Array.from({length: 22}, (_, i) => [100100+i, { identifiedDisplayName: i < 2 ? 'Sword' : `Item ${i}`, identifiedResourceName: 'sword', slotCount: i === 0 ? 1 : 2 }])) }));
vi.mock('DB/DBManager.js', () => ({ default: { INTERFACE_PATH: 'data/texture/', getItemInfo: id => ({identifiedDisplayName: `Item ${id}`, identifiedResourceName: 'sword'}), getItemName: item => `+${item.RefiningLevel} Item ${item.ITID}`, getMessage: () => '' } }));
vi.mock('Network/NetworkManager.js', () => ({ default: { sendPacket: packet => state.packets.push(packet), hookPacket: (type, fn) => state.hooks.set(type, fn) } }));
vi.mock('Renderer/Renderer.js', () => ({ default: { width:1200, height:800 } }));
vi.mock('UI/CursorManager.js', () => ({default:{}}));
vi.mock('Renderer/EntityManager.js', () => ({default:{get:()=>null}}));
vi.mock('UI/Scrollbar.js', () => ({default:{}}));
vi.mock('UI/UIManager.js', () => ({default:{addComponent: c => c}}));
vi.mock('UI/Components/ItemInfo/ItemInfo.js', () => ({default:{append(){}, setItem: item => {state.detail=item;}}}));
vi.mock('UI/Components/MiniMap/MiniMap.js', () => ({default:{getUI: () => ({addNpcMark: (key,x,y) => state.marks.set(key,[x,y]),removeNpcMark: key => state.marks.delete(key)})}}));
const stub = vi.hoisted(() => () => ({default:{}}));
vi.mock('UI/Components/Inventory/Inventory.js', stub);
vi.mock('UI/Components/Vending/Vending.js', stub);
vi.mock('UI/Components/VendingReport/VendingReport.js', stub);
vi.mock('UI/Components/VendingShop/VendingShop.js', stub);
vi.mock('UI/Components/ChatBox/ChatBox.js', stub);
vi.mock('UI/Components/NpcStore/NpcStore.js', () => ({default:{
 Type:{VENDING_STORE:0,BUYING_STORE:1},__active:false,append(){this.__active=true;},remove(){this.__active=false;state.retired++;},
 setType(type){state.shop=type;},setList(){},setPriceLimit(){},setClosePacketSent(){},ui:{find:()=>({text(){}})}
}}));
const Store = (await import('Engine/MapEngine/Store.js')).default;
const NpcStore = (await import('UI/Components/NpcStore/NpcStore.js')).default;
const Search = (await import('UI/Components/StoreSearch/StoreSearch.js')).default;
const { default: initialize, resetStoreSearch, onSearchStoreOpened } = await import('Engine/MapEngine/StoreSearch.js');
const receive = (type,p) => state.hooks.get(type)(p);
const root = () => Search.getRoot();
const el = selector => root().querySelector(selector);
const open = (effect=0) => receive(PACKET.ZC.OPEN_SEARCH_STORE_INFO,{openType:effect,SearchCntMax:10});
const choose = (query='Sword', field='items', index=0) => {
 const input=el(`[data-picker="${field}"] input`); input.value=query; input.dispatchEvent(new Event('input'));
 root().querySelectorAll(`[data-picker="${field}"] .candidates button`)[index].click();
};
const search = () => { choose(); el('.search').click(); };
const row = (id=100100) => ({SSI_ID:42,AID:200001,ITID:id,StoreName:'<img src=x onerror=alert(1)>',price:50,count:2,RefiningLevel:7,enchantgrade:3,slot:{card1:4001},Options:[undefined,{index:5,value:-12,param:0}],IsIdentified:1});
const ack = (rows=[row()], first=1,next=0,uses=9) => receive(PACKET.ZC.SEARCH_STORE_INFO_ACK2,{IsFirstPage:first,IsNexPage:next,RemainedSearchCnt:uses,SSI_List:rows});
beforeEach(() => { vi.useFakeTimers(); resetStoreSearch(true); state.packets=[]; state.marks.clear(); state.detail=null; state.retired=0; initialize(); Store(); });
afterEach(() => {resetStoreSearch(true);vi.clearAllTimers();vi.useRealTimers();});
describe('catalog controls and server lifecycle', () => {
 it('selects known item/card candidates and appends pages with server use counts and exact row tuples', () => {
  open(); choose('Sword','items',1); choose('100105','cards');
  el('.search').click();
  expect(state.packets.at(-1)).toMatchObject({ItemIDList:[100101],CardIDList:[100105]});
  ack([row()],1,1); expect(el('.uses').textContent).toContain('9');
  el('.next').click(); expect(state.packets.at(-1)).toBeInstanceOf(PACKET.CZ.SEARCH_STORE_INFO_NEXT_PAGE);
  ack([row(100102)],0,0); expect(root().querySelectorAll('.result')).toHaveLength(2);
  el('.result .visit').click(); expect(state.packets.at(-1)).toMatchObject({AID:200001,SSI_ID:42,ITID:100100});
 });
 it('keeps rejection and following ACK semantics separate without inventing a cooldown', () => {
  open();search();ack(); el('.search').click();
  receive(PACKET.ZC.SEARCH_STORE_INFO_FAILED,{Reason:3});
  expect(el('.status').textContent).toMatch(/cannot search yet/i); expect(el('.uses').textContent).toContain('9');
  expect(el('.result .visit').disabled).toBe(false); expect(el('.search').disabled).toBe(false);
  el('.search').click(); receive(PACKET.ZC.SEARCH_STORE_INFO_FAILED,{Reason:0}); ack([],1,0,8);
  expect(el('.status').textContent).toMatch(/No matching/i); expect(el('.uses').textContent).toContain('8');
  el('.search').click();receive(PACKET.ZC.SEARCH_STORE_INFO_FAILED,{Reason:1});ack([row()],1,0,7);
  expect(el('.status').textContent).toMatch(/too many/i);
 });
 it('uses normal markers or a server-opened remote shop and rejects stale row actions', () => {
  open();search();ack();el('.visit').click();receive(PACKET.ZC.SSILIST_ITEM_CLICK_ACK,{x:12,y:34});
  expect([...state.marks.values()]).toEqual([[12,34]]);
  el('.visit').click();receive(PACKET.ZC.SSILIST_ITEM_CLICK_ACK,{x:-1,y:-1});expect(state.marks.size).toBe(0);
  el('.visit').click();receive(PACKET.ZC.SEARCH_STORE_INFO_FAILED,{Reason:4});expect(el('.visit').disabled).toBe(true);
  resetStoreSearch();open(1);search();ack();el('.visit').click();
  expect(onSearchStoreOpened(200099,42,0,()=>state.retired++)).toBe(false);
  receive(PACKET.ZC.PC_PURCHASE_ITEMLIST_FROMMC3,Object.assign(Object.create(PACKET.ZC.PC_PURCHASE_ITEMLIST_FROMMC3.prototype),{AID:200001,UniqueID:42,itemList:[]}));
  expect(state.shop).toBe(0);expect(el('.search').disabled).toBe(false);
  el('.close').click();expect(state.retired).toBe(1);
  open(1);choose();el('.store-type').value='1';el('.search').click();ack();el('.visit').click();
  receive(PACKET.ZC.ACK_ITEMLIST_BUYING_STORE,{AID:200001,UniqueID:42,limitZeny:100,itemList:[]});
  expect(state.shop).toBe(1);expect(el('.search').disabled).toBe(false);
  NpcStore.onSubmit = () => {}; // another unrelated shop now owns the window
  el('.close').click();expect(state.retired).toBe(1);
  expect(state.packets.filter(p=>p instanceof PACKET.CZ.REQ_CLICK_TO_BUYING_STORE)).toHaveLength(0);
 });
 it('closes once and invalidates pending work, late replies and disconnected catalog state', () => {
  open();search();el('.close').click();Search.remove();
  expect(state.packets.filter(p=>p instanceof PACKET.CZ.CLOSE_SEARCH_STORE_INFO)).toHaveLength(1);
  ack();expect(Search.__active).toBe(false);
  open();search();resetStoreSearch();vi.advanceTimersByTime(15000);ack();expect(Search.__active).toBe(false);
  expect(state.packets.filter(p=>p instanceof PACKET.CZ.CLOSE_SEARCH_STORE_INFO)).toHaveLength(1);
  open();expect(root().querySelectorAll('.result')).toHaveLength(0);
  search();vi.advanceTimersByTime(15000);expect(el('.status').textContent).toMatch(/reopen/i);expect(el('.search').disabled).toBe(true);
  resetStoreSearch(true); NpcStore.__active=false;
  const reply = () => receive(PACKET.ZC.PC_PURCHASE_ITEMLIST_FROMMC3,Object.assign(Object.create(PACKET.ZC.PC_PURCHASE_ITEMLIST_FROMMC3.prototype),{AID:200001,UniqueID:42,itemList:[]}));
  open(1);search();ack();el('.visit').click();vi.advanceTimersByTime(10001);
  reply();expect(NpcStore.__active).toBe(false); // timeout before the reply
  el('.close').click();reply();expect(NpcStore.__active).toBe(true); // a subsequent manual shop is unrelated
  NpcStore.__active=false;open(1);search();ack();el('.visit').click();el('.close').click();
  receive(PACKET.ZC.PC_PURCHASE_ITEMLIST_FROMMC3,Object.assign(Object.create(PACKET.ZC.PC_PURCHASE_ITEMLIST_FROMMC3.prototype),{AID:200099,UniqueID:43,itemList:[]}));
  const manualSubmit=NpcStore.onSubmit;
  reply();expect(NpcStore.__active).toBe(true);expect(NpcStore.onSubmit).toBe(manualSubmit); // do not replace an unrelated manual shop
  NpcStore.__active=false;
  open(1);search();ack();el('.visit').click();resetStoreSearch(true);
  reply();expect(NpcStore.__active).toBe(true); // a new connection has no old catalog owner

 });
 it('limits explicit selections, shows safe shop text and gives complete row metadata to item details', () => {
  open();
  el('[data-picker="items"] input').value='unknown'; el('.search').click();expect(state.packets).toHaveLength(0);
  for(let i=0;i<21;i++) choose(String(100100+i));
  expect(root().querySelectorAll('[data-picker="items"] .selected button')).toHaveLength(20);
		el('.min-price').value='100';el('.search').click();expect(state.packets).toHaveLength(0);
		expect(el('.status').textContent).toMatch(/maximum/i);el('.max-price').value='200';
  el('.search').click();expect(state.packets.at(-1).ItemIDList).toHaveLength(20);
  ack(); expect(el('.shop').textContent).toBe(row().StoreName);expect(el('.shop img')).toBeNull();
  el('.details').click();expect(state.detail).toMatchObject(row());
  const type=el('.store-type');type.value='1';type.dispatchEvent(new Event('change'));
  expect(el('[data-picker="cards"] input').disabled).toBe(true);
 });
});
