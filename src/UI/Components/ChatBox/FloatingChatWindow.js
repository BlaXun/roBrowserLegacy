import GUIComponent from 'UI/GUIComponent.js';
import UIManager from 'UI/UIManager.js';
import ScrollBar from 'UI/Scrollbar.js';
import { captureLogPosition, restoreLogPosition } from './ChatLogView.js';
import cssText from './FloatingChatWindow.css?raw';
import logCss from './ChatLogView.css?raw';

import { FLOATING_SIZE } from './ChatTabStore.js';

export default function createFloatingChatWindow({
	tab,
	log,
	caption,
	geometry,
	onSelect,
	onDock,
	onDelete,
	onSettings,
	onDrop,
	onLayout,
	isLocked
}) {
	const component = new GUIComponent(`ChatBox:tab:${tab.id}`, cssText + logCss);
	component.scaleName = 'ChatBox';
	component.needFocus = true;
	component.mouseMode = GUIComponent.MouseMode.CROSS;
	component.dragThreshold = 4;
	component.dragOpacity = 0.7;
	component.canStartDrag = event => !isLocked() && !event.target?.closest('input[type="text"]');
	component.render = () =>
		`<div class="floating-chat"><div class="floating-header"><div class="floating-controls"><button class="settings" data-background="basic_interface/battle_option2_a.bmp"></button><button class="dock" data-background="basic_interface/stickon.bmp"></button><button class="delete" data-background="basic_interface/wnd_mini_b.bmp"></button></div></div><div class="floating-body chat-frame-corner"></div><div class="floating-footer"><div class="resizer draggable" data-background="btn_resize.bmp"></div></div></div>`;
	let stopResize = () => {};
	const updateGeometry = () => {
		tab.geometry = {
			x: parseFloat(component._host.style.left) || 0,
			y: parseFloat(component._host.style.top) || 0,
			width: parseFloat(component._host.style.width),
			height: parseFloat(component._host.style.height)
		};
	};
	component.init = function init() {
		const root = this.getRoot();
		caption.classList.add('floating-title');
		root.querySelector('.floating-header').prepend(caption);
		root.querySelector('.floating-body').appendChild(log);
		this.draggable(caption);
		root.querySelector('.dock').addEventListener('click', onDock);
		root.querySelector('.delete').addEventListener('click', onDelete);
		root.querySelector('.settings').addEventListener('click', onSettings);
		root.querySelector('.floating-header').addEventListener('mousedown', event => event.stopPropagation());
		// CROSS keeps log backgrounds walk-through; raise/select before title controls stop bubbling.
		this._host.addEventListener(
			'mousedown',
			() => {
				onSelect();
				this.focus();
			},
			true
		);
		root.querySelector('.resizer').addEventListener('mousedown', event => {
			if (event.button !== 0 || isLocked()) return;
			event.preventDefault();
			event.stopPropagation();
			stopResize();
			const initial = {
				x: event.clientX,
				y: event.clientY,
				width: parseFloat(this._host.style.width),
				height: parseFloat(this._host.style.height),
				scale: this.scale
			};
			const resize = move => {
				if (isLocked()) {
					stopResize();
					return;
				}
				const position = captureLogPosition(log);
				this._host.style.width = `${Math.max(FLOATING_SIZE.min.width, Math.min(FLOATING_SIZE.max.width, initial.width + (move.clientX - initial.x) / initial.scale))}px`;
				this._host.style.height = `${Math.max(FLOATING_SIZE.min.height, Math.min(FLOATING_SIZE.max.height, initial.height + (move.clientY - initial.y) / initial.scale))}px`;
				this._fixPositionOverflow();
				updateGeometry();
				onLayout();
				restoreLogPosition(log, position);
			};
			stopResize = () => {
				window.removeEventListener('mousemove', resize);
				window.removeEventListener('mouseup', stopResize);
				window.removeEventListener('blur', stopResize);
			};
			window.addEventListener('mousemove', resize);
			window.addEventListener('mouseup', stopResize);
			window.addEventListener('blur', stopResize);
		});
	};
	component.onDragStop = (event, { moved, cancelled }) => {
		updateGeometry();
		if (moved && !cancelled) onDrop(event);
	};
	component.cancelInteraction = () => {
		component.cancelDrag();
		stopResize();
	};
	component.onRemove = () => {
		component.cancelInteraction();
		component.disposeDragging();
	};
	component.onScale = () => {
		log._roScrollbarRestart?.();
		onLayout();
	};
	UIManager.addComponent(component);
	component.append();
	Object.assign(component._host.style, {
		left: `${geometry.x}px`,
		top: `${geometry.y}px`,
		width: `${geometry.width}px`,
		height: `${geometry.height}px`
	});
	component._fixPositionOverflow();
	updateGeometry();
	ScrollBar.applyDOMScrollbar(log);
	return component;
}
