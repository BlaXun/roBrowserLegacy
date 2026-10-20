/**
 * Renderer/EntityWalk.js
 *
 * Manage entity walking action
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
 * @author Vincent Thibault
 */

import PathFinding from 'Utils/PathFinding.js';
import Altitude from 'Renderer/Map/Altitude.js';
import Session from 'Engine/SessionStorage.js';
import Configs from 'Core/Configs.js';

/**
 * Direction look up table
 */
const DIRECTION = [
	[1, 2, 3],
	[0, 0, 4],
	[7, 6, 5]
];

// Server C++ uses a fixed 1.414 approximation for diagonals in path duration
const DIAGONAL_FACTOR = 1.414;

// Headroom over the measured round trip before a walk's age stops being read as
// network delay: a frame or two, plus the server's own processing.
const LATENCY_SLACK_MS = 100;

// How far a walk's pace may be stretched to meet the server's arrival time:
// from twice the walk speed (catching up) to half of it (letting it catch up).
const MIN_PACE = 0.5;
const MAX_PACE = 2;

// rAthena's walk request limits (battle_config.max_walk_path, OFFICIAL_WALKPATH):
// a path of more steps is refused, and over 14 only in a straight line.
const SERVER_MAX_WALK_PATH = 17;
const SERVER_MAX_BENT_PATH = 14;

// A STOPMOVE this close to where the entity is drawn glides there instead of
// jumping, for at most this long.
const SETTLE_MAX_CELLS = 2;
const SETTLE_MAX_MS = 200;

// Facing behavior (official-like):
// - First segment: continuous heading toward next tile center.
// - Later segments: snap to 8-way direction per segment offset.

/**
 * Estimate total walk duration for a path, in ms.
 * `total` is the number of coordinate entries in `path` (walk.total).
 */
function estimatePathDuration(path, total, baseSpeed, startPos) {
	if (!total || total < 4 || !baseSpeed) {
		return baseSpeed || 0;
	}

	let duration = 0;

	// First Segment: Exact float distance
	// path[0/1] is the integer start cell, but startPos is the entity's actual float position.
	// path[2/3] is the first target cell.
	const sx = startPos ? startPos[0] : path[0];
	const sy = startPos ? startPos[1] : path[1];
	const ex = path[2];
	const ey = path[3];

	const dx = ex - sx;
	const dy = ey - sy;
	const distFirst = Math.sqrt(dx * dx + dy * dy);

	duration += distFirst * baseSpeed;

	// Remaining Segments: Grid logic
	// Starts from index 2 (node 1 to node 2)
	for (let i = 2; i < total - 2; i += 2) {
		const segDx = path[i + 2] - path[i];
		const segDy = path[i + 3] - path[i + 1];

		if (segDx && segDy) {
			// Diagonal
			duration += baseSpeed * DIAGONAL_FACTOR;
		} else {
			// Straight
			duration += baseSpeed;
		}
	}

	return duration;
}

/**
 * Convert a server moveStartTime to a client tick so we can fast-forward
 * the walk based on latency.
 */
function computeWalkStartTick(nowTick, moveStartTime, pathDuration, maxClamp) {
	// Not `!Session.serverTick`: that is non-zero from the first frame, because
	// it counts from the renderer starting. Until a pong lands it is not the
	// server's clock, and subtracting a server tick from it is meaningless.
	if (!moveStartTime || !Session || !Session.serverTickSynced) {
		return nowTick;
	}

	let elapsed = Session.serverTick - moveStartTime;
	if (!isFinite(elapsed) || elapsed <= 0) {
		return nowTick;
	}

	// Only network delay can make a walk older than it looks, and the ping
	// measures that. Between pongs serverTick runs on this machine's clock, so a
	// server whose clock runs at a different rate drifts from it: a VM guest that
	// failed to calibrate its TSC ran at 0.889x, which puts the estimate up to a
	// second ahead by the next 10 s pong. A player-like walk was then drawn that
	// far down its path and snapped back on the next update -- a teleport.
	const roundTrip = Session.ping && Session.ping.value > 0 ? Session.ping.value : 0;
	elapsed = Math.min(elapsed, roundTrip + LATENCY_SLACK_MS);

	if (pathDuration && pathDuration > 0) {
		// If the delta is wildly larger than the path duration, serverTick is probably not aligned.
		if (elapsed > pathDuration * 4) {
			return nowTick;
		}
		elapsed = Math.min(elapsed, typeof maxClamp === 'number' ? maxClamp : pathDuration);
	} else {
		elapsed = Math.min(elapsed, typeof maxClamp === 'number' ? maxClamp : 1000);
	}

	return nowTick - elapsed;
}

/**
 * WalkStructure — pathfinding movement controller for entity walking
 *
 * @class WalkStructure
 * @property {number} speed Movement speed in ms per cell
 * @property {number} tick Walk movement start tick
 * @property {number} prevTick Previous tick frame
 * @property {number} dist Walk distance accumulated in map cells
 * @property {Int16Array} path Array of cell coordinate pairs [x0, y0, x1, y1, ...]
 * @property {Float32Array} pos [x, y, z] target position
 * @property {Float32Array} lastPos [x, y, z] previous position
 * @property {function|null} onEnd Callback fired when entity reaches path end
 * @property {number} index Current segment index in path
 * @property {number} total Total number of coordinate values in path
 * @property {boolean} settling Gliding to rest on a cell the server named
 * @property {object|null} predicted A walk the server has not confirmed yet:
 *   { queue: [[x, y], ...] cells requested, fallback: [x, y] where the server
 *   has the entity, deadline: tick after which it walks back }
 */
