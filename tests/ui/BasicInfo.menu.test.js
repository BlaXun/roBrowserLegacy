import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The shortcut grid of the Basic Information menu (V4 and V5) is a panel made
// for fifteen buttons: three rows of five 32px buttons with 6px margins, over a
// frame 132px tall (Flux159/ragnarokoffline.app#390). One more button wrapped
// onto a fourth row below the frame, and every mod button would do the same, so
// the panel scrolls instead. A scrolling panel clips what a button drew above
// itself, so its name is drawn once, below the frame.

const mocks = vi.hoisted(() => ({ root: null }));

class MockGUIComponent {
	draggable() {}

	getRoot() {
		return mocks.root;
	}
}
vi.mock('UI/GUIComponent.js', () => ({ default: MockGUIComponent }));
vi.mock('UI/UIManager.js', () => ({ default: { addComponent: component => component } }));
vi.mock('Core/Client.js', () => ({ default: { loadFile: vi.fn() } }));
vi.mock('Core/Preferences.js', () => ({ default: { get: () => ({ save: vi.fn() }) } }));
vi.mock('Core/Configs.js', () => ({ default: { get: () => false } }));
vi.mock('DB/DBManager.js', () => ({ default: { INTERFACE_PATH: '' } }));
vi.mock('Network/PacketVerManager.js', () => ({ default: { value: 20221005 } }));
const stub = vi.hoisted(() => () => ({ default: {} }));
vi.mock('DB/Monsters/MonsterTable.js', stub);
vi.mock('Renderer/Renderer.js', stub);
vi.mock('Engine/SessionStorage.js', stub);
vi.mock('UI/Components/Inventory/Inventory.js', stub);
vi.mock('UI/Components/Equipment/Equipment.js', stub);
vi.mock('UI/Components/PartyFriends/PartyFriends.js', stub);
vi.mock('UI/Components/Guild/Guild.js', stub);
vi.mock('UI/Components/Bank/Bank.js', stub);
vi.mock('UI/Components/Escape/Escape.js', stub);
vi.mock('UI/Components/WorldMap/WorldMap.js', stub);
vi.mock('UI/Components/CheckAttendance/CheckAttendance.js', stub);
vi.mock('UI/Components/ChatRoomCreate/ChatRoomCreate.js', stub);
vi.mock('UI/Components/Rodex/Rodex.js', stub);
vi.mock('UI/Components/WinStats/WinStats.js', stub);
vi.mock('UI/Components/Navigation/Navigation.js', stub);
vi.mock('UI/Components/SkillList/SkillList.js', stub);
vi.mock('UI/Components/Quest/Quest.js', stub);
vi.mock('UI/Components/Achievement/Achievement.js', stub);
vi.mock('UI/Components/Reputation/Reputation.js', stub);

const { createBasicInfo } = await import('UI/Components/BasicInfo/BasicInfoCommon.js');

const read = file => readFileSync(join(process.cwd(), 'src/UI/Components/BasicInfo', file), 'utf8').replace(/\r\n/g, '\n');

// Each version: the markup of a button, and where its panel sits in the large and small window.
const VERSIONS = {
	V5: { tag: 'div', selector: '.buttons > div[id]', large: 160, small: 80 },
	V4: { tag: 'button', selector: '.buttons button', large: 144, small: 62 }
};

