import { createPlaylistComponent, playlistTracksForWork } from './playlist-component-01.js';
import { createMusicCollections } from './music-collections-01.js';
import { createSignalView, isSignalSoundOn, onSignalSoundChange, setSignalSound, signalSoundLevel } from './works-signal-01.js';

const validViews = new Set(['all', 'music', 'live', 'tech']);
const validSorts = new Set(['curated', 'newest', 'oldest', 'az']);
const directoryStates = new WeakMap();
const controlsStates = new WeakMap();
const titleCollator = new Intl.Collator(['en', 'zh-Hant'], { numeric: true, sensitivity: 'base' });

function normalizeView(value) {
	return typeof value === 'string' && validViews.has(value) ? value : 'all';
}

function viewLabel(view) {
	return view === 'tech' ? 'LAB' : view.toUpperCase();
}

function normalizeSort(value) {
	return typeof value === 'string' && validSorts.has(value) ? value : 'curated';
}

// ROLE, STYLE and TYPE accept several values: kept as one comma-separated string ("guitar,bass"), or 'all'.
// Works match when they have any of the chosen roles (and any of the chosen styles and types).
function parseMulti(value, labels) {
	if (typeof value !== 'string') return [];
	return [...new Set(value.split(',').map((item) => item.trim()).filter((item) => labels.has(item)))];
}

function normalizeRole(value, roleLabels) {
	const list = parseMulti(value, roleLabels);
	return list.length > 0 ? list.join(',') : 'all';
}

function normalizeStyle(value, styleLabels) {
	const list = parseMulti(value, styleLabels);
	return list.length > 0 ? list.join(',') : 'all';
}

function normalizeType(value, typeLabels) {
	const list = parseMulti(value, typeLabels);
	return list.length > 0 ? list.join(',') : 'all';
}

function multiValues(value) {
	return value === 'all' || typeof value !== 'string' || value === '' ? [] : value.split(',');
}

function matchesAny(value, slugs) {
	const wanted = multiValues(value);
	return wanted.length === 0 || wanted.some((slug) => slugs.includes(slug));
}

function keepAvailable(value, available) {
	const list = multiValues(value).filter((slug) => available.has(slug));
	return list.length > 0 ? list.join(',') : 'all';
}

function multiLabel(value, labels, fallback) {
	const list = multiValues(value);
	return list.length === 0 ? fallback : list.map((slug) => labels.get(slug) ?? slug).join(' + ');
}

function workYear(work) {
	return typeof work?.year === 'string' && /^\d{4}$/.test(work.year)
		? Number.parseInt(work.year, 10)
		: null;
}

function deterministicWorkFallback(left, right) {
	const title = titleCollator.compare(String(left?.title ?? ''), String(right?.title ?? ''));
	return title !== 0 ? title : Number(left?.id ?? 0) - Number(right?.id ?? 0);
}

function sortWorks(works, sort) {
	const normalized = normalizeSort(sort);
	return [...works].sort((left, right) => {
		if (normalized === 'curated') {
			const order = Number(left?.menu_order ?? 0) - Number(right?.menu_order ?? 0);
			return order !== 0 ? order : deterministicWorkFallback(left, right);
		}
		if (normalized === 'newest' || normalized === 'oldest') {
			const leftYear = workYear(left);
			const rightYear = workYear(right);
			if (leftYear === null && rightYear !== null) return 1;
			if (leftYear !== null && rightYear === null) return -1;
			if (leftYear !== null && rightYear !== null && leftYear !== rightYear) {
				return normalized === 'newest' ? rightYear - leftYear : leftYear - rightYear;
			}
		}
		return deterministicWorkFallback(left, right);
	});
}

function annotateWorkItem(item, work) {
	item.dataset.workId = String(work.id);
	item.dataset.workTitle = work.title;
	item.dataset.workYear = typeof work.year === 'string' ? work.year : '';
	item.dataset.workOrder = String(Number.isInteger(work.menu_order) ? work.menu_order : 0);
	item.dataset.workRoles = roleSlugs(work).join(' ');
	item.dataset.workStyles = styleSlugs(work).join(' ');
	item.dataset.workTypes = typeSlugs(work).join(' ');
}

function categorySlugs(work) {
	return Array.isArray(work?.categories)
		? work.categories.map((category) => category?.slug).filter((slug) => typeof slug === 'string')
		: [];
}

function workRoles(work) {
	return Array.isArray(work?.roles)
		? work.roles.filter((role) => role && typeof role.slug === 'string' && typeof role.label === 'string')
		: [];
}

function roleSlugs(work) {
	return workRoles(work).map((role) => role.slug);
}

function workStyles(work) {
	return Array.isArray(work?.styles)
		? work.styles.filter((style) => style && typeof style.slug === 'string' && typeof style.label === 'string')
		: [];
}

function styleSlugs(work) {
	return workStyles(work).map((style) => style.slug);
}

function workTypes(work) {
	return Array.isArray(work?.types)
		? work.types.filter((type) => type && typeof type.slug === 'string' && typeof type.label === 'string')
		: [];
}

function typeSlugs(work) {
	return workTypes(work).map((type) => type.slug);
}

// SEARCH: one free-text query across every view. Each word must appear somewhere in the Work's
// text (title, About, credits, TYPE / ROLE / STYLE, EVENT, VENUE, tracks ...); case and full-width
// characters do not matter. Chinese needs no spaces: "嘉義" matches inside a venue line.
function normalizeQuery(value) {
	return typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
}

const workSearchTexts = new WeakMap();
function workSearchText(work) {
	let text = workSearchTexts.get(work);
	if (text === undefined) {
		text = `${work?.title ?? ''} ${typeof work?.search === 'string' ? work.search : ''}`.normalize('NFKC').toLowerCase();
		workSearchTexts.set(work, text);
	}
	return text;
}

function matchesQuery(work, query) {
	if (!query) return true;
	const text = workSearchText(work);
	return query.toLowerCase().split(' ').every((word) => text.includes(word));
}

function matchesFilters(work, role, style, type, query = '') {
	return matchesAny(role, roleSlugs(work)) && matchesAny(style, styleSlugs(work)) && matchesAny(type, typeSlugs(work)) && matchesQuery(work, query);
}

// The empty-state message lists every active filter; STYLE and TYPE travel together there.
function extraFilter(style, type, styleLabel, typeLabel, query = '') {
	const labels = [style === 'all' ? '' : styleLabel, type === 'all' ? '' : typeLabel, query ? `“${query}”` : ''].filter(Boolean);
	return labels.length === 0 ? { value: 'all', label: '' } : { value: 'active', label: labels.join(' + ') };
}

function worksForView(works, view) {
	return view === 'all' ? works : works.filter((work) => categorySlugs(work).includes(view));
}

function createEmptyState(view, role, style, roleLabel, styleLabel) {
	const empty = document.createElement('div');
	empty.className = 'works-view__empty';
	empty.setAttribute('role', 'status');
	const message = document.createElement('p');
	const activeLabels = [role === 'all' ? '' : roleLabel, style === 'all' ? '' : styleLabel].filter(Boolean);
	message.textContent = activeLabels.length === 0
		? `No published ${viewLabel(view)} works yet.`
		: `No ${view === 'all' ? '' : `${viewLabel(view)} `}works match ${activeLabels.join(' + ')}.`;
	empty.append(message);
	if (activeLabels.length > 0) {
		const clear = document.createElement('button');
		clear.type = 'button';
		clear.dataset.workFiltersClear = '';
		clear.textContent = 'Clear Filters';
		empty.append(clear);
	}
	return empty;
}

const artworkSources = new WeakMap();
const activeCoverGroups = new WeakMap();
const releasedCoverGroups = new WeakSet();
const prefetchedCovers = new Map();
const coverGroupFallbackMs = 1800;
const coverGroupHardFallbackMs = 3200;

function hasArtwork(cover) {
	return Boolean(cover && typeof cover.src === 'string' && cover.src !== '');
}

function createArtwork(cover, className) {
	const frame = document.createElement('div');
	frame.className = className;
	if (!hasArtwork(cover)) return frame;
	const image = document.createElement('img');
	image.alt = typeof cover.alt === 'string' && cover.alt !== '' ? cover.alt : '';
	image.decoding = 'async';
	const requestedSizes = typeof cover.card_sizes === 'string' && cover.card_sizes !== '' ? cover.card_sizes : cover.sizes;
	if (Number.isFinite(cover.width) && cover.width > 0) image.width = cover.width;
	if (Number.isFinite(cover.height) && cover.height > 0) image.height = cover.height;
	artworkSources.set(image, {
		src: cover.src,
		srcset: typeof cover.srcset === 'string' ? cover.srcset : '',
		sizes: typeof requestedSizes === 'string' ? requestedSizes : '',
	});
	frame.append(image);
	return frame;
}

function coverDisplayWidth(image, frame) {
	const { width, height } = frame.getBoundingClientRect();
	const intrinsicWidth = Number.parseInt(image.getAttribute('width') ?? '', 10);
	const intrinsicHeight = Number.parseInt(image.getAttribute('height') ?? '', 10);
	const maxWidth = Math.max(1, width - 2);
	const maxHeight = Math.max(1, height - 2);
	return Math.max(1, Math.ceil(
		intrinsicWidth > 0 && intrinsicHeight > 0
			? Math.min(maxWidth, maxHeight * intrinsicWidth / intrinsicHeight)
			: maxWidth,
	));
}

