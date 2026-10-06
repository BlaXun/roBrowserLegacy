import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const sourceRoot = process.env.EFFECT_SOURCE_ROOT || join(process.cwd(), 'src');
const source = name => readFileSync(join(sourceRoot, name), 'utf8').replace(/^import .*;\r?$/gm, '');
const load = (code, bindings) => {
    const context = vm.createContext({ console, Float32Array, Int32Array, Int16Array, Math, Number, ...bindings });
    vm.runInContext(code, context);
    return context;
};
function strRenderer(file = { fps: 60, maxKey: 60, layernum: 0 }) {
    let currentFile = file;
    const context = load(source('Renderer/Effects/StrEffect.js').replace('export default StrEffect;', 'this.StrEffect = StrEffect;'), {
        Client: { loadFile: () => currentFile },
        glMatrix: { mat4: { create: () => new Float32Array(16) } }
    });
    return { StrEffect: context.StrEffect, setFile: value => { currentFile = value; } };
}
function manager() {
    const context = load(source('Renderer/EffectManager.js').replace('export default EffectManager;', 'this.EffectManager = EffectManager; this.list = _list;'), {
        SU: {}, SkillEffect: {}, SkillUnit: {}, EffectDB: {},
        Session: { Entity: { position: [0, 0, 0] } },
        GraphicsSettings: { performanceMode: false }, Renderer: { tick: 1000 },
        EntityManager: { get: () => null }
    });
    return context;
}
function attachmentManager() {
    const code = source('Renderer/Entity/EntityAttachments.js').replace(/export default function init\(\) \{[^}]*\}/, 'this.AttachmentManager = AttachmentManager;');
    return load(code, { Client: { loadFile: (_path, callback) => callback?.() }, Renderer: { tick: 1000, gl: null }, StrEffect: {} }).AttachmentManager;
}

