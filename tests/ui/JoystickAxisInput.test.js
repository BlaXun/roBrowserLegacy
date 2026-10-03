import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	interaction: { moveCharacter: vi.fn(), releaseStick: vi.fn(), cancelQuick: false },
	controls: { joyDeadline: 0.1, joyReverseStick: false },
	renderer: { show: vi.fn() }
}));

vi.mock('UI/Components/JoystickUI/JoystickInteractionService.js', () => ({ default: mocks.interaction }));
vi.mock('Preferences/Controls.js', () => ({ default: mocks.controls }));
vi.mock('UI/Components/JoystickUI/JoystickUIRenderer.js', () => ({ default: mocks.renderer }));

const { default: AxisInput } = await import('UI/Components/JoystickUI/JoystickAxisInput.js');

describe('JoystickAxisInput left stick release', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		vi.clearAllMocks();
		// Let any rebound window from a previous test expire
		vi.setSystemTime(10000);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('ignores the spring-back overshoot after letting go of a held stick', () => {
		AxisInput.update([-1, 0, 0, 0]); // walking left
		vi.advanceTimersByTime(100);
		AxisInput.update([0.25, 0, 0, 0]); // released: stick overshoots right

		expect(mocks.interaction.moveCharacter).toHaveBeenCalledTimes(1);
		expect(mocks.interaction.moveCharacter).toHaveBeenCalledWith(-1, -0);
		expect(mocks.interaction.releaseStick).toHaveBeenCalledTimes(1);
	});

	it('lets a firm reversal through immediately', () => {
		AxisInput.update([-1, 0, 0, 0]);
		vi.advanceTimersByTime(100);
		AxisInput.update([0.9, 0, 0, 0]);

		expect(mocks.interaction.moveCharacter).toHaveBeenLastCalledWith(1, -0);
	});

	it('accepts a moderate push the other way once the window has passed', () => {
		AxisInput.update([-1, 0, 0, 0]);
		vi.advanceTimersByTime(400);
		AxisInput.update([0.55, 0, 0, 0]);

		expect(mocks.interaction.moveCharacter).toHaveBeenLastCalledWith(1, -0);
	});

	it('does not hold back a sideways change of direction', () => {
		AxisInput.update([-1, 0, 0, 0]);
		vi.advanceTimersByTime(100);
		AxisInput.update([0, -0.55, 0, 0]); // moderate up, perpendicular

		expect(mocks.interaction.moveCharacter).toHaveBeenLastCalledWith(0, 1);
	});

	it('treats a stick fading back to centre as released, not as a short step', () => {
		AxisInput.update([-1, 0, 0, 0]);
		vi.advanceTimersByTime(100);
		AxisInput.update([-0.3, 0, 0, 0]); // on its way back, same direction
		vi.advanceTimersByTime(100);
		AxisInput.update([-0.12, 0, 0, 0]);

		expect(mocks.interaction.moveCharacter).toHaveBeenCalledTimes(1);
		expect(mocks.interaction.releaseStick).toHaveBeenCalledTimes(2);
	});

	it('walks the full step whatever the push strength', () => {
		AxisInput.update([-0.6, 0.8, 0, 0]); // magnitude 1
		vi.advanceTimersByTime(400);
		AxisInput.update([0, 0.7, 0, 0]);

		expect(mocks.interaction.moveCharacter).toHaveBeenLastCalledWith(0, -1);
	});
});
