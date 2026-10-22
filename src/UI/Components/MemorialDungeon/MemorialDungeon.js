/**
 * UI/Components/MemorialDungeon/MemorialDungeon.js
 *
 * Memorial Dungeon (instance) window: name, standby position, when the
 * instance ends, and a button to destroy it.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

import DB from 'DB/DBManager.js';
import Client from 'Core/Client.js';
import Preferences from 'Core/Preferences.js';
import PACKET from 'Network/PacketStructure.js';
import Network from 'Network/NetworkManager.js';
import Renderer from 'Renderer/Renderer.js';
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
	AVAILABLE: 1, // created, nobody inside
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
const _preferences = Preferences.get('MemorialDungeon', { x: 10, y: -1 }, 1.0);

/**
 * Current instance, null when there is none
 */
let _data = null;

MemorialDungeon.render = () => htmlText;

MemorialDungeon.init = function init() {
	this.draggable('.titlebar');
	const root = this.getRoot();

	const closeBtn = root.querySelector('.close');
	closeBtn.addEventListener('mousedown', e => e.stopImmediatePropagation());
	closeBtn.addEventListener('click', () => this.remove());

	const destroy = root.querySelector('.destroy');
	destroy.addEventListener('click', onDestroy);
	initTextButton(destroy);
};

MemorialDungeon.onAppend = function onAppend() {
	// First time: left side, half way down
	const y = _preferences.y < 0 ? Math.round(Renderer.height / 2) : _preferences.y;
	this._host.style.left = `${_preferences.x}px`;
	this._host.style.top = `${y}px`;
	this.refresh();
};

MemorialDungeon.onRemove = function onRemove() {
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

	// [name] in Standby / Available / in Progress
	const name = root.querySelector('.name');
	name.textContent = '';
	const [before, after = ''] = DB.getMessage([1337, 1338, 1339][_data.state]).split('%s');
	const span = document.createElement('span');
	span.className = 'md-name';
	span.textContent = `[${_data.name}]`;
	name.append(before, span, after);

	const info = root.querySelector('.info');
	info.textContent = '';
	switch (_data.state) {
		case STATE.STANDBY:
			// Your Standby Priority: %d
			appendColored(info, DB.getMessage(1342).replace('%d', _data.priority));
			break;
		case STATE.AVAILABLE:
			// The requested dungeon will be removed if you do not enter before %s.
			appendColored(info, DB.getMessage(1343).replace('%s', formatDate(_data.enterDate)));
			break;
		case STATE.PROGRESS:
			if (_data.destroyDate) {
				const date = document.createElement('div');
				date.className = 'date';
				date.textContent = formatDate(_data.destroyDate);
				info.append(DB.getMessage(1344), date); // Dungeon Mission Time Limit:
			}
			break;
	}

	root.querySelector('.buttons').classList.toggle('visible', _data.state === STATE.AVAILABLE);
};

/**
 * Destroy button: the window closes at once, the server confirms in the chat
 */
function onDestroy() {
	const pkt = new PACKET.CZ.MEMORIALDUNGEON_COMMAND();
	pkt.Command = COMMAND_DESTROY_FORCE;
	Network.sendPacket(pkt);
	MemorialDungeon.remove();
}

/**
 * Generic text button, drawn from basic_interface/btn_<state>_{left,mid,right}.bmp
 *
 * @param {HTMLElement} button
 */
function initTextButton(button) {
	const images = {};
	let current = 'out';
	const set = state => {
		const img = images[state];
		if (img.left && img.right && img.mid) {
			button.style.backgroundImage = `url(${img.left}), url(${img.right}), url(${img.mid})`;
		}
	};

	['out', 'over', 'press'].forEach(state => {
		images[state] = {};
		['left', 'mid', 'right'].forEach(part => {
			Client.loadFile(`${DB.INTERFACE_PATH}basic_interface/btn_${state}_${part}.bmp`, url => {
				images[state][part] = url;
				if (state === current) set(state);
			});
		});
	});

	const to = state => () => {
		current = state;
		set(state);
	};
	button.addEventListener('mouseenter', to('over'));
	button.addEventListener('mouseleave', to('out'));
	button.addEventListener('mousedown', to('press'));
	button.addEventListener('mouseup', to('over'));
}

/**
 * @param {number} time - unix time
 * @return {string} MM/DD HH:MM in local time
 */
function formatDate(time) {
	const date = new Date(time * 1000);
	const pad = n => String(n).padStart(2, '0');
	return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
