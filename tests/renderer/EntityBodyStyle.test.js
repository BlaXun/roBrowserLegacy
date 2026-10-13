import { afterEach, describe, expect, it, vi } from 'vitest';

import JobId from 'DB/Jobs/JobConst.js';
import ClassTable from 'DB/Jobs/JobNameTable.js';
import PalNameTable from 'DB/Jobs/PalNameTable.js';

vi.mock('DB/DBManager.js', () => {
	const DB = {
		getBodyPath: (id, sex, alt = -1) => `body${id}_${alt}`
	};
	// Anything else the view asks for is not under test.
	return { default: new Proxy(DB, { get: (t, k) => (k in t ? t[k] : () => null) }) };
});
// Holds every load until the test answers it, in the order the test picks.
const pending = [];
vi.mock('Core/Client.js', () => ({
	default: {
		loadFile: vi.fn((path, onLoad) => {
			pending.push([path, () => onLoad && onLoad({})]);
		})
	}
}));
vi.mock('DB/Monsters/ShadowTable.js', () => ({ default: {} }));
vi.mock('Network/PacketVerManager.js', () => ({ default: { value: 20221005 } }));
vi.mock('Renderer/GR2/GR2ModelRenderer.js', () => ({ default: {} }));
vi.mock('Renderer/Entity/EntityAction.js', () => ({ default: vi.fn() }));

const { default: EntityViewInit } = await import('Renderer/Entity/EntityView.js');

function entity(job) {
	const e = { _job: 0, _sex: 1, _bodypalette: 0, sound: {} };
	EntityViewInit.call(e);
	e.job = job;
	return e;
}

// Answers the loads of one body (its .act and .spr).
function answer(body) {
	const mine = pending.filter(([path]) => path.startsWith(body + '.'));
	for (const load of mine) {
		pending.splice(pending.indexOf(load), 1);
		load[1]();
	}
}

afterEach(() => {
	pending.length = 0;
	vi.useRealTimers();
});

describe('EntityView body style', () => {
	it('names the sprite and palette of every alternative outfit', () => {
		const missing = Object.keys(JobId)
			.filter(name => name.endsWith('_2ND'))
			.filter(name => !ClassTable[JobId[name]] || !PalNameTable[JobId[name]]);
		expect(missing).toEqual([]);
	});

	// 4336 is rAthena's JOB_ARCHBISHOP_2ND, the value the server works with.
	it("draws the Arch Bishop's own alternative outfit, not the Novice's", () => {
		expect(JobId.ARCHBISHOP_2ND).toBe(4336);
		expect(ClassTable[4336]).toBe(ClassTable[JobId.ARCHBISHOP]);
		expect(PalNameTable[4336]).toBe('costume_1/' + PalNameTable[JobId.ARCHBISHOP]);
	});

	// After a job change the server sends the new job, then the body style it
	// reset. The style the entity still had is applied to the new job first; a
	// slow answer for that costume must not draw it over the reset.
	it('keeps the newest body when an older load answers last', () => {
		vi.useFakeTimers();
		const warlock = entity(JobId.WARLOCK);
		answer(`body${JobId.WARLOCK}_-1`);
		warlock.body = 1;
		vi.advanceTimersByTime(50);
		warlock.body = 0;
		vi.advanceTimersByTime(50);

		const costume = `body${JobId.WARLOCK}_${JobId.WARLOCK_2ND}`;
		const plain = `body${JobId.WARLOCK}_0`;
		answer(plain);
		answer(costume);
		expect(warlock.files.body.spr).toBe(plain + '.spr');
	});

	it('draws the alternative outfit once its body loads', () => {
		vi.useFakeTimers();
		const warlock = entity(JobId.WARLOCK);
		answer(`body${JobId.WARLOCK}_-1`);
		warlock.body = 1;
		vi.advanceTimersByTime(50);

		answer(`body${JobId.WARLOCK}_${JobId.WARLOCK_2ND}`);
		expect(warlock.files.body.spr).toBe(`body${JobId.WARLOCK}_${JobId.WARLOCK_2ND}.spr`);
	});
});
