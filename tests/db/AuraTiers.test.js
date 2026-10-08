import { describe, it, expect, vi } from 'vitest';

// The effect classes need WebGL and the client; the table only needs to name them.
vi.mock('Renderer/Effects/MaxLevelAura.js', () => ({ default: class {} }));
vi.mock('Renderer/Effects/SwirlingAura.js', () => ({ default: class {} }));
vi.mock('Renderer/Effects/GroundAura.js', () => ({ default: class {} }));
vi.mock('Renderer/Effects/Level99Bubble.js', () => ({ default: class {} }));

import {
	auraSettings,
	auraTier,
	auraColor,
	tierColor,
	isFourthJob,
	TIER_EFFECTS,
	ALL_TIER_EFFECTS
} from 'DB/Effects/AuraTiers.js';
import LevelAuraEffects from 'DB/Effects/LevelAuraEffects.js';

const KNIGHT = 7;
const LORD_KNIGHT = 4008;
const RUNE_KNIGHT = 4054;
const IMPERIAL_GUARD = 4258;
const HYPER_NOVICE = 4307;

describe('auraTier', () => {
	const s = auraSettings();

	it('gives no aura below 99, and the level-99 aura from 99', () => {
		expect(auraTier(98, KNIGHT, s)).toBeNull();
		expect(auraTier(99, KNIGHT, s)).toBe(99);
		expect(auraTier(149, RUNE_KNIGHT, s)).toBe(99);
	});

	it('follows the client table past 99: 150, then the 185 aura from 160', () => {
		expect(auraTier(150, RUNE_KNIGHT, s)).toBe(150);
		expect(auraTier(160, RUNE_KNIGHT, s)).toBe(185);
		expect(auraTier(200, RUNE_KNIGHT, s)).toBe(185);
	});

	it('gives a 4th job the gold aura from 250, and the 185 aura before it', () => {
		expect(auraTier(249, IMPERIAL_GUARD, s)).toBe(185);
		expect(auraTier(250, IMPERIAL_GUARD, s)).toBe('fourth');
		expect(auraTier(275, IMPERIAL_GUARD, s)).toBe('fourth');
		expect(auraTier(275, HYPER_NOVICE, s)).toBe('fourth');
	});

	it('gives a transcendent second job the 185 aura at 99 (UpperJobMaxLvAura), unless switched off', () => {
		expect(auraTier(99, LORD_KNIGHT, s)).toBe(185);
		expect(auraTier(99, LORD_KNIGHT, auraSettings({ upperJob: false }))).toBe(99);
	});

	it('takes its levels from the server config', () => {
		const custom = auraSettings({ defaultLv: 150, fourthLv: 275 });
		expect(auraTier(149, RUNE_KNIGHT, custom)).toBeNull();
		expect(auraTier(250, IMPERIAL_GUARD, custom)).toBe(185);
		expect(auraTier(275, IMPERIAL_GUARD, custom)).toBe('fourth');
	});
});

describe('isFourthJob', () => {
	it('covers the 4th jobs and the expanded 4th jobs, and nothing else', () => {
		expect(isFourthJob(4252)).toBe(true);
		expect(isFourthJob(4281)).toBe(true);
		expect(isFourthJob(4316)).toBe(true);
		expect(isFourthJob(4282)).toBe(false);
		expect(isFourthJob(RUNE_KNIGHT)).toBe(false);
	});
});

describe('colours', () => {
	it('reads 0-255 RGB, clamped, and marks black as dark', () => {
		expect(auraColor([255, 155, 0])).toEqual({ r: 1, g: 155 / 255, b: 0, dark: false });
		expect(auraColor([300, -5, 0])).toEqual({ r: 1, g: 0, b: 0, dark: false });
		expect(auraColor([0, 0, 0]).dark).toBe(true);
		expect(auraColor([0, 0])).toBeNull();
		expect(auraColor('red')).toBeNull();
	});

	it('draws each tier in its own colour, the gold 4th-job aura as the client does', () => {
		expect(tierColor('fourth', auraSettings())).toEqual(auraColor([255, 155, 0]));
	});

	it('lets the server colour every tier, or one', () => {
		const all = auraSettings({ color: [0, 255, 0] });
		expect(tierColor(150, all)).toEqual(auraColor([0, 255, 0]));
		const one = auraSettings({ color: [0, 255, 0], colors: { fourth: [255, 0, 255] } });
		expect(tierColor('fourth', one)).toEqual(auraColor([255, 0, 255]));
		expect(tierColor(185, one)).toEqual(auraColor([0, 255, 0]));
	});
});

describe('effect table', () => {
	it('has an entry for every effect a tier plays', () => {
		for (const id of ALL_TIER_EFFECTS.filter(id => id > 202)) {
			expect(LevelAuraEffects[id], `effect ${id}`).toBeDefined();
		}
		expect(TIER_EFFECTS.fourth.simple).toEqual([2276]);
	});

	it('has the ten coloured level-99 and level-160 hat-effect auras', () => {
		for (let id = 1164; id <= 1183; id++) {
			expect(LevelAuraEffects[id], `effect ${id}`).toBeDefined();
		}
		expect(LevelAuraEffects[1164]).toHaveLength(3); // the level-99 aura's three parts
		expect(LevelAuraEffects[1174]).toHaveLength(2); // bubbles and rings
	});

	it('has the eleven job-coloured level-99 and level-160 hat-effect auras', () => {
		for (let id = 1325; id <= 1335; id++) {
			expect(LevelAuraEffects[id], `effect ${id}`).toHaveLength(3);
			expect(LevelAuraEffects[id + 11], `effect ${id + 11}`).toHaveLength(2);
		}
		expect(LevelAuraEffects[1347]).toBeUndefined();
	});

	it('has the midnight blue and gray auras, but not the shared effect 2281', () => {
		expect(LevelAuraEffects[2281]).toBeUndefined();
		expect(LevelAuraEffects[2282]).toHaveLength(2);
		expect(LevelAuraEffects[2283]).toHaveLength(3);
		expect(LevelAuraEffects[2284]).toHaveLength(2);
	});
});
