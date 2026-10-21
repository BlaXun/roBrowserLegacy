/**
 * UI/Components/ChatBox/ChatBox.js
 *
 * ChatBox windows
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
 * @author Vincent Thibault
 */

import DB from 'DB/DBManager.js';
import Renderer from 'Renderer/Renderer.js';
import Client from 'Core/Client.js';
import Events from 'Core/Events.js';
import Preferences from 'Core/Preferences.js';
import KEYS from 'Controls/KeyEventHandler.js';
import Mouse from 'Controls/MouseEventHandler.js';
import Cursor from 'UI/CursorManager.js';
import BattleMode from 'Controls/BattleMode.js';
import History from './History.js';
import ChatTabStore, { FLOATING_SIZE } from './ChatTabStore.js';
import createFloatingChatWindow from './FloatingChatWindow.js';
import ScrollBar from 'UI/Scrollbar.js';
import logCss from './ChatLogView.css?raw';
import tabsCss from './ChatTabs.css?raw';
import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import 'UI/Elements/Elements.js';
import ContextMenu from 'UI/Components/ContextMenu/ContextMenu.js';
import htmlText from './ChatBox.html?raw';
import cssText from './ChatBox.css?raw';
import Commands from 'Controls/ProcessCommand.js';
import ChatBoxSettings from 'UI/Components/ChatBoxSettings/ChatBoxSettings.js';
import Configs from 'Core/Configs.js';
import Session from 'Engine/SessionStorage.js';
import EntityManager from 'Renderer/EntityManager.js';
import {
	captureLogPosition,
	restoreLogPosition,
	appendChatMessages,
	bindChatLog,
	chatMessages,
	clearChatLog,
	retainExportUrl,
	releaseExportUrl
} from './ChatLogView.js';

/**
 * @var {number} max message in the chatbox
 */
const MAX_MSG = 400;
const MAX_LENGTH = 100;
const MAGIC_NUMBER = 3 * 14;

/**
 * @var {History} message cached in history
 */
const _historyMessage = new History();

/**
 * @var {History} nickname cached in history
 */
const _historyNickName = new History(true);

/**
 * @var {number} Chatbox position's index
 */
let _heightIndex = 2;

/**
 * Buffer para acumular mensagens antes de adicionar ao DOM.
 * @private
 * @type {ChatMessage[]}
 */
let _messageBuffer = [];

/**
 * Flag que indica se um requestAnimationFrame foi agendado para processar o buffer.
 * @private
 * @type {boolean}
 */
let _messageFrame = null;
let _messageGeneration = 0;

/**
 * @var {Preferences} structure
 */
const _preferences = Preferences.get(
	'ChatBox',
	{
		x: 0,
		y: Infinity,
		height: 2,
		fontScale: 1.0,
		magnet_top: false,
		magnet_bottom: true,
		magnet_left: true,
		magnet_right: false,
		tabs: [],
		tabOption: [],
		activeTab: 0,
		layout: null
	},
	1.0
);

/**
 * Create Basic Info component
 */
const ChatBox = new GUIComponent('ChatBox', cssText + logCss + tabsCss);

/**
 * Helper: query inside shadow root
 */
function _root() {
	return ChatBox._shadow || ChatBox._host;
}

/**
 * Render HTML
 */
ChatBox.render = () => htmlText;

/**
 * Has input fields, protect key events
 */
ChatBox.captureKeyEvents = true;

/**
 * Constants
 */
ChatBox.TYPE = {
	SELF: 1 << 0,
	PUBLIC: 1 << 1,
	PRIVATE: 1 << 2,
	PARTY: 1 << 3,
	GUILD: 1 << 4,
	ANNOUNCE: 1 << 5,
	ERROR: 1 << 6,
	INFO: 1 << 7,
	BLUE: 1 << 8,
	ADMIN: 1 << 9,
	MAIL: 1 << 10,
	CLAN: 1 << 11
};

ChatBox.FILTER = {
	PUBLIC_LOG: 0,
	PUBLIC_CHAT: 1,
	WHISPER: 2,
	PARTY: 3,
	GUILD: 4,
	ITEM: 5,
	EQUIP: 6,
	STATUS: 7,
	PARTY_ITEM: 8,
	PARTY_STATUS: 9,
	SKILL_FAIL: 10,
	PARTY_SETUP: 11,
	EQUIP_DAMAGE: 12,
	WOE: 13,
	PARTY_SEARCH: 14,
	BATTLE: 15,
	PARTY_BATTLE: 16,
	EXP: 17,
	PARTY_EXP: 18,
	QUEST: 19,
	BATTLEFIELD: 20,
	CLAN: 21
};

/**
 * @var {number} target message ?
 */
ChatBox.sendTo = ChatBox.TYPE.PUBLIC;

/**
 * Storage to cache the private messages
 */
ChatBox.PrivateMessageStorage = {
	nick: '',
	msg: '',
	blockNicks: []
};

const views = new Map();
const captionWidths = new Map();
// Each tab's log while the box is off screen: it is taken down on every map
// change, a teleport on the same map included, and gets its messages back
const keptLogs = new Map();
let lastRowWidth = 595;
ChatBox.tabStore = new ChatTabStore();
ChatBox.views = views;
Object.defineProperties(ChatBox, {
	tabs: {
		get: () => ChatBox.tabStore.tabs,
		set(tabs) {
			ChatBox.tabStore = new ChatTabStore(tabs);
			views.clear();
			keptLogs.clear();
			captionWidths.clear();
		}
	},
	tabCount: { get: () => ChatBox.tabStore.count },
	lastTabID: { get: () => ChatBox.tabStore.nextId - 1 },
	activeTab: {
		get: () => ChatBox.tabStore.activeDockedId,
		set(id) {
			ChatBox.tabStore.activeDockedId = Number(id);
		}
	}
});

/**
 * Initialize UI
 */
