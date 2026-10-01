/**
 * Renderer/Map/Grass.js
 *
 * Grass on the ground tiles that are grass: tufts of blades, instanced, on
 * every cell whose top texture's name matches one of the patterns a client
 * plugin gives (Enhancements.grass). Each tuft takes its colour from the
 * ground texture under it and its shade from the map's lightmap, so it sits
 * in the map rather than on top of it; it sways in the wind and fades out
 * with distance. Off unless Enhancements.grass is set.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

import WebGL from 'Utils/WebGL.js';
import Ground from 'Renderer/Map/Ground.js';
import Enhancements from 'Renderer/Effects/Enhancements.js';

const VERTEX = `#version 300 es
precision highp float;
in vec3 aBlade;       // x across the tuft -0.5..0.5, y up 0..1, z which of the two crossed planes
in vec4 aInstance;    // xyz on the ground, w a random number for this tuft
in vec4 aUv;          // xy the tile in the ground atlas, zw in the lightmap
uniform mat4 uModelViewMat;
uniform mat4 uProjectionMat;
uniform float uTime;
uniform float uHeight;
uniform float uWidth;
uniform float uWind;
uniform float uFadeFar;
out float vY;
out float vX;
out float vRand;
out float vFade;
out vec4 vUv;
void main() {
	float r = aInstance.w;
	float angle = r * 6.2831853 + aBlade.z * 1.5707963;
	vec2 across = vec2(cos(angle), sin(angle));
	float tall = uHeight * (0.65 + 0.7 * fract(r * 13.7));
	float sway = sin(uTime * 1.6 + aInstance.x * 0.35 + aInstance.z * 0.27 + r * 6.0) * uWind * aBlade.y * aBlade.y;
	vec3 position = aInstance.xyz + vec3(across.x * aBlade.x * uWidth + sway, -aBlade.y * tall, across.y * aBlade.x * uWidth + sway * 0.6);
	vec4 eye = uModelViewMat * vec4(position, 1.0);
	gl_Position = uProjectionMat * eye;
	vY = aBlade.y;
	vX = aBlade.x;
	vRand = r;
	vUv = aUv;
	vFade = 1.0 - smoothstep(uFadeFar * 0.6, uFadeFar, -eye.z);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in float vY;
in float vX;
in float vRand;
in float vFade;
in vec4 vUv;
out vec4 fragColor;
uniform sampler2D uAtlas;
uniform sampler2D uLightmap;
uniform bool uLightMapUse;
uniform vec3 uLightAmbient;
uniform vec3 uLightDiffuse;
uniform vec3 uTint;
uniform bool uFogUse;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uFogColor;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
	// Five blades across each plane, tapering to a point.
	float blades = 5.0;
	float cell = floor((vX + 0.5) * blades);
	float within = fract((vX + 0.5) * blades);
	float lean = (hash(cell + vRand * 17.0) - 0.5) * 0.6 * vY;
	float halfWidth = 0.42 * (1.0 - vY);
	if (abs(within - 0.5 - lean) > halfWidth || vY > 0.55 + 0.45 * hash(cell * 3.1 + vRand * 9.0)) discard;
	// Fade with distance, dithered rather than blended.
	if (vFade < hash(gl_FragCoord.x * 0.37 + gl_FragCoord.y * 1.31)) discard;

	vec3 ground = texture(uAtlas, vUv.xy).rgb;
	vec3 color = ground * uTint * mix(0.62, 1.12, vY);
	color *= clamp(uLightAmbient + uLightDiffuse * 0.6, 0.0, 1.0);
	if (uLightMapUse) {
		vec4 light = texture(uLightmap, vUv.zw);
		color = color * light.a + light.rgb;
	}
	fragColor = vec4(color, 1.0);
	if (uFogUse) {
		float depth = gl_FragCoord.z / gl_FragCoord.w;
		fragColor.rgb = mix(fragColor.rgb, uFogColor, smoothstep(uFogNear, uFogFar, depth));
	}
}`;

// Two crossed planes, two triangles each: x, y, plane.
const BLADES = new Float32Array([
	-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0,
	-0.5, 0, 1, 0.5, 0, 1, 0.5, 1, 1, -0.5, 0, 1, 0.5, 1, 1, -0.5, 1, 1
]);

let _program = null;
let _bladeBuffer = null;
let _instanceBuffer = null;
let _uvBuffer = null;
let _count = 0;
let _data = null;
let _builtFor = null;

/** Texture names come from the map as CP949 bytes in a binary string. */
function decodeName(name) {
	try {
		return new TextDecoder('euc-kr').decode(Uint8Array.from(name, c => c.charCodeAt(0) & 0xff)).toLowerCase();
	} catch {
		return String(name).toLowerCase();
	}
}

/** A repeatable random number for cell i, tuft k. */
function random(i, k) {
	const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
	return x - Math.floor(x);
}

/**
 * Where the tufts go, for these settings. Rebuilt when the settings object
 * changes (a plugin reconfigures) or a new map loads.
 */
