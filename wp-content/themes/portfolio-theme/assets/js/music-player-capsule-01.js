/*
 * Pop-up player 2 · capsule (docs/prototypes/work-detail-player).
 *
 * music-player-01.js owns the single <audio>, the queue and the transport; this
 * module only dresses the same element as a capsule: a progress ring on the play
 * button, a card that opens with the track's waveform (click to seek), the queue
 * and a link to the playing Work, and a spark that flies from the play button
 * you pressed into the player.
 */
import { playlistTracksForWork } from './playlist-component-01.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const capsules = new WeakMap();

/*
 * ALL MUSIC reads the WORKS payload the Portal already uses (every Work with its tracks):
 * the static site's /data/panels/work.json, else the Local REST panel endpoint.
 */
function musicLibraryUrl() {
	const shell = document.querySelector('.photo-draft-shell');
	const staticBase = shell?.dataset.portalStaticBase ?? '';
	if (staticBase !== '') return `${staticBase.endsWith('/') ? staticBase : `${staticBase}/`}panels/work.json`;
	const endpoint = shell?.dataset.portalEndpoint ?? '';
	if (endpoint !== '') return `${endpoint}work`;
	const api = document.querySelector('link[rel="https://api.w.org/"]')?.getAttribute('href') ?? '';
	return api !== '' ? `${api.endsWith('/') ? api : `${api}/`}portfolio-theme/v1/panel/work` : '';
}

let musicLibraryRequest = null;
function loadMusicLibrary() {
	if (!musicLibraryRequest) {
		const url = musicLibraryUrl();
		musicLibraryRequest = (url === ''
			? Promise.reject(new Error('No music source'))
			: fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' }).then((response) => {
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				return response.json();
			}))
			.then((payload) => (Array.isArray(payload?.works) ? payload.works : [])
				.map((work) => ({ work, tracks: playlistTracksForWork(work) }))
				.filter((group) => group.tracks.length > 0))
			.catch((error) => {
				musicLibraryRequest = null;
				throw error;
			});
	}
	return musicLibraryRequest;
}

