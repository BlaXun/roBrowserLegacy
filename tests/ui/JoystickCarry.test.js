import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const { default: Carry } = await import('UI/Components/JoystickUI/JoystickCarry.js');

/**
 * A window as the client draws one: items in a shadow root, whose dragstart
 * and drop handlers are delegated, as InventoryCommon's and StorageCommon's are.
 */
function makeWindow(name, html) {
	const host = document.createElement('div');
	host.id = name;
	const shadow = host.attachShadow({ mode: 'open' });
	shadow.innerHTML = html;
	document.body.appendChild(host);
	const log = [];
	shadow.addEventListener('dragstart', event => {
		const item = event.target.closest('.item, .icon');
		if (!item || item.classList.contains('locked')) {
			event.preventDefault();
			return;
		}
		event.dataTransfer.setDragImage(new Image(), 12, 12);
		event.dataTransfer.setData(
			'Text',
			JSON.stringify((window._OBJ_DRAG_ = { type: 'item', from: name, data: { index: item.dataset.index } }))
		);
		log.push('dragstart');
	});
	shadow.addEventListener('dragend', () => log.push('dragend'));
	host.addEventListener('dragenter', () => log.push('dragenter'));
	host.addEventListener('dragover', () => log.push('dragover'));
	host.addEventListener('drop', event => log.push('drop:' + event.dataTransfer.getData('Text')));
	return { host, shadow, log, $: selector => shadow.querySelector(selector) };
}

describe('JoystickCarry', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		delete window._OBJ_DRAG_;
	});

	afterEach(() => {
		Carry.cancel();
	});

	it('picks up what the window gives, and puts it down where it is dropped', () => {
		const inventory = makeWindow('Inventory', '<div class="item" draggable="true" data-index="3"></div>');
		const storage = makeWindow('Storage', '<div class="content"><button class="close"></button></div>');

		expect(Carry.pickUp(inventory.$('.item'))).toBe(true);
		expect(Carry.isCarrying()).toBe(true);
		expect(Carry.payload()).toEqual({ type: 'item', from: 'Inventory', data: { index: '3' } });
		expect(window._OBJ_DRAG_).toBeTruthy();

		expect(Carry.place(storage.$('.close'))).toBe(true);
		expect(storage.log).toEqual([
			'dragenter',
			'dragover',
			'drop:{"type":"item","from":"Inventory","data":{"index":"3"}}'
		]);
		// The drag ends where it began, as a mouse drag does
		expect(inventory.log).toEqual(['dragstart', 'dragend']);
		expect(Carry.isCarrying()).toBe(false);
		expect(window._OBJ_DRAG_).toBeUndefined();
	});

	it('takes the draggable inside a slot: a shortcut slot carries its icon', () => {
		const bar = makeWindow(
			'ShortCut',
			'<div class="container" data-index="4"><div class="icon" draggable="true" data-index="4"></div></div><div class="container" data-index="5"></div>'
		);

		expect(Carry.canPickUp(bar.$('[data-index="4"]'))).toBe(true);
		expect(Carry.canPickUp(bar.$('.container[data-index="5"]'))).toBe(false);
		expect(Carry.pickUp(bar.$('.container[data-index="5"]'))).toBe(false);
		expect(Carry.pickUp(bar.$('.container[data-index="4"]'))).toBe(true);
		expect(bar.log).toEqual(['dragstart']);
	});

	it('carries nothing when the window refuses the drag', () => {
		const inventory = makeWindow('Inventory', '<div class="item locked" draggable="true" data-index="1"></div>');

		expect(Carry.pickUp(inventory.$('.item'))).toBe(false);
		expect(Carry.isCarrying()).toBe(false);
		expect(Carry.place(inventory.$('.item'))).toBe(false);
		expect(inventory.log).toEqual(['dragend']);
	});

	it('puts it back on cancel: the drag ends, nothing is dropped', () => {
		const inventory = makeWindow('Inventory', '<div class="item" draggable="true" data-index="3"></div>');

		Carry.pickUp(inventory.$('.item'));
		Carry.cancel();
		expect(inventory.log).toEqual(['dragstart', 'dragend']);
		expect(Carry.isCarrying()).toBe(false);
		expect(window._OBJ_DRAG_).toBeUndefined();
	});

	it('ends the drag on the page when the window drew its item anew meanwhile', () => {
		const inventory = makeWindow('Inventory', '<div class="item" draggable="true" data-index="3"></div>');
		const ends = [];
		document.addEventListener('dragend', event => ends.push(event.target), { once: true });

		Carry.pickUp(inventory.$('.item'));
		inventory.$('.item').remove();
		Carry.cancel();
		expect(ends).toEqual([document]);
	});

	it('shows the icon of what is carried beside the ring, and takes it away after', () => {
		const inventory = makeWindow(
			'Inventory',
			'<div class="item" draggable="true" data-index="3"><div class="icon" style="background-image: url(&quot;potion.bmp&quot;)"></div></div>'
		);

		Carry.pickUp(inventory.$('.item'));
		const ghost = document.querySelector('.joystick-carry-ghost');
		expect(ghost.style.backgroundImage).toContain('potion.bmp');
		expect(ghost.style.display).toBe('none');

		Carry.moveGhost({ left: 100, top: 50, right: 132, bottom: 82 });
		expect(ghost.style.display).toBe('block');
		expect(ghost.style.left).toBe('124px');
		expect(ghost.style.top).toBe('34px');
		Carry.moveGhost(null);
		expect(ghost.style.display).toBe('none');

		Carry.cancel();
		expect(document.querySelector('.joystick-carry-ghost')).toBe(null);
	});
});
