// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { stateIconFiles, BEFORE_MOD_NAMES, AFTER_MOD_NAMES, BEFORE_MOD_ROWS } from 'DB/Status/StateIconMods.js';

const config = values => (key, fallback) => (key in values ? values[key] : fallback);

describe('stateIconFiles', () => {
	it("reads only the client's three files when no mod adds any", () => {
		const files = stateIconFiles('lua files/stateicon/', config({}));
		expect(files.map(f => f.path)).toEqual([
			'lua files/stateicon/efstids.lub',
			'lua files/stateicon/stateiconimginfo.lub',
			'lua files/stateicon/stateiconinfo.lub'
		]);
		expect(files.every(f => !f.mod)).toBe(true);
	});

	it("reads every mod's names before any picture or tooltip, and the client's tables before the mods' rows", () => {
		const files = stateIconFiles(
			'd/',
			config({
				customEfstIds: ['a/efstids.lub', 'b/efstids.lub'],
				customStateIconImgInfo: ['a/img.lub'],
				customStateIconInfo: ['a/info.lub', 'b/info.lub']
			})
		);
		expect(files.map(f => f.path)).toEqual([
			'd/efstids.lub',
			'a/efstids.lub',
			'b/efstids.lub',
			'd/stateiconimginfo.lub',
			'd/stateiconinfo.lub',
			'a/img.lub',
			'a/info.lub',
			'b/info.lub'
		]);
		expect(new Set(files.map(f => f.name)).size).toBe(files.length);
	});

	it('ignores a setting that is not a list of paths', () => {
		const files = stateIconFiles('d/', config({ customEfstIds: 'x.lub', customStateIconInfo: [42, 'ok.lub'] }));
		expect(files.filter(f => f.mod).map(f => f.path)).toEqual(['ok.lub']);
	});
});

// The Lua runs in a real Lua 5.1 when there is one (wasmoon does not start
// under Node), as LenientEnums.test.js does.
const hasLua = spawnSync('lua5.1', ['-v']).status === 0;
function lua(body) {
	const r = spawnSync('lua5.1', ['-'], { input: body, encoding: 'utf8' });
	if (r.status !== 0) throw new Error(r.stderr);
	return r.stdout.trim().split('\n');
}

// What DBManager.js does around the client's efstids.lub: EFST_IDs reads
// through __EFST_IDS_ORIGINAL and answers -1 for a name it lacks.
const CLIENT = `
EFST_IDs = { EFST_HIDING = 4, EFST_TOXIN = 1086 }
__EFST_IDS_ORIGINAL = EFST_IDs
EFST_IDs = setmetatable({}, { __index = function(t, k) local id = __EFST_IDS_ORIGINAL[k] return id ~= nil and id or -1 end })
StateIconImgList = { [1] = { [EFST_IDs.EFST_HIDING] = "hiding.tga" } }
StateIconList = { [EFST_IDs.EFST_HIDING] = { descript = { { "Hiding" } } } }`;

describe.skipIf(!hasLua)("a mod's files", () => {
	it("adds a mod's names to the client's, which the mod's rows then use", () => {
		const out = lua(`${CLIENT}
${BEFORE_MOD_NAMES}
EFST_IDs = { EFST_GCX_FLURRY = 20000 }
${AFTER_MOD_NAMES}
print(EFST_IDs.EFST_GCX_FLURRY, EFST_IDs.EFST_HIDING, EFST_IDs.EFST_NOPE)`);
		expect(out[0]).toBe('20000\t4\t-1');
	});

	it("takes no name a mod gives a stock icon, nor a number outside the mods' range", () => {
		const out = lua(`${CLIENT}
${BEFORE_MOD_NAMES}
EFST_IDs = { EFST_HIDING = 20000, EFST_GCX_LOW = 1999, EFST_GCX_HIGH = 23000, EFST_GCX_OK = 22999 }
${AFTER_MOD_NAMES}
print(EFST_IDs.EFST_HIDING, EFST_IDs.EFST_GCX_LOW, EFST_IDs.EFST_GCX_HIGH, EFST_IDs.EFST_GCX_OK)`);
		expect(out[0]).toBe('4\t-1\t-1\t22999');
	});

	it("adds a mod's names to a client table that refuses new names (iRO's of 2026)", () => {
		const out = lua(`${CLIENT.replace(
			'EFST_IDs = { EFST_HIDING = 4, EFST_TOXIN = 1086 }',
			'EFST_IDs = setmetatable({ EFST_HIDING = 4 }, { __newindex = function() error("unknown state") end })'
		)}
${BEFORE_MOD_NAMES}
EFST_IDs = { EFST_GCX_FLURRY = 20000 }
${AFTER_MOD_NAMES}
print(EFST_IDs.EFST_GCX_FLURRY, EFST_IDs.EFST_HIDING)`);
		expect(out[0]).toBe('20000\t4');
	});

	it("starts a mod's pictures and tooltips from empty tables", () => {
		const out = lua(`${CLIENT}
${BEFORE_MOD_ROWS}
StateIconList = StateIconList or {}
StateIconList[20000] = { descript = { { "Flurry" } } }
local n = 0 for _ in pairs(StateIconList) do n = n + 1 end
print(n, StateIconImgList, StateIconList[20000].descript[1][1])`);
		expect(out[0]).toBe('1\tnil\tFlurry');
	});
});
