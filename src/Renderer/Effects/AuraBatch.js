/**
 * Renderer/Effects/AuraBatch.js
 *
 * Draws every instance of an aura effect in a frame with a few draw calls,
 * instead of a draw call (and a buffer upload and a few uniforms) per quad.
 *
 * The level-99 aura is three effects (SwirlingAura, GroundAura and
 * Level99Bubble), each drawing a handful of quads or strips a frame. A town
 * of level-99 characters spent most of its draw calls on them: about eleven
 * a character.
 *
 * Each effect class owns a batch. EffectManager draws a class's instances
 * together, between its beforeRender and afterRender, so the batch is begun
 * in beforeRender, each instance records its triangles in render, already in
 * world space with their colour, and afterRender flushes it. Consecutive
 * triangles that share a texture and a blending are one run, one draw call;
 * runs are drawn in the order they were recorded, and so are the triangles
 * in each, so blending comes out as it did one quad at a time. Textures are
 * shared by file name (sharedTexture), so every character's aura is drawn
 * from the same one and the runs stay long.
 *
 * Config `auraBatching: false` draws every quad on its own, as before.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

import _vertexShader from './AuraBatch.vs?raw';
import _fragmentShader from './AuraBatch.fs?raw';
import WebGL from 'Utils/WebGL.js';
import Client from 'Core/Client.js';
import Configs from 'Core/Configs.js';
import SpriteRenderer from 'Renderer/SpriteRenderer.js';
import { BLEND_ADD, BLEND_DARKEN, setAuraBlend } from 'Renderer/Effects/AuraBlend.js';

/**
 * Floats per vertex: position xyz, texture uv, colour rgba, depth offset.
 */
const FLOATS = 10;
const STRIDE = FLOATS * 4;

/**
 * Corners of a quad, as quad() takes them, and the texture coordinates of each.
 */
const QUAD_UV = [0, 0, 1, 0, 1, 1, 0, 1];

/**
 * The two triangles of a quad: (0, 1, 2) and (2, 3, 0), as the bubbles draw them.
 */
export const QUAD_FAN = [0, 1, 2, 2, 3, 0];

class AuraBatch {
	/**
	 * @param {object} options the effect's fragment shader, as defines
	 * @param {boolean} [options.fog] fog, as SpriteRenderer draws it
	 * @param {boolean} [options.discardClear] discard texels with alpha under 0.01
	 * @param {boolean} [options.discardBlack] discard black texels
	 * @param {boolean} [options.darken] BLEND_DARKEN draws grey from the texture's brightness
	 */
	constructor(options) {
		this.defines = Object.keys(options)
			.filter(key => options[key])
			.map(key => `#define ${key.replace(/[A-Z]/g, c => `_${c}`).toUpperCase()}\n`)
			.join('');

		this.vertices = new Float32Array(FLOATS * 1024);
		this.indices = new Uint32Array(1536);
		this.vertexCount = 0;
		this.indexCount = 0;
		this.runs = [];
		this.runCount = 0;

		this.modelView = new Float32Array(16);
		this.projection = new Float32Array(16);
		this.fog = { use: false, near: 0, far: 0, color: new Float32Array(3) };

		this.active = false;
		this.gl = null;
		this.program = null;
		this.vao = null;
		this.vertexBuffer = null;
		this.indexBuffer = null;
	}

	/**
	 * Start recording the frame's instances. Call in the class's beforeRender.
	 *
	 * @param {WebGL2RenderingContext} gl
	 * @param {mat4} modelView
	 * @param {mat4} projection
	 * @param {object} fog
	 */
	begin(gl, modelView, projection, fog) {
		this.vertexCount = 0;
		this.indexCount = 0;
		this.runCount = 0;
		this.active = Configs.get('auraBatching', true) !== false && typeof gl.createVertexArray === 'function';
		if (!this.active) {
			return;
		}
		this.modelView.set(modelView);
		this.projection.set(projection);
		this.fog.use = !!(fog.use && fog.exist);
		this.fog.near = fog.near;
		this.fog.far = fog.far;
		this.fog.color.set(fog.color);
	}

