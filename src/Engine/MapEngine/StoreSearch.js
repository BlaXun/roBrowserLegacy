/** Catalog authorization and results belong to the server, not saved UI preferences. */
import Network from 'Network/NetworkManager.js';
import PACKET from 'Network/PacketStructure.js';
import DB from 'DB/DBManager.js';
import Search from 'UI/Components/StoreSearch/StoreSearch.js';
import MiniMap from 'UI/Components/MiniMap/MiniMap.js';

const marker = 'store-search';
let catalog = null;
let timer = null;
let retireShop = null;
// A timed-out/closed click still owns its eventual reply on this connection.
// Store replies carry shop identity, but no client request or catalog ID.
let remoteAttempt = null;
const failures = [
	[1803, 'No matching stores were found.'],
	[1784, 'There are too many results. Please narrow the search.'],
	[1798, 'You cannot search anymore.'],
	[1800, 'You cannot search yet. Please try again later.'],
	[1797, 'No sale or purchase information is available.']
];
function clearMarker() {
	MiniMap.getUI()?.removeNpcMark(marker);
}
function retireRemoteShop() {
	const retire = retireShop;
	retireShop = null;
	retire?.();
}
function finishRequest() {
	clearTimeout(timer);
	timer = null;
	if (catalog) catalog.pending = null;
}
function refresh() {
	if (catalog) Search.setCatalog(catalog);
}
function request(packet, pending) {
	catalog.pending = pending;
	timer = setTimeout(() => {
		if (!catalog) return;
		catalog.failed = true;
		if (remoteAttempt) remoteAttempt.retired = true;
		catalog.status = 'No response. Close and reopen the catalog to refresh.';
		finishRequest();
		refresh();
	}, 10000);
	refresh();
	Network.sendPacket(packet);
}
export function resetStoreSearch(newConnection = false) {
	if (newConnection) remoteAttempt = null;
	else if (remoteAttempt) remoteAttempt.retired = true;
	finishRequest();
	catalog = null;
	retireRemoteShop();
	clearMarker();
	Search.remove();
}
function close() {
	if (!catalog) return;
	Network.sendPacket(new PACKET.CZ.CLOSE_SEARCH_STORE_INFO());
	resetStoreSearch();
}
function onOpen(pkt) {
	resetStoreSearch();
	// rAthena handles catalog clicks synchronously. On the ordered connection,
	// a new catalog-open ACK follows any reply to an earlier catalog click.
	remoteAttempt = null;
	if (pkt.openType !== 0 && pkt.openType !== 1) return;
	catalog = {
		effect: pkt.openType,
		uses: pkt.SearchCntMax,
		rows: [],
		next: false,
		pending: null,
		failed: false,
		status: '',
		type: 0
	};
	Search.append();
	Search.clearSelection();
	refresh();
}
function onResults(pkt) {
	if (!catalog || catalog.failed || !['query', 'page'].includes(catalog.pending?.kind)) return;
	if (pkt.IsFirstPage) catalog.rows = [];
	catalog.rows.push(...pkt.SSI_List);
	catalog.next = !!pkt.IsNexPage;
	catalog.uses = pkt.RemainedSearchCnt;
	if (catalog.pending.kind === 'query') catalog.type = catalog.pending.type;
	finishRequest();
	refresh();
}
function onFailure(pkt) {
	if (pkt.Reason === 4) remoteAttempt = null;
	if (!catalog || catalog.failed) return;
	const message = failures[pkt.Reason];
	catalog.status = message ? DB.getMessage(message[0], message[1]) || message[1] : 'Store search failed.';
	if (pkt.Reason === 4) {
		if (catalog.pending?.kind === 'click') catalog.pending.row.stale = true;
		clearMarker();
		finishRequest();
	} else if (pkt.Reason === 2 || pkt.Reason === 3) {
		if (pkt.Reason === 2) catalog.uses = 0;
		finishRequest();
	}
	// Reasons 0/1 precede the ACK that carries authoritative remaining uses.
	refresh();
}
function onMarker(pkt) {
	if (!catalog || catalog.effect !== 0 || catalog.pending?.kind !== 'click' || catalog.failed) return;
	clearMarker();
	if (pkt.x >= 0 && pkt.y >= 0) {
		MiniMap.getUI()?.addNpcMark(marker, pkt.x, pkt.y, 0xffff00, Infinity);
		catalog.status = `Store marked at ${pkt.x}, ${pkt.y}.`;
	} else catalog.status = 'The store is not on this map.';
	finishRequest();
	refresh();
}
/** Gate a known retired catalog reply before it can replace a manually opened shop. */
export function canOpenSearchStore(account, storeId, type) {
	if (
		!remoteAttempt ||
		remoteAttempt.account !== account ||
		remoteAttempt.storeId !== storeId ||
		remoteAttempt.type !== type
	) {
		return true;
	}
	if (remoteAttempt.retired) {
		remoteAttempt = null;
		return false;
	}
	return true;
}
/** Called by the existing store list handler after it installs its normal transaction UI. */
export function onSearchStoreOpened(account, storeId, type, retire) {
	if (
		!catalog ||
		catalog.failed ||
		catalog.effect !== 1 ||
		catalog.pending?.kind !== 'click' ||
		catalog.pending.row.AID !== account ||
		catalog.pending.row.SSI_ID !== storeId ||
		catalog.type !== type
	)
		return false;
	remoteAttempt = null;
	retireRemoteShop();
	retireShop = retire;
	catalog.status = 'Store opened.';
	finishRequest();
	refresh();
	return true;
}
export default function initializeStoreSearch() {
	Search.onClose = close;
	Search.onSearch = query => {
		if (!catalog || catalog.failed || catalog.pending || !catalog.uses) return;
		const { items, cards, type, minPrice, maxPrice } = query;
		if (
			!items.length ||
			items.length + cards.length > 20 ||
			![0, 1].includes(type) ||
			![minPrice, maxPrice, ...items, ...cards].every(n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff)
		)
			return;
		retireRemoteShop();
		clearMarker();
		catalog.status = '';
		const pkt = new PACKET.CZ.SEARCH_STORE_INFO();
		Object.assign(pkt, { StoreType: type, minPrice, maxPrice, ItemIDList: items, CardIDList: cards });
		request(pkt, { kind: 'query', type });
	};
	Search.onNext = () => {
		if (!catalog || catalog.failed || catalog.pending || !catalog.next) return;
		request(new PACKET.CZ.SEARCH_STORE_INFO_NEXT_PAGE(), { kind: 'page' });
	};
	Search.onVisit = row => {
		if (!catalog || catalog.failed || catalog.pending || row.stale || !catalog.rows.includes(row)) return;
		retireRemoteShop();
		clearMarker();
		catalog.status = '';
		const pkt = new PACKET.CZ.SSILIST_ITEM_CLICK();
		Object.assign(pkt, { AID: row.AID, SSI_ID: row.SSI_ID, ITID: row.ITID });
		if (catalog.effect === 1) {
			remoteAttempt = { account: row.AID, storeId: row.SSI_ID, type: catalog.type, retired: false };
		}
		request(pkt, { kind: 'click', row });
	};
	Network.hookPacket(PACKET.ZC.OPEN_SEARCH_STORE_INFO, onOpen);
	Network.hookPacket(PACKET.ZC.SEARCH_STORE_INFO_ACK2, onResults);
	Network.hookPacket(PACKET.ZC.SEARCH_STORE_INFO_FAILED, onFailure);
	Network.hookPacket(PACKET.ZC.SSILIST_ITEM_CLICK_ACK, onMarker);
}
