import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = vi.hoisted(() => new Map());
vi.mock('Core/Thread.js', () => ({
	default: {
		send(type, { filename }, callback) {
			const data = files.get(filename);
			callback(data ? data.buffer.slice(0) : null, data ? null : 'not found');
		}
	}
}));

const { default: ClothPalette } = await import('Core/ClothPalette.js');

/** 몸 / 머리 / 머리1 / 남 / 프리스트 in the client's codepage */
const BODY = 'data/palette/\xb8\xf6/';
const HAIR = 'data/palette/\xb8\xd3\xb8\xae/\xb8\xd3\xb8\xae1_';
const MALE = '\xb3\xb2';
const PRIEST = '\xc7\xc1\xb8\xae\xbd\xba\xc6\xae';

/** A palette: every index grey 100, then the given colours. */
function palette(colours = {}) {
	const p = new Uint8Array(1024);
	for (let i = 0; i < 256; ++i) {
		p.set([100, 100, 100, 0], i * 4);
	}
	for (const [i, c] of Object.entries(colours)) {
		p.set(c, i * 4);
	}
	return p;
}

const rgb = (p, i) => Array.from(p.subarray(i * 4, i * 4 + 3));
const run = (fn, ...args) => new Promise(resolve => fn(...args, resolve));

/** A job whose clothes are indices 10-12, palettes 0-3, hair colours 0 and 1-7. */
function job(name) {
	const prefix = BODY + name + '_' + MALE + '_';
	files.set(prefix + '0.pal', palette({ 10: [60, 60, 60], 11: [120, 120, 120], 12: [180, 180, 180] }));
	files.set(prefix + '1.pal', palette({ 10: [60, 0, 0], 11: [120, 0, 0], 12: [180, 0, 0] }));
	files.set(prefix + '2.pal', palette({ 10: [60, 160, 60], 11: [90, 200, 90], 12: [140, 240, 140] }));
	files.set(prefix + '3.pal', palette({ 10: [0, 0, 60], 11: [0, 0, 120], 12: [0, 0, 180] }));
	// a black colour 4
	files.set(prefix + '4.pal', palette({ 10: [5, 5, 5], 11: [10, 10, 10], 12: [20, 20, 20] }));
	files.set(HAIR + MALE + '_0.pal', palette({ 50: [0, 0, 0], 51: [0, 0, 0] }));
	for (let n = 1; n <= 7; ++n) {
		files.set(HAIR + MALE + '_' + n + '.pal', palette({ 50: [200, 40, 40], 51: [250, 120, 120] }));
	}
	return prefix;
}

beforeEach(() => files.clear());

describe('ClothPalette', () => {
	it('builds a missing colour from the hair colour, keeping the rest of the palette', async () => {
		const prefix = job('job');
		const built = await run(ClothPalette.build, prefix + '5.pal');
		expect(rgb(built, 10)).toEqual([200, 40, 40]); // darkest cloth -> darkest hair shade
		expect(rgb(built, 12)).toEqual([250, 120, 120]); // lightest -> lightest
		expect(rgb(built, 20)).toEqual([100, 100, 100]);
	});

	it('swaps a too dark palette of the game data for the hair colour', async () => {
		const prefix = job('job');
		const replaced = await run(ClothPalette.adjust, prefix + '4.pal', files.get(prefix + '4.pal').buffer);
		expect(rgb(replaced, 10)).toEqual([200, 40, 40]);
	});

	it('keeps a palette of the game data that is not too dark', async () => {
		const prefix = job('job');
		expect(await run(ClothPalette.adjust, prefix + '2.pal', files.get(prefix + '2.pal').buffer)).toBeNull();
	});

	it('follows PICKS: Priest 6 is built from LOOKS, 4 is the hair colour', async () => {
		const prefix = job(PRIEST);
		files.set(prefix + '4.pal', palette({ 10: [0, 60, 60], 11: [0, 120, 120], 12: [0, 180, 180] }));
		const four = await run(ClothPalette.adjust, prefix + '4.pal', files.get(prefix + '4.pal').buffer);
		expect(rgb(four, 10)).toEqual([200, 40, 40]);
		const six = await run(ClothPalette.build, prefix + '6.pal');
		const looks = ClothPalette.recolour([1, 2, 3].map(n => files.get(prefix + n + '.pal')), 6);
		expect(six).toEqual(looks);
	});

	it('falls back to the LOOKS colour without the hair palette', async () => {
		const prefix = job('job');
		files.delete(HAIR + MALE + '_5.pal');
		const built = await run(ClothPalette.build, prefix + '5.pal');
		expect(built).toEqual(ClothPalette.recolour([1, 2, 3].map(n => files.get(prefix + n + '.pal')), 5));
	});

	it('reads a costume_1 body palette, <job>_<sex>_<n>_1.pal, as colour n', async () => {
		const plain = job('job');
		const prefix = BODY + 'costume_1/job_' + MALE + '_';
		for (const n of [0, 1, 2, 3]) {
			files.set(prefix + n + '_1.pal', files.get(plain + n + '.pal'));
		}
		const built = await run(ClothPalette.build, prefix + '5_1.pal');
		expect(rgb(built, 10)).toEqual([200, 40, 40]);
		expect(rgb(built, 12)).toEqual([250, 120, 120]);
	});
});
