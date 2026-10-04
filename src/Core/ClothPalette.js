/**
 * Core/ClothPalette.js
 *
 * Cloth colours the client data does not have.
 *
 * A body's cloth colour n is drawn with data/palette/몸/<job>_<sex>_<n>.pal.
 * Servers allow colours up to max_cloth_color (rAthena: 7), but many clients
 * ship fewer per job -- iRO's data has three for a High Priest, four for a
 * Knight -- and a missing file falls back to the sprite's own palette, so
 * colour 4 and up all look like colour 0.
 *
 * When such a file is missing, a palette is built from the job's own: the
 * indices that differ between its palettes are the clothes, and those get a
 * new hue from LOOKS while keeping their lightness, so shading stays. Skin,
 * hair and everything else keep the job's first palette. A job with fewer
 * than two palettes of its own is left as it was: nothing tells its clothes
 * apart.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */
import Thread from 'Core/Thread.js';

/** Body palettes, data/palette/몸/, in the client's codepage. */
const BODY_DIR = 'data/palette/\xb8\xf6/';

/** <job>_<sex>_<n>.pal, or <job>_<sex>_<n>_1.pal for a costume_1 body. */
const NAME = /^(.*_)(\d+)(_1)?\.pal$/i;

/** The job's own palettes that are compared, when they exist. */
const SIBLINGS = [1, 2, 3];

/**
 * The look of a built colour, by colour number: 4, 8, ... light green;
 * 5 brown; 6 black; 7 purple. Hue in degrees (null: grey), then factors for
 * saturation and lightness.
 */
const LOOKS = [
	[105, 0.85, 1.05],
	[28, 0.55, 0.8],
	[null, 0, 0.45],
	[275, 0.75, 0.95]
];

/**
 * Index 0 is transparent. Index 1 is left alone too: a female High Priest's
 * palette 3 changes it, and recolouring it was not needed for the clothes.
 */
const FIRST_CLOTH_INDEX = 2;

/**
 * Whether a palette that failed to load is one this can build.
 *
 * @param {string} filename
 * @return {boolean}
 */
function canBuild(filename) {
	return filename.startsWith(BODY_DIR) && NAME.test(filename.slice(BODY_DIR.length));
}

/**
 * Build the palette for a missing body palette file.
 *
 * @param {string} filename - the missing .pal
 * @param {function} callback - called with a 1024-byte Uint8Array, or null
 */
function build(filename, callback) {
	const match = filename.match(NAME);
	const colour = parseInt(match[2], 10);
	const names = SIBLINGS.filter(n => n !== colour).map(n => match[1] + n + (match[3] || '') + '.pal');
	const found = new Array(names.length).fill(null);
	let pending = names.length;

	names.forEach((name, i) => {
		// Read straight from the game data: through Memory, a sibling that is
		// missing too would be remembered as an error for its own use later.
		Thread.send('GET_FILE', { filename: name, args: null }, (data, error) => {
			if (!error && data && data.byteLength >= 1024) {
				found[i] = new Uint8Array(data, 0, 1024);
			}
			if (--pending === 0) {
				callback(recolour(found.filter(Boolean), colour));
			}
		});
	});
}

/**
 * @param {Uint8Array[]} palettes - the job's own, first one first
 * @param {number} colour
 * @return {Uint8Array|null}
 */
function recolour(palettes, colour) {
	if (palettes.length < 2) {
		return null;
	}

	const base = palettes[0];
	const cloth = [];
	for (let i = FIRST_CLOTH_INDEX; i < 256; ++i) {
		const o = i * 4;
		if (palettes.some(p => p[o] !== base[o] || p[o + 1] !== base[o + 1] || p[o + 2] !== base[o + 2])) {
			cloth.push(i);
		}
	}
	if (!cloth.length) {
		return null;
	}

	const [hue, saturation, lightness] = LOOKS[(((colour - 4) % LOOKS.length) + LOOKS.length) % LOOKS.length];
	const out = new Uint8Array(base);
	for (const i of cloth) {
		const o = i * 4;
		const hls = rgbToHls(base[o] / 255, base[o + 1] / 255, base[o + 2] / 255);
		const h = hue === null ? hls[0] : hue / 360;
		const l = Math.min(1, hls[1] * lightness);
		const s = hue === null ? 0 : Math.min(1, Math.max(hls[2], 0.35) * saturation);
		const rgb = hlsToRgb(h, l, s);
		out[o] = Math.round(rgb[0] * 255);
		out[o + 1] = Math.round(rgb[1] * 255);
		out[o + 2] = Math.round(rgb[2] * 255);
	}
	return out;
}

/** Python's colorsys.rgb_to_hls: all values 0..1. */
function rgbToHls(r, g, b) {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) {
		return [0, l, 0];
	}
	const d = max - min;
	const s = l <= 0.5 ? d / (max + min) : d / (2 - max - min);
	const rc = (max - r) / d;
	const gc = (max - g) / d;
	const bc = (max - b) / d;
	let h = r === max ? bc - gc : g === max ? 2 + rc - bc : 4 + gc - rc;
	h = (((h / 6) % 1) + 1) % 1;
	return [h, l, s];
}

/** Python's colorsys.hls_to_rgb: all values 0..1. */
function hlsToRgb(h, l, s) {
	if (s === 0) {
		return [l, l, l];
	}
	const m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s;
	const m1 = 2 * l - m2;
	return [channel(m1, m2, h + 1 / 3), channel(m1, m2, h), channel(m1, m2, h - 1 / 3)];
}

function channel(m1, m2, h) {
	h = ((h % 1) + 1) % 1;
	if (h < 1 / 6) {
		return m1 + (m2 - m1) * h * 6;
	}
	if (h < 0.5) {
		return m2;
	}
	if (h < 2 / 3) {
		return m1 + (m2 - m1) * (2 / 3 - h) * 6;
	}
	return m1;
}

export default { canBuild, build, recolour };
