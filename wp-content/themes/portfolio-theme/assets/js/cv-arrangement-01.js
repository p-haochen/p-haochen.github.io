/*
 * CV Selected Experience "arrangement".
 *
 * On wide screens the years run left to right like a DAW timeline: the section
 * pins while you scroll, the track slides past and a playhead sweeps across it;
 * the year under the playhead lights up. Drag the timeline, swipe horizontally
 * or click a year to move. On narrow screens it stays a vertical list and the
 * year at the reading line lights up instead.
 * Works for the Direct /about/ page and for Portal panels injected later.
 */
const ROOT_SELECTOR = '[data-cv-arrangement]';
const instances = new WeakMap();
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const narrow = window.matchMedia('(max-width: 760px)');
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function scrollParent(element) {
	for (let node = element.parentElement; node; node = node.parentElement) {
		const overflow = getComputedStyle(node).overflowY;
		if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight + 1) return node;
	}
	return null;
}

function init(root) {
	if (instances.has(root)) return;
	const pin = root.querySelector('.cv-arrangement__pin');
	const view = root.querySelector('.cv-arrangement__view');
	const track = root.querySelector('.cv-arrangement__track');
	const head = root.querySelector('.cv-arrangement__head');
	const blocks = [...root.querySelectorAll('.cv-arrangement__block')];
	if (!(pin instanceof HTMLElement) || !(view instanceof HTMLElement) || !(track instanceof HTMLElement) || !(head instanceof HTMLElement) || blocks.length === 0) return;

	let scroller = null;
	let distance = 0;
	let current = -1;
	let drag = null;
	let queued = false;

	const viewTop = () => (scroller ? scroller.getBoundingClientRect().top : 0);
	const viewHeight = () => (scroller ? scroller.clientHeight : window.innerHeight);
	const scrollTop = () => (scroller ? scroller.scrollTop : window.scrollY);
	const scrollToY = (top, smooth) => {
		const options = { top, behavior: smooth && !reduceMotion.matches ? 'smooth' : 'auto' };
		if (scroller) scroller.scrollTo(options);
		else window.scrollTo(options);
	};
	const trackPadding = () => Number.parseFloat(getComputedStyle(track).paddingLeft) || 0;
	const sectionTopInScroll = () => root.getBoundingClientRect().top - viewTop() + scrollTop();

	// Year headings become buttons only once the script is in charge of them.
	blocks.forEach((block) => {
		const heading = block.querySelector('.cv-experience__year');
		if (!(heading instanceof HTMLElement) || heading.querySelector('button')) return;
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'cv-arrangement__mark';
		button.textContent = heading.textContent.trim();
		heading.replaceChildren(button);
		button.addEventListener('click', () => goTo(block, true));
		// Keyboard focus on a year that is off to the side brings it under the playhead, instead of
		// letting the browser scroll the clipped view on its own (see the view scroll guard below).
		button.addEventListener('focus', () => {
			if (!narrow.matches && button.matches(':focus-visible')) goTo(block, false);
		});
	});

	function goTo(block, smooth) {
		if (narrow.matches) {
			scrollToY(scrollTop() + block.getBoundingClientRect().top - viewTop() - 16, smooth);
			return;
		}
		const pad = trackPadding();
		const progress = clamp((block.offsetLeft + 4 - pad) / Math.max(1, track.scrollWidth - 2 * pad), 0, 1);
		scrollToY(sectionTopInScroll() + progress * distance + 1, smooth);
	}
	root.classList.add('is-enhanced');

	function layout() {
		scroller = scroller || scrollParent(root);
		if (narrow.matches) {
			root.style.height = '';
			pin.style.top = '';
			pin.style.height = '';
			track.style.transform = '';
			return;
		}
		// A Portal scroller pads its top; stick to its visible edge instead of below the padding.
		const pad = scroller ? Number.parseFloat(getComputedStyle(scroller).paddingTop) || 0 : 0;
		const height = viewHeight();
		// Whatever follows the timeline in the scroller (section padding, the panel's own end).
		const total = scroller ? scroller.scrollHeight : document.documentElement.scrollHeight;
		const trailing = Math.max(0, total - (sectionTopInScroll() + root.offsetHeight));
		const stage = root.querySelector('.cv-arrangement__stage');
		const content = stage instanceof HTMLElement ? stage.offsetTop + stage.offsetHeight + 16 : 0;
		const pinHeight = Math.max(content, height - trailing);
		pin.style.top = `${-pad}px`;
		pin.style.height = `${pinHeight}px`;
		distance = Math.max(0, track.scrollWidth - view.clientWidth);
		root.style.height = `${pinHeight + distance}px`;
	}

	function setCurrent(index) {
		if (index === current) return;
		current = index;
		blocks.forEach((block, i) => block.classList.toggle('is-current', i === index));
	}

	function update() {
		scroller = scroller || scrollParent(root);
		const rect = root.getBoundingClientRect();
		if (rect.height < 1) return;
		if (narrow.matches) {
			// Near the end the reading line sweeps down so the last years can still light up.
			const rest = scroller
				? scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
				: document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
			const sweep = clamp(1 - rest / (viewHeight() * 0.6), 0, 1);
			const line = viewTop() + viewHeight() * (0.4 + 0.58 * sweep);
			let index = 0;
			blocks.forEach((block, i) => { if (block.getBoundingClientRect().top <= line) index = i; });
			setCurrent(index);
			return;
		}
		const pad = trackPadding();
		const progress = distance ? clamp((viewTop() - rect.top) / distance, 0, 1) : 0;
		const x = pad + progress * (track.scrollWidth - 2 * pad);
		track.style.transform = `translate3d(${(-progress * distance).toFixed(1)}px, 0, 0)`;
		head.style.setProperty('--cv-head-x', `${(x - progress * distance).toFixed(1)}px`);
		let index = 0;
		blocks.forEach((block, i) => { if (block.offsetLeft <= x) index = i; });
		setCurrent(index);
	}

	const tick = () => { queued = false; layout(); update(); };
	const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(tick); } };

	let dragged = false;
	function onPointerDown(event) {
		if (narrow.matches || event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('button')) return;
		drag = { x: event.clientX, top: scrollTop(), id: event.pointerId, active: false };
		dragged = false;
	}
	function onPointerMove(event) {
		if (!drag) return;
		if (!drag.active) {
			if (Math.abs(event.clientX - drag.x) < 5) return;
			drag.active = true;
			dragged = true;
			view.setPointerCapture(drag.id);
			view.classList.add('is-dragging');
		}
		scrollToY(drag.top - (event.clientX - drag.x), false);
	}
	function endDrag() {
		drag = null;
		view.classList.remove('is-dragging');
	}
	// A drag that ends over a clip must not open it.
	view.addEventListener('click', (event) => {
		if (!dragged) return;
		dragged = false;
		event.preventDefault();
		event.stopPropagation();
	}, true);
	function onWheel(event) {
		if (narrow.matches || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
		event.preventDefault();
		scrollToY(scrollTop() + event.deltaX, false);
	}
	function onNarrowChange() {
		current = -1;
		schedule();
	}

	view.addEventListener('pointerdown', onPointerDown);
	view.addEventListener('pointermove', onPointerMove);
	view.addEventListener('pointerup', endDrag);
	view.addEventListener('pointercancel', endDrag);
	view.addEventListener('wheel', onWheel, { passive: false });
	// The track moves by transform only; a browser focus scroll of the clipped view would stack on
	// top of it and push the focused year out of sight.
	view.addEventListener('scroll', () => { if (view.scrollLeft !== 0) view.scrollLeft = 0; }, { passive: true });
	document.addEventListener('scroll', schedule, { capture: true, passive: true });
	window.addEventListener('resize', schedule);
	narrow.addEventListener?.('change', onNarrowChange);
	// The Portal may insert the panel before it has a size; re-measure whenever it settles.
	const resizeObserver = new ResizeObserver(schedule);
	resizeObserver.observe(view);
	resizeObserver.observe(track);

	instances.set(root, {
		teardown() {
			resizeObserver.disconnect();
			document.removeEventListener('scroll', schedule, { capture: true });
			window.removeEventListener('resize', schedule);
			narrow.removeEventListener?.('change', onNarrowChange);
			instances.delete(root);
		},
	});
	tick();
}

