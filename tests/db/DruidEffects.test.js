import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import SC from 'DB/Status/StatusConst.js';
import SK from 'DB/Skills/SkillConst.js';
import SU from 'DB/Skills/SkillUnitConst.js';

// The Druid line (Druid, Karnos, Alitea): kRO draws its skills with the STR
// effects in data/texture/effect/druid/, which the effect tables did not use,
// and transforms a Druid into the Werewolf / Wereraptor body on EFST 1675 / 1680,
// which StatusConst did not name -- so Entity's job_transform never ran.
//
// Read as text: the effect tables import the renderer, which does not load
// without a canvas.
const read = file => readFileSync(join(process.cwd(), 'src/DB', file), 'utf8').replace(/\r\n/g, '\n');
const effectTable = read('Effects/EffectTable.js');
const skillEffect = read('Skills/SkillEffect.js');
const skillUnit = read('Skills/SkillUnit.js');

function effect(id) {
	const start = effectTable.indexOf(`\n\t${id}: [`);
	expect(start, `${id} is defined`).toBeGreaterThan(-1);
	const end = effectTable.indexOf('\n\t],', start);
	return effectTable
		.slice(start, end)
		.split('\n\t\t{')
		.slice(1)
		.map(layer => ({ text: layer, get: key => (layer.match(new RegExp(`${key}: '([^']+)'`)) || [])[1] }));
}

describe('Druid line', () => {
	it('names the shapeshift statuses the server sends', () => {
		expect(SC.WEREWOLF).toBe(1675);
		expect(SC.WERERAPTOR).toBe(1680);
	});

	it('knows the skill ids of all three jobs', () => {
		expect(SK.DR_WEREWOLF).toBe(6524);
		expect(SK.KR_DOUBLE_SLASH).toBe(6550);
		expect(SK.AT_NATURE_HARMONY).toBe(6607);
	});

	it('maps every effect a Druid skill uses to a defined effect', () => {
		const used = [...skillEffect.matchAll(/'(ef_druid_\w+)'/g)].map(m => m[1]);
		expect(used.length).toBeGreaterThan(70);
		for (const id of new Set(used)) expect(effect(id).length, id).toBeGreaterThan(0);
	});

	it('draws the transformations and a ground skill over and under the ground', () => {
		expect(skillEffect).toMatch(/SkillEffect\[SK\.DR_WEREWOLF\] = \{ effectId: 'ef_druid_werewolf' \};/);
		const [top, bottom] = effect('ef_druid_terra_wave');
		expect(top.get('file')).toBe('druid/at_terra_wave/terra_wave/terra_wave');
		expect(bottom.text).toMatch(/renderBeforeEntities: true/);
		expect(top.get('wav')).toBe('effect/druid/at_terra_wave');
	});

	it('keeps Ice Pillar and Glacial Monolith drawn while they stand', () => {
		expect(SU.UNT_ICE_PILLAR).toBe(313);
		expect(SU.UNT_GLACIAL_MONOLITH).toBe(314);
		expect(skillUnit).toMatch(/SkillUnit\[SU\.UNT_ICE_PILLAR\] = 'ef_druid_ice_pillar_loop';/);
		expect(skillUnit).toMatch(/SkillUnit\[SU\.UNT_GLACIAL_MONOLITH\] = 'ef_druid_glacier_monolith_loop';/);
	});

	it('gives every layer its texture folder', () => {
		for (const [, id] of effectTable.matchAll(/\n\t(ef_druid_\w+): \[/g)) {
			for (const layer of effect(id)) {
				const file = layer.get('file');
				expect(layer.get('texturePath'), `${id} ${file}`).toBe(file.slice(0, file.lastIndexOf('/') + 1));
			}
		}
	});
});