let coverResizeFrame = 0;
window.addEventListener('resize', () => {
	if (coverResizeFrame) return;
	coverResizeFrame = window.requestAnimationFrame(() => {
		coverResizeFrame = 0;
		// Critical covers use measured sizes; unlike lazy auto sizes, those must
		// follow native zoom/window resizing or width:auto keeps the old density.
		// Scan only mounted covers: no retained nodes or repeated reveal lifecycle.
		for (const image of document.querySelectorAll('.works-card__media img, .music-cover-card__artwork img, .music-collection__artwork img')) {
			if (image.loading !== 'eager' || !image.srcset || !/^\d+px$/.test(image.sizes)) continue;
			const frame = image.closest('.works-card__media, .music-cover-card__artwork, .music-collection__artwork');
			if (!(frame instanceof HTMLElement) || frame.getBoundingClientRect().width === 0) continue;
			const sizes = `${coverDisplayWidth(image, frame)}px`;
			if (image.sizes !== sizes) image.sizes = sizes;
		}
	});
}, { passive: true });

function measureCriticalCoverWidths(works) {
	const sourceShell = document.querySelector('.photo-draft-shell');
	const sampleShell = sourceShell instanceof HTMLElement ? sourceShell.cloneNode(false) : document.createElement('div');
	if (!(sourceShell instanceof HTMLElement)) {
		sampleShell.className = 'photo-draft-shell';
		sampleShell.dataset.portalMotionMode = 'fade';
		sampleShell.dataset.portalShellMode = 'frame-on-open-b3';
	}
	sampleShell.removeAttribute('id');
	const panel = document.createElement('div');
	panel.className = 'photo-portal has-route-rail';
	panel.style.visibility = 'hidden';
	panel.style.pointerEvents = 'none';
	panel.setAttribute('aria-hidden', 'true');
	const surface = document.createElement('div');
	surface.className = 'photo-portal__surface';
	const header = document.createElement('div');
	header.className = 'photo-portal__header';
	const scroller = document.createElement('div');
	scroller.className = 'photo-portal__scroller';
	const content = document.createElement('div');
	content.className = 'photo-portal__content';
	const directory = document.createElement('div');
	directory.className = 'works-directory';
	const query = document.createElement('div');
	query.className = 'works-directory__query';
	const grid = document.createElement('ul');
	grid.className = 'works-grid works-view works-view--all';
	const frames = works.map((work) => {
		const item = document.createElement('li');
		item.className = 'wp-block-post';
		const article = document.createElement('article');
		article.className = 'works-card';
		const link = document.createElement('a');
		link.className = 'works-card__media-link';
		const frame = createArtwork(work.cover, 'works-card__media');
		link.append(frame);
		article.append(link);
		item.append(article);
		grid.append(item);
		return frame;
	});
	query.append(grid);
	directory.append(query);
	content.append(directory);
	scroller.append(content);
	surface.append(header, scroller);
	panel.append(surface);
	sampleShell.append(panel);
	document.body.append(sampleShell);
	try {
		return frames.map((frame) => coverDisplayWidth(frame.querySelector('img'), frame));
	} finally {
		sampleShell.remove();
	}
}

function responsiveCoverSource(cover) {
	const candidates = typeof cover.srcset === 'string' ? cover.srcset.split(',').map((part) => part.trim()) : [];
	const derivative = (url) => /-\d+(?:x\d+)?\.(?:avif|jpe?g|png|webp)(?:\?|$)/i.test(url);
	const responsive = candidates.filter((candidate) => derivative(candidate.split(/\s+/)[0] ?? ''));
	if (responsive.length === 0) return null;
	const fallback = derivative(cover.src) ? cover.src : responsive[0].split(/\s+/)[0];
	return { src: fallback, srcset: responsive.join(', ') };
}

export function prefetchWorksCriticalCovers(works, { priority = 'low' } = {}) {
	if (!Array.isArray(works) || !document.body) return Promise.resolve([]);
	try {
		const count = window.matchMedia('(min-width: 1200px)').matches ? 4 : 3;
		const selected = sortWorks(works.filter((work) => work && hasArtwork(work.cover)), 'curated')
			.filter((work) => responsiveCoverSource(work.cover)).slice(0, count);
		const widths = measureCriticalCoverWidths(selected);
		const pending = selected.map((work, index) => {
			const source = responsiveCoverSource(work.cover);
			const sizes = `${widths[index]}px`;
			const key = JSON.stringify([source.src, source.srcset, sizes, window.devicePixelRatio]);
			const shouldPrioritize = priority === 'high' && index < 2;
			let entry = prefetchedCovers.get(key);
			if (!entry) {
				const image = new Image();
				image.decoding = 'async';
				image.fetchPriority = shouldPrioritize ? 'high' : 'low';
				image.sizes = sizes;
				image.srcset = source.srcset;
				image.src = source.src;
				entry = { image, promise: Promise.resolve().then(() => image.decode()) };
				prefetchedCovers.set(key, entry);
			} else if (shouldPrioritize) {
				entry.image.fetchPriority = 'high';
			}
			return entry.promise;
		});
		return Promise.allSettled(pending);
	} catch (error) {
		return Promise.resolve([{ status: 'rejected', reason: error }]);
	}
}

function prepareWorksCoverGroup(root) {
	if (!(root instanceof HTMLElement)) return () => {};
	if (releasedCoverGroups.has(root)) return () => {};
	const activeRelease = activeCoverGroups.get(root);
	if (activeRelease) return activeRelease;
	const images = [...root.querySelectorAll('.works-card__media img, .music-cover-card__artwork img, .music-collection__artwork img')];
	if (images.length === 0) {
		root.classList.remove('is-cover-group-pending');
		root.dispatchEvent(new CustomEvent('portfolio:works-cover-group-ready', { bubbles: true }));
		return () => {};
	}
	const scroller = root.closest('.photo-portal__scroller');
	const clip = scroller instanceof HTMLElement ? scroller.getBoundingClientRect() : null;
	const top = Math.max(0, clip?.top ?? 0);
	const bottom = Math.min(window.innerHeight, clip?.bottom ?? window.innerHeight);
	const visibleImages = images.filter((image) => {
		const frame = image.closest('.works-card__media, .music-cover-card__artwork, .music-collection__artwork');
		const rect = (frame ?? image).getBoundingClientRect();
		return rect.width > 0 && rect.height > 0 && rect.bottom > top && rect.top < bottom;
	});
	const critical = window.matchMedia('(min-width: 1200px)').matches ? visibleImages.slice(0, 4) : visibleImages;
	root.classList.toggle('is-cover-group-pending', critical.length > 0);
	for (const image of critical) {
		image.style.opacity = '0';
		image.style.animation = 'none';
	}
	let highCount = 0;
	for (const image of images) {
		const source = artworkSources.get(image);
		const visible = critical.includes(image);
		const frame = image.closest('.works-card__media, .music-cover-card__artwork, .music-collection__artwork');
		image.loading = visible ? 'eager' : 'lazy';
		if (visible && highCount < 2) {
			image.fetchPriority = 'high';
			highCount += 1;
		} else {
			image.removeAttribute('fetchpriority');
		}
		if (visible) {
			if (frame instanceof HTMLElement && (source || !image.sizes)) image.sizes = `${coverDisplayWidth(image, frame)}px`;
		} else {
			const fallbackSizes = source?.sizes || image.sizes;
			if (fallbackSizes) image.sizes = /^\s*auto\s*,/i.test(fallbackSizes) ? fallbackSizes : `auto, ${fallbackSizes}`;
		}
		if (!source) continue;
		if (source.srcset) image.srcset = source.srcset;
		image.src = source.src;
	}
	if (critical.length === 0) {
		root.dispatchEvent(new CustomEvent('portfolio:works-cover-group-ready', { bubbles: true }));
		return () => {};
	}
	let settled = false;
	let softTimer = null;
	let hardTimer = null;
	const decoded = critical.map(() => false);
	const release = (timedOut = false) => {
		if (settled) return;
		settled = true;
		window.clearTimeout(softTimer);
		window.clearTimeout(hardTimer);
		root.classList.remove('is-cover-group-pending');
		root.classList.toggle('is-cover-group-fallback', timedOut || decoded.some((ready) => !ready));
		for (const [index, image] of critical.entries()) {
			image.style.removeProperty('animation');
			if (decoded[index]) image.style.removeProperty('opacity');
		}
		activeCoverGroups.delete(root);
		releasedCoverGroups.add(root);
		root.dispatchEvent(new CustomEvent('portfolio:works-cover-group-ready', { bubbles: true }));
	};
	activeCoverGroups.set(root, release);
	softTimer = window.setTimeout(() => {
		if (!settled) root.classList.add('is-cover-group-fallback');
	}, coverGroupFallbackMs);
	// Success reveals immediately. This is only a hard limit for a stalled decode.
	hardTimer = window.setTimeout(() => release(true), coverGroupHardFallbackMs);
	void Promise.allSettled(critical.map((image, index) => Promise.resolve()
		.then(() => image.decode())
		.then(() => { decoded[index] = true; })))
		.then(() => release());
	return release;
}

export function preparePrerenderedWorksCovers(container) {
	const grid = container instanceof HTMLElement ? container.querySelector('.works-grid') : null;
	return prepareWorksCoverGroup(grid);
}

function createCategoryLabel(work) {
	return Array.isArray(work?.categories)
		? work.categories.map((category) => category?.name).filter(Boolean).join(' · ')
		: '';
}

function createVisualCardOverlay(work, options = {}) {
	const overlay = document.createElement('div');
	overlay.className = 'works-card__overlay';
	overlay.setAttribute('aria-hidden', 'true');
	overlay.setAttribute('inert', '');
	const title = document.createElement('h2');
	title.className = 'works-card__overlay-title';
	title.textContent = work.title;
	const categories = document.createElement('p');
	categories.className = 'works-card__categories';
	categories.textContent = createCategoryLabel(work);
	overlay.append(title, categories);
	if (options.showYear === true && typeof work.year === 'string' && work.year !== '') {
		const year = document.createElement('p');
		year.className = 'works-card__year';
		year.textContent = work.year;
		overlay.append(year);
	}
	return overlay;
}

