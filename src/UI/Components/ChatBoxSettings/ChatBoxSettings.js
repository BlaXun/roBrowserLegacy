/**
 * UI/Components/ChatBoxSettings/ChatBoxSettings.js
 *
 * Chat Box Settings
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

import DB from 'DB/DBManager.js';
import Preferences from 'Core/Preferences.js';
import Renderer from 'Renderer/Renderer.js';
import Client from 'Core/Client.js';
import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import htmlText from './ChatBoxSettings.html?raw';
import cssText from './ChatBoxSettings.css?raw';

/**
 * Create Component
 */
const ChatBoxSettings = new GUIComponent('ChatBoxSettings', cssText);
ChatBoxSettings.scaleName = 'ChatBox';
let stopResize = () => {};

/**
 * Render HTML
 */
ChatBoxSettings.render = () => htmlText;

/**
 * @var {boolean} is ChatBoxSettings open ? (Temporary fix)
 */
ChatBoxSettings.isOpen = false;

ChatBoxSettings.tabOption = [];

ChatBoxSettings.activeTab = 0;

/**
 * @var {Preference} structure to save
 */
const _preferences = Preferences.get(
	'ChatBoxSettings',
	{
		x: 480,
		y: 200,
		width: 7,
		height: 8
	},
	1.0
);

/**
 * Initialize UI
 */
ChatBoxSettings.init = function init() {
	const root = this.getRoot();

	const extendBtn = root.querySelector('.extend');
	if (extendBtn) {
		extendBtn.addEventListener('mousedown', onResize);
	}

	const closeBtn = root.querySelector('.close');
	if (closeBtn) {
		closeBtn.addEventListener('click', () => {
			stopResize();
			this.ui.hide();
		});
	}

	// Event delegation for option buttons
	const listOption = root.querySelector('.listoption');
	if (listOption) {
		listOption.addEventListener('click', event => {
			const btn = event.target.closest('button');
			if (btn) {
				onClickOption(btn);
			}
		});
	}

	root.querySelector('.all-on input').addEventListener('change', event => {
		const filters = this.tabOption[this.activeTab];
		if (!filters) return;
		const ids = event.target.checked
			? Array.from(root.querySelectorAll('.listoption button'), button => Number(button.dataset.id))
			: [];
		// ChatTabStore owns this array; keep its identity for routing and persistence.
		filters.splice(0, filters.length, ...ids);
		this.updateTab(this.activeTab, root.querySelector('.tabname').textContent);
	});
	Client.loadFile(DB.INTERFACE_PATH + 'checkbox_1.bmp', data => {
		root.querySelector('.all-on input').style.setProperty('--checked-image', `url(${data})`);
	});
	this.draggable('.titlebar');
};

/**
 * Once in HTML
 */
ChatBoxSettings.onAppend = function onAppend() {
	// Call resize first while visible so scrollHeight works and host height is updated
	fitWindowWidth();
	resize(_preferences.height);

	const rect = this._host.getBoundingClientRect();
	this._host.style.top = Math.max(0, Math.min(_preferences.y, Renderer.height - rect.height)) + 'px';
	this._host.style.left = Math.max(0, Math.min(_preferences.x, Renderer.width - rect.width)) + 'px';
	this._host.style.display = 'none';
};

/**
 * Key Event Handler
 */
ChatBoxSettings.onKeyDown = function onKeyDown(event) {};

/**
 * Handle option button click
 */
function onClickOption(btn) {
	if (!ChatBoxSettings.tabOption[ChatBoxSettings.activeTab]) return;
	const dataId = parseInt(btn.getAttribute('data-id'), 10);
	let isOn = btn.classList.contains('on');

	if (isOn) {
		btn.classList.remove('on');
		isOn = false;
	} else {
		btn.classList.add('on');
		isOn = true;
	}

	updateOptionImage(btn, isOn, ChatBoxSettings.activeTab);

	if (!isNaN(dataId)) {
		const idsIndex = ChatBoxSettings.tabOption[ChatBoxSettings.activeTab].indexOf(dataId);

		if (idsIndex > -1) {
			ChatBoxSettings.tabOption[ChatBoxSettings.activeTab].splice(idsIndex, 1);
		} else {
			ChatBoxSettings.tabOption[ChatBoxSettings.activeTab].push(dataId);
		}
	}
	updateAllCheckbox();
}