describe.each(Object.entries(VERSIONS))('BasicInfo%s menu panel', (version, spec) => {
	const css = read(`BasicInfo${version}/BasicInfo${version}.css`);
	const block = selector => {
		const start = css.indexOf(`\n${selector} {`);
		expect(start, `${selector} is defined`).toBeGreaterThan(-1);
		return css.slice(start, css.indexOf('\n}', start));
	};

	it('keeps the size of its frame and scrolls', () => {
		const panel = block(`#BasicInfo${version} .buttons`);
		expect(panel).toMatch(/height: 132px;/);
		expect(panel).toMatch(/overflow-y: auto;/); // the client attaches its scrollbar to this
		expect(panel).toMatch(/overflow-x: hidden;/);
	});

	it('still fits five buttons beside the scrollbar', () => {
		// 220px panel, 13px scrollbar: 207px for five buttons of 32px + 2 x 4px.
		expect(css).toMatch(
			new RegExp(`\\.buttons\\[style\\*='padding-right: 13px'\\] > ${spec.tag}\\[id\\] \\{\\s*margin: 6px 4px;`)
		);
	});

	it('draws a button name below the frame, centred, and not inside the button', () => {
		expect(css).not.toMatch(/:hover \.name \{\s*display: table/);
		const tip = block(`#BasicInfo${version} .menu_tip`);
		expect(tip).toMatch(/left: 110px;\s*transform: translateX\(-50%\);/); // centred on the 220px frame
		// The panel's top, its 132px, and a 4px gap.
		expect(block(`#BasicInfo${version}.large .menu_tip`)).toMatch(new RegExp(`top: ${spec.large + 132 + 4}px`));
		expect(block(`#BasicInfo${version}.small .menu_tip`)).toMatch(new RegExp(`top: ${spec.small + 132 + 4}px`));
	});

	it('puts the new-item mark over the button it marks', () => {
		// The picture's tile starts 6px below its top and flush left. V5 had it 13px up and 7px left.
		expect(block(`#BasicInfo${version} .buttons .btn_overlay`)).toMatch(/top: -6px;\s*left: 0;/);
	});
});

// The tip itself, in a real DOM.
function menu(spec, config = { menuTip: true }) {
	const root = document.createElement('div');
	const names = ['Status', 'Equipment', '  '];
	root.innerHTML = `<div id="inner"><div class="buttons">${names
		.map((name, i) => `<${spec.tag} id="b${i}"><span class="name">${name}</span></${spec.tag}>`)
		.join('')}</div></div>`;
	mocks.root = root;
	const info = createBasicInfo({
		name: 'MenuTest',
		htmlText: '',
		cssText: '',
		prefKey: 'MenuTest',
		innerId: '#inner',
		buttonsSelector: spec.selector,
		...config
	});
	info.init();
	return {
		tip: root.querySelector('.menu_tip'),
		buttons: root.querySelector('.buttons'),
		over: id => root.querySelector(`#${id} .name`).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
	};
}

describe.each(Object.entries(VERSIONS))('BasicInfo%s button names', (version, spec) => {
	beforeEach(() => {
		mocks.root = null;
	});

	it('appear in one tip below the frame, outside the scrolling panel', () => {
		const { tip, buttons, over } = menu(spec);
		expect(tip.parentElement.id).toBe('inner');
		expect(buttons.contains(tip)).toBe(false);

		over('b0');
		expect(tip.textContent).toBe('Status');
		expect(tip.style.display).toBe('block');
		over('b1');
		expect(tip.textContent).toBe('Equipment');
	});

	it('go away when the pointer leaves a button, the panel, or the panel scrolls', () => {
		const { tip, buttons, over } = menu(spec);
		for (const leave of [
			() => buttons.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })), // the gap between buttons
			() => buttons.dispatchEvent(new Event('mouseleave')),
			() => buttons.dispatchEvent(new Event('scroll'))
		]) {
			over('b0');
			expect(tip.style.display).toBe('block');
			leave();
			expect(tip.style.display).toBe('none');
		}
	});

	it('are not shown for a button with no name', () => {
		const { tip, over } = menu(spec);
		over('b2');
		expect(tip.style.display).toBe('none');
	});

	it('are left to each button in a version that does not opt in', () => {
		const { tip } = menu(spec, {});
		expect(tip).toBeNull();
	});
});

describe('the versions that opt in', () => {
	it('are V4 and V5, which both have the scrolling panel', () => {
		for (const version of ['V4', 'V5']) {
			expect(read(`BasicInfo${version}/BasicInfo${version}.js`)).toMatch(/menuTip: true,/);
		}
	});
});
