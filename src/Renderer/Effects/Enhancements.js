/**
 * Renderer/Effects/Enhancements.js
 *
 * Optional renderer features beyond the original client's look. All off by
 * default, so the stock picture is unchanged; a client plugin switches them
 * on (the Ragnarok Offline client API's api.graphics.configure).
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

const Enhancements = {
	/**
	 * Water mirrors the scene above it: 0 off .. 1 full. Costs a second
	 * render of the ground and models, at half resolution, on maps with water.
	 */
	waterReflection: 0,

	/**
	 * Grass on grass tiles (Renderer/Map/Grass.js), or null for none:
	 * { textures: ['풀', 'grass', ...] -- substrings of the ground texture
	 *   names that are grass, density 0..1, height, width, wind 0..1,
	 *   distance (fade), tint [r,g,b] }
	 */
	grass: null,

	/**
	 * Real-time shadows from buildings and trees onto the ground
	 * (Renderer/Map/Shadows.js): 0 off .. 1 full. On top of the shadows the
	 * map's lightmap already bakes in.
	 */
	shadows: 0,

	/**
	 * Rain on the water: rings where drops land, and a duller surface.
	 * 0 dry .. 1 pouring.
	 */
	rain: 0,

	/**
	 * The map's sun and sky, replaced, or null for the map's own:
	 * { ambient: [r,g,b], diffuse: [r,g,b] }, each 0..1 (diffuse may go a
	 * little over). A warmer sun, a cooler sky. The lightmap baked into the
	 * map is not changed.
	 */
	light: null
};

export default Enhancements;