// No game data, network, server, or graphics context is required.
describe('effect lifetime and attachment direction', () => {
    it('stops only the selected effect and owner, including scheduled repeats', () => {
        const { EffectManager, list } = manager();
        class Effect {}
        const items = [[10, 100], [10, 200], [20, 100]].map(([owner, id]) => {
            const item = new Effect();
            EffectManager.add(item, { Init: { ownerAID: owner }, Inst: { effectID: id, persistent: true, repeatEnd: 5000 } });
            return item;
        });
        EffectManager.endRepeat(null, 10, [100]);
        assert.equal(items[0]._Params.Inst.persistent, false);
        assert.equal(items[0]._Params.Inst.repeatEnd, false);
        assert.equal(items[1]._Params.Inst.persistent, true);
        assert.equal(items[2]._Params.Inst.persistent, true);
        assert.equal(list.Effect.length, 3);
    });
    it('expires a one-shot STR by its native FPS and frame count', () => {
        const { StrEffect } = strRenderer({ fps: 30, maxKey: 60, layernum: 0 });
        const effect = new StrEffect('synthetic.str', [0, 0, 0], 1000, '');
        effect.render({}, 2999);
        assert.equal(effect.needCleanUp, undefined);
        effect.render({}, 3000);
        assert.equal(effect.needCleanUp, true);
    });
    it('uses the explicit deadline when shorter than the STR timeline', () => {
        const { StrEffect } = strRenderer();
        const effect = new StrEffect('synthetic.str', [0, 0, 0], 1000, '');
        effect._Params = { Inst: { endTick: 1250 } };
        effect.render({}, 1250);
        assert.equal(effect.needCleanUp, true);
    });
    it('keeps persistent attachments and future-start effects alive', () => {
        const { StrEffect } = strRenderer();
        const loop = new StrEffect('synthetic.str', [0, 0, 0], 1000, '');
        loop.persistent = true;
        loop.render({}, 100000);
        assert.equal(loop.needCleanUp, undefined);
        const future = new StrEffect('synthetic.str', [0, 0, 0], 5000, '');
        future.render({}, 1000);
        assert.equal(future.needCleanUp, undefined);
    });
    it('waits for a loading STR then expires it at the original deadline', () => {
        const { StrEffect, setFile } = strRenderer(null);
        const effect = new StrEffect('synthetic.str', [0, 0, 0], 1000, '');
        effect.render({}, 4000);
        assert.equal(effect.needCleanUp, undefined);
        setFile({ fps: 60, maxKey: 60, layernum: 0 });
        effect.render({}, 4000);
        assert.equal(effect.needCleanUp, true);
    });
    it('removes a culled STR without drawing or retaining it in the render list', () => {
        const { StrEffect } = strRenderer();
        const { EffectManager, list } = manager();
        let draws = 0;
        let frees = 0;
        class CulledEffect {
            static ready = true;
            static beforeRender() {}
            static afterRender() {}
            updateLifetime(tick) { StrEffect.prototype.updateLifetime.call(this, tick); }
            render() { draws++; }
            free() { frees++; }
        }
        const effect = new CulledEffect();
        Object.assign(effect, { filename: 'synthetic.str', texturePath: '', startTick: 1000, ready: true });
        EffectManager.add(effect, { Init: { ownerAID: 10 }, Inst: { effectID: 100, position: [100, 100, 0], duration: 0, persistent: false, repeatEnd: 0 } });
        EffectManager.render({}, null, null, null, 2500, false);
        assert.equal(draws, 0);
        assert.equal(frees, 1);
        assert.equal(list.CulledEffect, undefined);
    });
    it('allows known repeats to restart after a culled cycle finishes', () => {
        const { EffectManager } = manager();
        const pending = [];
        EffectManager.spamEffect = params => {
            pending.push(params);
            EffectManager.add(Object.assign(new FinishedEffect(), { updateLifetime() {} }), params);
        };
        class FinishedEffect {
            static ready = true;
            static beforeRender() {}
            static afterRender() {}
            updateLifetime() { this.needCleanUp = true; }
        }
        const effect = new FinishedEffect();
        EffectManager.add(effect, { effect: {}, Init: { ownerAID: 10 }, Inst: { effectID: 100, position: [100, 100, 0], duration: 0, persistent: true, repeatEnd: 0, repeatDelay: 0 } });
        EffectManager.render({}, null, null, null, 2500, false);
        assert.equal(pending.length, 1);
        assert.equal(pending[0].Inst.noDelay, true);
    });
    it('applies explicit duration to looping STR attachments without drawing', () => {
        const AttachmentManager = attachmentManager();
        const owner = { position: [0, 0, 0] };
        const attachments = new AttachmentManager(owner);
        const item = { isStr: true, strEffect: { persistent: true }, startTick: 1000, duration: 500 };
        assert.equal(attachments.renderAttachment(item, 1500), true);
        assert.equal(attachments.renderAttachment(item, 1200), false);
    });
    it('follows the explicit direction flag spamSprite passes, whatever frame says', () => {
        const AttachmentManager = attachmentManager();
        const attachments = new AttachmentManager({ position: [0, 0, 0] });
        const directional = { file: 'synthetic', frame: undefined, direction: true };
        attachments.add(directional);
        assert.equal(directional.direction, true);
        const fixedEffect = { file: 'synthetic', frame: undefined, direction: false };
        attachments.add(fixedEffect);
        assert.equal(fixedEffect.direction, false);
    });
    it('keeps a named frame fixed without a direction flag, even an undefined one', () => {
        const AttachmentManager = attachmentManager();
        const attachments = new AttachmentManager({ position: [0, 0, 0] });
        const free = { file: 'synthetic' };
        attachments.add(free);
        assert.equal(free.direction, true);
        // An emotion or quest icon whose index lookup missed: it used to show
        // action 0, and must not start turning with the camera instead.
        const missedLookup = { file: 'emotion', frame: undefined };
        attachments.add(missedLookup);
        assert.equal(missedLookup.direction, false);
        assert.equal(missedLookup.frame, 0);
        const fixed = { file: 'synthetic', frame: 0 };
        attachments.add(fixed);
        assert.equal(fixed.direction, false);
    });
});
