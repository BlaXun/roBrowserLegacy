import { describe, it, expect, vi, beforeEach } from 'vitest';

const added = [];
vi.mock('Renderer/Effects/StrEffect.js', () => ({
	default: class {
		constructor(filename, position, startTick, texturePath) {
			Object.assign(this, { filename, position, startTick, texturePath });
		}
		renderAnimation(gl, material, animat) {
			this.drawn = animat;
		}
	}
}));
vi.mock('Renderer/EffectManager.js', () => ({ default: { add: (effect, params) => added.push({ effect, params }) } }));
vi.mock('Renderer/EntityManager.js', () => ({ default: { get: () => owner } }));
vi.mock('Renderer/Map/Altitude.js', () => ({ default: { getCellHeight: () => 0 } }));
vi.mock('Renderer/SpriteRenderer.js', () => ({ default: { runWithDepth: (t, m, c, fn) => fn() } }));
vi.mock('Core/Client.js', () => ({ default: { loadFile: () => {} } }));
vi.mock('Utils/WebGL.js', () => ({ default: {} }));
vi.mock('Renderer/Camera.js', () => ({ default: { modelView: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } }));

let owner;
import {
	strideReached,
	printPosition,
	screenAngle,
	decalCorners,
	decalAlpha,
	FootprintDecal,
	FootprintStrEffect,
	FootprintTrail,
	startFootprints
} from 'Renderer/Effects/Footprints.js';

const PANDA = {
	type: 4,
	strBottomLeft: 'footprint_panda\\bottom.str',
	strBottomRight: 'footprint_panda\\bottom.str',
	strTopLeft: 'footprint_panda\\top.str',
	strTopRight: 'footprint_panda\\top.str',
	scaleBottom: 0.04,
	scaleTop: 0.11,
	heightTop: 0,
	stride: 50,
	gap: 2,
	isAdjustAngle: true
};

beforeEach(() => {
	added.length = 0;
	owner = { GID: 7, position: [10, 10, 0] };
});

describe('footprint geometry', () => {
	it("drops a print once the squared distance in world units passes the stride", () => {
		// Stride 50: the square root of 50 world units is 1.414 cells.
		expect(strideReached([0, 0, 0], [1.41, 0, 0], 50)).toBe(false);
		expect(strideReached([0, 0, 0], [1.42, 0, 0], 50)).toBe(true);
	});

	it('stands each print the gap to one side of the line walked', () => {
		// Walking north, left is west; gap 2 is 0.4 of a cell.
		expect(printPosition([0, 0], [0, 1], 2, true)).toEqual([-0.4, 1]);
		expect(printPosition([0, 0], [0, 1], 2, false)).toEqual([0.4, 1]);
	});

	it('turns a print drawn walking up the screen to the direction walked on screen', () => {
		const flat = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0]; // the ground's y runs up the screen
		expect(screenAngle([0, 0], [0, 1], flat)).toBeCloseTo(0); // up
		expect(screenAngle([0, 0], [1, 0], flat)).toBeCloseTo(-90); // right: a quarter turn clockwise
		expect(screenAngle([0, 0], [-1, 0], flat)).toBeCloseTo(90);
	});
});

