import { describe, it, expect } from 'vitest';
import CostumeSpriteEffects from 'DB/Effects/CostumeSpriteEffects.js';

describe('costume sprite effects', () => {
	it('draws each as one looping sprite attached to its owner', () => {
		for (const [id, entries] of Object.entries(CostumeSpriteEffects)) {
			expect(entries, `effect ${id}`).toHaveLength(1);
			expect(entries[0], `effect ${id}`).toMatchObject({ type: 'SPR', attachedEntity: true, repeat: true });
		}
		expect(CostumeSpriteEffects[2346][0].file).toBe('black_thunder/black_thunder');
	});

	it("plays Subject Aura's colours as actions of one sprite", () => {
		const action = id => CostumeSpriteEffects[id][0];
		expect(action(1211)).toMatchObject({ file: 'subject_aura/subject_aura', direction: false, frame: 0 }); // gold
		expect(action(1212).frame).toBe(1); // white
		expect(action(1213).frame).toBe(2); // red
		expect(CostumeSpriteEffects[1377][0].direction).toBeUndefined();
	});

	it('names a Korean file as the client spells it', () => {
		const bytes = [...CostumeSpriteEffects[1531][0].file].map(c => c.charCodeAt(0));
		expect(new TextDecoder('euc-kr').decode(new Uint8Array(bytes))).toBe('나뭇잎_완성');
	});
});
