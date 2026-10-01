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
	waterReflection: 0
};

export default Enhancements;