ChatBox.init = function init() {
	const root = _root();

	if (!ContextMenu.__loaded) ContextMenu.prepare();
	_heightIndex = _preferences.height - 1;
	ChatBox.updateHeight();
	ChatBox.applyFontScale();

	// On-screen size: the window may be drawn scaled (UI/UIScale.js)
	const hostRect = this._host.getBoundingClientRect();
	this._host.style.top = `${Math.min(Math.max(0, _preferences.y - hostRect.height), Renderer.height - hostRect.height)}px`;
	this._host.style.left = `${Math.min(Math.max(0, _preferences.x), Renderer.width - hostRect.width)}px`;

	this.magnet.TOP = _preferences.magnet_top;
	this.magnet.BOTTOM = _preferences.magnet_bottom;
	this.magnet.LEFT = _preferences.magnet_left;
	this.magnet.RIGHT = _preferences.magnet_right;

	this.canStartDrag = () => !this.tabStore.locked;
	this.draggable('.input');
	this.draggable('.battlemode');

	// Keep chat log area click-through for walking; only block over interactive UI parts.
	// For GUIComponent, set up manual mouse intersection blocking on interactive elements.
	const interactiveSelector = '.input, .chat-function, .battlemode, .event_add_cursor';
	const interactiveEls = root.querySelectorAll(interactiveSelector);
	interactiveEls.forEach(el => {
		let _intersect;
		let _enter = 0;
		el.addEventListener('mouseenter', () => {
			if (_enter === 0) {
				_intersect = Mouse.intersect;
				_enter++;
				if (_intersect) {
					Mouse.intersect = false;
					Cursor.setType(Cursor.ACTION.DEFAULT);
					EntityManager.setOverEntity(null);
				}
			}
		});
		el.addEventListener('mouseleave', () => {
			if (_enter > 0) {
				_enter--;
				if (_enter === 0 && _intersect && !Session.FreezeUI) {
					Mouse.intersect = true;
					EntityManager.setOverEntity(null);
				}
			}
		});
	});

	// Setting chatbox scrollbar (inject into shadow style)
	Client.loadFiles(
		[DB.INTERFACE_PATH + 'basic_interface/dialscr_down.bmp', DB.INTERFACE_PATH + 'basic_interface/dialscr_up.bmp'],
		(down, up) => {
			const scrollbarCSS = [
				'#chatbox .content::-webkit-scrollbar { width: 10px; height: 10px;}',
				'#chatbox .content::-webkit-scrollbar-button:vertical:start:increment,',
				'#chatbox .content::-webkit-scrollbar-button:vertical:end:decrement { display: none;}',
				'#chatbox .content::-webkit-scrollbar-corner:vertical { display:none;}',
				'#chatbox .content::-webkit-scrollbar-resizer:vertical { display:none;}',
				'#chatbox .content::-webkit-scrollbar-button:start:decrement,',
				'#chatbox .content::-webkit-scrollbar-button:end:increment { display: block; border:none;}',
				`#chatbox .content::-webkit-scrollbar-button:vertical:increment { background: url(${down}) no-repeat; height:10px;}`,
				`#chatbox .content::-webkit-scrollbar-button:vertical:decrement { background: url(${up}) no-repeat; height:10px;}`,
				'#chatbox .content::-webkit-scrollbar-track-piece:vertical { background:black; border:none;}',
				'#chatbox .content::-webkit-scrollbar-thumb:vertical { background:grey; -webkit-border-image:none; border-color:transparent;border-width: 0px 0; }'
			].join('\n');

			const style = document.createElement('style');
			style.textContent = scrollbarCSS;
			if (ChatBox._shadow) {
				ChatBox._shadow.appendChild(style);
			}
		}
	);

	// Input selection
	const usernameInput = root.querySelector('.input input');
	if (usernameInput) {
		usernameInput.addEventListener('mousedown', function (event) {
			this.select();
			event.stopImmediatePropagation();
			event.preventDefault();
		});
	}

	const inputChatbox = root.querySelector('.input-chatbox');

	if (Configs.get('restoreChatFocus', false) && inputChatbox) {
		inputChatbox.addEventListener('blur', () => {
			// An explicit request to leave the chat must not restore focus.
			if (inputChatbox.dataset.skipRestoreFocus) {
				delete inputChatbox.dataset.skipRestoreFocus;
				return;
			}
			Events.setTimeout(() => {
				const active = KEYS.getDeepActiveElement();
				const movedInsideChatbox = active && root.querySelector('#chatbox').contains(active);
				const isTextInput = active && active.tagName && active.tagName.match(/input|select|textarea/i);
				if (!movedInsideChatbox && !isTextInput) {
					inputChatbox.focus();
				}
			}, 1000);
		});
	}

	// Move caret to end of text
	if (inputChatbox) {
		inputChatbox.addEventListener('click', function () {
			setCaretToEnd(this);
		});

		inputChatbox.addEventListener('focus', function () {
			setCaretToEnd(this);
		});

		inputChatbox.maxLength = MAX_LENGTH;

		inputChatbox.addEventListener('input', event => {
			const currentText = extractChatMessage(inputChatbox);
			if (currentText.length >= MAX_LENGTH) {
				event.preventDefault();
			}
		});

		inputChatbox.addEventListener('keydown', event => {
			const currentText = extractChatMessage(inputChatbox);
			if (currentText.length >= MAX_LENGTH) {
				const allowedKeys = [
					'ArrowLeft',
					'ArrowUp',
					'ArrowRight',
					'ArrowDown',
					'Backspace',
					'Delete',
					'Enter',
					'Insert'
				];

				if (allowedKeys.includes(event.key)) {
					return true;
				}

				if (event.ctrlKey || event.altKey) {
					return true;
				}
				event.preventDefault();
				return false;
			}
		});

		inputChatbox.addEventListener('paste', event => {
			event.preventDefault();

			const clipboard = (event.originalEvent || event).clipboardData || event.clipboardData;
			let pastedText = clipboard ? clipboard.getData('text/plain') : '';
			if (!pastedText) {
				return;
			}

			pastedText = pastedText.replace(/\u00A0/g, ' ');

			const currentText = extractChatMessage(inputChatbox);
			const remaining = MAX_LENGTH - currentText.length;
			if (remaining <= 0) {
				return;
			}

			const toInsert = pastedText.substr(0, remaining);

			if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
				document.execCommand('insertText', false, toInsert);
			} else {
				const node = document.createTextNode(toInsert);
				inputChatbox.appendChild(node);
			}
		});
	}

	const nickBox = root.querySelector('.input .username');
	if (nickBox) {
		nickBox.addEventListener('blur', () => {
			Events.setTimeout(() => {
				const active = KEYS.getDeepActiveElement();
				const movedInsideChatbox = active && root.querySelector('#chatbox').contains(active);
				const isTextInput = active && active.tagName && active.tagName.match(/input|select|textarea/i);
				const isChatMessage = active === inputChatbox;
				if (!movedInsideChatbox && !isTextInput && !isChatMessage) {
					nickBox.focus();
				}
			}, 1000);
		});
	}

	// Validate information dragged into text field
	root.querySelectorAll('input[type=text]').forEach(input => {
		input.addEventListener('drop', onDropText);
		input.addEventListener('dragover', stopPropagation);
	});

	// Private message selection
	const listBtn = root.querySelector('.input .list');
	if (listBtn) {
		listBtn.addEventListener('click', function () {
			const names = _historyNickName.list;
			const count = names.length;

			if (!count) {
				ChatBox.addText(DB.getMessage(192), ChatBox.TYPE.ERROR, ChatBox.FILTER.PUBLIC_LOG);
				return;
			}

			ContextMenu.remove();
			ContextMenu.append();

			for (let i = 0; i < count; ++i) {
				ContextMenu.addElement(names[i], onPrivateMessageUserSelection(names[i]));
			}

			ContextMenu.addElement('', onPrivateMessageUserSelection(''));

			const pos = this.getBoundingClientRect();
			const ui = ContextMenu.ui.find('.menu');
			ui.css({
				top: pos.top - ui.height() - 5,
				left: pos.left - ui.width() - 5
			});
		});
		listBtn.addEventListener('mousedown', event => {
			event.stopImmediatePropagation();
			event.preventDefault();
		});
	}

	const draggableEl = root.querySelector('.draggable');
	if (draggableEl) {
		draggableEl.addEventListener('mousedown', event => {
			event.stopPropagation();
		});
	}

	// Send message to...
	const filterBtn = root.querySelector('.input .filter');
	if (filterBtn) {
		filterBtn.addEventListener('click', function () {
			const pos = this.getBoundingClientRect();
			const ui = ContextMenu.ui.find('.menu');

			ContextMenu.remove();
			ContextMenu.append();

			ContextMenu.addElement(DB.getMessage(85), onChangeTargetMessage(ChatBox.TYPE.PUBLIC));
			ContextMenu.addElement(DB.getMessage(86), onChangeTargetMessage(ChatBox.TYPE.PARTY));
			ContextMenu.addElement(DB.getMessage(437), onChangeTargetMessage(ChatBox.TYPE.GUILD));
			ContextMenu.addElement(DB.getMessage(2361), onChangeTargetMessage(ChatBox.TYPE.CLAN));

			ui.css({
				top: pos.top - ui.height() - 5,
				left: pos.left - ui.width() + 25
			});
		});
		filterBtn.addEventListener('mousedown', event => {
			event.stopImmediatePropagation();
			event.preventDefault();
		});
	}

	// Change size
	const sizeBtn = root.querySelector('.input .size');
	if (sizeBtn) {
		sizeBtn.addEventListener('click', event => {
			ChatBox.updateHeight(true);
			event.stopImmediatePropagation();
			event.preventDefault();
		});
	}

	// Scroll feature should block at each line
	root.querySelectorAll('.content').forEach(el => ChatBox.bindLog(el));

	// Tabs should behave like "UI" (no entity hover / map cursor changes)
	(function initTabHoverBlock() {
		let _tabIntersect;
		let _tabEnter = 0;

		root.querySelector('#chatbox').addEventListener(
			'mouseenter',
			event => {
				if (event.target.closest('table.header tr td.tab')) {
					if (_tabEnter === 0) {
						_tabIntersect = Mouse.intersect;
						_tabEnter++;
						if (_tabIntersect) {
							Mouse.intersect = false;
							Cursor.setType(Cursor.ACTION.DEFAULT);
							EntityManager.setOverEntity(null);
						}
					}
				}
			},
			true
		);

		root.querySelector('#chatbox').addEventListener(
			'mouseleave',
			event => {
				if (event.target.closest('table.header tr td.tab')) {
					if (_tabEnter > 0) {
						_tabEnter--;
						if (_tabEnter === 0 && _tabIntersect && !Session.FreezeUI) {
							Mouse.intersect = true;
							EntityManager.setOverEntity(null);
						}
					}
				}
			},
			true
		);

		// Prevent walking when clicking tabs
		root.querySelector('#chatbox').addEventListener(
			'mousedown',
			event => {
				if (event.target.closest('table.header tr td.tab')) {
					event.stopPropagation();
				}
			},
			false
		);
	})();

	// Prevent map right-click (camera rotate) when using chat right-click features
	const chatBody = root.querySelector('.body');
	if (chatBody) {
		chatBody.addEventListener('mousedown', event => {
			if (event.which !== 3) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
		});
	}

	const chatboxEl = root.querySelector('#chatbox');

	// Clicking interactive elements in chat should not trigger map movement
	if (chatboxEl) {
		chatboxEl.addEventListener('mousedown', event => {
			if (event.target.closest('.content a, .content .item-link')) {
				event.stopPropagation();
			}
		});
	}

	const bmtoggle = root.querySelector('.battlemode .bmtoggle');
	if (bmtoggle) {
		bmtoggle.addEventListener('click', () => this.setInputActive(true));
	}

	root.querySelector('.battleopt2').addEventListener('click', () => {
		if (this.tabStore.locked) return;
		if (this.tabCount >= 10) {
			// MSI_FAILED_ADD_TAB is legacy numeric message 1578; CSV tables use its name.
			UIManager.showMessageBox(
				DB.getMessage('MSI_FAILED_ADD_TAB', DB.getMessage(1578, 'Cannot add more.')),
				'ok',
				null,
				true
			);
			return;
		}
		this.addNewTab();
	});
	root.querySelector('.wndminib').addEventListener('click', () => this.removeTab());
	root.querySelector('.stickfucn').addEventListener('click', () => this.detachTab(this.activeTab));
	root.querySelector('.lockdragwnd').addEventListener('click', () => this.setLocked(!this.tabStore.locked));

	const chatmodeBtn = root.querySelector('.chat-function .chatmode');
	if (chatmodeBtn) {
		chatmodeBtn.addEventListener('click', () => {
			ChatBox.toggleChat();
		});
	}

	const battleoptBtn = root.querySelector('.chat-function .battleopt');
	if (battleoptBtn) {
		battleoptBtn.addEventListener('click', () => {
			ChatBox.toggleChatBattleOption();
		});
	}

	// Init settings window as well
	ChatBoxSettings.append();

	this.tabStore = ChatTabStore.fromSaved(_preferences);
	if (!this.tabStore.count) {
		// Create default tabs
		const firstTab = this.tabStore.create({
			name: DB.getMessage(1291),
			filters: [
				ChatBox.FILTER.PUBLIC_LOG,
				ChatBox.FILTER.PUBLIC_CHAT,
				ChatBox.FILTER.WHISPER,
				ChatBox.FILTER.PARTY,
				ChatBox.FILTER.GUILD,
				ChatBox.FILTER.ITEM,
				ChatBox.FILTER.EQUIP,
				ChatBox.FILTER.STATUS,
				ChatBox.FILTER.PARTY_ITEM,
				ChatBox.FILTER.PARTY_STATUS,
				ChatBox.FILTER.SKILL_FAIL,
				ChatBox.FILTER.PARTY_SETUP,
				ChatBox.FILTER.EQUIP_DAMAGE,
				ChatBox.FILTER.WOE,
				ChatBox.FILTER.PARTY_SEARCH,
				ChatBox.FILTER.QUEST,
				ChatBox.FILTER.BATTLEFIELD,
				ChatBox.FILTER.CLAN
			]
		}); // Public Log

		this.tabStore.create({ name: DB.getMessage(1292), filters: Object.values(ChatBox.FILTER) }); // Battle Log

		// switch to first
		this.tabStore.activeDockedId = this.tabStore.selectedId = firstTab.id;
	}

	this.setLocked(this.tabStore.locked);
	// dialog box size
	makeResizableDiv();

	Commands.add(
		'savechat',
		'Saves current chat tab to txt file.',
		() => {
			ChatBox.saveCurrentTabChat();
			return;
		},
		['sc'],
		false
	);

	// Set up item link click handler inside shadow DOM
	ChatBox._setupItemLinkHandler();
};

