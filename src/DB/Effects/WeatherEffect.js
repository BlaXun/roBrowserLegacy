/**
 * DB/Effects/WeatherEffect.js
 *
 * Weather DB
 *
 * This file is part of ROBrowser, Ragnarok Online in the Web Browser (http://www.robrowser.com/).
 *
 * @author Vincent Thibault
 */

const Weather = {};

// Sky and clouds features
Weather.sky = {};
Weather.effects = {};

// Blue sky and white clouds
Weather.sky['airplane.rsw'] = { skyColor: [0.4, 0.6, 0.8, 1.0], cloudColor: [1.0, 1.0, 1.0] };
Weather.sky['airplane_01.rsw'] = { skyColor: [0.4, 0.6, 0.8, 1.0], cloudColor: [1.0, 1.0, 1.0] };
Weather.sky['gonryun.rsw'] = { skyColor: [0.4, 0.6, 0.8, 1.0], cloudColor: [1.0, 1.0, 1.0] };
Weather.sky['gon_dun02.rsw'] = { skyColor: [0.4, 0.6, 0.8, 1.0], cloudColor: [1.0, 1.0, 1.0] };
Weather.sky['himinn.rsw'] = { skyColor: [0.4, 0.6, 0.8, 1.0], cloudColor: [1.0, 1.0, 1.0] };
Weather.sky['ra_temsky.rsw'] = { skyColor: [0.4, 0.6, 0.8, 1.0], cloudColor: [1.0, 1.0, 1.0] };
Weather.sky['rwc01.rsw'] = { skyColor: [0.4, 0.6, 0.8, 1.0], cloudColor: [1.0, 1.0, 1.0] };
Weather.sky['sch_gld.rsw'] = { skyColor: [0.4, 0.6, 0.8, 1.0], cloudColor: [1.0, 1.0, 1.0] };
Weather.sky['valkyrie.rsw'] = { skyColor: [0.4, 0.6, 0.8, 1.0], cloudColor: [1.0, 1.0, 1.0] };
Weather.sky['yuno.rsw'] = { skyColor: [0.4, 0.6, 0.8, 1.0], cloudColor: [1.0, 1.0, 1.0] };

// Extras
Weather.sky['5@tower.rsw'] = { skyColor: [0.2, 0.0, 0.2, 1.0], cloudColor: [1.0, 0.7, 0.7] };
Weather.sky['thana_boss.rsw'] = { skyColor: [0.88, 0.83, 0.76, 1.0], cloudColor: [0.37, 0.0, 0.0] };

// TODO: add others effect
Weather.effects['xmas.rsw'] = { weather: 'snow' };
Weather.effects['comodo.rsw'] = { weather: 'fireworks' };
Weather.effects['einbroch.rsw'] = { weather: 'cloud3' };
//Weather.effects['payon.rsw'] = { weather: 'rain' };

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
 * Add maps from outside the client to the tables above: the `mapWeather`
 * config, so a custom map can have a sky and weather without a change here.
 *
 *   mapWeather: {
 *     'my_isle.rsw': { skyColor: [0.4, 0.6, 0.8, 1.0], cloudColor: [1.0, 1.0, 1.0], weather: 'snow' }
 *   }
 *
 * `skyColor` (RGBA, 0 to 1) is the colour behind the map, with clouds of
 * `cloudColor` (RGB) when it is given and none when it is not. `weather` is
 * one of the screen effects ScreenEffectManager starts ('snow', 'rain',
 * 'fireworks', 'leaves', 'sakura', 'cloud' to 'cloud8'). Each map given here
 * replaces what the tables above say about it; every other map is unchanged.
 *
 * @param {object} weather the tables, `Weather` itself outside tests
 * @param {object} extra the `mapWeather` config, or undefined
 * @return {object} weather
 */
export function addMapWeather(weather, extra) {
	if (!extra || typeof extra !== 'object') {
		return weather;
	}
	for (const [key, entry] of Object.entries(extra)) {
		if (!entry || typeof entry !== 'object') {
			continue;
		}
		const name = key.toLowerCase();
		const map = name.endsWith('.rsw') ? name : `${name}.rsw`;
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
 * Export
 */
export default Weather;
