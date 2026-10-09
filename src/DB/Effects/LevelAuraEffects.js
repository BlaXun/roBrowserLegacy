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
 *   level-99 (1325-1335) and level-160 (1336-1346) auras; the tiger ones
 *   (1291, 1292); and the midnight blue (2281, 2282) and gray (2283, 2284)
 *   ones.
 *
 * A caller can pass `auraColor` (AuraTiers.auraColor) in the effect's Init
 * params to draw any of them in another colour; EntityAura does, for a server
 * that sets `aura.color`.
 *
 * The hat auras are drawn as an iRO Ragexe.exe (October 2026) draws them:
 * alpha-blended in any colour (AuraBlend.js), and a coloured level-99 one as
 * its two parts, CLevel99Effect's ring and ground, without the level-99
 * aura's orbs (EF_LEVEL99_2 and _3, other effects the hat effect does not
 * name). Its ground is the client's ready-coloured pikapika_<colour>.tga,
 * untinted, where the client has one; kRO's data.grf has none, and gets
 * pikapika2.bmp in the colour.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

import MaxLevelAura from 'Renderer/Effects/MaxLevelAura.js';
import SwirlingAura from 'Renderer/Effects/SwirlingAura.js';
import GroundAura from 'Renderer/Effects/GroundAura.js';
import {
	TIER_COLORS,
	NAMED_COLORS,
	JOB_COLORS,
	TIGER_COLOR,
	STAR_SOUL_COLORS,
	auraColor
} from 'DB/Effects/AuraTiers.js';

/** A hat aura's colour, which AuraBlend.js alpha-blends. */
function hatColor(color) {
	return color && { ...color, hat: true };
}

/**
 * One part of the high-level aura: 'bubbles' for a main effect, 'rings' for a
 * _SUB one. `hat` for a hat aura's.
 */
function maxPart(part, rgb, hat) {
	return {
		type: 'FUNC',
		attachedEntity: true,
		func: function (Params) {
			const color = Params.Init.auraColor || auraColor(rgb);
			this.add(
				new MaxLevelAura(
					Params.Init.ownerEntity.position,
					part,
					hat ? hatColor(color) : color,
					Params.Inst.startTick
				),
				Params
			);
		}
	};
}

/**
 * A coloured level-99 hat aura, in `rgb`: the ring and the ground. `ground`
 * names the client's texture for it, pikapika_<ground>.tga.
 */
function classic(rgb, ground) {
	const color = Params => hatColor(Params.Init.auraColor || auraColor(rgb));
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
					// The ready-coloured texture only in its own colour: a colour
					// the caller passes tints pikapika2.bmp.
					Params.Init.auraColor
						? new GroundAura(
								Params.Init.ownerEntity.position,
								100,
								15.0,
								'pikapika2.bmp',
								Params.Inst.startTick,
								color(Params)
							)
						: new GroundAura(
								Params.Init.ownerEntity.position,
								100,
								15.0,
								`pikapika_${ground}.tga`,
								Params.Inst.startTick,
								hatColor({ r: 1, g: 1, b: 1, dark: false }),
								{ textureName: 'pikapika2.bmp', color: color(Params) }
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

/** The job-coloured level-99 auras' ground textures, pikapika_<name>.tga, in JOB_COLORS' order. */
const JOB_GROUNDS = [
	'rune_knight_red',
	'royal_guard_blue',
	'warlock_violet',
	'sorcerer_light_blue',
	'ranger_green',
	'minstrel_pink',
	'archbishop_white',
	'guillotine_cross_silver',
	'shadow_chaser_black',
	'mechanic_gold',
	'genetic_yellowgreen'
];

/** A high-level hat aura's two parts, in one colour. */
const high = rgb => [maxPart('bubbles', rgb, true), maxPart('rings', rgb, true)];

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
	table[1164 + i] = classic(NAMED_COLORS[name], name);
	// HAT_EF_LEVEL160_<COLOR>: the high-level aura in that colour.
	table[1174 + i] = high(NAMED_COLORS[name]);
});

JOB_COLORS.forEach((rgb, i) => {
	// HAT_EF_99LV_<JOB>_<COLOR>: the level-99 aura in that job's colour.
	table[1325 + i] = classic(rgb, JOB_GROUNDS[i]);
	// HAT_EF_160LV_<JOB>_<COLOR>: the high-level aura in that job's colour.
	table[1336 + i] = high(rgb);
});

// HAT_EF_LEVEL99_TIGER and HAT_EF_LEVEL160_TIGER.
table[1291] = classic(TIGER_COLOR, 'tiger');
table[1292] = high(TIGER_COLOR);

// HAT_EF_99LV_STAR_E_MBLUE and the four other hat effects that name 2281, and
// HAT_EF_160LV_STAR_E_MBLUE.
table[2281] = classic(STAR_SOUL_COLORS.midnight_blue_99, 'midnight_blue');
table[2282] = high(STAR_SOUL_COLORS.midnight_blue_160);
// HAT_EF_99LV_SOUL_R_GRAY and HAT_EF_160LV_SOUL_R_GRAY.
table[2283] = classic(STAR_SOUL_COLORS.gray, 'gray');
table[2284] = high(STAR_SOUL_COLORS.gray);

export default table;
