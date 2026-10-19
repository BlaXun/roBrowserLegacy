import DB from 'DB/DBManager.js';
import { htmlToText } from 'Utils/HtmlHelper.js';
import ItemTable from 'DB/Items/ItemTable.js';
import Client from 'Core/Client.js';
import Renderer from 'Renderer/Renderer.js';
import GUIComponent from 'UI/GUIComponent.js';
import UIManager from 'UI/UIManager.js';
import ItemInfo from 'UI/Components/ItemInfo/ItemInfo.js';
import 'UI/Elements/Elements.js';
import html from './StoreSearch.html?raw';
import css from './StoreSearch.css?raw';

const Search = new GUIComponent('StoreSearch', css);
Search.render = () => html;
Search.captureKeyEvents = true;
let selected = { items: [], cards: [] };
function icon(id) {
	const element = document.createElement('span');
	element.className = 'icon';
	const info = DB.getItemInfo(id);
	Client.loadFile(`${DB.INTERFACE_PATH}item/${info.identifiedResourceName}.bmp`, data => {
		element.style.backgroundImage = `url(${data})`;
	});
	return element;
}
function label(id) {
	const info = ItemTable[id];
	return `${info.identifiedDisplayName} [${info.slotCount || 0}] (#${id})`;
}
function renderSelected(kind) {
	const container = Search.getRoot().querySelector(`[data-picker="${kind}"] .selected`);
	container.replaceChildren();
	for (const id of selected[kind]) {
		const button = document.createElement('button');
		button.type = 'button';
		button.textContent = `${label(id)} ×`;
		button.title = 'Remove selection';
		button.addEventListener('click', () => {
			selected[kind] = selected[kind].filter(value => value !== id);
			renderSelected(kind);
		});
		container.append(button);
	}
}
function showCandidates(kind) {
	const picker = Search.getRoot().querySelector(`[data-picker="${kind}"]`);
	const query = picker.querySelector('input').value.trim().toLocaleLowerCase();
	const candidates = picker.querySelector('.candidates');
	candidates.replaceChildren();
	if (!query) return;
	// itemInfo supplies names/slots, not authoritative server item types.
	// The optional card field deliberately makes no numeric-range/type assumption.
	let count = 0;
	for (const [key, info] of Object.entries(ItemTable)) {
		if (
			!info.identifiedDisplayName ||
			(!info.identifiedDisplayName.toLocaleLowerCase().includes(query) && key !== query)
		)
			continue;
		const id = Number(key);
		if (!Number.isInteger(id) || id <= 0 || id > 0xffffffff) continue;
		const button = document.createElement('button');
		button.type = 'button';
		button.dataset.itemId = key;
		button.append(icon(id), document.createTextNode(label(id)));
		button.addEventListener('click', () => {
			if (selected[kind].includes(id)) return;
			if (selected.items.length + selected.cards.length >= 20) {
				Search.getRoot().querySelector('.status').textContent = 'Select up to 20 items and cards in total.';
				return;
			}
			selected[kind].push(id);
			renderSelected(kind);
			candidates.replaceChildren();
			picker.querySelector('input').value = '';
		});
		candidates.append(button);
		if (++count >= 40) break;
	}
}
Search.init = function () {
	const root = this.getRoot();
	this.draggable(root.querySelector('.head'));
	root.querySelector('.close').addEventListener('click', () => this.onClose());
	for (const kind of ['items', 'cards'])
		root.querySelector(`[data-picker="${kind}"] input`).addEventListener('input', () => showCandidates(kind));
	root.querySelector('.store-type').addEventListener('change', () => {
		const buying = root.querySelector('.store-type').value === '1';
		root.querySelector('[data-picker="cards"] input').disabled = buying;
		root.querySelector('.card-note').textContent = buying
			? 'Buying shops do not use card filters.'
			: 'Optional: items containing any selected card.';
		selected.cards = [];
		renderSelected('cards');
		root.querySelector('[data-picker="cards"] .candidates').replaceChildren();
	});
	root.querySelector('.search').addEventListener('click', () => {
		if (!selected.items.length) {
			root.querySelector('.status').textContent = 'Select at least one item from the name search.';
			return;
		}
		const minPrice = Number(root.querySelector('.min-price').value),
			maxPrice = Number(root.querySelector('.max-price').value);
		if (![minPrice, maxPrice].every(n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff)) {
			root.querySelector('.status').textContent = 'Enter whole, nonnegative Zeny amounts.';
			return;
		}
		// The server swaps reversed bounds before applying its zero/unbounded rule.
		if (minPrice > maxPrice) {
			root.querySelector('.status').textContent = 'Enter a maximum price at least as large as the minimum.';
			return;
		}
		this.onSearch({
			items: [...selected.items],
			cards: [...selected.cards],
			type: Number(root.querySelector('.store-type').value),
			minPrice,
			maxPrice
		});
	});
	root.querySelector('.next').addEventListener('click', () => this.onNext());
};
Search.clearSelection = function () {
	selected = { items: [], cards: [] };
	const root = this.getRoot();
	for (const kind of ['items', 'cards']) {
		const picker = root.querySelector(`[data-picker="${kind}"]`);
		picker.querySelector('input').value = '';
		picker.querySelector('input').disabled = false;
		picker.querySelector('.candidates').replaceChildren();
		renderSelected(kind);
	}
	root.querySelector('.store-type').value = '0';
	root.querySelector('.min-price').value = '0';
	root.querySelector('.max-price').value = '0';
	root.querySelector('.card-note').textContent = 'Optional: items containing any selected card.';
};
Search.setCatalog = function (value) {
	const root = this.getRoot();
	const busy = !!value.pending || value.failed;
	root.querySelector('.effect').textContent = value.effect ? 'Remote catalog' : 'Map catalog';
	root.querySelector('.uses').textContent = `Searches remaining: ${value.uses}`;
	root.querySelector('.status').textContent = value.status;
	root.querySelector('.search').disabled = busy || !value.uses;
	root.querySelector('.next').disabled = busy || !value.next;
	root.querySelector('.result-count').textContent = `${value.rows.length} results`;
	const list = root.querySelector('.results');
	const scroll = list.scrollTop;
	list.replaceChildren();
	for (const row of value.rows) {
		const element = document.createElement('div');
		element.className = 'result';
		const details = document.createElement('button');
		details.type = 'button';
		details.className = 'details';
		const name = document.createElement('span');
		name.className = 'item-label';
		name.textContent = htmlToText(DB.getItemName(row));
		const shop = document.createElement('span');
		shop.className = 'shop';
		shop.textContent = row.StoreName;
		name.append(shop);
		details.append(icon(row.ITID), name);
		details.addEventListener('click', () => {
			ItemInfo.append();
			ItemInfo.setItem(row);
		});
		const price = document.createElement('span');
		price.className = 'price';
		price.textContent = `${row.price.toLocaleString()} Zeny × ${row.count}`;
		const visit = document.createElement('button');
		visit.type = 'button';
		visit.className = 'visit';
		visit.textContent = value.effect ? 'Open' : 'Locate';
		visit.disabled = busy || !!row.stale;
		visit.addEventListener('click', () => this.onVisit(row));
		element.append(details, price, visit);
		list.append(element);
	}
	list.scrollTop = scroll;
};
Search.onAppend = function () {
	this._host.style.left = `${Math.max(0, (Renderer.width - 540) / 2)}px`;
	this._host.style.top = `${Math.max(0, (Renderer.height - 480) / 2)}px`;
};
Search.onRemove = function () {
	selected = { items: [], cards: [] };
	this.onClose();
};
Search.onKeyDown = function (event) {
	if (event.key === 'Escape' || event.which === 27) {
		event.stopImmediatePropagation();
		this.onClose();
	} else if (this.isEditableFocused()) event.stopImmediatePropagation();
};
Search.onClose = () => {};
Search.onSearch = () => {};
Search.onNext = () => {};
Search.onVisit = () => {};
export default UIManager.addComponent(Search);
