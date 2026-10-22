/**
 * Engine/MapEngine/MemorialDungeon.js
 *
 * Memorial Dungeon (instance) packets
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

import DB from 'DB/DBManager.js';
import Network from 'Network/NetworkManager.js';
import PACKET from 'Network/PacketStructure.js';
import ChatBox from 'UI/Components/ChatBox/ChatBox.js';
import MemorialDungeon from 'UI/Components/MemorialDungeon/MemorialDungeon.js';

/**
 * rAthena sends this position to tell the instance left the queue
 */
const PRIORITY_CANCELED = 0xffff;

/**
 * ZC_MEMORIALDUNGEON_NOTIFY types (rAthena e_instance_notify) and their messages
 */
const NOTIFY = {
	INFO: 0,
	DESTROY_LIVE_TIMEOUT: 1,
	DESTROY_ENTER_TIMEOUT: 2,
	DESTROY_USER_REQUEST: 3,
	CREATE_FAIL: 4
};

const NOTIFY_MSG = {
	[NOTIFY.DESTROY_LIVE_TIMEOUT]: 1346, // The Memorial Dungeon duration expired; it has been destroyed.
	[NOTIFY.DESTROY_ENTER_TIMEOUT]: 1347, // The Memorial Dungeon's entry time limit expired; it has been destroyed.
	[NOTIFY.DESTROY_USER_REQUEST]: 1348, // The Memorial Dungeon has been removed.
	[NOTIFY.CREATE_FAIL]: 1333 // Failed to create Memorial Dungeon %s. Please try again.
};

/**
 * Instance queued
 *
 * @param {object} pkt - PACKET.ZC.MEMORIALDUNGEON_SUBSCRIPTION_INFO
 */
function onSubscriptionInfo(pkt) {
	MemorialDungeon.setStandby(pkt.MemorialDungeonName, pkt.PriorityOrderNum);
}

/**
 * Queue position changed, or the instance left the queue
 *
 * @param {object} pkt - PACKET.ZC.MEMORIALDUNGEON_SUBSCRIPTION_NOTIFY
 */
function onSubscriptionNotify(pkt) {
	if ((pkt.PriorityOrderNum & 0xffff) === PRIORITY_CANCELED) {
		if (MemorialDungeon.getData()) {
			ChatBox.addText(DB.getMessage(1345), ChatBox.TYPE.INFO, ChatBox.FILTER.PUBLIC_LOG); // reservation canceled
		}
		MemorialDungeon.clear();
		return;
	}
	MemorialDungeon.setPriority(pkt.PriorityOrderNum);
}

/**
 * Instance created or (re)entered; also sent on every map load
 *
 * @param {object} pkt - PACKET.ZC.MEMORIALDUNGEON_INFO
 */
function onInfo(pkt) {
	MemorialDungeon.setInfo(pkt.MemorialDungeonName, pkt.DestroyDate, pkt.EnterTimeOutDate);
}

/**
 * Entry limit changed, or the instance is gone
 *
 * @param {object} pkt - PACKET.ZC.MEMORIALDUNGEON_NOTIFY
 */
function onNotify(pkt) {
	if (pkt.Type === NOTIFY.INFO) {
		MemorialDungeon.setEnterDate(pkt.EnterLimitDate);
		return;
	}

	const data = MemorialDungeon.getData();
	const msg = NOTIFY_MSG[pkt.Type];
	if (msg) {
		ChatBox.addText(
			DB.getMessage(msg).replace('%s', data ? data.name : ''),
			ChatBox.TYPE.INFO,
			ChatBox.FILTER.PUBLIC_LOG
		);
	}
	MemorialDungeon.clear();
}

/**
 * Initialize
 */
export default function MemorialDungeonEngine() {
	Network.hookPacket(PACKET.ZC.MEMORIALDUNGEON_SUBSCRIPTION_INFO, onSubscriptionInfo);
	Network.hookPacket(PACKET.ZC.MEMORIALDUNGEON_SUBSCRIPTION_NOTIFY, onSubscriptionNotify);
	Network.hookPacket(PACKET.ZC.MEMORIALDUNGEON_INFO, onInfo);
	Network.hookPacket(PACKET.ZC.MEMORIALDUNGEON_NOTIFY, onNotify);
}