function WalkStructure() {
	this.speed = 150;
	this.tick = 0;
	this.prevTick = 0;
	this.dist = 0;
	this.path = new Int16Array(PathFinding.MAX_WALKPATH * 2);
	this.segmentDurations = new Float32Array(PathFinding.MAX_WALKPATH);
	this.pos = new Float32Array(3);
	this.lastPos = new Float32Array(3);
	this.onEnd = null;
	this.index = 0;
	this.total = 0;
	this.settling = false;
	this.predicted = null;
	this.stuckWarned = false;
}

/**
 * Convert dx/dy offset to a floating-point direction in [0..8).
 * 0 = south, 2 = west, 4 = north, 6 = east (matching DIRECTION table).
 */
function offsetToFloatDir(dx, dy) {
	if (dx === 0 && dy === 0) {
		return 0;
	}
	// atan2: 0=+X (east), PI/2=+Y (north), PI=-X (west), -PI/2=-Y (south)
	// We need: 6=east, 4=north, 2=west, 0=south (RO direction indexing).
	// Formula: dir = ((-angle)/(PI/4) + 6) mod 8
	const angle = Math.atan2(dy, dx);
	let dir = (-angle / (Math.PI / 4) + 6) % 8;
	if (dir < 0) {
		dir += 8;
	}
	return dir;
}

/**
 * Quantize floating-point direction to integer [0..7].
 */
function quantizeDir(floatDir) {
	return Math.round(floatDir) % 8;
}

/**
 * Want to move non walkable cell
 *
 * @param {number} from_x
 * @param {number} from_y
 * @param {number} to_x
 * @param {number} to_y
 * @param {number} range optional
 * @param {bool} isOverShoot use for falcon
 * @param {bool} isAttacking falcon = set walk / wug = set attack
 */
function walkToNonWalkableGround(
	from_x,
	from_y,
	to_x,
	to_y,
	range,
	isOverShoot = false,
	isAttacking = false,
	moveStartTime
) {
	const hadRoute = this.walk && this.walk.total > 0;

	this.resetRoute(hadRoute);

	this.isAttacking = isAttacking;

	// calculate overshoot (only falcon)
	if (this.objecttype === this.constructor.TYPE_FALCON && isOverShoot) {
		const OverShootPosition = calculateOverShot(from_x, from_y, to_x, to_y);
		to_x = OverShootPosition[0];
		to_y = OverShootPosition[1];
	}

	// Same position
	if (from_x === to_x && from_y === to_y) {
		return;
	}

	const path = this.walk.path;
	let total = 0;
	const result = PathFinding.searchLongIgnoreCellType(
		from_x | 0,
		from_y | 0,
		to_x | 0,
		to_y | 0,
		range || 0,
		path,
		true
	);

	if (result.success) {
		total = result.pathLength + 1;
	}

	this.walk.index = 1 * 2; // skip first index
	this.walk.total = total * 2;
	if (total > 0) {
		this.walk.pos.set(this.position);
		const numSegments = total - 1;
		for (let i = 0; i < numSegments; i++) {
			const pIdx = (i + 1) * 2;
			const segDx = path[pIdx] - (i === 0 ? this.position[0] : path[pIdx - 2]);
			const segDy = path[pIdx + 1] - (i === 0 ? this.position[1] : path[pIdx - 1]);
			const segDist = Math.hypot(segDx, segDy);
			this.walk.segmentDurations[i] = segDist * this.walk.speed;
		}
		const nowTick = Date.now();
		const pathDuration = estimatePathDuration(this.walk.path, this.walk.total, this.walk.speed, this.position);
		const isPlayerLike =
			this.objecttype === this.constructor.TYPE_PC ||
			this.objecttype === this.constructor.TYPE_DISGUISED ||
			this.objecttype === this.constructor.TYPE_PET ||
			this.objecttype === this.constructor.TYPE_HOM ||
			this.objecttype === this.constructor.TYPE_MERC;
		// For non-player entities we only fast-forward up to one step worth of time.
		// Their client-side path can diverge from the server due to dynamic obstacles,
		// and over-fast-forwarding makes STOPMOVE snaps more visible.
		const maxFastForward = isPlayerLike ? pathDuration : Math.min(pathDuration, this.walk.speed);
		const startTick = computeWalkStartTick(nowTick, moveStartTime, pathDuration, maxFastForward);
		this.walk.tick = this.walk.prevTick = startTick;

		// Keep distance accumulation if we were already walking to avoid animation restarts.
		if (!hadRoute) {
			this.walk.dist = 0;
		}
		this.walk.lastPos.set(this.position);

		// Initialize facing for the first segment (continuous heading handled in walkProcess).
		if (this.walk.total >= 2) {
			const firstX0 = this.walk.path[2];
			const firstY0 = this.walk.path[3];
			const initDir0 = offsetToFloatDir(firstX0 - this.position[0], firstY0 - this.position[1]);
			this.direction = quantizeDir(initDir0);
		}

		let action = this.ACTION.WALK;
		if (this.objecttype === this.constructor.TYPE_FALCON && !isAttacking) {
			// falcon: action.walk = gliding
			action = this.ACTION.IDLE;
		}

		if (this.objecttype == this.constructor.TYPE_WUG && isAttacking) {
			this.setAction({
				action: this.ACTION.WALK,
				frame: 0,
				repeat: true,
				play: true,
				next: {
					delay: Date.now() + 200,
					action: this.ACTION.ATTACK,
					frame: 0,
					repeat: false,
					play: true,
					next: {
						delay: Date.now() + 432,
						action: this.ACTION.IDLE,
						frame: 0,
						repeat: true,
						play: true,
						next: false
					}
				}
			});
			setTimeout(() => {
				this.walkToNonWalkableGround(
					this.position[0],
					this.position[1],
					this._followTargetX,
					this._followTargetY,
					0,
					false,
					false
				);
			}, 632);
		} else if (this.objecttype == this.constructor.TYPE_FALCON && isAttacking) {
			this.setAction({
				action: this.ACTION.WALK,
				frame: 0,
				repeat: true,
				play: true,
				next: {
					delay: Date.now() + 432,
					action: this.ACTION.IDLE,
					frame: 0,
					repeat: false,
					play: true,
					next: false
				}
			});
			setTimeout(() => {
				this.walkToNonWalkableGround(
					this.position[0],
					this.position[1],
					this._followTargetX,
					this._followTargetY,
					0,
					false,
					false
				);
			}, 432);
		} else if (this.action !== action) {
			this.setAction({
				action: action,
				frame: 0,
				repeat: true,
				play: true
			});
		}
	}
}

