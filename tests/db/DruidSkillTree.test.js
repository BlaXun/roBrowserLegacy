import { describe, it, expect } from 'vitest';
import SkillTreeView from 'DB/Skills/SkillTreeView.js';
import SK from 'DB/Skills/SkillConst.js';
import JobId from 'DB/Jobs/JobConst.js';

// The skill window falls back on this table for any job the loaded
// skilltreeview.lub does not define. The English translation's has no Druid
// jobs, so without these every Druid-line skill landed in the Etc tab and the
// window logged "Unimplemented JobId 4355 in SkillTree!".
describe('Druid line skill trees', () => {
	it('chains Novice -> Druid -> Karnos -> Alitea over three tabs', () => {
		expect(SkillTreeView[JobId.DRUID]).toMatchObject({ list: 1, beforeJob: JobId.NOVICE });
		expect(SkillTreeView[JobId.KARNOS]).toMatchObject({ list: 2, beforeJob: JobId.DRUID });
		expect(SkillTreeView[JobId.ALITEA]).toMatchObject({ list: 3, beforeJob: JobId.KARNOS });
	});

	it('places the skills where kRO does', () => {
		expect(SkillTreeView[JobId.DRUID][SK.DR_WEREWOLF]).toBe(1);
		expect(SkillTreeView[JobId.KARNOS][SK.KR_DOUBLE_SLASH]).toBe(0);
		expect(SkillTreeView[JobId.ALITEA][SK.AT_GRAVITY_HOLE]).toBe(34);
	});

	it('keeps Druid clear of the Novice slots it shares a tab with', () => {
		const slots = job => Object.entries(SkillTreeView[job]).filter(([k]) => /^\d+$/.test(k)).map(([, v]) => v);
		const novice = slots(JobId.NOVICE);
		const druid = slots(JobId.DRUID);
		expect(druid.filter(p => novice.includes(p))).toEqual([]);
		expect(new Set(druid).size).toBe(druid.length);
	});

	it('gives the baby jobs their parent tree', () => {
		expect(SkillTreeView[JobId.DRUID_B]).toBe(SkillTreeView[JobId.DRUID]);
		expect(SkillTreeView[JobId.KARNOS_B]).toBe(SkillTreeView[JobId.KARNOS]);
	});
});
