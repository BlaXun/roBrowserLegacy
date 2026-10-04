import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	session: { Entity: { position: [10, 10, 0] } },
	controls: { joyAimEnabled: true, joyRightStickMode: 1, joyAimHideCursor: false, save: () => {} },
	target: {
		getCycleCandidates: () => [],
		getMarked: () => null,
		getAttackableFocus: () => null
	}
}));

vi.mock('Engine/SessionStorage.js', () => ({ default: mocks.session }));
vi.mock('Renderer/Renderer.js', () => ({ default: { width: 800, height: 600 } }));
vi.mock('Renderer/Camera.js', () => ({ default: { angle: [0, 0] } }));
vi.mock('Renderer/Map/Altitude.js', () => ({ default: { getCellHeight: () => 0 } }));
vi.mock('Preferences/Controls.js', () => ({ default: mocks.controls }));
vi.mock('UI/Components/ChatBox/ChatBox.js', () => ({ default: {} }));
vi.mock('UI/Components/JoystickUI/JoystickTargetService.js', () => ({ default: mocks.target }));
vi.mock('UI/Components/JoystickUI/JoystickMouseCursorAdapter.js', () => ({ default: {} }));
vi.mock('UI/Components/JoystickUI/JoystickUIRenderer.js', () => ({ default: { updateStickMode: () => {} } }));

// Real mouse moves are trusted, which a test cannot dispatch: keep the
// listener the module adds, to call it directly.
let onMouseMove = null;
const addEventListener = window.addEventListener.bind(window);
vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
	if (type === 'mousemove') {
		onMouseMove = listener;
	}
	return addEventListener(type, listener, options);
});

const { default: Aim } = await import('UI/Components/JoystickUI/JoystickAimMode.js');

describe('JoystickAimMode hide cursor', () => {
	let cursor;

	beforeEach(() => {
		cursor = document.createElement('div');
		cursor.className = 'cursor';
		document.body.appendChild(cursor);
		mocks.controls.joyAimHideCursor = false;
	});

	afterEach(() => {
		Aim.release();
		cursor.remove();
	});

	it('leaves the cursor alone with the setting off', () => {
		Aim.update(0, 0, false);
		expect(cursor.style.visibility).toBe('');
	});

	it('hides the cursor while aiming, and shows it when aim mode is left', () => {
		mocks.controls.joyAimHideCursor = true;
		Aim.update(0, 0, false);
		expect(cursor.style.visibility).toBe('hidden');

		Aim.release();
		expect(cursor.style.visibility).toBe('');
	});

	it('shows it on a real mouse move until the stick aims again', () => {
		mocks.controls.joyAimHideCursor = true;
		Aim.update(0, 0, false);

		onMouseMove({ isTrusted: true });
		expect(cursor.style.visibility).toBe('');

		Aim.update(0, 0, false); // stick idle: stays visible
		expect(cursor.style.visibility).toBe('');

		Aim.update(1, 0, true); // stick aims: hidden again
		expect(cursor.style.visibility).toBe('hidden');
	});

	it('ignores synthetic mouse moves', () => {
		mocks.controls.joyAimHideCursor = true;
		Aim.update(0, 0, false);
		window.dispatchEvent(new MouseEvent('mousemove'));
		expect(cursor.style.visibility).toBe('hidden');
	});
});