function build(gl, settings) {
	_builtFor = settings;
	_count = 0;
	if (!_data || !settings) {
		return;
	}
	const patterns = (Array.isArray(settings.textures) ? settings.textures : []).map(p => String(p).toLowerCase()).filter(Boolean);
	if (!patterns.length) {
		return;
	}
	const grassy = _data.textures.map(name => {
		const decoded = decodeName(name);
		return patterns.some(pattern => decoded.includes(pattern));
	});

	const perCell = Math.max(1, Math.min(12, Math.round((settings.density ?? 0.5) * 12)));
	const { width, height, cellTexture, cellHeights, cellUv } = _data;
	const instances = [];
	const uvs = [];
	for (let y = 0; y < height; ++y) {
		for (let x = 0; x < width; ++x) {
			const i = x + y * width;
			const texture = cellTexture[i];
			if (texture < 0 || !grassy[texture]) {
				continue;
			}
			const h = cellHeights.subarray(i * 4, i * 4 + 4);
			for (let k = 0; k < perCell; ++k) {
				const fx = random(i, k * 2);
				const fy = random(i, k * 2 + 1);
				// The corner heights, bilinear: 0 (x,y) 1 (x+1,y) 2 (x,y+1) 3 (x+1,y+1).
				const ground = h[0] * (1 - fx) * (1 - fy) + h[1] * fx * (1 - fy) + h[2] * (1 - fx) * fy + h[3] * fx * fy;
				instances.push((x + fx) * 2, ground, (y + fy) * 2, random(i, k + 97));
				uvs.push(cellUv[i * 4], cellUv[i * 4 + 1], cellUv[i * 4 + 2], cellUv[i * 4 + 3]);
			}
		}
	}
	_count = instances.length / 4;
	if (!_count) {
		return;
	}
	if (!_program) {
		_program = WebGL.createShaderProgram(gl, VERTEX, FRAGMENT);
	}
	if (!_bladeBuffer) {
		_bladeBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, _bladeBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, BLADES, gl.STATIC_DRAW);
	}
	_instanceBuffer = _instanceBuffer || gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, _instanceBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(instances), gl.STATIC_DRAW);
	_uvBuffer = _uvBuffer || gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, _uvBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
}

/**
 * Keep the map's ground data for when grass is switched on.
 */
function init(gl, data) {
	_data = data && data.cellTexture ? data : null;
	_builtFor = null;
	_count = 0;
}

function render(gl, modelView, projection, fog, light, tick, lightmapOn) {
	const settings = Enhancements.grass;
	if (!settings || !_data || typeof WebGL2RenderingContext === 'undefined' || !(gl instanceof WebGL2RenderingContext)) {
		return;
	}
	if (settings !== _builtFor) {
		build(gl, settings);
	}
	if (!_count || !_program) {
		return;
	}
	const textures = Ground.textures();
	const uniform = _program.uniform;
	const attribute = _program.attribute;

	gl.useProgram(_program);
	gl.uniformMatrix4fv(uniform.uModelViewMat, false, modelView);
	gl.uniformMatrix4fv(uniform.uProjectionMat, false, projection);
	gl.uniform1f(uniform.uTime, tick / 1000);
	gl.uniform1f(uniform.uHeight, settings.height ?? 1.4);
	gl.uniform1f(uniform.uWidth, settings.width ?? 1.1);
	gl.uniform1f(uniform.uWind, settings.wind ?? 0.25);
	gl.uniform1f(uniform.uFadeFar, settings.distance ?? 140);
	const tint = Array.isArray(settings.tint) && settings.tint.length === 3 ? settings.tint : [1, 1, 1];
	gl.uniform3fv(uniform.uTint, tint);
	gl.uniform3fv(uniform.uLightAmbient, light.ambient);
	gl.uniform3fv(uniform.uLightDiffuse, light.diffuse);
	gl.uniform1i(uniform.uLightMapUse, lightmapOn ? 1 : 0);
	gl.uniform1i(uniform.uFogUse, fog.use && fog.exist);
	gl.uniform1f(uniform.uFogNear, fog.near);
	gl.uniform1f(uniform.uFogFar, fog.far);
	gl.uniform3fv(uniform.uFogColor, fog.color);

	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, textures.atlas);
	gl.uniform1i(uniform.uAtlas, 0);
	gl.activeTexture(gl.TEXTURE1);
	gl.bindTexture(gl.TEXTURE_2D, textures.lightmap);
	gl.uniform1i(uniform.uLightmap, 1);
	gl.activeTexture(gl.TEXTURE0);

	gl.bindBuffer(gl.ARRAY_BUFFER, _bladeBuffer);
	gl.enableVertexAttribArray(attribute.aBlade);
	gl.vertexAttribPointer(attribute.aBlade, 3, gl.FLOAT, false, 0, 0);
	gl.vertexAttribDivisor(attribute.aBlade, 0);

	gl.bindBuffer(gl.ARRAY_BUFFER, _instanceBuffer);
	gl.enableVertexAttribArray(attribute.aInstance);
	gl.vertexAttribPointer(attribute.aInstance, 4, gl.FLOAT, false, 0, 0);
	gl.vertexAttribDivisor(attribute.aInstance, 1);

	gl.bindBuffer(gl.ARRAY_BUFFER, _uvBuffer);
	gl.enableVertexAttribArray(attribute.aUv);
	gl.vertexAttribPointer(attribute.aUv, 4, gl.FLOAT, false, 0, 0);
	gl.vertexAttribDivisor(attribute.aUv, 1);

	gl.drawArraysInstanced(gl.TRIANGLES, 0, 12, _count);

	// Divisors are vertex-array state other renderers don't reset.
	gl.vertexAttribDivisor(attribute.aInstance, 0);
	gl.vertexAttribDivisor(attribute.aUv, 0);
	gl.disableVertexAttribArray(attribute.aBlade);
	gl.disableVertexAttribArray(attribute.aInstance);
	gl.disableVertexAttribArray(attribute.aUv);
}

function free(gl) {
	if (_instanceBuffer) gl.deleteBuffer(_instanceBuffer);
	if (_uvBuffer) gl.deleteBuffer(_uvBuffer);
	_instanceBuffer = _uvBuffer = null;
	_data = null;
	_builtFor = null;
	_count = 0;
}

export default { init, render, free };
