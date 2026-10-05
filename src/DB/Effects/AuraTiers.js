/**
 * DB/Effects/AuraTiers.js
 *
 * Which level aura a character wears, and in what colour.
 *
 * Official clients pick the aura from a table in their own data,
 * `data/luafiles514/lua files/service_korea/ExternalSettings_kr.lub`
 * (LEVELAURA, Level99AuraTable, MaxLevelAuraTable), and the level each tier
 * starts at from the executable:
 *
 *   99                       EF_LEVEL99 (200) and its ground ring and bubbles
 *   150                      EF_LEVEL150 / _SUB (978 / 979)
 *   160 and 185              EF_LEVEL185 / _SUB (1226 / 1227), both
 *   a transcendent job's max EF_LEVEL185 (UpperJobMaxLvAura)
 *   a 4th job at max level   EF_LEVEL4TH / _SUB (2275 / 2276)
 *
 * iRO describes the result as a big red aura at 200 and a big yellow one at
 * 250 (irowiki.org/wiki/Levels). Every one past 99 is the same effect, the
 * client's CLevel150Effect, tinted per tier (Renderer/Effects/MaxLevelAura.js).
 *
 * The levels can be moved, and the colours replaced, from the server's
 * `aura` config, as `defaultLv` always could be:
 *
 *   aura: { defaultLv: 99, lv150: 150, lv160: 160, fourthLv: 250,
 *           upperJob: true, color: [255, 0, 0], colors: { fourth: [0, 200, 255] } }
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

/** The effects each tier plays: `full` for /aura 2, `simple` for /aura 1. */
export const TIER_EFFECTS = {
	99: { full: [200, 201, 202], simple: [202] },
	150: { full: [978, 979], simple: [979] },
	185: { full: [1226, 1227], simple: [1227] },
	fourth: { full: [2275, 2276], simple: [2276] }
};

/** Every effect a level aura may have started, for removing one whatever it was. */
export const ALL_TIER_EFFECTS = [...new Set(Object.values(TIER_EFFECTS).flatMap(t => t.full))];

/**
 * The tint of each high-level tier, 0-255. The 4th-job gold is the executable's
 * (255, 155, 0); the others follow the colours official servers show.
 */
export const TIER_COLORS = {
	150: [90, 140, 255],
	160: [255, 220, 70],
	185: [255, 80, 150],
	fourth: [255, 155, 0]
};

/** The coloured auras costume items give (hat effects 1164-1183), 0-255. */
export const NAMED_COLORS = {
	red: [255, 40, 40],
	ultramarine: [40, 70, 255],
	cyan: [0, 225, 255],
	lime: [140, 255, 40],
	violet: [160, 60, 255],
	lilac: [215, 150, 255],
	sun_orange: [255, 140, 0],
	deep_pink: [255, 30, 140],
	black: [0, 0, 0],
	white: [255, 255, 255]
};

const DEFAULTS = {
	defaultLv: 99,
	lv150: 150,
	lv160: 160,
	fourthLv: 250,
	upperJob: true
};

/** Transcendent second jobs: Lord Knight (4008) to Paladin riding (4022). */
function isTranscendentSecond(job) {
	return job >= 4008 && job <= 4022;
}

/** Fourth jobs: Dragon Knight (4252) to Imperial Guard 2 (4281), and Sky Emperor (4302) to Sky Emperor 2 (4316). */
export function isFourthJob(job) {
	return (job >= 4252 && job <= 4281) || (job >= 4302 && job <= 4316);
}

/**
 * The aura settings: the defaults with the server's `aura` config over them.
 *
 * @param {object} server the server's `aura` config, or undefined
 */
export function auraSettings(server) {
	return Object.assign({}, DEFAULTS, server && typeof server === 'object' ? server : {});
}

/**
 * The tier a character wears: 99, 150, 185 or 'fourth', or null for none.
 *
 * @param {number} level base level
 * @param {number} job job id
 * @param {object} settings from auraSettings
 * @return {number|string|null}
 */
export function auraTier(level, job, settings) {
	if (!(level >= settings.defaultLv)) {
		return null;
	}
	if (isFourthJob(job) && level >= settings.fourthLv) {
		return 'fourth';
	}
	// Default160LvAura and Default185LvAura are both EF_LEVEL185.
	if (level >= settings.lv160) {
		return 185;
	}
	if (level >= settings.lv150) {
		return 150;
	}
	if (settings.upperJob && isTranscendentSecond(job)) {
		return 185;
	}
	return 99;
}

/**
 * A 0-255 RGB list as the colour the aura effects take, or null for none or
 * one that is not three numbers. Black (or near it) cannot be drawn by adding
 * light, so it is marked `dark`, and the effects darken instead.
 *
 * @param {Array} rgb [r, g, b], 0-255
 * @return {{r: number, g: number, b: number, dark: boolean}|null}
 */
export function auraColor(rgb) {
	if (!Array.isArray(rgb) || rgb.length !== 3 || !rgb.every(c => typeof c === 'number' && Number.isFinite(c))) {
		return null;
	}
	const [r, g, b] = rgb.map(c => Math.min(255, Math.max(0, c)) / 255);
	return { r, g, b, dark: r + g + b < 0.15 };
}

/**
 * The colour a tier is drawn in: the server's for that tier, else its `color`
 * for all, else the tier's own. Null for the 99 aura with nothing set, which
 * keeps its own blue.
 *
 * @param {number|string} tier from auraTier
 * @param {object} settings from auraSettings
 */
export function tierColor(tier, settings) {
	const own = settings.colors && typeof settings.colors === 'object' ? settings.colors[tier] : undefined;
	return auraColor(own) || auraColor(settings.color) || auraColor(TIER_COLORS[tier]);
}