function formatTime(value) {
	const seconds = Math.max(0, Math.floor(Number(value) || 0));
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function inkColors(root) {
	const style = getComputedStyle(root);
	return {
		played: style.getPropertyValue('--music-capsule-ember').trim() || '#ed661c',
		rest: style.getPropertyValue('--music-capsule-rest').trim() || 'rgb(240 238 232 / 28%)',
		head: 'rgb(240 238 232 / 90%)',
	};
}

/**
 * @param {HTMLElement} root   The [data-music-capsule] element.
 * @param {object}      player The music-player-01 controller for the same root.
 * @param {object}      [options]
 * @param {(track: object, event: MouseEvent) => boolean} [options.openWork]
 *        Return true when the caller opened the Work itself (Portal panels).
 */
export function attachMusicCapsule(root, player, options = {}) {
	if (!(root instanceof HTMLElement) || !player || typeof player.subscribe !== 'function') return null;
	if (capsules.has(root)) return capsules.get(root);

	const panel = root.querySelector('[data-music-capsule-panel]');
	const queueList = root.querySelector('[data-music-capsule-queue]');
	const toggle = root.querySelector('[data-music-capsule-toggle]');
	const canvas = root.querySelector('[data-music-capsule-wave]');
	const playButton = root.querySelector('[data-music-player-action="play"]');
	const workLinks = [...root.querySelectorAll('[data-music-capsule-work]')];
	if (!(panel instanceof HTMLElement) || !(queueList instanceof HTMLElement) || !(toggle instanceof HTMLButtonElement)
		|| !(canvas instanceof HTMLCanvasElement) || !(playButton instanceof HTMLButtonElement)) return null;

	let state = player.getState();
	let queueKey = '';
	let lastTrackKey = '';
	let wasActive = false;
	let lastPointer = null;
	let frame = 0;
	const context = canvas.getContext('2d');

	const isOpen = () => root.dataset.open === 'true';
	function setOpen(open, { focusToggle = false } = {}) {
		if (open === isOpen()) return;
		if (!open) setLibraryOpen(false);
		root.dataset.open = open ? 'true' : 'false';
		toggle.setAttribute('aria-expanded', String(open));
		toggle.setAttribute('aria-label', open ? 'Hide queue and controls' : 'Show queue and controls');
		if (!reduceMotion.matches) {
			root.classList.remove('is-flipping');
			void root.offsetWidth;
			root.classList.add('is-flipping');
		}
		if (focusToggle) toggle.focus({ preventScroll: true });
		scheduleDraw();
	}

	const trackKey = (track) => (track ? `${track.workId}:${track.id}:${track.src}` : '');

	/* ---------- ALL MUSIC: every track on the site, grouped by Work, with a search ---------- */
	const library = root.querySelector('[data-music-capsule-library]');
	const libraryToggle = root.querySelector('[data-music-library-toggle]');
	const libraryClose = root.querySelector('[data-music-library-close]');
	const librarySearch = root.querySelector('[data-music-library-search]');
	const libraryList = root.querySelector('[data-music-library-list]');
	const libraryCount = root.querySelector('[data-music-library-count]');
	const hasLibrary = library instanceof HTMLElement && libraryToggle instanceof HTMLButtonElement
		&& librarySearch instanceof HTMLInputElement && libraryList instanceof HTMLElement;
	let libraryGroups = null;
	const sameTrack = (a, b) => Boolean(a && b) && a.src === b.src
		&& (Number(a.workId) || 0) === (Number(b.workId) || 0);
	const isLibraryOpen = () => hasLibrary && !library.hidden;

	function setLibraryOpen(open, { focus = false } = {}) {
		if (!hasLibrary || open === isLibraryOpen()) return;
		library.hidden = !open;
		root.classList.toggle('is-library-open', open);
		libraryToggle.setAttribute('aria-expanded', String(open));
		if (open) {
			renderLibrary();
			// With a mouse the search is ready to type in; a phone keeps its keyboard down until tapped.
			const target = window.matchMedia('(pointer: fine)').matches ? librarySearch : libraryClose;
			if (focus && target instanceof HTMLElement) window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
		} else if (focus) {
			libraryToggle.focus({ preventScroll: true });
		}
	}

	function libraryMessage(text) {
		const message = document.createElement('p');
		message.className = 'music-capsule__library-message';
		message.textContent = text;
		libraryList.replaceChildren(message);
	}

	function renderLibrary() {
		if (!hasLibrary) return;
		if (!libraryGroups) {
			libraryMessage('Loading…');
			loadMusicLibrary().then((groups) => {
				libraryGroups = groups;
				buildLibrary();
			}, () => libraryMessage('Could not load the music. Please try again later.'));
			return;
		}
		buildLibrary();
	}

	function buildLibrary() {
		const total = libraryGroups.reduce((sum, group) => sum + group.tracks.length, 0);
		if (libraryCount instanceof HTMLElement) libraryCount.textContent = String(total).padStart(2, '0');
		const fragment = document.createDocumentFragment();
		for (const { work, tracks } of libraryGroups) {
			const group = document.createElement('section');
			group.className = 'music-capsule__library-group';
			const head = document.createElement('div');
			head.className = 'music-capsule__library-work';
			if (work.cover?.src) {
				const cover = document.createElement('img');
				cover.src = work.cover.src;
				if (work.cover.srcset) {
					cover.srcset = work.cover.srcset;
					cover.sizes = '40px';
				}
				cover.alt = '';
				cover.loading = 'lazy';
				cover.decoding = 'async';
				head.append(cover);
			}
			const name = document.createElement('p');
			name.textContent = work.title ?? '';
			const year = document.createElement('small');
			year.textContent = typeof work.year === 'string' ? work.year : '';
			name.append(year);
			head.append(name);
			const list = document.createElement('ol');
			tracks.forEach((track, index) => {
				const item = document.createElement('li');
				const button = document.createElement('button');
				button.type = 'button';
				button.className = 'music-capsule__queue-item music-capsule__library-track';
				button.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>';
				const title = document.createElement('span');
				title.textContent = track.title;
				const length = document.createElement('small');
				length.textContent = Number(track.duration) > 0 ? formatTime(track.duration) : '';
				button.append(title, length);
				button.dataset.search = `${track.title ?? ''} ${track.artist ?? ''} ${work.title ?? ''} ${work.year ?? ''}`.normalize('NFKC').toLowerCase();
				button.addEventListener('click', () => {
					const current = player.getState();
					// The Work's tracks become the queue, starting at this one.
					if (sameTrack(current.activeTrack, track)) void player.toggle();
					else void player.playQueue(tracks, index);
				});
				button._track = track;
				item.append(button);
				list.append(item);
			});
			group.append(head, list);
			fragment.append(group);
		}
		const empty = document.createElement('p');
		empty.className = 'music-capsule__library-message';
		empty.dataset.musicLibraryEmpty = '';
		empty.textContent = 'No music matches.';
		empty.hidden = true;
		fragment.append(empty);
		libraryList.replaceChildren(fragment);
		filterLibrary();
		markLibrary();
	}

	function filterLibrary() {
		if (!hasLibrary || !libraryGroups) return;
		const words = librarySearch.value.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
		let shown = 0;
		for (const group of libraryList.querySelectorAll('.music-capsule__library-group')) {
			let groupShown = 0;
			for (const button of group.querySelectorAll('.music-capsule__library-track')) {
				const match = words.every((word) => button.dataset.search.includes(word));
				button.parentElement.hidden = !match;
				if (match) groupShown += 1;
			}
			group.hidden = groupShown === 0;
			shown += groupShown;
		}
		const empty = libraryList.querySelector('[data-music-library-empty]');
		if (empty instanceof HTMLElement) empty.hidden = shown > 0;
	}

	function markLibrary() {
		if (!isLibraryOpen() || !libraryGroups) return;
		for (const button of libraryList.querySelectorAll('.music-capsule__library-track')) {
			const current = sameTrack(state.activeTrack, button._track);
			button.classList.toggle('is-current', current);
			button.setAttribute('aria-current', String(current));
			button.setAttribute('aria-label', `${current && state.playing ? 'Pause' : 'Play'} ${button._track.title} — ${button._track.release ?? ''}`);
		}
	}

	if (hasLibrary) {
		libraryToggle.addEventListener('click', () => setLibraryOpen(!isLibraryOpen(), { focus: true }));
		libraryClose?.addEventListener('click', () => setLibraryOpen(false, { focus: true }));
		librarySearch.addEventListener('input', filterLibrary);
	}

	function renderQueue() {
		const key = state.queue.map(trackKey).join('|');
		if (key !== queueKey) {
			queueKey = key;
			queueList.replaceChildren();
			state.queue.forEach((track, index) => {
				const item = document.createElement('li');
				const button = document.createElement('button');
				button.type = 'button';
				button.className = 'music-capsule__queue-item';
				button.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>';
				const title = document.createElement('span');
				title.textContent = track.title;
				const length = document.createElement('small');
				length.textContent = track.duration > 0 ? formatTime(track.duration) : '';
				button.append(title, length);
				button.addEventListener('click', () => {
					const current = player.getState();
					if (current.activeIndex === index) void player.toggle();
					else void player.playQueue([...current.queue], index);
				});
				item.append(button);
				queueList.append(item);
			});
		}
		[...queueList.querySelectorAll('button')].forEach((button, index) => {
			const current = index === state.activeIndex;
			button.classList.toggle('is-current', current);
			button.setAttribute('aria-current', String(current));
			button.setAttribute('aria-label', `${current && state.playing ? 'Pause' : 'Play'} ${state.queue[index]?.title ?? ''}`);
		});
	}

	function renderLinks() {
		const track = state.activeTrack;
		for (const link of workLinks) {
			if (track?.workUrl) {
				link.href = track.workUrl;
				link.removeAttribute('aria-disabled');
			} else {
				link.removeAttribute('href');
				link.setAttribute('aria-disabled', 'true');
			}
		}
	}

	// Waveform of the playing track: what has played is ember, the rest dim.
	let drawnWidth = 0;
	let bins = null;
	let binsFor = '';
	function draw() {
		frame = 0;
		if (!context || !isOpen() || root.hidden) return;
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		if (!width || !height) return;
		const ratio = Math.min(2, window.devicePixelRatio || 1);
		if (width !== drawnWidth || canvas.height !== Math.round(height * ratio)) {
			drawnWidth = width;
			canvas.width = Math.round(width * ratio);
			canvas.height = Math.round(height * ratio);
			binsFor = '';
		}
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		context.clearRect(0, 0, width, height);
		const track = state.activeTrack;
		const peaks = track?.peaks ?? [];
		const total = state.duration || track?.duration || 0;
		const progress = total > 0 ? Math.min(1, state.currentTime / total) : 0;
		const playX = progress * width;
		const colors = inkColors(root);
		const middle = height / 2;
		if (peaks.length === 0) {
			context.fillStyle = colors.rest;
			context.fillRect(0, middle - 1, width, 2);
			context.fillStyle = colors.played;
			context.fillRect(0, middle - 1, playX, 2);
		} else {
			const count = Math.max(8, Math.floor(width / 3));
			const key = `${trackKey(track)}@${count}`;
			if (key !== binsFor) {
				binsFor = key;
				bins = new Float32Array(count);
				for (let index = 0; index < count; index += 1) {
					const start = Math.floor(index * peaks.length / count);
					const end = Math.max(start + 1, Math.floor((index + 1) * peaks.length / count));
					let peak = 0;
					for (let cursor = start; cursor < end; cursor += 1) peak = Math.max(peak, peaks[cursor] ?? 0);
					bins[index] = peak / 99;
				}
			}
			for (let index = 0; index < bins.length; index += 1) {
				const x = index * 3;
				const barHeight = Math.max(1, bins[index] * (middle - 2));
				context.fillStyle = x < playX ? colors.played : colors.rest;
				context.fillRect(x, middle - barHeight, 2, barHeight * 2);
			}
		}
		if (state.currentTime > 0 || state.playing) {
			context.fillStyle = colors.head;
			context.fillRect(Math.round(playX), 0, 1, height);
		}
	}
	const scheduleDraw = () => { if (!frame) frame = window.requestAnimationFrame(draw); };

	// A spark flies from the play button that was pressed into the player.
	function fly() {
		const pointer = lastPointer;
		lastPointer = null;
		if (reduceMotion.matches || !pointer || pointer.inside || performance.now() - pointer.time > 900) return;
		const spark = document.createElement('div');
		spark.className = 'music-capsule-spark';
		document.body.append(spark);
		const start = performance.now();
		const step = (now) => {
			const k = Math.min(1, (now - start) / 720);
			const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
			const target = playButton.getBoundingClientRect();
			const x1 = target.left + target.width / 2;
			const y1 = target.top + target.height / 2;
			const x = pointer.x + (x1 - pointer.x) * e;
			const y = pointer.y + (y1 - pointer.y) * e - Math.sin(Math.PI * e) * Math.min(180, Math.abs(x1 - pointer.x) * 0.25 + 60);
			spark.style.transform = `translate(${x}px, ${y}px) scale(${1 - k * 0.45})`;
			spark.style.opacity = String(k > 0.88 ? (1 - k) / 0.12 : 1);
			if (k < 1) {
				window.requestAnimationFrame(step);
				return;
			}
			spark.remove();
			playButton.animate?.([
				{ boxShadow: '0 0 0 0 rgb(237 102 28 / 75%)' },
				{ boxShadow: '0 0 0 16px rgb(237 102 28 / 0%)' },
			], { duration: 550, easing: 'ease-out' });
		};
		window.requestAnimationFrame(step);
	}

	function render(next) {
		state = next;
		const track = state.activeTrack;
		const total = state.duration || track?.duration || 0;
		const progress = total > 0 ? Math.min(100, (state.currentTime / total) * 100) : 0;
		root.style.setProperty('--music-capsule-progress', `${progress.toFixed(2)}%`);
		root.classList.toggle('is-playing', state.playing);
		root.classList.toggle('is-single', state.queue.length < 2);
		const active = state.activated && Boolean(track);
		if (!active && isOpen()) setOpen(false);
		const key = trackKey(track);
		if (active && (!wasActive || (key !== lastTrackKey && state.playing))) fly();
		if (active && state.playing) lastTrackKey = key;
		wasActive = active;
		renderQueue();
		renderLinks();
		markLibrary();
		scheduleDraw();
	}

	toggle.addEventListener('click', () => setOpen(!isOpen()));
	for (const link of workLinks) {
		link.addEventListener('click', (event) => {
			const track = player.getState().activeTrack;
			if (!track?.workUrl) {
				event.preventDefault();
				return;
			}
			setOpen(false);
			if (typeof options.openWork === 'function' && options.openWork(track, event)) event.preventDefault();
		});
	}
	const onPointerDown = (event) => {
		const inside = root.contains(event.target);
		lastPointer = { x: event.clientX, y: event.clientY, time: performance.now(), inside };
		if (isOpen() && !inside) setOpen(false);
	};
	const onKeyDown = (event) => {
		if (event.key !== 'Escape' || !isOpen()) return;
		if (document.querySelector('.work-gallery-lightbox:not([hidden]), dialog[open]')) return;
		event.stopPropagation();
		// Escape steps back: the search text, then ALL MUSIC, then the open card.
		if (isLibraryOpen()) {
			if (document.activeElement === librarySearch && librarySearch.value !== '') {
				librarySearch.value = '';
				filterLibrary();
			} else {
				setLibraryOpen(false, { focus: root.contains(document.activeElement) });
			}
			return;
		}
		setOpen(false, { focusToggle: root.contains(document.activeElement) });
	};
	document.addEventListener('pointerdown', onPointerDown, true);
	document.addEventListener('keydown', onKeyDown, true);
	window.addEventListener('resize', scheduleDraw);
	const unsubscribe = player.subscribe(render);
	render(player.getState());

	const controller = {
		setOpen,
		destroy() {
			unsubscribe();
			document.removeEventListener('pointerdown', onPointerDown, true);
			document.removeEventListener('keydown', onKeyDown, true);
			window.removeEventListener('resize', scheduleDraw);
			capsules.delete(root);
		},
	};
	capsules.set(root, controller);
	return controller;
}
