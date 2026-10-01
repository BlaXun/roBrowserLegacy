/**
 * Renderer/Map/Water.js
 *
 * Rendering water
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
 * @author Vincent Thibault
 */

import WebGL from 'Utils/WebGL.js';
import SpriteRenderer from 'Renderer/SpriteRenderer.js';
import Altitude from 'Renderer/Map/Altitude.js';
import SceneCopy from 'Renderer/Map/SceneCopy.js';
import Enhancements from 'Renderer/Effects/Enhancements.js';
import _vertexShader from './Water.vs?raw';
import _fragmentShader from './Water.fs?raw';

/**
 * @var {WebGLProgram}
 */
let _program = null;

/**
 * @var {WebGLBuffer}
 */
let _buffer = null;

/**
 * @var {number} total vertices
 */
let _vertCount = 0;

/**
 * @var {Array} textures list
 */
const _textures = new Array(32);

/**
 * @var {number} wave speed
 */
let _waveSpeed = 0;

/**
 * @var {number} wave height
 */
let _waveHeight = 0;

/**
 * @var {number} wave pitch
 */
let _wavePitch = 0;

/**
 * @var {number} water height
 */
let _waterLevel = 0;

/**
 * @var {number} animation speed
 */
let _animSpeed = 0;

/**
 * @var {number} water opacity
 */
let _waterOpacity = 0.9;

/**
 * @var {object|null} this frame's reflection: { texture, strength }
 */
let _reflection = null;

/**
 * The water plane's height, and whether there is water to reflect in.
 */
function level() {
	return _vertCount ? _waterLevel : null;
}

/**
 * Hand the water this frame's reflection (WaterReflection.render), or null.
 */
function setReflection(reflection) {
	_reflection = reflection;
}

/**
 * Initialize water data
 *
 * @param {object} gl context
 * @param {object} water data
 */
function init(gl, water) {
	// Water informations
	_vertCount = water.vertCount;
	_waveHeight = water.waveHeight;
	_waveSpeed = water.waveSpeed;
	_waterLevel = water.level;
	_animSpeed = water.animSpeed;
	_wavePitch = water.wavePitch;
	_waterOpacity = water.type !== 4 && water.type !== 6 ? 0.8 : 1.0;

	// No water ?
	if (!_vertCount) {
		return;
	}

	// Link program	if not loaded
	if (!_program) {
		_program = WebGL.createShaderProgram(gl, _vertexShader, _fragmentShader);
	}

	// Bind mesh
	_buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, _buffer);
	gl.bufferData(gl.ARRAY_BUFFER, water.mesh, gl.STATIC_DRAW);

	function onTextureLoaded(texture, index) {
		_textures[index] = texture;
	}

	// Bind water textures
	for (let i = 0; i < 32; ++i) {
		WebGL.texture(gl, water.images[i], onTextureLoaded, i);
	}
}

/**
 * Render water
 *
 * @param {object} gl context
 * @param {mat4} modelView
 * @param {mat4} projection
 * @param {object} fog structure
 * @param {object} light structure
 * @param {number} tick (game tick)
 */
