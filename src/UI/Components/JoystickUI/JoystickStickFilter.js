/**
 * UI/Components/JoystickUI/JoystickStickFilter.js
 *
 * Cleans up raw stick values before anything else reads them: worn sticks
 * rest off centre (drift), and even a small rest offset reads as a push.
 *
 * Two corrections, per axis of each physical stick (standard mapping:
 * axes 0-1 left stick, 2-3 right stick), applied before the stick swap:
 *
 *  1. Calibration: the stick's measured rest position is subtracted, and
 *     each side is stretched so full tilt still reads 1.
 *  2. Drift threshold: anything below the axis' threshold counts as
 *     centre, and the rest is rescaled to start from 0 just past it, so
 *     the cursor does not jump when a push crosses it.
 *
 * Both are off by default (no calibration, thresholds 0).
 */

import ControlsSettings from 'Preferences/Controls.js';

/**
 * Settings key of each axis' drift threshold, by axis index.
 */
const DRIFT_KEYS = ['joyDriftLX', 'joyDriftLY', 'joyDriftRX', 'joyDriftRY'];

const AXIS_COUNT = DRIFT_KEYS.length;

// Calibration reads the sticks this often, this long
const CALIBRATE_INTERVAL_MS = 50;
const CALIBRATE_DURATION_MS = 1000;

// A sample further from centre than this means a stick was touched: no
// worn stick drifts that far.
const CALIBRATE_MAX_OFFSET = 0.5;

let _calibration = null; // interval handle while a calibration runs

/**
 * Subtract the rest position, stretching each side back to the full range.
 *
 * @param {number} value raw axis value, -1..1
 * @param {number} center measured rest position
 * @return {number}
 */
function recenter(value, center) {
	if (!center) {
		return value;
	}
	const v = value - center;
	const range = v > 0 ? 1 - center : 1 + center;
	return Math.max(-1, Math.min(1, v / range));
}

/**
 * Treat values within the threshold as centre; rescale the rest to 0..1.
 *
 * @param {number} value axis value, -1..1
 * @param {number} threshold 0..1
 * @return {number}
 */
function applyThreshold(value, threshold) {
	if (!threshold || threshold <= 0) {
		return value;
	}
	const magnitude = Math.abs(value);
	if (magnitude <= threshold || threshold >= 1) {
		return 0;
	}
	return (Math.sign(value) * (magnitude - threshold)) / (1 - threshold);
}

/**
 * The stored rest positions, or null when not calibrated.
 *
 * @return {Array<number>|null}
 */
function getCenter() {
	const center = ControlsSettings.joyStickCenter;
	if (!Array.isArray(center) || center.length !== AXIS_COUNT || !center.every(Number.isFinite)) {
		return null;
	}
	return center;
}

/**
 * Cleaned copy of a gamepad's axes. Axes past the two sticks pass through.
 *
 * @param {ArrayLike<number>} axes Gamepad.axes
 * @return {Array<number>}
 */
function filterAxes(axes) {
	const center = getCenter();
	const out = Array.from(axes);
	for (let i = 0; i < Math.min(AXIS_COUNT, out.length); i++) {
		const value = recenter(out[i], center ? center[i] : 0);
		out[i] = applyThreshold(value, ControlsSettings[DRIFT_KEYS[i]]);
	}
	return out;
}

/**
 * Average rest position per axis from calibration samples, or null if a
 * stick was touched while they were taken.
 *
 * @param {Array<Array<number>>} samples raw axes, one array per read
 * @return {Array<number>|null}
 */
function computeCenter(samples) {
	if (!samples.length) {
		return null;
	}
	const center = [];
	for (let i = 0; i < AXIS_COUNT; i++) {
		let sum = 0;
		for (const sample of samples) {
			const value = sample[i] || 0;
			if (Math.abs(value) > CALIBRATE_MAX_OFFSET) {
				return null;
			}
			sum += value;
		}
		center.push(sum / samples.length);
	}
	return center;
}

function getGamepad() {
	const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
	for (let i = 0; i < gamepads.length; i++) {
		if (gamepads[i]) {
			return gamepads[i];
		}
	}
	return null;
}

/**
 * Stop a running calibration without saving.
 */
function cancelCalibration() {
	if (_calibration) {
		clearInterval(_calibration);
		_calibration = null;
	}
}

/**
 * Read both sticks for a second while the player leaves them alone, and
 * store their rest positions.
 *
 * @param {function(string)} done called with 'ok', 'moved' (a stick was
 *   touched, nothing saved) or 'nopad'
 */
function calibrate(done) {
	cancelCalibration();
	if (!getGamepad()) {
		done('nopad');
		return;
	}

	const samples = [];
	const startedAt = Date.now();
	_calibration = setInterval(function () {
		const gp = getGamepad();
		if (!gp) {
			cancelCalibration();
			done('nopad');
			return;
		}
		samples.push(Array.from(gp.axes).slice(0, AXIS_COUNT));
		if (Date.now() - startedAt < CALIBRATE_DURATION_MS) {
			return;
		}

		cancelCalibration();
		const center = computeCenter(samples);
		if (!center) {
			done('moved');
			return;
		}
		ControlsSettings.joyStickCenter = center;
		ControlsSettings.save();
		done('ok');
	}, CALIBRATE_INTERVAL_MS);
}

/**
 * Forget the calibration.
 */
function resetCalibration() {
	cancelCalibration();
	ControlsSettings.joyStickCenter = null;
	ControlsSettings.save();
}

export default {
	DRIFT_KEYS,
	recenter,
	applyThreshold,
	filterAxes,
	computeCenter,
	getCenter,
	calibrate,
	cancelCalibration,
	resetCalibration
};
