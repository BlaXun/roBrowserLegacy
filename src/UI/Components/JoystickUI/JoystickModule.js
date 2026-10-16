/**
 * UI/Components/JoystickUI/JoystickModule.js
 *
 * Main entry point for the Joystick component.
 * Manages the initialization (prepare) and cleanup (dispose)
 * of all joystick-related sub-services and polling loops.
 *
 * @author AoShinHo
 */

import Polling from './JoystickPollingLoop.js';
import CursorMotion from './JoystickCursorMotion.js';
import InputService from './JoystickInputService.js';
import Interaction from './JoystickInteractionService.js';
import ShortcutMapper from './JoystickShortcutMapper.js';
import JoystickUIRenderer from './JoystickUIRenderer.js';
import EmoteGrid from './JoystickEmoteGrid.js';
import Category from './JoystickTargetCategory.js';
import UIFocus from './JoystickUIFocus.js';

export default {
	prepare: function () {
		ShortcutMapper.prepare();
		InputService.prepare();
		Interaction.prepare();
		// X's "Gamepad slot…" in menus opens the same slot picker as a held right click
		UIFocus.prepare({ pickSlot: el => Interaction.openSelectionWindow(el) });
		Polling.start();
		CursorMotion.start();
		JoystickUIRenderer.hide();
	},
	dispose: function () {
		Polling.stop();
		CursorMotion.stop();
		Interaction.dispose();
		UIFocus.dispose();
		InputService.dispose();
		JoystickUIRenderer.dispose();
		EmoteGrid.dispose();
		Category.dispose();
	}
};
