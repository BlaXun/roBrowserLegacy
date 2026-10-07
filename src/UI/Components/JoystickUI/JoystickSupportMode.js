/**
 * UI/Components/JoystickUI/JoystickSupportMode.js
 *
 * The Support target category: healing and buffing the party with the pad.
 *
 * - Right stick (aim or cursor mode): pushing it opens a radial below the
 *   character with yourself, the whole party (offline members greyed) and
 *   your homunculus / mercenary, each always in the same place. Holding the
 *   stick on a segment for a moment makes that member the focus; a skill
 *   pressed while the radial is open goes to the highlighted member. Letting
 *   the stick go, or B, closes the radial. The left stick keeps walking the
 *   whole time.
 * - D-pad left / right: step the focus through the members, lowest HP
 *   first.
 * - A support skill (Heal, Blessing, ...) goes to the focused member; a
 *   ground skill lands where the member stands. With nobody focused (or a
 *   focus the skill cannot take: Heal on the dead, Resurrection on the
 *   living) the radial opens with the skill pending, on yourself: choose a
 *   member with the right stick and confirm with A. The same shortcut again
 *   casts it on yourself, B cancels.
 *
 * With a skill pending, members it cannot take are greyed out and cannot
 * be chosen, members beyond its range are outlined orange (choosing one
 * walks you there first), and the SP circle shows what the skill will
 * cost. A new focus or a cast gives a short rumble.
 *
 * Each segment fills outward with the member's HP: green from 50 %, yellow
 * below, red under 30 %. The highlighted segment stands out from the ring.
 * The middle shows your own SP as a blue level rising from the bottom, and
 * its number. Members out of sight (another map, too far) or offline are
 * grey and cannot be picked: the client has no entity to cast on.
 *
 * The support focus is deliberately not the EntityManager focus. That is
 * the combat lock-on (X attacks it, onFocusEnd stops the attack), and a
 * party member must never end up there.
 */

import Session from 'Engine/SessionStorage.js';
import EntityManager from 'Renderer/EntityManager.js';
import Entity from 'Renderer/Entity/Entity.js';
import SpriteRenderer from 'Renderer/SpriteRenderer.js';
import Renderer from 'Renderer/Renderer.js';
import Camera from 'Renderer/Camera.js';
import Client from 'Core/Client.js';
import DB from 'DB/DBManager.js';
import PartyFriends from 'UI/Components/PartyFriends/PartyFriends.js';
import SkillTargetSelection from 'UI/Components/SkillTargetSelection/SkillTargetSelection.js';
import SkillInfo from 'DB/Skills/SkillInfo.js';
import SkillId from 'DB/Skills/SkillConst.js';
import Category from './JoystickTargetCategory.js';
import Aim from './JoystickAimMode.js';
import Cursor from './JoystickMouseCursorAdapter.js';

// Stick: a push past SELECT_MIN opens the radial and moves the highlight;
// back under RELEASE_MAX counts as let go (well above the deadzone, so a
// pad that rests slightly off centre still closes the radial). A segment
// becomes the focus once highlighted for SETTLE_MS, so sweeping the stick
// round the ring does not refocus every member on the way.
const SELECT_MIN = 0.5;
const RELEASE_MAX = 0.3;
const SETTLE_MS = 250;

// Radial, in CSS pixels
const R_INNER = 30;
const R_OUTER_MIN = 72;
const R_OUTER_PER_ENTRY = 2; // more members, a wider ring
const POP_OUT = 8; // the highlighted segment moves out from the centre this far
const SP_INSET = 4; // the SP circle sits this far inside the ring
const GAP_DEG = 2;
const ICON_SIZE = 30; // room for the headgear around the head
const BELOW_FEET = 28; // gap between the feet and the radial's top (room for the skill name)
const LABEL_ROOM = 24; // below the radial, for the member's name

const HP_GOOD = 0.5;
const HP_LOW = 0.3;
const COLOR_GOOD = '76, 175, 80';
const COLOR_MID = '255, 193, 7';
const COLOR_LOW = '244, 67, 54';
const FOCUS_RING = '76, 175, 80';
const SP_BACK = 'rgba(110, 110, 110, 0.55)';
const SP_FILL = 'rgba(48, 120, 255, 0.85)';
const SP_COST = 'rgba(150, 200, 255, 0.9)'; // the part of the level the pending skill uses
const SP_SHORT = '#ff6b6b'; // the SP number when the skill costs more than there is
const FAR_OUTLINE = 'rgba(255, 152, 0, 0.95)'; // beyond the pending skill's range

