/**
 * UI/Components/JoystickUI/JoystickTargetService.js
 *
 * Utility service for identifying and focusing entities (mobs or players)
 * based on proximity or health, optimized for controller-based targeting.
 *
 * @author AoShinHo
 */

import Session from 'Engine/SessionStorage.js';
import EntityManager from 'Renderer/EntityManager.js';
import ControlsSettings from 'Preferences/Controls.js';
import Cursor from './JoystickMouseCursorAdapter.js';
import GameCursor from 'UI/CursorManager.js';
import Category from './JoystickTargetCategory.js';

/**
 * What the D-pad cycle and the aim walk through: the target category
 * (ControlsSettings.joyCycleMode, switched with D-pad up / down).
 */
const CYCLE_MODE = Category.CATEGORY;

// NPCs with these sprites are invisible script triggers (DB.getBodyPath
// draws nothing for them); the cycle and aim skip them.
const HIDDEN_NPC_JOBS = [111, 139, 2337];

/**
 * Non-combat selection: a ground item, NPC, warp portal or player the
 * cycle or aim is resting on. It is deliberately not the EntityManager focus: that slot
 * is the combat lock-on (X attacks it, touch-targeting skills cast on it,
 * onFocusEnd sends CANCEL_LOCKON), so these would leak into those paths.
 * Y picks up a marked item; A talks to a marked NPC or walks into a portal.
 * A player you may attack (PvP, GvG) gets the focus instead, like a mob.
 */
let _marked = null;

function getCycleTypes(Entity) {
	switch (Category.get()) {
		case CYCLE_MODE.ITEMS:
			return [Entity.TYPE_ITEM];
		case CYCLE_MODE.BOTH:
			return [Entity.TYPE_MOB, Entity.TYPE_ITEM];
		case CYCLE_MODE.INTERACT:
			return [Entity.TYPE_NPC, Entity.TYPE_NPC2, Entity.TYPE_WARP];
		case CYCLE_MODE.PLAYERS:
			return [Entity.TYPE_PC];
		case CYCLE_MODE.PEOPLE:
			return [Entity.TYPE_NPC, Entity.TYPE_NPC2, Entity.TYPE_WARP, Entity.TYPE_PC];
		case CYCLE_MODE.SUPPORT:
			// The party is picked from the radial (JoystickSupportMode)
			return [];
		default:
			return [Entity.TYPE_MOB];
	}
}

function isInteractable(entity) {
	const Entity = entity.constructor;
	return [Entity.TYPE_NPC, Entity.TYPE_NPC2, Entity.TYPE_WARP].includes(entity.objecttype);
}

function isPlayer(entity) {
	return entity.objecttype === entity.constructor.TYPE_PC;
}

/**
 * Whether the entity hides from the player: Hiding, Cloaking, Chase Walk,
 * Shadow Form, ... (EntityState). It can be neither selected nor attacked.
 */
function isHidden(entity) {
	return typeof entity.isVisible === 'function' && !entity.isVisible();
}

/**
 * What the cycle and aim may select for the current mode, nearest first.
 * EntityManager already leaves out hidden entities; script-trigger NPCs
 * go here.
 */
function getCycleCandidates(player) {
	return EntityManager.getEntitiesSortedByDistance(player, getCycleTypes(player.constructor)).filter(
		entity => !(isInteractable(entity) && HIDDEN_NPC_JOBS.includes(entity.job))
	);
}

/**
 * The marked entity, or null once it was picked up, expired, left the
 * entity list or went into hiding.
 */
function getMarked() {
	if (_marked && (_marked.remove_tick !== 0 || EntityManager.get(_marked.GID) !== _marked || isHidden(_marked))) {
		releaseMark();
	}
	return _marked;
}

function getCycledItem() {
	const marked = getMarked();
	return marked && marked.objecttype === marked.constructor.TYPE_ITEM ? marked : null;
}

function getInteractTarget() {
	const marked = getMarked();
	return marked && isInteractable(marked) ? marked : null;
}

/**
 * The marked player: one the cycle or aim selected that may not be
 * attacked. Null if none, or once it can be attacked (a PvP map's rules
 * changed): then it is the focus's job.
 */
function getMarkedPlayer() {
	const marked = getMarked();
	return marked && isPlayer(marked) && !isAttackable(marked) ? marked : null;
}

