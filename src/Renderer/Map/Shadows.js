/**
 * Renderer/Map/Shadows.js
 *
 * Real-time shadows from the map's sun: the static models (buildings, trees,
 * walls) are drawn from the light's direction into a depth texture around the
 * player, and the ground darkens where it is hidden from the sun. RO bakes
 * soft shadows into each map's lightmap already, so these are a moderate,
 * sharper layer on top. Off unless Enhancements.shadows is above 0.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

import WebGL from 'Utils/WebGL.js';

const SIZE = 2048;     // shadow map, texels
const EXTENT = 56;     // half the width of the shadowed area, in cells
const DEPTH = 400;

const VERTEX = `#version 300 es
precision highp float;
in vec3 aPosition;
in vec2 aTextureCoord;
uniform mat4 uLightMat;
out vec2 vUv;
void main() {
	vUv = aTextureCoord;
	gl_Position = uLightMat * vec4(aPosition, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uDiffuse;
out vec4 fragColor;
void main() {
	// Leaves and fences cast the shape of what is drawn, not of their quad.
	if (texture(uDiffuse, vUv).a < 0.5) discard;
	fragColor = vec4(1.0);
}`;

let _fbo = null;
let _program = null;
let _current = null;

function lookAt(eye, center, up) {
	let z = [eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]];
	let l = Math.hypot(z[0], z[1], z[2]) || 1;
	z = z.map(v => v / l);
	let x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]];
	l = Math.hypot(x[0], x[1], x[2]) || 1;
	x = x.map(v => v / l);
	const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
	const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
}

function multiply(a, b) {
	const out = new Float32Array(16);
	for (let col = 0; col < 4; col++) {
		for (let row = 0; row < 4; row++) {
			let sum = 0;
			for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
			out[col * 4 + row] = sum;
		}
	}
	return out;
}

function ensure(gl) {
	if (_fbo) return true;
	const texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SIZE, SIZE, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	const framebuffer = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
	gl.drawBuffers([gl.NONE]);
	gl.readBuffer(gl.NONE);
	const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	if (!ok) {
		gl.deleteFramebuffer(framebuffer);
		gl.deleteTexture(texture);
		return false;
	}
	_fbo = { framebuffer, texture };
	_program = WebGL.createShaderProgram(gl, VERTEX, FRAGMENT);
	return true;
}

/**
 * The light's view of the area around `center` (world space): an orthographic
 * box along the sun's direction, snapped to the shadow map's texel grid so
 * shadow edges don't shimmer as the player walks.
 */
export function lightMatrix(direction, center) {
	const d = direction;
	const l = Math.hypot(d[0], d[1], d[2]) || 1;
	const toward = [d[0] / l, d[1] / l, d[2] / l];
	const up = Math.abs(toward[1]) > 0.95 ? [0, 0, 1] : [0, -1, 0];
	const texel = (2 * EXTENT) / SIZE;
	const snapped = [Math.round(center[0] / texel) * texel, center[1], Math.round(center[2] / texel) * texel];
	const eye = [snapped[0] + toward[0] * DEPTH / 2, snapped[1] + toward[1] * DEPTH / 2, snapped[2] + toward[2] * DEPTH / 2];
	const view = lookAt(eye, snapped, up);
	const r = EXTENT, near = 1, far = DEPTH;
	const ortho = [1 / r, 0, 0, 0, 0, 1 / r, 0, 0, 0, 0, -2 / (far - near), 0, 0, 0, -(far + near) / (far - near), 1];
	return multiply(ortho, view);
}

/**
 * Draw the shadow map. `drawCasters(program, matrix)` draws what casts
 * shadows with the depth program bound. Afterwards current() describes it
 * for the ground; the caller rebinds its own framebuffer.
 */
export function render(gl, light, center, strength, drawCasters) {
	_current = null;
	if (!(strength > 0) || !light || !light.direction || typeof WebGL2RenderingContext === 'undefined' || !(gl instanceof WebGL2RenderingContext)) {
		return;
	}
	if (!ensure(gl)) return;
	const matrix = lightMatrix(light.direction, center);
	gl.bindFramebuffer(gl.FRAMEBUFFER, _fbo.framebuffer);
	gl.viewport(0, 0, SIZE, SIZE);
	gl.clear(gl.DEPTH_BUFFER_BIT);
	gl.useProgram(_program);
	gl.uniformMatrix4fv(_program.uniform.uLightMat, false, matrix);
	gl.uniform1i(_program.uniform.uDiffuse, 0);
	drawCasters(_program, matrix);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	_current = { texture: _fbo.texture, matrix, strength: Math.min(1, strength), texel: 1 / SIZE };
}

/** This frame's shadow map, or null. */
export function current() {
	return _current;
}

export function clear() {
	_current = null;
}

export function free(gl) {
	if (_fbo) {
		gl.deleteFramebuffer(_fbo.framebuffer);
		gl.deleteTexture(_fbo.texture);
		_fbo = null;
	}
	_current = null;
}

export default { render, current, clear, free, lightMatrix };
