function formatTime(value) {
	if (!Number.isFinite(value) || value < 0) return '0:00';
	const hours = Math.floor(value / 3600);
	const minutes = Math.floor(value / 60);
	const seconds = Math.floor(value % 60).toString().padStart(2, '0');
	return hours > 0 ? `${hours}:${String(minutes % 60).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

const providerHosts = Object.freeze({
	spotify: new Set(['open.spotify.com']),
	youtube: new Set(['youtu.be', 'youtube.com', 'www.youtube.com', 'm.youtube.com']),
});

const providerIconPaths = Object.freeze({
	spotify: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z',
	youtube: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
});

function isAllowedProviderUrl(provider, href) {
	if (typeof href !== 'string' || href === '' || !providerHosts[provider]) return false;
	try {
		const url = new URL(href);
		return url.protocol === 'https:' && providerHosts[provider].has(url.hostname.toLowerCase());
	} catch {
		return false;
	}
}

function normalizeProviderLinks(value) {
	if (!value || typeof value !== 'object') return {};
	const links = {};
	for (const provider of Object.keys(providerHosts)) {
		const href = value[provider];
		if (!isAllowedProviderUrl(provider, href)) continue;
		links[provider] = new URL(href).href;
	}
	return links;
}

function normalizeTrack(track) {
	if (!track || typeof track !== 'object' || typeof track.src !== 'string' || track.src === '') return null;
	return {
		id: Number.parseInt(String(track.id ?? track.attachment_id ?? 0), 10) || 0,
		workId: Number.parseInt(String(track.workId ?? 0), 10) || 0,
		title: typeof track.title === 'string' && track.title.trim() !== '' ? track.title.trim() : 'Untitled track',
		artist: typeof track.artist === 'string' ? track.artist.trim() : '',
		release: typeof track.release === 'string' ? track.release.trim() : '',
		src: track.src,
		artwork: typeof track.artwork === 'string' ? track.artwork : '',
		artworkAlt: typeof track.artworkAlt === 'string' ? track.artworkAlt : '',
		providerLinks: normalizeProviderLinks(track.providerLinks),
	};
}

function freezeTrack(track) {
	return Object.freeze({ ...track, providerLinks: Object.freeze({ ...track.providerLinks }) });
}

function queueKeyForTracks(tracks) {
	if (!Array.isArray(tracks) || tracks.length === 0) return '';
	const workIds = [...new Set(tracks.map((track) => Number.parseInt(String(track?.workId ?? 0), 10) || 0))];
	if (workIds.length === 1 && workIds[0] > 0) return `work:${workIds[0]}`;
	return `queue:${tracks.map((track) => `${track?.id ?? 0}:${track?.src ?? ''}`).join('|')}`;
}

export function createMusicPlayer(root) {
	if (!(root instanceof HTMLElement)) return null;
	const audio = root.querySelector('[data-music-player-audio]');
	const artwork = root.querySelector('.music-player__artwork');
	const title = root.querySelector('.music-player__title');
	const release = root.querySelector('.music-player__release');
	const liveRegion = root.parentElement?.querySelector('[data-music-player-live]') ?? root.querySelector('.music-player__live');
	const previousButton = root.querySelector('[data-music-player-action="previous"]');
	const playButton = root.querySelector('[data-music-player-action="play"]');
	const nextButton = root.querySelector('[data-music-player-action="next"]');
	const closeButton = root.querySelector('[data-music-player-action="close"]');
	const seek = root.querySelector('[data-music-player-seek]');
	const muteButton = root.querySelector('[data-music-player-action="mute"]');
	const volume = root.querySelector('[data-music-player-volume]');
	const volumeOn = muteButton?.querySelector('[data-volume-state="on"]');
	const volumeMuted = muteButton?.querySelector('[data-volume-state="muted"]');
	const currentTime = root.querySelector('.music-player__current-time');
	const duration = root.querySelector('.music-player__duration');
	const providers = root.querySelector('[data-music-player-providers]');
	if (
		!(audio instanceof HTMLAudioElement)
		|| !(artwork instanceof HTMLImageElement)
		|| !(title instanceof HTMLElement)
		|| !(release instanceof HTMLElement)
		|| !(liveRegion instanceof HTMLElement)
		|| !(previousButton instanceof HTMLButtonElement)
		|| !(playButton instanceof HTMLButtonElement)
		|| !(nextButton instanceof HTMLButtonElement)
		|| !(closeButton instanceof HTMLButtonElement)
		|| !(seek instanceof HTMLInputElement)
		|| !(muteButton instanceof HTMLButtonElement)
		|| !(volume instanceof HTMLInputElement)
		|| !(volumeOn instanceof SVGElement)
		|| !(volumeMuted instanceof SVGElement)
		|| !(currentTime instanceof HTMLElement)
		|| !(duration instanceof HTMLElement)
		|| !(providers instanceof HTMLElement)
	) return null;

	liveRegion.setAttribute('aria-live', 'polite');
	liveRegion.setAttribute('aria-atomic', 'true');
	let queue = [];
	let activeIndex = -1;
	let activated = false;
	let routeIsMusic = false;
	let inlineActive = false;
	let visibilityToken = 0;
	let playbackGeneration = 0;
	let pendingPlaybackGeneration = 0;
	let acceptedPlaybackGeneration = 0;
	let desiredPlayback = false;
	let pendingInternalPauseEvents = 0;
	let lastNotificationSignature = null;
	const subscribers = new Set();
	const volumeByQueue = new Map();
	const lastNonZeroVolumeByQueue = new Map();
	let activeQueueKey = '';

	function prefersReducedMotion() {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	function showPlayer() {
		const token = ++visibilityToken;
		root.hidden = false;
		if (prefersReducedMotion()) {
			root.classList.add('is-visible');
			return;
		}
		window.requestAnimationFrame(() => {
			if (token === visibilityToken && activated && currentTrack()) root.classList.add('is-visible');
		});
	}

	function hidePlayer() {
		const token = ++visibilityToken;
		root.classList.remove('is-visible');
		if (prefersReducedMotion()) {
			root.hidden = true;
			return;
		}
		window.setTimeout(() => {
			if (token === visibilityToken && !root.classList.contains('is-visible')) root.hidden = true;
		}, 210);
	}

	function snapshot() {
		const track = currentTrack();
		return Object.freeze({
			queue: Object.freeze(queue.map(freezeTrack)),
			activeIndex,
			activeTrack: track ? freezeTrack(track) : null,
			activated,
			routeIsMusic,
			inlineActive,
			playing: isPlaybackAccepted(),
			currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
			duration: Number.isFinite(audio.duration) ? audio.duration : 0,
			volume: audio.volume,
			muted: audio.muted || audio.volume === 0,
		});
	}

	function notify() {
		const state = snapshot();
		const signature = JSON.stringify(state);
		if (signature === lastNotificationSignature) return;
		lastNotificationSignature = signature;
		for (const listener of subscribers) {
			try {
				listener(snapshot());
			} catch {
				// One control surface must not prevent other subscribers from updating.
			}
		}
	}

	function syncFixedPlayerVisibility() {
		const shouldShowFixedPlayer = activated && currentTrack();
		if (shouldShowFixedPlayer) showPlayer();
		else hidePlayer();
	}

	function currentTrack() {
		return activeIndex >= 0 && activeIndex < queue.length ? queue[activeIndex] : null;
	}

	function syncPlayState() {
		const playing = isPlaybackAccepted();
		playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play');
		playButton.setAttribute('aria-pressed', String(playing));
		playButton.textContent = playing ? 'Ⅱ' : '▶';
		root.classList.toggle('is-playing', playing);
	}

	function syncTime() {
		const total = Number.isFinite(audio.duration) ? audio.duration : 0;
		seek.max = String(total);
		seek.value = String(Math.min(audio.currentTime || 0, total || 0));
		currentTime.textContent = formatTime(audio.currentTime);
		duration.textContent = formatTime(total);
	}

	function syncVolume() {
		volume.value = String(audio.volume);
		const muted = audio.volume === 0;
		muteButton.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
		muteButton.setAttribute('aria-pressed', String(muted));
		volumeOn.hidden = muted;
		volumeMuted.hidden = !muted;
	}

	function createProviderSvg(provider) {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('aria-hidden', 'true');
		svg.setAttribute('focusable', 'false');
		path.setAttribute('fill', 'currentColor');
		path.setAttribute('d', providerIconPaths[provider]);
		svg.append(path);
		return svg;
	}

	function renderProviderLinks(track) {
		providers.replaceChildren();
		for (const provider of ['spotify', 'youtube']) {
			const href = track?.providerLinks?.[provider];
			if (!isAllowedProviderUrl(provider, href)) continue;
			const link = document.createElement('a');
			link.href = href;
			link.target = '_blank';
			link.rel = 'noopener noreferrer';
			link.ariaLabel = provider === 'spotify' ? 'Listen on Spotify' : 'Watch on YouTube';
			link.append(createProviderSvg(provider));
			providers.append(link);
		}
		providers.hidden = providers.childElementCount === 0;
	}

	function pauseCurrent() {
		if (audio.paused || audio.ended) return false;
		pendingInternalPauseEvents += 1;
		audio.pause();
		syncPlayState();
		return true;
	}

	function isPlaybackAccepted() {
		return desiredPlayback
			&& acceptedPlaybackGeneration === playbackGeneration
			&& !audio.paused
			&& !audio.ended;
	}

	function invalidatePlayback() {
		pendingPlaybackGeneration = 0;
		acceptedPlaybackGeneration = 0;
		desiredPlayback = false;
		playbackGeneration += 1;
		return playbackGeneration;
	}

	function loadTrack(index, publish = true) {
		if (queue.length === 0) return false;
		invalidatePlayback();
		activeIndex = (index + queue.length) % queue.length;
		const track = currentTrack();
		if (!track) return false;

		pauseCurrent();
		audio.src = track.src;
		audio.load();
		title.textContent = track.title;
		release.textContent = [track.artist, track.release].filter(Boolean).join(' · ');
		release.hidden = release.textContent === '';
		renderProviderLinks(track);
		if (track.artwork !== '') {
			artwork.src = track.artwork;
			artwork.alt = track.artworkAlt;
			artwork.hidden = false;
		} else {
			artwork.removeAttribute('src');
			artwork.alt = '';
			artwork.hidden = true;
		}
		previousButton.disabled = queue.length < 2;
		nextButton.disabled = queue.length < 2;
		liveRegion.textContent = '';
		syncPlayState();
		syncTime();
		if (publish) notify();
		return true;
	}

	function setQueue(tracks, startIndex = 0, options = {}) {
		const nextQueue = Array.isArray(tracks) ? tracks.map(normalizeTrack).filter(Boolean) : [];
		if (activeQueueKey !== '') {
			volumeByQueue.set(activeQueueKey, audio.volume);
			if (audio.volume > 0) lastNonZeroVolumeByQueue.set(activeQueueKey, audio.volume);
		}
		if (nextQueue.length === 0) {
			invalidatePlayback();
			pauseCurrent();
			queue = [];
			activeQueueKey = '';
			activeIndex = -1;
			activated = false;
			audio.removeAttribute('src');
			audio.load();
			renderProviderLinks(null);
			syncPlayState();
			syncTime();
			syncFixedPlayerVisibility();
			notify();
			return false;
		}
		invalidatePlayback();

		const current = currentTrack();
		const nextActiveIndex = Math.max(0, Math.min(startIndex, nextQueue.length - 1));
		const nextTrack = nextQueue[nextActiveIndex];
		const currentWorkId = Number.parseInt(String(current?.workId ?? 0), 10) || 0;
		const nextWorkId = Number.parseInt(String(nextTrack.workId ?? 0), 10) || 0;
		const selectionIsUnchanged = current?.id === nextTrack.id
			&& current.src === nextTrack.src
			&& !(currentWorkId > 0 && nextWorkId > 0 && currentWorkId !== nextWorkId);
		const shouldActivate = options.activate !== false;
		if (!shouldActivate) pauseCurrent();
		queue = nextQueue;
		const nextQueueKey = queueKeyForTracks(nextQueue);
		if (nextQueueKey !== activeQueueKey) {
			audio.volume = volumeByQueue.get(nextQueueKey) ?? 1;
			audio.muted = audio.volume === 0;
			if (audio.volume > 0) lastNonZeroVolumeByQueue.set(nextQueueKey, audio.volume);
			syncVolume();
		}
		activeQueueKey = nextQueueKey;
		activeIndex = nextActiveIndex;
		activated = shouldActivate;
		liveRegion.textContent = '';
		const selected = selectionIsUnchanged ? true : loadTrack(activeIndex, false);
		if (selectionIsUnchanged) {
			renderProviderLinks(currentTrack());
			syncPlayState();
			syncTime();
		}
		syncFixedPlayerVisibility();
		notify();
		return selected;
	}

	async function playCurrent() {
		if (!currentTrack()) return false;
		const generation = ++playbackGeneration;
		desiredPlayback = true;
		acceptedPlaybackGeneration = 0;
		pendingPlaybackGeneration = generation;
		try {
			await audio.play();
			if (generation !== playbackGeneration || !desiredPlayback) {
				if (!isPlaybackAccepted() && !audio.paused) pauseCurrent();
				return false;
			}
			pendingPlaybackGeneration = 0;
			acceptedPlaybackGeneration = generation;
			if (!activated) {
				activated = true;
				syncFixedPlayerVisibility();
			}
			liveRegion.textContent = `Now playing: ${currentTrack().title}`;
			syncPlayState();
			notify();
			return true;
		} catch {
			if (generation !== playbackGeneration) return false;
			pendingPlaybackGeneration = 0;
			acceptedPlaybackGeneration = 0;
			desiredPlayback = false;
			pauseCurrent();
			liveRegion.textContent = 'Playback could not start.';
			syncPlayState();
			notify();
			return false;
		}
	}

	async function playQueue(tracks, startIndex = 0) {
		if (!setQueue(tracks, startIndex, { activate: true })) return false;
		return playCurrent();
	}

	function prepareQueue(tracks, startIndex = 0) {
		return setQueue(tracks, startIndex, { activate: false });
	}

	async function previous() {
		if (!loadTrack(activeIndex - 1)) return false;
		return playCurrent();
	}

	async function next() {
		if (!loadTrack(activeIndex + 1)) return false;
		return playCurrent();
	}

	async function toggle() {
		if (!currentTrack()) return false;
		if (desiredPlayback || isPlaybackAccepted()) {
			invalidatePlayback();
			pauseCurrent();
			liveRegion.textContent = `Paused: ${currentTrack().title}`;
			syncPlayState();
			notify();
			return true;
		}
		return playCurrent();
	}

	function seekTo(seconds) {
		const nextTime = Number(seconds);
		if (!Number.isFinite(nextTime) || nextTime < 0) return false;
		audio.currentTime = Number.isFinite(audio.duration) ? Math.min(nextTime, audio.duration) : nextTime;
		syncTime();
		notify();
		return true;
	}

	function setVolume(value) {
		const nextVolume = Number(value);
		if (!Number.isFinite(nextVolume)) return false;
		if (activeQueueKey !== '' && audio.volume > 0) lastNonZeroVolumeByQueue.set(activeQueueKey, audio.volume);
		audio.volume = Math.min(1, Math.max(0, nextVolume));
		audio.muted = audio.volume === 0;
		if (activeQueueKey !== '') {
			volumeByQueue.set(activeQueueKey, audio.volume);
			if (audio.volume > 0) lastNonZeroVolumeByQueue.set(activeQueueKey, audio.volume);
		}
		syncVolume();
		notify();
		return true;
	}

	function getVolumeForQueue(tracks) {
		const normalized = Array.isArray(tracks) ? tracks.map(normalizeTrack).filter(Boolean) : [];
		const key = queueKeyForTracks(normalized);
		if (key !== '' && key === activeQueueKey) return audio.volume;
		return key !== '' ? (volumeByQueue.get(key) ?? 1) : 1;
	}

	function setVolumeForQueue(tracks, value) {
		const normalized = Array.isArray(tracks) ? tracks.map(normalizeTrack).filter(Boolean) : [];
		const key = queueKeyForTracks(normalized);
		const nextVolume = Number(value);
		if (key === '' || !Number.isFinite(nextVolume)) return false;
		const clamped = Math.min(1, Math.max(0, nextVolume));
		volumeByQueue.set(key, clamped);
		if (clamped > 0) lastNonZeroVolumeByQueue.set(key, clamped);
		if (key === activeQueueKey) return setVolume(clamped);
		return true;
	}

	function subscribe(listener) {
		if (typeof listener !== 'function') return () => {};
		subscribers.add(listener);
		lastNotificationSignature = null;
		return () => subscribers.delete(listener);
	}

	function setInlineActive(value) {
		const nextInlineActive = Boolean(value);
		if (inlineActive === nextInlineActive) return;
		inlineActive = nextInlineActive;
		notify();
	}

	function setRouteIsMusic(value) {
		const nextRouteIsMusic = Boolean(value);
		if (routeIsMusic === nextRouteIsMusic) return;
		routeIsMusic = nextRouteIsMusic;
		notify();
	}

	function pause() {
		const shouldPause = desiredPlayback || isPlaybackAccepted() || (!audio.paused && !audio.ended);
		invalidatePlayback();
		pauseCurrent();
		if (!shouldPause) return false;
		liveRegion.textContent = `Paused: ${currentTrack()?.title ?? 'track'}`;
		syncPlayState();
		notify();
		return true;
	}

	function close() {
		invalidatePlayback();
		pauseCurrent();
		activated = false;
		liveRegion.textContent = 'Player closed.';
		notify();
		hidePlayer();
	}

	previousButton.addEventListener('click', () => { void previous(); });
	nextButton.addEventListener('click', () => { void next(); });
	playButton.addEventListener('click', () => {
		void toggle();
	});
	muteButton.addEventListener('click', () => {
		const restoredVolume = activeQueueKey !== '' ? (lastNonZeroVolumeByQueue.get(activeQueueKey) ?? 1) : 1;
		setVolume(audio.volume > 0 ? 0 : restoredVolume);
	});
	closeButton.addEventListener('click', close);
	seek.addEventListener('input', () => {
		const requested = Number.parseFloat(seek.value);
		seekTo(requested);
	});
	volume.addEventListener('input', () => {
		setVolume(Number.parseFloat(volume.value));
	});
	audio.addEventListener('play', () => {
		if (desiredPlayback && pendingPlaybackGeneration === playbackGeneration) return;
		if (!isPlaybackAccepted()) {
			pauseCurrent();
			syncPlayState();
			return;
		}
		syncPlayState();
		notify();
	});
	audio.addEventListener('pause', () => {
		syncPlayState();
		if (pendingInternalPauseEvents > 0) {
			pendingInternalPauseEvents -= 1;
			return;
		}
		const track = currentTrack();
		if (desiredPlayback || acceptedPlaybackGeneration !== 0) {
			invalidatePlayback();
			if (track) liveRegion.textContent = `Paused: ${track.title}`;
		}
		notify();
	});
	audio.addEventListener('ended', () => { void next(); });
	audio.addEventListener('loadedmetadata', () => {
		syncTime();
		notify();
	});
	audio.addEventListener('timeupdate', () => {
		syncTime();
		notify();
	});
	audio.addEventListener('durationchange', () => {
		syncTime();
		notify();
	});
	audio.addEventListener('volumechange', () => {
		if (activeQueueKey !== '') volumeByQueue.set(activeQueueKey, audio.volume);
		syncVolume();
		notify();
	});
	audio.addEventListener('error', () => {
		invalidatePlayback();
		pauseCurrent();
		liveRegion.textContent = 'This track could not be played.';
		syncPlayState();
		notify();
	});

	syncPlayState();
	syncTime();
	syncVolume();
	return {
		setQueue,
		prepareQueue,
		playQueue,
		previous,
		next,
		toggle,
		seekTo,
		setVolume,
		getVolumeForQueue,
		setVolumeForQueue,
		subscribe,
		setInlineActive,
		setRouteIsMusic,
		close,
		pause,
		getState: snapshot,
	};
}