// Rumble: [strong, weak, ms]
const RUMBLE_FOCUS = [0, 0.35, 40];
const RUMBLE_CAST = [0.35, 0.6, 70];

// Skills that only take the dead
const REVIVE_SKILLS = [SkillId.ALL_RESURRECTION];

// Portraits: drawn into a scratch box, cropped to the opaque part
const PORTRAIT_BOX = 96;
const CELL_SHIFT = 0.5 * 35; // see docs/reference/guild/member-portrait.md
const PORTRAIT_RETRY_MS = 500;

let _overlay = null;
let _supportCtx = null;
let _drawn = false;

let _focusKey = null;

let _open = false;
let _highlight = -1;
let _highlightAt = 0;
let _picked = -1; // the segment the stick settled on in this push
let _pushed = false; // the stick was out past SELECT_MIN last frame
let _waitRest = false; // closed with B: stays closed until the stick is let go
let _entries = [];

let _pending = null; // { index, name } of the skill waiting for a member

const _portraits = new Map(); // GID -> { look, entity, canvas, ok, triedAt }
const _jobIcons = new Map(); // job -> Image | null (null: none in the data)

/**
 * Who the radial offers, in order: yourself (12 o'clock), the party members
 * in the party's own order, your homunculus, your mercenary. Nobody drops
 * out for being offline or out of sight (they are greyed instead), so each
 * keeps their place on the ring.
 *
 * @return {Array<object>} { key, kind, GID, name, job, entity, hp, hpMax, dead, offline, selectable }
 */
function getMembers() {
	const player = Session.Entity;
	if (!player) {
		return [];
	}

	const list = [describe('self', 'self', player.GID, player.display && player.display.name, player._job, null)];

	let party = [];
	try {
		party = (Session.hasParty && PartyFriends.getPartyMembers()) || [];
	} catch {
		party = [];
	}
	for (let i = 0; i < party.length; i++) {
		const member = party[i];
		if (member.AID === Session.AID || member.AID === player.GID) {
			continue;
		}
		list.push(describe('aid:' + member.AID, 'party', member.AID, member.characterName, member.class_, member));
	}

	if (Session.homunId) {
		list.push(describe('homun', 'homun', Session.homunId, null, null, null));
	}
	if (Session.mercId) {
		list.push(describe('merc', 'merc', Session.mercId, null, null, null));
	}
	return list;
}

function describe(key, kind, GID, name, job, member) {
	const offline = !!member && member.state !== 0;
	const entity = kind === 'self' ? Session.Entity : offline ? null : liveEntity(GID);

	let hp = -1;
	let hpMax = 0;
	if (entity && entity.life && entity.life.hp_max > 0) {
		hp = entity.life.hp;
		hpMax = entity.life.hp_max;
	} else {
		const life = EntityManager.getLife ? EntityManager.getLife(GID) : null;
		if (life && life.hp_max > 0) {
			hp = life.hp;
			hpMax = life.hp_max;
		}
	}

	const dead =
		!!(member && member.isDead) ||
		!!(entity && entity.ACTION && entity.action === entity.ACTION.DIE) ||
		(hpMax > 0 && hp <= 0);

	if (!name) {
		name = (entity && entity.display && entity.display.name) || (kind === 'homun' ? 'Homunculus' : 'Mercenary');
	}
	if (job === null || job === undefined) {
		job = entity ? entity._job : 0;
	}

	return {
		key,
		kind,
		GID,
		name,
		job,
		entity,
		hp,
		hpMax,
		dead,
		offline,
		selectable: !!entity
	};
}

/**
 * The entity, if it is on this map and in sight.
 */
function liveEntity(GID) {
	const entity = EntityManager.get(GID);
	return entity && entity.remove_tick === 0 ? entity : null;
}

function hpRatio(entry) {
	if (entry.dead) {
		return 0;
	}
	return entry.hpMax > 0 ? Math.max(0, Math.min(1, entry.hp / entry.hpMax)) : -1;
}

/**
 * What the skill waiting for a target needs, or null with none waiting.
 *
 * @return {?object} { place, revive, range (-1 unknown), cost (-1 unknown) }
 */
