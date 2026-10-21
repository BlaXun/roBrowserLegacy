import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const sourceRoot = process.env.EFFECT_SOURCE_ROOT || join(process.cwd(), 'src');

// mergeEz2Effects over `records`, with `SkillEffect` as the hand-written rows.
function merge(records, EffectTable, SkillEffect) {
	const db = readFileSync(join(sourceRoot, 'DB/DBManager.js'), 'utf8');
	const start = db.indexOf('function loadBSONFile(');
	const end = db.indexOf('function loadAttendanceFile(');
	assert.ok(start >= 0 && end > start, 'BSON merge source boundaries');
	const context = vm.createContext({ console: { log() {} }, Ez2streffect: records, SKID: { DR_CUTTING_WIND: 6542 } });
	vm.runInContext(db.slice(start, end), context);
	context.mergeEz2Effects(EffectTable, SkillEffect);
	return SkillEffect;
}

describe('kRO effect table merged into skills', () => {
	const records = {
		cutting_wind: { FilePath: 'DRUID\\DR_CUTTING_WIND\\cutting_wind\\cutting_wind.str' },
		cutting_wind_hit: { FilePath: 'DRUID\\DR_CUTTING_WIND\\cutting_wind_hit\\cutting_wind_hit.str' }
	};

	it('does not add a file the skill already plays', () => {
		const EffectTable = {
			ef_cutting_wind: [{ type: 'STR', file: 'druid/dr_cutting_wind/cutting_wind/cutting_wind' }],
			ef_cutting_wind_hit: [{ type: 'STR', file: 'druid/dr_cutting_wind/cutting_wind_hit/cutting_wind_hit' }]
		};
		const skills = merge(records, EffectTable, {
			6542: { effectIdOnCaster: 'ef_cutting_wind', hitEffectId: 'ef_cutting_wind_hit' }
		});
		assert.deepEqual({ ...skills[6542] }, { effectIdOnCaster: 'ef_cutting_wind', hitEffectId: 'ef_cutting_wind_hit' });
	});

	it('still maps the files of a skill with no row of its own', () => {
		const skills = merge(records, {}, {});
		assert.equal(skills[6542].effectId, 'cutting_wind');
		assert.equal(skills[6542].hitEffectId, 'cutting_wind_hit');
	});
});
