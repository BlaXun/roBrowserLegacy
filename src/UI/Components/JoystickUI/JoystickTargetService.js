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
	focusTarget(target);
	Cursor.moveMouseToEntity(target);
}

export default {
	getEntity: getEntityInContext,
	focus: focusTarget,
	cycle: cycle
};