function skillContext() {
	const flag = SkillTargetSelection.getFlag();
	if (!flag) {
		return null;
	}
	const skill = SkillTargetSelection.getSkill ? SkillTargetSelection.getSkill() : null;
	const SKID = skill ? skill.SKID : 0;
	const level = skill ? skill.useLevel || skill.level : 0;
	// The skill list's numbers are for the learned level; for another level, the skill table's
	const atLearned = !!skill && (!skill.useLevel || skill.useLevel === skill.level);
	const info = SkillInfo[SKID];

	let cost = -1;
	if (atLearned && skill.spcost >= 0) {
		cost = skill.spcost;
	} else if (info && info.SpAmount && info.SpAmount[level - 1] >= 0) {
		cost = info.SpAmount[level - 1];
	}

	let range = -1;
	if (atLearned && skill.attackRange >= 0) {
		range = skill.attackRange;
	} else if (info && info.AttackRange && info.AttackRange[level - 1] >= 0) {
		range = info.AttackRange[level - 1];
	}

	return {
		place: (flag & SkillTargetSelection.TYPE.PLACE) !== 0,
		revive: REVIVE_SKILLS.includes(SKID),
		range,
		cost
	};
}

/**
 * Whether a member can take the skill described by ctx (with no skill,
 * whether they can be focused), whether they stand beyond its range, and
 * why not, for the label.
 *
 * @return {object} { ok, far, reason }
 */
function judge(entry, ctx) {
	if (!entry.selectable) {
		return { ok: false, far: false, reason: entry.offline ? 'offline' : 'out of sight' };
	}
	if (!ctx) {
		return { ok: true, far: false, reason: '' };
	}
	// A ground skill lands where they lie, dead or alive
	if (!ctx.place) {
		if (ctx.revive && !entry.dead) {
			return { ok: false, far: false, reason: 'not dead' };
		}
		if (!ctx.revive && entry.dead) {
			return { ok: false, far: false, reason: '' };
		}
	}
	const player = Session.Entity;
	const far =
		ctx.range >= 0 &&
		!!player &&
		entry.entity !== player &&
		Math.max(
			Math.abs(entry.entity.position[0] - player.position[0]),
			Math.abs(entry.entity.position[1] - player.position[1])
		) > ctx.range;
	return { ok: true, far, reason: far ? 'out of range' : '' };
}

/**
 * A short rumble, on pads that have one.
 *
 * @param {Array<number>} effect [strong, weak, ms]
 */
function rumble(effect) {
	try {
		const pads = navigator.getGamepads ? navigator.getGamepads() : [];
		for (let i = 0; i < pads.length; i++) {
			const actuator = pads[i] && pads[i].vibrationActuator;
			if (actuator && actuator.playEffect) {
				actuator.playEffect('dual-rumble', {
					duration: effect[2],
					strongMagnitude: effect[0],
					weakMagnitude: effect[1]
				});
				return;
			}
		}
	} catch {
		// No rumble on this pad or browser
	}
}

function hpColor(ratio) {
	if (ratio >= HP_GOOD) {
		return COLOR_GOOD;
	}
	return ratio >= HP_LOW ? COLOR_MID : COLOR_LOW;
}

// ---------------------------------------------------------------------------
// Focus
// ---------------------------------------------------------------------------

function getFocus() {
	if (!_focusKey) {
		return null;
	}
	const members = getMembers();
	for (let i = 0; i < members.length; i++) {
		if (members[i].key === _focusKey) {
			return members[i];
		}
	}
	return null;
}

/**
 * The focused member's entity, when it can be cast on right now.
 */
function getFocusEntity() {
	const focus = getFocus();
	return focus && focus.selectable ? focus.entity : null;
}

/**
 * The focused member's entity, when the skill waiting for a target can
 * be cast on them (Heal not on the dead, Resurrection only on them).
 */
function getFocusForSkill() {
	// The radial open on someone: what is highlighted is what is meant,
	// settled or not
	if (_open && !_pending && _highlight !== -1 && _entries[_highlight]) {
		const entry = _entries[_highlight];
		if (!judge(entry, skillContext()).ok) {
			return null;
		}
		setFocus(entry);
		return entry.entity;
	}
	const focus = getFocus();
	return focus && judge(focus, skillContext()).ok ? focus.entity : null;
}

function setFocus(entry) {
	_focusKey = entry ? entry.key : null;
}

function clearFocus() {
	_focusKey = null;
}

