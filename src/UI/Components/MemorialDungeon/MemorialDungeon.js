/**
 * UI/Components/MemorialDungeon/MemorialDungeon.js
 *
 * Memorial Dungeon (instance) window: name, standby position, time left,
 * and a button to destroy the instance.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

import DB from 'DB/DBManager.js';
import Preferences from 'Core/Preferences.js';
import PACKET from 'Network/PacketStructure.js';
import Network from 'Network/NetworkManager.js';
import 'UI/Elements/Elements.js';
import GUIComponent from 'UI/GUIComponent.js';
import UIManager from 'UI/UIManager.js';
import htmlText from './MemorialDungeon.html?raw';
import cssText from './MemorialDungeon.css?raw';

/**
 * Instance states
 */
const STATE = {
	STANDBY: 0, // queued, maps not created yet
	AVAILABLE: 1, // created, nobody entered yet
	PROGRESS: 2 // someone is inside
};

/**
 * CZ_MEMORIALDUNGEON_COMMAND values (rAthena clif.hpp)
 */
const COMMAND_DESTROY_FORCE = 3;

const MemorialDungeon = new GUIComponent('MemorialDungeon', cssText);

MemorialDungeon.STATE = STATE;

/**
 * @var {Preferences} structure
 */
const _preferences = Preferences.get('MemorialDungeon', { x: 120, y: 120 }, 1.0);

/**
 * Current instance, null when there is none
 */
let _data = null;

/**
 * @var {number} refresh interval
 */
let _timer = null;

MemorialDungeon.render = () => htmlText;

MemorialDungeon.init = function init() {
	this.draggable('.titlebar');
	const root = this.getRoot();

	const closeBtn = root.querySelector('.close');
	closeBtn.addEventListener('mousedown', e => e.stopImmediatePropagation());
	closeBtn.addEventListener('click', () => this.remove());

	root.querySelector('.destroy').addEventListener('click', onDestroy);
};

MemorialDungeon.onAppend = function onAppend() {
	this._host.style.left = `${_preferences.x}px`;
	this._host.style.top = `${_preferences.y}px`;
	this.refresh();
	if (!_timer) {
		_timer = setInterval(() => this.refresh(), 1000);
	}
};

MemorialDungeon.onRemove = function onRemove() {
	clearInterval(_timer);
	_timer = null;
	_preferences.x = parseInt(this._host.style.left, 10);
	_preferences.y = parseInt(this._host.style.top, 10);
	_preferences.save();
};

/**
 * Instance is queued (ZC_MEMORIALDUNGEON_SUBSCRIPTION_INFO)
 *
 * @param {string} name - instance name
 * @param {number} priority - position in the queue
 */
MemorialDungeon.setStandby = function setStandby(name, priority) {
	_data = { state: STATE.STANDBY, name, priority, destroyDate: 0, enterDate: 0 };
	this.append();
};

/**
 * Queue position changed (ZC_MEMORIALDUNGEON_SUBSCRIPTION_NOTIFY)
 *
 * @param {number} priority
 */
MemorialDungeon.setPriority = function setPriority(priority) {
	if (!_data) return;
	_data.priority = priority;
	if (this.__active) this.refresh();
};

/**
 * Instance exists (ZC_MEMORIALDUNGEON_INFO)
 *
 * @param {string} name - instance name
 * @param {number} destroyDate - unix time the instance ends (0 = no limit)
 * @param {number} enterDate - unix time the instance ends if nobody enters (0 = someone is inside)
 */
MemorialDungeon.setInfo = function setInfo(name, destroyDate, enterDate) {
	const state = enterDate ? STATE.AVAILABLE : STATE.PROGRESS;
	_data = { state, name, priority: 0, destroyDate, enterDate };
	this.append();
};

/**
 * Entry time limit changed (ZC_MEMORIALDUNGEON_NOTIFY, type 0)
 *
 * @param {number} enterDate - unix time, 0 = someone entered
 */
MemorialDungeon.setEnterDate = function setEnterDate(enterDate) {
	if (!_data || _data.state === STATE.STANDBY) return;
	_data.enterDate = enterDate;
	_data.state = enterDate ? STATE.AVAILABLE : STATE.PROGRESS;
	if (this.__active) this.refresh();
};

/**
 * Instance is gone
 */
MemorialDungeon.clear = function clear() {
	_data = null;
	this.remove();
};

/**
 * @return {object|null} current instance
 */
MemorialDungeon.getData = function getData() {
	return _data;
};

/**
 * Draw the current instance
 */
MemorialDungeon.refresh = function refresh() {
	const root = this.getRoot();
	if (!root || !_data) return;

	const now = Date.now() / 1000;
	const nameMsg = [1337, 1338, 1339][_data.state]; // %s in Standby / Available / in Progress

	root.querySelector('.name').textContent = DB.getMessage(nameMsg).replace('%s', _data.name);

	const priority = root.querySelector('.priority');
	priority.textContent = '';
	if (_data.state === STATE.STANDBY) {
		appendColored(priority, DB.getMessage(1342).replace('%d', _data.priority)); // Your Standby Priority: %d
	}

	const limit = root.querySelector('.limit');
	limit.classList.toggle('hidden', _data.state === STATE.STANDBY || !_data.destroyDate);
	root.querySelector('.limit-value').textContent = formatTime(_data.destroyDate - now);

	const enter = root.querySelector('.enter');
	enter.textContent = '';
	if (_data.state === STATE.AVAILABLE) {
		// The requested dungeon will be removed if you do not enter within %s.
		appendColored(enter, DB.getMessage(1343).replace('%s', formatTime(_data.enterDate - now)));
	}
};

/**
 * Destroy button
 */
function onDestroy() {
	UIManager.showPromptBox(`${DB.getMessage(3270)}?`, 'ok', 'cancel', () => {
		const pkt = new PACKET.CZ.MEMORIALDUNGEON_COMMAND();
		pkt.Command = COMMAND_DESTROY_FORCE;
		Network.sendPacket(pkt);
	});
}

/**
 * @param {number} seconds
 * @return {string} h:mm:ss or m:ss
 */
function formatTime(seconds) {
	const total = Math.max(0, Math.floor(seconds));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = String(total % 60).padStart(2, '0');
	return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * Append text with RO colour codes (^rrggbb) as spans
 *
 * @param {HTMLElement} parent
 * @param {string} text
 */
function appendColored(parent, text) {
	const parts = text.split(/\^([0-9a-fA-F]{6})/);
	let node = parent;
	for (let i = 0; i < parts.length; i++) {
		if (i % 2) {
			node = document.createElement('span');
			if (parts[i] !== '000000') node.style.color = `#${parts[i]}`;
			parent.appendChild(node);
		} else if (parts[i]) {
			node.appendChild(document.createTextNode(parts[i]));
		}
	}
}

MemorialDungeon.needFocus = false;

export default UIManager.addComponent(MemorialDungeon);
