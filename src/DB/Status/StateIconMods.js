/**
 * DB/Status/StateIconMods.js
 *
 * Mods' status icons over the client's: the files loadStateIconInfo (in
 * DBManager.js) reads, in order, and the Lua it runs around a mod's file so
 * that the file adds rows instead of replacing the client's tables.
 *
 * customEfstIds, customStateIconImgInfo and customStateIconInfo list, in mod
 * order, files shaped like the client's efstids.lub, stateiconimginfo.lub and
 * stateiconinfo.lub that hold only a mod's rows: the names of its own icons
 * (EFST_IDs.EFST_X = 20000; servers keep a range for mods), their pictures and
 * their tooltips, or a new picture or tooltip for a stock icon.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

/** The three tables, in the order the client reads them, with their config keys. */
const STAGES = [
	['efstids', 'customEfstIds'],
	['stateiconimginfo', 'customStateIconImgInfo'],
	['stateiconinfo', 'customStateIconInfo']
];

/**
 * Every file to read: the client's three and the mods', each as
 * { name: what it is mounted as, path, stage, mod }. In order: the client's
 * names, the mods' names, the client's pictures and tooltips (read together),
 * then the mods' pictures and tooltips. A mod's names come before every other
 * table, so a mod's rows can use them.
 *
 * @param {string} dirPath - the client's stateicon directory, ending in '/'
 * @param {function} get - Configs.get
 * @return {Array}
 */
function stateIconFiles(dirPath, get) {
	const files = [];
	for (const [stage, key] of STAGES) {
		files.push({ name: stage + '.lub', path: dirPath + stage + '.lub', stage, mod: false });
		const list = get(key, []);
		(Array.isArray(list) ? list : [])
			.filter(path => typeof path === 'string')
			.forEach((path, i) => files.push({ name: `mod-${stage}-${i}.lub`, path, stage, mod: true }));
	}
	const rank = f => (f.stage === 'efstids' ? (f.mod ? 1 : 0) : f.mod ? 3 : 2);
	return files.sort((a, b) => rank(a) - rank(b));
}

/** Before a mod's efstids.lub: keep the client's names aside. */
const BEFORE_MOD_NAMES = '__MOD_EFST_SAVE = EFST_IDs; EFST_IDs = {}';

/**
 * After a mod's efstids.lub: add its names to the client's
 * (__EFST_IDS_ORIGINAL, which EFST_IDs reads through), and put those back.
 * Only new names, for numbers in the range servers keep for mods: a mod
 * cannot rename or renumber a stock icon (EFST_HIDING = 20000 would remap
 * SC.HIDING for the whole client). Some clients' efstids.lub guards the
 * table against new names (iRO's of 2026: a __newindex that raises "unknown
 * state"), so a name is added with rawset, and looked up under pcall.
 */
const AFTER_MOD_NAMES = `
if type(EFST_IDs) == "table" and type(__EFST_IDS_ORIGINAL) == "table" then
	for k, v in pairs(EFST_IDs) do
		if type(k) == "string" and type(v) == "number" and v >= 20000 and v <= 22999 then
			local ok, known = pcall(function() return __EFST_IDS_ORIGINAL[k] end)
			if ok and known == nil then
				rawset(__EFST_IDS_ORIGINAL, k, v)
			end
		end
	end
end
EFST_IDs = __MOD_EFST_SAVE`;

/**
 * Before a mod's stateiconimginfo.lub or stateiconinfo.lub: the client's rows
 * have been read already, so the tables start empty and hold only the mod's.
 */
const BEFORE_MOD_ROWS = 'StateIconImgList = nil; StateIconList = nil';

export { stateIconFiles, BEFORE_MOD_NAMES, AFTER_MOD_NAMES, BEFORE_MOD_ROWS };