function createVisualCard(work, options = {}) {
	const item = document.createElement('li');
	item.className = ['wp-block-post', `post-${work.id}`, ...categorySlugs(work).map((slug) => `work_category-${slug}`)].join(' ');
	annotateWorkItem(item, work);
	const article = document.createElement('article');
	article.className = 'works-card';
	const mediaLink = document.createElement('a');
	mediaLink.href = work.canonical_url;
	mediaLink.className = 'works-card__media-link';
	mediaLink.setAttribute('aria-label', `View ${work.title}`);
	const media = createArtwork(work.cover, 'works-card__media');
	media.append(createVisualCardOverlay(work, options));
	mediaLink.append(media);
	const caption = document.createElement('div');
	caption.className = 'works-card__caption';
	const title = document.createElement('h2');
	title.className = 'works-card__title';
	const titleLink = document.createElement('a');
	titleLink.href = work.canonical_url;
	titleLink.textContent = work.title;
	title.append(titleLink);
	const categories = document.createElement('p');
	categories.className = 'works-card__categories';
	categories.textContent = createCategoryLabel(work);
	caption.append(title, categories);
	if (options.showYear === true && typeof work.year === 'string' && work.year !== '') {
		const year = document.createElement('p');
		year.className = 'works-card__year';
		year.textContent = work.year;
		caption.append(year);
	}
	article.append(mediaLink, caption);
	item.append(article);
	return item;
}

function renderVisualGrid(works, view, role, style, roleLabel, styleLabel) {
	const list = document.createElement('ul');
	list.className = `works-grid works-view works-view--${view}`;
	for (const work of works) {
		list.append(createVisualCard(work, { showYear: view !== 'all' }));
	}
	if (works.length === 0) return createEmptyState(view, role, style, roleLabel, styleLabel);
	return list;
}

function tracksForWork(work) {
	return playlistTracksForWork(work);
}

function playTrack(player, tracks, index) {
	if (!player || typeof player.playQueue !== 'function') return;
	void player.playQueue(tracks, index);
}

function createMusicCoverCard(work, player, onRequestOpen) {
	const item = document.createElement('li');
	item.className = `music-cover-card works-card wp-block-post post-${work.id} work_category-music`;
	annotateWorkItem(item, work);
	const reveal = document.createElement('button');
	reveal.type = 'button';
	reveal.className = 'music-cover-card__reveal';
	reveal.setAttribute('aria-label', `Show actions for ${work.title}`);
	reveal.setAttribute('aria-expanded', 'false');
	reveal.append(createArtwork(work.cover, 'music-cover-card__artwork'));
	item.append(reveal);
	const overlay = document.createElement('div');
	overlay.className = 'music-cover-card__overlay';
	const title = document.createElement('h3');
	title.className = 'music-cover-card__title';
	title.textContent = work.title;
	const actions = document.createElement('div');
	actions.className = 'music-cover-card__actions';
	const details = document.createElement('a');
	details.href = work.canonical_url;
	details.className = 'music-cover-card__details';
	details.textContent = 'MORE DETAILS';
	actions.append(details);
	const tracks = tracksForWork(work);
	let removePlayListener = () => {};
	if (tracks.length > 0) {
		const play = document.createElement('button');
		play.type = 'button';
		play.className = 'music-cover-card__play';
		play.textContent = 'PLAY';
		play.setAttribute('aria-label', `Play ${work.title}`);
		const onPlay = () => playTrack(player, tracks, 0);
		play.addEventListener('click', onPlay);
		removePlayListener = () => play.removeEventListener('click', onPlay);
		actions.append(play);
	}
	overlay.append(title, actions);
	item.append(overlay);
	let destroyed = false;
	let overlayOpen = false;
	const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
	const syncOverlaySemantics = () => {
		const available = finePointer.matches || overlayOpen;
		overlay.setAttribute('aria-hidden', String(!available));
		if (available) overlay.removeAttribute('inert');
		else overlay.setAttribute('inert', '');
	};
	const controller = {
		root: item,
		isOpen() { return overlayOpen; },
		setOverlayOpen(value) {
			overlayOpen = Boolean(value);
			item.classList.toggle('is-overlay-open', overlayOpen);
			reveal.setAttribute('aria-expanded', String(overlayOpen));
			syncOverlaySemantics();
		},
		destroy() {
			if (destroyed) return;
			destroyed = true;
			removePlayListener();
			reveal.removeEventListener('click', onReveal);
			finePointer.removeEventListener?.('change', syncOverlaySemantics);
		},
	};
	const onReveal = () => {
		if (finePointer.matches) return;
		onRequestOpen(controller);
	};
	reveal.addEventListener('click', onReveal);
	finePointer.addEventListener?.('change', syncOverlaySemantics);
	syncOverlaySemantics();
	return controller;
}