/**
 * Want to move to a cell
 *
 * @param {number} from_x
 * @param {number} from_y
 * @param {number} to_x
 * @param {number} to_y
 * @param {number} range optional
 * @param {number} [moveStartTime]
 * @param {number} [moveEndTime]
 * @param {boolean} [isFastMove=false]
 * @param {number} [fastSpeed]
 * @param {boolean} [isPrediction=false] a walk the client starts before the server answers
 */
function walkTo(from_x, from_y, to_x, to_y, range, moveStartTime, moveEndTime, isFastMove, fastSpeed, isPrediction) {
	// A reply to a request older than the one being predicted: the newer
	// request's reply will follow, so keep walking where the player last clicked.
	if (!isPrediction && this.walk.predicted && answersOlderRequest(this.walk.predicted, to_x, to_y)) {
		return;
	}

	// Same position
	if (from_x === to_x && from_y === to_y) {
		if (!isPrediction && this.walk.predicted) {
			this.settleTo(to_x, to_y);
		}
		return;
	}

	const curX = this.position[0];
	const curY = this.position[1];
	const hasCurrentPos = isFinite(curX) && isFinite(curY) && (curX !== 0 || curY !== 0);
	const curCellX = Math.round(curX);
	const curCellY = Math.round(curY);
	const distFromStart = hasCurrentPos ? Math.hypot(curCellX - from_x, curCellY - from_y) : Infinity;

	// If entity is completely uninitialized or too far (> 16 cells, e.g. warp/teleport), snap to server start
	if (distFromStart > 16 || !hasCurrentPos) {
		this.position[0] = from_x;
		this.position[1] = from_y;
		this.position[2] = Altitude.getCellHeight(from_x, from_y);
	}

	const hadRoute = this.walk && this.walk.total > 0;
	const wasWalkingAction = this.action === this.ACTION.WALK;

	this.resetRoute(hadRoute);

	if (isFastMove) {
		if (!this.isFastMoving) {
			this._normalSpeed = this.walk.speed;
		}
		this.isFastMoving = true;
		this._fastMoveTrail = true;
		if (fastSpeed) {
			this.walk.speed = fastSpeed;
		}
	}

	const path = this.walk.path;
	let total = 0;
	let usedFallback = false;

	// Ground Truth / Canonical C++ behavior (GameModePacket.cpp / Pc.cpp / GameActor.cpp):
	// When moving, the official client first attempts to find the path starting from the actor's
	// current coordinates (curCellX, curCellY) to destination (to_x, to_y).
	if (distFromStart <= 16 && hasCurrentPos) {
		total = PathFinding.search(curCellX, curCellY, to_x | 0, to_y | 0, range || 0, path);
	}

	// Fallback to server start point if path from current pos was not found
	if (!total) {
		total = PathFinding.search(from_x | 0, from_y | 0, to_x | 0, to_y | 0, range || 0, path);
		if (total) {
			usedFallback = true;
		}
	}

	if (usedFallback) {
		this.position[0] = from_x;
		this.position[1] = from_y;
		this.position[2] = Altitude.getCellHeight(from_x, from_y);
	}

	this.walk.index = 1 * 2; // skip first index
	this.walk.total = total * 2;

	if (total) {
		this.walk.pos.set(this.position);
		if (!hadRoute || usedFallback) {
			this.walk.dist = 0;
		}
		this.walk.lastPos.set(this.position);

		const numSegments = total - 1;
		let clientDuration = 0;

		// First segment: based on Euclidean distance from actual entity float position to first waypoint
		// (Matching C++ CPathFinder::GetSecondNodeArrivalTime).
		const firstDx = path[2] - this.position[0];
		const firstDy = path[3] - this.position[1];
		const firstDist = Math.hypot(firstDx, firstDy);
		const firstSegDuration = firstDist * this.walk.speed;
		this.walk.segmentDurations[0] = firstSegDuration;
		clientDuration += firstSegDuration;

		// Subsequent segments: standard grid distance (diagonal = 1.414 * speed)
		for (let i = 1; i < numSegments; i++) {
			const pIdx = (i + 1) * 2;
			const segDx = path[pIdx] - path[pIdx - 2];
			const segDy = path[pIdx + 1] - path[pIdx - 1];
			const segDur = segDx && segDy ? this.walk.speed * DIAGONAL_FACTOR : this.walk.speed;
			this.walk.segmentDurations[i] = segDur;
			clientDuration += segDur;
		}

		// Move prediction (off by default) blends a server walk into the one drawn;
		// without it, the walk keeps the timing it always had.
		if (isPrediction || Configs.get('movePrediction', false)) {
			// How long the server takes over its path: the packet's end time when it
			// has one, else the cost of its path from its start cell. That is the
			// path above when both start on the same cell; from another cell, the
			// straight-line cost stands in for it, rather than a second search.
			let serverDuration = 0;
			if (!isFastMove && !isPrediction) {
				if (moveEndTime && moveStartTime && moveEndTime > moveStartTime) {
					serverDuration = moveEndTime - moveStartTime;
				} else if (usedFallback || (curCellX === from_x && curCellY === from_y)) {
					serverDuration = gridPathDuration(path, total, this.walk.speed);
				} else {
					const sDx = Math.abs(to_x - from_x);
					const sDy = Math.abs(to_y - from_y);
					const diag = Math.min(sDx, sDy);
					serverDuration =
						(Math.max(sDx, sDy) - diag) * this.walk.speed + diag * this.walk.speed * DIAGONAL_FACTOR;
				}
			}

			// The walk starts from where the entity is drawn, now, never ahead of it:
			// rolling its start back by the packet's age jumped it forward on every
			// move packet. Time the server has already walked is made up by pace.
			const nowTick = Date.now();
			this.walk.tick = this.walk.prevTick = nowTick;

			// Ground Truth / Canonical C++ FixPathTime (PathFinder.cpp line 119):
			// stretch the segments so the client arrives when the server does, less
			// the time the packet took to get here. Scaling keeps the pace even
			// across segments. Fast movement / Body Relocation skips FixPathTime entirely.
			// Other entities make up at most one cell's worth: their path can differ
			// from the server's around other entities, and a long catch-up makes
			// the STOPMOVE that corrects it more visible.
			if (serverDuration > 0 && numSegments > 0 && clientDuration > 0) {
				const isPlayerLike =
					this.objecttype === this.constructor.TYPE_PC ||
					this.objecttype === this.constructor.TYPE_DISGUISED ||
					this.objecttype === this.constructor.TYPE_PET ||
					this.objecttype === this.constructor.TYPE_HOM ||
					this.objecttype === this.constructor.TYPE_MERC;
				const maxCatchUp = isPlayerLike ? serverDuration : Math.min(serverDuration, this.walk.speed);
				const elapsed = nowTick - computeWalkStartTick(nowTick, moveStartTime, serverDuration, maxCatchUp);
				const pace = Math.max(MIN_PACE, Math.min(MAX_PACE, (serverDuration - elapsed) / clientDuration));
				for (let i = 0; i < numSegments; i++) {
					this.walk.segmentDurations[i] = Math.max(1, this.walk.segmentDurations[i] * pace);
				}
			}
		} else {
			// Estimate expected server duration
			let serverDuration = 0;
			if (!isFastMove) {
				if (moveEndTime && moveStartTime && moveEndTime > moveStartTime) {
					serverDuration = moveEndTime - moveStartTime;
				} else {
					const sDx = to_x - from_x;
					const sDy = to_y - from_y;
					const straight = Math.abs(Math.abs(sDx) - Math.abs(sDy));
					const diag = Math.min(Math.abs(sDx), Math.abs(sDy));
					serverDuration = straight * this.walk.speed + diag * this.walk.speed * DIAGONAL_FACTOR;
				}
			}

			const nowTick = Date.now();
			const isPlayerLike =
				this.objecttype === this.constructor.TYPE_PC ||
				this.objecttype === this.constructor.TYPE_DISGUISED ||
				this.objecttype === this.constructor.TYPE_PET ||
				this.objecttype === this.constructor.TYPE_HOM ||
				this.objecttype === this.constructor.TYPE_MERC;
			const maxFastForward = isFastMove
				? 0
				: isPlayerLike
					? clientDuration
					: Math.min(clientDuration, this.walk.speed);
			const startTick = isFastMove
				? nowTick
				: computeWalkStartTick(nowTick, moveStartTime, clientDuration, maxFastForward);
			this.walk.tick = this.walk.prevTick = startTick;

			// Ground Truth / Canonical C++ FixPathTime (PathFinder.cpp line 119):
			// Proportionally adjust segment durations so that the client arrives at destination
			// at the exact timestamp prescribed by the server, creating smooth rubberbanding without jumping.
			// Fast movement / Body Relocation skips FixPathTime entirely.
			if (!isFastMove && numSegments > 0 && serverDuration > 0) {
				let sub = serverDuration - clientDuration;
				// Clamp sub to ±2500ms to avoid speed extremes during large desyncs
				sub = Math.max(-2500, Math.min(2500, sub));
				const subDiv = sub / numSegments;
				for (let i = 0; i < numSegments; i++) {
					this.walk.segmentDurations[i] = Math.max(10, this.walk.segmentDurations[i] + subDiv);
				}
			}
		}

		// Initialize facing for the first segment (continuous heading handled in walkProcess).
		if (this.walk.total >= 2) {
			const firstX1 = this.walk.path[2];
			const firstY1 = this.walk.path[3];
			const initDir1 = offsetToFloatDir(firstX1 - this.position[0], firstY1 - this.position[1]);
			this.direction = quantizeDir(initDir1);
		}
		this.headDir = 0;

		// Only set action if not already walking
		if (!wasWalkingAction && !isFastMove) {
			this.setAction({
				action: this.ACTION.WALK,
				frame: 0,
				repeat: true,
				play: true
			});
		}
	}
}

