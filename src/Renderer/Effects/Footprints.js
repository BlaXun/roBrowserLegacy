/**
 * Renderer/Effects/Footprints.js
 *
 * Footprint hat effects: the prints a costume leaves as its wearer walks.
 *
 * A footprint is a hat effect the client's footprinteffectinfo.lub describes
 * (FootPrintEffectTable, read through hateffect_f.lub's GetFootprint* getters),
 * not hateffectinfo.lub. What follows is how an iRO Ragexe.exe (October 2026)
 * draws one, in the client's units: a cell is 5 world units there.
 *
 * - While the effect is on, each frame compares the owner's position with
 *   where the last print went. Once the squared distance passes Stride, it
 *   drops the next print, and the feet alternate.
 * - Each print stands Gap world units to the side of the line walked, on the
 *   ground.
 * - Type 4 (every footprint but one) is two STR animations at that point: the
 *   bottom one on the ground, the top one Height_Top above it. Each plays once
 *   and goes. The client draws them as camera-facing planes sized in world
 *   units, Scale world units to a pixel; roBrowser draws a STR at 1/35 of a
 *   cell to a pixel, so a footprint's STR is Scale * 7 of roBrowser's size.
 * - With IsAdjustAngle, the bottom one is turned to the direction walked, as
 *   seen on screen: the client takes the screen angle of the step, plus 90
 *   degrees, the art being drawn walking up the screen.
 *
 * - With "View my footprints only" ticked in the client's options (Map
 *   preference footprintmine here), a trail whose owner is not the player
 *   drops nothing. The client checks it each frame.
 * - Type 3 (FOOTPRINT_EF_BASE) is a PNG laid flat on the ground at the owner's
 *   feet, the left and right files in turn: Gap goes unused, the art standing
 *   each foot to its side. It is a square 2 * Scale world units across, turned
 *   so the top of the image faces the direction walked, and each corner sits
 *   on the ground beneath it, raised 2 world units. It is alpha-blended, and
 *   its alpha falls from Aplha (sic, out of 255) to nothing over Duration
 *   seconds.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

import _vertexShader from './FootprintDecal.vs?raw';
import _fragmentShader from './FootprintDecal.fs?raw';
import StrEffect from 'Renderer/Effects/StrEffect.js';
import EffectManager from 'Renderer/EffectManager.js';
import EntityManager from 'Renderer/EntityManager.js';
import Altitude from 'Renderer/Map/Altitude.js';
import Camera from 'Renderer/Camera.js';
import SpriteRenderer from 'Renderer/SpriteRenderer.js';
import Client from 'Core/Client.js';
import WebGL from 'Utils/WebGL.js';
import Session from 'Engine/SessionStorage.js';
import MapPreferences from 'Preferences/Map.js';

/** World units to a cell in the client. */
const UNITS_PER_CELL = 5;

/** A footprint's STR scale (world units to a pixel) as a factor of roBrowser's STR size. */
const STR_SCALE = 35 / UNITS_PER_CELL;

/** How far above the ground a PNG print is drawn, in world units. */
const DECAL_LIFT = 2;

/**
 * Whether a print is due: the squared distance walked since the last one, in
 * the client's world units, past `stride`.
 *
 * @param {number[]} from last print's position, in cells
 * @param {number[]} to owner's position, in cells
 * @param {number} stride
 * @return {boolean}
 */
export function strideReached(from, to, stride) {
	const dx = (to[0] - from[0]) * UNITS_PER_CELL;
	const dy = (to[1] - from[1]) * UNITS_PER_CELL;
	const dz = (to[2] - from[2]) * UNITS_PER_CELL;
	return dx * dx + dy * dy + dz * dz > stride;
}

/**
 * Where a print goes: `gap` world units to one side of the line from `from` to
 * `to`, the left for `left`.
 *
 * @param {number[]} from
 * @param {number[]} to
 * @param {number} gap
 * @param {boolean} left
 * @return {number[]} x, y in cells
 */
