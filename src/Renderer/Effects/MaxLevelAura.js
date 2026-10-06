/**
 * Renderer/Effects/MaxLevelAura.js
 *
 * The high-level aura: what official clients draw past level 99 (150, 160/185,
 * a 4th job at max level), and the coloured auras costume items give.
 *
 * Official clients draw every one of these with one class, CLevel150Effect,
 * tinted per tier. Its structure, as recovered from the 2025 client executable
 * in ragreplaystats (github.com/adsonpleal/ragreplaystats, MIT,
 * src/sim/render/maxLevelAuraEffect.ts):
 *
 *   - rings of W_bubble01..27.tga around the character, cycling through the
 *     frames. Each frame is a wide strip of rising foam fading downwards, so
 *     the strips stand on the ground as the walls of a ring, facing out;
 *   - two flat rings on the ground, cir0002.tga and "emp shock.tga", turning
 *     in opposite directions.
 *
 * The effect table plays it as two parts, as the client's table does: the
 * main effect (EF_LEVEL150 and the rest) is the bubbles, the _SUB one is the
 * ground rings, so /aura 1 can show the rings alone.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

import _vertexShader from './Level99Bubble.vs?raw';
import _fragmentShader from './Level99Bubble.fs?raw';
import WebGL from 'Utils/WebGL.js';
import Client from 'Core/Client.js';
import Altitude from 'Renderer/Map/Altitude.js';
import SpriteRenderer from 'Renderer/SpriteRenderer.js';
import { auraUniform, beginAuraBlend, endAuraBlend } from 'Renderer/Effects/AuraBlend.js';

const DEG_TO_RAD = Math.PI / 180;
const BASE_LIFT = 0.05;

/** W_bubble01..27.tga, one every FRAME_MS. */
const BUBBLE_FRAMES = 27;
const FRAME_MS = 55;

/**
 * The walls of foam: how many strips make the ring, how far out (cells), how
 * tall (world units), how fast it turns (degrees a second). The executable
 * builds four rings of 22; three, overlapping, read the same.
 */
const RINGS = [
	{ count: 18, radius: 0.95, height: 2.6, spin: 30 },
	{ count: 18, radius: 1.3, height: 2.0, spin: -24 },
	{ count: 18, radius: 1.65, height: 1.4, spin: 18 }
];

/** The ground rings: texture, width in world units, turn (degrees a second). */
const GROUND_RINGS = [
	{ texture: 'cir0002.tga', size: 6.4, spin: 40 },
	{ texture: 'emp shock.tga', size: 5.0, spin: -55 }
];

/** Corners of a square, for the ground rings. */
const CORNERS = [
	{ x: -1, y: -1 },
	{ x: 1, y: -1 },
	{ x: 1, y: 1 },
	{ x: -1, y: 1 }
];

/**
 * @var {WebGLProgram}
 */
let _program;

/**
 * @var {WebGLBuffer}
 */
let _buffer;

/**
 * Textures by file name, shared by every aura: a town full of max-level
 * characters loads them once.
 */
const _textures = new Map();

function loadTexture(gl, name) {
	if (_textures.has(name)) {
		return;
	}
	_textures.set(name, null);
	Client.loadFile(`data/texture/effect/${name}`, buffer => {
		WebGL.texture(gl, buffer, texture => {
			_textures.set(name, texture);
		});
	});
}

function bubbleName(frame) {
	return `w_bubble${String(frame + 1).padStart(2, '0')}.tga`;
}

class MaxLevelAura {
	/**
	 * @param {vec3} position entity position (kept by reference, so it follows)
	 * @param {string} part 'bubbles' (the main effect) or 'rings' (the _SUB effect)
	 * @param {{r: number, g: number, b: number, dark: boolean}} color the tier's tint, from AuraTiers
	 * @param {number} tick start tick
	 */
	constructor(position, part, color, tick) {
		this.position = position;
		this.part = part === 'rings' ? 'rings' : 'bubbles';
		this.color = color || { r: 1, g: 1, b: 1, dark: false };
		this.startTick = tick || 0;
		this.quadData = new Float32Array(30);
		this.points = [
			[0, 0, 0],
			[0, 0, 0],
			[0, 0, 0],
			[0, 0, 0]
		];
	}

	init(gl) {
		if (this.part === 'rings') {
			GROUND_RINGS.forEach(r => loadTexture(gl, r.texture));
		} else {
			for (let i = 0; i < BUBBLE_FRAMES; i++) {
				loadTexture(gl, bubbleName(i));
			}
		}
		this.ready = true;
	}

	free() {
		this.ready = false;
	}

