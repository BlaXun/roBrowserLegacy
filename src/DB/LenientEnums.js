/**
 * DB/LenientEnums.js
 *
 * Reading a client table whose keys are names from another of the client's
 * tables, when the two come from different clients.
 *
 * Some tables name their entries through the client's own lists of names:
 * `petinfo.lub` keys its pets by `jobtbl.JT_*` (npcidentity.lub), and
 * `addrandomoptionnametable.lub` its options by `EnumVAR.*[1]` (enumvar.lub).
 * When such a table is newer than the player's list, as an English
 * translation written against kRO is next to an iRO client, one name the list
 * lacks makes Lua stop at "table index is nil" and the whole table is lost.
 *
 * While a table file runs, a name the list lacks reads as a placeholder
 * instead of nil. Afterwards every entry keyed by, or set to, the placeholder
 * is removed and the names are reported: the player loses the entries their
 * client cannot show, and keeps the rest.
 *
 * Limits: only top-level entries are removed (a placeholder nested inside an
 * entry stays), entries a file adds to a table that already existed are not
 * cleaned up, only `List.NAME` and `List.NAME[1]` lookups are covered, and
 * while the file runs a missing name tests as true.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

const LUA = `
if not __ro_lenient then
	local MISSING = {}
	local LIST = { MISSING }
	local state = {}
	local function tables()
		local s = {}
		for k, v in pairs(_G) do
			if type(v) == "table" then s[k] = v end
		end
		return s
	end
	local function changed(since)
		local out = {}
		for k, v in pairs(_G) do
			if type(v) == "table" and since[k] ~= v then out[#out + 1] = k end
		end
		return out
	end
	__ro_lenient = {}
	function __ro_lenient.mark(token)
		state[token] = { before = tables(), skipped = {} }
	end
	function __ro_lenient.defined(token)
		local s = state[token]
		if s then s.lists = changed(s.before) end
	end
	function __ro_lenient.begin(token, ...)
		local s = state[token] or { skipped = {} }
		state[token] = s
		if select("#", ...) > 0 then s.lists = { ... } end
		for _, name in ipairs(s.lists or {}) do
			local t = rawget(_G, name)
			if type(t) == "table" and getmetatable(t) == nil then
				setmetatable(t, {
					__ro_lenient = true,
					__index = function(_, key)
						s.skipped[#s.skipped + 1] = name .. "." .. tostring(key)
						return LIST
					end
				})
			end
		end
		s.before = tables()
	end
	function __ro_lenient.finish(token)
		local s = state[token]
		state[token] = nil
		if not s then return "" end
		for _, name in ipairs(s.lists or {}) do
			local t = rawget(_G, name)
			local m = type(t) == "table" and getmetatable(t)
			if m and m.__ro_lenient then setmetatable(t, nil) end
		end
		if s.before then
			for _, name in ipairs(changed(s.before)) do
				local t = rawget(_G, name)
				for k, v in pairs(t) do
					if k == LIST or k == MISSING or v == LIST or v == MISSING then t[k] = nil end
				end
			end
		end
		return table.concat(s.skipped, ", ")
	end
end
`;

let nextToken = 1;

function run(lua, code) {
	lua.doStringSync(LUA);
	return lua.doStringSync(code);
}

/**
 * Before a file that defines lists of names: remember what is there, so
 * defined() can tell which lists it added.
 *
 * @param {object} lua
 * @return {number} token for the calls that follow
 */
export function mark(lua) {
	const token = nextToken++;
	run(lua, `__ro_lenient.mark(${token})`);
	return token;
}

/**
 * After that file: the lists it defined are the ones begin() makes lenient.
 */
export function defined(lua, token) {
	run(lua, `__ro_lenient.defined(${token})`);
}

/**
 * Before the file that names entries in those lists. `lists` names them
 * instead, for a list another load defined (petinfo.lub's jobtbl).
 *
 * @return {number} token
 */
export function begin(lua, token = null, lists = []) {
	const t = token || nextToken++;
	const names = lists.map(name => JSON.stringify(String(name))).join(', ');
	run(lua, `__ro_lenient.begin(${t}${names ? ', ' + names : ''})`);
	return t;
}

/**
 * After it, whether it ran or failed: put the lists back, drop the entries
 * that named something they lack, and say which.
 *
 * @param {string} filename for the warning
 * @return {string[]} the names skipped
 */
export function finish(lua, token, filename) {
	let skipped = run(lua, `return __ro_lenient.finish(${token})`);
	if (skipped instanceof Uint8Array) {
		skipped = new TextDecoder().decode(skipped);
	}
	const names = skipped ? [...new Set(String(skipped).split(', '))] : [];
	if (names.length) {
		console.warn(
			`(${filename}) names ${names.length} entries this client's tables do not have, left out: ${names.join(', ')}`
		);
	}
	return names;
}

export default { mark, defined, begin, finish, LUA };
