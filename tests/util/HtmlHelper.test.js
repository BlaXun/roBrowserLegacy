import { describe, it, expect } from 'vitest';
import { escapeHtml, htmlToText, sanitizeHtml, truncateHtml } from 'Utils/HtmlHelper.js';

/**
 * DB.getItemName returns markup for forged and brewed items: the crafter's
 * name is wrapped in a coloured <font>. Windows that show item names (the
 * vending shop, the buyer's view, the sales report) run it through
 * sanitizeHtml and set innerHTML, so the colour renders instead of the tag.
 */
describe('HtmlHelper', () => {
	const crafted = name =>
		'Very Strong <font color="#87cefa" class="owner-150001">' + escapeHtml(name) + "</font>'s Fire Sword";

	it('keeps the crafter colour on a forged item name', () => {
		const el = document.createElement('div');
		el.innerHTML = sanitizeHtml(crafted('Smith'));

		const font = el.querySelector('font.owner-150001');
		expect(font).not.toBeNull();
		expect(font.getAttribute('color')).toBe('#87cefa');
		expect(el.textContent).toBe("Very Strong Smith's Fire Sword");
	});

	it('shows markup in a crafter name as text', () => {
		const el = document.createElement('div');
		el.innerHTML = sanitizeHtml(crafted('<img src=x onerror=alert(1)>'));

		expect(el.querySelector('img')).toBeNull();
		expect(el.querySelector('font').textContent).toBe('<img src=x onerror=alert(1)>');
	});

	it('strips tags outside the whitelist', () => {
		expect(sanitizeHtml('<b>a</b><script>x</script><span>b</span>')).toBe('<b>a</b>xb');
	});
	it('gives plain text for the chat box', () => {
		expect(htmlToText(crafted('Smith'))).toBe("Very Strong Smith's Fire Sword");
	});

	it('truncates by visible text and keeps the markup whole', () => {
		const html = sanitizeHtml(crafted('Blacksmith'));
		const el = document.createElement('div');
		el.innerHTML = truncateHtml(html, 16);

		expect(el.textContent).toBe('Very Strong Blac...');
		expect(el.querySelector('font').textContent).toBe('Blac');
		expect(el.querySelector('font').getAttribute('color')).toBe('#87cefa');
	});

	it('leaves short HTML as it is', () => {
		const html = sanitizeHtml(crafted('Smith'));
		expect(truncateHtml(html, 40)).toBe(html);
	});
});
