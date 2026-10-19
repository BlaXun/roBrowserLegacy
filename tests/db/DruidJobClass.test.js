import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
	if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.getItem !== 'function') {
		const store = {};
		globalThis.localStorage = {
			getItem: (key) => (key in store ? store[key] : null),
			setItem: (key, val) => {
				store[key] = String(val);
			},
			removeItem: (key) => {
				delete store[key];
			},
			clear: () => {
				for (const k in store) delete store[k];
			}
		};
	}
});

import DB from 'DB/DBManager.js';
import JobId from 'DB/Jobs/JobConst.js';

// getJobClass decides which BasicInfo / WinStats a character gets and whether AP
// is drawn over its head: only 'Fourth_Class' has the AP bar and the trait stats.
// The Druid line was missing, so an Alitea -- whose skills spend and restore AP --
// had no AP bar at all.
describe('DB.getJobClass for the Druid line', () => {
	it('puts Druid with the expanded first jobs', () => {
		expect(DB.getJobClass(JobId.DRUID)).toBe('Expanded_First_Class');
		expect(DB.getJobClass(JobId.DRUID_B)).toBe('Expanded_First_Class');
	});

	it('puts Karnos with Kagerou, Oboro and Rebellion', () => {
		expect(DB.getJobClass(JobId.KARNOS)).toBe('Expanded_Second_Class');
		expect(DB.getJobClass(JobId.KARNOS_B)).toBe('Expanded_Second_Class');
	});

	it('gives Alitea the fourth-job interface, with its AP bar', () => {
		expect(DB.getJobClass(JobId.ALITEA)).toBe('Fourth_Class');
	});
});
