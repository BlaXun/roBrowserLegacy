/**
 * UI/Components/JoystickUI/JoystickSupportMode.js
 *
 * The Support target category: healing and buffing the party with the pad.
 *
 * - Right stick (aim mode): pushing it opens a radial around the character
 *   with yourself, the party members and your homunculus / mercenary. The
 *   stick highlights a segment; letting it go focuses that member. The left
 *   stick keeps walking the whole time.
 * - D-pad left / right: step the focus through the members, lowest HP
 *   first.
 * - A support skill (Heal, Blessing, ...) goes to the focused member; a
 *   ground skill lands where the member stands. With nobody focused the
 *   radial opens with the skill pending: pick a member with the right stick
 *   to cast it there, press the same shortcut again to cast it on yourself,
 *   B to cancel.
 *
 * Each segment fills outward with the member's HP: green from 50 %, yellow
 * below, red under 30 %. Members out of sight (another map, too far) are
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
import Category from './JoystickTargetCategory.js';
import Aim from './JoystickAimMode.js';
import Cursor from './JoystickMouseCursorAdapter.js';

// Stick: a push past SELECT_MIN opens the radial and moves the highlight.
// A segment counts as chosen once highlighted for SETTLE_MS, so the stick
// springing back to centre across a neighbour does not pick the neighbour.
const SELECT_MIN = 0.5;
const SETTLE_MS = 100;

// Radial, in CSS pixels
const R_INNER = 30;
const R_OUTER_MIN = 72;
const R_OUTER_PER_ENTRY = 2; // more members, a wider ring
const HIGHLIGHT_GROW = 6;
const GAP_DEG = 2;
const ICON_SIZE = 26;
const CENTER_LIFT = 45; // the radial centres on the body, not the feet

const HP_GOOD = 0.5;
const HP_LOW = 0.3;
const COLOR_GOOD = '76, 175, 80';
const COLOR_MID = '255, 193, 7';
const COLOR_LOW = '244, 67, 54';
const FOCUS_RING = '76, 175, 80';

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
let _settled = -1;
let _entries = [];

let _pending = null; // { index, name } of the skill waiting for a member

const _portraits = new Map(); // GID -> { look, entity, canvas, ok, triedAt }
const _jobIcons = new Map(); // job -> Image | null (null: none in the data)

/**
 * Who the radial offers, in order: yourself (12 o'clock), the online party
 * members, your homunculus, your mercenary.
 *
 * @return {Array<object>} { key, kind, GID, name, job, entity, hp, hpMax, dead, selectable }
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
		if (member.AID === Session.AID || member.AID === player.GID || member.state !== 0) {
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

	// A companion out of sight is not worth a segment: nothing to show, nothing to pick
	return list.filter(entry => entry.kind === 'self' || entry.kind === 'party' || entry.entity);
}

function describe(key, kind, GID, name, job, member) {
	const entity = kind === 'self' ? Session.Entity : liveEntity(GID);

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

	if (flag & SkillTargetSelection.TYPE.PLACE) {
		Cursor.moveMouseToEntity(entity);
		Cursor.quickCastClick(function () {
			Cursor.moveMouseToEntity(entity);
		});
		return true;
	}

	SkillTargetSelection.intersectEntityId(entity.GID);
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
	_highlight = -1;
	_settled = -1;
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
	_settled = -1;
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
 * Let the stick go: focus the chosen member, and cast the pending skill
 * on it.
 */
function confirm() {
	const index = _settled !== -1 ? _settled : _highlight;
	const entry = index !== -1 ? _entries[index] : null;
	const wasPending = _pending;

	if (!entry || !entry.selectable) {
		// Nothing pickable chosen: a pending skill stays waiting
		if (wasPending) {
			_highlight = -1;
			_settled = -1;
			return;
		}
		closeRadial();
		return;
	}

	setFocus(entry);
	closeRadial();
	if (wasPending) {
		_pending = null;
		castOn(entry.entity);
	}
}

/**
 * Whether the right stick drives the radial: always while a skill waits
 * for its member, otherwise in Support with the stick in aim mode (in
 * cursor mode it stays the cursor, for the windows).
 */