	/**
	 * Room for `vertices` more vertices and `indices` more indices, in the run
	 * of `texture` drawn with `blend`. Returns the index of the first new vertex.
	 */
	reserve(texture, blend, vertices, indices) {
		if ((this.vertexCount + vertices) * FLOATS > this.vertices.length) {
			const grown = new Float32Array(Math.max(this.vertices.length * 2, (this.vertexCount + vertices) * FLOATS));
			grown.set(this.vertices.subarray(0, this.vertexCount * FLOATS));
			this.vertices = grown;
		}
		if (this.indexCount + indices > this.indices.length) {
			const grown = new Uint32Array(Math.max(this.indices.length * 2, this.indexCount + indices));
			grown.set(this.indices.subarray(0, this.indexCount));
			this.indices = grown;
		}

		let run = this.runCount ? this.runs[this.runCount - 1] : null;
		if (!run || run.texture !== texture || run.blend !== blend) {
			run = this.runs[this.runCount];
			if (!run) {
				run = this.runs[this.runCount] = { texture: null, blend: BLEND_ADD, first: 0, count: 0 };
			}
			run.texture = texture;
			run.blend = blend;
			run.first = this.indexCount;
			run.count = 0;
			this.runCount++;
		}
		run.count += indices;
		return this.vertexCount;
	}

	/**
	 * Write one vertex.
	 */
	vertex(x, y, z, u, v, r, g, b, a, depth) {
		const d = this.vertices;
		let o = this.vertexCount * FLOATS;
		d[o++] = x;
		d[o++] = y;
		d[o++] = z;
		d[o++] = u;
		d[o++] = v;
		d[o++] = r;
		d[o++] = g;
		d[o++] = b;
		d[o++] = a;
		d[o] = depth;
		this.vertexCount++;
	}

	/**
	 * Record a quad.
	 *
	 * @param {WebGLTexture} texture
	 * @param {number} blend AuraBlend's BLEND_*
	 * @param {Array} points four corners [x, y, z] in world space, textured (0,0) (1,0) (1,1) (0,1)
	 * @param {Array} order the six corners of its two triangles
	 * @param {number} r colour, as the effect gave its shader's uColor
	 * @param {number} g
	 * @param {number} b
	 * @param {number} a
	 * @param {number} depth what the effect took off gl_Position.z
	 */
	quad(texture, blend, points, order, r, g, b, a, depth) {
		const base = this.reserve(texture, blend, 4, 6);
		for (let k = 0; k < 4; k++) {
			const p = points[k];
			this.vertex(p[0], p[1], p[2], QUAD_UV[k * 2], QUAD_UV[k * 2 + 1], r, g, b, a, depth);
		}
		for (let i = 0; i < 6; i++) {
			this.indices[this.indexCount++] = base + order[i];
		}
	}

	/**
	 * Record an indexed mesh, moved by (x, y, z).
	 *
	 * @param {WebGLTexture} texture
	 * @param {number} blend AuraBlend's BLEND_*
	 * @param {Float32Array} vertices x, y, z, u, v each
	 * @param {number} vertexCount
	 * @param {Uint16Array} indices
	 * @param {number} x
	 * @param {number} y
	 * @param {number} z
	 * @param {number} r colour, as the effect gave its shader's uColor
	 * @param {number} g
	 * @param {number} b
	 * @param {number} a
	 * @param {number} depth what the effect took off gl_Position.z
	 */
	mesh(texture, blend, vertices, vertexCount, indices, x, y, z, r, g, b, a, depth) {
		const base = this.reserve(texture, blend, vertexCount, indices.length);
		for (let i = 0, o = 0; i < vertexCount; i++, o += 5) {
			this.vertex(
				vertices[o] + x,
				vertices[o + 1] + y,
				vertices[o + 2] + z,
				vertices[o + 3],
				vertices[o + 4],
				r,
				g,
				b,
				a,
				depth
			);
		}
		for (let i = 0; i < indices.length; i++) {
			this.indices[this.indexCount++] = base + indices[i];
		}
	}

