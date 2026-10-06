import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Invitation and Punish checkboxes on the guild Positions tab.
 *
 * They used to be <ui-button bg="checkbox_0.bmp">, which re-applies its `bg`
 * bitmap on every mouseout -- so the tick Guild.js painted vanished as soon as
 * the pointer left. And the click handler cleared the on/off class before
 * reading it, so a ticked box could never be unticked.
 *
 * The real UIButton is registered, so a regression to a ui-button fails here.
 */

const mocks = vi.hoisted(() => {
	class MockGUIComponent {
		constructor() {
			this._host = document.createElement('div');
			this.ui = { show() {}, hide() {}, is: () => true };
		}
		getRoot() {
			return this._host;
		}
		draggable() {}
		focus() {}
		parseHTML() {}
	}
	return { MockGUIComponent, session: { isGuildMaster: true } };
});

vi.mock('DB/DBManager.js', () => ({
	default: { INTERFACE_PATH: '', getMessage: (id, text) => text ?? '' }
}));
vi.mock('DB/Skills/SkillInfo.js', () => ({ default: {} }));
vi.mock('DB/Monsters/MonsterTable.js', () => ({ default: {} }));
vi.mock('Controls/KeyEventHandler.js', () => ({ default: {} }));
vi.mock('Engine/SessionStorage.js', () => ({ default: mocks.session }));
vi.mock('Renderer/Entity/Entity.js', () => ({ default: class {} }));
vi.mock('Renderer/SpriteRenderer.js', () => ({ default: {} }));
vi.mock('Renderer/Camera.js', () => ({ default: {} }));
vi.mock('Renderer/Renderer.js', () => ({ default: { width: 1200, height: 800 } }));
vi.mock('Core/Client.js', () => ({
	default: {
		// The path stands in for the image, so what is painted can be read back.
		loadFile: (path, callback) => callback?.(path),
		loadFiles: (_paths, callback) => callback?.('checkbox_0.bmp', 'checkbox_1.bmp')
	}
}));
vi.mock('UI/GUIComponent.js', () => ({ default: mocks.MockGUIComponent }));
vi.mock('UI/UIManager.js', () => ({
	default: {
		addComponent(component) {
			const root = component.getRoot();
			document.body.appendChild(root);
			root.innerHTML = component.render();
			component.init();
			return component;
		}
	}
}));
vi.mock('UI/Elements/Elements.js', () => ({}));
vi.mock('UI/Components/ContextMenu/ContextMenu.js', () => ({ default: {} }));
vi.mock('UI/Components/ChatBox/ChatBox.js', () => ({ default: {} }));
vi.mock('UI/Components/InputBox/InputBox.js', () => ({ default: {} }));
vi.mock('UI/Components/GuildCompanion/GuildCompanion.js', () => ({ default: {} }));
vi.mock('UI/Components/SkillTargetSelection/SkillTargetSelection.js', () => ({ default: {} }));
vi.mock('UI/Components/SkillDescription/SkillDescription.js', () => ({ default: {} }));
vi.mock('UI/Components/WinStats/WinStats.js', () => ({ default: {} }));

// jsdom ships no 2d context, and init paints the tendency graph.
HTMLCanvasElement.prototype.getContext = function () {
	return { canvas: this, fillRect() {}, clearRect() {}, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {}, closePath() {} };
};

await import('UI/Elements/UIButton.js');
const Guild = (await import('UI/Components/Guild/Guild.js')).default;

const root = Guild.getRoot();

function box(column) {
	return root.querySelector(`.content.positions tbody tr .${column} > *`);
}

function click(element) {
	element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('Guild positions checkboxes', () => {
	beforeEach(() => {
		mocks.session.isGuildMaster = true;
		// A click marks the tab dirty, and a dirty tab keeps its edits over a
		// refresh until Apply. Start every test from the server's rows.
		Guild.reset();
		Guild.setPositions([{ positionID: 0, right: 0x01, ranking: 0, payRate: 0, posName: 'Master' }], true);
	});

	it('draws each permission from the position', () => {
		expect(box('invite').classList.contains('on')).toBe(true);
		expect(box('punish').classList.contains('off')).toBe(true);
	});

	it('ticks an unticked box', () => {
		click(box('punish'));
		expect(box('punish').classList.contains('on')).toBe(true);
		expect(box('punish').classList.contains('off')).toBe(false);
		expect(box('punish').style.backgroundImage).toContain('checkbox_1.bmp');
	});

	it('unticks a ticked box', () => {
		click(box('invite'));
		expect(box('invite').classList.contains('off')).toBe(true);
		expect(box('invite').classList.contains('on')).toBe(false);
		expect(box('invite').style.backgroundImage).toContain('checkbox_0.bmp');
	});

	it('keeps the tick when the pointer leaves', () => {
		const punish = box('punish');
		click(punish);
		punish.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		punish.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
		expect(punish.style.backgroundImage).toContain('checkbox_1.bmp');
	});

	it('changes nothing for a member who is not the master', () => {
		mocks.session.isGuildMaster = false;
		click(box('invite'));
		expect(box('invite').classList.contains('on')).toBe(true);
	});
});
