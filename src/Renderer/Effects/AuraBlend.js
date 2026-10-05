/**
 * Renderer/Effects/AuraBlend.js
 *
 * Colour and blending for the aura effects, shared by the level-99 aura's
 * three parts and the high-level aura (MaxLevelAura).
 *
 * The auras add light (SRC_ALPHA, ONE), which can make any colour but black:
 * black added is nothing. A dark colour (AuraTiers.auraColor marks it) is
 * drawn by darkening what is behind instead, by how bright the texture is.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

/**
 * The colour to give the shader's uColor for `color`.
 *
 * @param {{r: number, g: number, b: number, dark: boolean}} color
 * @param {number} alpha
 * @return {number[]} r, g, b, a
 */
export function auraUniform(color, alpha) {
	return color.dark ? [1, 1, 1, alpha] : [color.r, color.g, color.b, alpha];
}

/**
 * Switch to the blending `color` needs before drawing it. A no-op for every
 * colour but a dark one.
 */
export function beginAuraBlend(gl, color) {
	if (color && color.dark) {
		gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
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