	/**
	 * Draw what was recorded. Call in the class's afterRender, which then puts
	 * its blending back.
	 *
	 * @param {WebGL2RenderingContext} gl
	 */
	flush(gl) {
		if (!this.active) {
			return;
		}
		this.active = false;
		if (!this.runCount) {
			return;
		}
		if (!this.program || this.gl !== gl) {
			this.init(gl);
		}

		const uniform = this.program.uniform;
		gl.useProgram(this.program);
		gl.uniformMatrix4fv(uniform.uModelViewMat, false, this.modelView);
		gl.uniformMatrix4fv(uniform.uProjectionMat, false, this.projection);
		gl.uniform1i(uniform.uFogUse, this.fog.use);
		gl.uniform1f(uniform.uFogNear, this.fog.near);
		gl.uniform1f(uniform.uFogFar, this.fog.far);
		gl.uniform3fv(uniform.uFogColor, this.fog.color);
		gl.activeTexture(gl.TEXTURE0);
		gl.uniform1i(uniform.uDiffuse, 0);

		gl.bindVertexArray(this.vao);
		// A fresh store each flush: the GPU may still be reading the last one.
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, this.vertices.subarray(0, this.vertexCount * FLOATS), gl.STREAM_DRAW);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices.subarray(0, this.indexCount), gl.STREAM_DRAW);

		const self = this;
		SpriteRenderer.runWithDepth(true, false, false, function () {
			let blend = -1;
			for (let i = 0; i < self.runCount; i++) {
				const run = self.runs[i];
				if (run.blend !== blend) {
					blend = run.blend;
					setAuraBlend(gl, blend);
					if (uniform.uDarken) {
						gl.uniform1i(uniform.uDarken, blend === BLEND_DARKEN);
					}
				}
				gl.bindTexture(gl.TEXTURE_2D, run.texture);
				gl.drawElements(gl.TRIANGLES, run.count, gl.UNSIGNED_INT, run.first * 4);
			}
		});

		gl.bindVertexArray(null);
		for (let i = 0; i < this.runCount; i++) {
			this.runs[i].texture = null;
		}
		this.runCount = 0;
		this.vertexCount = 0;
		this.indexCount = 0;
	}

	/**
	 * Create the program, the buffers and the vertex array.
	 */
	init(gl) {
		if (this.program && this.gl === gl) {
			return;
		}
		this.gl = gl;
		const fragment = _fragmentShader.replace(/^(#version[^\n]*\n)/, `$1${this.defines}`);
		this.program = WebGL.createShaderProgram(gl, _vertexShader, fragment);
		this.vertexBuffer = gl.createBuffer();
		this.indexBuffer = gl.createBuffer();
		this.vao = gl.createVertexArray();

		const attribute = this.program.attribute;
		gl.bindVertexArray(this.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
		gl.enableVertexAttribArray(attribute.aPosition);
		gl.vertexAttribPointer(attribute.aPosition, 3, gl.FLOAT, false, STRIDE, 0);
		gl.enableVertexAttribArray(attribute.aTextureCoord);
		gl.vertexAttribPointer(attribute.aTextureCoord, 2, gl.FLOAT, false, STRIDE, 3 * 4);
		gl.enableVertexAttribArray(attribute.aColor);
		gl.vertexAttribPointer(attribute.aColor, 4, gl.FLOAT, false, STRIDE, 5 * 4);
		gl.enableVertexAttribArray(attribute.aDepthOffset);
		gl.vertexAttribPointer(attribute.aDepthOffset, 1, gl.FLOAT, false, STRIDE, 9 * 4);
		gl.bindVertexArray(null);
	}

	/**
	 * Delete the program and the buffers. Call in the class's static free.
	 */
	free(gl) {
		if (this.program) {
			gl.deleteProgram(this.program);
			gl.deleteBuffer(this.vertexBuffer);
			gl.deleteBuffer(this.indexBuffer);
			gl.deleteVertexArray(this.vao);
		}
		this.program = null;
		this.vao = null;
		this.vertexBuffer = null;
		this.indexBuffer = null;
		this.gl = null;
		this.active = false;
		this.runCount = 0;
		this.vertexCount = 0;
		this.indexCount = 0;
	}
}

/**
 * Load an effect texture once for every instance that asks for it, so they
 * share one GL texture (and one run in a batch). `cache` is the class's Map;
 * freeSharedTextures deletes what is in it.
 *
 * @param {Map} cache
 * @param {WebGL2RenderingContext} gl
 * @param {string} name file name under data/texture/effect/
 * @param {function} onload receives the texture
 * @param {function} [onerror] the file could not be loaded
 */
export function sharedTexture(cache, gl, name, onload, onerror) {
	let entry = cache.get(name);
	if (!entry) {
		entry = { texture: null, failed: false, waiting: [] };
		cache.set(name, entry);
		Client.loadFile(
			`data/texture/effect/${name}`,
			buffer => {
				WebGL.texture(gl, buffer, texture => {
					if (cache.get(name) !== entry) {
						// Freed while loading.
						gl.deleteTexture(texture);
						return;
					}
					entry.texture = texture;
					const waiting = entry.waiting;
					entry.waiting = [];
					waiting.forEach(w => w.onload(texture));
				});
			},
			() => {
				entry.failed = true;
				const waiting = entry.waiting;
				entry.waiting = [];
				waiting.forEach(w => w.onerror && w.onerror());
			}
		);
	}

	if (entry.texture) {
		onload(entry.texture);
	} else if (entry.failed) {
		if (onerror) {
			onerror();
		}
	} else {
		entry.waiting.push({ onload, onerror });
	}
}

/**
 * Delete the textures sharedTexture loaded into `cache`.
 */
export function freeSharedTextures(cache, gl) {
	for (const entry of cache.values()) {
		if (entry.texture) {
			gl.deleteTexture(entry.texture);
		}
	}
	cache.clear();
}

export default AuraBatch;
