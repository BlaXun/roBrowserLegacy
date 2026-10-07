import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	interaction: {
		cameraAngle: vi.fn(),
		cameraZoom: vi.fn(),
		showinfo: vi.fn(() => false),
		navigateDpad: vi.fn(),
		cycleTarget: vi.fn(),
		toggleStickMode: vi.fn(),
		clearTarget: vi.fn(),
		toggleSit: vi.fn(),
		recenterCursor: vi.fn(),
		enter: vi.fn(),
		escape: vi.fn(),
		openEmoteGrid: vi.fn(),
		isEmoteGridOpen: vi.fn(() => false),
		emoteGridInput: vi.fn(),
		leftClick: vi.fn(),
		rightClick: vi.fn()
	},
	setManager: { toggle: vi.fn() },
	shortcuts: { getGroup: vi.fn(() => ''), getShortcutIndex: vi.fn(() => -1) },
	renderer: { updateVisuals: vi.fn(), updateSetIndicator: vi.fn(), sync: vi.fn() },
	selection: { active: vi.fn(() => false) },
	controls: { joyAimEnabled: false }
}));

vi.mock('UI/Components/JoystickUI/JoystickInteractionService.js', () => ({ default: mocks.interaction }));
vi.mock('UI/Components/JoystickUI/JoystickSetManager.js', () => ({ default: mocks.setManager }));
vi.mock('UI/Components/JoystickUI/JoystickShortcutMapper.js', () => ({ default: mocks.shortcuts }));
vi.mock('UI/Components/JoystickUI/JoystickUIRenderer.js', () => ({ default: mocks.renderer }));
vi.mock('UI/Components/JoystickUI/JoystickSelectionUI.js', () => ({ default: mocks.selection }));
vi.mock('Preferences/Controls.js', () => ({ default: mocks.controls }));

const { default: ButtonInput } = await import('UI/Components/JoystickUI/JoystickButtonInput.js');

/**
 * Button states by logical index: unpressed unless listed.
 */
function buttons(states) {
	const out = [];
	for (let i = 0; i < 16; i++) {
		out.push(states[i] || 'unpressed');
	}
	return out;
}

describe('JoystickButtonInput View + shoulder buttons', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});


	[
		[4, -45],
		[5, 45],
		[6, -90],
		[7, 90]
	].forEach(([button, degrees]) => {
		it(`View + button ${button} turns the camera ${degrees} degrees, once per press`, () => {
			expect(ButtonInput.update(buttons({ 8: 'holding', [button]: 'pressed' }))).toBeTruthy();
			expect(mocks.interaction.cameraAngle).toHaveBeenCalledWith(degrees);

			// Held on: no repeat
			ButtonInput.update(buttons({ 8: 'holding', [button]: 'holding' }));
			expect(mocks.interaction.cameraAngle).toHaveBeenCalledTimes(1);
		});
	});

	it('a quick second tap turns again (no click lock)', () => {
		ButtonInput.update(buttons({ 8: 'holding', 5: 'pressed' }));
		ButtonInput.update(buttons({ 8: 'holding' }));
		ButtonInput.update(buttons({ 8: 'holding', 5: 'pressed' }));
		expect(mocks.interaction.cameraAngle).toHaveBeenCalledTimes(2);
	});

	it('View + D-pad is left to the per-frame camera, without stepping', () => {
		expect(ButtonInput.update(buttons({ 8: 'holding', 15: 'holding' }))).toBeTruthy();
		expect(mocks.interaction.cameraAngle).not.toHaveBeenCalled();
		expect(mocks.interaction.cycleTarget).not.toHaveBeenCalled();
	});

	it('LT + RT with View held does not switch the shortcut set', () => {
		ButtonInput.update(buttons({ 8: 'holding', 6: 'holding', 7: 'holding' }));
		expect(mocks.setManager.toggle).not.toHaveBeenCalled();
	});

	it('LT + RT without View still switches the shortcut set', () => {
		ButtonInput.update(buttons({ 6: 'holding', 7: 'holding' }));
		expect(mocks.setManager.toggle).toHaveBeenCalled();
	});
});

