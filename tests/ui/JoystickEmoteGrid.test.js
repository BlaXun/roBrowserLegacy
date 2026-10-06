import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	// 40 emotes: sprite index = order index, command = 'e<n>', enum = n
	const order = {};
	const names = {};
	const commands = {};
	for (let i = 0; i < 40; i++) {
		order[i] = i;
		names[i] = 'e' + i;
		commands['e' + i] = i;
	}
	return {
		db: { order, names, commands },
		controls: { joyEmoteFavorites: [], save: vi.fn() },
		sent: []
	};
});

vi.mock('DB/Emotions.js', () => ({ default: mocks.db }));
vi.mock('Core/Client.js', () => ({ default: { loadFiles: vi.fn() } }));
vi.mock('Renderer/Entity/Entity.js', () => ({ default: function () {} }));
vi.mock('Renderer/SpriteRenderer.js', () => ({ default: {} }));
vi.mock('Network/NetworkManager.js', () => ({ default: { sendPacket: pkt => mocks.sent.push(pkt) } }));
vi.mock('Network/PacketStructure.js', () => ({
	default: {
		CZ: {
			REQ_EMOTION: function () {
				this.type = -1;
			}
		}
	}
}));
vi.mock('Preferences/Controls.js', () => ({ default: mocks.controls }));
vi.mock('UI/Components/JoystickUI/JoystickButtonMap.js', () => ({
	default: { nameOf: i => ['A', 'B', 'X', 'Y', 'LB', 'RB'][i] || '?' }
}));

const { default: Grid } = await import('UI/Components/JoystickUI/JoystickEmoteGrid.js');

function press(index) {
	const states = [];
	for (let i = 0; i < 16; i++) {
		states.push(i === index ? 'pressed' : 'unpressed');
	}
	Grid.handleInput(states);
	states[index] = 'unpressed';
	Grid.handleInput(states);
}

const A = 0,
	B = 1,
	X = 2,
	Y = 3,
	LB = 4,
	RB = 5,
	MENU = 9,
	UP = 12,
	DOWN = 13,
	LEFT = 14,
	RIGHT = 15;

describe('JoystickEmoteGrid', () => {
	beforeEach(() => {
		mocks.sent.length = 0;
		mocks.controls.joyEmoteFavorites = [];
		Grid.close();
		Grid.open();
		// Back to page 1
		while (Grid.getRows()[0][0] !== 0) {
			press(LB);
		}
	});

	it('opens on the first emote and shows it', () => {
		expect(Grid.isActive()).toBe(true);
		expect(Grid.getSelected()).toBe(0);
		const root = document.querySelector('.joystick-emote-grid');
		expect(root.style.display).toBe('block');
		expect(root.querySelectorAll('canvas').length).toBe(30);
		expect(root.querySelector('.info').textContent).toContain('/e0');
	});

	it('the D-pad moves through the grid, wrapping', () => {
		press(RIGHT);
		press(DOWN);
		expect(Grid.getSelected()).toBe(7);
		press(LEFT);
		press(LEFT);
		expect(Grid.getSelected()).toBe(11); // wrapped to the end of the row
		press(UP);
		press(UP);
		expect(Grid.getSelected()).toBe(29); // wrapped to the last row
	});

	it('A plays the emote and closes', () => {
		press(RIGHT);
		press(A);
		expect(mocks.sent).toHaveLength(1);
		expect(mocks.sent[0].type).toBe(1);
		expect(Grid.isActive()).toBe(false);
	});

	it('X plays and stays open', () => {
		press(X);
		press(X);
		expect(mocks.sent).toHaveLength(2);
		expect(Grid.isActive()).toBe(true);
	});

	it('B and Menu close without playing', () => {
		press(B);
		expect(Grid.isActive()).toBe(false);
		Grid.open();
		press(MENU);
		expect(Grid.isActive()).toBe(false);
		expect(mocks.sent).toHaveLength(0);
	});

	it('LB / RB page, wrapping', () => {
		press(RB);
		expect(Grid.getRows()[0][0]).toBe(30);
		expect(Grid.getRows()).toHaveLength(2); // 10 emotes left
		press(RB);
		expect(Grid.getRows()[0][0]).toBe(0);
		press(LB);
		expect(Grid.getRows()[0][0]).toBe(30);
	});

	it('Y pins a favourite into a row on top and stays on the same emote', () => {
		press(RIGHT);
		press(RIGHT); // e2
		press(Y);
		expect(mocks.controls.joyEmoteFavorites).toEqual([2]);
		expect(Grid.getRows()[0]).toEqual([2]);
		expect(Grid.getSelected()).toBe(2);

		press(Y); // unpin
		expect(mocks.controls.joyEmoteFavorites).toEqual([]);
		expect(Grid.getSelected()).toBe(2);
	});

	it('opens on the favourites row', () => {
		mocks.controls.joyEmoteFavorites = [5, 9];
		Grid.close();
		Grid.open();
		expect(Grid.getSelected()).toBe(5);
		press(RIGHT);
		press(A);
		expect(mocks.sent[0].type).toBe(9);
	});

	it('a held D-pad repeats after a delay', () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(1000);
			const states = new Array(16).fill('unpressed');
			states[RIGHT] = 'pressed';
			Grid.handleInput(states);
			states[RIGHT] = 'holding';
			vi.setSystemTime(1200);
			Grid.handleInput(states);
			expect(Grid.getSelected()).toBe(1); // not yet
			vi.setSystemTime(1400);
			Grid.handleInput(states);
			expect(Grid.getSelected()).toBe(2);
		} finally {
			vi.useRealTimers();
		}
	});
});