/**
 * Clean up the box
 */
ChatBox.clean = function Clean() {
	const root = _root();

	cancelMessageDelivery();
	const logs = new Set([...root.querySelectorAll('.content'), ...Array.from(views.values(), view => view.log)]);
	logs.forEach(clearChatLog);

	keptLogs.forEach(clearChatLog);
	keptLogs.clear();
	resetInput(root);

	// Exit and character select: the next character starts without them
	_historyMessage.clear();
	_historyNickName.clear();
};

/**
 * Empty the input. What was typed stays in the history: onRemove() uses this,
 * so Up still recalls it once a map change has built the box again.
 */
function resetInput(root) {
	const inputChatbox = root.querySelector('.input-chatbox');
	if (inputChatbox) inputChatbox.innerHTML = '';

	const nickBox = root.querySelector('.input .username');
	if (nickBox) nickBox.value = '';

	_historyMessage.rewind();
	_historyNickName.rewind();
}

ChatBox.toggleChatBattleOption = function toggleChatBattleOption() {
	if (ChatBoxSettings._host?.style.display !== 'none' && ChatBoxSettings.activeTab === this.activeTab) {
		ChatBoxSettings.ui.hide();
		return;
	}
	this.openTabSettings(this.activeTab);
};

ChatBox.openTabSettings = function openTabSettings(id) {
	const tab = this.tabStore.get(id);
	if (!tab) return;
	ChatBoxSettings.append();
	ChatBoxSettings.updateTab(tab.id, tab.name);
	ChatBoxSettings.ui.show();
};

ChatBox.removeTab = function removeTab(id = this.activeTab) {
	id = Number(id);
	const tab = this.tabStore.get(id);
	if (!tab || (tab.location === 'docked' && (this.tabStore.locked || this.tabStore.dockedOrder.length === 1)))
		return false;
	this.cancelTabGesture?.();
	if (ChatBoxSettings.activeTab === id) {
		ChatBoxSettings.ui.hide();
		ChatBoxSettings.activeTab = null;
	}
	const view = views.get(id);
	if (view) {
		clearChatLog(view.log);
		view.log._disposeChatLog?.();
		view.log.remove();
		view.caption?.remove();
		if (view.floating) UIManager.removeComponent(view.floating);
		views.delete(id);
	}
	delete ChatBoxSettings.tabOption[id];
	captionWidths.delete(id);
	this.tabStore.remove(id);
	this.switchTab(this.activeTab, false);
	return true;
};

function buildCaption(tab) {
	const cell = document.createElement('td');
	cell.className = 'tab';
	cell.dataset.tab = tab.id;
	const frame = document.createElement('div');
	frame.className = 'chat-tab';
	const input = document.createElement('input');
	input.type = 'button';
	input.value = tab.name;
	input.title = tab.name;
	frame.appendChild(input);
	cell.appendChild(frame);
	let original;
	input.addEventListener('click', () => ChatBox.selectTab(tab.id));
	bindReorder(cell, tab.id);
	input.addEventListener('dblclick', event => {
		event.stopPropagation();
		original = tab.name;
		input.type = 'text';
		input.focus();
		input.select();
	});
	const finish = commit => {
		if (input.type !== 'text') return;
		if (commit) ChatBox.tabStore.rename(tab.id, input.value);
		else input.value = original;
		input.type = 'button';
		input.title = tab.name;
		layoutCaption(tab.id);
		if (ChatBoxSettings.activeTab === tab.id) ChatBoxSettings.updateTab(tab.id, tab.name);
	};
	input.addEventListener('blur', () => finish(true));
	input.addEventListener('keydown', event => {
		if (event.key === 'Enter' || event.key === 'Escape') {
			event.preventDefault();
			event.stopImmediatePropagation();
			finish(event.key === 'Enter');
		}
	});
	return cell;
}

function naturalCaptionWidth(name) {
	const span = document.createElement('span');
	const input = _root().querySelector('.header input');
	span.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;width:max-content';
	span.style.font = input ? getComputedStyle(input).font : '12px Arial';
	span.textContent = name;
	_root().querySelector('#chatbox').appendChild(span);
	const frame = _root().querySelector('.chat-tab');
	const style = frame && getComputedStyle(frame);
	const frameWidth = style
		? ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce(
				(sum, key) => sum + (parseFloat(style[key]) || 0),
				0
			)
		: 12;
	const width = measureChatLayout(
		() => Math.ceil(span.getBoundingClientRect().width / (ChatBox.scale || 1)) + frameWidth
	);
	span.remove();
	return Math.max(12, width);
}

