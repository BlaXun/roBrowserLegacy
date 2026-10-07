/**
 * Engine/MapEngine/UIOpen.js
 *
 * Manage some UI open when requested by server
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
 * @author Vincent Thibault
 */

/**
 * Load dependencies
 */
import Configs from 'Core/Configs.js';
import Network from 'Network/NetworkManager.js';
import PACKET from 'Network/PacketStructure.js';
import PACKETVER from 'Network/PacketVerManager.js';
import MapRenderer from 'Renderer/MapRenderer.js';
import CheckAttendance from 'UI/Components/CheckAttendance/CheckAttendance.js';
import EnchantGradeUI from 'UI/Components/EnchantGrade/EnchantGrade.js';
import EnchantUI from 'UI/Components/Enchant/Enchant.js';

/**
 * Received data and request to open a specific UI
 *
 * @param {object} pkt - PACKET.ZC.UI_OPEN
 */
function onUIOpen(pkt) {
	// Opens an UI window of the given type and initializes it with the given data
	// 0AE2 <type>.B <data>.L
	// type:
	//    0 = BANK_UI
	//    1 = STYLIST_UI
	//    2 = CAPTCHA_UI
	//    3 = MACRO_UI
	//    4 = UI_UNUSED
	//    5 = TIPBOX_UI
	//    6 = RENEWQUEST_UI
	//    7 = ATTENDANCE_UI
	//    8 = ENCHANTGRADE_UI
	//    9 = CHANGE_MATERIAL_UI
	//    10 = ENCHANT_UI

	switch (pkt.ui_type) {
		case 7:
			if (Configs.get('enableCheckAttendance') && PACKETVER.value >= 20180307) {
				// rAthena opens the window as soon as the character is loaded,
				// which is while the map is still loading here: the window would
				// sit over the loading screen, and the map load removes it again.
				// Keep the data and open it once the map is up.
				_pendingAttendance = pkt.data;
				if (!MapRenderer.loading) {
					openPendingUI();
				}
			}
			break;
		case 8:
			if (PACKETVER.value >= 20200724) {
				EnchantGradeUI.prepare();
				EnchantGradeUI.onOpenEnchantGradeUI();
			}
			break;
		case 10:
			if (PACKETVER.value >= 20211103) {
				EnchantUI.prepare();
				EnchantUI.onOpenEnchantUI(pkt.data);
			}
			break;
		default:
			console.error(`[PACKET.ZC.UI_OPEN] not implemented (${pkt.ui_type})`);
	}
}

/**
 * Attendance data the server sent while the map was loading
 * @var {number|null}
 */
let _pendingAttendance = null;

/**
 * Open the windows the server asked for while the map was loading.
 * Called by the map engine once the map is loaded.
 */
export function openPendingUI() {
	if (_pendingAttendance === null) {
		return;
	}

	const data = _pendingAttendance;
	_pendingAttendance = null;

	CheckAttendance.prepare();
	CheckAttendance.setData(data);
	CheckAttendance.cleanUI();
	CheckAttendance.append();
	CheckAttendance.ui.show();
	CheckAttendance.focus();
}

/**
 * Initialize
 */
export default function MainEngine() {
	Network.hookPacket(PACKET.ZC.UI_OPEN, onUIOpen);
	Network.hookPacket(PACKET.ZC.UI_OPEN_V3, onUIOpen);
}
