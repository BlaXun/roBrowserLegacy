/**
 * UI/Components/WinLogin/WinLogin.js
 *
 * Login Window
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
 */

import WinLogin from './WinLogin/WinLogin.js';
import WinLoginV2 from './WinLoginV2/WinLoginV2.js';
import WinLoginV3 from './WinLoginV3/WinLoginV3.js';
import UIVersionManager from 'UI/UIVersionManager.js';
import Client from 'Core/Client.js';
import DB from 'DB/DBManager.js';

const publicName = 'WinLogin';

const versionInfo = {
	default: WinLogin,
	common: {
		20221207: WinLoginV3,
		20181114: WinLoginV2
	},
	re: {},
	prere: {}
};

const Controller = UIVersionManager.getUIController(publicName, versionInfo);

/**
 * The 2018 login window (WinLoginV2, and V3 which reuses it) is drawn on
 * login_interface/bg_login.tga with bt_start_* and bt_join_* buttons. Korean
 * client data has that art; international client data (LATAM, iRO) carries
 * only the classic window's -- win_login.bmp, btn_connect*, btn_request*,
 * btn_exit* -- so the newer window shows bare inputs over the background.
 *
 * When the newer window's background is missing, use the classic window,
 * whose art those clients do ship. Its layout is different, so this switches
 * the whole window rather than substituting files one at a time.
 */
const REDESIGN_BACKGROUND = 'login_interface/bg_login.tga';

/** null until probed, then whether the client data has the newer art. */
let _hasRedesignArt = null;

/**
 * Settle on a login window the client data can draw, then call back.
 *
 * Call after selectUIVersion(). The result is remembered: a file that failed
 * to load does not always report the failure to a second listener.
 *
 * @param {function} callback
 */
Controller.selectUIVersionForData = function selectUIVersionForData(callback) {
	const useClassic = () => {
		// No common[0] entry, so this selects versionInfo.default
		Controller.selectSpecificUIVersion(0);
		callback();
	};

	if (Controller.getUI() === WinLogin || _hasRedesignArt === true) {
		callback();
		return;
	}
	if (_hasRedesignArt === false) {
		useClassic();
		return;
	}

	Client.loadFile(
		DB.INTERFACE_PATH + REDESIGN_BACKGROUND,
		() => {
			_hasRedesignArt = true;
			callback();
		},
		() => {
			_hasRedesignArt = false;
			console.warn(
				'%c[UIVersion] WinLogin: ' +
					REDESIGN_BACKGROUND +
					' is not in the client data, using the classic window',
				'color:#007000'
			);
			useClassic();
		}
	);
};

export default Controller;
