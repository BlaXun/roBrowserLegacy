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

function focusTarget(entity) {
	let focus = EntityManager.getFocusEntity();
	if (!focus || focus.action === focus.ACTION.DIE) {
		focus = EntityManager.getFocusEntity();
	}
	if (focus && entity.GID !== focus.GID) {
		focus.onFocusEnd();
		EntityManager.setFocusEntity(null);
		entity.onFocus();
		EntityManager.setFocusEntity(entity);
	} else if (!focus) {
		entity.onFocus();
		EntityManager.setFocusEntity(entity);
	}
}

/**
 * Step the focused target to the next (or previous) mob by straight-line
 * distance from the player. Wraps at both ends. If nothing is focused, or
 * the focused entity is not in the sorted list (dead, out of range, not
 * a mob), 'next' jumps to the closest and 'prev' to the farthest.
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

	const sorted = EntityManager.getEntitiesSortedByDistance(player, player.constructor.TYPE_MOB);
	if (sorted.length === 0) {
		return;
	}

	const focus = EntityManager.getFocusEntity();
	let index = -1;
	if (focus) {
		for (let i = 0; i < sorted.length; i++) {
			if (sorted[i].GID === focus.GID) {
				index = i;
				break;
			}
		}
	}

	let newIndex;
	if (index === -1) {
		newIndex = direction === 'next' ? 0 : sorted.length - 1;
	} else if (direction === 'next') {
		newIndex = (index + 1) % sorted.length;
	} else {
		newIndex = (index - 1 + sorted.length) % sorted.length;
	}

	const target = sorted[newIndex];

	// EntityControl.onFocus() for TYPE_MOB sends REQUEST_ACT (an attack packet)
	// when Session.TouchTargeting and Session.autoFollow are both off. That is
	// right for a mouse click, wrong for a cycle step. Toggle TouchTargeting
	// around the call so onFocus() still attaches the lock-on sprite but takes
	// the "focused, do not attack" branch. The call is synchronous; nothing
	// else observes TouchTargeting in between.
	const prevTouch = Session.TouchTargeting;
	Session.TouchTargeting = true;
	try {
		focusTarget(target);
	} finally {
		Session.TouchTargeting = prevTouch;
	}
	Cursor.moveMouseToEntity(target);

	// Debug hook: inspect the sort in DevTools via window.__dpadLastSort to
	// diagnose "closest mob isn't first" reports. Remove once settled.
	if (typeof window !== 'undefined') {
		window.__dpadLastSort = sorted.map((e, i) => ({
			i: i,
			gid: e.GID,
			type: e.objecttype,
			pos: [e.position[0], e.position[1]],
			dsq: Math.round(
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
	const focus = EntityManager.getFocusEntity();
	if (focus) {
		focus.onFocusEnd();
		EntityManager.setFocusEntity(null);
	}
	Cursor.recenter();
}

export default {
	getEntity: getEntityInContext,
	focus: focusTarget,
	cycle: cycle,
	clear: clearFocus
};