function scan(scope) {
	if (scope instanceof Element && scope.matches(ROOT_SELECTOR)) init(scope);
	scope.querySelectorAll?.(ROOT_SELECTOR).forEach((root) => init(root));
}

// ---- CV credits that are Works: the cover follows the pointer; the whole clip opens the Work ----
let peek = null;
function peekElement() {
	if (peek) return peek;
	peek = document.createElement('div');
	peek.className = 'cv-work-peek';
	peek.setAttribute('aria-hidden', 'true');
	const image = document.createElement('img');
	image.alt = '';
	image.decoding = 'async';
	peek.append(image);
	document.body.append(peek);
	return peek;
}
function workLinkOf(target) {
	const row = target instanceof Element ? target.closest('.cv-experience__row') : null;
	const link = row?.querySelector('a.cv-experience__link[data-work-cover]');
	return link instanceof HTMLAnchorElement ? link : null;
}
function placePeek(event) {
	const box = peekElement();
	const width = box.offsetWidth || 208;
	const height = box.offsetHeight || 160;
	const x = event.clientX + 20 + width > window.innerWidth ? event.clientX - 20 - width : event.clientX + 20;
	const y = Math.min(Math.max(8, event.clientY - height / 2), window.innerHeight - height - 8);
	box.style.setProperty('--peek-x', `${Math.round(x)}px`);
	box.style.setProperty('--peek-y', `${Math.round(y)}px`);
}
function wireWorkClips() {
	const hover = window.matchMedia('(hover: hover) and (pointer: fine)');
	document.addEventListener('pointerover', (event) => {
		if (!hover.matches) return;
		const link = workLinkOf(event.target);
		if (!link || !link.dataset.workCover) return;
		const box = peekElement();
		const image = box.querySelector('img');
		if (image.getAttribute('src') !== link.dataset.workCover) image.src = link.dataset.workCover;
		placePeek(event);
		box.classList.add('is-visible');
	});
	document.addEventListener('pointermove', (event) => {
		if (peek?.classList.contains('is-visible')) placePeek(event);
	}, { passive: true });
	document.addEventListener('pointerout', (event) => {
		const from = workLinkOf(event.target);
		if (from && from !== workLinkOf(event.relatedTarget)) peek?.classList.remove('is-visible');
	});
	document.addEventListener('scroll', () => peek?.classList.remove('is-visible'), { capture: true, passive: true });
	// A press anywhere on the clip opens the Work, through its link (the Portal opens it in place).
	document.addEventListener('click', (event) => {
		if (event.defaultPrevented || !(event.target instanceof Element) || event.target.closest('a')) return;
		const link = workLinkOf(event.target);
		if (!link) return;
		peek?.classList.remove('is-visible');
		link.click();
	});
}

function boot() {
	wireWorkClips();
	scan(document);
	new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) if (node instanceof Element) scan(node);
			for (const node of mutation.removedNodes) {
				if (!(node instanceof Element)) continue;
				const removed = node.matches(ROOT_SELECTOR) ? [node] : [...node.querySelectorAll(ROOT_SELECTOR)];
				for (const root of removed) if (!root.isConnected) instances.get(root)?.teardown();
			}
		}
	}).observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
