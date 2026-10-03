/**
 * UI/Components/JoystickUI/JoystickInteractionService.js
 *
 * Acts as the bridge between input signals and game actions.
 * Orchestrates shortcut execution, mouse emulation, camera controls,
 * and character interactions.
 *
 * @author AoShinHo
 */

import ShortCut from 'UI/Components/ShortCut/ShortCut.js';
import InventoryUI from 'UI/Components/Inventory/Inventory.js';
import ItemType from 'DB/Items/ItemType.js';
import Character from './JoystickCharacterControl.js';
import Target from './JoystickTargetService.js';
import Cursor from './JoystickMouseCursorAdapter.js';

import ControlsSettings from 'Preferences/Controls.js';
import SelectionUI from './JoystickSelectionUI.js';
import Input from './JoystickInputService.js';
import DB from 'DB/DBManager.js';
import SkillInfo from 'DB/Skills/SkillInfo.js';
import ShortcutMapper from './JoystickShortcutMapper.js';
import Mouse from 'Controls/MouseEventHandler.js';
import Aim from './JoystickAimMode.js';
import EntityManager from 'Renderer/EntityManager.js';
import SkillTargetSelection from 'UI/Components/SkillTargetSelection/SkillTargetSelection.js';

export default {
	prepare: function () {},

	dispose: function () {},
	cancelQuick: false,
	executeShortcut: function (index, group) {
		const shortcut = ShortCut.getList()[index];
		if (!shortcut) {
			return;
		}

		if (!shortcut.isSkill) {
			const item = InventoryUI.getUI().getItemById(shortcut.ID);
			if (!item || item.count === 0) {
				return;
			}
		} // Move mouse to target entity position
		else if (ControlsSettings.attackTargetMode) {
			const targetEntity = Target.getEntity();
			if (targetEntity) {
				Cursor.moveMouseToEntity(targetEntity);
			}
		}

		ShortCut.onShortCut({
			cmd: 'EXECUTE' + index
		});

		if (ControlsSettings.joyQuick === 2) {
			// Instant: a selected mob gets the skill wherever the cursor is
			// (it may have walked away from where the cycle left it); ground
			// skills land where the mob stands at the moment of the click.
			if (!this.castAtFocus()) {
				Cursor.quickCastClick(function () {
					Target.snapCursorToFocus();
				});
			}
		} else if (ControlsSettings.joyQuick === 1) {
			this.cancelQuick = false;

			const waitforRelease = () => {
				setTimeout(() => {
					const buttons = Input.buttonStates;
					if (ShortcutMapper.getGroup(buttons) !== group) {
						Cursor.quickCastClick();
					} else if (!this.cancelQuick) {
						waitforRelease();
					}
				}, 50);
			};
			waitforRelease();
		}
	},

	/**
	 * Cast the skill waiting for a target on the focused mob, if it takes an
	 * enemy target. Goes through SkillTargetSelection's own entity check, as
	 * the party window does for its members.
	 *
	 * @return {boolean} whether the skill was cast
	 */
	castAtFocus: function () {
		const flag = SkillTargetSelection.getFlag();
		if (!(flag & SkillTargetSelection.TYPE.ENEMY) || flag & SkillTargetSelection.TYPE.PLACE) {
			return false;
		}

		const focus = EntityManager.getFocusEntity();
		if (!focus || focus.action === focus.ACTION.DIE || focus.remove_tick !== 0) {
			return false;
		}

		SkillTargetSelection.intersectEntityId(focus.GID);
		SkillTargetSelection.remove();
		return true;
	},

	openSelectionWindow: function (draggableElement) {
		const index = parseInt(draggableElement.getAttribute('data-index'), 10);
		const isSkill = draggableElement.closest('.skill');
		let itemData;

		if (!isSkill) {
			const item = InventoryUI.getUI().getItemByIndex(index);
			if (item) {
				if (
					item.type === ItemType.UNKNOWN ||
					item.type === ItemType.ETC ||
					item.type === ItemType.CARD ||
					item.type === ItemType.PETEGG ||
					item.type === ItemType.PETARMOR
				) {
					return false;
				}

				itemData = {
					isSkill: false,
					ID: item.ITID,
					value: item.count,
					name: DB.getItemName(item)
				};
			}
		} else {
			const skill = ShortCut.getSkillById(index);
			if (skill) {
				itemData = {
					isSkill: true,
					ID: skill.SKID,
					value: skill.selectedLevel ? skill.selectedLevel : skill.level,
					name: SkillInfo[skill.SKID].SkillName
				};
			}
		}

		if (itemData) {
			SelectionUI.showSelection(itemData);
			return true;
		}

		return false;
	},

	leftClick: function (click) {
		Cursor.leftClick(click);
	},

	rightClick: function (holding) {
		Cursor.rightClick(holding);
	},

	pickUpItem: function () {
		Character.pickUp();
	},

	/**
	 * @param {boolean} repeat true while X is held (see Character.attack)
	 * @return {boolean} whether an attack was sent
	 */
	attackTargeted: function (repeat) {
		const sent = Character.attack(repeat);

		// Park the virtual cursor on the target, as a D-pad cycle does, so a
		// following A press (a real left click at the cursor) lands on the
		// mob instead of the ground, which would cancel the attack and walk.
		if (sent) {
			Target.snapCursorToFocus();
		}
		return sent;
	},

	releaseStick: function () {
		Character.releaseStick();
	},

	moveCursor: function (dx, dy) {
		Cursor.move(dx, dy);
	},

	cameraZoom: function (zoom) {
		Cursor.changeCameraZoom(zoom);
	},

	cameraAngle: function (angle) {
		Cursor.changeCameraAngle(angle);
	},

	escape: function () {
		Cursor.esc();
	},

	enter: function () {
		Cursor.enter();
	},

	showinfo: function () {
		return Cursor.contextMenu();
	},

	navigateDpad: function (direction) {
		return Cursor.navigateDraggableItems(direction);
	},

	/**
	 * D-pad left/right. If the virtual cursor is parked over an item or
	 * skill container, keep today's grid navigation so inventory nav still
	 * works with the D-pad. Over the world, cycle the targeted mob.
	 *
	 * @param {string} direction 'next' or 'prev'
	 */
	cycleTarget: function (direction) {
		const el = document.elementFromPoint(Mouse.screen.x, Mouse.screen.y);
		if (el && el.closest('.item, .skill')) {
			this.navigateDpad(direction === 'next' ? 'right' : 'left');
			return;
		}
		Target.cycle(direction);
	},

	/**
	 * Clear the cycle focus and recenter the virtual cursor. Lets the player
	 * drop the current target so the next D-pad step starts from the closest
	 * mob again.
	 */
	resetFocus: function () {
		Target.clear();
	},

	/**
	 * Right stick: aim line <-> virtual cursor.
	 */
	toggleStickMode: function () {
		Aim.toggle();
	},

	/**
	 * Switch what the D-pad cycle walks through: mobs, items, or both.
	 */
	nextCycleMode: function () {
		Target.nextCycleMode();
	},

	moveCharacter: function (x, y) {
		Character.move(x, y);
	}
};
