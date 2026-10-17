import { describe, it, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

// StrEffect and FootprintStrEffect share one program and one buffer, but
// EffectManager frees each class on its own when that class's list empties.
// Freeing the footprint prints must not delete what plain STR effects still
// draw with (the scene's entities vanished: StrEffect.beforeRender threw on a
// null program every frame, before entities were drawn), and the other way round.

const sourceRoot = process.env.EFFECT_SOURCE_ROOT || join(process.cwd(), 'src');
const code = readFileSync(join(sourceRoot, 'Renderer/Effects/StrEffect.js'), 'utf8')
	.replace(/^import .*;\r?$/gm, '')
	.replace('export default StrEffect;', 'this.StrEffect = StrEffect;');

let gl, deleted, StrEffect, Footprint;

function fakeGl() {
	const calls = [];
	const stub = name => (...args) => calls.push([name, ...args]);
	return new Proxy(
		{
			calls,
			createBuffer: () => ({ buffer: true }),
			deleteProgram: program => deleted.push(program),
			deleteBuffer: buffer => deleted.push(buffer)
		},
		{ get: (target, key) => (key in target ? target[key] : typeof key === 'string' && /^[A-Z_]+$/.test(key) ? key : stub(key)) }
	);
}

beforeEach(() => {
	deleted = [];
	gl = fakeGl();
	const context = vm.createContext({
		console,
		Float32Array,
		Math,
		Set,
		WebGL: {
			createShaderProgram: () => ({ program: true, uniform: {}, attribute: { aPosition: 0, aTextureCoord: 1 } })
		},
		Client: {},
		glMatrix: { mat4: { create: () => new Float32Array(16) } },
		_vertexShader: '',
		_fragmentShader: ''
	});
	vm.runInContext(code + '\nthis.Footprint = class FootprintStrEffect extends StrEffect {};', context);
	StrEffect = context.StrEffect;
	Footprint = context.Footprint;
	StrEffect.init(gl);
	Footprint.init(gl);
});

const fog = { near: 0, far: 1, color: [0, 0, 0] };

describe('StrEffect shared program', () => {
	it('keeps the program for StrEffect when the footprint prints are freed', () => {
		Footprint.free(gl);
		assert.equal(Footprint.ready, false);
		assert.deepEqual(deleted, []);
		assert.doesNotThrow(() => StrEffect.beforeRender(gl, [], [], fog, 0));
		assert.doesNotThrow(() => StrEffect.afterRender(gl));
	});

	it('keeps the program for the footprints when plain STR effects are freed', () => {
		StrEffect.free(gl);
		assert.deepEqual(deleted, []);
		assert.doesNotThrow(() => Footprint.beforeRender(gl, [], [], fog, 0));
	});

	it('deletes the program and buffer once no class uses them', () => {
		Footprint.free(gl);
		StrEffect.free(gl);
		assert.equal(deleted.length, 2);
	});

	it('builds them again for the next effect after that', () => {
		Footprint.free(gl);
		StrEffect.free(gl);
		StrEffect.init(gl);
		assert.equal(StrEffect.ready, true);
		assert.doesNotThrow(() => StrEffect.beforeRender(gl, [], [], fog, 0));
	});
});
