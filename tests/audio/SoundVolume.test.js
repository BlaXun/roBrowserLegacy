import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync('src/Audio/SoundManager.js', 'utf8').replace(/^import .*;\r?$/gm, '').replace('export default SoundManager;', 'this.SoundManager = SoundManager; this.cache = _cache;');
function manager() {
    const sounds = [];
    const preferences = { Sound: { play: true, volume: 0.2 }, save() {} };
    const context = vm.createContext({ Date, Math, Number, setTimeout: () => 1, clearTimeout() {}, console,
        Preferences: preferences, Client: { loadFile: (_name, loaded) => loaded('synthetic.wav') },
        document: { createElement: () => { const audio = { addEventListener() {}, play: () => Promise.resolve(), remove() {}, pause() {} }; sounds.push(audio); return audio; } }
    });
    vm.runInContext(source, context);
    return { manager: context.SoundManager, sounds, cache: context.cache };
}
describe('relative sound volume', () => {
    it('applies global volume once to an active sound when the setting changes', () => {
        const x = manager();
        x.manager.play('synthetic.wav', 0.5);
        assert.equal(x.sounds[0].volume, 0.1);
        x.manager.setVolume(0.4);
        assert.equal(x.sounds[0].volume, 0.2);
        x.manager.setVolume(0.2);
        assert.equal(x.sounds[0].volume, 0.1);
    });
    it('preserves explicit silence and uses full relative volume when omitted', () => {
        const x = manager();
        x.manager.play('silent.wav', 0);
        assert.equal(x.sounds.length, 0);
        x.manager.play('default.wav');
        assert.equal(x.sounds[0].volume, 0.2);
        x.manager.setVolume(0.4);
        assert.equal(x.sounds[0].volume, 0.4);
    });
    it('stores unscaled volume when reusing a cached media element', () => {
        const x = manager();
        const audio = { play: () => Promise.resolve(), cleanupHandle: 0 };
        x.cache['cached.wav'] = { instances: [audio] };
        x.manager.play('cached.wav', 0.5);
        assert.equal(audio.volume, 0.1);
        x.manager.setVolume(0.4);
        assert.equal(audio.volume, 0.2);
    });
});
