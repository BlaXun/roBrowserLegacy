import { beforeEach, describe, expect, it, vi } from 'vitest';

// A script's playBGM reaches the client as 0x07fe or, from 2022-05-04 client
// dates on, as 0x0b8c. The NPC engine's handlers are module-private and only
// reachable through the hooks NPCEngine() registers, so the Network mock keeps
// the map of packet structure -> handler it builds. Before 0x0b8c was hooked,
// a 2022 client heard nothing: the packet parsed and no handler took it.
const mocks = vi.hoisted(() => ({ hooks: new Map(), played: [] }));

const stub = vi.hoisted(() => () => ({ default: {} }));
vi.mock('Network/NetworkManager.js', () => ({
	default: { hookPacket: (struct, fn) => mocks.hooks.set(struct, fn), sendPacket: vi.fn() }
}));
vi.mock('Audio/BGM.js', () => ({ default: { play: name => mocks.played.push(name) } }));
vi.mock('Audio/SoundManager.js', stub);
vi.mock('Core/Client.js', stub);
vi.mock('DB/DBManager.js', stub);
vi.mock('Renderer/Renderer.js', stub);
vi.mock('UI/Components/NpcBox/NpcBox.js', stub);
vi.mock('UI/Components/InputBox/InputBox.js', stub);
vi.mock('UI/Components/NpcMenu/NpcMenu.js', stub);
vi.mock('UI/Components/WinPopup/WinPopup.js', stub);
vi.mock('UI/Components/MiniMap/MiniMap.js', stub);
vi.mock('UI/Components/ChatBox/ChatBox.js', stub);
vi.mock('UI/GUIComponent.js', () => ({ default: class {} }));

const NPCEngine = (await import('Engine/MapEngine/NPC.js')).default;
const PACKET = (await import('Network/PacketStructure.js')).default;

/** Invoke the handler NPCEngine() hooked for a given packet structure. */
function deliver(struct, fields) {
	const handler = mocks.hooks.get(struct);
	if (!handler) {
		throw new Error('no handler hooked for that packet');
	}
	const pkt = Object.create(struct.prototype);
	Object.assign(pkt, fields);
	handler(pkt);
}

beforeEach(() => {
	mocks.hooks.clear();
	mocks.played.length = 0;
	NPCEngine();
});

describe('the NPC engine plays the music a script asks for', () => {
	it('hooks 0x0b8c onto the handler 0x07fe has', () => {
		expect(mocks.hooks.get(PACKET.ZC.PLAY_NPC_BGM2)).toBe(mocks.hooks.get(PACKET.ZC.PLAY_NPC_BGM));
	});

	it('plays the name 0x0b8c carries as an .mp3 in BGM/', () => {
		deliver(PACKET.ZC.PLAY_NPC_BGM2, { playType: 0, Bgm: '99' });
		deliver(PACKET.ZC.PLAY_NPC_BGM2, { playType: 0, Bgm: 'my-long-custom-theme-for-a-mod.mp3' });

		expect(mocks.played).toEqual(['99.mp3', 'my-long-custom-theme-for-a-mod.mp3']);
	});

	it('still plays 0x07fe for clients before 2022-05-04', () => {
		deliver(PACKET.ZC.PLAY_NPC_BGM, { Bgm: '52' });

		expect(mocks.played).toEqual(['52.mp3']);
	});
});
