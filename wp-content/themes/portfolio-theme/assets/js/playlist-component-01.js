function sameTrack(track, candidate) {
	if (!track || !candidate || typeof candidate !== 'object' || track.src !== candidate.src) return false;
	const trackWorkId = Number.parseInt(String(track.workId ?? 0), 10) || 0;
	const candidateWorkId = Number.parseInt(String(candidate.workId ?? 0), 10) || 0;
	if (trackWorkId > 0 && candidateWorkId > 0 && trackWorkId !== candidateWorkId) return false;
	const trackId = Number.parseInt(String(track.id ?? track.attachment_id ?? 0), 10) || 0;
	const candidateId = Number.parseInt(String(candidate.id ?? candidate.attachment_id ?? 0), 10) || 0;
	if (trackId > 0 && candidateId > 0) return trackId === candidateId;
	return track.title === candidate.title;
}

function queuesMatch(queue, tracks) {
	return Array.isArray(queue)
		&& queue.length === tracks.length
		&& queue.every((track, index) => sameTrack(tracks[index], track));
}

export function playlistTracksForWork(work) {
	if (!Array.isArray(work?.tracks)) return [];
	return work.tracks
		.filter((track) => track && typeof track.src === 'string' && track.src !== '')
		.map((track) => ({
			...track,
			workId: Number.parseInt(String(track.workId ?? work.id ?? 0), 10) || 0,
			artwork: typeof track.artwork === 'string' && track.artwork !== ''
				? track.artwork
				: typeof work.cover?.src === 'string' ? work.cover.src : '',
			artworkAlt: typeof track.artworkAlt === 'string' && track.artworkAlt !== ''
				? track.artworkAlt
				: typeof work.cover?.alt === 'string' ? work.cover.alt : '',
			release: typeof track.release === 'string' && track.release !== '' ? track.release : work.title,
		}));
}

export function isPlaylistPlayer(player) {
	return Boolean(
		player
		&& typeof player.subscribe === 'function'
		&& typeof player.playQueue === 'function'
		&& typeof player.previous === 'function'
		&& typeof player.next === 'function'
		&& typeof player.toggle === 'function'
		&& typeof player.seekTo === 'function'
		&& typeof player.setVolume === 'function'
		&& typeof player.getState === 'function',
	);
}

function createArtwork(cover) {
	const frame = document.createElement('div');
	frame.className = 'music-collection__artwork track-list__artwork';
	if (!cover || typeof cover.src !== 'string' || cover.src === '') return frame;
	const image = document.createElement('img');
	image.src = cover.src;
	image.alt = typeof cover.alt === 'string' ? cover.alt : '';
	image.loading = 'lazy';
	image.decoding = 'async';
	if (typeof cover.srcset === 'string' && cover.srcset !== '') image.srcset = cover.srcset;
	if (typeof cover.sizes === 'string' && cover.sizes !== '') image.sizes = cover.sizes;
	if (Number.isFinite(cover.width) && cover.width > 0) image.width = cover.width;
	if (Number.isFinite(cover.height) && cover.height > 0) image.height = cover.height;
	frame.append(image);
	return frame;
}

function formatLength(seconds) {
	const value = Math.max(0, Math.floor(Number(seconds) || 0));
	return value > 0 ? `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}` : '';
}

function createStateIcon() {
	const icon = document.createElement('span');
	icon.className = 'track-list__state';
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 16 16');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('focusable', 'false');
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('d', 'M4 2.5v11l9-5.5z');
	path.setAttribute('fill', 'currentColor');
	svg.append(path);
	const meter = document.createElement('b');
	meter.setAttribute('aria-hidden', 'true');
	meter.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
	icon.append(svg, meter);
	return icon;
}

// A track's own small waveform: a dim copy, and an ember copy clipped to the progress.
function createMiniWave(peaks) {
	const box = document.createElement('span');
	box.className = 'track-list__wave';
	box.setAttribute('aria-hidden', 'true');
	if (!Array.isArray(peaks) || peaks.length === 0) {
		box.classList.add('is-empty');
		return { box, draw() {} };
	}
	const rest = document.createElement('canvas');
	const played = document.createElement('canvas');
	played.className = 'track-list__wave-played';
	box.append(rest, played);
	return {
		box,
		draw() {
			const width = box.clientWidth;
			const height = box.clientHeight;
			if (!width || !height) return;
			const ratio = Math.min(2, window.devicePixelRatio || 1);
			const style = getComputedStyle(box);
			const colors = [
				style.getPropertyValue('--track-wave-rest').trim() || 'rgb(240 238 232 / 45%)',
				style.getPropertyValue('--track-wave-played').trim() || '#ed661c',
			];
			[rest, played].forEach((canvas, layer) => {
				canvas.width = Math.round(width * ratio);
				canvas.height = Math.round(height * ratio);
				const context = canvas.getContext('2d');
				if (!context) return;
				context.setTransform(ratio, 0, 0, ratio, 0, 0);
				context.fillStyle = colors[layer];
				const count = Math.floor(width / 3);
				for (let index = 0; index < count; index += 1) {
					const peak = (peaks[Math.floor(index / count * peaks.length)] ?? 0) / 99;
					const bar = Math.max(1, peak * (height / 2 - 1));
					context.fillRect(index * 3, height / 2 - bar, 2, bar * 2);
				}
			});
		},
	};
}

