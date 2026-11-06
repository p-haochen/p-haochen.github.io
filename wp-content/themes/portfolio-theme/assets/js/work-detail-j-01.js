/*
 * Work Detail J (docs/prototypes/work-detail-player): motion and small
 * interactions on top of the server-rendered Work page.
 *
 * - arrival: the cover is acquired by a scan line, the title arrives letter by
 *   letter, the catalogue rules draw in and YEAR / CATEGORY decode;
 * - the cover tilts toward the cursor and shrinks while you scroll, so the
 *   section index under it stays in view;
 * - the section index follows the section you are reading;
 * - credit names light up everywhere the same person appears;
 * - previous / next show the other Work's cover beside the cursor.
 *
 * Works for a Direct /works/{slug}/ page and for Portal panels inserted later.
 */
const ROOT_SELECTOR = '.work-detail--j';
const GLYPHS = '01<>/#%_=+*';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
const phone = window.matchMedia('(max-width: 760px)');
const instances = new WeakMap();
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function scrollParent(element) {
	for (let node = element.parentElement; node; node = node.parentElement) {
		const overflow = getComputedStyle(node).overflowY;
		if (overflow === 'auto' || overflow === 'scroll') return node;
	}
	return null;
}

function decodeText(node, delay = 0) {
	if (!(node instanceof HTMLElement) || reduceMotion.matches) return;
	const target = node.dataset.decodeText ?? node.textContent ?? '';
	if (target.trim() === '') return;
	node.dataset.decodeText = target;
	const characters = [...target];
	let start = 0;
	const step = (now) => {
		if (!node.isConnected) return;
		if (!start) start = now + delay;
		const progress = clamp((now - start) / 520, 0, 1);
		const fixed = Math.floor(progress * characters.length);
		if (now >= start) {
			node.textContent = characters.slice(0, fixed).join('')
				+ characters.slice(fixed).map((character) => (character.trim() === '' ? character : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join('');
		}
		if (progress < 1) window.requestAnimationFrame(step);
		else node.textContent = target;
	};
	window.requestAnimationFrame(step);
}

function splitTitle(title) {
	if (!(title instanceof HTMLElement) || title.dataset.split === 'true') return [];
	const text = title.textContent ?? '';
	if (text.trim() === '') return [];
	title.dataset.split = 'true';
	title.setAttribute('aria-label', text.trim());
	const fragment = document.createDocumentFragment();
	const isLatin = (character) => /[A-Za-z0-9'’&.-]/.test(character);
	let word = null;
	let index = 0;
	const characters = [];
	for (const character of text) {
		if (character === ' ' || character === '\n') {
			word = null;
			fragment.append(' ');
			continue;
		}
		const span = document.createElement('span');
		span.className = 'work-detail__char';
		span.setAttribute('aria-hidden', 'true');
		span.textContent = character;
		span.style.setProperty('--i', String(index));
		index += 1;
		characters.push(span);
		if (isLatin(character)) {
			if (!word) {
				word = document.createElement('span');
				word.className = 'work-detail__word';
				fragment.append(word);
			}
			word.append(span);
		} else {
			word = null;
			fragment.append(span);
		}
	}
	title.replaceChildren(fragment);
	return characters;
}

function init(root) {
	if (instances.has(root)) return;
	const releases = [];
	const listen = (target, type, handler, options) => {
		target.addEventListener(type, handler, options);
		releases.push(() => target.removeEventListener(type, handler, options));
	};
	const scroller = scrollParent(root);
	const scrollTarget = scroller ?? window;
	const scrollTop = () => (scroller ? scroller.scrollTop : window.scrollY);
	const viewTop = () => (scroller ? scroller.getBoundingClientRect().top : 0);
	const aside = root.querySelector('.work-detail__aside');
	const main = root.querySelector('.work-detail__main');

	/* arrival */
	if (!reduceMotion.matches) {
		root.classList.add('is-enter');
		const timer = window.setTimeout(() => root.classList.remove('is-enter'), 2200);
		releases.push(() => window.clearTimeout(timer));
	}

	/* cover: scan line on arrival, tilt toward the cursor */
	const hero = root.querySelector('.work-detail__hero');
	const heroImage = hero?.querySelector('img');
	if (hero instanceof HTMLElement && heroImage instanceof HTMLImageElement && !hero.querySelector('.work-detail__cover-in')) {
		const inner = document.createElement('div');
		inner.className = 'work-detail__cover-in';
		const scan = document.createElement('span');
		scan.className = 'work-detail__cover-scan';
		scan.setAttribute('aria-hidden', 'true');
		heroImage.replaceWith(inner);
		inner.append(heroImage, scan);
		listen(hero, 'pointermove', (event) => {
			if (event.pointerType !== 'mouse' || reduceMotion.matches || phone.matches) return;
			const rect = hero.getBoundingClientRect();
			const x = (event.clientX - rect.left) / rect.width;
			const y = (event.clientY - rect.top) / rect.height;
			hero.classList.add('is-tilt');
			inner.style.setProperty('--ry', `${((x - 0.5) * 10).toFixed(2)}deg`);
			inner.style.setProperty('--rx', `${((0.5 - y) * 8).toFixed(2)}deg`);
			inner.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
			inner.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
		});
		listen(hero, 'pointerleave', () => {
			hero.classList.remove('is-tilt');
			inner.style.setProperty('--rx', '0deg');
			inner.style.setProperty('--ry', '0deg');
		});
	}

	/* catalogue: rows draw in, YEAR and CATEGORY decode */
	root.querySelectorAll('.work-detail__metadata-row').forEach((row, index) => row.style.setProperty('--i', String(index)));
	decodeText(root.querySelector('.work-detail__year'), 490);
	root.querySelectorAll('.work-detail__categories a').forEach((link) => decodeText(link, 560));

	/* title: letters arrive one by one and lean toward the cursor */
	const title = root.querySelector('.work-detail__title');
	const characters = splitTitle(title);
	if (title instanceof HTMLElement && characters.length > 0) {
		listen(title, 'pointermove', (event) => {
			if (event.pointerType !== 'mouse' || reduceMotion.matches) return;
			for (const character of characters) {
				const rect = character.getBoundingClientRect();
				const dx = event.clientX - (rect.left + rect.width / 2);
				const dy = event.clientY - (rect.top + rect.height / 2);
				const distance = Math.hypot(dx, dy * 1.4);
				const k = Math.exp(-(distance * distance) / 5000);
				character.style.setProperty('--dy', `${(-10 * k).toFixed(2)}px`);
				character.classList.toggle('is-near', k > 0.5);
			}
		});
		listen(title, 'pointerleave', () => characters.forEach((character) => {
			character.style.setProperty('--dy', '0px');
			character.classList.remove('is-near');
		}));
	}

	/* sections: index in the aside, current section, labels decode once */
	const sections = [...root.querySelectorAll('[data-work-detail-section]')];
	let index = null;
	let indexButtons = [];
	if (aside instanceof HTMLElement && sections.length > 1) {
		index = document.createElement('ol');
		index.className = 'work-detail__index';
		index.setAttribute('aria-label', 'On this page');
		const marker = document.createElement('i');
		marker.setAttribute('aria-hidden', 'true');
		index.append(marker);
		for (const section of sections) {
			const item = document.createElement('li');
			const button = document.createElement('button');
			button.type = 'button';
			button.textContent = section.dataset.workDetailSection ?? '';
			button.addEventListener('click', () => {
				const offset = phone.matches ? 16 : 96;
				const top = section.getBoundingClientRect().top - viewTop() + scrollTop() - offset;
				scrollTarget.scrollTo({ top, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
			});
			item.append(button);
			index.append(item);
			indexButtons.push(button);
		}
		aside.append(index);
		releases.push(() => index?.remove());
	}
	const labelObserver = typeof IntersectionObserver === 'function'
		? new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				labelObserver.unobserve(entry.target);
				decodeText(entry.target.querySelector('.work-detail__label-text'));
			}
		}, { root: scroller, rootMargin: '0px 0px -15% 0px' })
		: null;
	sections.forEach((section) => labelObserver?.observe(section));
	releases.push(() => labelObserver?.disconnect());

	let queued = false;
	function onScroll() {
		queued = false;
		if (!root.isConnected) return;
		if (aside instanceof HTMLElement) aside.classList.toggle('is-compact', !phone.matches && scrollTop() > 160);
		const anchor = viewTop() + (scroller ? scroller.clientHeight : window.innerHeight) * 0.35;
		let current = -1;
		sections.forEach((section, position) => { if (section.getBoundingClientRect().top <= anchor) current = position; });
		sections.forEach((section, position) => section.classList.toggle('is-current', position === current));
		indexButtons.forEach((button, position) => {
			button.classList.toggle('is-current', position === current);
			if (position === current) button.setAttribute('aria-current', 'true');
			else button.removeAttribute('aria-current');
		});
		if (index) {
			if (current >= 0) {
				index.style.setProperty('--marker-y', `${indexButtons[current].parentElement.offsetTop}px`);
				index.style.setProperty('--marker-opacity', '1');
			} else {
				index.style.setProperty('--marker-opacity', '0');
			}
		}
	}
	const scheduleScroll = () => { if (!queued) { queued = true; window.requestAnimationFrame(onScroll); } };
	listen(scrollTarget, 'scroll', scheduleScroll, { passive: true });
	listen(window, 'resize', scheduleScroll);
	window.requestAnimationFrame(onScroll);

	/* credits: names light up wherever the same person appears */
	const credits = root.querySelector('.work-credits');
	if (credits instanceof HTMLElement) {
		credits.classList.remove('is-collapsed');
		const counts = new Map();
		const values = [...credits.querySelectorAll('dd')];
		const names = (text) => text.split(/[、,，]\s*/).map((name) => name.trim()).filter(Boolean);
		values.forEach((value) => names(value.textContent ?? '').forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1)));
		for (const value of values) {
			if (value.dataset.split === 'true') continue;
			value.dataset.split = 'true';
			const parts = (value.textContent ?? '').split(/([、,，]\s*)/);
			value.replaceChildren(...parts.map((part) => {
				const name = part.trim();
				if (name === '' || /^[、,，]$/.test(name)) return document.createTextNode(part);
				const span = document.createElement('span');
				span.className = 'work-credits__name';
				span.dataset.name = name;
				span.dataset.count = String(counts.get(name) ?? 1);
				span.textContent = part;
				return span;
			}));
		}
		let chip = null;
		const clear = () => {
			credits.classList.remove('is-highlighting');
			credits.querySelectorAll('.work-credits__name.is-highlighted').forEach((name) => name.classList.remove('is-highlighted'));
			chip?.remove();
			chip = null;
		};
		listen(credits, 'pointerover', (event) => {
			const name = event.target instanceof Element ? event.target.closest('.work-credits__name') : null;
			if (!(name instanceof HTMLElement) || !finePointer.matches) return;
			clear();
			credits.classList.add('is-highlighting');
			credits.querySelectorAll('.work-credits__name').forEach((other) => {
				if (other instanceof HTMLElement && other.dataset.name === name.dataset.name) other.classList.add('is-highlighted');
			});
			const rect = name.getBoundingClientRect();
			const count = Number(name.dataset.count);
			chip = document.createElement('span');
			chip.className = 'work-credits__chip';
			chip.textContent = count > 1 ? `${name.dataset.name} × ${count} 項` : name.dataset.name;
			chip.style.left = `${rect.left + rect.width / 2}px`;
			chip.style.top = `${rect.top}px`;
			document.body.append(chip);
		});
		listen(credits, 'pointerout', (event) => {
			const next = event.relatedTarget;
			if (!(next instanceof Element) || !next.closest('.work-credits__name')) clear();
		});
		listen(scrollTarget, 'scroll', clear, { passive: true });
		releases.push(clear);
	}

	/* previous / next: the other Work's cover follows the cursor */
	const pagerLinks = [...root.querySelectorAll('.work-pager__link[data-work-pager-cover]')];
	if (pagerLinks.length > 0) {
		const peek = document.createElement('img');
		peek.className = 'work-pager__peek';
		peek.alt = '';
		peek.decoding = 'async';
		document.body.append(peek);
		releases.push(() => peek.remove());
		for (const link of pagerLinks) {
			listen(link, 'pointerenter', (event) => {
				if (event.pointerType !== 'mouse' || !(link instanceof HTMLElement)) return;
				peek.src = link.dataset.workPagerCover ?? '';
				peek.style.setProperty('--peek-rotate', link.classList.contains('work-pager__link--next') ? '4deg' : '-4deg');
				peek.classList.add('is-shown');
			});
			listen(link, 'pointermove', (event) => {
				peek.style.left = `${event.clientX}px`;
				peek.style.top = `${event.clientY}px`;
			});
			listen(link, 'pointerleave', () => peek.classList.remove('is-shown'));
			listen(link, 'click', () => peek.classList.remove('is-shown'));
		}
	}

	if (main instanceof HTMLElement) main.classList.add('is-enhanced');
	instances.set(root, {
		teardown() {
			releases.splice(0).forEach((release) => release());
			instances.delete(root);
		},
	});
}

function scan(scope) {
	if (scope instanceof Element && scope.matches(ROOT_SELECTOR)) init(scope);
	scope.querySelectorAll?.(ROOT_SELECTOR).forEach((root) => init(root));
}

function boot() {
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
