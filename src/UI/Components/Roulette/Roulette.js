/**
 * UI/Components/Roulette/Roulette.js
 *
 * Roulette window
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
 * @author [Your Name]
 */

import DB from 'DB/DBManager.js';
import Client from 'Core/Client.js';
import Preferences from 'Core/Preferences.js';
import Renderer from 'Renderer/Renderer.js';
import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import Network from 'Network/NetworkManager.js';
import PACKET from 'Network/PacketStructure.js';
import PACKETVER from 'Network/PacketVerManager.js';
import htmlText from './Roulette.html?raw';
import cssText from './Roulette.css?raw';

/**
 * Create Component
 */
const Roulette = new GUIComponent('Roulette', cssText);

/**
 * Render HTML
 */
Roulette.render = () => htmlText;

/**
 * @var {Preferences} structure
 */
const _preferences = Preferences.get(
	'Roulette',
	{
		x: 200,
		y: 200,
		show: false
	},
	1.0
);

/**
 * @var {object} Roulette data
 */
const _rouletteInfo = {
	step: 0,
	idx: 0,
	goldPoint: 0,
	silverPoint: 0,
	bronzePoint: 0,
	additionItemID: 0,
	items: []
};

/**
 * Pending requests, prize and the server spin/claim stall
 */
let _pending = null;
let _requestTimer = null;
let _spinTimer = null;
let _cooldownUntil = 0;
let _prize = null;
let _nextStep = 0;
let _status = '';
let _rotation = 0;

function isBusy() {
	return _pending !== null || Date.now() < _cooldownUntil;
}

function finishRequest() {
	clearTimeout(_requestTimer);
	_requestTimer = null;
	_pending = null;
}

function sendRequest(packet, kind) {
	finishRequest();
	_pending = kind;
	_requestTimer = setTimeout(() => {
		finishRequest();
		_status = 'No response. Close and reopen Roulette to refresh.';
		Roulette.updateUI();
	}, 10000);
	Network.sendPacket(packet);
	Roulette.updateUI();
}

function hasPrizePosition(pkt) {
	return pkt.step >= 0 && pkt.step < 7 && pkt.idx >= 0 && pkt.idx < 9 - pkt.step;
}

function startingStep() {
	return _rouletteInfo.bronzePoint > 0
		? 0
		: _rouletteInfo.silverPoint >= 10
			? 2
			: _rouletteInfo.goldPoint >= 10
				? 4
				: 0;
}

function setItem(element, item) {
	element.style.backgroundImage = '';
	element.textContent = '';
	element.title = '';
	if (!item) {
		return;
	}
	const info = DB.getItemInfo(item.itemId);
	element.title = `${info.identifiedDisplayName} ×${item.count}`;
	element.textContent = element.title;
	Client.loadFile(`${DB.INTERFACE_PATH}item/${info.identifiedResourceName}.bmp`, data => {
		if (element.isConnected && element.title === `${info.identifiedDisplayName} ×${item.count}`) {
			element.style.backgroundImage = `url(${data})`;
		}
	});
}

/**
 * Initialize UI
 */
Roulette.init = function init() {
	const root = this.getRoot();

	root.querySelector('.close').addEventListener('click', () => {
		Roulette.onClose();
	});

	root.querySelector('.btn-claim').addEventListener('click', () => {
		Roulette.requestReceiveItem();
	});

	root.querySelector('.btn-spin').addEventListener('click', () => {
		if (!isBusy()) {
			Roulette.onSpin();
		}
	});

	root.querySelector('.btn-info').addEventListener('click', () => {
		Roulette.onInfo();
	});

	this.draggable('.titlebar');
};

/**
 * Click on roulette icon
 */
function onClickIcon() {
	if (Roulette._host.style.display !== 'none') {
		Roulette.onClose();
		return;
	}
	if (_pending !== 'open') {
		sendRequest(new PACKET.CZ.REQ_OPEN_ROULETTE(), 'open');
	}
}

/**
 * Once append to the DOM
 */
Roulette.onAppend = function onAppend() {
	this._host.style.top = Math.min(Math.max(0, _preferences.y), Renderer.height - this._host.offsetHeight) + 'px';
	this._host.style.left = Math.min(Math.max(0, _preferences.x), Renderer.width - this._host.offsetWidth) + 'px';

	this._host.style.display = 'none';

	if (ROConfig.enableRoulette === false) {
		return;
	}

	if (PACKETVER.value < 20141008) {
		return;
	}

	addRouletteIcon();
};

/**
 * @var {HTMLButtonElement|null} Standalone roulette icon (light DOM)
 */
let _iconBtn = null;

/**
 * Create the roulette icon as a standalone light-DOM button.
 */
