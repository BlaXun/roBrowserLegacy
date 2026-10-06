import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
	if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.getItem !== 'function') {
		const store = {};
		globalThis.localStorage = {
			getItem: key => (key in store ? store[key] : null),
			setItem: (key, val) => {
				store[key] = String(val);
			},
			removeItem: key => {
				delete store[key];
			},
			clear: () => {
				for (const k in store) delete store[k];
			}
		};
	}
});

import DB from 'DB/DBManager.js';
import BodyFallbackTable from 'DB/Monsters/BodyFallbackTable.js';

const NPC = 'data/sprite/npc/';
const MOB = 'data/sprite/\xb8\xf3\xbd\xba\xc5\xcd/';

// iRO 2026-09 still names 4_m_drzonda01 for 10243 but ships no such file:
// the Zonda teleporters in every town drew nothing.
describe('DB.getBodyFallbackPaths', () => {
	it('stands a missing Zonda teleporter in with another Zonda NPC, then the generic NPC', () => {
		expect(DB.getBodyPath(10243, 1)).toBe(NPC + '4_m_drzonda01');
		expect(DB.getBodyFallbackPaths(10243, 1)).toEqual([NPC + '4_m_zondaman', NPC + '1_etc_01']);
	});

	it('gives any other NPC the body an unknown NPC id draws', () => {
		expect(DB.getBodyFallbackPaths(10244, 1)).toEqual([NPC + '1_etc_01']);
		expect(DB.getBodyPath(19998, 1)).toBe(NPC + '1_etc_01');
	});

	it('gives a monster the Poring a missing 3D model gets', () => {
		expect(DB.getBodyFallbackPaths(1001, 1)).toEqual([MOB + 'poring']);
		expect(DB.getBodyFallbackPaths(1002, 1)).toEqual([]);
	});

	it('never offers the body itself', () => {
		expect(DB.getBodyFallbackPaths(46, 1)).toEqual([]);
	});

	it('gives players, homunculi, mercenaries and invisible actors none', () => {
		for (const id of [0, 7, 4054, 6001, 6017, 111, 139, 45, '4056_WUG']) {
			expect(DB.getBodyFallbackPaths(id, 1)).toEqual([]);
		}
	});

	it('names, for every listed id, sprite bodies other than its own', () => {
		for (const [id, alts] of Object.entries(BodyFallbackTable)) {
			const own = DB.getBodyPath(+id, 1);
			const paths = DB.getBodyFallbackPaths(+id, 1);
			expect(paths.length, id).toBe(alts.length + 1);
			for (const path of paths) {
				expect(path, id).toMatch(/^data\/sprite\//);
				expect(path, id).not.toBe(own);
				expect(path, id).not.toMatch(/\.gr2$/);
			}
		}
	});

	it('draws the 4_WAG wolf as the warg rangers ride', () => {
		expect(DB.getBodyFallbackPaths(10149, 1)[0]).toBe(DB.getBodyPath('4056_WUG', 1));
	});
});
