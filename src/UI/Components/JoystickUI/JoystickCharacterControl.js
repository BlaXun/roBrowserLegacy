/**
 * UI/Components/JoystickUI/JoystickCharacterControl.js
 *
 * Handles character-specific actions triggered by joystick input,
 * including movement calculation, auto-attacking targeted entities,
 * and item pickup logic.
 *
 * @author AoShinHo
 */

import Session from 'Engine/SessionStorage.js';
import EntityManager from 'Renderer/EntityManager.js';
import Network from 'Network/NetworkManager.js';
import PACKET from 'Network/PacketStructure.js';
import PACKETVER from 'Network/PacketVerManager.js';
import glMatrix from 'Vendors/gl-matrix.js';
import Camera from 'Renderer/Camera.js';
import PathFinding from 'Utils/PathFinding.js';
import Target from './JoystickTargetService.js';

const direction = glMatrix.vec2.create();

// Set when X sends an attack; the left stick is ignored until it returns to
// centre. Players usually still hold the stick toward the mob as they press
// X, and every stick move would cut the walk to the target short.
let _stickHeld = false;

// GID of the last target X sent an attack to. A held X re-sends only when
// the target changes (e.g. the previous one died), not every poll.
let _lastAttackGid = null;

/**
 * Left stick is back inside the deadzone: stick moves are allowed again.
 */
function releaseStick() {
	_stickHeld = false;
}

function move(x, y) {
	const player = Session.Entity;
	if (!player || _stickHeld) {
		return;
	}

	// A stick move replaces whatever X queued for the end of its walk, like a
	// mouse click on the ground does (MapControl). Otherwise every stick walk
	// ends by sending the stale attack, the server answers "too far", the
	// client paths back to the mob, and the stick overrides it again: zigzag.
	Session.moveAction = null;
	_lastAttackGid = null;

	// The camera's modelView is Rx(angle[0]) . Ry(angle[1]), so a map step
	// lands on screen rotated by -angle[1]; an on-screen push therefore
	// becomes a map step through R(+angle[1]). This used to rotate by
	// Camera.direction, a 45 degree sprite bucket, so on maps that leave the
	// camera at a partial angle the walk was off by up to 22.5 degrees.
	// (The old mat2.rotate(-direction * 45) did turn the right way: this
	// gl-matrix's mat2.rotate is clockwise.)
	const angle = (Camera.angle[1] * Math.PI) / 180;
	direction[0] = x * Math.cos(angle) - y * Math.sin(angle);
	direction[1] = x * Math.sin(angle) + y * Math.cos(angle);

	const nx = Math.round(player.position[0] + direction[0] * 3);
	const ny = Math.round(player.position[1] + direction[1] * 3);

	const movePacket = PACKETVER.value >= 20180307 ? new PACKET.CZ.REQUEST_MOVE2() : new PACKET.CZ.REQUEST_MOVE();

	movePacket.dest[0] = nx;
	movePacket.dest[1] = ny;

	Network.sendPacket(movePacket);
}

/**
 * Attack the context target (focused/cycled mob, else per attackTargetMode).
 *
 * @param {boolean} repeat true while X is held: only attack when the target
 *   differs from the last one X attacked. The server keeps attacking on its
 *   own (action 7), so re-sending would only restart the walk.
 * @return {boolean} whether an attack was sent
 */
function attack(repeat) {
	const Player = Session.Entity;
	if (!Player) {
		return false;
	}

	const target = Target.getEntity();
	if (!target || target === Player) {
		return false;
	}

	if (repeat && target.GID === _lastAttackGid) {
		return false;
	}

	Target.focus(target);

	const entityFocus = EntityManager.getFocusEntity();
	if (!entityFocus) {
		return;
	}

	let pkt;
	const out = [];
	const count = PathFinding.search(
		Player.position[0] | 0,
		Player.position[1] | 0,
		entityFocus.position[0] | 0,
		entityFocus.position[1] | 0,
		Player.attack_range + 1,
		out
	);

	if (!count) {
		return false;
	}

	_lastAttackGid = entityFocus.GID;
	_stickHeld = true;

	if (PACKETVER.value >= 20180307) {
		pkt = new PACKET.CZ.REQUEST_ACT2();
	} else {
		pkt = new PACKET.CZ.REQUEST_ACT();
	}
	pkt.action = 7;
	pkt.targetGID = entityFocus.GID;

	// Already in range: same rule as EntityControl.onFocus() for a mouse
	// click (search used attack_range + 1, so a zero-length path means the
	// player is already close enough).
	if (count < 2) {
		Session.moveAction = null;
		Network.sendPacket(pkt);
		return true;
	}

	Session.moveAction = pkt;

	if (PACKETVER.value >= 20180307) {
		pkt = new PACKET.CZ.REQUEST_MOVE2();
	} else {
		pkt = new PACKET.CZ.REQUEST_MOVE();
	}
	pkt.dest[0] = out[(count - 1) * 2];
	pkt.dest[1] = out[(count - 1) * 2 + 1];
	Network.sendPacket(pkt);
	return true;
}

/**
 * Pick up the item the D-pad cycle rests on, else the closest one. Out of
 * reach (more than 2 cells, same rule as a mouse click in EntityControl),
 * walk to it first and let onWalkEnd send the pickup via Session.moveAction.
 */
function pickUp() {
	const Player = Session.Entity;
	if (!Player) {
		return;
	}

	const item = Target.getItem() || EntityManager.getClosestEntity(Player, Player.constructor.TYPE_ITEM);
	if (!item) {
		return;
	}

	let pkt = PACKETVER.value >= 20180307 ? new PACKET.CZ.ITEM_PICKUP2() : new PACKET.CZ.ITEM_PICKUP();
	pkt.ITAID = item.GID;

	Player.lookTo(item.position[0], item.position[1]);

	if (glMatrix.vec2.distance(Player.position, item.position) > 2) {
		Session.moveAction = pkt;

		pkt = PACKETVER.value >= 20180307 ? new PACKET.CZ.REQUEST_MOVE2() : new PACKET.CZ.REQUEST_MOVE();
		pkt.dest[0] = item.position[0] | 0;
		pkt.dest[1] = item.position[1] | 0;
	}

	Network.sendPacket(pkt);
}
/**
 * Sit down, or stand up when sitting (L3 hold): the /sit command's request.
 */
function toggleSit() {
	const Player = Session.Entity;
	if (!Player) {
		return;
	}

	const pkt = PACKETVER.value >= 20180307 ? new PACKET.CZ.REQUEST_ACT2() : new PACKET.CZ.REQUEST_ACT();
	pkt.action = Player.action === Player.ACTION.SIT ? 3 : 2; // 3 stand up, 2 sit down
	Network.sendPacket(pkt);
}

export default {
	attack: attack,
	toggleSit: toggleSit,
	pickUp: pickUp,
	move: move,
	releaseStick: releaseStick
};
