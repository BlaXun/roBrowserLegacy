/**
 * DB/Effects/LevelAuraEffects.js
 *
 * Effect table entries for the level auras past 99 and the coloured auras,
 * spread into EffectTable.js.
 *
 * - EF_LEVEL150, EF_LEVEL160, EF_LEVEL185 and EF_LEVEL4TH, each with its _SUB:
 *   the high-level aura (MaxLevelAura) in its tier's colour. EntityAura plays
 *   them by level; AuraTiers.js says which.
 * - The hat effects that costume items give, by the effect they name in
 *   hateffectinfo.lub: EF_LEVEL99_150 (881) and the ten coloured level-99
 *   (1164-1173) and level-160 (1174-1183) auras; the eleven job-coloured
 *   level-99 (1325-1335) and level-160 (1336-1346) auras; and the midnight
 *   blue (2282) and gray (2283, 2284) ones.
 *
 * A caller can pass `auraColor` (AuraTiers.auraColor) in the effect's Init
 * params to draw any of them in another colour; EntityAura does, for a server
 * that sets `aura.color`.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

import MaxLevelAura from 'Renderer/Effects/MaxLevelAura.js';
import SwirlingAura from 'Renderer/Effects/SwirlingAura.js';
import GroundAura from 'Renderer/Effects/GroundAura.js';
import Level99Bubble from 'Renderer/Effects/Level99Bubble.js';
import { TIER_COLORS, NAMED_COLORS, JOB_COLORS, STAR_SOUL_COLORS, auraColor } from 'DB/Effects/AuraTiers.js';

/**
 * One part of the high-level aura: 'bubbles' for a main effect, 'rings' for a
 * _SUB one.
 */
function maxPart(part, rgb) {
	return {
		type: 'FUNC',
		attachedEntity: true,
		func: function (Params) {
			this.add(
				new MaxLevelAura(
					Params.Init.ownerEntity.position,
					part,
					Params.Init.auraColor || auraColor(rgb),
					Params.Inst.startTick
				),
				Params
			);
		}
	};
}

/** The level-99 aura's three parts (EF_LEVEL99, _2 and _3), in one colour. */
function classic(rgb) {
	const color = Params => Params.Init.auraColor || auraColor(rgb);
	return [
		{
			type: 'FUNC',
			attachedEntity: true,
			func: function (Params) {
				this.add(
					new SwirlingAura(
						Params.Init.ownerEntity.position,
						'ring_blue.tga',
						Params.Inst.startTick,
						undefined,
						color(Params)
					),
					Params
				);
			}
		},
		{
			type: 'FUNC',
			attachedEntity: true,
			func: function (Params) {
				this.add(
					new GroundAura(
						Params.Init.ownerEntity.position,
						100,
						15.0,
						'pikapika2.bmp',
						Params.Inst.startTick,
						color(Params)
					),
					Params
				);
			}
		},
		{
			type: 'FUNC',
			attachedEntity: true,
			func: function (Params) {
				this.add(
					new Level99Bubble(
						Params.Init.ownerEntity.position,
						'whitelight.tga',
						Params.Inst.startTick,
						1,
						color(Params)
					),
					Params
				);
			}
		}
	];
}

/** The order of the coloured hat-effect auras, from hateffectinfo.lub. */
const COLOR_ORDER = [
	'red',
	'ultramarine',
	'cyan',
	'lime',
	'violet',
	'lilac',
	'sun_orange',
	'deep_pink',
	'black',
	'white'
];

const table = {
	// EF_LEVEL99_150, HAT_EF_LEVEL99_150: the high-level aura in blue.
	881: [maxPart('bubbles', TIER_COLORS[150]), maxPart('rings', TIER_COLORS[150])],

	978: [maxPart('bubbles', TIER_COLORS[150])], // EF_LEVEL150
	979: [maxPart('rings', TIER_COLORS[150])], // EF_LEVEL150_SUB
	1022: [maxPart('bubbles', TIER_COLORS[160])], // EF_LEVEL160
	1023: [maxPart('rings', TIER_COLORS[160])], // EF_LEVEL160_SUB
	1226: [maxPart('bubbles', TIER_COLORS[185])], // EF_LEVEL185
	1227: [maxPart('rings', TIER_COLORS[185])], // EF_LEVEL185_SUB
	2275: [maxPart('bubbles', TIER_COLORS.fourth)], // EF_LEVEL4TH
	2276: [maxPart('rings', TIER_COLORS.fourth)] // EF_LEVEL4TH_SUB
};

COLOR_ORDER.forEach((name, i) => {
	// HAT_EF_LEVEL99_<COLOR>: the level-99 aura in that colour.
	table[1164 + i] = classic(NAMED_COLORS[name]);
	// HAT_EF_LEVEL160_<COLOR>: the high-level aura in that colour.
	table[1174 + i] = [maxPart('bubbles', NAMED_COLORS[name]), maxPart('rings', NAMED_COLORS[name])];
});

/** The high-level aura's two parts, in one colour. */
const high = rgb => [maxPart('bubbles', rgb), maxPart('rings', rgb)];

JOB_COLORS.forEach((rgb, i) => {
	// HAT_EF_99LV_<JOB>_<COLOR>: the level-99 aura in that job's colour.
	table[1325 + i] = classic(rgb);
	// HAT_EF_160LV_<JOB>_<COLOR>: the high-level aura in that job's colour.
	table[1336 + i] = high(rgb);
});

// HAT_EF_160LV_STAR_E_MBLUE. Its level-99 half, effect 2281, is left out:
// five hat effects share that number, black and the 2020 RTC ones among them.
table[2282] = high(STAR_SOUL_COLORS.midnight_blue);
// HAT_EF_99LV_SOUL_R_GRAY and HAT_EF_160LV_SOUL_R_GRAY.
table[2283] = classic(STAR_SOUL_COLORS.gray);
table[2284] = high(STAR_SOUL_COLORS.gray);

export default table;