function measureChatLayout(read) {
	const host = ChatBox._host;
	if (getComputedStyle(host).display !== 'none') return read();
	const display = host.style.display;
	const visibility = host.style.visibility;
	// A hidden F10 state still needs real row and caption metrics. Do not paint it.
	host.style.visibility = 'hidden';
	host.style.display = 'block';
	try {
		return read();
	} finally {
		host.style.display = display;
		host.style.visibility = visibility;
	}
}

function tabRowWidth() {
	const box = _root().querySelector('#chatbox');
	const width = measureChatLayout(() => {
		const resolved = getComputedStyle(box).width;
		return (
			box.offsetWidth ||
			(resolved.endsWith('px') ? parseFloat(resolved) : 0) ||
			ChatBox._host.getBoundingClientRect().width / (ChatBox.scale || 1)
		);
	});
	if (width > 0) lastRowWidth = width;
	return lastRowWidth;
}

function tabRowBudget() {
	const toolbar = _root().querySelector('.chat-function');
	// Reserve the complete unlocked toolbar plus the gap even while +/- are collapsed.
	const toolbarWidth = Math.max(83, toolbar.getBoundingClientRect().width / (ChatBox.scale || 1));
	return tabRowWidth() - toolbarWidth - 20;
}

function layoutCaption(id) {
	const view = views.get(id),
		tab = ChatBox.tabs[id];
	if (!view?.caption || !tab) return;
	if (tab.location === 'floating') {
		view.caption.style.width = `${Math.min(naturalCaptionWidth(tab.name), (tab.geometry?.width || FLOATING_SIZE.initial.width) - 57)}px`;
		return;
	}
	const used = ChatBox.tabStore.dockedOrder.reduce(
		(width, other) => width + (other === id ? 0 : captionWidths.get(other) || 0),
		0
	);
	const overlap = ChatBox.tabStore.dockedOrder.indexOf(id) > 0 ? 1 : 0;
	const width = Math.min(naturalCaptionWidth(tab.name) - overlap, Math.max(12, tabRowBudget() - used));
	captionWidths.set(id, width);
	view.caption.style.width = `${width}px`;
}

ChatBox.onScale = () => {
	for (const id of ChatBox.tabStore.dockedOrder) layoutCaption(id);
};

ChatBox.canDockTab = function canDockTab(idOrName) {
	const name = typeof idOrName === 'number' ? this.tabs[idOrName]?.name : idOrName;
	if (name === undefined) return false;
	const used = this.tabStore.dockedOrder.reduce((width, id) => width + (captionWidths.get(id) || 0), 0);
	return used + naturalCaptionWidth(name) - (this.tabStore.dockedOrder.length ? 1 : 0) <= tabRowBudget();
};

function initialFloatingGeometry() {
	const scale = ChatBox.scale || 1;
	const floating = Array.from(views.values(), view => view.floating?._host).filter(Boolean);
	let index = 0;
	// kRO reference: start 100px from the viewport corner, then cascade 10px right / 20px down.
	// Reuse a vacant cascade position after deletion instead of covering an existing frame.
	while (
		floating.some(
			host =>
				Math.abs(parseFloat(host.style.left) - (100 + index * 10) * scale) < 0.5 &&
				Math.abs(parseFloat(host.style.top) - (100 + index * 20) * scale) < 0.5
		)
	)
		index++;
	return { x: (100 + index * 10) * scale, y: (100 + index * 20) * scale, ...FLOATING_SIZE.initial };
}

function floatView(tab) {
	const view = views.get(tab.id);
	const position = captureLogPosition(view.log);
	view.floating = createFloatingChatWindow({
		tab,
		log: view.log,
		caption: view.caption,
		geometry: tab.geometry || initialFloatingGeometry(),
		onSelect: () => ChatBox.selectTab(tab.id),
		onDock: () => ChatBox.dockTab(tab.id),
		onDelete: () => ChatBox.removeTab(tab.id),
		onSettings: () => ChatBox.openTabSettings(tab.id),
		onDrop: event => {
			const row = _root().querySelector('.header');
			const rect = row.getBoundingClientRect();
			if (
				rect.width &&
				event.clientX >= rect.left &&
				event.clientX <= rect.right &&
				event.clientY >= rect.top &&
				event.clientY <= rect.bottom
			)
				ChatBox.dockTab(tab.id);
		},
		onLayout: () => layoutCaption(tab.id),
		isLocked: () => ChatBox.tabStore.locked
	});
	layoutCaption(tab.id);
	restoreLogPosition(view.log, position);
}

ChatBox.selectTab = function selectTab(id) {
	const tab = this.tabStore.get(id);
	if (!tab) return;
	this.tabStore.selectedId = tab.id;
	if (tab.location === 'docked') this.switchTab(tab.id);
};

ChatBox.detachTab = function detachTab(id) {
	id = Number(id);
	if (!this.tabStore.detach(id, initialFloatingGeometry())) return false;
	captionWidths.delete(id);
	floatView(this.tabs[id]);
	this.switchTab(this.activeTab, false);
	this.applyFontScale();
	return true;
};

ChatBox.dockTab = function dockTab(id) {
	id = Number(id);
	if (this.tabStore.locked || !this.tabs[id] || this.tabs[id].location !== 'floating' || !this.canDockTab(id))
		return false;
	const view = views.get(id),
		position = captureLogPosition(view.log);
	if (!this.tabStore.dock(id)) return false;
	view.caption.classList.remove('floating-title');
	const order = this.tabStore.dockedOrder;
	const next = views.get(order[order.indexOf(id) + 1])?.caption;
	(next || _root().querySelector('.opttab')).before(view.caption);
	_root().querySelector('.contentwrapper').appendChild(view.log);
	UIManager.removeComponent(view.floating);
	view.floating = null;
	ScrollBar.applyDOMScrollbar(view.log);
	layoutCaption(id);
	this.switchTab(id);
	restoreLogPosition(view.log, position);
	return true;
};

function bindReorder(caption, id) {
	caption.addEventListener('mousedown', event => {
		if (
			event.button !== 0 ||
			ChatBox.tabStore.locked ||
			ChatBox.tabs[id].location !== 'docked' ||
			event.target.type === 'text'
		)
			return;
		const startX = event.clientX,
			startY = event.clientY;
		let moved = false;
		const move = current => {
			if (ChatBox.tabStore.locked) {
				stop();
				return;
			}
			if (Math.hypot(current.clientX - startX, current.clientY - startY) < 4 && !moved) return;
			moved = true;
			for (const other of ChatBox.tabStore.dockedOrder) {
				const element = views.get(other).caption;
				const rect = element.getBoundingClientRect();
				if (other !== id && current.clientX >= rect.left && current.clientX <= rect.right) {
					ChatBox.tabStore.reorder(id, ChatBox.tabStore.dockedOrder.indexOf(other));
					for (const tabID of ChatBox.tabStore.dockedOrder)
						_root().querySelector('.opttab').before(views.get(tabID).caption);
					break;
				}
			}
		};
		const stop = () => {
			window.removeEventListener('mousemove', move);
			window.removeEventListener('mouseup', stop);
			window.removeEventListener('blur', stop);
			ChatBox.cancelTabGesture = null;
		};
		ChatBox.cancelTabGesture?.();
		ChatBox.cancelTabGesture = stop;
		window.addEventListener('mousemove', move);
		window.addEventListener('mouseup', stop);
		window.addEventListener('blur', stop);
	});
}

ChatBox.setLocked = function setLocked(locked) {
	this.tabStore.locked = !!locked;
	if (locked) {
		this.cancelDrag?.();
		this.cancelResize?.();
		this.cancelTabGesture?.();
		for (const view of views.values()) view.floating?.cancelInteraction();
	}
	for (const selector of ['.battleopt2', '.wndminib'])
		_root().querySelector(selector).style.display = locked ? 'none' : '';
	const button = _root().querySelector('.lockdragwnd');
	button.setAttribute('aria-pressed', String(!!locked));
	button.style.width = `${locked ? 9 : 15}px`;

	Client.loadFile(`${DB.INTERFACE_PATH}basic_interface/${locked ? 'lock' : 'unlock'}_dragwnd.bmp`, data => {
		if (this.tabStore.locked === !!locked) button.style.backgroundImage = `url(${data})`;
	});
};