function addRouletteIcon() {
	if (_iconBtn) {
		return;
	}
	_iconBtn = document.createElement('button');
	_iconBtn.className = 'rouletteIcon';
	_iconBtn.title = 'Roulette';
	_iconBtn.setAttribute('aria-label', 'Roulette');
	_iconBtn.textContent = 'Roulette';
	Object.assign(_iconBtn.style, {
		position: 'absolute',
		top: '74px',
		right: '145px',
		width: '43px',
		height: '43px',
		border: 'none',
		backgroundColor: 'transparent',
		backgroundRepeat: 'no-repeat',
		backgroundSize: 'contain',
		backgroundPosition: 'center',
		zIndex: '50',
		cursor: 'pointer'
	});
	_iconBtn.addEventListener('mousedown', e => e.stopImmediatePropagation());
	_iconBtn.addEventListener('click', onClickIcon);
	document.body.appendChild(_iconBtn);
	const iconPath = 'basic_interface/roullette/RoulletteIcon.bmp';
	Client.loadFile(DB.INTERFACE_PATH + iconPath, function (data) {
		if (_iconBtn) {
			_iconBtn.style.backgroundImage = `url(${data})`;
		}
	});
}

/**
 * Remove from DOM
 */
Roulette.onRemove = function onRemove() {
	if (_iconBtn) {
		_iconBtn.remove();
		_iconBtn = null;
	}
	_preferences.show = this._host.style.display !== 'none';
	_preferences.x = parseInt(this._host.style.left, 10);
	_preferences.y = parseInt(this._host.style.top, 10);
	_preferences.save();
	finishRequest();
	clearTimeout(_spinTimer);
	_spinTimer = null;
	_cooldownUntil = 0;
	_prize = null;
	_rouletteInfo.items = [];
	_status = '';
};

/**
 * Open Roulette Window
 */
Roulette.onOpen = function onOpen(pkt) {
	finishRequest();
	setItem(this.getRoot().querySelector('.result-item'), null);
	Object.assign(_rouletteInfo, pkt);
	_nextStep = startingStep();
	_prize = hasPrizePosition(pkt) ? { row: pkt.step, position: pkt.idx, losing: false } : null;
	// Reopening does not carry the server's remaining stall. Wait conservatively
	// when a prize survived a close, rather than sending a silently ignored claim.
	if (_prize && Date.now() >= _cooldownUntil) {
		this.startSpin(_prize.position, Math.max(0, _prize.row));
	}
	_status = _prize ? 'Prize ready after the wheel stops.' : 'Spin, then collect your prize or spin again.';
	if (pkt.idx >= 0 && !_prize) {
		_status = 'Invalid reward position. Close and reopen Roulette to refresh.';
	}
	this._host.style.display = '';
	this.onInfo();
	this.focus();
};

/**
 * Close Roulette Window
 */
Roulette.onClose = function onClose() {
	Roulette._host.style.display = 'none';

	const pkt = new PACKET.CZ.REQ_CLOSE_ROULETTE();
	Network.sendPacket(pkt);
};

/**
 * Request to spin the roulette
 */
Roulette.onSpin = function onSpin() {
	if (isBusy()) {
		return;
	}
	_status = 'Waiting for spin result…';
	sendRequest(new PACKET.CZ.REQ_GENERATE_ROULETTE(), 'spin');
};

/**
 * Handle roulette item list response
 */
Roulette.onRouletteInfo = function onRouletteInfo(pkt) {
	if (pkt && pkt.items) {
		_rouletteInfo.items = pkt.items;
		_rouletteInfo.serial = pkt.serial;
	}

	Roulette.updateUI();
};

/**
 * Refresh the configured reward list
 */
Roulette.onInfo = function onInfo() {
	Network.sendPacket(new PACKET.CZ.REQ_ROULETTE_INFO());
	this.updateUI();
};

/**
 * Update UI with current roulette data
 */
Roulette.updateUI = function updateUI() {
	const root = this.getRoot();
	this.generateWheelSlots();
	root.querySelector('.points-value').textContent =
		`Gold: ${_rouletteInfo.goldPoint} · Silver: ${_rouletteInfo.silverPoint} · Bronze: ${_rouletteInfo.bronzePoint}`;
	root.querySelector('.status').textContent = _status;
	root.querySelector('.btn-spin').disabled = isBusy();
	root.querySelector('.btn-claim').disabled = isBusy() || !_prize;
	if (_prize && Date.now() >= _cooldownUntil) {
		this.showResult();
	}
};

/**
 * Generate wheel slots from items
 */
