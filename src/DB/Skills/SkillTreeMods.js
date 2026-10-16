/**
 * DB/Skills/SkillTreeMods.js
 *
 * Mods' skill trees over the client's: where a mod's skilltreeview.lub puts
 * its skills (SKILL_TREEVIEW_FOR_JOB), and which skills it takes out of a
 * job's window (SKILL_TREEVIEW_HIDE). DBManager.js reads the files
 * (loadCustomSkillTables); the skill window asks withoutHiddenSkills.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

const isSkill = key => /^\d+$/.test(key);

/**
 * The skills mods take away from a job's window, by job id: a mod's
 * skilltreeview.lub lists them in SKILL_TREEVIEW_HIDE when its server no
 * longer teaches them. Hidden in that job's window, and in the window of
 * every job whose skill tree takes that job's tab (getSkillPosition), the
 * way the server's own skill tree passes a removal down.
 */
const HiddenSkills = new Map();

/** Forget every hidden skill, before a client loads its mods' tables. */
function resetHiddenSkills() {
	HiddenSkills.clear();
}

/**
 * Hide a skill in a job's window.
 *
 * @param {number} jobId
 * @param {number} skillId
 */
function hideSkill(jobId, skillId) {
	const job = Number(jobId);
	if (!HiddenSkills.has(job)) {
		HiddenSkills.set(job, new Set());
	}
	HiddenSkills.get(job).add(String(skillId));
}

/**
 * A job's window, without the skills hidden for that job. `positions` is
 * what the window lays out: one object per tab, skill id to slot.
 *
 * @param {Array<object>} positions - changed in place
 * @param {number} jobId
 * @return {Array<object>} positions
 */
function withoutHiddenSkills(positions, jobId) {
	const hidden = HiddenSkills.get(Number(jobId));
	if (!hidden) {
		return positions;
	}
	positions.forEach(items => {
		if (items) {
			for (const skillId of hidden) {
				delete items[skillId];
			}
		}
	});
	return positions;
}

/**
 * The slots the jobs before `jobId` fill in its tab. The skill window shows a
 * job's skills and its predecessors' in one tab when they share a `list`: a
 * first job's with the Novice's, a transcendent second job's with the second
 * job's (getSkillPosition).
 *
 * @param {object} tree - SkillTreeView
 * @param {number} jobId
 * @return {Set<number>} slots
 */
function slotsBefore(tree, jobId) {
	const entry = tree[jobId];
	const slots = new Set();
	const seen = new Set([String(jobId)]);
	let before = entry.beforeJob;
	while (before !== null && before !== undefined && !seen.has(String(before)) && tree[before]) {
		seen.add(String(before));
		const parent = tree[before];
		if (parent.list === entry.list) {
			for (const key of Object.keys(parent)) {
				if (isSkill(key)) {
					slots.add(parent[key]);
				}
			}
		}
		before = parent.beforeJob;
	}
	return slots;
}

/**
 * Put a mod's skill on a slot of a job's tree. A skill of the job's own
 * already there moves to the first free slot, so the mod's gets the place it
 * asked for. A slot an earlier job's skill fills in the same tab is not the
 * mod's to take: that skill is shared with other jobs, so the mod's moves to
 * the first free slot instead.
 *
 * The job gets an entry of its own first: jobs can share one (the built-in
 * tree's duplicateEntry), and a mod places a skill for the jobs it names.
 *
 * @param {object} tree - SkillTreeView, changed in place
 * @param {number} jobId
 * @param {number} pos
 * @param {number} skillId
 * @return {boolean} false when the client has no tree for that job
 */
function placeSkill(tree, jobId, pos, skillId) {
	if (!tree[jobId]) {
		return false;
	}
	const entry = { ...tree[jobId] };
	tree[jobId] = entry;
	const id = String(skillId);
	const before = slotsBefore(tree, jobId);
	const firstFree = (...others) => {
		const taken = new Set([
			...before,
			...others,
			...Object.keys(entry)
				.filter(key => isSkill(key) && key !== id)
				.map(key => entry[key])
		]);
		let free = 0;
		while (taken.has(free)) {
			free++;
		}
		return free;
	};
	let slot = Number(pos);
	if (before.has(slot)) {
		slot = firstFree();
	}
	const occupant = Object.keys(entry).find(key => isSkill(key) && key !== id && entry[key] === slot);
	if (occupant !== undefined) {
		delete entry[occupant];
		entry[occupant] = firstFree(slot);
	}
	entry[id] = slot;
	return true;
}

export { resetHiddenSkills, hideSkill, withoutHiddenSkills, placeSkill };