describe('PNG prints', () => {
	it('lays a square 2 * scale world units across, its top to the step, on the ground', () => {
		// Scale 5: a cell from the centre to each side. Walking north from cell
		// 10, 10, the top runs along y + 1 and the left along x - 1.
		const c = decalCorners([10, 10], [10, 8], [10, 10], 5, (x, y) => x / 10);
		const corner = i => Array.from(c.subarray(i * 3, i * 3 + 3));
		// Drawn at x + 0.5, -(height + 0.4), y + 0.5.
		expect(corner(0)[0]).toBeCloseTo(9.5); // top left
		expect(corner(0)[2]).toBeCloseTo(11.5);
		expect(corner(0)[1]).toBeCloseTo(-(0.9 + 0.4)); // its own ground, plus the lift
		expect(corner(1)[0]).toBeCloseTo(11.5); // top right
		expect(corner(1)[1]).toBeCloseTo(-(1.1 + 0.4));
		expect(corner(3)[2]).toBeCloseTo(9.5); // bottom right
		// Walking east, the top faces east and the right is south.
		const e = decalCorners([0, 0], [-1, 0], [0, 0], 5, () => 0);
		expect(Array.from(e.subarray(3, 6)).map(v => Math.round(v * 10) / 10)).toEqual([1.5, -0.4, -0.5]);
	});

	it('fades from its alpha out of 255 to nothing over its duration in seconds', () => {
		expect(decalAlpha(250, 10, 0)).toBeCloseTo(250 / 255);
		expect(decalAlpha(250, 10, 5000)).toBeCloseTo(125 / 255);
		expect(decalAlpha(250, 10, 12000)).toBe(0);
	});

	it('drops the left and right PNGs in turn at the owner\'s feet', () => {
		const BASE = { type: 3, pngLeft: 'footprint0.png', pngRight: 'footprint1.png', pngScale: 5, pngAlpha: 250, pngDuration: 10, stride: 50, gap: 2 };
		const trail = new FootprintTrail(owner, BASE);
		owner.position = [10, 12, 0];
		trail.render(null, 100);
		owner.position = [10, 14, 0];
		trail.render(null, 200);
		expect(added).toHaveLength(2);
		const [a, b] = added.map(x => x.effect);
		expect(a).toBeInstanceOf(FootprintDecal);
		expect(a.filename).toBe('data/texture/effect/footprint0.png');
		expect(b.filename).toBe('data/texture/effect/footprint1.png');
		// Centred on the feet: the gap is in the art.
		expect((a.corners[0] + a.corners[3]) / 2).toBeCloseTo(10.5);
		expect([a.startTick, a.alpha, a.duration]).toEqual([100, 250, 10]);
		expect(added[0].params.Init.ownerAID).toBeNull();
	});

	it('ends a print once it has faded', () => {
		const d = new FootprintDecal('footprint0.png', new Float32Array(12), 0, 250, 10);
		d.render(null, 10000);
		expect(d.needCleanUp).toBe(true);
	});
});

describe('FootprintStrEffect', () => {
	it('scales and turns each frame about the centre', () => {
		const e = new FootprintStrEffect('f.str', [0, 0, 0], 0, '', 0.5, 90);
		e.renderAnimation(null, null, { xy: [2, 4], pos: [330, 320], angle: 10 });
		expect(e.drawn.xy).toEqual([1, 2]);
		// 10 px right of centre, halved, then a quarter turn counter-clockwise: up.
		expect(e.drawn.pos[0]).toBeCloseTo(320);
		expect(e.drawn.pos[1]).toBeCloseTo(315);
		expect(e.drawn.angle).toBe(100);
	});
});

describe('FootprintTrail', () => {
	it('starts as a hat effect that removeHatEffect can take off', () => {
		const entity = { GID: 7, position: [1, 2, 0] };
		expect(startFootprints(entity, 245, PANDA)).toBe(true);
		expect(added[0].params).toEqual({ Inst: { effectID: 'footprint-245' }, Init: { ownerAID: 7 } });
		expect(entity._hatEffects[245]).toEqual({ type: 'effect', effectTableId: 'footprint-245' });
		expect(startFootprints(entity, 9999, null)).toBe(false);
	});

	it('drops a bottom and a top STR per step, alternating feet, at the client scale', () => {
		const trail = new FootprintTrail(owner, PANDA);
		expect(trail.ready).toBe(true);
		trail.render(null, 0);
		expect(added).toHaveLength(0);
		owner.position = [10, 12, 0];
		trail.render(null, 100);
		expect(added).toHaveLength(2);
		const [bottom, top] = added.map(a => a.effect);
		expect(bottom.filename).toBe('data/texture/effect/footprint_panda/bottom.str');
		expect(bottom.texturePath).toBe('footprint_panda/');
		expect(bottom.scale).toBeCloseTo(0.04 * 7);
		expect(top.scale).toBeCloseTo(0.11 * 7);
		expect(bottom.position[0]).toBeCloseTo(9.6); // left of walking north
		expect(added[0].params.Init.ownerAID).toBeNull();
		owner.position = [10, 14, 0];
		trail.render(null, 200);
		expect(added[2].effect.position[0]).toBeCloseTo(10.4); // then the right foot
	});

	it('leaves out a part whose scale is 0', () => {
		const trail = new FootprintTrail(owner, { ...PANDA, scaleTop: 0 });
		owner.position = [10, 12, 0];
		trail.render(null, 0);
		expect(added).toHaveLength(1);
	});

	it('ends when its owner is gone', () => {
		const trail = new FootprintTrail(owner, PANDA);
		owner = { GID: 8, position: [0, 0, 0] };
		trail.render(null, 0);
		expect(trail.needCleanUp).toBe(true);
	});
});