ChatBox.addNewTab = function addNewTab(name, settings) {
	if (this.tabStore.locked) return null;
	if (!settings) settings = this.tabStore.get(this.tabStore.selectedId)?.filters || Object.values(ChatBox.FILTER);
	const candidateName = name ?? `New Tab ${this.tabStore.nextNameNumber}`;
	const location = !this.tabCount || this.canDockTab(candidateName) ? 'docked' : 'floating';
	const tab = this.tabStore.create({ name, filters: settings, location });
	if (!tab) return null;
	createTabView(tab);
	if (location === 'floating') floatView(tab);
	layoutCaption(tab.id);
	this.switchTab(this.activeTab, location === 'docked');
	this.applyFontScale();
	return tab.id;
};

function createTabView(tab) {
	const root = _root();
	const caption = buildCaption(tab);
	root.querySelector('table.header tr .opttab').before(caption);
	const log = keptLogs.get(tab.id) || document.createElement('div');
	keptLogs.delete(tab.id);
	log.className = 'content chat-log';
	log.dataset.content = tab.id;
	log.dataset.scrollbarSkin = 'chatbox';
	root.querySelector('.contentwrapper').appendChild(log);
	ChatBox.bindLog(log);
	views.set(tab.id, { log, caption, floating: null });
	ChatBoxSettings.tabOption[tab.id] = tab.filters;
}

function restoreTabViews() {
	const store = ChatBox.tabStore;
	const order = [...store.dockedOrder];
	captionWidths.clear();
	ChatBoxSettings.tabOption = [];
	let docked = 0;
	for (const id of order) {
		const tab = store.get(id);
		createTabView(tab);
		if (docked && !ChatBox.canDockTab(tab.name)) {
			tab.dockedIndex = order.indexOf(id);
			tab.location = 'floating';
			store.dockedOrder.splice(store.dockedOrder.indexOf(id), 1);
		} else {
			docked++;
			layoutCaption(id);
		}
	}
	for (const tab of Object.values(store.tabs))
		if (tab?.location === 'floating') {
			if (!views.has(tab.id)) createTabView(tab);
			floatView(tab);
		}
	if (!store.dockedOrder.includes(store.activeDockedId)) store.activeDockedId = store.dockedOrder[0];
	ChatBox.switchTab(store.activeDockedId, false);
	ChatBox.applyFontScale();
	ChatBox.setLocked(store.locked);
}

ChatBox.switchTab = function switchTab(tabID, select = true) {
	tabID = Number(tabID);
	if (!this.tabStore.get(tabID) || this.tabStore.get(tabID).location !== 'docked') return;
	this.activeTab = tabID;
	if (select) this.tabStore.selectedId = tabID;
	for (const [id, view] of views) {
		const visible = id === tabID || this.tabs[id].location === 'floating';
		view.caption?.firstElementChild.classList.toggle('on', visible);
		view.log.classList.toggle('active', visible);
	}
};

/**
 * Once append to HTML
 */
ChatBox.onAppend = function OnAppend() {
	if (!views.size && this.tabStore.count) restoreTabViews();
	for (const id of this.tabStore.dockedOrder) layoutCaption(id);
	const root = _root();
	this.setInputActive(false);

	const content = root.querySelector('.content.active');
	if (content) content.scrollTop = content.scrollHeight;
};

/**
 * Stop custom scroll
 */
ChatBox.onRemove = function OnRemove() {
	this.cancelDrag();
	this.cancelResize?.();
	this.cancelTabGesture?.();
	for (const view of views.values()) view.floating?.cancelInteraction();
	flushMessageBuffer();
	cancelMessageDelivery();
	// The bottom on screen: the window may be drawn scaled (UI/UIScale.js)
	_preferences.y = (parseInt(this._host.style.top, 10) || 0) + this._host.getBoundingClientRect().height;
	_preferences.x = parseInt(this._host.style.left, 10) || 0;
	_preferences.height = _heightIndex;
	_preferences.magnet_top = this.magnet.TOP;
	_preferences.magnet_bottom = this.magnet.BOTTOM;
	_preferences.magnet_left = this.magnet.LEFT;
	_preferences.magnet_right = this.magnet.RIGHT;

	_preferences.layout = this.tabStore.toSnapshot();
	_preferences.save();

	ChatBoxSettings.ui.hide();
	ChatBoxSettings.activeTab = null;
	resetInput(_root());
	for (const [id, view] of views) {
		view.log._disposeChatLog?.();
		view.log.remove();
		keptLogs.set(id, view.log);
		view.caption.remove();
		if (view.floating) UIManager.removeComponent(view.floating);
	}
	views.clear();
	captionWidths.clear();
	ChatBoxSettings.tabOption = [];
};

/**
 * @param {number} key id to check
 * @return {boolean} found a shortcut ?
 */
ChatBox.processBattleMode = function processBattleMode(keyId) {
	const root = _root();
	const bmEl = root.querySelector('.battlemode');
	if (
		(bmEl && bmEl.style.display !== 'none') ||
		KEYS.ALT ||
		KEYS.SHIFT ||
		KEYS.CTRL ||
		(keyId >= KEYS.F1 && keyId <= KEYS.F24) ||
		KEYS.INSERT
	) {
		return BattleMode.process(keyId);
	}

	return false;
};

/**
 * Key Event Handler
 */
ChatBox.onKeyDown = function OnKeyDown(event) {
	const root = _root();
	const messageBox = root.querySelector('.input-chatbox');
	const nickBox = root.querySelector('.input .username');

	const activeElement = KEYS.getDeepActiveElement();
	const isChatInputFocused = activeElement === messageBox || activeElement === nickBox;
	const isChatCaption =
		activeElement?.matches?.('input[type=button]') &&
		Array.from(views.values()).some(view => view.caption?.contains(activeElement));
	const isOtherTextInputFocused =
		activeElement &&
		!isChatInputFocused &&
		!isChatCaption &&
		((activeElement.tagName && activeElement.tagName.match(/input|select|textarea/i)) ||
			activeElement.isContentEditable);

	if (isOtherTextInputFocused) {
		return true;
	}

	switch (event.which) {
		default:
			if (isChatInputFocused) {
				if (event.which >= KEYS.F1 && event.which <= KEYS.F24) {
					if (event.which === KEYS.F11 || event.which === KEYS.F12) {
						event.preventDefault();
						return true;
					}

					if (ChatBox.processBattleMode(event.which)) {
						event.preventDefault();
						event.stopImmediatePropagation();
						return false;
					}
					event.preventDefault();
					event.stopImmediatePropagation();
					return false;
				}

				if (event.getModifierState && event.getModifierState('AltGraph')) {
					event.stopImmediatePropagation();
					return true;
				}

				if (event.ctrlKey || KEYS.CTRL) {
					const isEditingCombo =
						event.which === KEYS.C ||
						event.which === KEYS.V ||
						event.which === KEYS.X ||
						event.which === KEYS.A ||
						event.which === KEYS.Z ||
						event.which === KEYS.Y;

					if (!isEditingCombo) {
						if (ChatBox.processBattleMode(event.which)) {
							event.preventDefault();
							event.stopImmediatePropagation();
							return false;
						}
						event.preventDefault();
						return true;
					}

					event.stopImmediatePropagation();
					return true;
				}

				if (event.altKey || KEYS.ALT) {
					// macOS Option composes characters (e.g. Option+Q = '@' on Latin American layouts,
					// Option+2 on Spanish): while typing, insert the character instead of firing the Alt hotkey.
					// On Windows/Linux Alt+key reports the plain key, so hotkeys there are unaffected.
					if (isComposedAltCharacter(event)) {
						event.stopImmediatePropagation();
						return true;
					}

					const isAltEditingCombo =
						event.which === KEYS.LEFT ||
						event.which === KEYS.RIGHT ||
						event.which === KEYS.UP ||
						event.which === KEYS.DOWN ||
						event.which === KEYS.BACKSPACE ||
						event.which === KEYS.DELETE ||
						event.which === KEYS.HOME ||
						event.which === KEYS.END;

					if (!isAltEditingCombo) {
						if (ChatBox.processBattleMode(event.which)) {
							event.preventDefault();
							event.stopImmediatePropagation();
							return false;
						}
						event.preventDefault();
						return true;
					}

					event.stopImmediatePropagation();
					return true;
				}

				// Escape leaves the chat input so Alt hotkeys (e.g. Option+Q) open their windows again
				if (event.which === KEYS.ESCAPE || event.key === 'Escape') {
					activeElement.dataset.skipRestoreFocus = '1';
					activeElement.blur();
					event.stopImmediatePropagation();
					return false;
				}

				event.stopImmediatePropagation();
				return true;
			}

			if (
				(event.target.tagName && !event.target.tagName.match(/input|select|textarea/i)) ||
				(event.which >= KEYS.F1 && event.which <= KEYS.F24) ||
				KEYS.ALT ||
				KEYS.SHIFT ||
				KEYS.CTRL
			) {
				if (ChatBox.processBattleMode(event.which)) {
					event.stopImmediatePropagation();
					return false;
				}
			}
			return true;

		// Message from history
		case KEYS.UP:
			if (!document.querySelector('#NpcMenu')) {
				if (activeElement === messageBox) {
					if (shouldLetChatInputHandleVerticalArrows(messageBox, 'up')) {
						event.stopImmediatePropagation();
						return true;
					}
					messageBox.innerHTML = _historyMessage.previous();
					break;
				}

				if (activeElement === nickBox) {
					nickBox.value = _historyNickName.previous();
					nickBox.select();
					break;
				}
			}
			return true;

		case KEYS.DOWN:
			if (!document.querySelector('#NpcMenu')) {
				if (activeElement === messageBox) {
					if (shouldLetChatInputHandleVerticalArrows(messageBox, 'down')) {
						event.stopImmediatePropagation();
						return true;
					}
					messageBox.innerHTML = _historyMessage.next();
					break;
				}

				if (activeElement === nickBox) {
					nickBox.value = _historyNickName.next();
					nickBox.select();
					break;
				}
			}
			return true;

		// Update chat height
		case KEYS.F10:
			this.updateHeight(false);
			{
				const activeContent = root.querySelector(`.content[data-content="${this.activeTab}"]`);
				if (activeContent) activeContent.scrollTop = activeContent.scrollHeight;
			}
			break;

		// Send message
		case KEYS.ENTER: {
			// A focused button owns Enter - activation is its default action.
			// This handler runs on window in the capture phase, so cancelling
			// that default leaves every button in the client reachable by Tab
			// but dead to Enter. Space already works, because a button
			// activates on Space keyup, which never reaches this branch.
			if (activeElement && activeElement.tagName === 'BUTTON' && !root.contains(activeElement)) {
				return true;
			}

			if (document.activeElement.className === 'message input-chatbox' && document.activeElement !== messageBox) {
				return true;
			}

			if (document.querySelector('#NpcMenu, #NpcBox')) {
				return true;
			}

			if (activeElement === messageBox) {
				this.submit();
				event.stopImmediatePropagation();
				return false;
			}

			this.setInputActive(true);
			event.stopImmediatePropagation();
			return false;
		}
	}

	event.stopImmediatePropagation();
	return false;
};

