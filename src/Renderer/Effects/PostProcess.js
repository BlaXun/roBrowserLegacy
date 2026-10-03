/**
 * Renderer/Effects/PostProcess.js
 *
 * Manages the Post-Processing pipeline using a Ping-Pong buffer architecture.
 * Ensures the main scene is rendered at full resolution before applying effects.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
 * @author AoShinHo
 */

import GraphicsSettings from 'Preferences/Graphics.js';

let _effects = [];
let _activeEffects = [];

// Passes a client plugin added (addExternal). They outlive map changes, so
// registerExternal puts them back each time the built-ins are registered.
let _external = [];
let _externalAt = -1;
let _gl = null;

// The scene's depth, as a texture, while the passes run; and whether they are
// running, so a pass's beforeRenderPass leaves that depth alone.
let _sceneDepth = null;
let _inPasses = false;

// Ping-Pong Buffers (Full Resolution)
let _readFbo = null;
let _writeFbo = null;

class PostProcess {
	/**
	 * What the frame being drawn looks like, for passes that need more than
	 * the image: { modelView, projection, light, lights, tick, near, far }.
	 * Set by MapRenderer before render().
	 */
	static scene = null;

	/**
	 * Register module in pass priority order and init
	 * @param {ShaderModule} module - Post Process Modular effect.
	 * @param {WebGLRenderingContext} gl - The WebGL context.
	 */
	static register(module, gl) {
		if (!module.program || !module.isActive || !module.init || !module.render || !module.clean) {
			console.error('[PostProcess] Incorrect modular Post-Process format registered - please Fix');
			return;
		}
		_gl = gl;
		_effects.push(module);
		module.init(gl);
	}

	/**
	 * Register the external passes here, in the order they were added.
	 * @param {WebGLRenderingContext} gl - The WebGL context.
	 */
	static registerExternal(gl) {
		_gl = gl;
		_externalAt = _effects.length;
		_external.forEach(module => {
			_effects.push(module);
			module.init(gl);
		});
	}

	/**
	 * Add a pass from outside the renderer -- a client plugin. Same module
	 * format as register(); it runs where registerExternal was called, and
	 * stays across map changes until removeExternal.
	 * @param {ShaderModule} module
	 */
	static addExternal(module) {
		if (!module || !module.program || !module.isActive || !module.init || !module.render || !module.clean) {
			console.error('[PostProcess] Incorrect modular Post-Process format added - please Fix');
			return;
		}
		if (_external.includes(module)) {
			return;
		}
		_external.push(module);
		if (_gl && _externalAt >= 0) {
			_effects.splice(_externalAt + _external.length - 1, 0, module);
			module.init(_gl);
		}
	}

	/**
	 * Remove a pass added with addExternal.
	 * @param {ShaderModule} module
	 */
	static removeExternal(module) {
		_external = _external.filter(m => m !== module);
		const index = _effects.indexOf(module);
		if (index >= 0) {
			_effects.splice(index, 1);
			if (_gl) {
				module.clean(_gl);
			}
		}
	}

	/**
	 * The scene's depth buffer as a texture, for a pass that needs distance
	 * (fog, depth of field). Null outside the passes, or on WebGL 1.
	 * @return {WebGLTexture|null}
	 */
	static sceneDepth() {
		return _sceneDepth;
	}

	/**
	 * Prepare the pipeline for the scene rendering.
	 * Always binds a full-resolution buffer to ensure the 3D scene is sharp.
	 * @param {WebGLRenderingContext} gl - The WebGL context.
	 */
	static prepare(gl) {
		_activeEffects = _effects.filter(e => e.isActive());

		// Ensure global buffers exist and match canvas size
		this.validateBuffers(gl);

		if (_activeEffects.length > 0) {
			// Render the scene into the write buffer (which becomes read buffer in .render())
			PostProcess.beforeRenderPass(gl, _writeFbo);
		} else {
			// No effects? Render directly to screen
			PostProcess.beforeRenderPass(gl, null);
		}
	}