	/**
	 * Two triangles from four corners, with the texture across them.
	 */
	fillQuad(points) {
		const q = this.quadData;
		const order = [0, 1, 2, 2, 3, 0];
		const uv = [
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1]
		];
		for (let v = 0; v < 6; v++) {
			const p = points[order[v]];
			q[v * 5] = p[0];
			q[v * 5 + 1] = p[1];
			q[v * 5 + 2] = p[2];
			q[v * 5 + 3] = uv[order[v]][0];
			q[v * 5 + 4] = uv[order[v]][1];
		}
	}

	draw(gl, texture, alpha, zIndex) {
		if (!texture) {
			return;
		}
		const uniform = _program.uniform;
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.quadData);
		gl.uniform4f(uniform.uColor, ...auraUniform(this.color, alpha));
		gl.uniform1f(uniform.uZIndex, zIndex);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
	}

	render(gl, tick) {
		if (!this.ready) {
			return;
		}
		const elapsed = Math.max(0, tick - this.startTick);
		const groundZ = Altitude.getCellHeight(this.position[0], this.position[1]);
		const base = [this.position[0] + 0.5, -groundZ - BASE_LIFT, this.position[1] + 0.5];
		const self = this;

		beginAuraBlend(gl, this.color);
		SpriteRenderer.runWithDepth(true, false, false, function () {
			if (self.part === 'rings') {
				self.renderRings(gl, base, elapsed);
			} else {
				self.renderBubbles(gl, base, elapsed);
			}
		});
		endAuraBlend(gl, this.color);
	}

	renderRings(gl, base, elapsed) {
		for (let i = 0; i < GROUND_RINGS.length; i++) {
			const ring = GROUND_RINGS[i];
			const angle = ((elapsed / 1000) * ring.spin + i * 45) * DEG_TO_RAD;
			const half = ring.size / 2;
			const cos = Math.cos(angle) * half;
			const sin = Math.sin(angle) * half;
			// The square's corners turned about the up axis, flat on the ground.
			for (let k = 0; k < 4; k++) {
				const x = CORNERS[k].x;
				const z = CORNERS[k].y;
				this.points[k][0] = base[0] + x * cos - z * sin;
				this.points[k][1] = base[1] - 0.01 * (i + 1);
				this.points[k][2] = base[2] + x * sin + z * cos;
			}
			this.fillQuad(this.points);
			this.draw(gl, _textures.get(ring.texture), 1.0, 0.002 * (i + 1));
		}
	}

	renderBubbles(gl, base, elapsed) {
		const frame = Math.floor(elapsed / FRAME_MS);

		for (let r = 0; r < RINGS.length; r++) {
			const ring = RINGS[r];
			const turn = (elapsed / 1000) * ring.spin * DEG_TO_RAD;
			const step = (Math.PI * 2) / ring.count;
			// A gentle breathing in height, so the ring is never still.
			const top = base[1] - ring.height * (0.9 + 0.1 * Math.sin(elapsed / 400 + r));

			for (let b = 0; b < ring.count; b++) {
				const a0 = turn + b * step;
				const a1 = a0 + step;
				const x0 = base[0] + Math.cos(a0) * ring.radius;
				const z0 = base[2] + Math.sin(a0) * ring.radius;
				const x1 = base[0] + Math.cos(a1) * ring.radius;
				const z1 = base[2] + Math.sin(a1) * ring.radius;
				// The strip's top edge is the foam; it fades towards the ground.
				this.points[0][0] = x0;
				this.points[0][1] = top;
				this.points[0][2] = z0;
				this.points[1][0] = x1;
				this.points[1][1] = top;
				this.points[1][2] = z1;
				this.points[2][0] = x1;
				this.points[2][1] = base[1];
				this.points[2][2] = z1;
				this.points[3][0] = x0;
				this.points[3][1] = base[1];
				this.points[3][2] = z0;
				this.fillQuad(this.points);
				const texture = _textures.get(bubbleName((frame + b * 3 + r * 9) % BUBBLE_FRAMES));
				this.draw(gl, texture, 0.55, 0.01 + r * 0.002 + b * 0.0001);
			}
		}
	}

	static init(gl) {
		_program = WebGL.createShaderProgram(gl, _vertexShader, _fragmentShader);
		_buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, _buffer);
		gl.bufferData(gl.ARRAY_BUFFER, 120, gl.DYNAMIC_DRAW);
		this.ready = true;
		this.renderBeforeEntities = true;
	}

	static free(gl) {
		if (_program) {
			gl.deleteProgram(_program);
			_program = null;
		}
		if (_buffer) {
			gl.deleteBuffer(_buffer);
			_buffer = null;
		}
		for (const texture of _textures.values()) {
			if (texture) {
				gl.deleteTexture(texture);
			}
		}
		_textures.clear();
		this.ready = false;
	}

	static beforeRender(gl, modelView, projection, fog) {
		const uniform = _program.uniform;
		const attribute = _program.attribute;

		gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive, as the 99 aura

		gl.useProgram(_program);
		gl.uniformMatrix4fv(uniform.uModelViewMat, false, modelView);
		gl.uniformMatrix4fv(uniform.uProjectionMat, false, projection);

		gl.uniform1i(uniform.uFogUse, fog.use && fog.exist);
		gl.uniform1f(uniform.uFogNear, fog.near);
		gl.uniform1f(uniform.uFogFar, fog.far);
		gl.uniform3fv(uniform.uFogColor, fog.color);

		gl.activeTexture(gl.TEXTURE0);
		gl.uniform1i(uniform.uDiffuse, 0);
		gl.uniform1i(uniform.uSolidBg, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, _buffer);
		gl.enableVertexAttribArray(attribute.aPosition);
		gl.enableVertexAttribArray(attribute.aTextureCoord);
		gl.vertexAttribPointer(attribute.aPosition, 3, gl.FLOAT, false, 5 * 4, 0);
		gl.vertexAttribPointer(attribute.aTextureCoord, 2, gl.FLOAT, false, 5 * 4, 3 * 4);
	}

	static afterRender(gl) {
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.disableVertexAttribArray(_program.attribute.aPosition);
		gl.disableVertexAttribArray(_program.attribute.aTextureCoord);
	}
}

export default MaxLevelAura;
