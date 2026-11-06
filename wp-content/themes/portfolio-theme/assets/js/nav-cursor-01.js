/*
 * Terminal cursor for the Portal header navigation (docs/prototypes/nav-terminal-cursor).
 *
 * The resting cursor is pure CSS (home-photo-draft-01.css, on the label of the item that carries
 * aria-current="page"). This module only adds the switch motion, watching the aria-current that
 * home-portal-panels-01.js already maintains: the cursor steps across from the previous page to the
 * new one, and the new page's name decodes out of terminal noise. Visible text only; each link keeps
 * its real name as aria-label so assistive technology never hears the noise.
 */
const NOISE = '01<>/#%_=+*';
const DECODE_MS = 380;
const STEP_MS = 350;
const STEPS = 6;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function init() {
	const shell = document.querySelector('.photo-draft-shell[data-portal-shell-mode="frame-on-open-b3"]');
	const nav = shell?.querySelector('.photo-draft__navigation');
	if (!nav) return;

	const links = [...nav.querySelectorAll('.wp-block-navigation-item__content')]
		.map((anchor) => ({ anchor, label: anchor.querySelector('.wp-block-navigation-item__label') }))
		.filter((item) => item.label);
	if (links.length === 0) return;

	for (const { anchor, label } of links) {
		label.dataset.navCursorText = label.textContent;
		if (!anchor.hasAttribute('aria-label')) anchor.setAttribute('aria-label', label.textContent.trim());
	}

	let current = links.find((item) => item.anchor.getAttribute('aria-current') === 'page') ?? null;
	let ghost = null;
	let moveTimer = 0;

	const observer = new MutationObserver(() => {
		const next = links.find((item) => item.anchor.getAttribute('aria-current') === 'page') ?? null;
		if (next === current) return;
		const previous = current;
		current = next;
		if (next === null || reduceMotion.matches) return;
		if (previous !== null) moveCursor(previous, next);
		decode(next.label);
	});
	for (const { anchor } of links) observer.observe(anchor, { attributes: true, attributeFilter: ['aria-current'] });

	// On the homepage (no panel open) hovering a page types its name: the cursor sweeps across the
	// label (CSS) while the letters decode behind it, then it blinks after the word.
	const onHome = () => !['open', 'opening'].includes(shell.dataset.portalShellState ?? '');
	for (const { anchor, label } of links) {
		const type = () => {
			if (reduceMotion.matches || !onHome() || 'navCursorDecode' in label.dataset) return;
			decode(label);
		};
		anchor.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') type(); });
		anchor.addEventListener('focus', () => { if (anchor.matches(':focus-visible')) type(); });
	}

	function cursorBox(label) {
		const rect = label.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) return null;
		const em = parseFloat(getComputedStyle(label).fontSize) || 16;
		const height = em * 1.06;
		return { x: rect.right + 4, y: rect.top + rect.height / 2 - height / 2, width: em * 0.53, height };
	}

	function finishMove() {
		window.clearTimeout(moveTimer);
		ghost?.remove();
		ghost = null;
		nav.classList.remove('is-nav-cursor-moving');
	}

	function moveCursor(from, to) {
		finishMove();
		const start = cursorBox(from.label);
		const end = cursorBox(to.label);
		// Only a horizontal header row steps across; the stacked mobile menu just shows the new cursor.
		if (!start || !end || Math.abs(start.y - end.y) > 2 || typeof Element.prototype.animate !== 'function') return;

		ghost = document.createElement('span');
		ghost.className = 'photo-nav-cursor-ghost';
		ghost.setAttribute('aria-hidden', 'true');
		ghost.style.width = `${end.width}px`;
		ghost.style.height = `${end.height}px`;
		document.body.append(ghost);
		nav.classList.add('is-nav-cursor-moving');
		ghost.animate(
			[
				{ transform: `translate(${start.x}px, ${start.y}px)` },
				{ transform: `translate(${end.x}px, ${end.y}px)` },
			],
			{ duration: STEP_MS, easing: `steps(${STEPS})`, fill: 'forwards' }
		);
		moveTimer = window.setTimeout(finishMove, STEP_MS);
	}

	function decode(label) {
		const text = label.dataset.navCursorText ?? label.textContent;
		const chars = [...text];
		const t0 = performance.now();
		label.dataset.navCursorDecode = String(t0);
		// Noise glyphs are not the name's width; hold the label's width so neither the cursor nor the
		// neighbouring items move while it decodes.
		if (!label.style.width) {
			const width = label.getBoundingClientRect().width;
			if (width > 0) {
				label.style.width = `${width}px`;
				label.style.flexShrink = '0';
				label.style.whiteSpace = 'nowrap';
			}
		}
		const step = (now) => {
			if (label.dataset.navCursorDecode !== String(t0)) return;
			const k = Math.min(1, (now - t0) / DECODE_MS);
			const settled = Math.floor(k * chars.length);
			label.textContent = k >= 1
				? text
				: chars.map((c, i) => (i < settled || c === ' ' ? c : NOISE[(Math.random() * NOISE.length) | 0])).join('');
			if (k < 1) {
				window.requestAnimationFrame(step);
				return;
			}
			delete label.dataset.navCursorDecode;
			label.style.removeProperty('width');
			label.style.removeProperty('flex-shrink');
			label.style.removeProperty('white-space');
		};
		window.requestAnimationFrame(step);
	}
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
