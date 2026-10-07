/**
 * Utils/HtmlHelper.js
 *
 * Shared HTML/DOM utility helpers.
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 */

/**
 * Escape HTML special characters in a string.
 *
 * @param {string} text
 * @returns {string} escaped HTML string
 */
function escapeHtml(text) {
	const div = document.createElement('div');
	div.appendChild(document.createTextNode(text));
	return div.innerHTML;
}

/**
 * Sanitize HTML by stripping all tags except a whitelist.
 * Preserves <font>, <i>, and <b> tags.
 *
 * @param {string} text
 * @returns {string} sanitized HTML string
 */
const _allowedTags = new Set(['font', 'i', 'b']);

function sanitizeHtml(text) {
	const container = document.createElement('div');
	container.innerHTML = text;

	const walk = node => {
		const children = Array.from(node.childNodes);
		for (const child of children) {
			if (child.nodeType === 1) {
				if (_allowedTags.has(child.tagName.toLowerCase())) {
					walk(child);
				} else {
					while (child.firstChild) {
						node.insertBefore(child.firstChild, child);
					}
					node.removeChild(child);
				}
			}
		}
	};

	walk(container);
	return container.innerHTML;
}

/**
 * Plain text of an HTML string, for places that only show text: the chat
 * box, prompt boxes. Parsed in a <template>, so nothing in it loads or runs.
 *
 * @param {string} html
 * @returns {string} text content
 */
function htmlToText(html) {
	const template = document.createElement('template');
	template.innerHTML = html;
	return template.content.textContent;
}

/**
 * Truncate HTML to `limit` characters of text, adding an ellipsis, without
 * cutting through a tag. Markup around the text that is kept stays intact.
 *
 * @param {string} html
 * @param {number} limit
 * @returns {string} truncated HTML string
 */
function truncateHtml(html, limit) {
	const template = document.createElement('template');
	template.innerHTML = html;

	if (template.content.textContent.length <= limit) {
		return html;
	}

	const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
	const nodes = [];
	while (walker.nextNode()) {
		nodes.push(walker.currentNode);
	}

	let remaining = limit;
	for (const node of nodes) {
		if (remaining <= 0) {
			node.remove();
		} else if (node.data.length > remaining) {
			node.data = node.data.substring(0, remaining);
			remaining = 0;
		} else {
			remaining -= node.data.length;
		}
	}

	const container = document.createElement('div');
	container.appendChild(template.content);
	return container.innerHTML + '...';
}

/**
 * Animate CSS properties on an element using requestAnimationFrame.
 * Replaces jQuery.animate() for simple numeric/opacity transitions.
 *
 * @param {HTMLElement} element
 * @param {Object} props - CSS properties to animate (e.g. { opacity: 1.0 })
 * @param {number} duration - Animation duration in ms
 * @param {function} [callback] - Called when animation completes
 * @returns {{ stop: function }} - Handle to cancel the animation
 */
const _pixelProps = new Set([
	'left',
	'top',
	'right',
	'bottom',
	'width',
	'height',
	'marginTop',
	'marginLeft',
	'marginRight',
	'marginBottom',
	'paddingTop',
	'paddingLeft',
	'paddingRight',
	'paddingBottom',
	'fontSize',
	'borderWidth'
]);

function animateElement(element, props, duration, callback) {
	const start = {};
	const keys = Object.keys(props);
	let cancelled = false;

	for (const key of keys) {
		start[key] = parseFloat(element.style[key]) || 0;
	}

	const startTime = performance.now();

	function step(now) {
		if (cancelled) return;
		const elapsed = now - startTime;
		const progress = Math.min(elapsed / duration, 1);

		for (const key of keys) {
			const from = start[key];
			const to = props[key];
			const value = from + (to - from) * progress;
			element.style[key] = _pixelProps.has(key) ? value + 'px' : value;
		}

		if (progress < 1) {
			requestAnimationFrame(step);
		} else if (callback) {
			callback();
		}
	}

	requestAnimationFrame(step);

	return {
		stop() {
			cancelled = true;
		}
	};
}

export { escapeHtml, sanitizeHtml, htmlToText, truncateHtml, animateElement };
