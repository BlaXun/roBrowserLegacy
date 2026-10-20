import { beforeEach, describe, expect, it, vi } from 'vitest';

// The level-99 aura's three effects record their quads in a batch per class
// and draw them at afterRender. These check what reaches GL: how many draws,
// with which blending, and that the old one-quad-at-a-time path is still
// there behind `auraBatching: false`.
const loads = [];
vi.mock('Utils/WebGL.js', () => ({
	default: {
		createShaderProgram: () => ({
			attribute: new Proxy({}, { get: (t, k) => k }),
			uniform: new Proxy({}, { get: (t, k) => k })
		}),
		texture: (gl, buffer, callback) => callback({ texture: buffer })
	}
}));
vi.mock('Core/Client.js', () => ({
	default: {
		loadFile: (path, onload) => {
			loads.push(path);
			onload(path);
		}
	}
}));
vi.mock('Renderer/Map/Altitude.js', () => ({ default: { getCellHeight: () => 0 } }));
vi.mock('Renderer/Camera.js', () => ({ default: { angle: [230, 30] } }));

const { default: Configs } = await import('Core/Configs.js');
const { default: SwirlingAura } = await import('Renderer/Effects/SwirlingAura.js');
const { default: GroundAura } = await import('Renderer/Effects/GroundAura.js');
const { default: Level99Bubble } = await import('Renderer/Effects/Level99Bubble.js');
const { default: MaxLevelAura } = await import('Renderer/Effects/MaxLevelAura.js');
const { default: AuraBatch } = await import('Renderer/Effects/AuraBatch.js');
const { BLEND_ADD, BLEND_ALPHA } = await import('Renderer/Effects/AuraBlend.js');

const FOG = { use: false, exist: false, near: 30, far: 180, color: [0.4, 0.6, 0.6] };
const M = new Float32Array(16);

function fakeGL() {
	const calls = [];
	const target = {
		createVertexArray: () => ({ vao: true }),
		drawElements: (mode, count) => calls.push(['drawElements', count]),
		drawArrays: () => calls.push(['drawArrays'])
	};
	const gl = new Proxy(target, {
		get: (t, key) => {
			if (key in t) {
				return t[key];
			}
			if (typeof key === 'string' && /^[A-Z_0-9]+$/.test(key)) {
				return key;
			}
			return (...args) => {
				calls.push([key, ...args]);
				return {};
			};
		}
	});
	return { gl, calls };
}

const hat = { r: 1, g: 0, b: 0, dark: false, hat: true };

function auras(gl, count, color = () => undefined) {
	const list = [[], [], []];
	for (let i = 0; i < count; i++) {
		const position = [100 + i, 100, 0];
		list[0].push(new SwirlingAura(position, 'ring_blue.tga', 0, 4, color(i)));
		list[1].push(new GroundAura(position, 100, 15.0, 'pikapika2.bmp', 0, color(i)));
		list[2].push(new Level99Bubble(position, 'whitelight.tga', 1000, 1, color(i)));
	}
	list.flat().forEach(effect => effect.init(gl));
	return list;
}

// One frame, as EffectManager draws it: each class between its beforeRender and afterRender
function frame(gl, list, tick) {
	[SwirlingAura, GroundAura, Level99Bubble].forEach((Class, i) => {
		Class.beforeRender(gl, M, M, FOG, tick);
		list[i].forEach(effect => effect.render(gl, tick));
		Class.afterRender(gl);
	});
}

