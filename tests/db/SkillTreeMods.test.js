import { describe, it, expect } from 'vitest';

import { resetHiddenSkills, hideSkill, withoutHiddenSkills, placeSkill } from 'DB/Skills/SkillTreeMods.js';

// A mod's skilltreeview.lub: SKILL_TREEVIEW_FOR_JOB and SKILL_TREEVIEW_HIDE.
describe('placeSkill', () => {
	it("puts a mod's skill on the slot it names", () => {
		const tree = { 1: { list: 4, beforeJob: null, 100: 0 } };
		expect(placeSkill(tree, 1, 3, 3100)).toBe(true);
		expect(tree[1][3100]).toBe(3);
		expect(tree[1][100]).toBe(0);
	});

	it('moves the skill that was on that slot to the first free one', () => {
		const tree = { 1: { list: 4, beforeJob: null, 100: 0, 101: 1, 102: 2 } };
		placeSkill(tree, 1, 1, 3100);
		expect(tree[1]).toMatchObject({ 100: 0, 3100: 1, 102: 2, 101: 3 });
	});

	it('moves a skill the mod places again, without disturbing the rest', () => {
		const tree = { 1: { list: 4, beforeJob: null, 100: 0, 3100: 5 } };
		placeSkill(tree, 1, 6, 3100);
		expect(tree[1]).toMatchObject({ 100: 0, 3100: 6 });
	});

	it('leaves list and beforeJob alone', () => {
		const tree = { 1: { list: 4, beforeJob: 2, 100: 4 } };
		placeSkill(tree, 1, 4, 3100);
		expect(tree[1].list).toBe(4);
		expect(tree[1].beforeJob).toBe(2);
		expect(tree[1][100]).toBe(0);
	});

	it('refuses a job the client has no tree for', () => {
		const tree = {};
		expect(placeSkill(tree, 9999, 0, 3100)).toBe(false);
		expect(tree).toEqual({});
	});

	// Job 2's tab also shows job 1's skills: the same list.
	const sharedTab = () => ({
		1: { list: 1, beforeJob: null, 1: 0, 2: 1 },
		2: { list: 1, beforeJob: 1, 200: 2 }
	});

	it("moves a job's own skill past the slots an earlier job fills in the same tab", () => {
		const tree = sharedTab();
		placeSkill(tree, 2, 2, 3100);
		expect(tree[2]).toMatchObject({ 3100: 2, 200: 3 });
		expect(tree[1]).toEqual({ list: 1, beforeJob: null, 1: 0, 2: 1 });
	});

	it("does not take a slot an earlier job's skill fills in the same tab", () => {
		const tree = sharedTab();
		placeSkill(tree, 2, 0, 3100);
		expect(tree[2]).toMatchObject({ 3100: 3, 200: 2 });
		expect(tree[1]).toEqual({ list: 1, beforeJob: null, 1: 0, 2: 1 });
	});

	it('ignores earlier jobs on another tab', () => {
		const tree = { 1: { list: 1, beforeJob: null, 5: 0 }, 2: { list: 2, beforeJob: 1 } };
		placeSkill(tree, 2, 0, 3100);
		expect(tree[2][3100]).toBe(0);
	});

	it('places the skill for the job named only, when jobs share one entry', () => {
		const shared = { list: 3, beforeJob: null, 10: 0 };
		const tree = { 1: shared, 2: shared };
		placeSkill(tree, 1, 1, 3100);
		expect(tree[1][3100]).toBe(1);
		expect(tree[2][3100]).toBeUndefined();
		expect(shared[3100]).toBeUndefined();
	});
});

describe('hidden skills', () => {
	it("takes a hidden skill out of every tab of that job's window", () => {
		resetHiddenSkills();
		hideSkill(4059, 2023);
		const positions = [];
		positions[2] = { 2023: 7, 136: 2 };
		positions[3] = { 2023: 9, 2022: 0 };
		withoutHiddenSkills(positions, 4059);
		expect(positions[2]).toEqual({ 136: 2 });
		expect(positions[3]).toEqual({ 2022: 0 });
	});

	it('leaves other jobs alone', () => {
		resetHiddenSkills();
		hideSkill(4059, 2023);
		const positions = [];
		positions[3] = { 2023: 9 };
		withoutHiddenSkills(positions, 4065);
		expect(positions[3]).toEqual({ 2023: 9 });
	});

	it('takes a job id and a skill id as Lua passes them', () => {
		resetHiddenSkills();
		hideSkill('4059', '2023');
		const positions = [{ 2023: 1 }];
		withoutHiddenSkills(positions, 4059);
		expect(positions[0]).toEqual({});
	});

	it('starts empty again after a reset', () => {
		resetHiddenSkills();
		hideSkill(4059, 2023);
		resetHiddenSkills();
		const positions = [{ 2023: 1 }];
		withoutHiddenSkills(positions, 4059);
		expect(positions[0]).toEqual({ 2023: 1 });
	});
});
