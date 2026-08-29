import { createPlaylistComponent, playlistTracksForWork } from './playlist-component-01.js';

const validViews = new Set(['all', 'music', 'live', 'tech']);
const directoryStates = new WeakMap();
const controlsStates = new WeakMap();

function normalizeView(value) {
	return typeof value === 'string' && validViews.has(value) ? value : 'all';
}

function categorySlugs(work) {
	return Array.isArray(work?.categories)
		? work.categories.map((category) => category?.slug).filter((slug) => typeof slug === 'string')
		: [];
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
	item.dataset.workTitle = work.title;
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

function renderVisualGrid(works, view) {
	const list = document.createElement('ul');
	list.className = `works-grid works-view works-view--${view}`;
	const selected = view === 'all' ? works : works.filter((work) => categorySlugs(work).includes(view));
	for (const work of selected) list.append(createVisualCard(work, { showYear: view !== 'all' }));
	if (selected.length === 0) {
		const empty = document.createElement('p');
		empty.className = 'works-view__empty';
		empty.setAttribute('role', 'status');
		empty.textContent = `No published ${view.toUpperCase()} works yet.`;
		return empty;
	}
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
	item.dataset.workTitle = work.title;
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

function renderMusicView(works, player) {
	const musicWorks = works.filter((work) => categorySlugs(work).includes('music'));
	const controllers = [];
	const root = document.createElement('div');
	root.className = 'works-view works-view--music';
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

function renderView(state, view) {
	state.activeCleanup();
	const rendered = view === 'music'
		? renderMusicView(state.works, state.player)
		: { root: renderVisualGrid(state.works, view), mount() {}, destroy() {} };
	state.activeCleanup = rendered.destroy;
	state.container.replaceChildren(rendered.root);
	rendered.mount();
	state.directory.dataset.activeWorkView = view;
	state.directory.dataset.activeWorkCategory = view;
	for (const button of state.controlsRoot.querySelectorAll('[data-work-filter]')) {
		if (button instanceof HTMLButtonElement) button.setAttribute('aria-pressed', String(button.dataset.workFilter === view));
	}
	state.player?.setRouteIsMusic(view === 'music');
	const detail = { view, visibleCount: state.container.querySelectorAll('.wp-block-post').length };
	if (state.controller) Object.assign(state.controller, detail);
	return detail;
}

function controlsState(controlsRoot) {
	let state = controlsStates.get(controlsRoot);
	if (state) return state;
	state = { directory: null };
	controlsStates.set(controlsRoot, state);
	controlsRoot.addEventListener('click', (event) => {
		const button = event.target instanceof Element ? event.target.closest('[data-work-filter]') : null;
		const directory = state.directory;
		if (!(button instanceof HTMLButtonElement) || !(directory instanceof HTMLElement) || !directory.isConnected) return;
		const directoryState = directoryStates.get(directory);
		if (!directoryState) return;
		const view = normalizeView(button.dataset.workFilter);
		if (typeof directoryState.onViewRequest === 'function') directoryState.onViewRequest({ directory, view, button });
		else setWorksView(directory, view);
	});
	return state;
}

export function setWorksView(directory, view, options = {}) {
	const state = directoryStates.get(directory);
	if (!state) return { view: 'all', visibleCount: 0 };
	const normalized = normalizeView(view);
	const detail = renderView(state, normalized);
	if (options.emit !== false) {
		directory.dispatchEvent(new CustomEvent('portfolio:works-view-change', { bubbles: true, detail }));
		if (typeof state.onViewChange === 'function') state.onViewChange(detail);
	}
	return detail;
}

export function initializeWorksMultiView(directory, options = {}) {
	if (!(directory instanceof HTMLElement) || !Array.isArray(options.works)) return null;
	directoryStates.get(directory)?.controller?.destroy();
	const container = directory.querySelector('.works-directory__query');
	const controlsRoot = options.controlsRoot instanceof HTMLElement ? options.controlsRoot : directory;
	if (!(container instanceof HTMLElement)) return null;
	const state = {
		directory,
		container,
		controlsRoot,
		works: options.works.filter((work) => work && Number.isInteger(work.id) && work.id > 0),
		player: options.player ?? null,
		onViewRequest: typeof options.onViewRequest === 'function' ? options.onViewRequest : null,
		onViewChange: typeof options.onViewChange === 'function' ? options.onViewChange : null,
		activeCleanup() {},
		controller: null,
	};
	directoryStates.set(directory, state);
	directory.dataset.worksMultiViewReady = 'true';
	controlsState(controlsRoot).directory = directory;
	let destroyed = false;
	const controller = {
		directory,
		view: 'all',
		visibleCount: 0,
		setView: (view, settings) => setWorksView(directory, view, settings),
		destroy() {
			if (destroyed) return;
			destroyed = true;
			state.activeCleanup();
			state.activeCleanup = () => {};
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
