/**
 * UI/Components/JoystickUI/JoystickInputService.js
 *
 * Service responsible for monitoring gamepad connection states,
 * processing raw button/axis data into internal states, and
 * managing the activation/deactivation of the joystick UI.
 *
 * @author AoShinHo
 */

import ButtonInput from './JoystickButtonInput.js';
import AxisInput from './JoystickAxisInput.js';
import JoystickUIRenderer from './JoystickUIRenderer.js';
import ControlsSettings from 'Preferences/Controls.js';
import ButtonMap from './JoystickButtonMap.js';

let hideTimeout = false;
let hideTimeoutHandle = null;
export default {
	active: false,
	// Logical button states (after remapping), as the last poll saw them
	buttonStates: {},
	// Physical button states, for press/hold edge detection
	_rawStates: [],
	_listening: false,

	prepare: function () {
		if (this._listening) {
			return;
		}

		this._boundOnConnect = this._onConnect.bind(this);
		this._boundOnDisconnect = this._onDisconnect.bind(this);

		window.addEventListener('gamepadconnected', this._boundOnConnect);
		window.addEventListener('gamepaddisconnected', this._boundOnDisconnect);
		this._listening = true;
	},

	dispose: function () {
		window.removeEventListener('gamepadconnected', this._boundOnConnect);
		window.removeEventListener('gamepaddisconnected', this._boundOnDisconnect);
		this._listening = false;

		if (hideTimeoutHandle) {
			clearTimeout(hideTimeoutHandle);
			hideTimeoutHandle = null;
		}
		hideTimeout = false;

		this.active = false;
		this.buttonStates = {};
		this._rawStates = [];
	},

	getStates: function (gp) {
		if (!gp) {
			return null;
		}
		const states = {
			buttons: [],
			raw: [],
			axes: []
		};
		const self = this;

		// Process Buttons with 3-state logic, per physical button
		gp.buttons.forEach(function (btn, index) {
			const isPressed = btn.pressed;
			const prevState = self._rawStates[index] || 'unpressed';
			let newState = 'unpressed';
			if (isPressed) {
				newState = prevState === 'unpressed' ? 'pressed' : 'holding';
			}
			self._rawStates[index] = newState;
			states.raw[index] = newState;
		});

		// Everything downstream works with roles, not physical buttons
		states.buttons = ButtonMap.toLogical(states.raw);
		self.buttonStates = states.buttons;

		// Process Axes
		gp.axes.forEach(function (axis, index) {
			states.axes[index] = Math.abs(axis) > ControlsSettings.joyDeadline ? axis : 0;
		});
		return states;
	},

	update: function () {
		const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];

		let activeGamepad = null;
		for (let i = 0; i < gamepads.length; i++) {
			if (gamepads[i]) {
				activeGamepad = gamepads[i];
				break;
			}
		}
		if (!activeGamepad) {
			if (this.active) {
				this.active = false;
				JoystickUIRenderer.hide();
			}
			return false;
		}
		const states = this.getStates(activeGamepad);

		let anyActivity = false;

		if (!states) {
			this.active = false;
			return false;
		}

		// A remap capture in the options window takes the buttons this poll
		const buttonsActive = ButtonMap.consume(states.raw) || ButtonInput.update(states.buttons);
		const axisActive = AxisInput.update(states.axes);

		if (buttonsActive || axisActive) {
			anyActivity = true;
		}

		if (anyActivity && !this.active) {
			JoystickUIRenderer.show();
			this.active = true;
		}

		if (!anyActivity && this.active && !hideTimeout) {
			hideTimeout = true;
			const self = this;
			this.active = false;
			hideTimeoutHandle = setTimeout(function () {
				hideTimeout = false;
				hideTimeoutHandle = null;
				if (self.active === false) {
					JoystickUIRenderer.hide();
				}
			}, 30000);
		} else if (!hideTimeout) {
			this.active = true;
		}
		return true;
	},

	_onConnect: function () {
		this.active = true;
		JoystickUIRenderer.show();
	},

	_onDisconnect: function () {
		this.active = false;
		this.buttonStates = {};
		this._rawStates = [];
		JoystickUIRenderer.hide();
	}
};
