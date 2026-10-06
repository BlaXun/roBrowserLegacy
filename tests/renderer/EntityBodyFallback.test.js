import { describe, expect, it, vi, beforeEach } from 'vitest';

// Bodies are named after their job id; the fallbacks are whatever the test sets.
const fallbacks = {};
vi.mock('DB/DBManager.js', async () => {
	const DB = {
		getBodyPath: id => `npc/${id}`,
		getBodyFallbackPaths: id => fallbacks[id] || [],
		isNPC: () => true
	};
	return { default: new Proxy(DB, { get: (t, k) => (k in t ? t[k] : () => null) }) };
});

// A client whose data has only the files in `present`. Answers come back in the
// order `respond` releases them, so a test can make one file answer late.
const present = new Set();
const requests = [];
let queue = null;
vi.mock('Core/Client.js', () => ({
	default: {
		loadFile: vi.fn((path, onLoad, onError) => {
			requests.push(path);
			const answer = () => (present.has(path) ? onLoad && onLoad({}) : onError && onError("Can't get file"));
			if (queue) {
				queue.push([path, answer]);
			} else {
				answer();
			}
		})
	}
}));
vi.mock('DB/Monsters/ShadowTable.js', () => ({ default: {} }));
vi.mock('Network/PacketVerManager.js', () => ({ default: { value: 20221005 } }));
vi.mock('Renderer/GR2/GR2ModelRenderer.js', () => ({ default: {} }));
vi.mock('Renderer/Entity/EntityAction.js', () => ({ default: vi.fn() }));

const { default: EntityViewInit } = await import('Renderer/Entity/EntityView.js');

function npc(job) {
	const e = { _job: 0, _sex: 1, _bodypalette: 0, sound: {} };
	EntityViewInit.call(e);
	e.job = job;
	return e;
}

function has(...bodies) {
	for (const body of bodies) {
		present.add(body + '.spr');
		present.add(body + '.act');
	}
}

beforeEach(() => {
	present.clear();
	requests.length = 0;
	queue = null;
	for (const k in fallbacks) delete fallbacks[k];
});

describe('EntityView body fallbacks', () => {
	it('draws the body the tables name when the client has it', () => {
		fallbacks[10243] = ['npc/874', 'npc/46'];
		has('npc/10243', 'npc/874');
		const e = npc(10243);
		expect(e.files.body.spr).toBe('npc/10243.spr');
		expect(e.files.body.act).toBe('npc/10243.act');
		expect(requests.filter(p => p.startsWith('npc/874'))).toEqual([]);
	});

	it('draws the first stand-in the client has when the body is missing', () => {
		fallbacks[10243] = ['npc/874', 'npc/46'];
		has('npc/874', 'npc/46');
		const e = npc(10243);
		expect(e.files.body.spr).toBe('npc/874.spr');
		expect(e.files.body.act).toBe('npc/874.act');
	});

	it('moves on when only the .act is missing', () => {
		fallbacks[10243] = ['npc/46'];
		has('npc/46');
		present.add('npc/10243.spr');
		const e = npc(10243);
		expect(e.files.body.spr).toBe('npc/46.spr');
		expect(e.files.body.act).toBe('npc/46.act');
	});

	it('ignores a late answer about a body it already gave up on', () => {
		fallbacks[10243] = ['npc/46'];
		has('npc/46');
		present.add('npc/10243.spr');
		queue = [];
		const e = npc(10243);
		// The .act fails first; the .spr of the same body loads after it.
		const take = path => queue.splice(queue.findIndex(([p]) => p === path), 1)[0][1]();
		take('npc/10243.act');
		take('npc/10243.spr');
		expect(e.files.body.spr).toBe(null);
		take('npc/46.act');
		take('npc/46.spr');
		expect(e.files.body.spr).toBe('npc/46.spr');
	});

	it('leaves the body empty only when nothing loads', () => {
		fallbacks[10243] = ['npc/46'];
		const e = npc(10243);
		expect(e.files.body.spr).toBe(null);
		expect(requests).toEqual(['npc/10243.act', 'npc/46.act']);
	});

	it('asks for both files of a body before either answers', () => {
		fallbacks[10243] = ['npc/46'];
		has('npc/46');
		queue = [];
		const e = npc(10243);
		expect(requests).toEqual(['npc/10243.act', 'npc/10243.spr']);
		while (queue.length) queue.shift()[1]();
		expect(e.files.body.spr).toBe('npc/46.spr');
	});
});