/**
 * Scratch path for checking a clicked walk the way the server would.
 */
const _serverPath = new Int16Array(PathFinding.MAX_WALKPATH * 2);

/**
 * Walk time of a cell path, as the server counts it.
 *
 * @param {Int16Array} path cell pairs
 * @param {number} total number of cells in path
 * @param {number} speed ms per cell
 * @returns {number} ms
 */
function gridPathDuration(path, total, speed) {
	let duration = 0;
	for (let i = 1; i < total; i++) {
		const diagonal = path[i * 2] !== path[i * 2 - 2] && path[i * 2 + 1] !== path[i * 2 - 1];
		duration += diagonal ? speed * DIAGONAL_FACTOR : speed;
	}
	return duration;
}

/**
 * Whether a move reply answers a request older than the newest one predicted.
 * Drops the requests it answers, and remembers its destination as where the
 * server is taking the entity.
 */
function answersOlderRequest(predicted, to_x, to_y) {
	const queue = predicted.queue;
	for (let i = queue.length - 2; i >= 0; i--) {
		if (queue[i][0] === to_x && queue[i][1] === to_y) {
			queue.splice(0, i + 1);
			predicted.fallback = [to_x, to_y];
			return true;
		}
	}
	return false;
}

/**
 * Start walking to a cell the player clicked, before the server answers.
 * The server's reply (walkTo) then takes over the walk where it is drawn and
 * evens out the pace; if no reply comes within `timeout`, the entity walks
 * back to where the server has it.
 *
 * @param {number} to_x
 * @param {number} to_y
 * @param {number} timeout ms to wait for the server's reply
 * @returns {boolean} whether a walk started
 */
