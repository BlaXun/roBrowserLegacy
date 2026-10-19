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
 * The indices that differ between a job's palettes (<job>_<sex>_0.pal, the
 * sprite's own, and 1-3) are its clothes. Cloth colour n then is:
 *
 * - the game data's palette, when it has one and its clothes are not too
 *   dark (DARK): a black that is a solid blot is replaced as below;
 * - otherwise the colour of hair colour n (data/palette/머리/머리1_<sex>_<n>.pal):
 *   the clothes take the hair palette's shades, darkest to lightest, in the
 *   order of their own lightness, so shading stays; a dark hair colour is
 *   lifted, so black clothes still show their folds;
 * - without the job's _0 palette or the hair palette, a missing colour is
 *   built as before: the clothes get a new hue from LOOKS, keeping their
 *   lightness.
 *
 * PICKS overrides this per job and colour. Skin, hair and everything else
 * keep the job's own palette. A job with fewer than two palettes of its own
 * is left as it was: nothing tells its clothes apart.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */
import Thread from 'Core/Thread.js';

/** Body palettes, data/palette/몸/, in the client's codepage. */
const BODY_DIR = 'data/palette/\xb8\xf6/';

/**
 * <job>_<sex>_<n>.pal, or <job>_<sex>_<n>_1.pal for a costume_1 body. The
 * prefix is the shortest that fits, so a costume's _<n>_1 is not read as
 * colour 1 of a job named <job>_<sex>_<n>.
 */
const NAME = /^(.*?_)(\d+)(_1)?\.pal$/i;

/** The job's own palettes that are compared, when they exist. */
const SIBLINGS = [1, 2, 3];

/** Hair style 1's palettes, data/palette/머리/머리1_, in the client's codepage. */
const HAIR = 'data/palette/\xb8\xd3\xb8\xae/\xb8\xd3\xb8\xae1_';

/** Clothes whose average lightness (0..1) is below this are too dark. */
const DARK = 0.3;

/**
 * Per job (palette name, client codepage) and colour: 'data' keeps the game
 * data's palette, or the LOOKS colour when it has none; 'hair' always takes
 * the hair colour. Chosen by looking at each job's colours.
 */
const PICKS = {
	'\xc7\xc1\xb8\xae\xbd\xba\xc6\xae': { 4: 'hair', 6: 'data', 7: 'data' }, // 프리스트 Priest
	'\xc0\xa7\xc0\xfa\xb5\xe5': { 6: 'data', 7: 'data' }, // 위저드 Wizard
	'\xbc\xba\xc1\xf7\xc0\xda': { 6: 'data', 7: 'data' }, // 성직자 Acolyte
	'\xbe\xee\xbc\xbc\xbd\xc5': { 6: 'data', 7: 'data' }, // 어세신 Assassin
	'\xb4\xed\xbc\xad': { 6: 'data', 7: 'data' } // 댄서 Dancer
};

/**
 * The look of a built colour, by colour number: 4, 8, ... light green;
 * 5 brown; 6 black; 7 purple. Hue in degrees (null: grey), then factors for
 * saturation and lightness.
 */
const LOOKS = [
	[105, 0.85, 1.05],
	[28, 0.6, 0.65],
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
	const job = parse(filename);
	load(job, function (own, siblings, hair, hair0) {
		if (pick(job) !== 'data' && own && hair && hair0) {
			const cloth = clothIndices([own, ...siblings.filter(Boolean)]);
			if (cloth.length) {
				callback(fromHair(own, cloth, hair, hair0));
				return;
			}
		}
		callback(
			recolour(
				siblings.filter((p, i) => p && SIBLINGS[i] !== job.colour),
				job.colour
			)
		);
	});
}

/**
 * Check a body palette the game data has: replaced by the hair colour when
 * PICKS says so or its clothes are too dark.
 *
 * @param {string} filename
 * @param {ArrayBuffer|Uint8Array} data - the file
 * @param {function} callback - called with a replacement Uint8Array, or null to keep the file
 */
function adjust(filename, data, callback) {
	const job = parse(filename);
	const choice = pick(job);
	if (!job.colour || choice === 'data' || data.byteLength < 1024) {
		callback(null);
		return;
	}
	const pal =
		data instanceof ArrayBuffer
			? new Uint8Array(data, 0, 1024)
			: new Uint8Array(data.buffer, data.byteOffset, 1024);
	load(job, function (own, siblings, hair, hair0) {
		if (!own || !hair || !hair0) {
			callback(null);
			return;
		}
		const cloth = clothIndices([own, ...siblings.filter(Boolean)]);
		if (cloth.length && (choice === 'hair' || isDark(pal, own, cloth))) {
			callback(fromHair(own, cloth, hair, hair0));
			return;
		}
		callback(null);
	});
}

/**
 * <job>_<sex>_<n>(_1).pal into its parts.
 *
 * @param {string} filename - a body palette (canBuild)
 */
function parse(filename) {
	const match = filename.match(NAME);
	const parts = match[1].slice(BODY_DIR.length, -1).split('_');
	return {
		prefix: match[1],
		suffix: (match[3] || '') + '.pal',
		colour: parseInt(match[2], 10),
		sex: parts.pop(),
		name: parts.join('_')
	};
}

/** @return {string|undefined} PICKS' choice for this job and colour */
function pick(job) {
	return (PICKS[job.name] || {})[job.colour];
}