/**
 * D-pad left / right: the next member by HP, lowest first. The dead come
 * last (a Heal does nothing for them), out-of-sight members not at all.
 *
 * @param {string} direction 'next' or 'prev'
 */
function cycle(direction) {
	const members = getMembers().filter(entry => entry.selectable);
	if (members.length === 0) {
		return;
	}

	const rank = entry => (entry.dead ? 2 : hpRatio(entry) < 0 ? 1 : hpRatio(entry));
	members.sort((a, b) => rank(a) - rank(b));

	const index = members.findIndex(entry => entry.key === _focusKey);
	let next;
	if (index === -1) {
		next = direction === 'next' ? 0 : members.length - 1;
	} else {
		next = (index + (direction === 'next' ? 1 : -1) + members.length) % members.length;
	}
	setFocus(members[next]);
}

// ---------------------------------------------------------------------------
// Casting
// ---------------------------------------------------------------------------

/**
 * Whether a skill waiting for a target belongs to Support: one that takes
 * a friend, a homunculus, or a place. Enemy-only skills keep going to the
 * mob target (Holy Light in the middle of healing).
 *
 * @param {number} flag SkillTargetSelection.TYPE bits
 */
function isSupportSkill(flag) {
	const TYPE = SkillTargetSelection.TYPE;
	return (flag & (TYPE.FRIEND | TYPE.HOMUN | TYPE.PLACE)) !== 0;
}

/**
 * Cast the skill waiting for a target on the entity: through the target
 * selection's own check, as the party window does, or for a ground skill
 * with a click where the entity stands.
 *
 * @return {boolean} whether a skill was waiting
 */
function castOn(entity) {
	const flag = SkillTargetSelection.getFlag();
	if (!flag || !entity) {
		return false;
	}

	rumble(RUMBLE_CAST);
	if (flag & SkillTargetSelection.TYPE.PLACE) {
		Cursor.moveMouseToEntity(entity);
		Cursor.quickCastClick(function () {
			Cursor.moveMouseToEntity(entity);
		});
		return true;
	}

	// Yourself: straight to the request. The target selection refuses you
	// for any skill that also takes an enemy, and the server sends Heal
	// (which hurts the undead) as one.
	const skill = entity === Session.Entity && SkillTargetSelection.getSkill ? SkillTargetSelection.getSkill() : null;
	if (skill) {
		SkillTargetSelection.onUseSkillToId(skill.SKID, skill.useLevel || skill.level, entity.GID);
	} else {
		SkillTargetSelection.intersectEntityId(entity.GID);
	}
	SkillTargetSelection.remove();
	return true;
}

/**
 * Open the radial with a skill waiting for its member.
 *
 * @param {number} index shortcut slot that cast it (-1: unknown)
 * @param {string} name skill name, shown above the radial
 */
function openPending(index, name) {
	_pending = { index: index, name: name || '' };
	_open = true;
	_highlight = 0; // yourself
	_picked = -1;
}

function isPending() {
	return _pending !== null;
}

function pendingIndex() {
	return _pending ? _pending.index : -1;
}

/**
 * Drop the pending skill and close the radial.
 *
 * @param {boolean} [cancelSkill] also take the skill off the cursor
 */
function cancelPending(cancelSkill) {
	if (!_pending) {
		return;
	}
	_pending = null;
	closeRadial();
	if (cancelSkill && SkillTargetSelection.getFlag()) {
		SkillTargetSelection.remove();
	}
}

/**
 * The same shortcut pressed again while its skill is pending: cast it on
 * yourself.
 */
function castPendingOnSelf() {
	_pending = null;
	closeRadial();
	return castOn(Session.Entity);
}

// ---------------------------------------------------------------------------
// Radial
// ---------------------------------------------------------------------------

function closeRadial() {
	_open = false;
	_highlight = -1;
	_picked = -1;
}

/**
 * The segment a stick direction points at. Segment 0 sits at 12 o'clock,
 * the rest follow clockwise.
 */
function segmentAt(x, y, count) {
	const step = 360 / count;
	const degrees = (Math.atan2(y, x) * 180) / Math.PI + 90; // 0 = up
	return ((Math.round(degrees / step) % count) + count) % count;
}

/**
 * The stick held on a segment. With no skill pending that member becomes
 * the focus; with one, the segment is only remembered, for A.
 */