function predictWalkTo(to_x, to_y, timeout) {
	const walk = this.walk;
	const action = this.action;

	// Only from where the server would also start a walk right away.
	if (
		this.isFastMoving ||
		this._bodyState ||
		(this.cast && this.cast.display) ||
		(action !== this.ACTION.IDLE && action !== this.ACTION.WALK && action !== this.ACTION.READYFIGHT)
	) {
		return false;
	}

	const curX = Math.round(this.position[0]);
	const curY = Math.round(this.position[1]);
	if (curX === to_x && curY === to_y) {
		return false;
	}

	// Already on the way there: holding the mouse resends the same cell.
	if (walk.total > 0 && walk.path[walk.total - 2] === to_x && walk.path[walk.total - 1] === to_y) {
		return false;
	}

	// A walk the server would refuse, it should not be seen to start.
	const steps = PathFinding.search(curX, curY, to_x, to_y, 0, _serverPath) - 1;
	if (
		steps < 1 ||
		steps > SERVER_MAX_WALK_PATH ||
		(steps > SERVER_MAX_BENT_PATH && !PathFinding.searchLong(curX, curY, to_x, to_y, 0, _serverPath).success)
	) {
		return false;
	}

	// Where the server has the entity until it answers: the end of the walk
	// it confirmed, or the cell it stands on.
	const predicted = walk.predicted;
	const fallback = predicted
		? predicted.fallback
		: walk.total > 0
			? [walk.path[walk.total - 2], walk.path[walk.total - 1]]
			: [curX, curY];
	const queue = predicted ? predicted.queue : [];

	this.walkTo(curX, curY, to_x, to_y, 0, undefined, undefined, false, undefined, true);
	if (!walk.total) {
		return false;
	}

	queue.push([to_x, to_y]);
	walk.predicted = { queue, fallback, deadline: Date.now() + timeout };
	return true;
}

/**
 * Give up a prediction the server never confirmed: walk back to where the
 * server has the entity.
 */
function cancelPrediction() {
	const fallback = this.walk.predicted.fallback;
	this.walk.predicted = null;

	// Dead or sitting: put it where the server has it, without a walk.
	if (this.action === this.ACTION.DIE || this.action === this.ACTION.SIT) {
		this.resetRoute();
		this.position[0] = fallback[0];
		this.position[1] = fallback[1];
		this.position[2] = Altitude.getCellHeight(fallback[0], fallback[1]);
		return;
	}

	const curX = Math.round(this.position[0]);
	const curY = Math.round(this.position[1]);
	if (curX === fallback[0] && curY === fallback[1]) {
		this.settleTo(fallback[0], fallback[1]);
		return;
	}

	this.walkTo(curX, curY, fallback[0], fallback[1]);
	if (!this.walk.total) {
		this.settleTo(fallback[0], fallback[1]);
	}
}

/**
 * Come to rest on a cell the server named (STOPMOVE). Close by, the entity
 * glides there, at most at its walk speed and within SETTLE_MAX_MS, rather
 * than jumping. Whatever action it is in carries on; a walk ends in IDLE on
 * arrival.
 *
 * @param {number} x
 * @param {number} y
 * @returns {boolean} true if gliding, false if the entity was placed at once
 */
function settleTo(x, y) {
	const dx = x - this.position[0];
	const dy = y - this.position[1];
	const dist = Math.hypot(dx, dy);
	const canGlide = isFinite(dist) && dist > 0.05 && dist <= SETTLE_MAX_CELLS && this.walk.speed > 0;

	this.resetRoute();

	if (!canGlide) {
		this.position[0] = x;
		this.position[1] = y;
		this.position[2] = Altitude.getCellHeight(x, y);
		if (this.action === this.ACTION.WALK) {
			this.setAction({ action: this.ACTION.IDLE, frame: 0, play: true, repeat: true });
		}
		return false;
	}

	const walk = this.walk;
	walk.path[0] = Math.round(this.position[0]);
	walk.path[1] = Math.round(this.position[1]);
	walk.path[2] = x;
	walk.path[3] = y;
	walk.index = 2;
	walk.total = 4;
	walk.pos.set(this.position);
	walk.lastPos.set(this.position);
	walk.segmentDurations[0] = Math.min(dist * walk.speed, SETTLE_MAX_MS);
	walk.tick = walk.prevTick = Date.now();
	walk.settling = true;
	// Face the way it was going: a turn for a fraction of a cell reads as a twitch.
	this._preserveDirection = true;
	return true;
}

