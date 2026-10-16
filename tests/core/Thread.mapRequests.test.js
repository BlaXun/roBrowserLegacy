import { expect, it, vi } from 'vitest';

const maps = vi.hoisted(() => []);
vi.mock('Core/FileManager.js', () => ({ default: {} }));
vi.mock('Core/FileSystem.js', () => ({ default: {} }));
vi.mock('Loaders/MapLoader.js', () => ({
 default: class {
  constructor() { maps.push(this); }
  load() {}
 }
}));

it('keeps map events tied to their request across the worker boundary', async () => {
 const { default: Thread } = await import('Core/Thread.js');
 vi.stubGlobal('onmessage', null);
 vi.stubGlobal('postMessage', data => Thread.receive({ data }));
 await import('Core/ThreadEventHandler.js');
 Thread.delegate({ postMessage: data => globalThis.onmessage({ data }) }, '*');
 const events = [];
 Thread.hook('MAP_PROGRESS', (data, request) => events.push({ data, request }));
 Thread.hook('MAP_REPLACED_MODELS', (data, request) => events.push({ data, request }));
 const done = vi.fn();
 const first = Thread.send('LOAD_MAP', 'prontera.rsw', done);
 const second = Thread.send('LOAD_MAP', 'geffen.rsw', done);
 maps[0].onprogress(80);
 maps[1].ondata('MAP_REPLACED_MODELS', ['house.rsm']);
 expect(first).toBeGreaterThan(0);
 expect(second).toBeGreaterThan(first);
 expect(events).toEqual([{ data: 80, request: first }, { data: ['house.rsm'], request: second }]);
 maps[0].onload(true);
 expect(done).toHaveBeenCalledWith(true, undefined, 'prontera.rsw');
 vi.unstubAllGlobals();
});