export function printPosition(from, to, gap, left) {
	const dx = to[0] - from[0];
	const dy = to[1] - from[1];
	const length = Math.sqrt(dx * dx + dy * dy) || 1;
	const side = ((left ? 1 : -1) * gap) / UNITS_PER_CELL / length;
	return [to[0] - dy * side, to[1] + dx * side];
}

/**
 * The angle that turns a print drawn walking up the screen to the direction
 * walked as it shows on screen, in a STR layer's degrees (counter-clockwise
 * on screen in roBrowser).
 *
 * @param {number[]} from
 * @param {number[]} to
 * @param {Float32Array} modelView the camera's
 * @return {number}
 */
export function screenAngle(from, to, modelView) {
	// A STR is drawn at (x, -z, y); a step on the ground moves x and y.
	const vx = to[0] - from[0];
	const vz = to[1] - from[1];
	const sx = modelView[0] * vx + modelView[8] * vz;
	const sy = modelView[1] * vx + modelView[9] * vz;
	return (Math.atan2(sy, sx) * 180) / Math.PI - 90;
}

/**
 * A footprint's STR: drawn at `scale` of its size and turned by `angle`
 * degrees, both about the STR's centre.
 */
export class FootprintStrEffect extends StrEffect {
	constructor(filename, position, startTick, texturePath, scale, angle) {
		super(filename, position, startTick, texturePath);
		this.scale = scale;
		this.angle = angle || 0;
	}

	renderAnimation(gl, material, animat) {
		const s = this.scale;
		const r = (this.angle / 180) * Math.PI;
		const cos = Math.cos(r);
		const sin = Math.sin(r);
		// The layer's offset turns with it. A STR's y runs down the screen, and
		// its angle turns a layer counter-clockwise as seen.
		const ox = (animat.pos[0] - 320) * s;
		const oy = (animat.pos[1] - 320) * s;
		super.renderAnimation(gl, material, {
			...animat,
			xy: animat.xy.map(v => v * s),
			pos: [320 + ox * cos + oy * sin, 320 - ox * sin + oy * cos],
			angle: animat.angle + this.angle
		});
	}
}

/**
 * A PNG print's corners: a square `scale` world units from the centre to each
 * side, at `position`, its top facing the step from `from` to `to`. Each corner
 * stands DECAL_LIFT above `heightAt` it.
 *
 * @param {number[]} position x, y in cells
 * @param {number[]} from
 * @param {number[]} to
 * @param {number} scale
 * @param {function} heightAt (x, y) => ground height there
 * @return {Float32Array} top left, top right, bottom left, bottom right, each
 *   x, y, z as roBrowser draws the world: x, -height, y, plus half a cell
 */
export function decalCorners(position, from, to, scale, heightAt) {
	const dx = to[0] - from[0];
	const dy = to[1] - from[1];
	const length = Math.sqrt(dx * dx + dy * dy) || 1;
	const half = scale / UNITS_PER_CELL;
	// Forward and to the right of the step, a half-width long.
	const fx = (dx / length) * half;
	const fy = (dy / length) * half;
	const rx = fy;
	const ry = -fx;
	const corners = new Float32Array(12);
	[
		[-1, 1],
		[1, 1],
		[-1, -1],
		[1, -1]
	].forEach(([u, v], i) => {
		const x = position[0] + u * rx + v * fx;
		const y = position[1] + u * ry + v * fy;
		corners[i * 3 + 0] = x + 0.5;
		corners[i * 3 + 1] = -(heightAt(x, y) + DECAL_LIFT / UNITS_PER_CELL);
		corners[i * 3 + 2] = y + 0.5;
	});
	return corners;
}

/**
 * A PNG print's alpha, out of 1, `elapsed` ms after it was dropped.
 *
 * @param {number} alpha out of 255
 * @param {number} duration in seconds
 * @param {number} elapsed in ms
 * @return {number}
 */