function releaseMark() {
	if (_marked) {
		_marked.attachments.remove('lockon');
		_marked = null;
	}
}

/**
 * Drop the current focus without telling the server to stop attacking.
 *
 * onFocusEnd() sends CZ_CANCEL_LOCKON (rAthena: clif_parse_StopAttack) only
 * while the entity is still the focus. Clearing the focus first skips it,
 * the same trick MapControl.onMouseUp uses. Switching focus on the gamepad
 * (D-pad cycle, X picking a new target) must not stop a running attack:
 * cycling only moves the arrow, and X's REQUEST_ACT replaces the attack
 * on the server anyway.
 */
function dropFocusQuietly() {
	const focus = EntityManager.getFocusEntity();
	if (focus) {
		EntityManager.setFocusEntity(null);
		focus.onFocusEnd();
	}
}

/**
 * Mark an item, NPC or portal: drop any combat lock-on and show the same
 * lock-on arrow mobs get, so the player sees what Y or A will act on.
 */
function markEntity(item) {
	dropFocusQuietly();
	releaseMark();

	item.attachments.add({
		uid: 'lockon',
		spr: 'data/sprite/cursors.spr',
		act: 'data/sprite/cursors.act',
		frame: GameCursor.ACTION.LOCK,
		repeat: true,
		depth: 10.0
	});
	_marked = item;
}

/**
 * Whether the entity is something X may attack: alive, not hidden, still in
 * the current map's entity list, and a mob, or a player the map state lets
 * us attack (PvP / GvG, the same rule as the mouse's attack cursor).
 *
 * The EntityManager.get() check matters: EntityManager.free() on a warp
 * cleans entities (remove_tick back to 0) but never clears the focus, so a
 * focus from the previous map would otherwise still look alive.
 *
 * @param {Entity} entity
 * @return {boolean}
 */
function isAttackable(entity) {
	if (!entity || entity === Session.Entity) {
		return false;
	}
	if (entity.action === entity.ACTION.DIE || entity.remove_tick !== 0 || isHidden(entity)) {
		return false;
	}
	if (EntityManager.get(entity.GID) !== entity) {
		return false;
	}

	const Entity = entity.constructor;
	if (entity.objecttype === Entity.TYPE_MOB) {
		return true;
	}
	return entity.objecttype === Entity.TYPE_PC && !!entity.canAttackEntity && entity.canAttackEntity();
}

/**
 * The focused entity if it is still an attackable target, else null.
 * A click on an NPC or a friendly player also focuses it (MapControl), and
 * that must not turn X into an attack on it.
 *
 * @return {Entity|null}
 */
function getAttackableFocus() {
	const focus = EntityManager.getFocusEntity();
	return isAttackable(focus) ? focus : null;
}

function getEntityInContext() {
	// If the player has cycled onto a specific target with D-pad, X-button
	// attacks and attackTargetMode skills should respect that choice instead
	// of re-picking by HP or distance, as long as it is still attackable.
	const focus = getAttackableFocus();
	if (focus) {
		return focus;
	}

	let target = null;
	if (ControlsSettings.attackTargetMode === 1) {
		// Lowest HP first
		target = EntityManager.getLowestHpEntity(Session.Entity, Session.Entity.constructor.TYPE_MOB);
		if (!target) {
			target = EntityManager.getLowestHpEntity(Session.Entity, Session.Entity.constructor.TYPE_PC);
		}
	}
	if (!target) {
		target = EntityManager.getClosestEntity(Session.Entity, Session.Entity.constructor.TYPE_MOB);
	}
	if (!target) {
		target = EntityManager.getClosestEntity(Session.Entity, Session.Entity.constructor.TYPE_PC);
	}

	return target || Session.Entity;
}

/**
 * Make the entity the focus (lock-on arrow, name) without acting on it.
 *
 * EntityControl.onFocus() for TYPE_MOB sends REQUEST_ACT / REQUEST_MOVE when
 * Session.TouchTargeting and Session.autoFollow are both off. That is right
 * for a mouse click, wrong here: a cycle step must not attack, and X sends
 * its own attack in JoystickCharacterControl.attack(), so letting onFocus
 * act too sent every new-target attack twice, with two different in-range
 * rules. Toggle TouchTargeting around the call so onFocus() takes the
 * "focused, do not attack" branch. The call is synchronous; nothing else
 * observes TouchTargeting in between.
 */