function render(gl, modelView, projection, fog, light, tick) {
	// If no water, don't need to process.
	if (!_vertCount) {
		return;
	}

	const uniform = _program.uniform;
	const attribute = _program.attribute;
	const frame = tick / (1000 / 60); // 60fps

	gl.useProgram(_program);

	// Bind matrix
	gl.uniformMatrix4fv(uniform.uModelViewMat, false, modelView);
	gl.uniformMatrix4fv(uniform.uProjectionMat, false, projection);

	// Fog settings
	gl.uniform1i(uniform.uFogUse, fog.use && fog.exist);
	gl.uniform1f(uniform.uFogNear, fog.near);
	gl.uniform1f(uniform.uFogFar, fog.far);
	gl.uniform3fv(uniform.uFogColor, fog.color);

	// Enable all attributes
	gl.enableVertexAttribArray(attribute.aPosition);
	gl.enableVertexAttribArray(attribute.aTextureCoord);

	gl.bindBuffer(gl.ARRAY_BUFFER, _buffer);

	// Link attribute
	gl.vertexAttribPointer(attribute.aPosition, 3, gl.FLOAT, false, 5 * 4, 0);
	gl.vertexAttribPointer(attribute.aTextureCoord, 2, gl.FLOAT, false, 5 * 4, 3 * 4);

	// Textures
	gl.activeTexture(gl.TEXTURE0);
	gl.uniform1i(uniform.uDiffuse, 0);

	// Reflection (MapRenderer passes it in, WaterReflection.js draws it)
	const reflect = _reflection && _reflection.texture ? _reflection.strength : 0;
	// What is under the surface, to know how deep the water is at each pixel.
	const sceneDepth = reflect > 0 ? SceneCopy.depth(gl) : null;
	gl.uniform1f(uniform.uReflect, reflect);
	if (reflect > 0) {
		const viewport = gl.getParameter(gl.VIEWPORT);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, _reflection.texture);
		gl.uniform1i(uniform.uReflection, 1);
		gl.activeTexture(gl.TEXTURE0);
		gl.uniform2f(uniform.uScreen, viewport[2], viewport[3]);
		gl.uniform1f(uniform.uTime, tick / 1000);
		gl.uniform1i(uniform.uHasDepth, sceneDepth ? 1 : 0);
		if (sceneDepth) {
			gl.activeTexture(gl.TEXTURE2);
			gl.bindTexture(gl.TEXTURE_2D, sceneDepth);
			gl.uniform1i(uniform.uSceneDepth, 2);
			gl.activeTexture(gl.TEXTURE0);
		}
		gl.uniform2f(uniform.uProj, projection[10], projection[14]);
		gl.uniform1f(uniform.uRain, Math.min(1, Math.max(0, Number(Enhancements.rain) || 0)));
		// Up (-y in RO) and the sun, in eye space.
		const n = [-modelView[4], -modelView[5], -modelView[6]];
		const nl = Math.hypot(n[0], n[1], n[2]) || 1;
		gl.uniform3f(uniform.uEyeNormal, n[0] / nl, n[1] / nl, n[2] / nl);
		const d = light && light.direction ? light.direction : [0, -1, 0];
		gl.uniform3f(uniform.uEyeSun,
			modelView[0] * d[0] + modelView[4] * d[1] + modelView[8] * d[2],
			modelView[1] * d[0] + modelView[5] * d[1] + modelView[9] * d[2],
			modelView[2] * d[0] + modelView[6] * d[1] + modelView[10] * d[2]);
		gl.uniform3fv(uniform.uLightDiffuse, light && light.diffuse ? light.diffuse : [1, 1, 1]);
	}

	// Water infos
	gl.uniform1f(uniform.uWaveHeight, _waveHeight);
	gl.uniform1f(uniform.uOpacity, _waterOpacity);
	gl.uniform1f(uniform.uWavePitch, _wavePitch);
	gl.uniform1f(uniform.uWaterOffset, ((frame * _waveSpeed) % 360) - 180);

	// Send mesh
	gl.bindTexture(gl.TEXTURE_2D, _textures[((frame / _animSpeed) % 32) | 0]);

	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	//depthtest, depthmask, disabledepthcorrection(isometric draw)
	SpriteRenderer.runWithDepth(true, false, false, function () {
		gl.drawArrays(gl.TRIANGLES, 0, _vertCount);
	});

	// Is it needed ?
	gl.disableVertexAttribArray(attribute.aPosition);
	gl.disableVertexAttribArray(attribute.aTextureCoord);
}

/**
 * Clean texture/buffer from memory
 *
 * @param {object} gl context
 */
function free(gl) {
	let i;

	if (_buffer) {
		gl.deleteBuffer(_buffer);
		_buffer = null;
	}

	if (_program) {
		gl.deleteProgram(_program);
		_program = null;
	}

	for (i = 0; i < 32; ++i) {
		if (_textures[i]) {
			gl.deleteTexture(_textures[i]);
			_textures[i] = null;
		}
	}

	_vertCount = 0;
}

/**
 * Is the ground at this cell under the water surface ?
 * (world Y points down: ground is submerged when -altitude is above the wave crest)
 *
 * @param {number} x
 * @param {number} y
 * @return {boolean}
 */
function isSubmerged(x, y) {
	if (!_vertCount) {
		return false;
	}

	return -Altitude.getCellHeight(x, y) > _waterLevel - _waveHeight;
}

/**
 * Does the current map have any water surface ?
 *
 * @return {boolean}
 */
function hasWater() {
	return _vertCount > 0;
}

/**
 * Export
 */
export default {
	init: init,
	free: free,
	render: render,
	isSubmerged: isSubmerged,
	hasWater: hasWater,
	level: level,
	setReflection: setReflection
};
