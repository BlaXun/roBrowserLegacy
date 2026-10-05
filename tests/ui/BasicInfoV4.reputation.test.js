import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The Reputation window works for every job -- rAthena keeps the score as a
// character variable and sends it at login -- but only the fourth classes get
// BasicInfoV5. Every other class gets BasicInfoV4, whose Reputation Status
// button was commented out, so they had no way to open the window.
//
// Read as text: the windows need a renderer to build.
const read = file => readFileSync(join(process.cwd(), 'src/UI/Components/BasicInfo', file), 'utf8').replace(/\r\n/g, '\n');
const v4 = read('BasicInfoV4/BasicInfoV4.html');
const v5 = read('BasicInfoV5/BasicInfoV5.html');
const common = read('BasicInfoCommon.js');

const button = html => (html.match(/<(?:button|div)\s+id="repute"[\s\S]*?<\/(?:button|div)>/) || [''])[0];

describe('the Reputation Status button of the Basic Information menu', () => {
	it('is there in V4, no longer commented out', () => {
		expect(v4).not.toMatch(/<!--\s*<button class="reputation"/);
		expect(button(v4)).not.toBe('');
	});

	it('uses the same pictures and label as V5', () => {
		for (const html of [v4, v5]) {
			expect(button(html)).toContain('data-background="menu_icon/bt_repute.bmp"');
			expect(button(html)).toContain('data-down="menu_icon/bt_repute_press.bmp"');
			expect(button(html)).toContain('<span class="name">Reputation Status</span>');
		}
	});

	it('is a button like its neighbours in V4', () => {
		expect(button(v4)).toMatch(/^<button\s+id="repute"\s+class="event_add_cursor"/);
		expect(button(v4)).toMatch(/<\/button>$/);
	});

	it('opens the Reputation window when pressed', () => {
		expect(common).toMatch(/case 'repute':\s+Reputation\.toggle\(\);/);
	});
});
