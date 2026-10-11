import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('Preferences/Graphics.js', () => ({ default: { performanceMode: false } }));

// A context that accepts any call; constants are numbers, and every
// framebuffer reads as complete.
function fakeGL() {
	const calls = {};
	const target = { canvas: { width: 800, height: 600 } };
	return new Proxy(target, {
		get(obj, name) {
			if (name in obj) {
				return obj[name];
			}
			if (typeof name === 'string' && /^[A-Z0-9_]+$/.test(name)) {
				return name === 'FRAMEBUFFER_COMPLETE' ? 1 : 0;
			}
			if (name === 'checkFramebufferStatus') {
				return () => 1;
			}
			return (...args) => {
				calls[name] = (calls[name] || 0) + 1;
				return name.startsWith('is') ? true : {};
			};
		}
	});
}

function pass(active, extra = {}) {
	const module = {
		active,
		program: vi.fn(),
		isActive: vi.fn(() => module.active),
		init: vi.fn(),
		render: vi.fn(),
		clean: vi.fn(),
		...extra
	};
	return module;
}

let PostProcess;

beforeEach(async () => {
	vi.resetModules();
	({ default: PostProcess } = await import('Renderer/Effects/PostProcess.js'));
});

function registerAll(gl, modules) {
	if (PostProcess.isRegistered()) {
		return;
	}
	modules.forEach(module => PostProcess.register(module, gl));
	PostProcess.registerExternal(gl);
}

describe('PostProcess set-up', () => {
	it('sets up a built-in pass only once it is active', () => {
		const gl = fakeGL();
		const on = pass(true);
		const off = pass(false);
		registerAll(gl, [on, off]);

		expect(on.init).not.toHaveBeenCalled();
		expect(off.init).not.toHaveBeenCalled();

		PostProcess.prepare(gl);
		PostProcess.prepare(gl);
		expect(on.init).toHaveBeenCalledTimes(1);
		expect(off.init).not.toHaveBeenCalled();

		off.active = true;
		PostProcess.prepare(gl);
		expect(off.init).toHaveBeenCalledTimes(1);
	});

	it('keeps passes registered and set up across map changes', () => {
		const gl = fakeGL();
		const on = pass(true);
		registerAll(gl, [on]);
		PostProcess.prepare(gl);

		// The next map registers again: nothing is rebuilt or added twice
		registerAll(gl, [on]);
		PostProcess.prepare(gl);
		expect(on.init).toHaveBeenCalledTimes(1);
		expect(on.clean).not.toHaveBeenCalled();
	});

	it('sets up an external pass when it is added, active or not', () => {
		const gl = fakeGL();
		const early = pass(false);
		PostProcess.addExternal(early);
		expect(early.init).not.toHaveBeenCalled();

		registerAll(gl, [pass(false)]);
		expect(early.init).toHaveBeenCalledTimes(1);

		const late = pass(false);
		PostProcess.addExternal(late);
		expect(late.init).toHaveBeenCalledTimes(1);

		PostProcess.removeExternal(late);
		expect(late.clean).toHaveBeenCalledTimes(1);
	});

	it('cleans only passes that were set up', () => {
		const gl = fakeGL();
		const on = pass(true);
		const off = pass(false);
		registerAll(gl, [on, off]);
		PostProcess.prepare(gl);

		PostProcess.clean(gl);
		expect(on.clean).toHaveBeenCalledTimes(1);
		expect(off.clean).not.toHaveBeenCalled();
		expect(PostProcess.isRegistered()).toBe(false);
	});

	it('rebuilds after a context loss: externals at once, built-ins when active', () => {
		const gl = fakeGL();
		const on = pass(true);
		const external = pass(false);
		PostProcess.addExternal(external);
		registerAll(gl, [on]);
		PostProcess.prepare(gl);

		PostProcess.restartModules(gl);
		expect(on.clean).toHaveBeenCalledTimes(1);
		expect(external.clean).toHaveBeenCalledTimes(1);
		expect(external.init).toHaveBeenCalledTimes(2);
		expect(on.init).toHaveBeenCalledTimes(1);

		PostProcess.prepare(gl);
		expect(on.init).toHaveBeenCalledTimes(2);
	});

	it('resizes only passes that were set up', () => {
		const gl = fakeGL();
		const on = pass(true, { recreateFbo: vi.fn() });
		const off = pass(false, { recreateFbo: vi.fn() });
		registerAll(gl, [on, off]);
		PostProcess.prepare(gl);

		PostProcess.recreateFbo(gl, 1024, 768);
		expect(on.recreateFbo.mock.calls[0].slice(1)).toEqual([1024, 768]);
		expect(off.recreateFbo).not.toHaveBeenCalled();
	});
});
