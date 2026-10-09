import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('Engine/SessionStorage.js', () => ({ default: {} }));
vi.mock('Renderer/Entity/Entity.js', () => ({ default: function () {} }));
vi.mock('Renderer/SpriteRenderer.js', () => ({ default: {} }));
vi.mock('Controls/MouseEventHandler.js', () => ({ default: { screen: {} } }));
vi.mock('Controls/KeyEventHandler.js', () => ({ default: {} }));
vi.mock('Utils/PathFinding.js', () => ({ default: { search: () => 1 } }));
vi.mock('Preferences/Graphics.js', () => ({ default: { performanceMode: false } }));
vi.mock('Renderer/Map/Altitude.js', () => ({ default: { TYPE: { WALKABLE: 1 } } }));
vi.mock('Renderer/Map/Water.js', () => ({ default: {} }));
vi.mock('Renderer/GR2/GR2ModelRenderer.js', () => ({ default: {} }));

const { default: EntityManager } = await import('Renderer/EntityManager.js');

const MOB = 5;

let nextGID = 1000;

function mob(x, hp, hidden) {
	const entity = {
		GID: nextGID++,
		objecttype: MOB,
		position: [x, 0, 0],
		action: 0,
		ACTION: { DIE: 8 },
		remove_tick: 0,
		life: { hp: hp },
		isVisible: () => !hidden
	};
	EntityManager.add(entity);
	return entity;
}

describe('EntityManager picks leave hidden entities out', () => {
	const player = { GID: 1, position: [0, 0, 0] };

	beforeEach(() => {
		EntityManager.forEach(entity => {
			entity.remove_tick = 1;
		});
	});

	it('sorted by distance', () => {
		mob(1, 50, true);
		const seen = mob(2, 50, false);
		expect(EntityManager.getEntitiesSortedByDistance(player, MOB)).toEqual([seen]);
	});

	it('closest', () => {
		mob(1, 50, true);
		const seen = mob(3, 50, false);
		expect(EntityManager.getClosestEntity(player, MOB)).toBe(seen);
	});

	it('lowest HP', () => {
		mob(1, 5, true);
		const seen = mob(2, 50, false);
		expect(EntityManager.getLowestHpEntity(player, MOB)).toBe(seen);
	});

	it('keeps entities without a visibility state (items)', () => {
		const item = { GID: nextGID++, objecttype: MOB, position: [1, 0, 0], action: 0, ACTION: { DIE: 8 }, remove_tick: 0 };
		EntityManager.add(item);
		expect(EntityManager.getEntitiesSortedByDistance(player, MOB)).toEqual([item]);
	});
});