function createLegacyCollectionModule(work, player) {
	const tracks = tracksForWork(work);
	const module = document.createElement('article');
	module.className = 'music-collection';
	module.dataset.workId = String(work.id);
	const heading = document.createElement('h3');
	heading.className = 'music-collection__title';
	heading.textContent = work.title;
	const now = document.createElement('div');
	now.className = 'music-collection__now';
	now.append(createArtwork(work.cover, 'music-collection__artwork'));
	const current = document.createElement('div');
	current.className = 'music-collection__current';
	const label = document.createElement('p');
	label.className = 'music-collection__eyebrow';
	label.textContent = 'CURRENT TRACK';
	const currentTitle = document.createElement('p');
	currentTitle.className = 'music-collection__current-title';
	currentTitle.textContent = tracks[0]?.title ?? '';
	const controls = document.createElement('div');
	controls.className = 'music-collection__controls';
	let selectedIndex = 0;
	let destroyed = false;
	let lastScrolledIndex = -1;
	let lastSnapshot = null;
	const listeners = [];
	const on = (target, type, listener) => {
		target.addEventListener(type, listener);
		listeners.push(() => target.removeEventListener(type, listener));
	};
	const requestPlayback = (operation) => {
		try {
			void Promise.resolve(operation()).catch(() => {});
		} catch {
			// The singleton owns playback error presentation.
		}
	};
	const ownsQueue = (snapshot) => queuesMatch(snapshot?.queue, tracks);
	const control = (labelText, text) => {
		const button = document.createElement('button');
		button.type = 'button';
		button.setAttribute('aria-label', labelText);
		button.textContent = text;
		return button;
	};
	const previousButton = control(`Previous track in ${work.title}`, '◀');
	const playButton = control(`Play current track in ${work.title}`, '▶');
	const nextButton = control(`Next track in ${work.title}`, '▶');
	controls.append(previousButton, playButton, nextButton);

	const controlId = ++collectionControlId;
	const timeline = document.createElement('div');
	timeline.className = 'music-collection__timeline';
	const seekId = `music-collection-seek-${work.id}-${controlId}`;
	const seekLabel = document.createElement('label');
	seekLabel.className = 'screen-reader-text';
	seekLabel.htmlFor = seekId;
	seekLabel.textContent = `Playback position for ${work.title}`;
	const seek = document.createElement('input');
	seek.id = seekId;
	seek.dataset.musicCollectionSeek = '';
	seek.type = 'range';
	seek.min = '0';
	seek.max = '0';
	seek.step = '0.1';
	seek.value = '0';
	const time = document.createElement('output');
	time.dataset.musicCollectionTime = '';
	time.htmlFor = seekId;
	time.textContent = '0:00 / 0:00';
	timeline.append(seekLabel, seek, time);

	const volumeControl = document.createElement('div');
	volumeControl.className = 'music-collection__volume';
	const volumeId = `music-collection-volume-${work.id}-${controlId}`;
	const volumeLabel = document.createElement('label');
	volumeLabel.className = 'screen-reader-text';
	volumeLabel.htmlFor = volumeId;
	volumeLabel.textContent = `Volume for ${work.title}`;
	const volume = document.createElement('input');
	volume.id = volumeId;
	volume.dataset.musicCollectionVolume = '';
	volume.type = 'range';
	volume.min = '0';
	volume.max = '1';
	volume.step = '0.01';
	volume.value = '1';
	volumeControl.append(volumeLabel, volume);
	current.append(label, currentTitle, controls, timeline, volumeControl);
	now.append(current);
	const list = document.createElement('ol');
	list.className = 'music-collection__tracks';
	const buttons = [];
	const equalizers = [];
	for (const [index, track] of tracks.entries()) {
		const item = document.createElement('li');
		const button = document.createElement('button');
		button.type = 'button';
		button.dataset.musicCollectionTrack = '';
		button.dataset.musicCollectionTrackIndex = String(index);
		button.setAttribute('aria-current', 'false');
		const number = document.createElement('span');
		number.className = 'music-collection__track-number';
		number.textContent = String(index + 1).padStart(2, '0');
		const title = document.createElement('span');
		title.className = 'music-collection__track-title';
		title.textContent = track.title;
		const equalizer = document.createElement('span');
		equalizer.className = 'music-collection__equalizer';
		equalizer.dataset.musicCollectionEqualizer = '';
		equalizer.setAttribute('aria-hidden', 'true');
		equalizer.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
		button.append(number, title, equalizer);
		on(button, 'click', () => {
			if (destroyed || !isCollectionPlayer(player)) return;
			selectedIndex = index;
			requestPlayback(() => player.playQueue(tracks, index));
		});
		item.append(button);
		list.append(item);
		buttons.push(button);
		equalizers.push(equalizer);
	}
	module.append(heading, now, list);

	function renderCollectionSnapshot(snapshot = {}) {
		if (destroyed) return;
		lastSnapshot = snapshot;
		const activeOwnQueue = ownsQueue(snapshot);
		const activeIndex = activeOwnQueue
			&& Number.isInteger(snapshot.activeIndex)
			&& snapshot.activeIndex >= 0
			&& snapshot.activeIndex < tracks.length
			? snapshot.activeIndex
			: -1;
		if (activeIndex >= 0) selectedIndex = activeIndex;
		const selectedTrack = tracks[selectedIndex] ?? tracks[0];
		const playing = activeIndex >= 0 && snapshot.playing === true;
		const duration = activeIndex >= 0 && Number.isFinite(snapshot.duration) ? Math.max(0, snapshot.duration) : 0;
		const currentTime = activeIndex >= 0 && Number.isFinite(snapshot.currentTime)
			? Math.max(0, duration > 0 ? Math.min(snapshot.currentTime, duration) : snapshot.currentTime)
			: 0;
		const nextVolume = Number.isFinite(snapshot.volume) ? Math.min(1, Math.max(0, snapshot.volume)) : 1;
		currentTitle.textContent = selectedTrack?.title ?? '';
		buttons.forEach((button, index) => button.setAttribute('aria-current', String(index === activeIndex)));
		equalizers.forEach((equalizer, index) => {
			equalizer.classList.toggle('is-active', index === activeIndex);
			equalizer.classList.toggle('is-playing', index === activeIndex && playing);
		});
		previousButton.disabled = tracks.length < 2;
		nextButton.disabled = tracks.length < 2;
		playButton.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} current track in ${work.title}`);
		playButton.setAttribute('aria-pressed', String(playing));
		playButton.textContent = playing ? 'Ⅱ' : '▶';
		seek.disabled = activeIndex < 0;
		seek.max = String(duration);
		if (document.activeElement !== seek) seek.value = String(currentTime);
		time.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
		volume.value = String(nextVolume);

		if (activeIndex < 0 || activeIndex === lastScrolledIndex || !module.isConnected) return;
		lastScrolledIndex = activeIndex;
		const row = buttons[activeIndex]?.closest('li');
		if (!(row instanceof HTMLElement) || row.parentElement !== list || !ownsQueue(player.getState())) return;
		const rowRect = row.getBoundingClientRect();
		const listRect = list.getBoundingClientRect();
		if (rowRect.top < listRect.top) list.scrollTop -= listRect.top - rowRect.top;
		else if (rowRect.bottom > listRect.bottom) list.scrollTop += rowRect.bottom - listRect.bottom;
	}

	const startLocalSelection = (index) => {
		selectedIndex = (index + tracks.length) % tracks.length;
		renderCollectionSnapshot(lastSnapshot ?? player?.getState?.() ?? {});
		requestPlayback(() => player.playQueue(tracks, selectedIndex));
	};
	on(previousButton, 'click', () => {
		if (destroyed || !isCollectionPlayer(player)) return;
		const snapshot = player.getState();
		if (ownsQueue(snapshot)) requestPlayback(() => player.previous());
		else startLocalSelection(selectedIndex - 1);
	});
	on(playButton, 'click', () => {
		if (destroyed || !isCollectionPlayer(player)) return;
		const snapshot = player.getState();
		if (ownsQueue(snapshot)) requestPlayback(() => player.toggle());
		else startLocalSelection(selectedIndex);
	});
	on(nextButton, 'click', () => {
		if (destroyed || !isCollectionPlayer(player)) return;
		const snapshot = player.getState();
		if (ownsQueue(snapshot)) requestPlayback(() => player.next());
		else startLocalSelection(selectedIndex + 1);
	});
	on(seek, 'input', () => {
		if (destroyed || !isCollectionPlayer(player) || !ownsQueue(player.getState())) return;
		const seconds = Number.parseFloat(seek.value);
		if (Number.isFinite(seconds)) player.seekTo(seconds);
	});
	on(volume, 'input', () => {
		if (destroyed || !isCollectionPlayer(player)) return;
		const nextVolume = Number.parseFloat(volume.value);
		if (Number.isFinite(nextVolume)) player.setVolume(nextVolume);
	});

	let unsubscribe = () => {};
	if (isCollectionPlayer(player)) {
		unsubscribe = player.subscribe((snapshot) => renderCollectionSnapshot(snapshot));
		renderCollectionSnapshot(player.getState());
	} else {
		renderCollectionSnapshot();
	}
	return {
		root: module,
		mount() {
			if (isCollectionPlayer(player)) renderCollectionSnapshot(player.getState());
		},
		destroy() {
			if (destroyed) return;
			destroyed = true;
			unsubscribe();
			listeners.splice(0).forEach((remove) => remove());
		},
	};
}

function createCollectionModule(work, player) {
	const playlist = createPlaylistComponent(work, player, { announceStatus: false });
	if (playlist) return playlist;
	const fallback = document.createElement('article');
	fallback.className = 'portfolio-playlist music-collection';
	return { root: fallback, mount() {}, destroy() {} };
}

function renderMusicView(works, player, role, style, roleLabel, styleLabel, signalTop = null) {
	const musicWorks = works;
	const controllers = [];
	const root = document.createElement('div');
	root.className = 'works-view works-view--music';
	if (musicWorks.length === 0) {
		root.append(createEmptyState('music', role, style, roleLabel, styleLabel));
		return { root, mount() {}, destroy() {} };
	}
	// Portal signal design: the node network / string list replaces the cover browser;
	// the MUSIC COLLECTIONS players below stay as they are.
	let openCover = null;
	let coverBrowser;
	if (signalTop) {
		controllers.push(signalTop);
		coverBrowser = signalTop.root;
	} else {
		coverBrowser = document.createElement('section');
		coverBrowser.className = 'music-cover-browser';
		coverBrowser.setAttribute('aria-labelledby', 'music-cover-browser-title');
		const coverHeading = document.createElement('h2');
		coverHeading.id = 'music-cover-browser-title';
		coverHeading.className = 'screen-reader-text';
		coverHeading.textContent = 'Music cover browser';
		const covers = document.createElement('ul');
		covers.className = 'music-cover-browser__grid';
		const requestCoverOpen = (controller) => {
			if (openCover && openCover !== controller) openCover.setOverlayOpen(false);
			const nextOpen = !controller.isOpen();
			controller.setOverlayOpen(nextOpen);
			openCover = nextOpen ? controller : null;
		};
		for (const work of musicWorks) {
			const controller = createMusicCoverCard(work, player, requestCoverOpen);
			controllers.push(controller);
			covers.append(controller.root);
		}
		coverBrowser.append(coverHeading, covers);
	}

	const collections = document.createElement('section');
	collections.className = 'music-collections-browser';
	collections.setAttribute('aria-labelledby', 'music-collections-browser-title');
	const collectionsHeader = document.createElement('header');
	const collectionsHeading = document.createElement('h2');
	collectionsHeading.id = 'music-collections-browser-title';
	collectionsHeading.textContent = 'MUSIC COLLECTIONS';
	const grouping = document.createElement('p');
	grouping.className = 'music-collections-browser__grouping';
	const collectionGrid = document.createElement('div');
	collectionGrid.className = 'music-collections-browser__grid';
	const releases = musicWorks.filter((work) => tracksForWork(work).length > 0);
	// Session summary: releases, tracks and total running time.
	const trackCount = releases.reduce((total, work) => total + tracksForWork(work).length, 0);
	const runtime = Math.floor(releases.reduce((total, work) => total + tracksForWork(work).reduce((sum, track) => sum + (Number(track.duration) || 0), 0), 0));
	const clock = runtime >= 3600
		? `${Math.floor(runtime / 3600)}:${String(Math.floor((runtime % 3600) / 60)).padStart(2, '0')}:${String(runtime % 60).padStart(2, '0')}`
		: `${Math.floor(runtime / 60)}:${String(runtime % 60).padStart(2, '0')}`;
	grouping.textContent = [`${releases.length} RELEASES`, `${trackCount} TRACKS`, runtime > 0 ? clock : ''].filter(Boolean).join(' · ');
	collectionsHeader.append(collectionsHeading, grouping);
	// Portal signal design: CRATE / LINER / TABLE, switched from the section header.
	const styled = signalTop ? createMusicCollections(releases, player) : null;
	if (styled) {
		controllers.push(styled);
		collectionGrid.classList.add('has-collection-styles');
		collectionGrid.append(styled.root);
		collectionsHeader.insertBefore(styled.switcher, grouping);
	} else {
		for (const work of releases) {
			const controller = createCollectionModule(work, player);
			controllers.push(controller);
			collectionGrid.append(controller.root);
		}
	}
	if (releases.length === 0) {
		const empty = document.createElement('p');
		empty.className = 'music-collections-browser__empty';
		empty.setAttribute('role', 'status');
		empty.textContent = 'No published audio releases yet.';
		collectionGrid.append(empty);
	}
	collections.append(collectionsHeader, collectionGrid);
	root.append(coverBrowser, collections);
	const onDocumentPointerDown = (event) => {
		if (!openCover || openCover.root.contains(event.target)) return;
		openCover.setOverlayOpen(false);
		openCover = null;
	};
	document.addEventListener('pointerdown', onDocumentPointerDown, true);
	return {
		root,
		layout() {
			signalTop?.layout?.();
		},
		mount() {
			controllers.forEach((controller) => controller.mount?.());
		},
		destroy() {
			document.removeEventListener('pointerdown', onDocumentPointerDown, true);
			controllers.splice(0).forEach((controller) => controller.destroy());
		},
	};
}

function dimensionControlModel(controlsRoot, dimension, allLabel) {
	const labels = new Map([['all', allLabel]]);
	const order = [];
	for (const input of controlsRoot.querySelectorAll(`[data-work-${dimension}]`)) {
		if (!(input instanceof HTMLInputElement)) continue;
		const slug = input.value;
		if (!slug || slug === 'all' || labels.has(slug)) continue;
		const label = input.closest(`[data-work-${dimension}-option]`)?.textContent?.trim() || slug;
		labels.set(slug, label);
		order.push(slug);
	}
	return { labels, order };
}

function dimensionItems(work, dimension) {
	return dimension === 'role' ? workRoles(work) : dimension === 'type' ? workTypes(work) : workStyles(work);
}

function dimensionLabels(state, dimension) {
	return dimension === 'role' ? state.roleLabels : dimension === 'type' ? state.typeLabels : state.styleLabels;
}

function syncDimensionControl(state, dimension, viewWorks, value) {
	const labels = dimensionLabels(state, dimension);
	const available = new Set();
	for (const work of viewWorks) {
		for (const item of dimensionItems(work, dimension)) {
			if (!labels.has(item.slug)) continue;
			available.add(item.slug);
			if (item.label.trim()) labels.set(item.slug, item.label.trim());
		}
	}

	const selected = multiValues(value);
	for (const input of state.controlsRoot.querySelectorAll(`[data-work-${dimension}]`)) {
		if (!(input instanceof HTMLInputElement)) continue;
		const slug = input.value;
		const option = input.closest(`[data-work-${dimension}-option]`);
		if (option instanceof HTMLElement) option.hidden = slug !== 'all' && !available.has(slug);
		input.checked = slug === 'all' ? selected.length === 0 : selected.includes(slug);
	}

	const section = state.controlsRoot.querySelector(`[data-work-filter-section="${dimension}"]`);
	if (section instanceof HTMLElement) section.hidden = dimension !== 'role' && available.size === 0;
	for (const group of state.controlsRoot.querySelectorAll(`[data-work-filter-section="${dimension}"] [data-work-filter-group]`)) {
		if (!(group instanceof HTMLElement)) continue;
		group.hidden = ![...group.querySelectorAll(`[data-work-${dimension}-option]`)]
			.some((option) => option instanceof HTMLElement && !option.hidden);
	}
	return available;
}

function syncFilterSummary(state, role, style, type) {
	const host = state.controlsRoot.querySelector('.works-directory__filter-tool');
	if (!(host instanceof HTMLElement)) return;
	const reveal = host.querySelector('.works-directory__filter-reveal');
	const summary = host.querySelector('[data-work-filter-summary]');
	const collapsedSummary = host.querySelector('[data-work-filter-collapsed-summary]');
	const chips = host.querySelector('[data-work-filter-chips]');
	const active = [
		...multiValues(type).map((slug) => ({ dimension: 'type', slug, label: state.typeLabels.get(slug) ?? slug })),
		...multiValues(role).map((slug) => ({ dimension: 'role', slug, label: state.roleLabels.get(slug) ?? slug })),
		...multiValues(style).map((slug) => ({ dimension: 'style', slug, label: state.styleLabels.get(slug) ?? slug })),
	];
	const activeLabel = active.length === 0 ? 'ALL' : `${active.length} ACTIVE`;
	if (summary instanceof HTMLElement) summary.textContent = activeLabel;
	if (collapsedSummary instanceof HTMLElement) collapsedSummary.textContent = '';
	if (reveal instanceof HTMLElement) reveal.classList.toggle('has-active-value', active.length > 0);
	const trigger = host.querySelector('[data-work-filter-disclosure]');
	if (trigger instanceof HTMLButtonElement) trigger.setAttribute('aria-label', active.length === 0 ? 'Filter Works' : `Filter Works, ${active.length} active`);
	host.classList.toggle('has-active-filters', active.length > 0);
	if (!(chips instanceof HTMLElement)) return;
	chips.replaceChildren();
	for (const item of active) {
		const chip = document.createElement('button');
		chip.type = 'button';
		chip.dataset.workFilterChip = item.dimension;
		chip.dataset.workFilterValue = item.slug;
		chip.setAttribute('aria-label', `Remove ${item.label} filter`);
		chip.textContent = `${item.label} ×`;
		chips.append(chip);
	}
}

function renderView(state, view) {
	state.activeCleanup();
	const sort = normalizeSort(state.sorts[view]);
	const viewWorks = worksForView(state.works, view);
	const availableRoles = new Set(viewWorks.flatMap((work) => roleSlugs(work)).filter((slug) => state.roleLabels.has(slug)));
	const availableStyles = new Set(viewWorks.flatMap((work) => styleSlugs(work)).filter((slug) => state.styleLabels.has(slug)));
	const availableTypes = new Set(viewWorks.flatMap((work) => typeSlugs(work)).filter((slug) => state.typeLabels.has(slug)));
	let role = normalizeRole(state.roles[view], state.roleLabels);
	let style = normalizeStyle(state.styles[view], state.styleLabels);
	let type = normalizeType(state.types[view], state.typeLabels);
	role = keepAvailable(role, availableRoles);
	style = keepAvailable(style, availableStyles);
	type = keepAvailable(type, availableTypes);
	state.roles[view] = role;
	state.styles[view] = style;
	state.types[view] = type;
	const matchingWorks = viewWorks.filter((work) => matchesFilters(work, role, style, type, state.query));
	const orderedWorks = sortWorks(matchingWorks, sort);
	const roleLabel = multiLabel(role, state.roleLabels, 'ALL ROLES');
	const extra = extraFilter(style, type, multiLabel(style, state.styleLabels, 'ALL STYLES'), multiLabel(type, state.typeLabels, 'ALL TYPES'), state.query);
	const rendered = state.signal
		? renderSignalView(state, orderedWorks, view, sort, role, extra.value, roleLabel, extra.label)
		: view === 'music'
			? renderMusicView(orderedWorks, state.player, role, extra.value, roleLabel, extra.label)
			: { root: renderVisualGrid(orderedWorks, view, role, extra.value, roleLabel, extra.label), mount() {}, destroy() {} };
	state.container.replaceChildren(rendered.root);
	rendered.layout?.();
	const releaseCoverGroup = prepareWorksCoverGroup(rendered.root);
	state.activeCleanup = () => {
		releaseCoverGroup();
		rendered.destroy();
	};
	rendered.mount();
	Object.assign(state.directory.dataset, {
		activeWorkView: view,
		activeWorkCategory: view,
		activeWorkSort: sort,
		activeWorkRole: role,
		activeWorkStyle: style,
		activeWorkType: type,
		activeWorkQuery: state.query,
	});
	for (const button of state.controlsRoot.querySelectorAll('[data-work-filter]')) {
		if (button instanceof HTMLButtonElement) button.setAttribute('aria-pressed', String(button.dataset.workFilter === view));
	}
	const sortControl = state.controlsRoot.querySelector('[data-work-sort]');
	if (sortControl instanceof HTMLSelectElement) sortControl.value = sort;
	syncDimensionControl(state, 'role', viewWorks, role);
	syncDimensionControl(state, 'style', viewWorks, style);
	syncDimensionControl(state, 'type', viewWorks, type);
	syncFilterSummary(state, role, style, type);
	const sortHost = sortControl?.closest('.works-directory__sort');
	if (sortHost instanceof HTMLElement) {
		sortHost.classList.toggle('has-active-value', sort !== 'curated');
		sortHost.dataset.activeSortLabel = sortControl.selectedOptions[0]?.textContent?.trim() ?? 'CURATED';
		// The whole SORT pill is the select's hit area; this keeps the pill as wide as the chosen label.
		const sortField = sortControl.closest('.works-directory__sort-field');
		if (sortField instanceof HTMLElement) sortField.dataset.sortLabel = sortHost.dataset.activeSortLabel;
		const summary = sortHost.querySelector('[data-work-sort-summary]');
		if (summary instanceof HTMLElement) summary.textContent = '';
	}
	state.player?.setRouteIsMusic(view === 'music');
	if (state.signal) syncSignalBar(state, view, role, style, type, matchingWorks.length);
	const detail = {
		view,
		sort,
		sorts: { ...state.sorts },
		role,
		roles: { ...state.roles },
		style,
		styles: { ...state.styles },
		type,
		types: { ...state.types },
		query: state.query,
		display: state.display,
		visibleCount: matchingWorks.length,
	};
	if (state.controller) Object.assign(state.controller, detail);
	return detail;
}

/* ---------- Portal signal design (accepted WORKS prototype) ---------- */
const signalDisplays = new Set(['covers', 'list']);
const signalDisplayKey = 'portfolio:works-display';
let lastSignalDisplay = null;

function normalizeSignalDisplay(value) {
	return signalDisplays.has(value) ? value : 'covers';
}

function rememberedSignalDisplay() {
	if (lastSignalDisplay) return lastSignalDisplay;
	try {
		return normalizeSignalDisplay(window.sessionStorage.getItem(signalDisplayKey));
	} catch {
		return 'covers';
	}
}

function rememberSignalDisplay(display) {
	lastSignalDisplay = display;
	try {
		window.sessionStorage.setItem(signalDisplayKey, display);
	} catch {
		// Storage can be unavailable (private mode); the in-memory value still applies.
	}
}

const signalHelpers = { createArtwork, annotateWorkItem, categorySlugs };

function renderSignalView(state, orderedWorks, view, sort, role, style, roleLabel, styleLabel) {
	const grouped = sort === 'newest' || sort === 'oldest';
	if (orderedWorks.length === 0) {
		const root = createEmptyState(view, role, style, roleLabel, styleLabel);
		return { root, mount() {}, destroy() {} };
	}
	const signal = createSignalView({ works: orderedWorks, view, display: state.display, grouped, helpers: signalHelpers });
	if (view === 'music') return renderMusicView(orderedWorks, state.player, role, style, roleLabel, styleLabel, signal);
	// No .works-view classes here: the legacy card-grid rules must not reach the signal views.
	signal.root.dataset.workView = view;
	return signal;
}

const signalIcons = {
	covers: '<svg viewBox="0 0 14 14" aria-hidden="true" focusable="false"><rect x="1" y="1" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="8" y="1" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="1" y="8" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="8" y="8" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
	list: '<svg viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M1 3h12M1 7h12M1 11h12" stroke="currentColor" stroke-width="1.2"/></svg>',
	search: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.4 10.4 14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
	dsp: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor"/><path d="M11.5 5.5a3.5 3.5 0 0 1 0 5M13 3.5a6 6 0 0 1 0 9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
};
const enhancedSignalBars = new WeakMap();

function enhanceSignalBar(controlsRoot) {
	const controls = controlsRoot.querySelector('.works-directory__controls') ?? (controlsRoot.matches('.works-directory__controls') ? controlsRoot : null);
	if (!(controls instanceof HTMLElement)) return null;
	const existing = enhancedSignalBars.get(controls);
	if (existing) return existing;
	controls.classList.add('works-bar');
	const title = document.createElement('p');
	title.className = 'works-bar__title';
	title.setAttribute('aria-hidden', 'true');
	const word = document.createElement('span');
	word.className = 'works-bar__word';
	word.textContent = 'WORKS';
	const count = document.createElement('sup');
	count.className = 'works-bar__count';
	title.append(word, count);
	controls.prepend(title);
	for (const button of controls.querySelectorAll('[data-work-filter]')) {
		const sup = document.createElement('sup');
		sup.className = 'works-bar__n';
		sup.setAttribute('aria-hidden', 'true');
		button.append(sup);
	}
	const trigger = controls.querySelector('[data-work-filter-disclosure]');
	const badge = document.createElement('b');
	badge.className = 'works-bar__badge';
	badge.setAttribute('aria-hidden', 'true');
	badge.hidden = true;
	trigger?.append(badge);
	const tools = controls.querySelector('.works-directory__tools') ?? controls;
	const dsp = document.createElement('button');
	dsp.type = 'button';
	dsp.className = 'works-bar__dsp';
	dsp.dataset.workSignalDsp = '';
	dsp.setAttribute('aria-pressed', String(isSignalSoundOn()));
	dsp.setAttribute('aria-label', 'Sound effects (DSP)');
	dsp.innerHTML = `${signalIcons.dsp}<span class="works-bar__dsp-text"></span><span class="works-bar__dsp-level" aria-hidden="true"><i></i></span>`;
	const displayGroup = document.createElement('div');
	displayGroup.className = 'works-bar__display';
	displayGroup.setAttribute('role', 'group');
	displayGroup.setAttribute('aria-label', 'Works display');
	for (const [value, label] of [['covers', 'Covers'], ['list', 'List']]) {
		const button = document.createElement('button');
		button.type = 'button';
		button.dataset.workDisplay = value;
		button.setAttribute('aria-label', label);
		button.setAttribute('aria-pressed', 'false');
		button.title = label;
		button.innerHTML = signalIcons[value];
		displayGroup.append(button);
	}
	// SEARCH: a magnifier left of FILTER; it opens a field that grows to the left.
	const search = document.createElement('div');
	search.className = 'works-bar__search';
	search.innerHTML = `<input class="works-bar__search-input" type="search" placeholder="Search Anything" aria-label="Search works" autocomplete="off" spellcheck="false" enterkeyhint="search" tabindex="-1"><button type="button" class="works-bar__search-toggle" aria-label="Search works" aria-expanded="false">${signalIcons.search}</button>`;
	const searchInput = search.querySelector('input');
	const searchToggle = search.querySelector('button');
	const filterTool = tools.querySelector('.works-directory__filter-tool');
	tools.insertBefore(search, filterTool instanceof HTMLElement && filterTool.parentElement === tools ? filterTool : tools.firstChild);
	tools.append(displayGroup);
	// DSP sits in the empty lower-left corner of the panel (fixed there by works-signal-01.css).
	controls.append(dsp);
	const bar = { controls, count, badge, dsp, displayGroup, searchInput, meterFrame: 0 };
	const setSearchOpen = (open, focus = false) => {
		search.classList.toggle('is-open', open);
		searchToggle.setAttribute('aria-expanded', String(open));
		searchToggle.setAttribute('aria-label', open ? 'Close search' : 'Search works');
		searchInput.tabIndex = open ? 0 : -1;
		if (open) {
			// As wide as the room to the left allows, 120-300px. Desktop: it stops short of ALL / MUSIC /
			// LIVE / LAB. Tablet (too little room there): it covers those tabs, up to the WORKS title,
			// until the search is closed. Phone (tabs on their own row): it covers the WORKS title.
			const own = search.getBoundingClientRect();
			const sameRow = (rect) => rect && rect.width > 0 && rect.bottom > own.top && rect.top < own.bottom;
			const tabs = controls.querySelector('.works-directory__filters')?.getBoundingClientRect();
			const heading = controls.querySelector('.works-bar__title')?.getBoundingClientRect();
			let room = own.left - 20;
			if (sameRow(tabs)) {
				const beside = own.left - tabs.right - 16;
				room = beside >= 160 || !sameRow(heading) ? beside : own.left - heading.right - 16;
			}
			search.style.setProperty('--works-search-width', `${Math.round(Math.max(120, Math.min(300, room)))}px`);
			if (focus) window.requestAnimationFrame(() => searchInput.focus({ preventScroll: true }));
		}
	};
	let searchTimer = 0;
	const requestSearch = (value) => {
		window.clearTimeout(searchTimer);
		const directory = controlsState(controlsRoot).directory;
		const directoryState = directory instanceof HTMLElement && directory.isConnected ? directoryStates.get(directory) : null;
		if (!directoryState || normalizeQuery(value) === directoryState.query) return;
		if (typeof directoryState.onFiltersRequest === 'function') directoryState.onFiltersRequest({ directory, query: value, input: searchInput });
		else setWorksFilters(directory, { query: value });
	};
	searchToggle.addEventListener('click', () => {
		if (!search.classList.contains('is-open')) {
			setSearchOpen(true, true);
			return;
		}
		// Closing also clears: a hidden query would filter the works without showing why.
		searchInput.value = '';
		requestSearch('');
		setSearchOpen(false);
	});
	searchInput.addEventListener('input', () => {
		window.clearTimeout(searchTimer);
		searchTimer = window.setTimeout(() => requestSearch(searchInput.value), 260);
	});
	searchInput.addEventListener('keydown', (event) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			requestSearch(searchInput.value);
		} else if (event.key === 'Escape') {
			// Escape clears the text first, then closes the field; it never closes the WORKS panel.
			event.preventDefault();
			event.stopPropagation();
			if (searchInput.value) {
				searchInput.value = '';
				requestSearch('');
			} else {
				setSearchOpen(false);
				searchToggle.focus({ preventScroll: true });
			}
		}
	});
	bar.syncSearch = (query) => {
		if (document.activeElement !== searchInput && normalizeQuery(searchInput.value) !== query) searchInput.value = query;
		if (query && !search.classList.contains('is-open')) setSearchOpen(true);
		search.classList.toggle('has-query', Boolean(query));
	};
	const level = dsp.querySelector('.works-bar__dsp-level i');
	const syncDsp = (on) => {
		dsp.setAttribute('aria-pressed', String(on));
		dsp.querySelector('.works-bar__dsp-text').textContent = on ? 'DSP ON' : 'DSP OFF';
		window.cancelAnimationFrame(bar.meterFrame);
		const meter = () => {
			const value = signalSoundLevel();
			level.style.transform = `scaleY(${Math.max(0.04, value).toFixed(3)})`;
			bar.meterFrame = isSignalSoundOn() || value > 0.05 ? window.requestAnimationFrame(meter) : 0;
		};
		meter();
	};
	syncDsp(isSignalSoundOn());
	const unsubscribe = onSignalSoundChange((on) => {
		if (!dsp.isConnected) { unsubscribe(); return; }
		syncDsp(on);
	});
	enhancedSignalBars.set(controls, bar);
	return bar;
}

// The count runs through every integer on its way to the new total (24 -> 23 -> ... -> 19):
// one number per step, at most 55 ms a step, a whole run capped near 600 ms.
const signalCountReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function stepSignalCount(bar, target) {
	const node = bar.count;
	window.cancelAnimationFrame(bar.countFrame ?? 0);
	const shown = Number.isInteger(bar.shownCount) ? bar.shownCount : Number.parseInt(node.textContent ?? '', 10);
	if (signalCountReducedMotion.matches || !Number.isInteger(shown) || shown === target || !node.isConnected) {
		bar.shownCount = target;
		node.textContent = String(target).padStart(2, '0');
		return;
	}
	bar.shownCount = shown;
	const direction = Math.sign(target - shown);
	const stepMs = Math.min(55, 600 / Math.abs(target - shown));
	let last = performance.now() - stepMs;
	const step = (now) => {
		if (now - last >= stepMs) {
			last = now - last > stepMs * 2 ? now : last + stepMs;
			bar.shownCount += direction;
			node.textContent = String(bar.shownCount).padStart(2, '0');
		}
		if (bar.shownCount !== target) bar.countFrame = window.requestAnimationFrame(step);
	};
	bar.countFrame = window.requestAnimationFrame(step);
}

function syncSignalBar(state, view, role, style, type, visibleCount) {
	const bar = enhanceSignalBar(state.controlsRoot);
	if (!bar) return;
	stepSignalCount(bar, visibleCount);
	const matches = (work) => matchesFilters(work, role, style, type, state.query);
	for (const button of bar.controls.querySelectorAll('[data-work-filter]')) {
		const sup = button.querySelector('.works-bar__n');
		const count = worksForView(state.works, normalizeView(button.dataset.workFilter)).filter(matches).length;
		if (sup) sup.textContent = String(count);
		button.classList.toggle('is-empty', count === 0);
	}
	const active = multiValues(role).length + multiValues(style).length + multiValues(type).length;
	bar.badge.hidden = active === 0;
	bar.badge.textContent = String(active);
	bar.syncSearch(state.query);
	for (const button of bar.displayGroup.querySelectorAll('[data-work-display]')) {
		button.setAttribute('aria-pressed', String(button.dataset.workDisplay === state.display));
	}
	state.directory.dataset.activeWorkDisplay = state.display;
}

export function setWorksDisplay(directory, display, options = {}) {
	const state = directoryStates.get(directory);
	if (!state) return emptyDetail();
	state.display = normalizeSignalDisplay(display);
	rememberSignalDisplay(state.display);
	const detail = renderView(state, normalizeView(state.directory.dataset.activeWorkView));
	if (options.emit !== false) {
		directory.dispatchEvent(new CustomEvent('portfolio:works-display-change', { bubbles: true, detail }));
		if (typeof state.onDisplayChange === 'function') state.onDisplayChange(detail);
	}
	return detail;
}

function hydrateViewStateWithoutRendering(state, view) {
	const sort = normalizeSort(state.sorts[view]);
	const viewWorks = worksForView(state.works, view);
	const availableRoles = new Set(viewWorks.flatMap((work) => roleSlugs(work)).filter((slug) => state.roleLabels.has(slug)));
	const availableStyles = new Set(viewWorks.flatMap((work) => styleSlugs(work)).filter((slug) => state.styleLabels.has(slug)));
	const availableTypes = new Set(viewWorks.flatMap((work) => typeSlugs(work)).filter((slug) => state.typeLabels.has(slug)));
	let role = normalizeRole(state.roles[view], state.roleLabels);
	let style = normalizeStyle(state.styles[view], state.styleLabels);
	let type = normalizeType(state.types[view], state.typeLabels);
	role = keepAvailable(role, availableRoles);
	style = keepAvailable(style, availableStyles);
	type = keepAvailable(type, availableTypes);
	state.roles[view] = role;
	state.styles[view] = style;
	state.types[view] = type;
	const visibleCount = viewWorks.filter((work) => matchesFilters(work, role, style, type, state.query)).length;
	Object.assign(state.directory.dataset, {
		activeWorkView: view,
		activeWorkCategory: view,
		activeWorkSort: sort,
		activeWorkRole: role,
		activeWorkStyle: style,
		activeWorkType: type,
		activeWorkQuery: state.query,
	});
	state.player?.setRouteIsMusic(view === 'music');
	state.activeCleanup = prepareWorksCoverGroup(state.container.querySelector('.works-grid'));
	return {
		view,
		sort,
		sorts: { ...state.sorts },
		role,
		roles: { ...state.roles },
		style,
		styles: { ...state.styles },
		type,
		types: { ...state.types },
		query: state.query,
		visibleCount,
	};
}

function setFilterPanelOpen(controlsRoot, open, restoreFocus = true) {
	const trigger = controlsRoot.querySelector('[data-work-filter-disclosure]');
	const panel = controlsRoot.querySelector('[data-work-filter-panel]');
	if (!(trigger instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) return;
	trigger.setAttribute('aria-expanded', String(open));
	panel.hidden = !open;
	if (open) {
		if (window.matchMedia('(max-width: 760px)').matches) panel.setAttribute('aria-modal', 'true');
		else panel.removeAttribute('aria-modal');
		window.requestAnimationFrame(() => panel.querySelector('[data-work-filter-close]')?.focus({ preventScroll: true }));
	} else {
		panel.removeAttribute('aria-modal');
		if (restoreFocus) trigger.focus({ preventScroll: true });
	}
}

// Every chosen value of one dimension (ROLE, STYLE or TYPE), apart from ALL.
function checkedValues(controlsRoot, dimension) {
	return [...controlsRoot.querySelectorAll(`[data-work-${dimension}]`)]
		.filter((input) => input instanceof HTMLInputElement && input.checked && input.value !== 'all')
		.map((input) => input.value)
		.join(',');
}

function controlsState(controlsRoot) {
	let state = controlsStates.get(controlsRoot);
	if (state) return state;
	state = { directory: null };
	controlsStates.set(controlsRoot, state);
	// The filter panel closes from its × button or a press anywhere outside it; nothing inside it
	// (options, group titles, empty space, quick repeated clicks) closes it.
	const isPanelOpen = () => {
		const panel = controlsRoot.querySelector('[data-work-filter-panel]');
		return panel instanceof HTMLElement && !panel.hidden ? panel : null;
	};
	document.addEventListener('pointerdown', (event) => {
		const panel = isPanelOpen();
		if (!panel || !(event.target instanceof Element) || !event.target.isConnected) return;
		// While a View Transition runs, presses land on the transition overlay (the root element),
		// even when they are on the panel: those are not "outside" presses.
		if (event.target === document.documentElement || document.activeViewTransition) return;
		if (panel.contains(event.target) || event.target.closest('[data-work-filter-disclosure]')) return;
		setFilterPanelOpen(controlsRoot, false, false);
	}, true);
	// A running View Transition makes the root element the hit target, so a quick second press on the
	// controls or the filter panel would be lost. Finish that transition on press, then hand the click
	// to the control under the pointer once the real page can be hit again.
	let pendingRetarget = null;
	const isOverControls = (x, y) => [controlsRoot, isPanelOpen()].some((node) => {
		if (!(node instanceof HTMLElement)) return false;
		const rect = node.getBoundingClientRect();
		return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
	});
	document.addEventListener('pointerdown', (event) => {
		const transition = document.activeViewTransition;
		if (!transition || event.target !== document.documentElement || event.button !== 0 || !controlsRoot.isConnected) return;
		if (!isOverControls(event.clientX, event.clientY)) return;
		pendingRetarget = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, transition };
		transition.skipTransition();
	}, true);
	document.addEventListener('pointerup', (event) => {
		const pending = pendingRetarget;
		pendingRetarget = null;
		if (!pending || pending.pointerId !== event.pointerId) return;
		const resolve = () => {
			const control = document.elementFromPoint(pending.x, pending.y)?.closest('label, button, input');
			if (control instanceof HTMLElement && controlsRoot.contains(control)) control.click();
		};
		pending.transition.finished.then(resolve, resolve);
	}, true);
	controlsRoot.addEventListener('click', (event) => {
		const target = event.target instanceof Element ? event.target : null;
		const trigger = target?.closest('[data-work-filter-disclosure]');
		if (trigger instanceof HTMLButtonElement) {
			setFilterPanelOpen(controlsRoot, trigger.getAttribute('aria-expanded') !== 'true');
			return;
		}
		if (target?.closest('[data-work-filter-close]')) {
			setFilterPanelOpen(controlsRoot, false);
			return;
		}
		if (target?.closest('[data-work-signal-dsp]')) {
			setSignalSound(!isSignalSoundOn());
			return;
		}
		const directory = state.directory;
		if (!(directory instanceof HTMLElement) || !directory.isConnected) return;
		const directoryState = directoryStates.get(directory);
		if (!directoryState) return;
		const displayButton = target?.closest('[data-work-display]');
		if (displayButton instanceof HTMLButtonElement) {
			const display = normalizeSignalDisplay(displayButton.dataset.workDisplay);
			if (display === directoryState.display) return;
			if (typeof directoryState.onDisplayRequest === 'function') directoryState.onDisplayRequest({ directory, display, button: displayButton });
			else setWorksDisplay(directory, display);
			return;
		}
		const viewButton = target?.closest('[data-work-filter]');
		if (viewButton instanceof HTMLButtonElement) {
			const view = normalizeView(viewButton.dataset.workFilter);
			if (typeof directoryState.onViewRequest === 'function') directoryState.onViewRequest({ directory, view, button: viewButton });
			else setWorksView(directory, view);
			return;
		}
		const chip = target?.closest('[data-work-filter-chip]');
		if (chip instanceof HTMLButtonElement) {
			// Each chip removes only its own value; the others stay chosen.
			const view = normalizeView(directory.dataset.activeWorkView);
			const without = (value) => {
				const rest = multiValues(value).filter((slug) => slug !== chip.dataset.workFilterValue);
				return rest.length > 0 ? rest.join(',') : 'all';
			};
			if (chip.dataset.workFilterChip === 'role') {
				const role = without(directoryState.roles[view]);
				if (typeof directoryState.onRoleRequest === 'function') directoryState.onRoleRequest({ directory, role, button: chip });
				else setWorksRole(directory, role);
			} else if (chip.dataset.workFilterChip === 'type') {
				const type = without(directoryState.types[view]);
				if (typeof directoryState.onFiltersRequest === 'function') directoryState.onFiltersRequest({ directory, type, button: chip });
				else setWorksFilters(directory, { type });
			} else {
				const style = without(directoryState.styles[view]);
				if (typeof directoryState.onStyleRequest === 'function') directoryState.onStyleRequest({ directory, style, button: chip });
				else setWorksStyle(directory, style);
			}
			return;
		}
		if (target?.closest('[data-work-filter-clear-all]')) {
			if (typeof directoryState.onFiltersRequest === 'function') directoryState.onFiltersRequest({ directory, role: 'all', style: 'all', type: 'all', button: target });
			else setWorksFilters(directory, { role: 'all', style: 'all', type: 'all' });
		}
	});
	controlsRoot.addEventListener('change', (event) => {
		const target = event.target instanceof Element ? event.target : null;
		const directory = state.directory;
		if (!(directory instanceof HTMLElement) || !directory.isConnected) return;
		const directoryState = directoryStates.get(directory);
		if (!directoryState) return;
		const sortSelect = target?.closest('[data-work-sort]');
		const roleInput = target?.closest('[data-work-role]');
		const styleInput = target?.closest('[data-work-style]');
		const typeInput = target?.closest('[data-work-type]');
		if (sortSelect instanceof HTMLSelectElement) {
			const sort = normalizeSort(sortSelect.value);
			if (typeof directoryState.onSortRequest === 'function') directoryState.onSortRequest({ directory, sort, select: sortSelect });
			else setWorksSort(directory, sort);
		} else if (roleInput instanceof HTMLInputElement) {
			const role = roleInput.value === 'all' ? 'all' : normalizeRole(checkedValues(controlsRoot, 'role'), directoryState.roleLabels);
			if (typeof directoryState.onRoleRequest === 'function') directoryState.onRoleRequest({ directory, role, input: roleInput });
			else setWorksRole(directory, role);
		} else if (styleInput instanceof HTMLInputElement) {
			const style = styleInput.value === 'all' ? 'all' : normalizeStyle(checkedValues(controlsRoot, 'style'), directoryState.styleLabels);
			if (typeof directoryState.onStyleRequest === 'function') directoryState.onStyleRequest({ directory, style, input: styleInput });
			else setWorksStyle(directory, style);
		} else if (typeInput instanceof HTMLInputElement) {
			const type = typeInput.value === 'all' ? 'all' : normalizeType(checkedValues(controlsRoot, 'type'), directoryState.typeLabels);
			if (typeof directoryState.onFiltersRequest === 'function') directoryState.onFiltersRequest({ directory, type, input: typeInput });
			else setWorksFilters(directory, { type });
		}
	});
	controlsRoot.addEventListener('keydown', (event) => {
		const panel = controlsRoot.querySelector('[data-work-filter-panel]');
		if (!(panel instanceof HTMLElement) || panel.hidden) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			setFilterPanelOpen(controlsRoot, false);
			return;
		}
		if (event.key !== 'Tab') return;
		const focusable = [...panel.querySelectorAll('button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')]
			.filter((item) => item instanceof HTMLElement && !item.hidden && item.getClientRects().length > 0);
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable.at(-1);
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	});
	return state;
}

function emptyDetail() {
	return { view: 'all', sort: 'curated', role: 'all', style: 'all', type: 'all', query: '', sorts: {}, roles: {}, styles: {}, types: {}, visibleCount: 0 };
}

export function setWorksView(directory, view, options = {}) {
	const state = directoryStates.get(directory);
	if (!state) return emptyDetail();
	const detail = renderView(state, normalizeView(view));
	if (options.emit !== false) {
		directory.dispatchEvent(new CustomEvent('portfolio:works-view-change', { bubbles: true, detail }));
		if (typeof state.onViewChange === 'function') state.onViewChange(detail);
	}
	return detail;
}

export function setWorksSort(directory, sort, options = {}) {
	const state = directoryStates.get(directory);
	if (!state) return emptyDetail();
	const view = normalizeView(state.directory.dataset.activeWorkView);
	state.sorts[view] = normalizeSort(sort);
	const detail = renderView(state, view);
	if (options.emit !== false) {
		directory.dispatchEvent(new CustomEvent('portfolio:works-sort-change', { bubbles: true, detail }));
		if (typeof state.onSortChange === 'function') state.onSortChange(detail);
	}
	return detail;
}

export function setWorksFilters(directory, filters = {}, options = {}) {
	const state = directoryStates.get(directory);
	if (!state) return emptyDetail();
	const view = normalizeView(state.directory.dataset.activeWorkView);
	if (Object.hasOwn(filters, 'role')) state.roles[view] = normalizeRole(filters.role, state.roleLabels);
	if (Object.hasOwn(filters, 'style')) state.styles[view] = normalizeStyle(filters.style, state.styleLabels);
	if (Object.hasOwn(filters, 'type')) state.types[view] = normalizeType(filters.type, state.typeLabels);
	if (Object.hasOwn(filters, 'query')) state.query = normalizeQuery(filters.query);
	const detail = renderView(state, view);
	if (options.emit !== false) {
		directory.dispatchEvent(new CustomEvent('portfolio:works-filter-change', { bubbles: true, detail }));
		if (typeof state.onFiltersChange === 'function') state.onFiltersChange(detail);
	}
	return detail;
}

export function setWorksRole(directory, role, options = {}) {
	const state = directoryStates.get(directory);
	if (!state) return emptyDetail();
	const detail = setWorksFilters(directory, { role }, { emit: false });
	if (options.emit !== false) {
		directory.dispatchEvent(new CustomEvent('portfolio:works-role-change', { bubbles: true, detail }));
		if (typeof state.onRoleChange === 'function') state.onRoleChange(detail);
	}
	return detail;
}

export function setWorksStyle(directory, style, options = {}) {
	const state = directoryStates.get(directory);
	if (!state) return emptyDetail();
	const detail = setWorksFilters(directory, { style }, { emit: false });
	if (options.emit !== false) {
		directory.dispatchEvent(new CustomEvent('portfolio:works-style-change', { bubbles: true, detail }));
		if (typeof state.onStyleChange === 'function') state.onStyleChange(detail);
	}
	return detail;
}

export function initializeWorksMultiView(directory, options = {}) {
	if (!(directory instanceof HTMLElement) || !Array.isArray(options.works)) return null;
	directoryStates.get(directory)?.controller?.destroy();
	const container = directory.querySelector('.works-directory__query');
	const controlsRoot = options.controlsRoot instanceof HTMLElement ? options.controlsRoot : directory;
	if (!(container instanceof HTMLElement)) return null;
	const roleModel = dimensionControlModel(controlsRoot, 'role', 'ALL ROLES');
	const styleModel = dimensionControlModel(controlsRoot, 'style', 'ALL STYLES');
	const typeModel = dimensionControlModel(controlsRoot, 'type', 'ALL TYPES');
	const state = {
		directory,
		container,
		controlsRoot,
		works: options.works.filter((work) => work && Number.isInteger(work.id) && work.id > 0),
		player: options.player ?? null,
		sorts: Object.fromEntries([...validViews].map((view) => [view, normalizeSort(options.initialSorts?.[view])])),
		roles: Object.fromEntries([...validViews].map((view) => [view, normalizeRole(options.initialRoles?.[view], roleModel.labels)])),
		styles: Object.fromEntries([...validViews].map((view) => [view, normalizeStyle(options.initialStyles?.[view], styleModel.labels)])),
		types: Object.fromEntries([...validViews].map((view) => [view, normalizeType(options.initialTypes?.[view], typeModel.labels)])),
		roleLabels: roleModel.labels,
		roleOrder: roleModel.order,
		styleLabels: styleModel.labels,
		styleOrder: styleModel.order,
		typeLabels: typeModel.labels,
		typeOrder: typeModel.order,
		query: normalizeQuery(options.initialQuery),
		onViewRequest: typeof options.onViewRequest === 'function' ? options.onViewRequest : null,
		onViewChange: typeof options.onViewChange === 'function' ? options.onViewChange : null,
		onSortRequest: typeof options.onSortRequest === 'function' ? options.onSortRequest : null,
		onSortChange: typeof options.onSortChange === 'function' ? options.onSortChange : null,
		onRoleRequest: typeof options.onRoleRequest === 'function' ? options.onRoleRequest : null,
		onRoleChange: typeof options.onRoleChange === 'function' ? options.onRoleChange : null,
		onStyleRequest: typeof options.onStyleRequest === 'function' ? options.onStyleRequest : null,
		onStyleChange: typeof options.onStyleChange === 'function' ? options.onStyleChange : null,
		onFiltersRequest: typeof options.onFiltersRequest === 'function' ? options.onFiltersRequest : null,
		onFiltersChange: typeof options.onFiltersChange === 'function' ? options.onFiltersChange : null,
		onDisplayRequest: typeof options.onDisplayRequest === 'function' ? options.onDisplayRequest : null,
		onDisplayChange: typeof options.onDisplayChange === 'function' ? options.onDisplayChange : null,
		// Portal only: the accepted signal design (node network / string list). Direct keeps its cards.
		signal: options.signal === true,
		display: options.signal === true ? rememberedSignalDisplay() : 'covers',
		activeCleanup() {},
		controller: null,
	};
	const onDirectoryClick = (event) => {
		const button = event.target instanceof Element ? event.target.closest('[data-work-filters-clear]') : null;
		if (!(button instanceof HTMLButtonElement) || !directory.contains(button)) return;
		if (typeof state.onFiltersRequest === 'function') state.onFiltersRequest({ directory, role: 'all', style: 'all', type: 'all', query: '', button });
		else setWorksFilters(directory, { role: 'all', style: 'all', type: 'all', query: '' });
	};
	directory.addEventListener('click', onDirectoryClick);
	directoryStates.set(directory, state);
	directory.dataset.worksMultiViewReady = 'true';
	controlsState(controlsRoot).directory = directory;
	let destroyed = false;
	const controller = {
		directory,
		view: 'all',
		sort: 'curated',
		role: 'all',
		style: 'all',
		type: 'all',
		query: state.query,
		sorts: { ...state.sorts },
		roles: { ...state.roles },
		styles: { ...state.styles },
		types: { ...state.types },
		visibleCount: 0,
		setView: (view, settings) => setWorksView(directory, view, settings),
		setSort: (sort, settings) => setWorksSort(directory, sort, settings),
		setRole: (role, settings) => setWorksRole(directory, role, settings),
		setStyle: (style, settings) => setWorksStyle(directory, style, settings),
		setFilters: (filters, settings) => setWorksFilters(directory, filters, settings),
		setDisplay: (display, settings) => setWorksDisplay(directory, display, settings),
		destroy() {
			if (destroyed) return;
			destroyed = true;
			state.activeCleanup();
			state.activeCleanup = () => {};
			directory.removeEventListener('click', onDirectoryClick);
			setFilterPanelOpen(controlsRoot, false, false);
			const sharedControlsState = controlsStates.get(controlsRoot);
			if (sharedControlsState?.directory === directory) sharedControlsState.directory = null;
			directoryStates.delete(directory);
			directory.removeAttribute('data-works-multi-view-ready');
		},
	};
	state.controller = controller;
	const initialView = normalizeView(options.initialView);
	const initialDetail = options.preserveInitialMarkup === true && !state.signal
		? hydrateViewStateWithoutRendering(state, initialView)
		: renderView(state, initialView);
	Object.assign(controller, initialDetail);
	return controller;
}
