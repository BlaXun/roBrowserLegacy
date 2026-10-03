import { describe, it, expect } from 'vitest';

import MonsterTable from 'DB/Monsters/MonsterTable.js';

// Sprites rAthena's own scripts use whose ids roBrowser's table lacked: the
// client fell back to 1_ETC_01 (an NPC) or Scorpion (a monster) whenever the
// data's npcidentity/jobname tables did not name them either (older data).
describe('MonsterTable entries rAthena scripts use', () => {
	it.each([
		[10376, '4_ep18_maram'], // Maze of Oz, Rachel
		[10395, '4_ep18_gw_middle01'], // Wolves instance, wolfvill
		[10439, '4_exjob_chul_ho'], // Deep Forest, Payon
		[10443, '1_journey_stone_f'], // abyss_03
		[21292, 'ep18_armed_villager01'], // Wolves instance
		[21394, 'ILL_VITATA'] // Illusion of Underwater ant_d02_i
	])('%i is %s', (id, name) => {
		expect(MonsterTable[id]).toBe(name);
	});

	it('keeps the table in id order', () => {
		const ids = Object.keys(MonsterTable).map(Number);
		expect(ids).toEqual([...ids].sort((a, b) => a - b));
	});
});
