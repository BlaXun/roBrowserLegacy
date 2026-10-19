import WheelSteps from 'UI/WheelSteps.js';
import UIScale from 'UI/UIScale.js';

// Only chat exports participate in this ownership map; skin/item URLs are not ours.
const exportOwners = new Map();
const messageExports = new WeakMap();
const bindings = new WeakMap();

export function retainExportUrl(url) {
	if (url) exportOwners.set(url, (exportOwners.get(url) || 0) + 1);
}

export function releaseExportUrl(url) {
	if (!url || !exportOwners.has(url)) return;
	const remaining = exportOwners.get(url) - 1;
	if (remaining) exportOwners.set(url, remaining);
	else {
		exportOwners.delete(url);
		URL.revokeObjectURL(url);
	}
}

export function chatMessages(log) {
	return Array.from(log.children).filter(child => child.classList.contains('chat-message'));
}

function removeMessage(message) {
	releaseExportUrl(messageExports.get(message));
	messageExports.delete(message);
	message.remove();
}

export function clearChatLog(log) {
	chatMessages(log).forEach(removeMessage);
}

export function appendChatMessages(log, messages, maxMessages, colorForType) {
	const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 5;
	const fragment = document.createDocumentFragment();
	for (const message of messages) {
		const div = document.createElement('div');
		div.className = 'chat-message';
		div.style.color = message.color || colorForType(message.colorType);
		if (message.node) div.appendChild(message.node.cloneNode(true));
		else if (message.override) div.innerHTML = message.text;
		else {
			div.style.whiteSpace = 'pre-line';
			div.textContent = message.text;
		}
		if (message.exportUrl) {
			retainExportUrl(message.exportUrl);
			messageExports.set(div, message.exportUrl);
		}
		fragment.appendChild(div);
	}
	log.appendChild(fragment);
	const rendered = chatMessages(log);
	for (let i = 0; i < rendered.length - maxMessages; i++) removeMessage(rendered[i]);
	if (atBottom) log.scrollTop = log.scrollHeight;
}

export function captureLogPosition(log) {
	const top = log.getBoundingClientRect().top;
	const anchor = chatMessages(log).find(message => message.getBoundingClientRect().bottom > top);
	return {
		atBottom: log.scrollTop + log.clientHeight >= log.scrollHeight - 5,
		anchor,
		offset: anchor ? (anchor.getBoundingClientRect().top - top) / UIScale.ofElement(log) : 0,
		scrollTop: log.scrollTop
	};
}

export function restoreLogPosition(log, position) {
	if (position.atBottom) log.scrollTop = log.scrollHeight;
	else if (position.anchor?.parentNode === log) {
		log.scrollTop +=
			(position.anchor.getBoundingClientRect().top - log.getBoundingClientRect().top) / UIScale.ofElement(log) -
			position.offset;
	} else log.scrollTop = Math.max(0, Math.min(position.scrollTop, log.scrollHeight - log.clientHeight));
	log._roScrollbarRestart?.();
}

export function bindChatLog(log, { onItem, onNickname, onFontMenu }) {
	bindings.get(log)?.();
	const wheel = event => {
		const rowHeight = parseFloat(getComputedStyle(log).lineHeight) || 14;
		WheelSteps.scrollRows(event, log, rowHeight);
		event.preventDefault();
	};
	const down = event => {
		if (event.button === 2 || event.target.closest('a, .item-link, .nickname-link')) event.stopPropagation();
	};
	const click = event => {
		const item = event.target.closest('.item-link');
		const nickname = event.target.closest('.nickname-link');
		if (item) onItem(item);
		else if (nickname) onNickname(nickname.dataset.nickname);
		if (item || nickname) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	};
	const contextmenu = event => {
		if (event.target.closest('a, .item-link, .nickname-link, .ro-custom-scrollbar')) return;
		event.preventDefault();
		event.stopPropagation();
		onFontMenu(event);
	};
	const handlers = { wheel, mousedown: down, click, contextmenu };
	for (const [name, handler] of Object.entries(handlers)) log.addEventListener(name, handler);
	const dispose = () => {
		for (const [name, handler] of Object.entries(handlers)) log.removeEventListener(name, handler);
		bindings.delete(log);
	};
	bindings.set(log, dispose);
	return dispose;
}