/**
 * Fast move / forced relocation to a destination cell (e.g. MO_BODYRELOCATION, knockback, slide).
 * Bypasses regular rubberbanding, latency compensation, and walk animation cycles.
 * Uses direct linear interpolation between current position and destination cell (no curved walking detours).
 *
 * @param {number} to_x Destination X cell
 * @param {number} to_y Destination Y cell
 * @param {number} [speed=15] Speed in ms per cell
 * @param {function} [onEnd] Callback when relocation finishes
 * @param {boolean} [keepDirection=false] Whether to preserve current facing direction (e.g. knockback/backslide)
 * @returns {boolean} True if fast movement started, false if already at destination (no-op)
 */
function fastMoveTo(to_x, to_y, speed = 15, onEnd, keepDirection = false) {
	const curX = this.position[0];
	const curY = this.position[1];
	const hasCurrentPos = isFinite(curX) && isFinite(curY) && (curX !== 0 || curY !== 0);
	const curCellX = hasCurrentPos ? Math.round(curX) : to_x | 0;
	const curCellY = hasCurrentPos ? Math.round(curY) : to_y | 0;

	if (curCellX === (to_x | 0) && curCellY === (to_y | 0)) {
		this.resetRoute();
		if (this.action !== this.ACTION.DIE && (!this.animation.play || this.action === this.ACTION.WALK)) {
			this.setAction({
				action: this.ACTION.IDLE,
				frame: 0,
				play: true,
				repeat: true
			});
		}
		if (onEnd) {
			onEnd();
		}
		return false;
	}

	this.resetRoute();

	if (!this.isFastMoving) {
		this._normalSpeed = this.walk.speed;
	}
	this.isFastMoving = true;
	this._preserveDirection = !!keepDirection;
	this.walk.speed = speed || 15;

	// If character was currently walking, transition out of WALK to avoid leg cycling
	if (this.action === this.ACTION.WALK) {
		this.setAction({
			action: this.ACTION.IDLE
		});
	}

	// Direct linear interpolation (straight line path, avoiding curved A* walking detours)
	const path = this.walk.path;
	path[0] = curCellX;
	path[1] = curCellY;
	path[2] = to_x | 0;
	path[3] = to_y | 0;

	const total = 2;
	this.walk.index = 1 * 2; // skip first index (curCellX, curCellY), target is index 2
	this.walk.total = total * 2; // 4 coordinates
	this.walk.pos.set(this.position);
	this.walk.lastPos.set(this.position);
	this.walk.dist = 0;

	const firstDx = path[2] - this.position[0];
	const firstDy = path[3] - this.position[1];
	this.walk.segmentDurations[0] = Math.max(1, Math.hypot(firstDx, firstDy) * this.walk.speed);

	const nowTick = Date.now();
	this.walk.tick = this.walk.prevTick = nowTick;

	if (!this._preserveDirection) {
		const initDir = offsetToFloatDir(firstDx, firstDy);
		this.direction = quantizeDir(initDir);
		this.headDir = 0;
	}

	if (onEnd) {
		this.walk.onEnd = onEnd;
	}

	return true;
}

/**
 * Process walking
 */