function pick(index) {
	_picked = index;
	const entry = _entries[index];
	if (_pending || !entry || !entry.selectable || entry.key === _focusKey) {
		return;
	}
	setFocus(entry);
	rumble(RUMBLE_FOCUS);
}

/**
 * B with the radial open and no skill pending (that one B cancels): close
 * it until the stick is let go.
 *
 * @return {boolean} whether it was open
 */
function dismiss() {
	if (!_open || _pending) {
		return false;
	}
	closeRadial();
	_waitRest = true;
	return true;
}

/**
 * A with a skill pending: cast it on the highlighted member, who becomes
 * the focus. A member the skill cannot take is not cast on (the skill
 * keeps waiting).
 *
 * @return {boolean} whether a skill was pending (A is taken either way)
 */
function confirmPending() {
	if (!_pending) {
		return false;
	}
	const entry = _highlight !== -1 ? _entries[_highlight] : null;
	if (!entry || !judge(entry, skillContext()).ok) {
		return true;
	}
	setFocus(entry);
	_pending = null;
	closeRadial();
	castOn(entry.entity);
	return true;
}

/**
 * Whether the right stick drives the radial: in Support, in aim and cursor
 * mode alike, and whenever a skill waits for its member. For the windows,
 * step to another category (D-pad up / down) and the stick is the cursor
 * again.
 */
function ownsStick() {
	return _pending !== null || Category.isSupport();
}

/**
 * One frame (JoystickCursorMotion), before aim and cursor get the stick.
 *
 * @param {number} x right stick x
 * @param {number} y right stick y
 * @param {number} magnitude stick deflection
 * @param {number} deadzone
 * @return {boolean} true when Support took the right stick this frame
 */
