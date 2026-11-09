/**
 * Ko-fi Support popup for Work Details (Portal panel and Direct /works/<slug>/).
 *
 * The Support button (.work-kofi, rendered beside Download / GitHub) opens a
 * popup in Ko-fi's own floating-panel look that holds Ko-fi's donation panel
 * in an iframe. Nothing from Ko-fi loads until the button is pressed: no
 * Ko-fi script, widget or tracking runs on the page itself.
 *
 * The popup lives on <body> (outside the Portal panel, whose own Escape / Tab
 * handling stays untouched) and follows its button while open. It closes on
 * Escape, its close button, a second press of Support, or when the Work
 * Detail holding the button goes away.
 */

const TRIGGER_SELECTOR = '.work-kofi';
const GAP = 10;
const EDGE = 16;
const MOBILE_BREAKPOINT = 600;
const CLOSE_ICON = '<svg viewBox="0 5 15 15" width="15" height="15" aria-hidden="true" focusable="false"><line x1="2" y1="8" x2="13" y2="18" stroke="#000" stroke-width="3"/><line x1="13" y1="8" x2="2" y2="18" stroke="#000" stroke-width="3"/></svg>';

let popup = null;
let frame = null;
let closer = null;
let notice = null;
let trigger = null;
let rafId = 0;
let hideTimer = 0;

function isAllowedUrl(value) {
	try {
		const url = new URL(value);
		return url.protocol === 'https:' && url.hostname === 'ko-fi.com';
	} catch {
		return false;
	}
}

function buildPopup() {
	popup = document.createElement('div');
	popup.className = 'work-kofi-popup';
	popup.id = 'work-kofi-popup';
	popup.setAttribute('role', 'dialog');
	popup.hidden = true;

	closer = document.createElement('button');
	closer.type = 'button';
	closer.className = 'work-kofi-popup__closer';
	closer.setAttribute('aria-label', 'Close');
	closer.innerHTML = CLOSE_ICON;
	closer.addEventListener('click', () => close(true));

	const holder = document.createElement('div');
	holder.className = 'work-kofi-popup__frame';
	frame = document.createElement('iframe');
	frame.setAttribute('title', 'Ko-fi');
	frame.setAttribute('loading', 'eager');
	holder.append(frame);

	notice = document.createElement('div');
	notice.className = 'work-kofi-popup__notice';
	const link = document.createElement('a');
	link.target = '_blank';
	link.rel = 'noopener noreferrer';
	notice.append(link);

	popup.append(closer, holder, notice);
	document.body.append(popup);
}

function triggerIsGone() {
	return !(trigger instanceof HTMLElement) || !trigger.isConnected || trigger.getClientRects().length === 0;
}

function place() {
	if (!popup || popup.hidden) return;
	popup.classList.remove('is-mobi');
	popup.style.left = '';
	popup.style.top = '';
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;
	const height = popup.offsetHeight;
	const width = popup.offsetWidth;
	if (viewportWidth < MOBILE_BREAKPOINT || height > viewportHeight - 2 * EDGE) {
		popup.classList.add('is-mobi');
		return;
	}
	const rect = trigger.getBoundingClientRect();
	let left = Math.min(Math.max(EDGE, rect.left), viewportWidth - width - EDGE);
	let top;
	if (rect.bottom + GAP + height <= viewportHeight - EDGE) {
		top = rect.bottom + GAP; // below the button
	} else if (rect.top - GAP - height >= EDGE) {
		top = rect.top - GAP - height; // above it
	} else {
		// beside it, pulled into view
		top = Math.min(Math.max(EDGE, rect.top), viewportHeight - height - EDGE);
		if (rect.right + GAP + width <= viewportWidth - EDGE) left = rect.right + GAP;
		else if (rect.left - GAP - width >= EDGE) left = rect.left - GAP - width;
	}
	popup.style.left = `${Math.round(left)}px`;
	popup.style.top = `${Math.round(top)}px`;
}

// While open, follow the button (the Portal panel scrolls on its own) and
// close when the Work Detail that holds it is closed or swapped.
function follow() {
	if (!popup || popup.hidden) return;
	if (triggerIsGone()) {
		close(false);
		return;
	}
	place();
	rafId = window.requestAnimationFrame(follow);
}

function open(button) {
	const url = button.dataset.kofiUrl ?? '';
	const page = button.dataset.kofiPage ?? '';
	if (!isAllowedUrl(url)) return;
	if (!popup) buildPopup();
	if (trigger && trigger !== button) trigger.setAttribute('aria-expanded', 'false');
	trigger = button;
	window.clearTimeout(hideTimer);

	if (frame.getAttribute('src') !== url) frame.setAttribute('src', url);
	frame.setAttribute('title', `Support ${page} on Ko-fi`);
	popup.setAttribute('aria-label', 'Support on Ko-fi');
	const link = notice.querySelector('a');
	link.href = `https://ko-fi.com/${encodeURIComponent(page)}`;
	link.textContent = `ko-fi.com/${page}`;

	popup.hidden = false;
	place();
	window.requestAnimationFrame(() => popup.classList.add('is-open'));
	button.setAttribute('aria-expanded', 'true');
	closer.focus({ preventScroll: true });
	window.cancelAnimationFrame(rafId);
	rafId = window.requestAnimationFrame(follow);
}

function close(restoreFocus) {
	if (!popup || popup.hidden) return;
	popup.classList.remove('is-open');
	window.cancelAnimationFrame(rafId);
	const button = trigger;
	if (button) button.setAttribute('aria-expanded', 'false');
	const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	hideTimer = window.setTimeout(() => {
		if (!popup.classList.contains('is-open')) popup.hidden = true;
	}, reduced ? 0 : 300);
	if (restoreFocus && button instanceof HTMLElement && button.isConnected) button.focus({ preventScroll: true });
}

// "Buy Me a Coffee" sits to the right of the button; where that would leave the
// viewport (narrow screens, or the button at the end of a full row) it goes above.
const TIP_GAP = 12;
const TIP_MARGIN = 8;
function fitTip(event) {
	const button = event.target instanceof Element ? event.target.closest(TRIGGER_SELECTOR) : null;
	if (!(button instanceof HTMLElement)) return;
	const tip = button.querySelector('.work-kofi__tip');
	if (!(tip instanceof HTMLElement)) return;
	const right = button.getBoundingClientRect().right + TIP_GAP + tip.offsetWidth;
	button.classList.toggle('work-kofi--tip-above', right > document.documentElement.clientWidth - TIP_MARGIN);
}
document.addEventListener('pointerover', fitTip);
document.addEventListener('focusin', fitTip);

document.addEventListener('click', (event) => {
	const button = event.target instanceof Element ? event.target.closest(TRIGGER_SELECTOR) : null;
	if (!(button instanceof HTMLButtonElement)) return;
	event.preventDefault();
	if (popup && !popup.hidden && popup.classList.contains('is-open') && trigger === button) close(false);
	else open(button);
});

// Capture phase, like the CONTACT form: Escape closes the popup before the
// surrounding Portal panel sees it, so the Work Detail itself stays open.
document.addEventListener('keydown', (event) => {
	if (event.key !== 'Escape' || !popup || popup.hidden) return;
	event.stopPropagation();
	event.preventDefault();
	close(true);
}, true);

window.addEventListener('resize', place);
window.addEventListener('popstate', () => close(false));
