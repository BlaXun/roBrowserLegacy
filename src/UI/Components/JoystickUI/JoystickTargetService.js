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
import ChatBox from 'UI/Components/ChatBox/ChatBox.js';
import GameCursor from 'UI/CursorManager.js';

/**
 * What the D-pad cycle walks through. Values match ControlsSettings.joyCycleMode.
 */
const CYCLE_MODE = {
	MOBS: 0,
	ITEMS: 1,
	BOTH: 2
};
const CYCLE_MODE_NAMES = ['mobs', 'items', 'mobs and items'];

/**
 * Ground item the cycle is resting on. Items are deliberately not stored as
 * the EntityManager focus: that slot is the combat lock-on (X attacks it,
 * touch-targeting skills cast on it, onFocusEnd sends CANCEL_LOCKON), so an
 * item there would leak into those paths. Only the cycle and Y pickup read it.
 */
let _cycledItem = null;

function getCycleTypes(Entity) {
	switch (ControlsSettings.joyCycleMode) {
		case CYCLE_MODE.ITEMS:
			return [Entity.TYPE_ITEM];
		case CYCLE_MODE.BOTH:
			return [Entity.TYPE_MOB, Entity.TYPE_ITEM];
		default:
			return [Entity.TYPE_MOB];
	}
}

/**
 * The cycled ground item, or null once it was picked up, expired or left
 * the entity list.
 */
function getCycledItem() {
	if (_cycledItem && (_cycledItem.remove_tick !== 0 || EntityManager.get(_cycledItem.GID) !== _cycledItem)) {
		_cycledItem = null;
	}
	return _cycledItem;
}

function releaseItem() {
	if (_cycledItem) {
		_cycledItem.attachments.remove('lockon');
		_cycledItem = null;
	}
}

/**
 * Mark a ground item as the cycle target: drop any combat lock-on and show
 * the same lock-on arrow mobs get, so the player sees which item Y will pick.
 */
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

function focusItem(item) {
	dropFocusQuietly();
	releaseItem();

	item.attachments.add({
		uid: 'lockon',
		spr: 'data/sprite/cursors.spr',
		act: 'data/sprite/cursors.act',
		frame: GameCursor.ACTION.LOCK,
		repeat: true,
		depth: 10.0
	});
	_cycledItem = item;
}

function getEntityInContext() {
	// If the player has cycled onto a specific target with D-pad, X-button
	// attacks and attackTargetMode skills should respect that choice instead
	// of re-picking by HP or distance. Only honour a focus that is still a
	// valid attack target (not dying, not being removed, same filters as
	// getEntitiesSortedByDistance keeps alive).
	const focus = EntityManager.getFocusEntity();
	if (typeof window !== 'undefined') {
		window.__dpadAttackPick = {
			at: Date.now(),
			hasFocus: !!focus,
			focusGid: focus ? focus.GID : null,
			focusType: focus ? focus.objecttype : null,
			focusAction: focus ? focus.action : null,
			dieConst: focus && focus.ACTION ? focus.ACTION.DIE : null,
			focusRemoveTick: focus ? focus.remove_tick : null
		};
	}
	if (focus && focus.action !== focus.ACTION.DIE && focus.remove_tick === 0) {
		if (typeof window !== 'undefined') {
			window.__dpadAttackPick.chosen = 'focus';
		}
		return focus;
	}
	if (typeof window !== 'undefined') {
		window.__dpadAttackPick.chosen = 'fallback';
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
	releaseItem();

	const focus = EntityManager.getFocusEntity();
	if (focus && entity.GID !== focus.GID) {
		dropFocusQuietly();
		focusEntity(entity);
	} else if (!focus) {
		focusEntity(entity);
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

	const Entity = player.constructor;
	const sorted = EntityManager.getEntitiesSortedByDistance(player, getCycleTypes(Entity));
	if (sorted.length === 0) {
		return;
	}

	const current = getCycledItem() || EntityManager.getFocusEntity();
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

	if (target.objecttype === Entity.TYPE_ITEM) {
		focusItem(target);
		Cursor.moveMouseToEntity(target);
		return;
	}

	focusTarget(target);
	Cursor.moveMouseToEntity(target);

	// Debug hook: inspect the sort in DevTools via window.__dpadLastSort to
	// diagnose "closest mob isn't first" reports. Remove once settled.
	if (typeof window !== 'undefined') {
		window.__dpadLastSort = sorted.map((e, i) => ({
			i: i,
			gid: e.GID,
			type: e.objecttype,
			pos: [e.position[0], e.position[1]],
			dsq:
				Math.round(
					((e.position[0] - player.position[0]) ** 2 + (e.position[1] - player.position[1]) ** 2) * 100
				) / 100
		}));
		window.__dpadLastPlayer = [player.position[0], player.position[1]];
		window.__dpadLastSetFocusGid = target.GID;
		const after = EntityManager.getFocusEntity();
		window.__dpadFocusAfterCycle = after ? after.GID : null;
	}
}

/**
 * Clear the focused entity (if any) and snap the virtual cursor back to the
 * middle of the viewport. Used to reset the cycle so the next D-pad press
 * starts from the closest mob again.
 */
function clearFocus() {
	if (typeof window !== 'undefined') {
		window.__dpadResetCalls = (window.__dpadResetCalls || 0) + 1;
	}
	releaseItem();
	const focus = EntityManager.getFocusEntity();
	if (focus) {
		focus.onFocusEnd();
		EntityManager.setFocusEntity(null);
	}
	Cursor.recenter();
}

/**
 * Advance the cycle mode (mobs -> items -> both -> mobs), save it, and tell
 * the player in the chat box. A cycled item is released when the new mode
 * no longer includes items.
 */
function nextCycleMode() {
	ControlsSettings.joyCycleMode = ((ControlsSettings.joyCycleMode | 0) + 1) % CYCLE_MODE_NAMES.length;
	ControlsSettings.save();

	if (ControlsSettings.joyCycleMode === CYCLE_MODE.MOBS) {
		releaseItem();
	}

	ChatBox.addText(
		'D-pad target cycle: ' + CYCLE_MODE_NAMES[ControlsSettings.joyCycleMode],
		ChatBox.TYPE.INFO,
		ChatBox.FILTER.PUBLIC_LOG
	);
}

export default {
	getEntity: getEntityInContext,
	focus: focusTarget,
	cycle: cycle,
	clear: clearFocus,
	getItem: getCycledItem,
	snapCursorToFocus: function () {
		const focus = EntityManager.getFocusEntity();
		if (focus) {
			Cursor.moveMouseToEntity(focus);
		}
	},
	nextCycleMode: nextCycleMode
};