describe('AuraBatch', () => {
	let gl, calls;

	beforeEach(() => {
		({ gl, calls } = fakeGL());
		[SwirlingAura, GroundAura, Level99Bubble, MaxLevelAura].forEach(Class => {
			Class.free(gl);
			Class.init(gl);
		});
		Configs.set('auraBatching', true);
		loads.length = 0;
	});

	it('draws a crowd of level-99 auras in one call per part', () => {
		const list = auras(gl, 30);
		for (let tick = 1000; tick < 5000; tick += 100) {
			frame(gl, list, tick);
		}
		calls.length = 0;
		frame(gl, list, 5000);

		const draws = calls.filter(c => c[0] === 'drawElements' || c[0] === 'drawArrays');
		expect(draws.length).toBe(3);
		// 30 auras x 3 bands x 40 triangles, then 30 x 2 ground quads
		expect(draws[0]).toEqual(['drawElements', 30 * 3 * 120]);
		expect(draws[1]).toEqual(['drawElements', 30 * 2 * 6]);
		expect(draws[2][1] % 6).toBe(0);
	});

	it('loads each texture once for every aura', () => {
		auras(gl, 10);
		expect(loads.sort()).toEqual([
			'data/texture/effect/pikapika2.bmp',
			'data/texture/effect/ring_blue.tga',
			'data/texture/effect/whitelight.tga'
		]);
	});

	it('keeps the order of differently blended auras, switching blending between runs', () => {
		const list = auras(gl, 4, i => (i % 2 ? hat : undefined));
		calls.length = 0;
		SwirlingAura.beforeRender(gl, M, M, FOG, 1000);
		list[0].forEach(effect => effect.render(gl, 1000));
		SwirlingAura.afterRender(gl);

		const sequence = calls
			.filter(c => c[0] === 'blendFunc' || c[0] === 'drawElements')
			.map(c => (c[0] === 'blendFunc' ? c[2] : c[0]));
		// beforeRender sets additive; then add, alpha, add, alpha runs; afterRender puts back alpha
		expect(sequence).toEqual([
			'ONE',
			'ONE',
			'drawElements',
			'ONE_MINUS_SRC_ALPHA',
			'drawElements',
			'ONE',
			'drawElements',
			'ONE_MINUS_SRC_ALPHA',
			'drawElements',
			'ONE_MINUS_SRC_ALPHA'
		]);
	});

	it('draws each quad on its own with auraBatching off', () => {
		Configs.set('auraBatching', false);
		const list = auras(gl, 5);
		calls.length = 0;
		frame(gl, list, 1000);

		const draws = calls.filter(c => c[0] === 'drawElements' || c[0] === 'drawArrays');
		// 5 x 3 bands, 5 x 2 ground quads, and whichever bubbles have fallen into view
		expect(draws.length).toBeGreaterThanOrEqual(25);
		expect(calls.some(c => c[0] === 'bindVertexArray')).toBe(false);
	});

	it('draws a crowd of high-level auras in one call per texture', () => {
		const list = [];
		for (let i = 0; i < 40; i++) {
			const position = [100 + i, 100, 0];
			// Started apart, so each is on its own frame of the 27
			list.push(new MaxLevelAura(position, 'bubbles', undefined, i * 37));
			list.push(new MaxLevelAura(position, 'rings', undefined, i * 37));
		}
		list.forEach(effect => effect.init(gl));
		calls.length = 0;
		MaxLevelAura.beforeRender(gl, M, M, FOG, 5000);
		list.forEach(effect => effect.render(gl, 5000));
		MaxLevelAura.afterRender(gl);

		const draws = calls.filter(c => c[0] === 'drawElements' || c[0] === 'drawArrays');
		// 27 strip frames and 2 ground rings; 40 x 56 quads a draw each before
		expect(draws.length).toBe(29);
		expect(draws.every(c => c[0] === 'drawElements')).toBe(true);
		expect(draws.reduce((sum, c) => sum + c[1], 0)).toBe(40 * 56 * 6);
	});

	it('keeps a hat-coloured high-level aura in order', () => {
		const list = [0, 1].map(i => new MaxLevelAura([100 + i, 100, 0], 'bubbles', hat, 0));
		list.forEach(effect => effect.init(gl));
		calls.length = 0;
		MaxLevelAura.beforeRender(gl, M, M, FOG, 1000);
		list.forEach(effect => effect.render(gl, 1000));
		MaxLevelAura.afterRender(gl);

		// Alpha blending depends on the order, so every strip is its own run
		const draws = calls.filter(c => c[0] === 'drawElements');
		expect(draws.length).toBe(2 * 54);
	});

	it('draws each strip on its own with auraBatching off', () => {
		Configs.set('auraBatching', false);
		const aura = new MaxLevelAura([100, 100, 0], 'bubbles', undefined, 0);
		aura.init(gl);
		calls.length = 0;
		MaxLevelAura.beforeRender(gl, M, M, FOG, 1000);
		aura.render(gl, 1000);
		MaxLevelAura.afterRender(gl);

		expect(calls.filter(c => c[0] === 'drawArrays').length).toBe(54);
		expect(calls.some(c => c[0] === 'drawElements')).toBe(false);
	});

	it('merges additive runs by texture and leaves other runs where they are', () => {
		const batch = new AuraBatch({ fog: true, mergeAdditive: true });
		batch.begin(gl, M, M, FOG);
		const points = [
			[0, 0, 0],
			[1, 0, 0],
			[1, 0, 1],
			[0, 0, 1]
		];
		const quad = (texture, blend) => batch.quad(texture, blend, points, [0, 1, 2, 2, 3, 0], 1, 1, 1, 1, 0);
		quad('a', BLEND_ADD);
		quad('b', BLEND_ADD);
		quad('a', BLEND_ADD);
		quad('c', BLEND_ALPHA);
		quad('c', BLEND_ALPHA);
		quad('b', BLEND_ADD);
		quad('a', BLEND_ADD);
		quad('b', BLEND_ADD);
		expect(batch.runCount).toBe(7);

		expect(batch.merge()).toBe(true);
		const runs = batch.mergedRuns
			.slice(0, batch.mergedRunCount)
			.map(run => [run.texture, run.blend, run.first, run.count]);
		expect(runs).toEqual([
			['a', BLEND_ADD, 0, 12],
			['b', BLEND_ADD, 12, 6],
			['c', BLEND_ALPHA, 18, 12],
			['b', BLEND_ADD, 30, 12],
			['a', BLEND_ADD, 42, 6]
		]);
		// Quads 0, 2 | 1 | 3, 4 | 5, 7 | 6: each quad's six indices, moved whole
		const quadOf = Array.from(batch.mergedIndices.subarray(0, 48)).map(index => index >> 2);
		expect(quadOf.filter((q, i) => i % 6 === 0)).toEqual([0, 2, 1, 3, 4, 5, 7, 6]);
		expect(Array.from(batch.mergedIndices.subarray(0, 6))).toEqual(Array.from(batch.indices.subarray(0, 6)));
	});
});
