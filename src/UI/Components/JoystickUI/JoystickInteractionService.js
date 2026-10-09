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
import Aim from './JoystickAimMode.js';
import UIManager from 'UI/UIManager.js';
import MenuNav from './JoystickMenuNavigation.js';
import Session from 'Engine/SessionStorage.js';
import SkillTargetSelection from 'UI/Components/SkillTargetSelection/SkillTargetSelection.js';
import Category from './JoystickTargetCategory.js';
import Support from './JoystickSupportMode.js';
import EmoteGrid from './JoystickEmoteGrid.js';

// Support: holding a skill's face button this long casts it on yourself
// instead of the focused member.
const SELF_CAST_HOLD_MS = 300;
const HOLD_POLL_MS = 30;
// The latest self-cast hold watch; an older one stops when it sees a newer number.
let selfCastWatch = 0;

/**
 * The character's feet on screen, for overlays placed below them.
 */
function playerFeet() {
	const player = Session.Entity;
	return player ? Aim.project(player.position[0], player.position[1]) : null;
}

export default {
	prepare: function () {},

	dispose: function () {
		// What the gamepad drew or held open goes with it: the Support radial's overlay and its
		// portraits, and the emote grid, which otherwise stayed on screen taking every button.
		Support.dispose();
		EmoteGrid.close();
	},
	cancelQuick: false,
	executeShortcut: function (index, group) {
		const shortcut = ShortCut.getList()[index];
		if (!shortcut) {
			return;
		}

		// A skill waits in the support radial: the same shortcut again casts
		// it on yourself, another one replaces it.
		if (Support.isPending()) {
			if (Support.pendingIndex() === index) {
				Support.castPendingOnSelf();
				return;
			}
			Support.cancelPending(false);
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

		// Support skill in Support: tap for the focused member, hold for yourself
		if (this.watchSelfCastHold(index)) {
			return;
		}

		const quickCast = Aim.quickCastMode();
		if (quickCast === Aim.QUICK_CAST.INSTANT) {
			// Instant: a selected mob gets the skill wherever the cursor is
			// (it may have walked away from where the cycle left it); ground
			// skills land where the mob stands at the moment of the click.
			if (!this.castInSupport(index) && !this.castOnMarkedPlayer() && !this.castAtFocus()) {
				Cursor.quickCastClick(function () {
					Target.snapCursorToFocus();
				});
			}
		} else if (quickCast === Aim.QUICK_CAST.RELEASE) {
			this.cancelQuick = false;

			const waitforRelease = () => {
				setTimeout(() => {
					const buttons = Input.buttonStates;
					if (ShortcutMapper.getGroup(buttons) !== group) {
						if (!this.castInSupport(index) && !this.castOnMarkedPlayer() && !this.castOnAim()) {
							Cursor.quickCastClick();
						}
					} else if (!this.cancelQuick) {
						waitforRelease();
					}
				}, 50);
			};
			waitforRelease();
		}
	},

	/**
	 * Support category, a skill waiting for a friend or a place: cast it on
	 * the focused member (a ground skill where they stand), or with nobody
	 * focused open the radial with the skill pending. Enemy-only skills are
	 * left to the mob target.
	 *
	 * @param {number} index shortcut slot that cast the skill, -1 if unknown
	 * @return {boolean} whether Support took the skill
	 */
	castInSupport: function (index) {
		if (!Category.isSupport()) {
			return false;
		}
		const flag = SkillTargetSelection.getFlag();
		if (!flag) {
			return false;
		}

		// Holy Light in the middle of healing: with no mob picked, the
		// nearest one. The aim picks nothing in Support, so there would
		// otherwise be no target at all.
		if (!Support.isSupportSkill(flag)) {
			if (flag & SkillTargetSelection.TYPE.ENEMY && !Target.getAttackableFocus()) {
				const mob = Target.getEntity();
				if (mob && Target.isAttackable(mob)) {
					SkillTargetSelection.intersectEntityId(mob.GID);
					SkillTargetSelection.remove();
					return true;
				}
			}
			return false;
		}

		// A focus the skill cannot take (Heal on the dead) opens the radial instead
		const member = Support.getFocusForSkill();
		if (member) {
			return Support.castOn(member);
		}

		const shortcut = index >= 0 ? ShortCut.getList()[index] : null;
		const info = shortcut && shortcut.isSkill ? SkillInfo[shortcut.ID] : null;
		Support.openPending(index, info ? info.SkillName : '');
		return true;
	},

	/**
	 * Support category, a support skill waiting for its target: decide when
	 * the face button that cast it is let go. Released within
	 * SELF_CAST_HOLD_MS it goes the usual way (castInSupport: the focused
	 * member, or the radial); still held then, it is cast on yourself and
	 * the focus stays where it was.
	 *
	 * Quick-Cast Off is left alone: there the skill waits for A anyway.
	 *
	 * @param {number} index shortcut slot that cast the skill
	 * @return {boolean} whether the watch took over the cast
	 */
	watchSelfCastHold: function (index) {
		if (!Category.isSupport() || Aim.quickCastMode() === Aim.QUICK_CAST.OFF) {
			return false;
		}
		const flag = SkillTargetSelection.getFlag();
		if (!flag || !Support.isSupportSkill(flag)) {
			return false;
		}

		// The face button of the combo (logical A / B / X / Y)
		const states = Input.buttonStates || [];
		let face = -1;
		for (let i = 0; i < 4; i++) {
			if (states[i] && states[i] !== 'unpressed') {
				face = i;
				break;
			}
		}
		if (face === -1) {
			this.castInSupport(index);
			return true;
		}

		const startedAt = Date.now();
		// This watch belongs to this skill. Another shortcut within the hold window starts its
		// own watch and ends this one, so the old timer can't cast the new skill on the player
		// or open the radial with the old skill's slot.
		const token = ++selfCastWatch;
		const waiting = SkillTargetSelection.getSkill();
		const skid = waiting ? waiting.SKID : 0;
		const watch = () => {
			setTimeout(() => {
				// Cancelled meanwhile (Escape, another skill)
				const now = SkillTargetSelection.getSkill();
				if (token !== selfCastWatch || !SkillTargetSelection.getFlag() || !now || now.SKID !== skid) {
					return;
				}
				const held = (Input.buttonStates || [])[face];
				if (!held || held === 'unpressed') {
					this.castInSupport(index);
				} else if (Date.now() - startedAt >= SELF_CAST_HOLD_MS) {
					Support.castOn(Session.Entity);
				} else {
					watch();
				}
			}, HOLD_POLL_MS);
		};
		watch();
		return true;
	},

	/**
	 * Cast the skill waiting for a target on the focused mob, if it takes an
	 * enemy target. Goes through SkillTargetSelection's own entity check, as
	 * the party window does for its members.
	 *
	 * A focus that is not an attackable target (an NPC or friendly player
	 * the player clicked, or a stale focus from the previous map) is left
	 * alone and false returned, so the caller's quick-cast click runs
	 * instead of the skill being cancelled on a target it refuses.
	 *
	 * @return {boolean} whether the skill was cast
	 */
	castAtFocus: function () {
		const flag = SkillTargetSelection.getFlag();
		if (!(flag & SkillTargetSelection.TYPE.ENEMY) || flag & SkillTargetSelection.TYPE.PLACE) {
			return false;
		}

		const focus = Target.getAttackableFocus();
		if (!focus) {
			return false;
		}

		SkillTargetSelection.intersectEntityId(focus.GID);
		SkillTargetSelection.remove();
		return true;
	},

	/**
	 * A skill that takes a friend or a place waits while a player is
	 * marked (Players, NPCs & players): cast it on them, a ground skill
	 * where they stand. Over a window the click is meant for the window.
	 *
	 * @return {boolean} whether the skill was cast
	 */
	castOnMarkedPlayer: function () {
		const flag = SkillTargetSelection.getFlag();
		const player = Target.getMarkedPlayer();
		if (!flag || !player || !Support.isSupportSkill(flag)) {
			return false;
		}
		const el = Cursor.elementAtCursor();
		if (el && el.tagName.toLowerCase() !== 'canvas') {
			return false;
		}
		return Support.castOn(player);
	},

	/**
	 * A skill waits for a target while the right stick aims: cast it on the
	 * aimed target. The aim only moves the cursor onto the target while the
	 * stick is pushed, so a click at the cursor lands where the mob stood
	 * when the stick was let go; it has usually walked on, the click hits
	 * the ground, and the skill is dropped without a word.
	 *
	 * Enemy skills go straight to the target (castAtFocus). Anything else
	 * (ground skills, a refused focus) gets the cursor put on the target,
	 * and the caller's click follows. Over a window (a party member to
	 * heal, say) nothing changes: the click is meant for the window.
	 *
	 * @return {boolean} whether the skill was cast; false: click as usual
	 */
	castOnAim: function () {
		if (!Aim.isActive() || !SkillTargetSelection.getFlag()) {
			return false;
		}
		const el = Cursor.elementAtCursor();
		if (el && el.tagName.toLowerCase() !== 'canvas') {
			return false;
		}
		if (this.castAtFocus()) {
			return true;
		}
		Target.snapCursorToFocus();
		return false;
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

	/**
	 * A. With an NPC or portal selected (D-pad cycle / aim in the "NPCs and
	 * portals" mode) and the cursor over the map, a press talks to the NPC
	 * or walks into the portal, wherever the cursor is, and clears the
	 * selection so the next A is an ordinary click again (NPC dialogue
	 * buttons, for one). With a player selected it opens their shop or chat
	 * room, or else their menu (whisper, trade, party, ...), which the D-pad
	 * steps through. Otherwise A is a left click at the cursor; with a
	 * skill waiting for a target in aim mode, see castOnAim().
	 *
	 * @param {boolean} holding A held rather than freshly pressed
	 */
	leftClick: function (holding) {
		// A skill waiting in the support radial: cast it on the chosen member
		if (!holding && Support.confirmPending()) {
			return;
		}

		// A skill waiting for a target: a marked player, or the aimed target
		if (!holding && (this.castOnMarkedPlayer() || this.castOnAim())) {
			return;
		}

		// Quick-Cast off: a support skill waits for this press. Over the map
		// it goes to the focused member (or the radial); over a window (the
		// party window, say) the click is meant for the window.
		if (!holding && SkillTargetSelection.getFlag()) {
			const el = Cursor.elementAtCursor();
			if ((!el || el.tagName.toLowerCase() === 'canvas') && this.castInSupport(-1)) {
				return;
			}
		}

		const target = Target.getInteractTarget();
		if (target && !holding) {
			const el = Cursor.elementAtCursor();
			if (!el || el.tagName.toLowerCase() === 'canvas') {
				Session.moveAction = null;
				Target.releaseMark();
				target.onMouseDown();
				return;
			}
		}

		const player = Target.getMarkedPlayer();
		if (player && !holding && !SkillTargetSelection.getFlag()) {
			const el = Cursor.elementAtCursor();
			if (!el || el.tagName.toLowerCase() === 'canvas') {
				this.interactWithPlayer(player);
				return;
			}
		}
		Cursor.leftClick(holding);
	},

	/**
	 * A on a marked player: their vending shop, buying store or chat room
	 * if they have one open, as a click on its sign does; otherwise their
	 * right-click menu, opened at them. The mark stays, so a skill cast
	 * next still goes to them.
	 *
	 * @param {Entity} player
	 */
	interactWithPlayer: function (player) {
		// The sign over their head is shown and clickable (EntityRoom)
		const room = player.room;
		if (room && room.display && room.node && room.node.onEnter) {
			room.node.onEnter();
			return;
		}
		Cursor.moveMouseToEntity(player);
		player.onContextMenu();
	},

	/**
	 * Open or close a window, as its keyboard shortcut does (Alt+E, ...).
	 *
	 * @param {string} name UIManager component name
	 */
	toggleWindow: function (name) {
		try {
			const component = UIManager.getComponent(name);
			if (component && component.onShortCut) {
				component.onShortCut({ cmd: 'TOGGLE' });
			}
		} catch {
			// Component not available in this client version
		}
	},

	rightClick: function (holding) {
		// B with a skill pending in the support radial: cancel it
		if (!holding && Support.isPending()) {
			Support.cancelPending(true);
			return;
		}
		// B with the support radial open: close it
		if (!holding && Support.dismiss()) {
			return;
		}
		// B with a player's menu open: close it
		if (!holding && MenuNav.close()) {
			return;
		}
		Cursor.rightClick(holding);
	},

	/**
	 * Menu hold: the emote grid, below the character.
	 */
	openEmoteGrid: function () {
		EmoteGrid.open(playerFeet);
	},

	isEmoteGridOpen: function () {
		return EmoteGrid.isActive();
	},

	emoteGridInput: function (buttons) {
		EmoteGrid.handleInput(buttons);
	},

	/**
	 * L3 hold: sit down or stand up.
	 */
	toggleSit: function () {
		Character.toggleSit();
	},

	/**
	 * L3 tap: drop whatever is targeted, any category: the mob focus, a
	 * marked item / NPC / portal, the support focus, a pending skill.
	 */
	clearTarget: function () {
		Target.clearTarget();
		Support.clearFocus();
		Support.cancelPending(true);
	},

	/**
	 * RS hold: the virtual cursor back to the middle of the screen, onto the
	 * character.
	 */
	recenterCursor: function () {
		Cursor.recenter();
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
		// An open button menu (escape / death) takes the D-pad first
		if (MenuNav.navigate(direction)) {
			return true;
		}

		// Up / down switch the target category, unless a window wants them:
		// a grid under the cursor, the NPC dialogue choices, a text field
		if ((direction === 'up' || direction === 'down') && !this._uiWantsArrows()) {
			Category.step(direction, playerFeet);
			return true;
		}
		return Cursor.navigateDraggableItems(direction);
	},

	/**
	 * Whether D-pad up / down belong to the UI rather than the category
	 * switch: not in a map yet, the cursor on an item or skill grid, an NPC
	 * menu open, or typing in a field.
	 */
	_uiWantsArrows: function () {
		if (!Session.Entity) {
			return true;
		}

		const el = Cursor.elementAtCursor();
		if (el && el.closest && el.closest('.item, .skill')) {
			return true;
		}

		const active = typeof document !== 'undefined' ? document.activeElement : null;
		if (
			active &&
			(active.isContentEditable || ['input', 'textarea', 'select'].includes(active.tagName.toLowerCase()))
		) {
			return true;
		}

		try {
			const npcMenu = UIManager.getComponent('NpcMenu');
			const host = npcMenu && npcMenu._host;
			if (host && host.parentNode && host.style.display !== 'none') {
				return true;
			}
		} catch {
			// No NPC menu in this client version
		}
		return false;
	},

	/**
	 * D-pad left/right. If the virtual cursor is parked over an item or
	 * skill container, keep today's grid navigation so inventory nav still
	 * works with the D-pad. Over the world, cycle the targeted mob.
	 *
	 * @param {string} direction 'next' or 'prev'
	 */
	cycleTarget: function (direction) {
		if (MenuNav.navigate(direction === 'next' ? 'right' : 'left')) {
			return;
		}
		const el = Cursor.elementAtCursor();
		if (el && el.closest('.item, .skill')) {
			this.navigateDpad(direction === 'next' ? 'right' : 'left');
			return;
		}
		if (Category.isSupport()) {
			Support.cycle(direction);
			return;
		}
		Target.cycle(direction);
	},

	/**
	 * Right stick: aim line <-> virtual cursor. Back in cursor mode the
	 * cursor returns to the character, unless it was left on a window (the
	 * inventory, say), where it stays.
	 */
	toggleStickMode: function () {
		Aim.toggle();
		if (!Aim.isActive()) {
			const el = Cursor.elementAtCursor();
			if (!el || el.tagName.toLowerCase() === 'canvas') {
				Cursor.recenter();
			}
		}
	},

	moveCharacter: function (x, y) {
		Character.move(x, y);
	}
};