function update(x, y, magnitude, deadzone) {
	// The skill was cancelled elsewhere (Escape, another skill)
	if (_pending && !SkillTargetSelection.getFlag()) {
		_pending = null;
		closeRadial();
	}

	if (!Session.Entity || (!Category.isSupport() && !_pending)) {
		closeRadial();
		release();
		return false;
	}

	const owns = ownsStick();
	_entries = getMembers();

	if (owns) {
		if (_highlight >= _entries.length) {
			// The party shrank under the highlight
			_highlight = _pending ? 0 : -1;
			_picked = -1;
		}
		const atRest = magnitude <= Math.max(deadzone, RELEASE_MAX);
		if (_waitRest && atRest) {
			_waitRest = false;
		}
		if (magnitude >= SELECT_MIN && _entries.length > 0 && !_waitRest) {
			const index = segmentAt(x, y, _entries.length);
			const now = performance.now();
			_open = true;
			// A fresh push times its segment from now, yourself included
			if (index !== _highlight || !_pushed) {
				_highlight = index;
				_highlightAt = now;
			}
			_pushed = true;
			if (_picked !== _highlight && now - _highlightAt >= SETTLE_MS) {
				pick(_highlight);
			}
		} else if (atRest) {
			_pushed = false;
			if (_pending) {
				// Waiting for A: stay on the member the stick settled on,
				// not a neighbour it crossed springing back
				_highlight = _picked !== -1 ? _picked : 0;
			} else {
				closeRadial();
			}
		}
	} else if (!_pending) {
		closeRadial();
	}

	draw();
	return owns;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function getContext() {
	const scene = Renderer.canvas;
	if (!scene || !scene.parentNode) {
		return null;
	}

	if (!_overlay) {
		_overlay = document.createElement('canvas');
		_overlay.className = 'joystick-support';
		_overlay.style.position = 'absolute';
		_overlay.style.top = '0px';
		_overlay.style.left = '0px';
		// Above the names and HP / SP bars (EntityOverlay, 2), below the windows
		_overlay.style.zIndex = 3;
		_overlay.style.pointerEvents = 'none';
		scene.parentNode.insertBefore(_overlay, scene.nextSibling);
		_supportCtx = _overlay.getContext('2d');
	}

	const dpr = window.devicePixelRatio || 1;
	const width = Math.round(Renderer.width * dpr);
	const height = Math.round(Renderer.height * dpr);
	if (_overlay.width !== width || _overlay.height !== height) {
		_overlay.width = width;
		_overlay.height = height;
		_overlay.style.width = Renderer.width + 'px';
		_overlay.style.height = Renderer.height + 'px';
	}
	return _supportCtx;
}

function clearOverlay() {
	if (_drawn && _supportCtx) {
		_supportCtx.setTransform(1, 0, 0, 1, 0, 0);
		_supportCtx.clearRect(0, 0, _overlay.width, _overlay.height);
		_drawn = false;
	}
}

/**
 * Remove everything drawn (Support left, pad gone). The focus stays.
 */
function release() {
	clearOverlay();
}

function draw() {
	clearOverlay();

	const focus = Category.isSupport() ? getFocusEntity() : null;
	if (!_open && !focus) {
		return;
	}

	const ctx = getContext();
	if (!ctx) {
		return;
	}
	const dpr = window.devicePixelRatio || 1;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

	if (focus && Aim.isOnScreen(focus)) {
		Aim.drawRing(ctx, focus, 0.8, FOCUS_RING);
		_drawn = true;
	}

	if (_open) {
		drawRadial(ctx);
	}
}

function drawRadial(ctx) {
	const player = Session.Entity;
	const feet = Aim.project(player.position[0], player.position[1]);
	if (!feet || _entries.length === 0) {
		return;
	}

	const count = _entries.length;
	const outer = R_OUTER_MIN + count * R_OUTER_PER_ENTRY;
	const reach = outer + POP_OUT;
	// Below the character, clear of it; pushed up only as far as the screen's bottom edge needs
	const cx = feet[0];
	const cy = Math.max(feet[1], Math.min(feet[1] + BELOW_FEET + reach, Renderer.height - reach - LABEL_ROOM));
	const step = (Math.PI * 2) / count;
	const gap = (GAP_DEG * Math.PI) / 180;
	const skill = _pending ? skillContext() : null;

	for (let i = 0; i < count; i++) {
		const entry = _entries[i];
		const verdict = judge(entry, skill);
		const mid = -Math.PI / 2 + i * step;
		const a0 = mid - step / 2 + gap / 2;
		const a1 = mid + step / 2 - gap / 2;
		const lit = i === _highlight;
		const rOut = outer;
		const usable = verdict.ok;
		const alpha = usable ? 1 : 0.45;
		// The highlight stands out from the ring, along its middle
		const sx = lit ? cx + Math.cos(mid) * POP_OUT : cx;
		const sy = lit ? cy + Math.sin(mid) * POP_OUT : cy;

		// Base
		wedge(ctx, sx, sy, R_INNER, rOut, a0, a1);
		ctx.fillStyle = usable ? 'rgba(20, 20, 20, ' + 0.6 * alpha + ')' : 'rgba(90, 90, 90, 0.5)';
		ctx.fill();

		// HP, filled outward from the inner edge
		const ratio = hpRatio(entry);
		if (ratio > 0) {
			wedge(ctx, sx, sy, R_INNER, R_INNER + (rOut - R_INNER) * ratio, a0, a1);
			ctx.fillStyle = 'rgba(' + (usable ? hpColor(ratio) : '160, 160, 160') + ', ' + 0.75 * alpha + ')';
			ctx.fill();
		}

		// Outline: white for the highlight, orange beyond the skill's range, green for the focus
		wedge(ctx, sx, sy, R_INNER, rOut, a0, a1);
		if (lit) {
			ctx.lineWidth = 2.5;
			ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
		} else if (verdict.far) {
			ctx.lineWidth = 2;
			ctx.strokeStyle = FAR_OUTLINE;
		} else {
			ctx.lineWidth = entry.key === _focusKey ? 2 : 1;
			ctx.strokeStyle = entry.key === _focusKey ? 'rgba(' + FOCUS_RING + ', 0.95)' : 'rgba(0, 0, 0, 0.6)';
		}
		ctx.stroke();

		const ir = (R_INNER + outer) / 2;
		drawIcon(ctx, entry, sx + Math.cos(mid) * ir, sy + Math.sin(mid) * ir, alpha);
	}

	drawSp(ctx, cx, cy, R_INNER - SP_INSET, skill ? skill.cost : -1);

	// Name and HP of the highlighted member (else the focus) below the radial
	const shown = _highlight !== -1 ? _entries[_highlight] : getFocus();
	if (shown) {
		const ratio = hpRatio(shown);
		let label = shown.name;
		if (shown.dead) {
			label += ' (dead)';
		} else if (ratio >= 0) {
			label += ' ' + Math.round(ratio * 100) + '%';
		}
		const reason = judge(shown, skill).reason;
		if (reason) {
			label += ' - ' + reason;
		}
		drawLabel(ctx, label, cx, cy + outer + POP_OUT + 14);
	}

	// The skill waiting for its member, above
	if (_pending && _pending.name) {
		drawLabel(ctx, _pending.name, cx, cy - outer - POP_OUT - 8);
	}

	_drawn = true;
}

/**
 * Your own SP in the middle of the radial: a grey disc filled blue from
 * the bottom up in proportion to SP / max SP, with the SP left as a number.
 * With a skill pending, the top of the level that it would use is lighter,
 * and the number turns red when the SP does not cover it.
 *
 * @param {number} cost SP the pending skill uses, -1 for none / unknown
 */
function drawSp(ctx, cx, cy, radius, cost) {
	const life = Session.Entity && Session.Entity.life;
	const known = !!life && life.sp_max > 0 && life.sp >= 0;
	const ratio = known ? Math.max(0, Math.min(1, life.sp / life.sp_max)) : 0;

	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2);
	ctx.fillStyle = SP_BACK;
	ctx.fill();

	if (ratio > 0) {
		ctx.save();
		ctx.beginPath();
		ctx.arc(cx, cy, radius, 0, Math.PI * 2);
		ctx.clip();
		ctx.fillStyle = SP_FILL;
		// A level rising from the bottom: full SP fills the disc
		const level = radius * 2 * ratio;
		ctx.fillRect(cx - radius, cy + radius - level, radius * 2, level);
		if (cost > 0) {
			const used = Math.min(level, (radius * 2 * cost) / life.sp_max);
			ctx.fillStyle = SP_COST;
			ctx.fillRect(cx - radius, cy + radius - level, radius * 2, used);
		}
		ctx.restore();
	}

	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2);
	ctx.lineWidth = 1;
	ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
	ctx.stroke();

	if (known) {
		drawLabel(ctx, String(life.sp), cx, cy, cost > life.sp ? SP_SHORT : '#fff');
	}
}

