/**
 * tests/ui/Escape.menuHooks.test.js
 *
 * The option menu draws the buttons plugins add through UI/MenuHooks.js
 * after its own settings buttons, and hides them with those on the death menu.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// GUIComponent imports these lazily; mocked so they don't pull the renderer in.
vi.mock('UI/CursorManager.js', () => ({ default: { ACTION: { DEFAULT: 0 }, setType: vi.fn(), getActualType: vi.fn() } }));
vi.mock('DB/DBManager.js', () => ({ default: { INTERFACE_PATH: 'data/texture/ui/', getMessage: () => '' } }));
vi.mock('Core/Client.js', () => ({
	default: {
		loadFile(path, callback) {
			callback?.(`loaded:${path}`);
		},
		loadFiles(_paths, callback) {
			callback?.('', '');
		}
	}
}));
vi.mock('Renderer/Renderer.js', () => ({ default: { width: 1200, height: 800 } }));
vi.mock('Renderer/EntityManager.js', () => ({ default: { setOverEntity: vi.fn() } }));
vi.mock('UI/Scrollbar.js', () => ({ default: {} }));
vi.mock('UI/UIManager.js', () => ({ default: { addComponent: component => component } }));
vi.mock('UI/Components/SoundOption/SoundOption.js', () => ({ default: {} }));
vi.mock('UI/Components/GraphicsOption/GraphicsOption.js', () => ({ default: {} }));
vi.mock('UI/Components/ShortCutOption/ShortCutOption.js', () => ({ default: {} }));

const MenuHooks = (await import('UI/MenuHooks.js')).default;
const Escape = (await import('UI/Components/Escape/Escape.js')).default;

const removers = [];
const add = button => {
	const remove = MenuHooks.add(button);
	removers.push(remove);
	return remove;
};

const hooked = () => [...Escape.getRoot().querySelectorAll('.container button.hooked')];
const order = () => [...Escape.getRoot().querySelectorAll('.container button')].map(el => el.className);

afterEach(() => {
	removers.splice(0).forEach(remove => remove());
});

describe('the option menu with buttons from plugins', () => {
	it('draws a button added before the menu exists after the settings buttons', () => {
		add({ background: 'esc_uiscale_a.bmp', hover: 'esc_uiscale_b.bmp', title: 'UI Scale', onClick() {} });
		Escape.prepare();

		expect(order()).toEqual([
			'resurection',
			'savepoint',
			'charselect',
			'graphics',
			'sound',
			'hotkey',
			'hooked',
			'exit',
			'cancel'
		]);
		const [button] = hooked();
		expect(button.dataset.background).toBe('esc_uiscale_a.bmp');
		expect(button.dataset.hover).toBe('esc_uiscale_b.bmp');
		expect(button.title).toBe('UI Scale');
	});

	it('draws a button from its own picture', async () => {
		add({ background: 'esc_uiscale_a.bmp', onClick() {} });
		await vi.waitFor(() => expect(hooked()[0].style.backgroundImage).toContain('esc_uiscale_a.bmp'));
	});

	it('calls the plugin when pressed and takes the button out when the plugin does', () => {
		const onClick = vi.fn();
		const remove = add({ background: 'esc_uiscale_a.bmp', onClick });
		hooked()[0].click();
		expect(onClick).toHaveBeenCalledTimes(1);

		remove();
		expect(hooked()).toHaveLength(0);
	});

	it('hides the buttons with the settings buttons on the death menu and brings them back', () => {
		add({ background: 'esc_uiscale_a.bmp', onClick() {} });
		Escape.showDeathMenu(false);
		expect(hooked()[0].style.display).toBe('none');

		// Added while the death menu shows: hidden as well
		add({ background: 'other_a.bmp', onClick() {} });
		expect(hooked().map(el => el.style.display)).toEqual(['none', 'none']);

		Escape.resetMenu();
		expect(hooked().map(el => el.style.display)).toEqual(['', '']);
	});
});