ChatBox.toggleChat = function toggleChat() {
	const root = _root();
	const messageBox = root.querySelector('.input-chatbox');

	const activeElement = KEYS.getDeepActiveElement();
	if (activeElement.tagName === 'INPUT' && activeElement !== messageBox) {
		return true;
	}

	if (document.querySelector('#NpcMenu, #NpcBox')) {
		return true;
	}

	messageBox.focus();
	this.submit();
};

/**
 * Switch the shared input slot without changing the chat frame's geometry.
 */
ChatBox.setInputActive = function setInputActive(active) {
	const root = _root();
	const input = root.querySelector('.input');
	const battle = root.querySelector('.battlemode');
	const message = root.querySelector('.input-chatbox');
	const focused = KEYS.getDeepActiveElement();

	if (!active && focused && input?.contains(focused)) {
		if (focused === message) focused.dataset.skipRestoreFocus = '1';
		focused.blur();
		delete focused.dataset.skipRestoreFocus;
	}

	if (input) input.style.display = active ? 'block' : 'none';
	if (battle) battle.style.display = active ? 'none' : 'block';

	if (active && message) {
		message.focus();
		setCaretToEnd(message);
	}

	Client.loadFile(`${DB.INTERFACE_PATH}basic_interface/chatmode_${active ? 'on' : 'off'}.bmp`, data => {
		const button = root.querySelector('.chat-function .chatmode');
		if (button) button.style.backgroundImage = `url(${data})`;
	});
};

/**
 * Process ChatBox message
 */
ChatBox.submit = function Submit() {
	const root = _root();
	const inputEl = root.querySelector('.input');
	const $user = root.querySelector('.input .username');
	const $text = root.querySelector('.input-chatbox');

	const user = $user ? $user.value : '';
	const text = extractChatMessage($text);
	const trimmedText = text.replace(/\u00A0/g, ' ').trim();

	// Battle mode
	if (!trimmedText.length) {
		this.setInputActive(inputEl?.style.display === 'none');

		return;
	}

	// Private message
	if (user.length && trimmedText[0] !== '/') {
		this.PrivateMessageStorage.nick = user;
		this.PrivateMessageStorage.msg = trimmedText;
		_historyNickName.push(user);
		_historyNickName.previous();
	}

	// Save in history
	_historyMessage.push(trimmedText);

	$text.innerHTML = '';

	// Command
	if (trimmedText[0] === '/') {
		Commands.processCommand.call(this, trimmedText.substr(1));
		return;
	}

	this.onRequestTalk(user, trimmedText, ChatBox.sendTo);
};

/**
 * Whether an Alt/Option keydown produces a different printable character than its key
 * (macOS Option layer, dead keys), i.e. the user is typing rather than using a hotkey.
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
function isComposedAltCharacter(event) {
	if (event.ctrlKey || event.metaKey || !event.key) {
		return false;
	}
	if (event.key === 'Dead') {
		return true;
	}
	if (event.key.length !== 1) {
		return false;
	}
	// Only letter/digit keys: their unmodified character is known from event.code
	const match = /^(?:Key|Digit)(.)$/.exec(event.code || '');
	return !!match && event.key.toUpperCase() !== match[1];
}

/**
 * Move caret to the end of a contenteditable element.
 * Uses Selection.collapse(): WebKit ignores addRange() for ranges inside a shadow root, so the
 * removeAllRanges()+addRange() idiom left Safari with no caret and typing went nowhere.
 * @param {HTMLElement} el
 */
function setCaretToEnd(el) {
	window.getSelection().collapse(el, el.childNodes.length);
}

/**
 * Extract plain chat text from the contenteditable input while preserving item links.
 */
function extractChatMessage(inputEl) {
	if (!inputEl) return '';
	const clone = inputEl.cloneNode(true);

	clone.querySelectorAll('span.item-link').forEach(el => {
		const itemData = el.getAttribute('data-item') || el.dataset.item || '';
		el.replaceWith(document.createTextNode(itemData));
	});

	let result = clone.textContent;
	result = result.replace(/\u00A0/g, ' ');
	return result;
}

const ITEM_LINK = /(<ITEMLINK>.*?<\/ITEMLINK>|<ITEML>.*?<\/ITEML>|<ITEM>.*?<\/ITEM>)/i;

/**
 * Escape text for use in HTML content and quoted attributes.
 * @param {string} text
 * @returns {string}
 */
ChatBox.escapeHTML = function escapeHTML(text) {
	return text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
};

/**
 * Render a received message as HTML: colour codes dropped, item links clickable, the rest as text.
 *
 * @param {string} text
 * @returns {string}
 * @see docs/reference/chat/text-parsing.md
 */
ChatBox.messageToHTML = function messageToHTML(text) {
	return text
		.replace(/\^[0-9A-Fa-f]{6}/g, '')
		.split(ITEM_LINK)
		.map((part, i) => {
			if (!(i % 2)) {
				return ChatBox.escapeHTML(part);
			}
			const item = DB.parseItemLink(part);
			return (
				`<span data-item="${ChatBox.escapeHTML(part)}" class="item-link" style="color:#FFFF63; cursor:pointer;">` +
				`&lt;${ChatBox.escapeHTML(item.name)}&gt;</span>`
			);
		})
		.join('');
};

/**
 * Add text to chatbox
 *
 * @see docs/reference/chat/text-parsing.md
 */
