import DB from 'DB/DBManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import UIManager from 'UI/UIManager.js';
import Renderer from 'Renderer/Renderer.js';
import Session from 'Engine/SessionStorage.js';
import Network from 'Network/NetworkManager.js';
import PACKET from 'Network/PacketStructure.js';
import PACKETVER from 'Network/PacketVerManager.js';
import 'UI/Elements/Elements.js';
import html from './PackageSelection.html?raw';
import css from './PackageSelection.css?raw';

const Selection = new GUIComponent('PackageSelection', css);
Selection.render = () => html;
let request = null;
const submitted = new WeakMap();

Selection.init = function () {
	const root = this.getRoot();
	this.draggable(root.querySelector('.head'));
	root.querySelector('.cancel').addEventListener('click', () => this.remove());
	root.querySelector('.confirm').addEventListener('click', () => {
		if (!request || request.group === null) {
			return;
		}
		const { inventory, index, itemID, account, group } = request;
		const item = inventory.getItemByIndex(index);
		if (account === Session.AID && item?.ITID === itemID && item.count > 0) {
			const packet = new PACKET.CZ.USE_PACKAGEITEM();
			Object.assign(packet, { index, AID: account, itemID, BoxIndex: group });
			// Block a second opening while the server's inventory update is in flight.
			submitted.set(item, { count: item.count, until: Date.now() + 1500 });
			request = null;
			Network.sendPacket(packet);
		}
		this.remove();
	});
};

Selection.open = function (item, inventory) {
	const groups = DB.getItemPackage(item.ITID);
	const pending = submitted.get(item);
	if (
		PACKETVER.value < 20220216 ||
		!groups.length ||
		item.count <= 0 ||
		(pending && pending.count === item.count && pending.until > Date.now())
	) {
		return;
	}
	if (this.__active) {
		this.focus();
		return;
	}
	this.append();
	request = { inventory, index: item.index, itemID: item.ITID, account: Session.AID, group: null };
	const root = this.getRoot();
	root.querySelector('.title').textContent = DB.getItemInfo(item.ITID).identifiedDisplayName;
	const list = root.querySelector('.groups');
	list.replaceChildren();
	const confirm = root.querySelector('.confirm');
	confirm.disabled = true;
	for (const group of groups) {
		const button = document.createElement('button');
		button.type = 'button';
		button.dataset.group = group.id;
		button.setAttribute('aria-pressed', 'false');
		const title = document.createElement('strong');
		title.textContent = group.name || `Option ${group.id + 1}`;
		button.appendChild(title);
		for (const reward of group.items) {
			const row = document.createElement('div');
			const name = DB.getItemInfo(reward.id).identifiedDisplayName;
			row.textContent = `${reward.refine ? `+${reward.refine} ` : ''}${name} ×${reward.amount}`;
			if (reward.hours) {
				row.textContent += ` (${reward.hours} hours)`;
			}
			if (reward.randomOption) {
				row.textContent += ' — Random options';
			}
			if (reward.grade) {
				row.textContent += ` — Grade ${reward.grade}`;
			}
			button.appendChild(row);
		}
		button.addEventListener('click', () => {
			if (!request) {
				return;
			}
			request.group = group.id;
			for (const option of list.children) {
				option.setAttribute('aria-pressed', String(option === button));
			}
			confirm.disabled = false;
		});
		list.appendChild(button);
	}
};
Selection.onAppend = function () {
	this._host.style.left = `${Math.max(0, (Renderer.width - 340) / 2)}px`;
	this._host.style.top = `${Math.max(0, (Renderer.height - 320) / 2)}px`;
};
Selection.onRemove = () => {
	request = null;
};
export default UIManager.addComponent(Selection);
