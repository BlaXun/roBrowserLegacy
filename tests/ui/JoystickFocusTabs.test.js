import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('UI/UIManager.js', () => ({
	default: {
		components: {},
		getComponent: () => {
			throw new Error('not found');
		}
	}
}));

const { default: Tabs } = await import('UI/Components/JoystickUI/JoystickFocusTabs.js');
const { default: Scan } = await import('UI/Components/JoystickUI/JoystickFocusScan.js');

function place(el, left, top, width, height) {
	el.getBoundingClientRect = () => ({ left, top, right: left + width, bottom: top + height, width, height });
	return el;
}

/**
 * A window as GUIComponent builds one, everything in it placed on screen
 * (left to right, in page order) unless hidden.
 */
function makeWindow(id, html) {
	const host = document.createElement('div');
	host.id = id;
	const shadow = host.attachShadow({ mode: 'open' });
	const root = document.createElement('div');
	root.className = 'ui-component-root';
	root.innerHTML = html;
	shadow.appendChild(root);
	document.body.appendChild(host);
	root.querySelectorAll('*').forEach((el, i) => place(el, i * 40, 0, 36, 20));
	root.querySelectorAll('.hidden, .hidden *').forEach(el => place(el, 0, 0, 0, 0));
	const win = Scan.describe(host);
	win.$ = selector => shadow.querySelector(selector);
	return win;
}

describe('JoystickFocusTabs', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('finds the buttons of a tab strip, the open one, and the ones beside it (wrapping)', () => {
		const win = makeWindow(
			'InventoryLike',
			`<div class="tabs"><button id="t0"></button><button id="t1" class="selected"></button><button id="t2"></button></div>
			<div class="content"><div class="item" data-index="1"><button class="use"></button></div></div>
			<button class="close"></button>`
		);

		expect(Tabs.tabsOf(win, null).map(el => el.id)).toEqual(['t0', 't1', 't2']);
		expect(Tabs.isTab(win.$('#t0'), win)).toBe(true);
		expect(Tabs.isTab(win.$('.use'), win)).toBe(false);
		expect(Tabs.isTab(win.$('.close'), win)).toBe(false);
		expect(Tabs.activeIndex(win, Tabs.tabsOf(win, null))).toBe(1);
		expect(Tabs.step(win, null, 1).tab.id).toBe('t2');
		expect(Tabs.step(win, null, -1).tab.id).toBe('t0');

		win.$('#t1').classList.remove('selected');
		win.$('#t2').classList.add('selected');
		expect(Tabs.step(win, null, 1).tab.id).toBe('t0');
	});

	it('reads CSS tabs: labels whose radio is checked, not the wrappers or what the tab shows', () => {
		const win = makeWindow(
			'SkillLike',
			`<div class="tabs">
				<div class="tab"><input type="radio" name="t" id="r1" class="hidden" checked /><label for="r1" class="tab-label">1st</label>
					<div class="tab-content"><div class="skill" data-index="28"><button class="levelup"></button></div></div></div>
				<div class="tab"><input type="radio" name="t" id="r2" class="hidden" /><label for="r2" class="tab-label">2nd</label>
					<div class="tab-content"></div></div>
			</div>`
		);

		expect(Tabs.tabsOf(win, null).map(el => el.getAttribute('for'))).toEqual(['r1', 'r2']);
		expect(Tabs.activeTab(win).getAttribute('for')).toBe('r1');
		expect(Tabs.isTab(win.$('.levelup'), win)).toBe(false);
		expect(Tabs.isTab(win.$('.tab'), win)).toBe(false);

		win.$('#r2').checked = true;
		expect(Tabs.activeTab(win).getAttribute('for')).toBe('r2');
	});

	it("takes a link in a tab wrapper (Equipment's), and passes tabs that refuse", () => {
		const win = makeWindow(
			'EquipLike',
			`<div class="tab-manager" id="tabs">
				<div class="tab"><a href="#general" class="tab selected">General</a></div>
				<div class="tab"><a href="#costume" class="tab denied">Costume</a></div>
				<div class="tab"><a href="#title" class="tab">Title</a></div>
			</div>`
		);

		expect(Tabs.tabsOf(win, null).map(el => el.getAttribute('href'))).toEqual(['#general', '#costume', '#title']);
		expect(Tabs.step(win, null, 1).tab.getAttribute('href')).toBe('#title');
		expect(Tabs.step(win, null, -1).tab.getAttribute('href')).toBe('#title');
	});

	it('uses the strip of the focused tab, and none of one tab', () => {
		const win = makeWindow(
			'TwoStrips',
			`<div class="tabs"><button id="a0" class="active"></button><button id="a1"></button></div>
			<div class="action_tabs"><button id="b0" class="tab selected"></button><button id="b1" class="tab"></button></div>`
		);
		expect(Tabs.tabsOf(win, win.$('#b1')).map(el => el.id)).toEqual(['b0', 'b1']);
		expect(Tabs.tabsOf(win, null).map(el => el.id)).toEqual(['a0', 'a1']);

		const single = makeWindow('Clanlike', '<div class="tabs"><button class="info active"></button></div>');
		expect(Tabs.tabsOf(single, null)).toEqual([]);
		expect(Tabs.step(single, null, 1)).toBe(null);
	});

	it('remembers the tab switched to when nothing on the tabs shows which is open', () => {
		const win = makeWindow('PictureTabs', '<div class="tabs"><button></button><button></button><button></button></div>');

		expect(Tabs.activeIndex(win, Tabs.tabsOf(win, null))).toBe(-1);
		expect(Tabs.step(win, null, 1).index).toBe(0);
		expect(Tabs.step(win, null, -1).index).toBe(2);
		Tabs.remember(win, 1);
		expect(Tabs.step(win, null, 1).index).toBe(2);
	});

	it("follows a profile's tabs and its word on which is open (the Quest window)", () => {
		const win = makeWindow(
			'Quest',
			`<ul class="quest-menu"><li id="active" class="quest-menu-item"></li><li id="inactive" class="quest-menu-item"></li></ul>
			<ul id="active-quest-list" style="display: none"></ul><ul id="inactive-quest-list" style="display: block"></ul>`
		);

		expect(Tabs.tabsOf(win, null).map(el => el.id)).toEqual(['active', 'inactive']);
		expect(Tabs.isTab(win.$('#active'), win)).toBe(true);
		expect(Tabs.activeTab(win).id).toBe('inactive');
		expect(Tabs.step(win, null, 1).tab.id).toBe('active');
	});
});
