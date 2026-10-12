import { expect, it, vi } from 'vitest';
import htmlText from 'UI/Components/WinStats/WinStatsV2/WinStatsV2.html?raw';

vi.mock('UI/GUIComponent.js', () => ({
	default: class {
		constructor() {
			this._host = document.createElement('div');
			this._host.innerHTML = htmlText;
			document.body.appendChild(this._host);
		}
		getRoot() {
			return this._host;
		}
		get scale() {
			return 1.25;
		}
		draggable() {}
		focus() {}
	}
}));
vi.mock('UI/UIManager.js', () => ({ default: { addComponent: c => c } }));
vi.mock('Core/Client.js', () => ({ default: { loadFile: vi.fn() } }));
vi.mock('Core/Preferences.js', () => ({ default: { get: () => ({ save: vi.fn() }) } }));
vi.mock('Renderer/Renderer.js', () => ({ default: {} }));
vi.mock('Engine/SessionStorage.js', () => ({ default: {} }));
vi.mock('DB/DBManager.js', () => ({
	default: {
		getMessage: () => 'Strength <stat>: ^FF0000attack^000000 and carrying capacity',
		formatMsgToHtml: text => text.replace('^FF0000', '<span style="color:#FF0000">').replace('^000000', '</span>')
	}
}));
const { createWinStats } = await import('UI/Components/WinStats/WinStatsCommon.js');

it('floats formatted status descriptions without focusing and dismisses them when the window hides', () => {
	const component = createWinStats({ name: 'WinStatsV2', htmlText, cssText: '', hasTraits: true });
	component.init();
	const root = component.getRoot();
	const anchor = root.querySelector('.desc');
	const tooltip = anchor.querySelector('.hover');
	tooltip.showPopover = vi.fn();
	tooltip.hidePopover = vi.fn();
	tooltip.getBoundingClientRect = () => ({ width: 337.5, height: 70 });
	anchor.getBoundingClientRect = () => ({ left: 900, top: 5, bottom: 25 });
	const focus = vi.spyOn(component, 'focus');
	anchor.dispatchEvent(new MouseEvent('mouseenter'));
	expect(tooltip.showPopover).toHaveBeenCalledOnce();
	expect(tooltip.style.left).toBe(`${window.innerWidth - 337.5}px`);
	expect(tooltip.style.top).toBe('27.5px');
	expect(tooltip.style.transform).toBe('scale(1.25)');
	expect(tooltip.textContent).toBe('Strength <stat>: attack and carrying capacity');
	expect(tooltip.querySelector('stat')).toBeNull();
	expect(tooltip.querySelector('span').style.color).toBe('rgb(255, 0, 0)');
	anchor.dispatchEvent(new MouseEvent('mouseleave'));
	expect(tooltip.hidePopover).toHaveBeenCalledOnce();
	expect(tooltip.style.display).toBe('none');
	anchor.dispatchEvent(new MouseEvent('mouseenter'));
	component.toggle();
	expect(tooltip.style.display).toBe('none');
	expect(focus).not.toHaveBeenCalled();
	component._host.style.display = '';
	anchor.dispatchEvent(new MouseEvent('mouseenter'));
	root.querySelector('.close').click();
	expect(tooltip.style.display).toBe('none');
	component._host.style.display = '';
	anchor.dispatchEvent(new MouseEvent('mouseenter'));
	component.onRemove();
	expect(tooltip.style.display).toBe('none');
});

it('toggles trait stats once from either the arrow or its label', () => {
	document.body.innerHTML = '';
	const component = createWinStats({ name: 'WinStatsV2', htmlText, cssText: '', hasTraits: true });
	component.init();
	const root = component.getRoot();
	const panel = root.querySelector('.traits_component');
	root.querySelector('.trait_text').click();
	expect(panel.style.display).toBe('none');
	root.querySelector('.view_traits').click();
	expect(panel.style.display).toBe('');
	root.querySelector('.trait_text').click();
	expect(panel.style.display).toBe('none');
});
