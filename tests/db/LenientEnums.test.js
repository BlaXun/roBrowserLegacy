// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import LenientEnums from 'DB/LenientEnums.js';

// The helper is Lua; run it in a real Lua 5.1 when there is one. The client's
// wasmoon build is patched for the browser and does not start under Node.
const hasLua = spawnSync('lua5.1', ['-v']).status === 0;

/** Run `body` after the helper, in one Lua state; print() lines come back. */
function lua(body) {
	const r = spawnSync('lua5.1', ['-'], { input: LenientEnums.LUA + '\n' + body, encoding: 'utf8' });
	if (r.status !== 0) throw new Error(r.stderr);
	return r.stdout.trim().split('\n');
}

// npcidentity.lub and petinfo.lub as an iRO client meets them: the English
// petinfo names a pet iRO's jobtbl does not have.
const JOBTBL = 'jobtbl = { JT_PORING = 1002, JT_LUNATIC = 1063 }';
const PETINFO = `
PetNameTable = { [jobtbl.JT_PORING] = "Poring", [jobtbl.JT_KIEL_D_01_2] = "Kiel", [jobtbl.JT_LUNATIC] = "Lunatic" }
PetEggItemID_PetJobID = { [9001] = jobtbl.JT_PORING, [9999] = jobtbl.JT_KIEL_D_01_2 }`;

describe.skipIf(!hasLua)('LenientEnums', () => {
	it('without it, one name the list lacks loses the whole table', () => {
		expect(() => lua(`${JOBTBL}\n${PETINFO}`)).toThrow(/table index is nil/);
	});

	it('leaves out only the entries that name something the list lacks, and says which', () => {
		const out = lua(`${JOBTBL}
__ro_lenient.begin(1, "jobtbl")
${PETINFO}
print(__ro_lenient.finish(1))
local n = 0 for _ in pairs(PetNameTable) do n = n + 1 end
print(n, PetNameTable[1002], PetNameTable[1063])
print(PetEggItemID_PetJobID[9001], PetEggItemID_PetJobID[9999])
print(getmetatable(jobtbl), jobtbl.JT_KIEL_D_01_2)`);
		expect(out[0]).toBe('jobtbl.JT_KIEL_D_01_2, jobtbl.JT_KIEL_D_01_2');
		expect(out[1]).toBe('2\tPoring\tLunatic');
		expect(out[2]).toBe('1002\tnil');
		expect(out[3]).toBe('nil\tnil'); // the list is itself again
	});

	it("finds the lists an id file defines, and handles EnumVAR's [1] keys", () => {
		const out = lua(`
__ro_lenient.mark(2)
EnumVAR = { VAR_MAXHPAMOUNT = { 1, 0 }, VAR_MAXSPAMOUNT = { 2, 0 } }
__ro_lenient.defined(2)
__ro_lenient.begin(2)
NameTable_VAR = {
	[EnumVAR.VAR_MAXHPAMOUNT[1]] = "MaxHP +%d",
	[EnumVAR.DAMAGE_HIT_TARGET[1]] = "Normal Physical Damage +%d%%",
	[EnumVAR.VAR_MAXSPAMOUNT[1]] = "MaxSP +%d",
}
print(__ro_lenient.finish(2))
local n = 0 for _ in pairs(NameTable_VAR) do n = n + 1 end
print(n, NameTable_VAR[1], NameTable_VAR[2])`);
		expect(out[0]).toBe('EnumVAR.DAMAGE_HIT_TARGET');
		expect(out[1]).toBe('2\tMaxHP +%d\tMaxSP +%d');
	});

	it('changes nothing when every name is there', () => {
		const out = lua(`${JOBTBL}
__ro_lenient.begin(3, "jobtbl")
PetNameTable = { [jobtbl.JT_PORING] = "Poring" }
print("[" .. __ro_lenient.finish(3) .. "]", PetNameTable[1002])`);
		expect(out[0]).toBe('[]\tPoring');
	});
});
