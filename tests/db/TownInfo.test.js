import { describe, it, expect } from 'vitest';  
import TownInfo from 'DB/TownInfo.js';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
  
describe('TownInfo', () => {  
    it('has Prontera data', () => {  
        expect(TownInfo['prontera']).toBeDefined();  
        expect(TownInfo['prontera'].length).toBeGreaterThan(0);  
    });  
  
    it('has Payon data', () => {  
        expect(TownInfo['payon']).toBeDefined();  
        const kafra = TownInfo['payon'].find(n => n.Name === 'Kafra Employee');  
        expect(kafra).toBeDefined();  
        expect(kafra.Type).toBe(6);  
    });  
  
    it('einbech has correct NPC positions', () => {  
        const einbech = TownInfo['einbech'];  
        expect(einbech).toBeDefined();  
        expect(einbech[0].Name).toBe('Kafra Employee');  
        expect(einbech[0].X).toBe(181);  
        expect(einbech[0].Y).toBe(132);  
        expect(einbech[0].Type).toBe(6);  
    });  
  
    it('all entries have required fields', () => {  
        for (const [map, npcs] of Object.entries(TownInfo)) {  
            for (const npc of npcs) {  
                expect(npc).toHaveProperty('Name');  
                expect(npc).toHaveProperty('X');  
                expect(npc).toHaveProperty('Y');  
                expect(npc).toHaveProperty('Type');  
                expect(typeof npc.X).toBe('number');  
                expect(typeof npc.Y).toBe('number');  
            }  
        }  
    });  
});

describe('TownInfo file loading', () => {
	it('registers every service and replaces only maps present in a later table', async () => {
		const tables = {
			'System/Towninfo.lub': [
				['prontera', 'Services', 1, 2, 6],
				['prontera', 'Guide', 3, 4, 4],
				['izlude', 'Shop', 5, 6, 0]
			],
			'SystemEN/Towninfo.lub': [
				['prontera', 'Kafra Services', 1, 2, 6],
				['prontera', 'Town Guide', 3, 4, 4]
			]
		};
		const townInfo = { prontera: [{ Name: 'Old entry' }], payon: [{ Name: 'Untouched' }] };
		let records;
		const lua = {
			ctx: {},
			mountFile() {},
			unmountFile() {},
			async doFile(filename) {
				records = tables[filename];
			},
			doStringSync() {
				// The Lua main() stops when AddTownInfo does not return success.
				for (const record of records) {
					if (!lua.ctx.AddTownInfo(...record)) return false;
				}
				return true;
			}
		};
		const source = fs.readFileSync(path.resolve(__dirname, '../../src/DB/DBManager.js'), 'utf8');
		const start = source.indexOf('function loadTownInfoFile(');
		const end = source.indexOf('function loadQuestInfo(', start);
		const load = vm.runInNewContext(`${source.slice(start, end)}; loadTownInfoFile`, {
			Client: { loadFile: (_filename, success) => success(new Uint8Array()) },
			lua,
			TownInfo: townInfo,
			userStringDecoder: { decode: value => value },
			userCharpage: 'windows-949',
			console
		});
		await new Promise(resolve => load('System/Towninfo.lub', null, resolve));
		expect(townInfo.prontera.map(entry => entry.Name)).toEqual(['Services', 'Guide']);
		await new Promise(resolve => load('SystemEN/Towninfo.lub', null, resolve));
		expect(townInfo.prontera).toEqual([
			{ Name: 'Kafra Services', X: 1, Y: 2, Type: 6 },
			{ Name: 'Town Guide', X: 3, Y: 4, Type: 4 }
		]);
		expect(townInfo.izlude).toEqual([{ Name: 'Shop', X: 5, Y: 6, Type: 0 }]);
		expect(townInfo.payon).toEqual([{ Name: 'Untouched' }]);
	});
});
