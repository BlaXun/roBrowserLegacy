import { describe, it, expect } from 'vitest';

import { addCustomMapWeather, customMapBgm } from 'DB/Map/CustomMaps.js';

const tables = () => ({
	sky: { 'yuno.rsw': { skyColor: [0.4, 0.6, 0.8, 1.0], cloudColor: [1.0, 1.0, 1.0] } },
	effects: { 'xmas.rsw': { weather: 'snow' } }
});

describe('addCustomMapWeather', () => {
	it('gives a map that is not in the table a sky with clouds', () => {
		const t = addCustomMapWeather(tables(), {
			'my_isle.rsw': { skyColor: [0.4, 0.6, 0.8, 1], cloudColor: [1, 1, 1] }
		});
		expect(t.sky['my_isle.rsw']).toEqual({ skyColor: [0.4, 0.6, 0.8, 1], cloudColor: [1, 1, 1] });
		expect(t.sky['yuno.rsw'].skyColor).toEqual([0.4, 0.6, 0.8, 1.0]);
	});

	it('draws the colour without clouds when no cloud colour is given', () => {
		const t = addCustomMapWeather(tables(), { 'my_cave.rsw': { skyColor: [0.1, 0, 0.1, 1] } });
		expect(t.sky['my_cave.rsw'].cloudColor).toBeNull();
	});

	it('adds weather, and accepts a name without .rsw in any case', () => {
		const t = addCustomMapWeather(tables(), { My_Isle: { weather: 'sakura' } });
		expect(t.effects['my_isle.rsw']).toEqual({ weather: 'sakura' });
		expect(t.sky['my_isle.rsw']).toBeUndefined();
	});

	it('replaces what the table says about a map it names', () => {
		const t = addCustomMapWeather(tables(), { 'yuno.rsw': { skyColor: [1, 0.5, 0.2, 1] } });
		expect(t.sky['yuno.rsw']).toEqual({ skyColor: [1, 0.5, 0.2, 1], cloudColor: null });
	});

	it('ignores colours that are not 0-1 numbers of the right length, and a missing config', () => {
		const t = addCustomMapWeather(tables(), {
			a: { skyColor: [0.4, 0.6, 0.8] },
			b: { skyColor: [0.4, 0.6, 2, 1] },
			c: { skyColor: ['0.4', 0.6, 0.8, 1] },
			d: null
		});
		expect(Object.keys(t.sky)).toEqual(['yuno.rsw']);
		expect(addCustomMapWeather(tables(), undefined)).toEqual(tables());
	});
});

describe('customMapBgm', () => {
	const config = { 'my_isle.rsw': { bgm: 'my_isle.mp3' }, 'my_cave.rsw': { skyColor: [0, 0, 0, 1] } };

	it('gives the music a map names, matched without regard to case', () => {
		expect(customMapBgm(config, 'my_isle.rsw')).toBe('my_isle.mp3');
		expect(customMapBgm(config, 'MY_ISLE.rsw')).toBe('my_isle.mp3');
	});

	it('is null for a map with no music of its own, an unknown map, or no config', () => {
		expect(customMapBgm(config, 'my_cave.rsw')).toBeNull();
		expect(customMapBgm(config, 'prontera.rsw')).toBeNull();
		expect(customMapBgm(undefined, 'my_isle.rsw')).toBeNull();
	});
});
