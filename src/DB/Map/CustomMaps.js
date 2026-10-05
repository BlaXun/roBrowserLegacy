/**
 * DB/Map/CustomMaps.js
 *
 * What the client config says about maps the client's own tables do not
 * know: the `customMaps` entry, keyed by '<map>.rsw'.
 *
 *   customMaps: {
 *     'my_isle.rsw': {
 *       skyColor: [0.4, 0.6, 0.8, 1.0],  // RGBA, 0 to 1: the colour behind the map
 *       cloudColor: [1.0, 1.0, 1.0],     // RGB, 0 to 1: clouds across it; none without
 *       weather: 'snow',                 // a screen effect ScreenEffectManager starts
 *       bgm: 'my_isle.mp3'               // played from BGM/, as mp3nametable.txt names one
 *     }
 *   }
 *
 * The sky and weather come from DB/Effects/WeatherEffect.js, a fixed list of a
 * dozen official maps, and the music from data/mp3nametable.txt, one table for
 * the whole game. Official clients keep the first in the executable, so a
 * custom map could have neither a sky nor music of its own. A map named here
 * gets what its entry gives and keeps the rest; every other map is unchanged.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

/**
 * Whether `color` is a list of `size` numbers from 0 to 1.
 */
function isColor(color, size) {
	return (
		Array.isArray(color) &&
		color.length === size &&
		color.every(c => typeof c === 'number' && Number.isFinite(c) && c >= 0 && c <= 1)
	);
}

/**
 * The entries of a `customMaps` config, by lower-case '<map>.rsw'.
 *
 * @param {object} config the `customMaps` config, or undefined
 * @return {Map<string, object>}
 */
function entries(config) {
	const out = new Map();
	if (!config || typeof config !== 'object') {
		return out;
	}
	for (const [key, entry] of Object.entries(config)) {
		if (!entry || typeof entry !== 'object') {
			continue;
		}
		const name = key.toLowerCase();
		out.set(name.endsWith('.rsw') ? name : `${name}.rsw`, entry);
	}
	return out;
}

/**
 * Add the sky and weather of each map in `config` to the weather tables
 * (`WeatherEffect.js`): a map named there replaces what they say about it.
 *
 * @param {object} weather the tables, `{ sky, effects }`
 * @param {object} config the `customMaps` config, or undefined
 * @return {object} weather
 */
export function addCustomMapWeather(weather, config) {
	for (const [map, entry] of entries(config)) {
		if (isColor(entry.skyColor, 4)) {
			weather.sky[map] = {
				skyColor: entry.skyColor.slice(),
				cloudColor: isColor(entry.cloudColor, 3) ? entry.cloudColor.slice() : null
			};
		}
		if (typeof entry.weather === 'string' && entry.weather) {
			weather.effects[map] = { weather: entry.weather };
		}
	}
	return weather;
}

/**
 * The music `config` gives a map, or null for the map's own.
 *
 * @param {object} config the `customMaps` config, or undefined
 * @param {string} worldResource '<map>.rsw'
 * @return {string|null}
 */
export function customMapBgm(config, worldResource) {
	const entry = entries(config).get(String(worldResource).toLowerCase());
	return entry && typeof entry.bgm === 'string' && entry.bgm ? entry.bgm : null;
}
