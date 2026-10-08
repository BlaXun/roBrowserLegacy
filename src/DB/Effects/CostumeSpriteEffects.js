/**
 * DB/Effects/CostumeSpriteEffects.js
 *
 * Effect table entries for the hat effects that costume items draw as a
 * sprite attached to the character, spread into EffectTable.js.
 *
 * The client names these effects only by number in hateffectinfo.lub; the
 * executable decides what each number draws. An iRO Ragexe.exe (October 2026)
 * plays each of these as one animation from data/sprite/이팩트/, attached to
 * its owner and looping while the hat effect is on: the mapping below is read
 * from its effect switches. Subject Aura is one sprite whose actions are its
 * colours: gold, white, red and a dark one, in that order.
 *
 * Effect 1184 (HAT_EF_GC_DARKCROW) draws crow_aura/crow_aura, which no client
 * data the effects were checked against ships, so it is left out.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

/**
 * One looping sprite attached to the effect's owner, drawn behind it.
 *
 * @param {string} file path under data/sprite/이팩트/, without the extension
 * @param {number} [action] the action to play, for a sprite that has several
 */
function costume(file, action) {
	const entry = {
		type: 'SPR',
		file: file,
		attachedEntity: true,
		repeat: true,
		renderBeforeEntities: true
	};
	if (action !== undefined) {
		entry.direction = false;
		entry.frame = action;
	}
	return [entry];
}

export default {
	// HAT_EF_SUBJECT_AURA_GOLD, _WHITE and _RED: subject_aura's actions 0, 1 and 2.
	1211: costume('subject_aura/subject_aura', 0),
	1212: costume('subject_aura/subject_aura', 1),
	1213: costume('subject_aura/subject_aura', 2),

	1377: costume('valkyrie_wing/valkyrie_wing'), // HAT_EF_C_VALKYRIE_WING
	1531: costume('\xb3\xaa\xb9\xb5\xc0\xd9_\xbf\xcf\xbc\xba'), // HAT_EF_CONS_OF_WIND: 나뭇잎_완성
	2310: costume('cons_of_poison'), // HAT_EF_POISON_MASTER
	2346: costume('black_thunder/black_thunder'), // HAT_EF_BLACK_THUNDER
	2347: costume('black_thunder/black_thunder_dark'), // HAT_EF_BLACK_THUNDER_DARK
	2394: costume('serpent_shadow/serpent_shadow'), // HAT_EF_SERPENT_SHADOW
	2413: costume('rainbow_poison_master'), // HAT_EF_RAINBOW_POISON_MASTER
	2424: costume('c_aura_of_ghost_s/c_aura_of_ghost_s'), // HAT_EF_AURA_OF_GHOST_S
	2428: costume('atque_poenitentia/atque_poenitentia'), // HAT_EF_ATQUE_POENITENTIA
	2429: costume('perm_frost_oblivion/perm_frost_oblivion'), // HAT_EF_PERM_FROST_OBLIVION
	2430: costume('c_guide_of_dead_text/c_guide_of_dead_text'), // HAT_EF_GUIDE_OF_DEAD_TEXT
	2431: costume('c_medjed_text/c_medjed_text'), // HAT_EF_MEDJED_TEXT
	2458: costume('s_beelzebub_wing/s_beelzebub_wing') // HAT_EF_C_S_BEELZEBUB_WING
};