/**
 * Read the job's _0 and sibling palettes and hair colours n and 0.
 *
 * @param {object} job - from parse()
 * @param {function} callback - (own, siblings[], hair, hair0), each a Uint8Array or null
 */
function load(job, callback) {
	const names = [
		job.prefix + '0' + job.suffix,
		...SIBLINGS.map(n => job.prefix + n + job.suffix),
		HAIR + job.sex + '_' + job.colour + '.pal',
		HAIR + job.sex + '_0.pal'
	];
	const found = new Array(names.length).fill(null);
	let pending = names.length;

	names.forEach((name, i) => {
		// Read straight from the game data: through Memory, a palette that is
		// missing too would be remembered as an error for its own use later,
		// and a body palette would be checked again.
		Thread.send('GET_FILE', { filename: name, args: null }, (data, error) => {
			if (!error && data && data.byteLength >= 1024) {
				found[i] = new Uint8Array(data, 0, 1024);
			}
			if (--pending === 0) {
				callback(
					found[0],
					found.slice(1, 1 + SIBLINGS.length),
					found[names.length - 2],
					found[names.length - 1]
				);
			}
		});
	});
}

/**
 * The indices that differ between palettes: the clothes.
 *
 * @param {Uint8Array[]} palettes - the first one is compared with the rest
 * @return {number[]}
 */
function clothIndices(palettes) {
	const base = palettes[0];
	const cloth = [];
	for (let i = FIRST_CLOTH_INDEX; i < 256; ++i) {
		const o = i * 4;
		if (palettes.some(p => p[o] !== base[o] || p[o + 1] !== base[o + 1] || p[o + 2] !== base[o + 2])) {
			cloth.push(i);
		}
	}
	return cloth;
}

/**
 * Whether a palette's clothes (where it differs from the job's own) are on
 * average darker than DARK.
 *
 * @param {Uint8Array} pal
 * @param {Uint8Array} own - the job's _0 palette
 * @param {number[]} cloth - clothIndices
 * @return {boolean}
 */
function isDark(pal, own, cloth) {
	let sum = 0;
	let count = 0;
	for (const i of cloth) {
		const o = i * 4;
		if (pal[o] === own[o] && pal[o + 1] === own[o + 1] && pal[o + 2] === own[o + 2]) {
			continue;
		}
		sum += rgbToHls(pal[o] / 255, pal[o + 1] / 255, pal[o + 2] / 255)[1];
		count++;
	}
	return count > 0 && sum / count < DARK;
}

/**
 * The job's own palette with its clothes in a hair colour's shades.
 *
 * @param {Uint8Array} own - the job's _0 palette
 * @param {number[]} cloth - clothIndices
 * @param {Uint8Array} hair - hair colour n
 * @param {Uint8Array} hair0 - hair colour 0: what n changes is the hair
 * @return {Uint8Array}
 */
function fromHair(own, cloth, hair, hair0) {
	const ramp = [];
	for (let i = FIRST_CLOTH_INDEX; i < 256; ++i) {
		const o = i * 4;
		if (hair[o] === hair0[o] && hair[o + 1] === hair0[o + 1] && hair[o + 2] === hair0[o + 2]) {
			continue;
		}
		ramp.push({
			l: rgbToHls(hair[o] / 255, hair[o + 1] / 255, hair[o + 2] / 255)[1],
			c: [hair[o], hair[o + 1], hair[o + 2]]
		});
	}
	const out = new Uint8Array(own);
	if (!ramp.length) {
		return out;
	}
	ramp.sort((a, b) => a.l - b.l);

	const lights = cloth.map(i => rgbToHls(own[i * 4] / 255, own[i * 4 + 1] / 255, own[i * 4 + 2] / 255)[1]);
	const min = Math.min(...lights);
	const max = Math.max(...lights);
	const low = ramp[0].l;
	const high = ramp[ramp.length - 1].l;
	const dark = ramp.reduce((sum, x) => sum + x.l, 0) / ramp.length < 0.45;

	cloth.forEach((i, k) => {
		const t = (lights[k] - min) / (max - min || 1);
		let c = shadeAt(ramp, low + t * (high - low));
		if (dark) {
			// Black that is not a solid blot.
			const [h, l, s] = rgbToHls(c[0] / 255, c[1] / 255, c[2] / 255);
			c = hlsToRgb(h, 0.3 + 0.7 * l, s).map(v => v * 255);
		}
		const o = i * 4;
		out[o] = Math.round(c[0]);
		out[o + 1] = Math.round(c[1]);
		out[o + 2] = Math.round(c[2]);
	});
	return out;
}

/** The ramp's colour at a lightness, between its two nearest shades. */
function shadeAt(ramp, l) {
	if (l <= ramp[0].l) {
		return ramp[0].c;
	}
	for (let k = 1; k < ramp.length; ++k) {
		if (l <= ramp[k].l) {
			const a = ramp[k - 1];
			const b = ramp[k];
			const t = (l - a.l) / (b.l - a.l || 1);
			return a.c.map((v, j) => v + (b.c[j] - v) * t);
		}
	}
	return ramp[ramp.length - 1].c;
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
	const cloth = clothIndices(palettes);
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

export default { canBuild, build, adjust, recolour, fromHair, clothIndices, isDark };
