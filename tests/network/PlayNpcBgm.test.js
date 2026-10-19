import { describe, it, expect, vi } from 'vitest';
import PACKET from 'Network/PacketStructure.js';
import PacketRegister from 'Network/PacketRegister.js';
import PacketLength from 'Network/PacketLength.js';
import Network from 'Network/NetworkManager.js';
import BinaryReader from 'Utils/BinaryReader.js';

// rAthena clif_playBGM, PACKETVER_MAIN_NUM >= 20220504: PACKET_ZC_PLAY_NPC_BGM
// is 0x0b8c, <length>.W <playType>.B <bgm>.?B, the name NUL-terminated and of
// any length, in place of 0x07fe's fixed 24 bytes. It is what a script's
// playBGM and playBGMall send to a 2022 client. The length table has always
// known it (-1), so the client skipped it cleanly, but no structure was
// registered for it, so nothing played.

const bytesOf = name => Array.from(name, c => c.charCodeAt(0));

/** A whole 0x0b8c as rAthena sends it: opcode, length, play type, name, NUL. */
function playNpcBgm2(name, playType = 0) {
	const body = [playType, ...bytesOf(name), 0];
	const length = 4 + body.length;
	return [0x8c, 0x0b, length & 0xff, length >> 8, ...body];
}

/** A whole 0x07fe: opcode, then the name in a 24-byte field. */
function playNpcBgm(name) {
	const field = new Array(24).fill(0);
	bytesOf(name).forEach((b, i) => {
		field[i] = b;
	});
	return [0xfe, 0x07, ...field];
}

/** Parse one whole packet the way NetworkManager does: past its header, framed at its length. */
function parse(Struct, packet, headerLength) {
	const fp = new BinaryReader(new Uint8Array(packet).buffer);
	fp.seek(headerLength);
	return new Struct(fp, packet.length);
}

describe('ZC_PLAY_NPC_BGM2 (0x0b8c)', () => {
	it('reads the play type and the whole name, longer than 0x07fe could carry', () => {
		const name = 'my-long-custom-theme-for-a-mod';
		const pkt = parse(PACKET.ZC.PLAY_NPC_BGM2, playNpcBgm2(name), 4);

		expect(name.length).toBeGreaterThan(23);
		expect(pkt).toMatchObject({ playType: 0, Bgm: name });
		expect(PACKET.ZC.PLAY_NPC_BGM2.size).toBe(-1);
	});

	// A file name, so bytes rather than UTF-8: a name 0x07fe would play, 0x0b8c
	// plays too, byte for byte.
	it('reads the name as 0x07fe does', () => {
		const name = String.fromCharCode(0xb9, 0xe8, 0xb0, 0xe6) + '_01';
		const old = parse(PACKET.ZC.PLAY_NPC_BGM, playNpcBgm(name), 2);
		const pkt = parse(PACKET.ZC.PLAY_NPC_BGM2, playNpcBgm2(name), 4);

		expect(pkt.Bgm).toBe(name);
		expect(pkt.Bgm).toBe(old.Bgm);
	});

	it('is registered under 0x0b8c, beside the old 0x07fe', () => {
		expect(PacketRegister[0xb8c]).toBe(PACKET.ZC.PLAY_NPC_BGM2);
		expect(PacketRegister[0x7fe]).toBe(PACKET.ZC.PLAY_NPC_BGM);
	});

	// The whole way in, through the real NetworkManager, at a 2022 and a 2025
	// client date: the length table frames it, the register finds it, and a
	// hooked handler gets it. Before this, the handler was never called.
	it.each([20221005, 20250402])('reaches its handler off the wire at client date %i', packetver => {
		const socket = {};
		const played = [];
		const next = vi.fn();

		PacketLength.init(packetver);
		Network.setSocketFactory(() => socket);
		Network.connect('127.0.0.1', 5121, () => {}, false);
		socket.onComplete(true);

		Network.hookPacket(PACKET.ZC.PLAY_NPC_BGM2, pkt => played.push({ playType: pkt.playType, Bgm: pkt.Bgm }));
		Network.hookPacket(PACKET.ZC.PLAY_NPC_BGM, next);

		// A 0x07fe right behind it is read from where 0x0b8c ends.
		socket.onMessage(new Uint8Array([...playNpcBgm2('duel'), ...playNpcBgm('after')]));

		expect(played).toEqual([{ playType: 0, Bgm: 'duel' }]);
		expect(next).toHaveBeenCalledTimes(1);
		expect(next.mock.calls[0][0].Bgm).toBe('after');
	});
});