/**
 * Resize ChatBoxSettings
 */
function onResize(event) {
	if (event.button !== 0) return;
	event.preventDefault();
	event.stopPropagation();
	stopResize();
	const startY = event.clientY;
	const startRows = _preferences.height;
	const scale = ChatBoxSettings.scale || 1;
	const move = moveEvent => {
		if (ChatBoxSettings._host.style.display === 'none') {
			stopResize();
			return;
		}
		resize(startRows + Math.round((moveEvent.clientY - startY) / scale / 20));
		ChatBoxSettings._fixPositionOverflow();
	};
	stopResize = () => {
		window.removeEventListener('mousemove', move);
		window.removeEventListener('mouseup', stopResize);
		window.removeEventListener('blur', stopResize);
	};
	window.addEventListener('mousemove', move);
	window.addEventListener('mouseup', stopResize);
	window.addEventListener('blur', stopResize);
}

ChatBoxSettings.toggle = function toggle() {
	if (this._host.style.display === 'none') {
		this.ui.show();
	} else {
		stopResize();
		this.ui.hide();
	}
};

ChatBoxSettings.updateTab = function updateTab(tabID, tabName) {
	const root = this.getRoot();
	const optList = ChatBoxSettings.tabOption[tabID] || [];
	this.activeTab = tabID;
	root.querySelector('.tabname').textContent = tabName;
	root.querySelectorAll('.content .listoption button').forEach(btn => {
		const isOn = optList.includes(Number(btn.dataset.id));
		btn.classList.toggle('on', isOn);
		updateOptionImage(btn, isOn, tabID);
	});
	updateAllCheckbox();
	fitWindowWidth();
};

function updateOptionImage(button, isOn, tabID) {
	const request = (button._optionImageRequest || 0) + 1;
	button._optionImageRequest = request;
	Client.loadFile(DB.INTERFACE_PATH + 'basic_interface/grp_' + (isOn ? 'online' : 'offline') + '.bmp', data => {
		if (
			ChatBoxSettings.activeTab === tabID &&
			button._optionImageRequest === request &&
			button.classList.contains('on') === isOn
		) {
			button.style.backgroundImage = `url(${data})`;
		}
	});
}

/**
 * Extend window size
 */
function resize(rows) {
	// Eight 20px rows, the 17px title and 20px footer match the reference height.
	rows = Math.min(Math.max(rows, 8), 22);
	const list = ChatBoxSettings.getRoot().querySelector('.listoption');
	list.style.height = `${rows * 20 + 3}px`;
	ChatBoxSettings._host.style.height = `${rows * 20 + 40}px`;
	list._roScrollbarRestart?.();
	_preferences.height = rows;
	_preferences.save();
}

function updateAllCheckbox() {
	const root = ChatBoxSettings.getRoot();
	const filters = ChatBoxSettings.tabOption[ChatBoxSettings.activeTab] || [];
	root.querySelector('.all-on input').checked = Array.from(root.querySelectorAll('.listoption button')).every(
		button => filters.includes(Number(button.dataset.id))
	);
}

function fitWindowWidth() {
	const host = ChatBoxSettings._host;
	const display = host.style.display;
	host.style.display = '';
	const labels = ChatBoxSettings.getRoot().querySelectorAll('.option-label');
	// Left frame (20), border/padding (11), icon/gap (23), scrollbar (13).
	host.style.width = `${Math.max(280, ...Array.from(labels, label => label.offsetWidth + 67))}px`;
	host.style.display = display;
}

ChatBoxSettings.onScale = () => {
	stopResize();
	ChatBoxSettings.getRoot().querySelector('.listoption')._roScrollbarRestart?.();
};

ChatBoxSettings.onRemove = function onRemove() {
	stopResize();
	_preferences.y = parseInt(this._host.style.top, 10) || 0;
	_preferences.x = parseInt(this._host.style.left, 10) || 0;
	_preferences.save();
};

ChatBoxSettings.mouseMode = GUIComponent.MouseMode.STOP;

/**
 * Create component and export it
 */
export default UIManager.addComponent(ChatBoxSettings);
