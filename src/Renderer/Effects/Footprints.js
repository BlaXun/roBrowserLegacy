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
 * Type 3 (FOOTPRINT_EF_BASE: two PNGs laid flat on the ground, fading out over
 * PngDuration) is not drawn yet.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

import StrEffect from 'Renderer/Effects/StrEffect.js';
import EffectManager from 'Renderer/EffectManager.js';
import EntityManager from 'Renderer/EntityManager.js';
import Altitude from 'Renderer/Map/Altitude.js';
import Camera from 'Renderer/Camera.js';

/** World units to a cell in the client. */
const UNITS_PER_CELL = 5;

/** A footprint's STR scale (world units to a pixel) as a factor of roBrowser's STR size. */
const STR_SCALE = 35 / UNITS_PER_CELL;

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