function wedge(ctx, cx, cy, r0, r1, a0, a1) {
	ctx.beginPath();
	ctx.arc(cx, cy, r1, a0, a1);
	ctx.arc(cx, cy, r0, a1, a0, true);
	ctx.closePath();
}

function drawLabel(ctx, text, x, y, color = '#fff') {
	ctx.font = 'bold 12px sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.lineWidth = 3;
	ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
	ctx.strokeText(text, x, y);
	ctx.fillStyle = color;
	ctx.fillText(text, x, y);
}

/**
 * The member's head if they are in sight, else their job icon, else (no
 * icon in the data, homunculus, mercenary) a letter.
 */
function drawIcon(ctx, entry, x, y, alpha) {
	let image = null;
	if (entry.kind === 'self' || entry.kind === 'party') {
		image = (entry.entity && getPortrait(entry.entity)) || getJobIcon(entry.job);
	}

	ctx.save();
	ctx.globalAlpha = alpha;
	if (image) {
		ctx.drawImage(image, x - ICON_SIZE / 2, y - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE);
	} else {
		const letter = entry.kind === 'homun' ? 'H' : entry.kind === 'merc' ? 'M' : (entry.name || '?').charAt(0);
		ctx.font = 'bold 15px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.lineWidth = 3;
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
		ctx.strokeText(letter, x, y);
		ctx.fillStyle = entry.kind === 'homun' || entry.kind === 'merc' ? '#ffd54f' : '#fff';
		ctx.fillText(letter, x, y);
	}
	ctx.restore();
}

function getJobIcon(job) {
	if (job === null || job === undefined) {
		return null;
	}
	if (_jobIcons.has(job)) {
		const image = _jobIcons.get(job);
		return image && image.complete && image.naturalWidth > 0 ? image : null;
	}

	_jobIcons.set(job, null);
	try {
		Client.loadFile(
			DB.INTERFACE_PATH + 'renewalparty/icon_jobs_' + job + '.bmp',
			function (url) {
				const image = new Image();
				image.src = url;
				_jobIcons.set(job, image);
			},
			function () {
				_jobIcons.set(job, null);
			}
		);
	} catch {
		_jobIcons.set(job, null);
	}
	return null;
}

const HEADGEAR = ['accessory', 'accessory2', 'accessory3']; // lower, upper, middle

/**
 * The member's head with their headgear, drawn from a separate head-only
 * entity with their look (as the guild window draws its members), cropped
 * to what was drawn. Null until the head sprite has loaded; drawn again as
 * each headgear sprite arrives.
 *
 * @see docs/reference/guild/member-portrait.md
 */
