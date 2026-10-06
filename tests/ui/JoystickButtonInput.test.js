import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	interaction: {
		cameraAngle: vi.fn(),
		cameraZoom: vi.fn(),
		showinfo: vi.fn(() => false),
		navigateDpad: vi.fn(),
		cycleTarget: vi.fn(),
		resetFocus: vi.fn(),
		toggleStickMode: vi.fn()
	},
	setManager: { toggle: vi.fn() },
	shortcuts: { getGroup: vi.fn(() => ''), getShortcutIndex: vi.fn(() => -1) },
	renderer: { updateVisuals: vi.fn(), updateSetIndicator: vi.fn(), sync: vi.fn() },
	selection: { active: vi.fn(() => false) }
}));

vi.mock('UI/Components/JoystickUI/JoystickInteractionService.js', () => ({ default: mocks.interaction }));
vi.mock('UI/Components/JoystickUI/JoystickSetManager.js', () => ({ default: mocks.setManager }));
vi.mock('UI/Components/JoystickUI/JoystickShortcutMapper.js', () => ({ default: mocks.shortcuts }));
vi.mock('UI/Components/JoystickUI/JoystickUIRenderer.js', () => ({ default: mocks.renderer }));
vi.mock('UI/Components/JoystickUI/JoystickSelectionUI.js', () => ({ default: mocks.selection }));
vi.mock('Preferences/Controls.js', () => ({ default: { joyAimEnabled: false } }));

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
