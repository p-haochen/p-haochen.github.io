import { createPlaylistComponent, playlistTracksForWork } from './playlist-component-01.js';

const validViews = new Set(['all', 'music', 'live', 'tech']);
const validSorts = new Set(['curated', 'newest', 'oldest', 'az']);
const directoryStates = new WeakMap();
const controlsStates = new WeakMap();
const titleCollator = new Intl.Collator(['en', 'zh-Hant'], { numeric: true, sensitivity: 'base' });

function normalizeView(value) {
	return typeof value === 'string' && validViews.has(value) ? value : 'all';
}

function normalizeSort(value) {
	return typeof value === 'string' && validSorts.has(value) ? value : 'curated';
}

function normalizeRole(value, roleLabels) {
	return typeof value === 'string' && roleLabels.has(value) ? value : 'all';
}

function normalizeStyle(value, styleLabels) {
	return typeof value === 'string' && styleLabels.has(value) ? value : 'all';
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
		? `No published ${view.toUpperCase()} works yet.`
		: `No ${view === 'all' ? '' : `${view.toUpperCase()} `}works match ${activeLabels.join(' + ')}.`;
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

function createArtwork(cover, className) {
	const frame = document.createElement('div');
	frame.className = className;
	if (!cover || typeof cover.src !== 'string' || cover.src === '') return frame;
	const image = document.createElement('img');
	image.src = cover.src;
	image.alt = typeof cover.alt === 'string' && cover.alt !== '' ? cover.alt : '';
	image.loading = 'lazy';
	image.decoding = 'async';
	if (typeof cover.srcset === 'string' && cover.srcset !== '') image.srcset = cover.srcset;
	if (typeof cover.sizes === 'string' && cover.sizes !== '') image.sizes = cover.sizes;
	if (Number.isFinite(cover.width) && cover.width > 0) image.width = cover.width;
	if (Number.isFinite(cover.height) && cover.height > 0) image.height = cover.height;
	frame.append(image);
	return frame;
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
	for (const work of works) list.append(createVisualCard(work, { showYear: view !== 'all' }));
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

function renderMusicView(works, player, role, style, roleLabel, styleLabel) {
	const musicWorks = works;
	const controllers = [];
	const root = document.createElement('div');
	root.className = 'works-view works-view--music';
	if (musicWorks.length === 0) {
		root.append(createEmptyState('music', role, style, roleLabel, styleLabel));
		return { root, mount() {}, destroy() {} };
	}
	const coverBrowser = document.createElement('section');
	coverBrowser.className = 'music-cover-browser';
	coverBrowser.setAttribute('aria-labelledby', 'music-cover-browser-title');
	const coverHeading = document.createElement('h2');
	coverHeading.id = 'music-cover-browser-title';
	coverHeading.className = 'screen-reader-text';
	coverHeading.textContent = 'Music cover browser';
	const covers = document.createElement('ul');
	covers.className = 'music-cover-browser__grid';
	let openCover = null;
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

	const collections = document.createElement('section');
	collections.className = 'music-collections-browser';
	collections.setAttribute('aria-labelledby', 'music-collections-browser-title');
	const collectionsHeader = document.createElement('header');
	const collectionsHeading = document.createElement('h2');
	collectionsHeading.id = 'music-collections-browser-title';
	collectionsHeading.textContent = 'MUSIC COLLECTIONS';
	const grouping = document.createElement('p');
	grouping.className = 'music-collections-browser__grouping';
	grouping.textContent = 'BY RELEASE';
	collectionsHeader.append(collectionsHeading, grouping);
	const collectionGrid = document.createElement('div');
	collectionGrid.className = 'music-collections-browser__grid';
	const releases = musicWorks.filter((work) => tracksForWork(work).length > 0);
	for (const work of releases) {
		const controller = createCollectionModule(work, player);
		controllers.push(controller);
		collectionGrid.append(controller.root);
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
	return dimension === 'role' ? workRoles(work) : workStyles(work);
}

function syncDimensionControl(state, dimension, viewWorks, value) {
	const labels = dimension === 'role' ? state.roleLabels : state.styleLabels;
	const available = new Set();
	for (const work of viewWorks) {
		for (const item of dimensionItems(work, dimension)) {
			if (!labels.has(item.slug)) continue;
			available.add(item.slug);
			if (item.label.trim()) labels.set(item.slug, item.label.trim());
		}
	}

	let selectedApplied = false;
	for (const input of state.controlsRoot.querySelectorAll(`[data-work-${dimension}]`)) {
		if (!(input instanceof HTMLInputElement)) continue;
		const slug = input.value;
		const option = input.closest(`[data-work-${dimension}-option]`);
		if (option instanceof HTMLElement) option.hidden = slug !== 'all' && !available.has(slug);
		input.checked = slug === value && !selectedApplied;
		if (input.checked) selectedApplied = true;
	}

	const section = state.controlsRoot.querySelector(`[data-work-filter-section="${dimension}"]`);
	if (section instanceof HTMLElement) section.hidden = dimension === 'style' && available.size === 0;
	for (const group of state.controlsRoot.querySelectorAll(`[data-work-filter-section="${dimension}"] [data-work-filter-group]`)) {
		if (!(group instanceof HTMLElement)) continue;
		group.hidden = ![...group.querySelectorAll(`[data-work-${dimension}-option]`)]
			.some((option) => option instanceof HTMLElement && !option.hidden);
	}
	return available;
}

function syncFilterSummary(state, role, style) {
	const host = state.controlsRoot.querySelector('.works-directory__filter-tool');
	if (!(host instanceof HTMLElement)) return;
	const reveal = host.querySelector('.works-directory__filter-reveal');
	const summary = host.querySelector('[data-work-filter-summary]');
	const collapsedSummary = host.querySelector('[data-work-filter-collapsed-summary]');
	const chips = host.querySelector('[data-work-filter-chips]');
	const active = [
		role === 'all' ? null : { dimension: 'role', slug: role, label: state.roleLabels.get(role) ?? role },
		style === 'all' ? null : { dimension: 'style', slug: style, label: state.styleLabels.get(style) ?? style },
	].filter(Boolean);
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
	let role = normalizeRole(state.roles[view], state.roleLabels);
	let style = normalizeStyle(state.styles[view], state.styleLabels);
	if (role !== 'all' && !availableRoles.has(role)) role = 'all';
	if (style !== 'all' && !availableStyles.has(style)) style = 'all';
	state.roles[view] = role;
	state.styles[view] = style;
	const matchingWorks = viewWorks.filter((work) => (role === 'all' || roleSlugs(work).includes(role))
		&& (style === 'all' || styleSlugs(work).includes(style)));
	const orderedWorks = sortWorks(matchingWorks, sort);
	const roleLabel = state.roleLabels.get(role) ?? 'ALL ROLES';
	const styleLabel = state.styleLabels.get(style) ?? 'ALL STYLES';
	const rendered = view === 'music'
		? renderMusicView(orderedWorks, state.player, role, style, roleLabel, styleLabel)
		: { root: renderVisualGrid(orderedWorks, view, role, style, roleLabel, styleLabel), mount() {}, destroy() {} };
	state.activeCleanup = rendered.destroy;
	state.container.replaceChildren(rendered.root);
	rendered.mount();
	Object.assign(state.directory.dataset, {
		activeWorkView: view,
		activeWorkCategory: view,
		activeWorkSort: sort,
		activeWorkRole: role,
		activeWorkStyle: style,
	});
	for (const button of state.controlsRoot.querySelectorAll('[data-work-filter]')) {
		if (button instanceof HTMLButtonElement) button.setAttribute('aria-pressed', String(button.dataset.workFilter === view));
	}
	const sortControl = state.controlsRoot.querySelector('[data-work-sort]');
	if (sortControl instanceof HTMLSelectElement) sortControl.value = sort;
	syncDimensionControl(state, 'role', viewWorks, role);
	syncDimensionControl(state, 'style', viewWorks, style);
	syncFilterSummary(state, role, style);
	const sortHost = sortControl?.closest('.works-directory__sort');
	if (sortHost instanceof HTMLElement) {
		sortHost.classList.toggle('has-active-value', sort !== 'curated');
		sortHost.dataset.activeSortLabel = sortControl.selectedOptions[0]?.textContent?.trim() ?? 'CURATED';
		const summary = sortHost.querySelector('[data-work-sort-summary]');
		if (summary instanceof HTMLElement) summary.textContent = '';
	}
	state.player?.setRouteIsMusic(view === 'music');
	const detail = {
		view,
		sort,
		sorts: { ...state.sorts },
		role,
		roles: { ...state.roles },
		style,
		styles: { ...state.styles },
		visibleCount: matchingWorks.length,
	};
	if (state.controller) Object.assign(state.controller, detail);
	return detail;
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

function controlsState(controlsRoot) {
	let state = controlsStates.get(controlsRoot);
	if (state) return state;
	state = { directory: null };
	controlsStates.set(controlsRoot, state);
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
		const directory = state.directory;
		if (!(directory instanceof HTMLElement) || !directory.isConnected) return;
		const directoryState = directoryStates.get(directory);
		if (!directoryState) return;
		const viewButton = target?.closest('[data-work-filter]');
		if (viewButton instanceof HTMLButtonElement) {
			const view = normalizeView(viewButton.dataset.workFilter);
			if (typeof directoryState.onViewRequest === 'function') directoryState.onViewRequest({ directory, view, button: viewButton });
			else setWorksView(directory, view);
			return;
		}
		const chip = target?.closest('[data-work-filter-chip]');
		if (chip instanceof HTMLButtonElement) {
			if (chip.dataset.workFilterChip === 'role') {
				if (typeof directoryState.onRoleRequest === 'function') directoryState.onRoleRequest({ directory, role: 'all', button: chip });
				else setWorksRole(directory, 'all');
			} else {
				if (typeof directoryState.onStyleRequest === 'function') directoryState.onStyleRequest({ directory, style: 'all', button: chip });
				else setWorksStyle(directory, 'all');
			}
			return;
		}
		if (target?.closest('[data-work-filter-clear-all]')) {
			if (typeof directoryState.onFiltersRequest === 'function') directoryState.onFiltersRequest({ directory, role: 'all', style: 'all', button: target });
			else setWorksFilters(directory, { role: 'all', style: 'all' });
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
		if (sortSelect instanceof HTMLSelectElement) {
			const sort = normalizeSort(sortSelect.value);
			if (typeof directoryState.onSortRequest === 'function') directoryState.onSortRequest({ directory, sort, select: sortSelect });
			else setWorksSort(directory, sort);
		} else if (roleInput instanceof HTMLInputElement) {
			const role = normalizeRole(roleInput.value, directoryState.roleLabels);
			if (typeof directoryState.onRoleRequest === 'function') directoryState.onRoleRequest({ directory, role, input: roleInput });
			else setWorksRole(directory, role);
		} else if (styleInput instanceof HTMLInputElement) {
			const style = normalizeStyle(styleInput.value, directoryState.styleLabels);
			if (typeof directoryState.onStyleRequest === 'function') directoryState.onStyleRequest({ directory, style, input: styleInput });
			else setWorksStyle(directory, style);
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
	return { view: 'all', sort: 'curated', role: 'all', style: 'all', sorts: {}, roles: {}, styles: {}, visibleCount: 0 };
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
	const state = {
		directory,
		container,
		controlsRoot,
		works: options.works.filter((work) => work && Number.isInteger(work.id) && work.id > 0),
		player: options.player ?? null,
		sorts: Object.fromEntries([...validViews].map((view) => [view, normalizeSort(options.initialSorts?.[view])])),
		roles: Object.fromEntries([...validViews].map((view) => [view, normalizeRole(options.initialRoles?.[view], roleModel.labels)])),
		styles: Object.fromEntries([...validViews].map((view) => [view, normalizeStyle(options.initialStyles?.[view], styleModel.labels)])),
		roleLabels: roleModel.labels,
		roleOrder: roleModel.order,
		styleLabels: styleModel.labels,
		styleOrder: styleModel.order,
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
		activeCleanup() {},
		controller: null,
	};
	const onDirectoryClick = (event) => {
		const button = event.target instanceof Element ? event.target.closest('[data-work-filters-clear]') : null;
		if (!(button instanceof HTMLButtonElement) || !directory.contains(button)) return;
		if (typeof state.onFiltersRequest === 'function') state.onFiltersRequest({ directory, role: 'all', style: 'all', button });
		else setWorksFilters(directory, { role: 'all', style: 'all' });
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
		sorts: { ...state.sorts },
		roles: { ...state.roles },
		styles: { ...state.styles },
		visibleCount: 0,
		setView: (view, settings) => setWorksView(directory, view, settings),
		setSort: (sort, settings) => setWorksSort(directory, sort, settings),
		setRole: (role, settings) => setWorksRole(directory, role, settings),
		setStyle: (style, settings) => setWorksStyle(directory, style, settings),
		setFilters: (filters, settings) => setWorksFilters(directory, filters, settings),
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
	Object.assign(controller, renderView(state, normalizeView(options.initialView)));
	return controller;
}
