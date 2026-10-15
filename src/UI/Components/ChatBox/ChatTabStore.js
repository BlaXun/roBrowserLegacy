export const FLOATING_SIZE = Object.freeze({
	initial: { width: 320, height: 90 },
	min: { width: 291, height: 85 },
	max: { width: 504, height: 383 }
});

const validId = value => Number.isSafeInteger(value) && value >= 0;
function safeGeometry(geometry) {
	if (!geometry) return undefined;
	const size = key =>
		Math.max(
			FLOATING_SIZE.min[key],
			Math.min(
				FLOATING_SIZE.max[key],
				Number.isFinite(geometry[key]) ? geometry[key] : FLOATING_SIZE.initial[key]
			)
		);
	return {
		x: Number.isFinite(geometry.x) ? Math.max(0, geometry.x) : 0,
		y: Number.isFinite(geometry.y) ? Math.max(0, geometry.y) : 0,
		width: size('width'),
		height: size('height')
	};
}

/** Serializable tab metadata. DOM and component instances belong to ChatBox views. */
export default class ChatTabStore {
	constructor(tabs = []) {
		this.tabs = Object.create(null);
		this.dockedOrder = [];
		this.nextId = 0;
		this.nextNameNumber = 1;
		this.activeDockedId = null;
		this.selectedId = null;
		this.locked = false;
		for (const [index, tab] of Object.entries(tabs)) {
			if (!tab) continue;
			const id = validId(tab.id) ? tab.id : Number(index);
			if (!validId(id)) continue;
			this.tabs[id] = {
				...tab,
				id,
				filters: [...(tab.filters || [])],
				location: 'docked',
				dockedIndex: this.dockedOrder.length
			};
			this.dockedOrder.push(id);
			this.nextId = Math.max(this.nextId, id + 1);
		}
		this.activeDockedId = this.selectedId = this.dockedOrder[0] ?? null;
	}

	static fromSaved({ layout, tabs = [], tabOption = [], activeTab } = {}) {
		const store = new ChatTabStore();
		const current = layout?.version === 1 && Array.isArray(layout.tabs);
		const records = current
			? layout.tabs
			: Array.isArray(tabs)
				? Object.entries(tabs).map(([id, tab]) => tab && { ...tab, id: Number(id), filters: tabOption[id] })
				: [];
		for (const record of records) {
			if (
				!record ||
				!validId(record.id) ||
				store.get(record.id) ||
				typeof record.name !== 'string' ||
				store.count >= 10
			)
				continue;
			const filters = Array.isArray(record.filters)
				? record.filters.filter(value => Number.isInteger(value) && value >= 0)
				: [];
			store.tabs[record.id] = {
				id: record.id,
				name: record.name,
				filters: [...filters],
				location: current && record.location === 'floating' ? 'floating' : 'docked',
				dockedIndex: validId(record.dockedIndex) ? record.dockedIndex : 0,
				geometry: safeGeometry(record.geometry)
			};
			store.nextId = Math.max(store.nextId, record.id + 1);
			const number = /^New Tab (\d+)$/.exec(record.name);
			if (number && validId(Number(number[1])))
				store.nextNameNumber = Math.max(store.nextNameNumber, Number(number[1]) + 1);
		}
		const order = current && Array.isArray(layout.dockedOrder) ? layout.dockedOrder : [];
		for (const id of order)
			if (validId(id) && store.get(id)?.location === 'docked' && !store.dockedOrder.includes(id))
				store.dockedOrder.push(id);
		for (const tab of Object.values(store.tabs))
			if (tab?.location === 'docked' && !store.dockedOrder.includes(tab.id)) store.dockedOrder.push(tab.id);
		if (store.count && !store.dockedOrder.length) {
			const first = Object.values(store.tabs)[0];
			first.location = 'docked';
			store.dockedOrder.push(first.id);
		}
		store.activeDockedId = store.dockedOrder.includes(current ? layout.activeDockedId : activeTab)
			? current
				? layout.activeDockedId
				: activeTab
			: (store.dockedOrder[0] ?? null);
		store.selectedId =
			current && validId(layout.selectedId) && store.get(layout.selectedId)
				? layout.selectedId
				: store.activeDockedId;
		store.locked = current && typeof layout.locked === 'boolean' ? layout.locked : true;
		if (current) {
			if (validId(layout.nextId)) store.nextId = Math.max(store.nextId, layout.nextId);
			if (validId(layout.nextNameNumber))
				store.nextNameNumber = Math.max(store.nextNameNumber, layout.nextNameNumber);
		}
		return store;
	}