Roulette.generateWheelSlots = function generateWheelSlots() {
	const root = this.getRoot();
	const wheelSlots = root.querySelector('.wheel-slots');
	if (!wheelSlots) {
		return;
	}
	wheelSlots.innerHTML = '';

	const row = _prize?.row >= 0 ? _prize.row : _nextStep;
	const items = _rouletteInfo.items.filter(item => item.row === row).sort((a, b) => a.position - b.position);
	const numSlots = items.length;
	root.querySelector('.row-label').textContent = `Reward level ${row + 1}`;

	for (let i = 0; i < numSlots; i++) {
		const angle = (360 / numSlots) * i;
		const distance = 120;
		const radian = (angle - 90) * (Math.PI / 180);

		const x = distance * Math.cos(radian);
		const y = distance * Math.sin(radian);

		const slot = document.createElement('div');
		slot.className = 'wheel-slot';
		slot.setAttribute('data-index', i);
		Object.assign(slot.style, {
			transform: `translate(${x}px, ${y}px) rotate(${angle}deg)`
		});

		const icon = document.createElement('div');
		icon.className = 'item-icon';
		slot.appendChild(icon);
		wheelSlots.appendChild(slot);
		setItem(icon, items[i]);
		const count = document.createElement('span');
		count.className = 'item-count';
		count.textContent = `×${items[i].count}`;
		slot.appendChild(count);
	}
};

/**
 * Start spinning animation
 */
Roulette.startSpin = function startSpin(resultIndex, row) {
	clearTimeout(_spinTimer);
	// rAthena ignores spin/claim requests until max(1, 9 - row - 3) seconds.
	const duration = Math.max(1, 6 - row) * 1000;
	_cooldownUntil = Date.now() + duration;
	const wheel = this.getRoot().querySelector('.wheel-slots');
	const slots = _rouletteInfo.items.filter(item => item.row === row).length || 9 - row;
	_rotation += 1800 + ((360 - (resultIndex * 360) / slots - (_rotation % 360)) % 360);
	wheel.style.transitionDuration = `${duration}ms`;
	wheel.style.transform = `translate(-50%, -50%) rotate(${_rotation}deg)`;
	setItem(this.getRoot().querySelector('.result-item'), null);
	_spinTimer = setTimeout(function finishSpin() {
		// Timer and wall clocks can cross the deadline on different updates.
		const remaining = _cooldownUntil - Date.now();
		if (remaining > 0) {
			_spinTimer = setTimeout(finishSpin, remaining);
			return;
		}
		_spinTimer = null;
		_status = _prize?.losing
			? 'Round ended. Collect this prize or start a new round.'
			: 'Collect your prize or spin again.';
		Roulette.updateUI();
	}, duration);
};

Roulette.showResult = function showResult() {
	const reward = _rouletteInfo.items.find(item => item.row === _prize?.row && item.position === _prize?.position);
	setItem(this.getRoot().querySelector('.result-item'), reward);
};

Roulette.onResult = function onResult(pkt) {
	finishRequest();
	for (const [field, reply] of [
		['goldPoint', 'remainGold'],
		['silverPoint', 'remainSilver'],
		['bronzePoint', 'remainBronze']
	]) {
		if (pkt[reply] !== undefined) {
			_rouletteInfo[field] = pkt[reply];
		}
	}
	if ((pkt.result === 0 || pkt.result === 3) && hasPrizePosition(pkt)) {
		_prize = { row: pkt.step, position: pkt.idx, losing: pkt.result === 3 };
		_nextStep = startingStep();
		_status = 'Spinning…';
		this.startSpin(pkt.idx, pkt.step);
	} else {
		// The server claims the old prize before checking points for this spin.
		_prize = null;
		_nextStep = startingStep();
		setItem(this.getRoot().querySelector('.result-item'), null);
		_status = pkt.result === 2 ? 'Not enough roulette points.' : 'The spin failed. Close and reopen to refresh.';
	}
	this.updateUI();
};

Roulette.onItemReceived = function onItemReceived(pkt) {
	finishRequest();
	// rAthena clears the pending prize even when adding it to inventory fails.
	_prize = null;
	_nextStep = startingStep();
	_rouletteInfo.additionItemID = pkt.additionItemID;
	const messages = [
		'Prize collected.',
		'Could not collect the prize.',
		'Inventory item limit exceeded.',
		'Inventory weight limit exceeded.'
	];
	_status = messages[pkt.result] || messages[1];
	setItem(this.getRoot().querySelector('.result-item'), null);
	this.updateUI();
};

Roulette.requestReceiveItem = function requestReceiveItem() {
	if (isBusy() || !_prize) {
		return;
	}
	const pkt = new PACKET.CZ.RECV_ROULETTE_ITEM();
	pkt.condition = _prize.losing ? 1 : 0;
	_status = 'Collecting prize…';
	sendRequest(pkt, 'claim');
};

/**
 * Export
 */
export default UIManager.addComponent(Roulette);