export function decalAlpha(alpha, duration, elapsed) {
	return Math.max(0, (alpha / 255) * (1 - elapsed / (duration * 1000)));
}

let _program = null;
let _buffer = null;

/**
 * The PNGs' textures, by path, shared by every print and kept for the session:
 * Client.loadFile keeps a PNG as a blob URL, which Texture.load revokes once it
 * has read it, so a second load of the same file never finishes.
 */
const _textures = new Map();

function loadTexture(gl, filename) {
	if (!_textures.has(filename)) {
		_textures.set(
			filename,
			new Promise(resolve => {
				Client.loadFile(filename, buffer => WebGL.texture(gl, buffer, resolve));
			})
		);
	}
	return _textures.get(filename);
}

/**
 * A PNG print (Type 3), flat on the ground, fading out.
 */
export class FootprintDecal {
	static renderBeforeEntities = true;

	/**
	 * @param {string} file the PNG, under data/texture/effect/
	 * @param {Float32Array} corners decalCorners'
	 * @param {number} startTick
	 * @param {number} alpha out of 255
	 * @param {number} duration in seconds
	 */
	constructor(file, corners, startTick, alpha, duration) {
		this.filename = 'data/texture/effect/' + file.replace(/\\/g, '/');
		this.corners = corners;
		this.startTick = startTick;
		this.alpha = alpha;
		this.duration = duration;
	}

	init(gl) {
		loadTexture(gl, this.filename).then(texture => {
			this.texture = texture;
			this.ready = true;
		});
	}

	render(gl, tick) {
		const alpha = decalAlpha(this.alpha, this.duration, tick - this.startTick);
		if (alpha <= 0) {
			this.needCleanUp = true;
			return;
		}

		const uniform = _program.uniform;
		gl.bindTexture(gl.TEXTURE_2D, this.texture);
		// WebGL names a uniform array by its first element.
		gl.uniform3fv(uniform['uCorners[0]'], this.corners);
		gl.uniform1f(uniform.uAlpha, alpha);
		SpriteRenderer.runWithDepth(true, false, false, () => gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4));
	}

	static init(gl) {
		_program = WebGL.createShaderProgram(gl, _vertexShader, _fragmentShader);
		_buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, _buffer);
		// Corner, then texture coordinates, in decalCorners' order.
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, 1, 1, 0, 2, 0, 1, 3, 1, 1]), gl.STATIC_DRAW);
		this.ready = true;
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
		this.ready = false;
	}

	static beforeRender(gl, modelView, projection) {
		const uniform = _program.uniform;
		const attribute = _program.attribute;
		gl.useProgram(_program);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.uniformMatrix4fv(uniform.uModelViewMat, false, modelView);
		gl.uniformMatrix4fv(uniform.uProjectionMat, false, projection);
		gl.activeTexture(gl.TEXTURE0);
		gl.uniform1i(uniform.uDiffuse, 0);
		gl.bindBuffer(gl.ARRAY_BUFFER, _buffer);
		gl.enableVertexAttribArray(attribute.aCorner);
		gl.enableVertexAttribArray(attribute.aTextureCoord);
		gl.vertexAttribPointer(attribute.aCorner, 1, gl.FLOAT, false, 3 * 4, 0);
		gl.vertexAttribPointer(attribute.aTextureCoord, 2, gl.FLOAT, false, 3 * 4, 4);
	}

	static afterRender(gl) {
		gl.disableVertexAttribArray(_program.attribute.aCorner);
		gl.disableVertexAttribArray(_program.attribute.aTextureCoord);
	}
}

/** The path a footprint's STR is loaded by, and its texture folder. */
function strPath(file) {
	const path = file.replace(/\\/g, '/');
	return {
		filename: 'data/texture/effect/' + path,
		texturePath: path.substring(0, path.lastIndexOf('/') + 1)
	};
}