/**
 * A Work's tracks as a list. Pressing a track plays it in the shared pop-up
 * player (capsule); the list only shows which track plays and how far it is.
 *
 * @param {object}  work
 * @param {object}  player  music-player-01 controller (or a compatible one).
 * @param {object}  [options]
 * @param {boolean} [options.showHeader=true]      Show the Work's cover and title (MUSIC collections).
 * @param {boolean} [options.announceStatus=false] Announce play / pause in a live region.
 */
export function createPlaylistComponent(work, player, options = {}) {
	if (!work || typeof work.title !== 'string' || !isPlaylistPlayer(player)) return null;
	const tracks = playlistTracksForWork(work);
	if (tracks.length === 0) return null;
	const announceStatus = options.announceStatus === true;
	const showHeader = options.showHeader !== false;

	const module = document.createElement('article');
	module.className = showHeader ? 'portfolio-playlist track-list track-list--collection' : 'portfolio-playlist track-list';
	module.dataset.workId = String(work.id ?? tracks[0]?.workId ?? '');
	if (showHeader) {
		const header = document.createElement('div');
		header.className = 'track-list__header';
		const heading = document.createElement('h3');
		heading.className = 'track-list__heading';
		heading.textContent = work.title;
		header.append(createArtwork(work.cover), heading);
		module.append(header);
	}

	const list = document.createElement('ol');
	list.className = 'track-list__rows';
	list.setAttribute('aria-label', `${work.title} track list`);
	const buttons = [];
	const waves = [];
	const listeners = [];
	const on = (target, type, listener) => {
		target.addEventListener(type, listener);
		listeners.push(() => target.removeEventListener(type, listener));
	};
	for (const [index, track] of tracks.entries()) {
		const item = document.createElement('li');
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'track-list__row';
		button.dataset.trackListIndex = String(index);
		button.setAttribute('aria-pressed', 'false');
		const title = document.createElement('span');
		title.className = 'track-list__title';
		title.textContent = track.title;
		const wave = createMiniWave(track.peaks);
		const length = document.createElement('span');
		length.className = 'track-list__length';
		length.textContent = formatLength(track.duration);
		button.append(createStateIcon(), title, wave.box, length);
		item.append(button);
		list.append(item);
		buttons.push(button);
		waves.push(wave);
	}
	const liveRegion = document.createElement('p');
	liveRegion.className = 'track-list__status screen-reader-text';
	if (announceStatus) {
		liveRegion.setAttribute('role', 'status');
		liveRegion.setAttribute('aria-live', 'polite');
		liveRegion.setAttribute('aria-atomic', 'true');
	}
	module.append(list, liveRegion);

	let destroyed = false;
	let wasPlaying = false;
	const ownsQueue = (snapshot) => queuesMatch(snapshot?.queue, tracks);
	const requestPlayback = (operation) => {
		try { void Promise.resolve(operation()).catch(() => {}); } catch { /* Player owns error status. */ }
	};

	function render(snapshot = {}) {
		if (destroyed) return;
		const owned = ownsQueue(snapshot);
		const activeIndex = owned && Number.isInteger(snapshot.activeIndex)
			&& snapshot.activeIndex >= 0 && snapshot.activeIndex < tracks.length ? snapshot.activeIndex : -1;
		const playing = activeIndex >= 0 && snapshot.playing === true;
		const total = activeIndex >= 0 ? (Number(snapshot.duration) || Number(tracks[activeIndex].duration) || 0) : 0;
		const progress = total > 0 ? Math.min(100, (Number(snapshot.currentTime) || 0) / total * 100) : 0;
		buttons.forEach((button, index) => {
			const current = index === activeIndex;
			button.classList.toggle('is-current', current);
			button.classList.toggle('is-playing', current && playing);
			button.setAttribute('aria-pressed', String(current && playing));
			button.setAttribute('aria-label', `${current && playing ? 'Pause' : 'Play'} track ${index + 1}: ${tracks[index].title}`);
			if (current) button.style.setProperty('--track-progress', `${progress.toFixed(2)}%`);
			else button.style.removeProperty('--track-progress');
		});
		module.classList.toggle('is-active', activeIndex >= 0);
		const selected = tracks[Math.max(0, activeIndex)];
		if (announceStatus && playing && !wasPlaying) liveRegion.textContent = `Now playing: ${selected.title}`;
		else if (announceStatus && !playing && wasPlaying) liveRegion.textContent = `Paused: ${selected.title}`;
		wasPlaying = playing;
	}

	buttons.forEach((button, index) => on(button, 'click', () => {
		const snapshot = player.getState();
		if (ownsQueue(snapshot) && snapshot.activeIndex === index) requestPlayback(() => player.toggle());
		else requestPlayback(() => player.playQueue(tracks, index));
	}));

	const drawWaves = () => waves.forEach((wave) => wave.draw());
	const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(drawWaves) : null;
	resizeObserver?.observe(list);
	const unsubscribe = player.subscribe(render);
	render(player.getState());
	return {
		root: module,
		tracks,
		ownsQueue,
		/** Play this Work from its first track, or pause / resume it when it is already the queue. */
		toggleWork() {
			const snapshot = player.getState();
			if (ownsQueue(snapshot)) requestPlayback(() => player.toggle());
			else requestPlayback(() => player.playQueue(tracks, 0));
		},
		mount() {
			render(player.getState());
			window.requestAnimationFrame(drawWaves);
		},
		destroy() {
			if (destroyed) return;
			destroyed = true;
			resizeObserver?.disconnect();
			if (typeof unsubscribe === 'function') unsubscribe();
			listeners.splice(0).forEach((remove) => remove());
		},
	};
}
