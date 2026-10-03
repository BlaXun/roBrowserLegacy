import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	controls: { joyButtonMap: null, save: () => {} }
}));

vi.mock('Preferences/Controls.js', () => ({ default: mocks.controls }));

const { default: ButtonMap } = await import('UI/Components/JoystickUI/JoystickButtonMap.js');
const B = ButtonMap.BUTTON;

function states(pressedIndex, state = 'pressed') {
	const list = new Array(17).fill('unpressed');
	if (pressedIndex !== undefined) {
		list[pressedIndex] = state;
	}
	return list;
}

describe('JoystickButtonMap', () => {
	beforeEach(() => {
		mocks.controls.joyButtonMap = null;
		mocks.controls.save = vi.fn();
		ButtonMap.cancelCapture();
		ButtonMap.consume(states()); // clear any wait-for-release
	});

	it('passes buttons through unchanged by default', () => {
		expect(ButtonMap.toLogical(states(B.X))[B.X]).toBe('pressed');
		expect(ButtonMap.nameOf(B.X)).toBe('X');
	});

	it('swaps two buttons when a role is given a new one', () => {
		ButtonMap.assign(B.X, B.Y); // attack moves to Y

		expect(ButtonMap.nameOf(B.X)).toBe('Y');
		expect(ButtonMap.nameOf(B.Y)).toBe('X');

		// Physical Y now plays the attack role, physical X the pickup role
		expect(ButtonMap.toLogical(states(B.Y))[B.X]).toBe('pressed');
		expect(ButtonMap.toLogical(states(B.X))[B.Y]).toBe('pressed');
		expect(mocks.controls.save).toHaveBeenCalled();
	});

	it('stores null again once the layout is back to default', () => {
		ButtonMap.assign(B.X, B.Y);
		ButtonMap.assign(B.X, B.X);
		expect(mocks.controls.joyButtonMap).toBeNull();
	});

	it('falls back to the default layout for a corrupt stored map', () => {
		mocks.controls.joyButtonMap = [0, 0, 1];
		expect(ButtonMap.nameOf(B.A)).toBe('A');
		expect(ButtonMap.toLogical(states(B.B))[B.B]).toBe('pressed');
	});

	it('leaves buttons beyond the remappable range alone', () => {
		ButtonMap.assign(B.A, B.B);
		expect(ButtonMap.toLogical(states(16))[16]).toBe('pressed');
	});

	it('hands the next press to a capture and keeps it from the game until released', () => {
		const onCapture = vi.fn();
		ButtonMap.startCapture(onCapture);

		expect(ButtonMap.consume(states())).toBe(true); // waiting, nothing pressed
		expect(ButtonMap.consume(states(B.RB))).toBe(true);
		expect(onCapture).toHaveBeenCalledWith(B.RB);
		expect(ButtonMap.isCapturing()).toBe(false);

		// Still held: the game must not see it
		expect(ButtonMap.consume(states(B.RB, 'holding'))).toBe(true);
		// Released: input flows again
		expect(ButtonMap.consume(states())).toBe(false);
	});

	it('does not consume input when no capture is running', () => {
		expect(ButtonMap.consume(states(B.A))).toBe(false);
	});
});
