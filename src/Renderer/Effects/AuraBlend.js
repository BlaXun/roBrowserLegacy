/**
 * Renderer/Effects/AuraBlend.js
 *
 * Colour and blending for the aura effects, shared by the level-99 aura's
 * three parts and the high-level aura (MaxLevelAura).
 *
 * The auras add light (SRC_ALPHA, ONE), which can make any colour but black:
 * black added is nothing. Two kinds of colour are drawn otherwise:
 *
 * - a hat-effect aura's (`hat`, which LevelAuraEffects sets): the client draws
 *   the coloured level-99 and level-160 hat auras with alpha blending, in any
 *   colour, where its level auras add light. An iRO Ragexe.exe (October 2026)
 *   sets that blending (5/6) for effects 1164-1183, 1291, 1292, 1325-1346 and
 *   2281-2284, beside their colour.
 * - a dark one (AuraTiers.auraColor marks it): black added would be nothing.
 *
 * How depends on the texture's shape:
 *
 * - 'alpha': a texture shaped by its alpha channel, bright in every pixel
 *   (ring_blue.tga, whitelight.tga, cir0002.tga). It is drawn in its own
 *   colour with alpha blending (SRC_ALPHA, ONE_MINUS_SRC_ALPHA). Darkening by
 *   its colour instead would darken the whole quad, and tint it with the
 *   opposite of the texture's colour.
 * - 'brightness': a texture with no alpha, shaped by how bright it is on black
 *   (pikapika2.bmp), which alpha blending would draw as a square. A hat colour
 *   keeps adding light; the client gives its hat auras a ready-coloured
 *   texture with alpha here instead (GroundAura's), and this is the fallback
 *   for a client without one. A dark colour darkens what is behind by that
 *   brightness (ZERO, ONE_MINUS_SRC_COLOR), which its shader gives as grey
 *   (uDarken in GroundAura.fs): darkening by the texture's own colour would
 *   leave the opposite colour behind, an orange fringe for pikapika2's blue.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

/**
 * The colour to give the shader's uColor for `color`.
 *
 * @param {{r: number, g: number, b: number, dark: boolean}} color
 * @param {number} alpha
 * @param {string} [shape] 'alpha' or 'brightness' (the default): see above
 * @param {number[]} [out] written and returned instead of a new array
 * @return {number[]} r, g, b, a
 */
export function auraUniform(color, alpha, shape = 'brightness', out = new Array(4)) {
	const white = color.dark && shape !== 'alpha';
	out[0] = white ? 1 : color.r;
	out[1] = white ? 1 : color.g;
	out[2] = white ? 1 : color.b;
	out[3] = alpha;
	return out;
}

/**
 * Switch to the blending `color` needs before drawing it. A no-op for every
 * colour but a hat aura's or a dark one.
 *
 * @param {WebGL2RenderingContext} gl
 * @param {{dark: boolean, hat: boolean}} color
 * @param {string} [shape] 'alpha' or 'brightness' (the default): see above
 */
export function beginAuraBlend(gl, color, shape = 'brightness') {
	const blend = auraBlend(color, shape);
	if (blend !== BLEND_ADD) {
		setAuraBlend(gl, blend);
	}
}

/**
 * The blendings the auras draw with: BLEND_ADD (SRC_ALPHA, ONE), the one
 * they share; BLEND_ALPHA (SRC_ALPHA, ONE_MINUS_SRC_ALPHA); BLEND_DARKEN
 * (ZERO, ONE_MINUS_SRC_COLOR).
 */
export const BLEND_ADD = 0;
export const BLEND_ALPHA = 1;
export const BLEND_DARKEN = 2;

/**
 * The blending `color` needs, as beginAuraBlend switches to it.
 *
 * @param {{dark: boolean, hat: boolean}} color
 * @param {string} [shape] 'alpha' or 'brightness' (the default): see above
 * @return {number} BLEND_ADD, BLEND_ALPHA or BLEND_DARKEN
 */
export function auraBlend(color, shape = 'brightness') {
	if (!color) {
		return BLEND_ADD;
	}
	if (shape === 'alpha' && (color.hat || color.dark)) {
		return BLEND_ALPHA;
	}
	if (shape !== 'alpha' && color.dark) {
		return BLEND_DARKEN;
	}
	return BLEND_ADD;
}

/**
 * Switch to one of the blendings above.
 *
 * @param {WebGL2RenderingContext} gl
 * @param {number} blend BLEND_ADD, BLEND_ALPHA or BLEND_DARKEN
 */
export function setAuraBlend(gl, blend) {
	if (blend === BLEND_ALPHA) {
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	} else if (blend === BLEND_DARKEN) {
		gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
	} else {
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
	}
}

/**
 * Put back the additive blending the auras share, after beginAuraBlend.
 */
export function endAuraBlend(gl, color) {
	if (color && (color.hat || color.dark)) {
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
	}
}
