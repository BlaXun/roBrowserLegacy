import { describe, it, expect } from 'vitest';
import iconv from 'Vendors/iconv-lite.js';

// Decoded text must come back whole, including past the 4096 character
// chunks the decoder builds its strings in.
describe('iconv-lite decode', () => {
	const korean = '포링 카드: 공격 시 일정 확률로 ^ff0000HP^000000 회복. ';
	const latin = 'Poring Card: chance to recover ^ff0000HP^000000 when attacking. é ü ß ';

	for (const [charset, text] of [
		['windows-949', korean + latin.replace(/[^\x00-\x7f]/g, '')],
		['windows-1252', latin],
		['utf-8', korean + latin],
		['utf-16le', korean + latin]
	]) {
		it(`round-trips ${charset} text of every length`, () => {
			for (const repeat of [0, 1, 70, 200, 400]) {
				const value = text.repeat(repeat);
				expect(iconv.decode(iconv.encode(value, charset), charset)).toBe(value);
			}
		});
	}

	it('decodes text over 4096 characters at the chunk edges', () => {
		for (const length of [4095, 4096, 4097, 8193]) {
			const value = 'a'.repeat(length - 1) + '가';
			expect(iconv.decode(iconv.encode(value, 'utf-16le'), 'utf-16le')).toBe(value);
			expect(iconv.decode(iconv.encode(value, 'windows-949'), 'windows-949')).toBe(value);
		}
	});
});
