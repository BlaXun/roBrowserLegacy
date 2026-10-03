/**
 * DB/Monsters/BodyFallbackTable.js
 *
 * Bodies to draw when an NPC's own sprite is missing from the client's data.
 *
 * Clients drop art from one release to the next while their own tables keep
 * naming it: iRO 2026-09 still maps 10243 to 4_m_drzonda01, but no longer ships
 * the file, so the Zonda teleporters in every town drew nothing. Each entry
 * lists job ids, tried in order, whose body is drawn in its place; the first
 * the client has wins. DB.getBodyFallbackPaths adds a last resort after these.
 *
 * Only consulted when a body fails to load, so data that still has the
 * original art (kRO, iRO 2026-02) keeps drawing it.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

export default {
	// 4_WAG (wolf) -> the warg ridden by rangers
	10149: ['4056_WUG'],
	// 4_injustice -> INJUSTICE
	10175: [1257],
	// 4_bloodyman -> BLOODY_MURDERER
	10176: [1507],
	// 4_gibbet -> GIBBET
	10177: [1503],
	// 4_dullahan -> DULLAHAN
	10178: [1504],
	// 4_elder -> ELDER
	10205: [1377],
	// 4_m_drzonda01 (Zonda teleporter) -> 4_M_ZONDAMAN, same Zonda uniform
	10243: [874]
};