/**
 * Follows its owner and drops the prints. Drawn by no one: it only spawns.
 */
export class FootprintTrail {
	static ready = true;
	static renderBeforeEntities = true;
	static beforeRender() {}
	static afterRender() {}

	/**
	 * @param {object} owner the entity wearing the footprint
	 * @param {object} info DB.getFootprintEffect's entry
	 */
	constructor(owner, info) {
		this.owner = owner;
		this.info = info;
		this.last = owner.position.slice(0, 3);
		this.left = true;
		// EffectManager renders an instance only once it is ready.
		this.ready = true;
	}

	render(gl, tick) {
		const owner = this.owner;
		if (!owner || EntityManager.get(owner.GID) !== owner) {
			this.needCleanUp = true;
			return;
		}

		const to = owner.position;
		// "View my footprints only", which the client checks each frame. The
		// trail keeps up meanwhile, so turning it off starts from here.
		if (MapPreferences.footprintmine && owner !== Session.Entity) {
			this.last = to.slice(0, 3);
			return;
		}
		if (!strideReached(this.last, to, this.info.stride)) {
			return;
		}

		this.drop(this.last, to, tick);
		this.last = to.slice(0, 3);
		this.left = !this.left;
	}

	/** One print, for the step from `from` to `to`. */
	drop(from, to, tick) {
		const info = this.info;
		if (info.type === 3) {
			this.dropPng(from, to, tick);
			return;
		}
		if (info.type !== 4) {
			return;
		}

		const [x, y] = printPosition(from, to, info.gap, this.left);
		const ground = Altitude.getCellHeight(x, y);
		const bottom = this.left ? info.strBottomLeft : info.strBottomRight;
		const top = this.left ? info.strTopLeft : info.strTopRight;

		if (bottom && info.scaleBottom > 0) {
			const angle = info.isAdjustAngle ? screenAngle(from, to, Camera.modelView) : 0;
			this.spawn(bottom, [x, y, ground], tick, info.scaleBottom, angle);
		}
		if (top && info.scaleTop > 0) {
			this.spawn(top, [x, y, ground + info.heightTop / UNITS_PER_CELL], tick, info.scaleTop, 0);
		}
	}

	dropPng(from, to, tick) {
		const info = this.info;
		const file = this.left ? info.pngLeft : info.pngRight;
		if (!file || info.pngScale <= 0) {
			return;
		}
		const corners = decalCorners(to, from, to, info.pngScale, (x, y) => Altitude.getCellHeight(x, y));
		const decal = new FootprintDecal(file, corners, tick, info.pngAlpha, info.pngDuration);
		EffectManager.add(decal, { Inst: { effectID: -1, startTick: tick }, Init: { ownerAID: null } });
	}

	spawn(file, position, tick, scale, angle) {
		const { filename, texturePath } = strPath(file);
		const effect = new FootprintStrEffect(filename, position, tick, texturePath, scale * STR_SCALE, angle);
		// No owner: a print stays where it was dropped and plays out after the
		// footprint is taken off, as the client's do.
		EffectManager.add(effect, { Inst: { effectID: -1, startTick: tick }, Init: { ownerAID: null } });
	}
}

/**
 * Start the footprint `id` on `entity`, if the client's footprint table has it.
 *
 * @param {object} entity
 * @param {number} id the hat effect id
 * @param {object} info DB.getFootprintEffect(id)
 * @return {boolean} whether it started
 */
export function startFootprints(entity, id, info) {
	if (!info || !entity || !entity.position) {
		return false;
	}
	const key = 'footprint-' + id;
	EffectManager.add(new FootprintTrail(entity, info), {
		Inst: { effectID: key },
		Init: { ownerAID: entity.GID }
	});
	if (!entity._hatEffects) {
		entity._hatEffects = {};
	}
	// removeHatEffect takes it off through EffectManager.remove(null, GID, key).
	entity._hatEffects[id] = { type: 'effect', effectTableId: key };
	return true;
}
