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
function manager(bindings = {}) {
    const context = load(source('Renderer/EffectManager.js').replace('export default EffectManager;', 'this.EffectManager = EffectManager; this.list = _list;'), {
        SU: {}, SkillEffect: {}, SkillUnit: {}, EffectDB: {},
        Session: { Entity: { position: [0, 0, 0] } },
        GraphicsSettings: { performanceMode: false }, Renderer: { tick: 1000 },
        EntityManager: { get: () => null }, ...bindings
    });
    return context;
}
function attachmentManager() {
    const code = source('Renderer/Entity/EntityAttachments.js').replace(/export default function init\(\) \{[^}]*\}/, 'this.AttachmentManager = AttachmentManager;');
    return load(code, { Client: { loadFile: (_path, callback) => callback?.() }, Renderer: { tick: 1000, gl: null }, StrEffect: {} }).AttachmentManager;
}

// No game data, network, server, or graphics context is required.
describe('effect lifetime and attachment direction', () => {
    it('honors BSON sound replay without silencing fresh or legacy effects', () => {
        const db = source('DB/DBManager.js');
        const start = db.indexOf('function loadBSONFile(');
        const end = db.indexOf('function loadAttendanceFile(');
        assert.ok(start >= 0 && end > start, 'BSON merge source boundaries');
        const definitions = {};
        const merge = load(db.slice(start, end), {
            Ez2streffect: {
                quiet_loop: { FilePath: 'quiet.str', SoundPath: 'quiet.wav', IsInfinite: true, IsSoundLoop: 0 },
                sounding_loop: { FilePath: 'sounding.str', SoundPath: 'sounding.wav', IsInfinite: true, IsSoundLoop: 1 },
                legacy: { FilePath: 'legacy.str', SoundPath: 'legacy.wav', IsInfinite: true }
            },
            SKID: {}
        });
        merge.mergeEz2Effects(definitions, {});

        for (const [name, repeatedSounds, filename] of [
            ['quiet_loop', 1, 'quiet.wav'],
            ['sounding_loop', 2, 'sounding.wav'],
            ['legacy', 2, 'legacy.wav']
        ]) {
            const played = [];
            const { StrEffect } = strRenderer();
            const context = manager({
                StrEffect, Preferences: { effect: true },
                Sound: { playPosition: filename => played.push(filename) },
                Events: { setTimeout: run => run() }
            });
            const { EffectManager, EffectDB, list, Renderer } = context;
            EffectDB[name] = definitions[name];
            EffectManager.spam({ effectId: name, position: [0, 0, 0] });
            assert.deepEqual(played, [filename], name + ': first instance plays');
            list.StrEffect[0].render({}, 2000);
            Renderer.tick = 2000;
            vm.runInContext('repeatEffect(list.StrEffect[0])', context);
            assert.equal(list.StrEffect.length, 2, name + ': visual cycle still repeats');
            assert.equal(played.length, repeatedSounds, name + ': metadata controls audio replay');
            Renderer.tick = 3000;
            EffectManager.spam({ effectId: name, position: [0, 0, 0] });
            assert.equal(played.length, repeatedSounds + 1, name + ': fresh independent instance plays');
        }
    });
    it('delays only the initial BSON visual cycle', () => {
        const { StrEffect } = strRenderer();
        const managerContext = manager({
            StrEffect, Preferences: { effect: true },
            Sound: { playPosition() {} },
            Events: { setTimeout: run => run() }
        });
        const { EffectManager, list, EffectDB, Renderer } = managerContext;
        const db = source('DB/DBManager.js');
        const definitions = {};
        const records = { delayed_loop: {
            FilePath: 'example\\delayed.str', SoundPath: 'effect\\delayed.wav',
            StartDelayTime: 150, IsInfinite: true, IsSoundLoop: true
        } };
        const start = db.indexOf('function loadBSONFile(');
        const end = db.indexOf('function loadAttendanceFile(');
        assert.ok(start >= 0 && end > start, 'BSON merge source boundaries');
        const merge = load(db.slice(start, end), {
            Ez2streffect: records, SKID: {}, setNamedEffectKeys() {}
        });
        merge.mergeEz2Effects(definitions, {});
        EffectDB.delayed_loop = definitions.delayed_loop;
        EffectManager.spam({ effectId: 'delayed_loop', position: [0, 0, 0] });
        const first = list.StrEffect[0];
        assert.equal(first.startTick, 1150);
        first.render({}, 1149);
        assert.equal(first.needCleanUp, undefined);
        first.render({}, 2150);
        assert.equal(first.needCleanUp, true);
        Renderer.tick = 2150;
        vm.runInContext('repeatEffect(list.StrEffect[0])', managerContext);
        assert.equal(list.StrEffect[1].startTick, 2150);
    });
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

describe('hat effects from the effect table', () => {
    // A player, not an effect entity: EffectManager.remove deletes the whole
    // entity when objecttype is TYPE_EFFECT.
    class Player {
        static TYPE_EFFECT = 5;
        constructor(GID, position, remove) { Object.assign(this, { GID, position, objecttype: 0, attachments: { remove } }); }
    }
    function hatManager(entity, effects) {
        return load(source('Renderer/EffectManager.js').replace('export default EffectManager;', 'this.EffectManager = EffectManager; this.list = _list;'), {
            SU: {}, SkillEffect: {}, SkillUnit: {}, EffectDB: effects,
            Session: { Entity: { position: [0, 0, 0] } }, Preferences: { effect: true },
            GraphicsSettings: { performanceMode: false }, Renderer: { tick: 1000 },
            EntityManager: { get: aid => (aid === entity.GID ? entity : null), remove() { throw new Error('removed a player'); } }
        });
    }
    it('removes the effects a FUNC entry drew when the hat effect is switched off', () => {
        class Aura {}
        const removed = [];
        const entity = new Player(7, [1, 2, 0], uid => removed.push(uid));
        const { EffectManager, list } = hatManager(entity, {
            1335: [{ type: 'FUNC', attachedEntity: true, func(Params) { this.add(new Aura(), Params); } }]
        });
        EffectManager.spamHatEffect({ Init: { ownerAID: 7, ownerEntity: entity, startTick: 1000 }, effect: { effectID: 109, hatEffectID: 1335 } });
        assert.equal(list.Aura.length, 1);
        assert.equal(list.Aura[0]._Params.Init.ownerAID, 7);
        EffectManager.removeHatEffect(7, 109);
        assert.equal(list.Aura, undefined);
        assert.equal(entity._hatEffects[109], undefined);
        assert.ok(removed.includes(1335));
    });
    it('leaves the same effect on another entity alone', () => {
        class Aura {}
        const entity = new Player(7, [1, 2, 0], () => {});
        const other = new Player(8, [3, 4, 0], () => {});
        const { EffectManager, list } = hatManager(entity, {
            1335: [{ type: 'FUNC', attachedEntity: true, func(Params) { this.add(new Aura(), Params); } }]
        });
        EffectManager.spamHatEffect({ Init: { ownerAID: 7, ownerEntity: entity, startTick: 1000 }, effect: { effectID: 109, hatEffectID: 1335 } });
        EffectManager.spamHatEffect({ Init: { ownerAID: 8, ownerEntity: other, startTick: 1000 }, effect: { effectID: 109, hatEffectID: 1335 } });
        EffectManager.removeHatEffect(7, 109);
        assert.equal(list.Aura.length, 1);
        assert.equal(list.Aura[0]._Params.Init.ownerAID, 8);
    });
});
