/**
 * DB/Map/SignboardMerge.js
 *
 * Organise SignBoardList.lub rows by map and cell, merging each table over the
 * ones loaded before it.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

/**
 * Add signboard rows to a table keyed `[mapname][x][y]`.
 *
 * The base SignBoardList.lub is loaded first and each customSignBoardList
 * table after it, so a row on a cell that already has a sign replaces it and
 * every other sign is kept: a table only has to carry its own signs. A row
 * with no icon removes the sign on its cell instead, so a later table can
 * take a sign away; such a row is never kept, as there is nothing to draw.
 *
 * @param {Array} signboardArray - rows as AddSignBoard builds them
 * @param {Object} [signboardDict] - signboards already loaded, changed in place
 * @return {Object} the table, with the rows added
 */
function mergeSignboards(signboardArray, signboardDict = {}) {
	for (const signboard of signboardArray) {
		if (!signboard.mapname) {
			continue;
		}
		const { x, y } = signboard;
		// MapEngine looks the map up in lower case, and a mod may not write it so.
		const mapname = signboard.mapname.toLowerCase();
		if (!signboard.icon_location) {
			delete signboardDict[mapname]?.[x]?.[y];
			continue;
		}
		if (!signboardDict[mapname]) {
			signboardDict[mapname] = {};
		}
		if (!signboardDict[mapname][x]) {
			signboardDict[mapname][x] = {};
		}
		signboardDict[mapname][x][y] = signboard;
	}

	return signboardDict;
}

export { mergeSignboards };
