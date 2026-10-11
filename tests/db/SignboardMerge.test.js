import { describe, it, expect } from 'vitest';

import { mergeSignboards } from 'DB/Map/SignboardMerge.js';

const row = (mapname, x, y, icon) => ({ mapname, x, y, type: 1, icon_location: icon });

describe('mergeSignboards', () => {
	it('keys rows by map and cell', () => {
		const table = mergeSignboards([row('prontera', 146, 89, 'kafra')]);
		expect(table.prontera[146][89].icon_location).toBe('kafra');
	});

	it('adds a later table to the one before, keeping every other sign', () => {
		const table = mergeSignboards([row('prontera', 146, 89, 'kafra'), row('geffen', 120, 62, 'kafra')]);
		mergeSignboards([row('prontera', 160, 185, 'nmtrade')], table);
		expect(table.prontera[146][89].icon_location).toBe('kafra');
		expect(table.geffen[120][62].icon_location).toBe('kafra');
		expect(table.prontera[160][185].icon_location).toBe('nmtrade');
	});

	it('lets a later table replace the sign on a cell it shares', () => {
		const table = mergeSignboards([row('prontera', 146, 89, 'kafra')]);
		mergeSignboards([row('prontera', 146, 89, 'store')], table);
		expect(table.prontera[146][89].icon_location).toBe('store');
	});

	it('files a map under the lower-case name the map engine asks for', () => {
		const table = mergeSignboards([row('Prontera', 160, 185, 'nmtrade')]);
		expect(table.prontera[160][185].icon_location).toBe('nmtrade');
	});

	it('lets a later row with no icon remove the sign on its cell', () => {
		const table = mergeSignboards([row('prontera', 146, 89, 'kafra'), row('prontera', 150, 89, 'store')]);
		mergeSignboards([row('Prontera', 146, 89, null)], table);
		expect(table.prontera[146][89]).toBeUndefined();
		expect(table.prontera[150][89].icon_location).toBe('store');
	});

	it('never keeps a row with no icon', () => {
		const table = mergeSignboards([row('prontera', 146, 89, null)]);
		expect(table.prontera?.[146]?.[89]).toBeUndefined();
	});

	it('skips a row with no map', () => {
		expect(mergeSignboards([row(null, 1, 1, 'kafra')])).toEqual({});
	});
});