function focusEntity(entity) {
	const prevTouch = Session.TouchTargeting;
	Session.TouchTargeting = true;
	try {
		entity.onFocus();
	} finally {
		Session.TouchTargeting = prevTouch;
	}
	EntityManager.setFocusEntity(entity);
}

function focusTarget(entity) {
	releaseMark();

	const focus = EntityManager.getFocusEntity();
	if (focus && entity.GID !== focus.GID) {
		dropFocusQuietly();
		focusEntity(entity);
	} else if (!focus) {
		focusEntity(entity);
	}
}

/**
 * Select what the cycle or aim landed on: a mob, or a player you may
 * attack, becomes the focus (X attacks it); anything else is marked.
 */
function select(entity) {
	if (entity.objecttype === entity.constructor.TYPE_MOB || isAttackable(entity)) {
		focusTarget(entity);
	} else {
		markEntity(entity);
	}
}

/**
 * Step the focused target to the next (or previous) mob and/or ground item,
 * depending on ControlsSettings.joyCycleMode, by straight-line distance from
 * the player. Wraps at both ends. If nothing is focused, or the focused
 * entity is not in the sorted list (dead, picked up, out of range, wrong
 * type for the mode), 'next' jumps to the closest and 'prev' to the farthest.
 *
 * Always distance-ordered, regardless of ControlsSettings.attackTargetMode:
 * that preference governs the X-button auto-pick, not cycling, and the two
 * should not fight each other.
 *
 * @param {string} direction 'next' or 'prev'
 */
function cycle(direction) {
	const player = Session.Entity;
	if (!player) {
		return;
	}

	const sorted = getCycleCandidates(player);
	if (sorted.length === 0) {
		return;
	}

	const current = getMarked() || EntityManager.getFocusEntity();
	const index = current ? sorted.indexOf(current) : -1;

	let newIndex;
	if (index === -1) {
		newIndex = direction === 'next' ? 0 : sorted.length - 1;
	} else if (direction === 'next') {
		newIndex = (index + 1) % sorted.length;
	} else {
		newIndex = (index - 1 + sorted.length) % sorted.length;
	}

	const target = sorted[newIndex];
	select(target);
	Cursor.moveMouseToEntity(target);
}

/**
 * Clear the focused entity (if any) and snap the virtual cursor back to the
 * middle of the viewport. Used to reset the cycle so the next D-pad press
 * starts from the closest mob again.
 */
function clearFocus() {
	releaseMark();
	const focus = EntityManager.getFocusEntity();
	if (focus) {
		focus.onFocusEnd();
		EntityManager.setFocusEntity(null);
	}
	Cursor.recenter();
}

/**
 * A new target category: drop a mark it cannot reach any more (an item
 * once the category is no longer Items, ...). The combat focus stays: X
 * keeps attacking what it attacked, whatever is being targeted.
 */
Category.onChange(function () {
	const marked = getMarked();
	if (marked && !getCycleTypes(marked.constructor).includes(marked.objecttype)) {
		releaseMark();
	}
});

/**
 * Clear what the gamepad targets (L3 tap): the mark and the focus. Unlike
 * clearFocus, the cursor stays where it is.
 */
function clearTarget() {
	releaseMark();
	const focus = EntityManager.getFocusEntity();
	if (focus) {
		focus.onFocusEnd();
		EntityManager.setFocusEntity(null);
	}
}

export default {
	getEntity: getEntityInContext,
	getAttackableFocus: getAttackableFocus,
	isAttackable: isAttackable,
	focus: focusTarget,
	cycle: cycle,
	clear: clearFocus,
	clearTarget: clearTarget,
	getItem: getCycledItem,
	getMarked: getMarked,
	getInteractTarget: getInteractTarget,
	getMarkedPlayer: getMarkedPlayer,
	releaseMark: releaseMark,
	getCycleTypes: getCycleTypes,
	getCycleCandidates: getCycleCandidates,
	/**
	 * Select an entity the aim hit: a mob or attackable player gets the
	 * focus, anything else the mark. Never attacks and never stops a
	 * running attack.
	 */
	aimAt: select,
	snapCursorToFocus: function () {
		const focus = EntityManager.getFocusEntity();
		if (focus) {
			Cursor.moveMouseToEntity(focus);
		}
	},
	CYCLE_MODE: CYCLE_MODE
};
