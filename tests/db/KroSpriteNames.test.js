import { describe, it, expect } from 'vitest';
import MonsterTable from '../../src/DB/Monsters/MonsterTable.js';

// kRO-only monsters and NPC looks the iRO client's datainfo/jobname.lub doesn't name:
// the built-in table names them, so an iRO client with a kRO fallback GRF draws them
// instead of a stand-in (the GRF's table only adds to this one).
describe('MonsterTable: kRO-only sprite names', () => {
	it('names the Episode 20/21 and Varmundt monsters', () => {
		expect(MonsterTable[22771]).toBe('EP20_COPO');
		expect(MonsterTable[22313]).toBe('EP21_SEAWIND');
	});

	it('names the training-ground dummies', () => {
		expect(MonsterTable[21087]).toBe('S_DUMMY_DEFAULT');
	});

	it('keeps every id unique and every name a sprite file name', () => {
		for (const [id, name] of Object.entries(MonsterTable)) {
			expect(Number.isInteger(Number(id))).toBe(true);
			expect(typeof name).toBe('string');
		}
	});
});
