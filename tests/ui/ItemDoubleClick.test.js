// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';

import { onItemDoubleClick } from 'UI/ItemDoubleClick.js';

function list(...indexes) {
	const content = document.createElement('div');
	content.innerHTML = indexes.map(i => `<div class="item" data-index="${i}"><span class="name">${i}</span></div>`).join('');
	document.body.appendChild(content);
	return content;
}

function click(el, detail = 1) {
	el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail }));
}

describe('onItemDoubleClick', () => {
	it('answers two clicks on the same item within the gap', () => {
		let t = 0;
		const got = [];
		const content = list(1, 2);
		onItemDoubleClick(content, '.item', item => got.push(item.dataset.index), { now: () => t });
		click(content.querySelector('[data-index="1"] .name'));
		t = 200;
		click(content.querySelector('[data-index="1"] .name'), 2);
		expect(got).toEqual(['1']);
	});

	it('answers a run of double clicks on the spot the next item slides into, whatever the browser counts', () => {
		// The shop's bug: after a move the list redraws, the next item is under
		// the pointer, and the browser counts on (3, 4, ...) and fires no dblclick.
		let t = 0;
		const got = [];
		const content = list(1, 2, 3);
		onItemDoubleClick(content, '.item', item => {
			got.push(item.dataset.index);
			item.remove(); // moved to the other list
		}, { now: () => t });
		let detail = 0;
		for (let n = 0; n < 3; n++) {
			const first = content.querySelector('.item');
			click(first, ++detail);
			t += 120;
			click(first, ++detail);
			t += 120;
		}
		expect(got).toEqual(['1', '2', '3']);
		expect(detail).toBe(6);
	});

	it('does not answer two clicks on different items, or two clicks too far apart', () => {
		let t = 0;
		const got = [];
		const content = list(1, 2);
		onItemDoubleClick(content, '.item', item => got.push(item.dataset.index), { now: () => t });
		click(content.querySelector('[data-index="1"]'));
		t = 100;
		click(content.querySelector('[data-index="2"]'));
		t = 1000;
		click(content.querySelector('[data-index="2"]'));
		expect(got).toEqual([]);
	});

	it('takes a third click as the start of the next double click, not a second answer', () => {
		let t = 0;
		const got = [];
		const content = list(1);
		onItemDoubleClick(content, '.item', item => got.push(item.dataset.index), { now: () => t });
		const item = content.querySelector('.item');
		for (let i = 0; i < 3; i++) {
			click(item);
			t += 100;
		}
		expect(got).toEqual(['1']);
	});

	it('ignores other buttons and clicks outside an item, and can be removed', () => {
		let t = 0;
		const got = [];
		const content = list(1);
		const stop = onItemDoubleClick(content, '.item', item => got.push(item.dataset.index), { now: () => t });
		const item = content.querySelector('.item');
		item.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 2 }));
		item.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 2 }));
		click(item);
		click(content); // between items
		click(item);
		expect(got).toEqual([]);
		stop();
		click(item);
		click(item);
		expect(got).toEqual([]);
	});
});