ChatBox.addText = function addText(text, colorType, filterType, color, override) {
	// The client drops ^RRGGBB codes: a chat line has one colour.
	text = text.replace(/\^[0-9A-Fa-f]{6}/g, '');

	// An item link turns the line into HTML: the text around it must stay text.
	if (!override && ITEM_LINK.test(text)) {
		text = ChatBox.messageToHTML(text);
		override = true;
	}

	if (isNaN(filterType)) {
		filterType = ChatBox.FILTER.PUBLIC_LOG;
	}

	queueChatMessage({ text, colorType, filterType, color, override });
};

function queueChatMessage(message) {
	retainExportUrl(message.exportUrl);
	_messageBuffer.push(message);
	// Loose check: a synchronous requestAnimationFrame (as in tests) leaves it undefined.
	if (_messageFrame != null) return;
	const generation = _messageGeneration;
	_messageFrame = requestAnimationFrame(() => {
		if (generation !== _messageGeneration) return;
		_messageFrame = null;
		flushMessageBuffer();
	});
}

function cancelMessageDelivery() {
	_messageGeneration++;
	if (_messageFrame != null) cancelAnimationFrame(_messageFrame);
	_messageFrame = null;
	for (const message of _messageBuffer) releaseExportUrl(message.exportUrl);
	_messageBuffer = [];
}

function flushMessageBuffer() {
	const messages = _messageBuffer;
	_messageBuffer = [];
	try {
		Object.values(ChatBox.tabs).forEach(tab => {
			const id = tab.id;
			const log =
				views.get(id)?.log || keptLogs.get(id) || _root().querySelector(`.content[data-content="${id}"]`);
			const filters = ChatBoxSettings.tabOption[id] || tab.filters;
			if (!log || !filters) return;
			appendChatMessages(
				log,
				messages.filter(message => filters.includes(message.filterType)),
				MAX_MSG,
				getColorForType
			);
		});
	} finally {
		for (const message of messages) releaseExportUrl(message.exportUrl);
	}
}

function getColorForType(colorType) {
	if (colorType & ChatBox.TYPE.PUBLIC && colorType & ChatBox.TYPE.SELF) {
		return '#00FF00';
	} else if (colorType & ChatBox.TYPE.PARTY) {
		return colorType & ChatBox.TYPE.SELF ? 'rgb(200, 200, 100)' : 'rgb(230,215,200)';
	} else if (colorType & ChatBox.TYPE.GUILD) {
		return 'rgb(180, 255, 180)';
	} else if (colorType & ChatBox.TYPE.PRIVATE) {
		return '#FFFF00';
	} else if (colorType & ChatBox.TYPE.ERROR) {
		return '#FF0000';
	} else if (colorType & ChatBox.TYPE.INFO) {
		return '#FFFF63';
	} else if (colorType & ChatBox.TYPE.BLUE) {
		return '#00FFFF';
	} else if (colorType & ChatBox.TYPE.ADMIN) {
		return '#FFFF00';
	} else if (colorType & ChatBox.TYPE.MAIL) {
		return '#F4D293';
	}
	return 'white';
}

/**
 * Change chatbox's height
 */
ChatBox.updateHeight = function changeHeight(AlwaysVisible) {
	const root = _root();
	const HeightList = [0, 0, MAGIC_NUMBER, MAGIC_NUMBER * 2, MAGIC_NUMBER * 3, MAGIC_NUMBER * 4, MAGIC_NUMBER * 5];
	const content = root.querySelector('.contentwrapper');
	const bottomBefore = getChatBottomAnchorPx(root, this.__lastBottomY);

	_heightIndex = (_heightIndex + 1) % HeightList.length;

	if (_heightIndex === 0 && AlwaysVisible) {
		_heightIndex = 1;
	}

	if (content) content.style.height = `${HeightList[_heightIndex]}px`;

	const header = root.querySelector('.header');
	const body = root.querySelector('.body');
	const chatbox = root.querySelector('#chatbox');
	chatbox?.classList.toggle('minimal', _heightIndex === 1);

	switch (_heightIndex) {
		case 0:
			this.__lastBottomY = bottomBefore;
			this._host.style.display = 'none';
			break;

		case 1:
			this._host.style.display = 'block';
			if (header) header.style.display = 'none';
			if (body) body.style.display = 'none';
			break;

		default:
			if (header) header.style.display = '';
			if (body) body.style.display = '';
			break;
	}

	if (_heightIndex !== 0 && isFinite(bottomBefore)) {
		const bottomAfter = getChatBottomAnchorPx(root, bottomBefore);
		if (isFinite(bottomAfter)) {
			let top = parseInt(this._host.style.top, 10);
			top = isFinite(top) ? top : 0;
			this._host.style.top = `${top + (bottomBefore - bottomAfter)}px`;
			this.__lastBottomY = bottomBefore;
		}
	}

	const active = root.querySelector(`.content[data-content="${this.activeTab}"]`);
	if (active) {
		active.scrollTop = active.scrollHeight;
	}
};

function getChatBottomAnchorPx(root, fallback) {
	// Hidden descendants have zero rectangles; keep the last visible anchor.
	if (ChatBox._host.style.display === 'none') {
		return fallback;
	}

	const inputEl = root.querySelector('.input');
	if (inputEl && inputEl.style.display !== 'none') {
		const rect = inputEl.getBoundingClientRect();
		return rect.bottom;
	}

	const bmEl = root.querySelector('.battlemode');
	if (bmEl && bmEl.style.display !== 'none') {
		const rect = bmEl.getBoundingClientRect();
		return rect.bottom;
	}

	return fallback;
}

/**
 * Determine if vertical arrow should scroll the contenteditable rather than navigate history
 */
function shouldLetChatInputHandleVerticalArrows(inputEl, direction) {
	if (!inputEl) {
		return false;
	}

	const sel = window.getSelection();
	if (!sel || sel.rangeCount < 1) {
		return false;
	}

	const range = sel.getRangeAt(0);
	if (!range) {
		return false;
	}

	const anchorNode = sel.anchorNode || range.startContainer;
	if (!anchorNode) {
		return false;
	}

	if (anchorNode !== inputEl && !(inputEl.contains && inputEl.contains(anchorNode))) {
		return false;
	}

	if (!sel.isCollapsed) {
		return true;
	}

	const text = extractChatMessage(inputEl);
	const hasNewline = text.indexOf('\n') > -1;
	const hasOverflow = inputEl.scrollHeight > inputEl.clientHeight + 1;
	if (!hasNewline && !hasOverflow) {
		return false;
	}

	let caretRect;
	try {
		caretRect =
			range.getClientRects && range.getClientRects().length
				? range.getClientRects()[0]
				: range.getBoundingClientRect();
	} catch (_e) {
		return true;
	}

	if (!caretRect) {
		return true;
	}

	const inputRect = inputEl.getBoundingClientRect ? inputEl.getBoundingClientRect() : null;
	if (!inputRect) {
		return true;
	}

	if (direction === 'up') {
		return caretRect.top > inputRect.top + 2;
	}

	if (direction === 'down') {
		return caretRect.bottom < inputRect.bottom - 2;
	}

	return false;
}

/**
 * Save user name to nick name history
 */
ChatBox.saveNickName = function saveNickName(pseudo) {
	_historyNickName.push(pseudo);
};

/**
 * Save chat from current tab into a file.
 */
ChatBox.saveCurrentTabChat = function saveCurrentTabChat() {
	const root = _root();

	const tzoffset = new Date().getTimezoneOffset() * 60000;
	let localISOTime = new Date(Date.now() - tzoffset).toISOString().slice(0, -1);
	localISOTime = localISOTime.replace('T', ' ');
	const timezone = new Date().getTimezoneOffset() / 60;
	const date = `${localISOTime} (GMT ${timezone > 0 ? '-' : '+'}${Math.abs(timezone).toString()})`;

	const selectedId = this.tabStore.selectedId ?? this.activeTab;
	const contentEl = views.get(selectedId)?.log || root.querySelector(`.content[data-content="${selectedId}"]`);

	let data =
		'<html><head><title>Chat History</title><style> body { background-color: DarkSlateGray; } </style></head><body>';
	data += contentEl
		? chatMessages(contentEl)
				.map(message => message.outerHTML)
				.join('')
		: '';
	data += '</body></html>';

	const url = URL.createObjectURL(new Blob([data], { type: 'text/html' }));
	const name = ChatBox.tabs[selectedId].name;
	const node = document.createElement('span');
	node.appendChild(document.createTextNode(`Chat History [${name}] ${date} can be saved by `));
	const link = document.createElement('a');
	link.style.color = '#F88';
	link.download = `ChatHistory [${name}] (${date.replace('/', '-')}).html`;
	link.href = url;
	link.target = '_blank';
	link.textContent = 'clicking here';
	node.appendChild(link);
	node.appendChild(document.createTextNode('.'));
	queueChatMessage({ node, exportUrl: url, colorType: ChatBox.TYPE.PUBLIC, filterType: ChatBox.FILTER.PUBLIC_LOG });
};

