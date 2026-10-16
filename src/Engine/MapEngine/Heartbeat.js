import Configs from 'Core/Configs.js';
import Session from 'Engine/SessionStorage.js';
import Network from 'Network/NetworkManager.js';
import PACKETVER from 'Network/PacketVerManager.js';
import PACKET from 'Network/PacketStructure.js';

/** Keep security heartbeats active; request time only after the map is ready. */
export default function startMapHeartbeat() {
	let mapReady = false;
	const hbt = new PACKET.CZ.HBT();
	const is_sec_hbt = Configs.get('sec_HBT', null);

	// Ping
	let ping;
	const SP = Session.ping;
	SP.pingTime = 0;
	SP.returned = false;

	if (PACKETVER.value >= 20180307) {
		ping = new PACKET.CZ.REQUEST_TIME2();
	} else {
		ping = new PACKET.CZ.REQUEST_TIME();
	}
	const startTick = Date.now();
	// A new connection makes any previous correction meaningless.
	Session.serverTickSynced = false;
	Network.setPing(() => {
		if (is_sec_hbt) {
			Network.sendPacket(hbt);
		}

		// The server accepts time requests only after the map-load acknowledgement.
		if (!mapReady) {
			return;
		}

		ping.clientTime = Date.now() - startTick;

		if (!SP.returned && SP.pingTime) {
			console.warn('[Network] The server did not answer the previous PING!');
		}
		SP.pingTime = ping.clientTime;
		// The base pingTime is measured from, so the pong can be put on
		// the same clock and subtracted. Without it there is nothing here
		// for a pong to be compared against.
		SP.epoch = startTick;
		SP.returned = false;

		Network.sendPacket(ping);
	});

	return ready => {
		mapReady = ready;
		if (!ready) {
			// A map transition can leave an in-flight request unanswered. It no
			// longer describes the connection once the next map is ready.
			SP.pingTime = 0;
			SP.returned = false;
		}
	};
}
