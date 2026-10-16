/**
 * Network/Packets/packets2026_len_main.js
 *
 * kRO main Ragexe 2026-09-30 packet lengths.
 * Original executable SHA-256:
 * 0c8586bf763053290163b9ce5e34bf08f43118032f8edb68a6139f4e307abe6c
 *
 * Registration lengths establish framing, not packet fields or handlers.
 * Keep the existing 2025 definitions for earlier dates and retain its legacy
 * entries that are absent from this native build.
 */
import packets2025 from './packets2025_len_main.js';

function init(packetver) {
	// Each version owns its array; selecting 2026 must not mutate 2025.
	const length_list = packets2025.init(packetver).slice();

	if (packetver >= 20260930) {
		// Packet: 0x02fa
		length_list[0x02fa] = -1;

		// Packet: 0x02fb
		length_list[0x02fb] = -1;

		// Packet: 0x02fc
		length_list[0x02fc] = -1;

		// Packet: 0x0c12
		length_list[0x0c12] = 16;

		// Packet: 0x0c45
		length_list[0x0c45] = 2;

		// Packet: 0x0c46
		length_list[0x0c46] = -1;

		// Packet: 0x0c47
		length_list[0x0c47] = 4;

		// Packet: 0x0c48
		length_list[0x0c48] = 46;

		// Packet: 0x0c49
		length_list[0x0c49] = 42;

		// Packet: 0x0c4a
		length_list[0x0c4a] = 2;

		// Packet: 0x0c4b
		length_list[0x0c4b] = 6;

		// Packet: 0x0c4c
		length_list[0x0c4c] = 22;

		// Packet: 0x0c4d
		length_list[0x0c4d] = -1;

		// Packet: 0x0c4e
		length_list[0x0c4e] = -1;

		// Packet: 0x0c4f
		length_list[0x0c4f] = 18;

		// Packet: 0x0c50
		length_list[0x0c50] = 10;

		// Packet: 0x0c51
		length_list[0x0c51] = 10;

		// Packet: 0x0c52
		length_list[0x0c52] = -1;

		// Packet: 0x0c53
		length_list[0x0c53] = 10;

		// Packet: 0x0c54
		length_list[0x0c54] = 2;

		// Packet: 0x0c55
		length_list[0x0c55] = 6;

		// Packet: 0x0c56
		length_list[0x0c56] = 3;

		// Packet: 0x0c57
		length_list[0x0c57] = 11;

		// Packet: 0x0c58
		length_list[0x0c58] = 49;

		// Packet: 0x0c59
		length_list[0x0c59] = 11;

		// Packet: 0x0c5a
		length_list[0x0c5a] = 11;

		// Packet: 0x0c5b
		length_list[0x0c5b] = 30;

		// Packet: 0x0c5c
		length_list[0x0c5c] = -1;

		// Packet: 0x0c5e
		length_list[0x0c5e] = 4;

		// Packet: 0x0c5f
		length_list[0x0c5f] = 4;

		// Packet: 0x0c60
		length_list[0x0c60] = 7;

		// Packet: 0x0c61
		length_list[0x0c61] = 10;

		// Packet: 0x0c62
		length_list[0x0c62] = 34;

		// Packet: 0x0c63
		length_list[0x0c63] = 30;

		// Packet: 0x0c70
		length_list[0x0c70] = 30;

		// Packet: 0x0c71
		length_list[0x0c71] = 8;

		// Packet: 0x0c72
		length_list[0x0c72] = 4;

		// Packet: 0x0c73
		length_list[0x0c73] = 5;

		// Packet: 0x0c74
		length_list[0x0c74] = 10;

		// Packet: 0x0c75
		length_list[0x0c75] = 3;

		// Packet: 0x0c76
		length_list[0x0c76] = 2;

		// Packet: 0x0c77
		length_list[0x0c77] = -1;

		// Packet: 0x0c78
		length_list[0x0c78] = 23;

		// Packet: 0x0c79
		length_list[0x0c79] = 56;

		// Packet: 0x0c7c
		length_list[0x0c7c] = 14;

		// Packet: 0x0c7d
		length_list[0x0c7d] = -1;

		// Packet: 0x0c7e
		length_list[0x0c7e] = -1;

		// Packet: 0x0c7f
		length_list[0x0c7f] = 70;

		// Packet: 0x0c80
		length_list[0x0c80] = 15;

		// Packet: 0x0c81
		length_list[0x0c81] = 2;
	}

	return length_list;
}

export default {
	init: init
};