describe('JoystickButtonInput stick clicks', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(10000);
		mocks.controls.joyAimEnabled = true;
	});

	afterEach(() => {
		vi.useRealTimers();
		mocks.controls.joyAimEnabled = false;
	});

	function release() {
		ButtonInput.update(buttons({}));
	}

	it('L3 tap clears the target, on release', () => {
		ButtonInput.update(buttons({ 10: 'pressed' }));
		expect(mocks.interaction.clearTarget).not.toHaveBeenCalled();
		release();
		expect(mocks.interaction.clearTarget).toHaveBeenCalledTimes(1);
		expect(mocks.interaction.toggleSit).not.toHaveBeenCalled();
	});

	it('L3 hold sits or stands once, and the release does not also clear', () => {
		ButtonInput.update(buttons({ 10: 'pressed' }));
		vi.setSystemTime(10500);
		ButtonInput.update(buttons({ 10: 'holding' }));
		vi.setSystemTime(11500);
		ButtonInput.update(buttons({ 10: 'holding' }));
		release();
		expect(mocks.interaction.toggleSit).toHaveBeenCalledTimes(1);
		expect(mocks.interaction.clearTarget).not.toHaveBeenCalled();
	});

	it('RS tap switches the stick mode, RS hold recenters the cursor', () => {
		ButtonInput.update(buttons({ 11: 'pressed' }));
		release();
		expect(mocks.interaction.toggleStickMode).toHaveBeenCalledTimes(1);

		ButtonInput.update(buttons({ 11: 'pressed' }));
		vi.setSystemTime(10500);
		ButtonInput.update(buttons({ 11: 'holding' }));
		release();
		expect(mocks.interaction.recenterCursor).toHaveBeenCalledTimes(1);
		expect(mocks.interaction.toggleStickMode).toHaveBeenCalledTimes(1);
		expect(mocks.interaction.clearTarget).not.toHaveBeenCalled();
	});

	it('RS click recenters at once when aiming is off in the settings', () => {
		mocks.controls.joyAimEnabled = false;
		ButtonInput.update(buttons({ 11: 'pressed' }));
		expect(mocks.interaction.recenterCursor).toHaveBeenCalledTimes(1);
	});

	it('Menu tap presses Enter on release, Menu hold opens the emote grid', () => {
		ButtonInput.update(buttons({ 9: 'pressed' }));
		release();
		expect(mocks.interaction.enter).toHaveBeenCalledTimes(1);
		expect(mocks.interaction.openEmoteGrid).not.toHaveBeenCalled();

		ButtonInput.update(buttons({ 9: 'pressed' }));
		vi.setSystemTime(10500);
		ButtonInput.update(buttons({ 9: 'holding' }));
		expect(mocks.interaction.openEmoteGrid).toHaveBeenCalledTimes(1);

		// The grid takes the buttons; letting Menu go afterwards is no Enter
		mocks.interaction.isEmoteGridOpen.mockReturnValue(true);
		ButtonInput.update(buttons({ 9: 'holding' }));
		release();
		expect(mocks.interaction.emoteGridInput).toHaveBeenCalledTimes(2);
		mocks.interaction.isEmoteGridOpen.mockReturnValue(false);
		release();
		expect(mocks.interaction.enter).toHaveBeenCalledTimes(1);
	});

	it('View + Menu is still Escape, not Enter', async () => {
		vi.useRealTimers();
		await new Promise(resolve => setTimeout(resolve, 250));
		ButtonInput.update(buttons({ 8: 'holding', 9: 'pressed' }));
		ButtonInput.update(buttons({}));
		expect(mocks.interaction.escape).toHaveBeenCalled();
		expect(mocks.interaction.enter).not.toHaveBeenCalled();
	});

	it('D-pad up / down go to the category switch', async () => {
		// Let an earlier test's click lock run out
		vi.useRealTimers();
		await new Promise(resolve => setTimeout(resolve, 250));
		ButtonInput.update(buttons({ 12: 'pressed' }));
		expect(mocks.interaction.navigateDpad).toHaveBeenCalledWith('up');
	});
});

describe('JoystickButtonInput after the emote grid', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		mocks.controls.joyAimEnabled = false;
		mocks.interaction.isEmoteGridOpen.mockReturnValue(false);
		// A click lock an earlier test set runs on real time (200 ms): let it run out
		vi.useRealTimers();
		await new Promise(resolve => setTimeout(resolve, 250));
		vi.useFakeTimers();
		ButtonInput.update(buttons({}));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('the A that closes the emote grid does not also click the map', () => {
		// A plays an emote and the grid closes; on the next frames A is still held
		mocks.interaction.isEmoteGridOpen.mockReturnValue(true);
		ButtonInput.update(buttons({ 0: 'pressed' }));
		mocks.interaction.isEmoteGridOpen.mockReturnValue(false);
		ButtonInput.update(buttons({ 0: 'holding' }));
		ButtonInput.update(buttons({ 0: 'holding' }));
		expect(mocks.interaction.leftClick).not.toHaveBeenCalled();
		// Let go: the next press is the map's again
		ButtonInput.update(buttons({}));
		ButtonInput.update(buttons({ 0: 'pressed' }));
		expect(mocks.interaction.leftClick).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(1000);
		ButtonInput.update(buttons({}));
	});
});