ChatBox.bindLog = function bindLog(log) {
	log._disposeChatLog = bindChatLog(log, {
		onItem(link) {
			const item = DB.parseItemLink(link.dataset.item);
			if (!item) return;
			const info = UIManager.getComponent('ItemInfo');
			info.append();
			info.setItem(item);
		},
		onNickname(nickname) {
			if (nickname)
				import('UI/Components/WhisperBox/WhisperBox.js').then(({ default: WhisperBox }) =>
					WhisperBox.show(nickname)
				);
		},
		onFontMenu(event) {
			Mouse.screen.x = event.pageX;
			Mouse.screen.y = event.pageY;
			ContextMenu.remove();
			ContextMenu.append();
			for (const scale of [1, 1.2, 1.4])
				ContextMenu.addElement(`Chat font x${scale.toFixed(1)}`, setChatFontScale(scale));
		}
	});
};

/**
 * Validate the type of information being dropped into the text field
 */
function onDropText(event) {
	event.stopImmediatePropagation();
	event.preventDefault();
	let data;
	try {
		data = JSON.parse(event.dataTransfer.getData('Text'));
	} catch (_e) {
		return;
	}

	if (data.type == 'item') {
		return;
	}

	event.currentTarget.value = data;
}

/**
 * Stop event propagation
 */
function stopPropagation(event) {
	event.stopImmediatePropagation();
	event.preventDefault();
}

/**
 * Change private message nick name
 */
function onPrivateMessageUserSelection(name) {
	return function onPrivateMessageUserSelectionClosure() {
		const root = _root();
		const nickBox = root.querySelector('.input .username');
		if (nickBox) nickBox.value = name;
	};
}

/**
 * Change target of global chat (party, guild)
 */
function onChangeTargetMessage(type) {
	return function onChangeTargetMessageClosure() {
		const root = _root();
		const $input = root.querySelector('.input-chatbox');

		if ($input) {
			$input.classList.remove('guild', 'party', 'clan');

			if (type & ChatBox.TYPE.PARTY) {
				$input.classList.add('party');
			} else if (type & ChatBox.TYPE.GUILD) {
				$input.classList.add('guild');
			} else if (type & ChatBox.TYPE.CLAN) {
				$input.classList.add('clan');
			}
		}

		ChatBox.sendTo = type;
	};
}

function setChatFontScale(scale) {
	return function setChatFontScaleClosure() {
		_preferences.fontScale = clampChatFontScale(scale);
		_preferences.save();
		ChatBox.applyFontScale();
	};
}

function clampChatFontScale(scale) {
	const allowed = [1.0, 1.2, 1.4];
	let best = allowed[0];
	let bestDist = Infinity;

	scale = parseFloat(scale);
	if (!isFinite(scale) || scale <= 0) {
		return 1.0;
	}

	for (let i = 0; i < allowed.length; ++i) {
		const dist = Math.abs(allowed[i] - scale);
		if (dist < bestDist) {
			bestDist = dist;
			best = allowed[i];
		}
	}

	return best;
}

ChatBox.applyFontScale = function applyFontScale() {
	const root = _root();
	const scale = clampChatFontScale(_preferences.fontScale || 1.0);
	const baseFont = 12;
	const baseLineHeight = 14;
	const baseInputLineHeight = 18;

	const fontSize = Math.max(10, Math.round(baseFont * scale));
	const lineHeight = Math.max(12, Math.round(baseLineHeight * scale));
	const inputLineHeight = Math.max(14, Math.round(baseInputLineHeight * scale));

	_preferences.fontScale = scale;

	// Chat log
	const logs = new Set([...root.querySelectorAll('.content'), ...Array.from(views.values(), view => view.log)]);
	logs.forEach(el => {
		el.style.fontSize = `${fontSize}px`;
		el.style.lineHeight = `${lineHeight}px`;
	});

	// Chat input
	root.querySelectorAll('.input input, .input .message').forEach(el => {
		el.style.fontFamily = 'Arial';
		el.style.fontSize = `${fontSize}px`;
	});

	const message = root.querySelector('.input .message');
	if (message) {
		message.style.lineHeight = `${inputLineHeight}px`;
	}
};

function makeResizableDiv() {
	const root = _root();
	const resizer = root.querySelector('.event_add_cursor');
	if (!resizer) {
		return;
	}

	let originalHeight = 0;
	let originalAnchorY = 0;
	let originalMouseY = 0;
	let scale = 1;

	const fixHeight = height => Math.floor(height / MAGIC_NUMBER) * MAGIC_NUMBER;

	const resize = e => {
		if (ChatBox.tabStore.locked) {
			stopResize();
			return;
		}
		// Heights are in the window, the pointer and the anchor on screen (UI/UIScale.js)
		let height = fixHeight(originalHeight - (e.pageY - originalMouseY) / scale);
		height = Math.max(MAGIC_NUMBER, Math.min(MAGIC_NUMBER * 5, height));

		ChatBox._host.style.top = `${originalAnchorY - height * scale}px`;
		const contentWrapper = root.querySelector('.contentwrapper');
		if (contentWrapper) contentWrapper.style.height = `${height}px`;
		_heightIndex = Math.max(2, Math.min(6, height / MAGIC_NUMBER + 1));

		const active = root.querySelector(`.content[data-content="${ChatBox.activeTab}"]`);
		if (active) {
			active.scrollTop = active.scrollHeight;
		}
	};

	const stopResize = () => {
		window.removeEventListener('mousemove', resize);
		window.removeEventListener('mouseup', stopResize);
	};

	ChatBox.cancelResize = stopResize;
	resizer.addEventListener('mousedown', e => {
		if (ChatBox.tabStore.locked) return;
		e.preventDefault();
		const contentWrapper = root.querySelector('.contentwrapper');
		originalHeight = contentWrapper ? contentWrapper.offsetHeight : 0;
		scale = ChatBox.scale;
		originalAnchorY = (parseInt(ChatBox._host.style.top, 10) || 0) + originalHeight * scale;
		originalMouseY = e.pageY;

		window.addEventListener('mousemove', resize);
		window.addEventListener('mouseup', stopResize);
	});
}

// CLICKABLE ITEM → OPEN ITEMINFO (handle inside shadow)
ChatBox._setupItemLinkHandler = function _setupItemLinkHandler() {
	const root = _root();
	if (!root) return;

	root.addEventListener('click', event => {
		const link = event.target.closest('.item-link');
		if (!link) return;

		// If the link is inside the chat input, keep focus there
		if (link.closest('.input-chatbox')) {
			event.stopImmediatePropagation();
			return;
		}

		const item = DB.parseItemLink(link.dataset.item || link.getAttribute('data-item'));
		if (!item) return;

		const ItemInfo = UIManager.getComponent('ItemInfo');
		ItemInfo.append();
		ItemInfo.setItem(item);
	});
};

// Also keep global handler for item links outside shadow (backwards compatibility)
document.addEventListener('click', event => {
	const link = event.target.closest('.item-link');
	if (!link) {
		return;
	}

	if (link.closest('#chatbox .input-chatbox')) {
		event.stopImmediatePropagation();
		event.preventDefault();
		return;
	}

	const item = DB.parseItemLink(link.dataset.item);
	if (!item) {
		return;
	}

	const ItemInfo = UIManager.getComponent('ItemInfo');
	ItemInfo.append();
	ItemInfo.setItem(item);
});

ChatBox.insertText = function (text) {
	const root = _root();
	const input = root.querySelector('.input-chatbox');
	if (!input) return;

	input.appendChild(document.createTextNode(text));
	input.focus();
};

// Override mouseMode to CROSS since chatbox body is click-through
ChatBox.mouseMode = GUIComponent.MouseMode.CROSS;

/**
 * Create component and export it
 */
export default UIManager.addComponent(ChatBox);