function walkProcess() {
	const pos = this.position;
	const walk = this.walk;
	const path = walk.path;
	let index = walk.index;
	const total = walk.total;

	const TICK = Date.now();
	const falconGliding = 5;

	// Checked with no route too: a short walk, or one a hit stopped, ends before
	// the deadline, and the server may still not have taken it.
	if (walk.predicted && TICK > walk.predicted.deadline) {
		this.cancelPrediction();
		return;
	}

	if (total == 0) {
		return;
	}

	if (
		total > 0 &&
		!this.isFastMoving &&
		!walk.settling &&
		this.action !== this.ACTION.WALK &&
		this.objecttype !== this.constructor.TYPE_FALCON &&
		this.objecttype !== this.constructor.TYPE_WUG &&
		!walk.stuckWarned
	) {
		// Once until the route is reset: a stuck entity stays stuck every frame,
		// and warning each frame flooded the console and the heap.
		walk.stuckWarned = true;
		let actionName = 'UNKNOWN';
		for (const key in this.ACTION) {
			if (this.ACTION[key] === this.action) {
				actionName = key;
				break;
			}
		}

		console.warn('🚨 CHARACTER STUCK IN WALKING ANIMATION - SHARE DETAILS AT ROBROWSER GITHUB:', {
			GID: this.GID,
			nome: this.display ? this.display.name : 'N/A',
			action: this.action,
			actionName: actionName,
			walkTotal: total,
			walkIndex: index,
			position: [Math.round(pos[0]), Math.round(pos[1])],
			objecttype: this.objecttype,
			timestamp: new Date().toISOString()
		});

		console.trace('Stack trace of debug:');
	}

	if (
		this.action === this.ACTION.WALK ||
		this.isFastMoving ||
		walk.settling ||
		this.objecttype === this.constructor.TYPE_FALCON ||
		this.objecttype === this.constructor.TYPE_WUG
	) {
		const getSegmentDuration = function getSegmentDuration(dx, dy, baseSpeed) {
			let duration = dx && dy ? baseSpeed * Math.SQRT2 : baseSpeed;
			if (!duration || duration < 1) {
				duration = 1;
			}
			return duration;
		};

		const finishWalk = () => {
			const cellHeight =
				this.objecttype == this.constructor.TYPE_FALCON
					? Altitude.getCellHeight(path[total - 2], path[total - 1]) + 5
					: Altitude.getCellHeight(path[total - 2], path[total - 1]);

			pos[0] = path[total - 2];
			pos[1] = path[total - 1];
			pos[2] = cellHeight;
			walk.lastPos.set(pos);

			if (this.isFastMoving) {
				this.isFastMoving = false;
				this._fastMoveTrail = false;
				this._preserveDirection = false;
				if (typeof this._normalSpeed === 'number') {
					this.walk.speed = this._normalSpeed;
					delete this._normalSpeed;
				}
			}

			if (this.objecttype == this.constructor.TYPE_WUG && this.isAttacking) {
				this.setAction({
					action: this.ACTION.ATTACK,
					frame: 0,
					repeat: false,
					play: true,
					next: {
						delay: Date.now() + 432,
						action: this.ACTION.IDLE,
						frame: 0,
						repeat: false,
						play: true,
						next: false
					}
				});
			} else if (walk.settling ? this.action === this.ACTION.WALK : this.action !== this.ACTION.DIE) {
				// A glide to rest leaves whatever the entity started meanwhile, an attack say.
				this.setAction({
					action: this.ACTION.IDLE,
					frame: 0,
					play: true,
					repeat: true
				});
			}

			this.onWalkEnd();

			// Temporary callback
			if (walk.onEnd) {
				walk.onEnd();
				walk.onEnd = null;
			}

			// Arriving is not the server agreeing: keep waiting for its reply.
			const predicted = walk.predicted;
			this.resetRoute();
			walk.predicted = predicted;
			this.isAttacking = false;
		};

		if (index >= total) {
			finishWalk();
			return;
		}

		let startX = walk.pos[0];
		let startY = walk.pos[1];
		let nextX = path[index + 0];
		let nextY = path[index + 1];
		let dx = nextX - startX;
		let dy = nextY - startY;
		let segIdx = (index - 2) >> 1;
		let speed = (walk.segmentDurations && walk.segmentDurations[segIdx]) || getSegmentDuration(dx, dy, walk.speed);
		let segmentStart = walk.tick || TICK;
		let segmentEnd = segmentStart + speed;
		let traveledDist = 0;

		// If we were paused by another action, keep segment timing in sync.
		if (
			walk.prevTick &&
			walk.prevTick !== TICK &&
			walk.prevTick > segmentStart &&
			!this.isFastMoving &&
			!walk.settling &&
			this.action !== this.ACTION.WALK &&
			this.objecttype !== this.constructor.TYPE_FALCON
		) {
			segmentStart += TICK - walk.prevTick;
			segmentEnd = segmentStart + speed;
		}

		// Advance across any fully elapsed segments, accumulating distance.
		while (index < total - 2 && TICK >= segmentEnd) {
			traveledDist += Math.sqrt(
				(nextX - walk.lastPos[0]) * (nextX - walk.lastPos[0]) +
					(nextY - walk.lastPos[1]) * (nextY - walk.lastPos[1])
			);

			walk.pos[0] = startX = nextX;
			walk.pos[1] = startY = nextY;
			walk.lastPos[0] = nextX;
			walk.lastPos[1] = nextY;
			index += 2;

			nextX = path[index + 0];
			nextY = path[index + 1];
			dx = nextX - startX;
			dy = nextY - startY;
			segIdx = (index - 2) >> 1;
			speed = (walk.segmentDurations && walk.segmentDurations[segIdx]) || getSegmentDuration(dx, dy, walk.speed);
			segmentStart = segmentEnd;
			segmentEnd = segmentStart + speed;
		}

		// Interpolate current segment
		const duration = Math.max(segmentEnd - segmentStart, 1);
		const t = Math.min(Math.max((TICK - segmentStart) / duration, 0), 1);
		const newX = startX + dx * t;
		const newY = startY + dy * t;

		traveledDist += Math.sqrt(
			(newX - walk.lastPos[0]) * (newX - walk.lastPos[0]) + (newY - walk.lastPos[1]) * (newY - walk.lastPos[1])
		);
		walk.lastPos[0] = newX;
		walk.lastPos[1] = newY;

		const cellHeight =
			this.objecttype == this.constructor.TYPE_FALCON
				? Altitude.getCellHeight(newX, newY) + falconGliding
				: Altitude.getCellHeight(newX, newY);
		pos[0] = newX;
		pos[1] = newY;
		pos[2] = cellHeight;

		// Facing update:
		// First segment uses continuous heading from current interpolated position to next tile.
		// Later segments snap to discrete 8-way direction based on the segment offset.
		if (!this._preserveDirection && index < total) {
			if (index === 2) {
				const remDx = nextX - newX;
				const remDy = nextY - newY;

				// If we're effectively at the next tile (fast-forwarded/last frame),
				// fall back to the segment's discrete direction instead of defaulting south.
				if (Math.abs(remDx) < 0.001 && Math.abs(remDy) < 0.001) {
					const prevTileX0 = path[index - 2];
					const prevTileY0 = path[index - 1];
					const segDx0 = nextX - prevTileX0;
					const segDy0 = nextY - prevTileY0;
					const dirRow0 = DIRECTION[segDx0 + 1];
					if (dirRow0 && typeof dirRow0[segDy0 + 1] !== 'undefined') {
						this.direction = dirRow0[segDy0 + 1];
					}
				} else {
					const contDir = offsetToFloatDir(remDx, remDy);
					this.direction = quantizeDir(contDir);
				}
			} else {
				const segDx = Math.round(nextX - startX);
				const segDy = Math.round(nextY - startY);
				const dirRow = DIRECTION[segDx + 1];
				if (dirRow && typeof dirRow[segDy + 1] !== 'undefined') {
					this.direction = dirRow[segDy + 1];
				}
			}
		}

		walk.dist += traveledDist;
		walk.index = index;
		walk.tick = segmentStart;
		walk.prevTick = TICK;

		const reachedEnd = index >= total - 2 && t >= 0.999 && TICK >= segmentEnd;

		if (!reachedEnd) {
			return;
		}

		// Stop walking
		finishWalk();
	} else {
		if (index < total) {
			// Walking got interrupted by getting attacked or other means
			this.walk.tick += TICK - this.walk.prevTick; // Offset walking by the time elapsed.
			this.walk.prevTick = TICK; // Store tick
		}
		return;
	}
}