	toSnapshot() {
		return {
			version: 1,
			tabs: Object.values(this.tabs).map(tab => ({
				id: tab.id,
				name: tab.name,
				filters: [...tab.filters],
				location: tab.location,
				dockedIndex: tab.dockedIndex,
				...(tab.geometry ? { geometry: { ...tab.geometry } } : {})
			})),
			dockedOrder: [...this.dockedOrder],
			activeDockedId: this.activeDockedId,
			selectedId: this.selectedId,
			locked: this.locked,
			nextId: this.nextId,
			nextNameNumber: this.nextNameNumber
		};
	}

	get count() {
		return Object.keys(this.tabs).length;
	}
	get(id) {
		return this.tabs[Number(id)];
	}

	create({ name, filters = [], location = 'docked' } = {}) {
		if (this.count >= 10) return null;
		// Recover an exhausted or invalid saved counter without colliding with a live tab.
		if (!validId(this.nextId)) this.nextId = 0;
		while (this.get(this.nextId)) this.nextId++;
		const id = this.nextId++;
		const tab = {
			id,
			name: name ?? `New Tab ${this.nextNameNumber++}`,
			filters: [...filters],
			location,
			dockedIndex: this.dockedOrder.length
		};
		this.tabs[id] = tab;
		if (location === 'docked') {
			this.dockedOrder.push(id);
			this.activeDockedId = id;
		}
		this.selectedId = id;
		return tab;
	}

	remove(id) {
		id = Number(id);
		const tab = this.get(id);
		if (!tab || (tab.location === 'docked' && this.dockedOrder.length === 1)) return false;
		const index = this.dockedOrder.indexOf(id);
		if (index !== -1) this.dockedOrder.splice(index, 1);
		delete this.tabs[id];
		if (this.activeDockedId === id) this.activeDockedId = this.dockedOrder[Math.max(0, index - 1)];
		if (this.selectedId === id) this.selectedId = this.activeDockedId;
		return true;
	}

	detach(id, geometry) {
		const tab = this.get(id);
		if (this.locked || !tab || tab.location !== 'docked' || this.dockedOrder.length === 1) return false;
		const index = this.dockedOrder.indexOf(tab.id);
		tab.dockedIndex = index;
		this.dockedOrder.splice(index, 1);
		tab.location = 'floating';
		tab.geometry = geometry;
		if (this.activeDockedId === tab.id) this.activeDockedId = this.dockedOrder[Math.max(0, index - 1)];
		this.selectedId = tab.id;
		return true;
	}

	dock(id, index = this.get(id)?.dockedIndex) {
		const tab = this.get(id);
		if (this.locked || !tab || tab.location !== 'floating') return false;
		this.dockedOrder.splice(
			Math.max(0, Math.min(index ?? this.dockedOrder.length, this.dockedOrder.length)),
			0,
			tab.id
		);
		tab.location = 'docked';
		this.activeDockedId = this.selectedId = tab.id;
		return true;
	}

	reorder(id, index) {
		id = Number(id);
		const from = this.dockedOrder.indexOf(id);
		if (this.locked || from === -1) return false;
		this.dockedOrder.splice(from, 1);
		this.dockedOrder.splice(Math.max(0, Math.min(index, this.dockedOrder.length)), 0, id);
		return true;
	}

	rename(id, name) {
		if (this.get(id)) this.get(id).name = String(name);
	}
}
