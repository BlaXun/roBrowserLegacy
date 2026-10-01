/**
 * Renderer/MapHooks.js
 *
 * Points in the map renderer where code from outside the client -- a client
 * plugin -- can draw: grass, other water, a shadow map, a reflection. The
 * client calls the hooks; it holds no effects of its own here.
 *
 * A hook is an object with any of:
 *
 *   init(gl, map)        the map's ground is ready (see MapRenderer for `map`)
 *   render(stage, ctx)   once per frame at each stage:
 *                          'begin'  before the ground: draw into targets of
 *                                   your own (shadow map, reflection), then
 *                                   ctx.restoreTarget()
 *                          'ground' the ground is drawn
 *                          'models' the map's models are drawn, the
 *                                   sprites are not yet
 *                          'water'  only for a hook in `replaces`: draw the
 *                                   water in the client's place
 *                          'end'    everything is drawn, before the passes
 *   replaces             ['water']: the client does not draw its water
 *   light(light)         the sun and sky to use this frame, or null for the
 *                        map's: { ambient: [r,g,b], diffuse: [r,g,b] }
 *   free(gl)             the map is going away, or the hook is: let go of
 *                        everything made with gl
 *
 * A hook that throws is taken out and freed, and says so once in the
 * console; it never takes the frame down.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

const _hooks = [];
let _gl = null;
let _map = null;

function fail(hook, what, error) {
	console.error(`[MapHooks] ${hook.name || 'a hook'} failed in ${what}, and is switched off:`, error);
	remove(hook);
}

function call(hook, what, ...args) {
	try {
		return hook[what](...args);
	} catch (error) {
		fail(hook, what, error);
		return undefined;
	}
}

function remove(hook) {
	const index = _hooks.indexOf(hook);
	if (index < 0) {
		return;
	}
	_hooks.splice(index, 1);
	if (_map && typeof hook.free === 'function') {
		try {
			hook.free(_gl);
		} catch (error) {
			console.error(`[MapHooks] ${hook.name || 'a hook'} failed to free:`, error);
		}
	}
}

/**
 * Add a hook. If a map is up, its init runs now. Returns a function that
 * takes it out again (and frees it).
 */
function register(hook) {
	if (!hook || typeof hook !== 'object') {
		throw new Error('MapHooks.register takes an object');
	}
	_hooks.push(hook);
	if (_map && typeof hook.init === 'function') {
		call(hook, 'init', _gl, _map);
	}
	return () => remove(hook);
}

/** The map's ground is ready: init every hook. */
function mapReady(gl, map) {
	_gl = gl;
	_map = map;
	for (const hook of _hooks.slice()) {
		if (typeof hook.init === 'function') {
			call(hook, 'init', gl, map);
		}
	}
}

/** The map is going away: free every hook. */
function mapFree(gl) {
	if (!_map) {
		return;
	}
	for (const hook of _hooks.slice()) {
		if (typeof hook.free === 'function') {
			try {
				hook.free(gl);
			} catch (error) {
				console.error(`[MapHooks] ${hook.name || 'a hook'} failed to free:`, error);
			}
		}
	}
	_map = null;
}

/** Run a stage. For 'water', only the hooks that replace it. */
function stage(name, ctx) {
	for (const hook of _hooks.slice()) {
		if (typeof hook.render !== 'function') {
			continue;
		}
		const replacing = Array.isArray(hook.replaces) && hook.replaces.includes(name);
		if (name === 'water' ? replacing : true) {
			call(hook, 'render', name, ctx);
		}
	}
}

/** Whether some hook draws `name` in the client's place. */
function replaces(name) {
	return _hooks.some(hook => Array.isArray(hook.replaces) && hook.replaces.includes(name));
}

const _lit = { ambient: new Float32Array(3), diffuse: new Float32Array(3), env: new Float32Array(3) };
let _litFor = null;
let _litView = null;

function rgb(value) {
	return Array.isArray(value) || ArrayBuffer.isView(value)
		? value.length === 3 && Array.from(value).every(v => Number.isFinite(v))
		: false;
}

/**
 * The light to draw with: the map's, or the last hook's that gives one.
 * Direction and opacity always stay the map's.
 */
function light(mapLight) {
	if (!mapLight) {
		return mapLight;
	}
	let over = null;
	for (const hook of _hooks.slice()) {
		if (typeof hook.light === 'function') {
			const value = call(hook, 'light', mapLight);
			if (value && typeof value === 'object') {
				over = value;
			}
		}
	}
	if (!over) {
		return mapLight;
	}
	const ambient = rgb(over.ambient) ? over.ambient : mapLight.ambient;
	const diffuse = rgb(over.diffuse) ? over.diffuse : mapLight.diffuse;
	for (let i = 0; i < 3; i++) {
		_lit.ambient[i] = ambient[i];
		_lit.diffuse[i] = diffuse[i];
		_lit.env[i] = 1 - (1 - Math.min(1, diffuse[i])) * (1 - Math.min(1, ambient[i]));
	}
	if (_litFor !== mapLight) {
		_litFor = mapLight;
		_litView = Object.assign(Object.create(mapLight), _lit);
	}
	return _litView;
}

export default { register, mapReady, mapFree, stage, replaces, light };
