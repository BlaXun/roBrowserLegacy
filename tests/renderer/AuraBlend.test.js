import { describe, it, expect } from 'vitest';
import { auraUniform, beginAuraBlend, endAuraBlend } from 'Renderer/Effects/AuraBlend.js';

const gl = () => {
	const calls = [];
	return {
		ZERO: 'ZERO',
		ONE: 'ONE',
		SRC_ALPHA: 'SRC_ALPHA',
		ONE_MINUS_SRC_ALPHA: 'ONE_MINUS_SRC_ALPHA',
		ONE_MINUS_SRC_COLOR: 'ONE_MINUS_SRC_COLOR',
		calls,
		blendFunc: (s, d) => calls.push([s, d])
	};
};
const red = { r: 1, g: 0, b: 0, dark: false };
const black = { r: 19 / 255, g: 9 / 255, b: 14 / 255, dark: true };

describe('AuraBlend', () => {
	it('leaves a light colour additive, whatever the texture', () => {
		const g = gl();
		beginAuraBlend(g, red, 'alpha');
		endAuraBlend(g, red);
		expect(g.calls).toEqual([]);
		expect(auraUniform(red, 0.5, 'alpha')).toEqual([1, 0, 0, 0.5]);
	});

	it('draws a dark colour on an alpha-shaped texture by alpha blending, in its own colour', () => {
		const g = gl();
		beginAuraBlend(g, black, 'alpha');
		endAuraBlend(g, black);
		expect(g.calls).toEqual([
			['SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA'],
			['SRC_ALPHA', 'ONE']
		]);
		expect(auraUniform(black, 0.5, 'alpha')).toEqual([black.r, black.g, black.b, 0.5]);
	});

	it("alpha-blends a hat aura's colour on an alpha-shaped texture, in its own colour", () => {
		const g = gl();
		const hat = { ...red, hat: true };
		beginAuraBlend(g, hat, 'alpha');
		endAuraBlend(g, hat);
		expect(g.calls).toEqual([
			['SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA'],
			['SRC_ALPHA', 'ONE']
		]);
		expect(auraUniform(hat, 0.5, 'alpha')).toEqual([1, 0, 0, 0.5]);
	});

	it("leaves a hat aura's light colour adding light on a texture with no alpha", () => {
		const g = gl();
		const hat = { ...red, hat: true };
		beginAuraBlend(g, hat);
		expect(g.calls).toEqual([]);
		expect(auraUniform(hat, 0.8)).toEqual([1, 0, 0, 0.8]);
	});

	it('darkens by brightness for a texture with no alpha, as before', () => {
		const g = gl();
		beginAuraBlend(g, black);
		expect(g.calls).toEqual([['ZERO', 'ONE_MINUS_SRC_COLOR']]);
		expect(auraUniform(black, 0.8)).toEqual([1, 1, 1, 0.8]);
	});
});