function ownsStick() {
	return _pending !== null || (Category.isSupport() && Aim.isActive());
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
		if (magnitude >= SELECT_MIN && _entries.length > 0) {
			const index = segmentAt(x, y, _entries.length);
			const now = performance.now();
			_open = true;
			if (index !== _highlight) {
				_highlight = index;
				_highlightAt = now;
			}
			if (now - _highlightAt >= SETTLE_MS) {
				_settled = _highlight;
			}
		} else if (magnitude <= deadzone && _open && _highlight !== -1) {
			confirm();
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
		_overlay.style.zIndex = 1;
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
	const cx = feet[0];
	const cy = feet[1] - CENTER_LIFT;
	const outer = R_OUTER_MIN + count * R_OUTER_PER_ENTRY;
	const step = (Math.PI * 2) / count;
	const gap = (GAP_DEG * Math.PI) / 180;

	for (let i = 0; i < count; i++) {
		const entry = _entries[i];
		const mid = -Math.PI / 2 + i * step;
		const a0 = mid - step / 2 + gap / 2;
		const a1 = mid + step / 2 - gap / 2;
		const lit = i === _highlight;
		const rOut = lit ? outer + HIGHLIGHT_GROW : outer;
		const alpha = entry.selectable ? 1 : 0.45;

		// Base
		wedge(ctx, cx, cy, R_INNER, rOut, a0, a1);
		ctx.fillStyle = entry.selectable ? 'rgba(20, 20, 20, ' + 0.6 * alpha + ')' : 'rgba(90, 90, 90, 0.5)';
		ctx.fill();

		// HP, filled outward from the inner edge
		const ratio = hpRatio(entry);
		if (ratio > 0) {
			wedge(ctx, cx, cy, R_INNER, R_INNER + (rOut - R_INNER) * ratio, a0, a1);
			ctx.fillStyle = 'rgba(' + (entry.selectable ? hpColor(ratio) : '160, 160, 160') + ', ' + 0.75 * alpha + ')';
			ctx.fill();
		}

		// Outline: white for the highlight, light for the focus
		wedge(ctx, cx, cy, R_INNER, rOut, a0, a1);
		if (lit) {
			ctx.lineWidth = 2.5;
			ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
		} else {
			ctx.lineWidth = entry.key === _focusKey ? 2 : 1;
			ctx.strokeStyle = entry.key === _focusKey ? 'rgba(' + FOCUS_RING + ', 0.95)' : 'rgba(0, 0, 0, 0.6)';
		}
		ctx.stroke();

		const ir = (R_INNER + outer) / 2;
		drawIcon(ctx, entry, cx + Math.cos(mid) * ir, cy + Math.sin(mid) * ir, alpha);
	}

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
		if (!shown.selectable) {
			label += ' - out of sight';
		}
		drawLabel(ctx, label, cx, cy + outer + HIGHLIGHT_GROW + 14);
	}

	// The skill waiting for its member, above
	if (_pending && _pending.name) {
		drawLabel(ctx, _pending.name, cx, cy - outer - HIGHLIGHT_GROW - 8);
	}

	_drawn = true;
}

function wedge(ctx, cx, cy, r0, r1, a0, a1) {
	ctx.beginPath();
	ctx.arc(cx, cy, r1, a0, a1);
	ctx.arc(cx, cy, r0, a1, a0, true);
	ctx.closePath();
}

function drawLabel(ctx, text, x, y) {
	ctx.font = 'bold 12px sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.lineWidth = 3;
	ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
	ctx.strokeText(text, x, y);
	ctx.fillStyle = '#fff';
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

/**
 * The member's head, drawn from a separate head-only entity with their look
 * (as the guild window draws its members), cropped to what was drawn. Null
 * until the head sprite has loaded.
 *
 * @see docs/reference/guild/member-portrait.md
 */
function getPortrait(source) {
	const look = [source._sex, source._job, source.head, source.headpalette].join(',');
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
		entity.direction = 4;
		entity.headDir = 0;
		entity.action = entity.ACTION.IDLE;
		entity.animation = { tick: 0, frame: 0, repeat: true, play: true, next: false, delay: 0, save: false };

		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = ICON_SIZE;
		portrait = { look, entity, canvas, ok: false, triedAt: 0 };
		_portraits.set(source.GID, portrait);
	}

	if (!portrait.ok) {
		const now = performance.now();
		if (now - portrait.triedAt >= PORTRAIT_RETRY_MS) {
			portrait.triedAt = now;
			portrait.ok = renderPortrait(portrait);
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
	ownsStick,
	update,
	release,
	segmentAt,
	isRadialOpen: () => _open
};
