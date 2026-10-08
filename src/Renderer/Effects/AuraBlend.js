/**
 * Renderer/Effects/AuraBlend.js
 *
 * Colour and blending for the aura effects, shared by the level-99 aura's
 * three parts and the high-level aura (MaxLevelAura).
 *
 * The auras add light (SRC_ALPHA, ONE), which can make any colour but black:
 * black added is nothing. A dark colour (AuraTiers.auraColor marks it) is
 * drawn by darkening what is behind instead, and how depends on the texture's
 * shape:
 *
 * - 'alpha': a texture shaped by its alpha channel, bright in every pixel
 *   (ring_blue.tga, whitelight.tga, cir0002.tga). It is drawn in its own
 *   colour with alpha blending (SRC_ALPHA, ONE_MINUS_SRC_ALPHA), the blending
 *   the client gives its coloured hat-effect auras. Darkening by its colour
 *   instead would darken the whole quad, and tint it with the opposite of the
 *   texture's colour.
 * - 'brightness': a texture with no alpha, shaped by how bright it is on black
 *   (pikapika2.bmp). It darkens what is behind by that brightness
 *   (ZERO, ONE_MINUS_SRC_COLOR), which its shader gives as grey (uDarken in
 *   GroundAura.fs): darkening by the texture's own colour would leave the
 *   opposite colour behind, an orange fringe for pikapika2's blue.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

/**
 * The colour to give the shader's uColor for `color`.
 *
 * @param {{r: number, g: number, b: number, dark: boolean}} color
 * @param {number} alpha
 * @param {string} [shape] 'alpha' or 'brightness' (the default): see above
 * @return {number[]} r, g, b, a
 */
export function auraUniform(color, alpha, shape = 'brightness') {
	return color.dark && shape !== 'alpha' ? [1, 1, 1, alpha] : [color.r, color.g, color.b, alpha];
}

/**
 * Switch to the blending `color` needs before drawing it. A no-op for every
 * colour but a dark one.
 *
 * @param {WebGL2RenderingContext} gl
 * @param {{dark: boolean}} color
 * @param {string} [shape] 'alpha' or 'brightness' (the default): see above
 */
export function beginAuraBlend(gl, color, shape = 'brightness') {
	if (color && color.dark) {
		if (shape === 'alpha') {
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		} else {
			gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
		}
	}
}

/**
 * Put back the additive blending the auras share, after beginAuraBlend.
 */
export function endAuraBlend(gl, color) {
	if (color && color.dark) {
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
	}
}