function getPortrait(source) {
	const look = [
		source._sex,
		source._job,
		source.head,
		source.headpalette,
		source.accessory,
		source.accessory2,
		source.accessory3
	].join(',');
	let portrait = _portraits.get(source.GID);

	if (!portrait || portrait.look !== look) {
		const entity = new Entity();
		entity.objecttype = Entity.TYPE_PC;
		entity.files.shadow.spr = null;
		entity._sex = source._sex;
		entity._job = source._job;
		entity._effectiveJob = source._job;
		entity.head = source.head;
		entity.headpalette = source.headpalette;
		// Through the real setters: they load the sprites, which then turn up in files
		for (let i = 0; i < HEADGEAR.length; i++) {
			if (source[HEADGEAR[i]] > 0) {
				entity[HEADGEAR[i]] = source[HEADGEAR[i]];
			}
		}
		entity.direction = 4;
		entity.headDir = 0;
		entity.action = entity.ACTION.IDLE;
		entity.animation = { tick: 0, frame: 0, repeat: true, play: true, next: false, delay: 0, save: false };

		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = ICON_SIZE;
		portrait = { look, entity, canvas, ok: false, drawn: '', triedAt: 0 };
		_portraits.set(source.GID, portrait);
	}

	// Draw again whenever another sprite (head, a headgear) has finished loading
	const files = portrait.entity.files;
	const loaded = ['head']
		.concat(HEADGEAR)
		.map(part => files[part].spr || '')
		.join('|');
	if (!portrait.ok || portrait.drawn !== loaded) {
		const now = performance.now();
		if (now - portrait.triedAt >= PORTRAIT_RETRY_MS) {
			portrait.triedAt = now;
			if (renderPortrait(portrait)) {
				portrait.ok = true;
				portrait.drawn = loaded;
			}
		}
	}
	return portrait.ok ? portrait.canvas : null;
}

let _scratch = null;
let _scratchCtx = null;

function renderPortrait(portrait) {
	if (!_scratch) {
		_scratch = document.createElement('canvas');
		_scratch.width = _scratch.height = PORTRAIT_BOX;
		_scratchCtx = _scratch.getContext('2d', { willReadFrequently: true });
	}

	_scratchCtx.clearRect(0, 0, PORTRAIT_BOX, PORTRAIT_BOX);
	const direction = Camera.direction;
	try {
		Camera.direction = 4;
		SpriteRenderer.bind2DContext(_scratchCtx, PORTRAIT_BOX / 2, PORTRAIT_BOX / 2 + CELL_SHIFT);
		portrait.entity.renderEntity();
	} catch {
		return false;
	} finally {
		Camera.direction = direction;
	}

	const box = opaqueBounds(_scratchCtx, PORTRAIT_BOX);
	if (!box) {
		return false;
	}

	// Square around the drawing, keeping the top: the head is at the top
	const side = Math.max(box.right - box.left + 1, box.bottom - box.top + 1);
	const sx = Math.max(0, Math.round((box.left + box.right + 1 - side) / 2));
	const sy = box.top;
	const ctx = portrait.canvas.getContext('2d');
	ctx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
	ctx.drawImage(_scratch, sx, sy, side, side, 0, 0, ICON_SIZE, ICON_SIZE);
	return true;
}

function opaqueBounds(ctx, side) {
	const data = ctx.getImageData(0, 0, side, side).data;
	let top = -1,
		bottom = -1,
		left = side,
		right = -1;

	for (let y = 0; y < side; ++y) {
		for (let x = 0; x < side; ++x) {
			if (data[(y * side + x) * 4 + 3] > 8) {
				if (top < 0) {
					top = y;
				}
				bottom = y;
				if (x < left) {
					left = x;
				}
				if (x > right) {
					right = x;
				}
			}
		}
	}

	return top < 0 ? null : { top, bottom, left, right };
}

export default {
	getMembers,
	getFocus,
	getFocusEntity,
	getFocusForSkill,
	setFocus,
	clearFocus,
	cycle,
	isSupportSkill,
	castOn,
	openPending,
	isPending,
	pendingIndex,
	cancelPending,
	castPendingOnSelf,
	confirmPending,
	dismiss,
	ownsStick,
	update,
	release,
	segmentAt,
	isRadialOpen: () => _open,
	getHighlight: () => _highlight
};
