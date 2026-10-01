import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/UI/Components/SkillList/SkillListCommon.js', 'utf8');
const start = source.indexOf('function loadSkillIcon(');
const end = source.indexOf('export function createSkillList', start);
function loader(available, constants) {
    const requests = [];
    const context = vm.createContext({ SK: constants, DB: { INTERFACE_PATH: 'interface/' }, Client: {
        loadFile(path, success, failure) {
            requests.push(path);
            if (available.has(path)) success(path); else failure();
        }
    } });
    vm.runInContext(source.slice(start, end) + ';this.loadIcon = loadSkillIcon;', context);
    return { load: context.loadIcon, requests };
}
describe('skill icon aliases', () => {
    it('keeps the configured resource preferred and loads once', () => {
        const x = loader(new Set(['interface/item/preferred.bmp']), { ALTERNATE: 42 });
        const loaded = [];
        x.load({ Name: 'preferred' }, 42, path => loaded.push(path));
        assert.deepEqual(x.requests, ['interface/item/preferred.bmp']);
        assert.equal(loaded.length, 1);
    });
    it('tries matching skill-constant aliases when the configured icon is missing', () => {
        const x = loader(new Set(['interface/item/NATIVE_ALIAS.bmp']), { OLD_ALIAS: 42, NATIVE_ALIAS: 42, OTHER_SKILL: 99 });
        const loaded = [];
        x.load({ Name: 'OLD_ALIAS' }, '42', path => loaded.push(path));
        assert.deepEqual(x.requests, ['interface/item/OLD_ALIAS.bmp', 'interface/item/NATIVE_ALIAS.bmp']);
        assert.deepEqual(loaded, ['interface/item/NATIVE_ALIAS.bmp']);
    });
    it('handles absent metadata and stops gracefully when no candidate exists', () => {
        const x = loader(new Set(), { NATIVE_ALIAS: 42 });
        let loaded = 0;
        x.load(undefined, 42, () => loaded++);
        x.load(undefined, 999, () => loaded++);
        assert.deepEqual(x.requests, ['interface/item/NATIVE_ALIAS.bmp']);
        assert.equal(loaded, 0);
    });
});
