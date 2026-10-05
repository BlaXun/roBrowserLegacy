import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import TextEncoding from 'Utils/CodepageManager.js';
import MonsterTable from 'DB/Monsters/MonsterTable.js';

// jobname.lub / npcidentity.lub (JobNameTable) hold sprite names. Most are
// ASCII, but the mercenaries' are Korean: 여\활용병, 남\창용병, 남\검용병.
// DB.getBodyPath prefixes them with byte-string folder names, so the values
// must stay byte strings. Decoded with a Korean charpage they became Unicode
// Hangul, the body sprite 404'd, and a hired mercenary was drawn as a head.

// The Lua constant for JT_MER_ARCHER01 in jobname.lub, as raw EUC-KR bytes.
const ARCHER = new Uint8Array([0xbf, 0xa9, 0x5c, 0xc8, 0xb0, 0xbf, 0xeb, 0xba, 0xb4]);

describe('JobNameTable sprite names', () => {
	beforeEach(() => {
		TextEncoding.warned = false;
		TextEncoding.setCharset('windows-1252');
	});

	it('decoded as a resource (no charpage), a mercenary name matches the built-in body path', () => {
		expect(TextEncoding.decode(ARCHER, null)).toBe(MonsterTable[6017]);
	});

	it('decoded with the Korean charpage, it does not: the 404 this guards against', () => {
		const hangul = TextEncoding.decode(ARCHER, 'windows-949');
		expect(hangul).toBe('여\\활용병');
		expect(hangul).not.toBe(MonsterTable[6017]);
	});

	it('both JobNameTable loads pass isResourceTable', () => {
		const src = fs.readFileSync(path.resolve(__dirname, '../../src/DB/DBManager.js'), 'utf8').replace(/\r\n/g, '\n');
		const calls = src.split("'JobNameTable',").slice(1);
		expect(calls).toHaveLength(2);
		for (const call of calls) {
			// The call's own closing parenthesis follows its last argument, `true`.
			const body = call.slice(0, call.indexOf('\n\t\t\t\t);'));
			expect(body.trimEnd().endsWith('true')).toBe(true);
		}
	});
});