// Companions walk is passively, don't need complexity or lower walk delay
function entitiesWalkProcess() {
	// Use owner's actual current position
	const ownerCellX = this.position[0];
	const ownerCellY = this.position[1];

	if (
		this.falcon &&
		!this.falcon.isAttacking &&
		(!this.falcon.walk.lastWalkTick || this.falcon.walk.lastWalkTick + 1000 < Date.now())
	) {
		const range = 2;
		const dist = Math.floor(this.distance(this, this.falcon));
		if (dist < range) {
			return;
		}

		const targetChanged = this.falcon._followTargetX !== ownerCellX || this.falcon._followTargetY !== ownerCellY;
		if (targetChanged) {
			this.falcon.walk.speed = Math.max(this.walk.speed - 50, 1);
			this.falcon._followTargetX = ownerCellX;
			this.falcon._followTargetY = ownerCellY;
			this.falcon.walk.lastWalkTick = Date.now();
			this.falcon.walkToNonWalkableGround(
				this.falcon.position[0],
				this.falcon.position[1],
				ownerCellX,
				ownerCellY,
				range - 1,
				false,
				false,
				Date.now()
			);
		}
	}

	if (
		this.wug &&
		!this.wug.isAttacking &&
		(!this.wug.walk.lastWalkTick || this.wug.walk.lastWalkTick + 1000 < Date.now())
	) {
		const range = 4;
		const dist = Math.floor(this.distance(this, this.wug));
		if (dist < range) {
			return;
		}

		const targetChanged = this.wug._followTargetX !== ownerCellX || this.wug._followTargetY !== ownerCellY;
		if (targetChanged) {
			this.wug.walk.speed = Math.max(this.walk.speed - 50, 1);
			this.wug._followTargetX = ownerCellX;
			this.wug._followTargetY = ownerCellY;
			this.wug.walk.lastWalkTick = Date.now();
			this.wug.walkToNonWalkableGround(
				this.wug.position[0],
				this.wug.position[1],
				ownerCellX,
				ownerCellY,
				range - 1,
				false,
				false,
				Date.now()
			);
		}
	}
}

function resetRoute(keepDistance) {
	if (this.isFastMoving) {
		if (typeof this._normalSpeed === 'number') {
			this.walk.speed = this._normalSpeed;
			delete this._normalSpeed;
		}
	}
	this.isFastMoving = false;
	this._fastMoveTrail = false;
	this._preserveDirection = false;
	this.walk.settling = false;
	this.walk.predicted = null;
	this.walk.tick = 0;
	this.walk.prevTick = 0;
	if (!keepDistance) {
		this.walk.dist = 0;
	}
	this.walk.path = new Int16Array(PathFinding.MAX_WALKPATH * 2);
	if (this.walk.segmentDurations) {
		this.walk.segmentDurations.fill(0);
	}
	this.walk.lastPos[0] = 0;
	this.walk.lastPos[1] = 0;
	this.walk.lastPos[2] = 0;
	if (this.walk.onEnd) {
		this.walk.onEnd();
	}
	this.walk.onEnd = null;
	this.walk.index = 0;
	this.walk.total = 0;
	this.walk.stuckWarned = false;
}

function calculateOverShot(from_x, from_y, to_x, to_y) {
	const overshot = 5;
	let over_x = to_x,
		over_y = to_y;
	if (from_x > to_x && from_y > to_y) {
		//Quadrant 3
		over_x = to_x - overshot;
		over_y = to_y - overshot;
	} else if (from_x < to_x && from_y > to_y) {
		//Quadrant 4
		over_x = to_x + overshot;
		over_y = to_y - overshot;
	} else if (from_x < to_x && from_y < to_y) {
		//Quadrant 1
		over_x = to_x + overshot;
		over_y = to_y + overshot;
	} else if (from_x > to_x && from_y < to_y) {
		//Quadrant 2
		over_x = to_x - overshot;
		over_y = to_y + overshot;
	} else if (from_y < to_y) {
		// pure positve y position
		over_x = to_x;
		over_y = to_y + overshot;
	} else if (to_y < from_y) {
		// pure negative y position
		over_x = to_x;
		over_y = to_y - overshot;
	} else if (from_x < to_x) {
		// pure positve y position
		over_x = to_x + overshot;
		over_y = to_y;
	} else if (from_x > to_x) {
		// pure negative x position
		over_x = to_x - overshot;
		over_y = to_y;
	}
	return [over_x, over_y];
}

function distance(entity1, entity2) {
	const x1 = entity1.position[0];
	const y1 = entity1.position[1];
	const x2 = entity2.position[0];
	const y2 = entity2.position[1];
	return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Initialize and export methods
 */
export { computeWalkStartTick, gridPathDuration };

export default function Init() {
	this.onWalkEnd = function onWalkEnd() {};
	this._preserveDirection = false;
	this.isFastMoving = false;
	this._fastMoveTrail = false;
	this._enableTrail = false;
	this.walk = new WalkStructure();
	this.walkTo = walkTo;
	this.predictWalkTo = predictWalkTo;
	this.cancelPrediction = cancelPrediction;
	this.settleTo = settleTo;
	this.fastMoveTo = fastMoveTo;
	this.walkToNonWalkableGround = walkToNonWalkableGround;
	this.walkProcess = walkProcess;
	this.entitiesWalkProcess = entitiesWalkProcess;
	this.resetRoute = resetRoute;
	this.distance = distance;
}