	/**
	 * Executes the post-processing pipeline using Ping-Pong swapping.
	 * @param {WebGLRenderingContext} gl - The WebGL context.
	 */
	static render(gl) {
		if (_activeEffects.length === 0) {
			return;
		}

		// The buffer we just drew the 3D scene into (_writeFbo) becomes the source (_readFbo)
		this.swapBuffers();

		// The passes draw full-screen quads. With the depth test off and depth
		// left uncleared (beforeRenderPass), the scene's depth survives them
		// all, for any pass that reads it.
		_sceneDepth = _readFbo ? _readFbo.depthTexture || null : null;
		_inPasses = true;
		const depthTest = gl.isEnabled(gl.DEPTH_TEST);
		gl.disable(gl.DEPTH_TEST);

		for (let i = 0; i < _activeEffects.length; i++) {
			const effect = _activeEffects[i];
			const isLast = i === _activeEffects.length - 1;

			// Destination: Screen (null) if last, otherwise the next offscreen buffer
			const targetFbo = isLast ? null : _writeFbo;

			// Render the effect: Source (Read) -> Effect Logic -> Destination (Write)
			effect.render(gl, _readFbo.texture, targetFbo);

			// If not the last effect, swap buffers so the output becomes the input for the next one
			if (!isLast) {
				this.swapBuffers();
			}
		}

		_inPasses = false;
		_sceneDepth = null;
		if (depthTest) {
			gl.enable(gl.DEPTH_TEST);
		}
	}
	/**
	 * Set up the FBO and viewport for the next render pass
	 * @param {WebGLRenderingContext} gl - The WebGL context.
	 * @param {Object} outputFbo - The FBO to render to.
	 */
	static beforeRenderPass(gl, outputFbo) {
		if (outputFbo !== null) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, outputFbo.framebuffer);
			gl.viewport(0, 0, outputFbo.width, outputFbo.height);
		} else {
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
		}
		gl.clear(_inPasses ? gl.COLOR_BUFFER_BIT : gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	}

	/**
	 * Cleans up bindings
	 */
	static afterRenderPass(gl) {
		gl.useProgram(null);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	/**
	 * Swaps the read and write FBO references.
	 */
	static swapBuffers() {
		const temp = _readFbo;
		_readFbo = _writeFbo;
		_writeFbo = temp;
	}

	/**
	 * Ensures Ping-Pong buffers are created and resized if necessary.
	 */
	static validateBuffers(gl) {
		const scale = GraphicsSettings.performanceMode ? 0.75 : 1.0;
		const scaledWidth = Math.floor(gl.canvas.width * scale);
		const scaledHeight = Math.floor(gl.canvas.height * scale);

		if (!_readFbo || _readFbo.width !== scaledWidth || _readFbo.height !== scaledHeight) {
			_readFbo = this.createFbo(gl, scaledWidth, scaledHeight, _readFbo);
			_writeFbo = this.createFbo(gl, scaledWidth, scaledHeight, _writeFbo);
		}
	}

	/**
	 * restart Modules when crashs
	 */
	static restartModules(gl) {
		_activeEffects.forEach(module => {
			module.clean(gl);
			module.init(gl);
		});
		_activeEffects = [];

		// Physically delete Ping-Pong buffers from GPU memory
		if (_readFbo) {
			if (gl.isTexture(_readFbo.texture)) {
				gl.deleteTexture(_readFbo.texture);
			}
			if (gl.isRenderbuffer(_readFbo.rbo)) {
				gl.deleteRenderbuffer(_readFbo.rbo);
			}
			if (_readFbo.depthTexture && gl.isTexture(_readFbo.depthTexture)) {
				gl.deleteTexture(_readFbo.depthTexture);
			}
			if (gl.isFramebuffer(_readFbo.framebuffer)) {
				gl.deleteFramebuffer(_readFbo.framebuffer);
			}
		}

		if (_writeFbo) {
			if (gl.isTexture(_writeFbo.texture)) {
				gl.deleteTexture(_writeFbo.texture);
			}
			if (gl.isRenderbuffer(_writeFbo.rbo)) {
				gl.deleteRenderbuffer(_writeFbo.rbo);
			}
			if (_writeFbo.depthTexture && gl.isTexture(_writeFbo.depthTexture)) {
				gl.deleteTexture(_writeFbo.depthTexture);
			}
			if (gl.isFramebuffer(_writeFbo.framebuffer)) {
				gl.deleteFramebuffer(_writeFbo.framebuffer);
			}
		}

		_readFbo = null;
		_writeFbo = null;
	}

	/**
	 * Recreates the FBO when the window size changes
	 */
	static recreateFbo(gl, width, height) {
		const scale = GraphicsSettings.performanceMode ? 0.75 : 1.0;
		const scaledWidth = Math.floor(width * scale);
		const scaledHeight = Math.floor(height * scale);

		// Recreate global buffers
		_readFbo = this.createFbo(gl, scaledWidth, scaledHeight, _readFbo);
		_writeFbo = this.createFbo(gl, scaledWidth, scaledHeight, _writeFbo);

		// Notify modules to recreate their internal buffers (if any)
		_effects.forEach(module => {
			if (module.recreateFbo) {
				module.recreateFbo(gl, scaledWidth, scaledHeight);
			}
		});
	}

	/**
	 * Clean current registered modules
	 */
	static clean(gl) {
		_effects.forEach(module => module.clean(gl));
		_effects = [];
		_activeEffects = [];
		_externalAt = -1;

		// Physically delete Ping-Pong buffers from GPU memory
		if (_readFbo) {
			if (gl.isTexture(_readFbo.texture)) {
				gl.deleteTexture(_readFbo.texture);
			}
			if (gl.isRenderbuffer(_readFbo.rbo)) {
				gl.deleteRenderbuffer(_readFbo.rbo);
			}
			if (_readFbo.depthTexture && gl.isTexture(_readFbo.depthTexture)) {
				gl.deleteTexture(_readFbo.depthTexture);
			}
			if (gl.isFramebuffer(_readFbo.framebuffer)) {
				gl.deleteFramebuffer(_readFbo.framebuffer);
			}
		}

		if (_writeFbo) {
			if (gl.isTexture(_writeFbo.texture)) {
				gl.deleteTexture(_writeFbo.texture);
			}
			if (gl.isRenderbuffer(_writeFbo.rbo)) {
				gl.deleteRenderbuffer(_writeFbo.rbo);
			}
			if (_writeFbo.depthTexture && gl.isTexture(_writeFbo.depthTexture)) {
				gl.deleteTexture(_writeFbo.depthTexture);
			}
			if (gl.isFramebuffer(_writeFbo.framebuffer)) {
				gl.deleteFramebuffer(_writeFbo.framebuffer);
			}
		}
		_readFbo = null;
		_writeFbo = null;
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	}

	/**
	 * Creates or validates an existing FBO by comparing dimensions.
	 * @param {WebGLRenderingContext} gl
	 * @param {number} width - Desired width
	 * @param {number} height - Desired height
	 * @param {Object} fbo - Current FBO object (if it exists)
	 * @param {number} downsampleFactor - Multiplier for resolution (default 1.0)
	 * @returns {Object|null} New FBO object or the current one if still valid
	 */
	static createFbo(gl, width, height, fbo, downsampleFactor = 1.0) {
		const targetWidth = Math.floor(width * downsampleFactor);
		const targetHeight = Math.floor(height * downsampleFactor);

		try {
			if (!fbo || fbo.width !== targetWidth || fbo.height !== targetHeight) {
				return this.createFramebuffer(gl, targetWidth, targetHeight, fbo);
			}
			return fbo;
		} catch (e) {
			console.error('Failed to create PostProcess FBOs:', e);
			return null;
		}
	}

	/**
	 * Physically creates the Framebuffer, Texture, and Renderbuffer in WebGL.
	 * @param {WebGLRenderingContext} gl
	 * @param {number} width
	 * @param {number} height
	 * @param {Object} oldfbo - Old object for resource cleanup
	 * @returns {Object|null}
	 */
	static createFramebuffer(gl, width, height, oldfbo) {
		try {
			if (oldfbo) {
				// Free old resources to prevent memory leaks
				if (gl.isTexture(oldfbo.texture)) {
					gl.deleteTexture(oldfbo.texture);
				}
				if (gl.isRenderbuffer(oldfbo.rbo)) {
					gl.deleteRenderbuffer(oldfbo.rbo);
				}
				if (oldfbo.depthTexture && gl.isTexture(oldfbo.depthTexture)) {
					gl.deleteTexture(oldfbo.depthTexture);
				}
				if (gl.isFramebuffer(oldfbo.framebuffer)) {
					gl.deleteFramebuffer(oldfbo.framebuffer);
				}
			}

			const fbo = gl.createFramebuffer();
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

			// Setup Texture where the scene will be drawn
			const texture = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, width, height, 0, gl.RGB, gl.UNSIGNED_BYTE, null);

			// Parameters to avoid distortions
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

			// Depth (Z-buffer). On WebGL 2 a texture, so a pass can read the
			// scene's depth (sceneDepth); on WebGL 1 a renderbuffer, as before.
			let rbo = null;
			let depthTexture = null;
			if (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) {
				depthTexture = gl.createTexture();
				gl.bindTexture(gl.TEXTURE_2D, depthTexture);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, width, height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
				gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);
			} else {
				rbo = gl.createRenderbuffer();
				gl.bindRenderbuffer(gl.RENDERBUFFER, rbo);
				gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
				gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rbo);
			}

			// Validate Framebuffer state
			const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
			if (status !== gl.FRAMEBUFFER_COMPLETE) {
				throw new Error('WebGL::createFramebuffer() - Incomplete Framebuffer! Status: ' + status);
			}

			// Clean up bindings
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.bindTexture(gl.TEXTURE_2D, null);
			gl.bindRenderbuffer(gl.RENDERBUFFER, null);

			return {
				framebuffer: fbo,
				texture: texture,
				rbo: rbo,
				depthTexture: depthTexture,
				width: width,
				height: height
			};
		} catch (e) {
			console.error('WebGL::createFramebuffer failed (likely OOM or context loss):', e);
			// Clean up partially created resources
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.bindTexture(gl.TEXTURE_2D, null);
			gl.bindRenderbuffer(gl.RENDERBUFFER, null);
			return null;
		}
	}
}
export default PostProcess;
