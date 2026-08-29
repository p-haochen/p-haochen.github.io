import { createPlaylistComponent, isPlaylistPlayer } from './playlist-component-01.js';

const controllersByRoot = new WeakMap();

function readTracks(root) {
	const queueScript = root.querySelector(':scope > script[type="application/json"][data-work-detail-audio-tracks]');
	if (!(queueScript instanceof HTMLScriptElement)) return null;
	try {
		const parsed = JSON.parse(queueScript.textContent ?? '');
		if (!Array.isArray(parsed) || parsed.length === 0) return null;
		const tracks = parsed.map((track) => {
			if (!track || typeof track !== 'object' || typeof track.src !== 'string' || track.src.trim() === '') return null;
			return {
				...track,
				src: track.src.trim(),
				title: typeof track.title === 'string' && track.title.trim() !== '' ? track.title.trim() : 'Untitled track',
			};
		});
		return tracks.some((track) => track === null) ? null : tracks;
	} catch {
		return null;
	}
}

function readCover(root, tracks) {
	const image = root.querySelector('.work-detail-audio__artwork');
	if (!(image instanceof HTMLImageElement)) {
		return { src: tracks[0]?.artwork ?? '', alt: tracks[0]?.artworkAlt ?? '' };
	}
	return {
		src: image.currentSrc || image.src,
		alt: image.alt,
		srcset: image.srcset,
		sizes: image.sizes,
		width: image.naturalWidth || image.width,
		height: image.naturalHeight || image.height,
	};
}

function createCanonicalPlaylistPlayer(root) {
	const audio = document.createElement('audio');
	audio.preload = 'metadata';
	audio.hidden = true;
	root.append(audio);
	let queue = [];
	let activeIndex = -1;
	let activated = false;
	let destroyed = false;
	const subscribers = new Set();
	const volumes = new Map();
	const queueKey = (tracks) => {
		const workId = Number.parseInt(String(tracks?.[0]?.workId ?? 0), 10) || 0;
		return workId > 0 ? `work:${workId}` : `queue:${(tracks ?? []).map((track) => track.src).join('|')}`;
	};
	const currentTrack = () => activeIndex >= 0 && activeIndex < queue.length ? queue[activeIndex] : null;
	const snapshot = () => ({
		queue: queue.map((track) => ({ ...track })),
		activeIndex,
		activeTrack: currentTrack() ? { ...currentTrack() } : null,
		activated,
		playing: activated && !audio.paused && !audio.ended,
		currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
		duration: Number.isFinite(audio.duration) ? audio.duration : 0,
		volume: audio.volume,
		muted: audio.muted || audio.volume === 0,
	});
	const notify = () => {
		if (destroyed) return;
		const state = snapshot();
		for (const listener of subscribers) listener(state);
	};
	const pause = () => {
		if (!audio.paused) audio.pause();
		notify();
		return true;
	};
	const load = (index) => {
		if (queue.length === 0) return false;
		activeIndex = (index + queue.length) % queue.length;
		audio.src = currentTrack().src;
		audio.load();
		notify();
		return true;
	};
	const playCurrent = async () => {
		if (!currentTrack() || destroyed) return false;
		try {
			await audio.play();
			activated = true;
			notify();
			return true;
		} catch {
			activated = false;
			notify();
			return false;
		}
	};
	const setQueue = (tracks, index = 0, shouldActivate = true) => {
		if (!Array.isArray(tracks) || tracks.length === 0) return false;
		queue = tracks.map((track) => ({ ...track }));
		const storedVolume = volumes.get(queueKey(queue));
		if (Number.isFinite(storedVolume)) audio.volume = storedVolume;
		if (!load(index)) return false;
		activated = shouldActivate;
		return true;
	};
	const api = {
		getState: snapshot,
		subscribe(listener) {
			subscribers.add(listener);
			return () => subscribers.delete(listener);
		},
		prepareQueue(tracks, index = 0) { return setQueue(tracks, index, false); },
		async playQueue(tracks, index = 0) {
			if (!setQueue(tracks, index, true)) return false;
			return playCurrent();
		},
		async previous() { return load(activeIndex - 1) ? playCurrent() : false; },
		async next() { return load(activeIndex + 1) ? playCurrent() : false; },
		async toggle() {
			if (!currentTrack()) return false;
			if (!audio.paused) return pause();
			return playCurrent();
		},
		seekTo(seconds) {
			const next = Number(seconds);
			if (!Number.isFinite(next) || next < 0) return false;
			audio.currentTime = Number.isFinite(audio.duration) ? Math.min(next, audio.duration) : next;
			notify();
			return true;
		},
		setVolume(value) {
			const next = Number(value);
			if (!Number.isFinite(next)) return false;
			audio.volume = Math.min(1, Math.max(0, next));
			audio.muted = audio.volume === 0;
			if (queue.length > 0) volumes.set(queueKey(queue), audio.volume);
			notify();
			return true;
		},
		getVolumeForQueue(tracks) { return volumes.get(queueKey(tracks)) ?? 1; },
		setVolumeForQueue(tracks, value) {
			const next = Number(value);
			if (!Number.isFinite(next)) return false;
			const clamped = Math.min(1, Math.max(0, next));
			volumes.set(queueKey(tracks), clamped);
			if (queueKey(tracks) === queueKey(queue)) return api.setVolume(clamped);
			return true;
		},
		setInlineActive() {},
		setRouteIsMusic() {},
		pause,
		mount() {
			if (!audio.isConnected) root.append(audio);
		},
		destroy() {
			destroyed = true;
			subscribers.clear();
			if (!audio.paused) audio.pause();
			audio.remove();
		},
	};
	for (const type of ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'volumechange']) {
		audio.addEventListener(type, notify);
	}
	audio.addEventListener('ended', () => { void api.next(); });
	return api;
}

export function initializeWorkDetailAudio(root, options = {}) {
	if (!(root instanceof HTMLElement)) return null;
	const existing = controllersByRoot.get(root);
	if (existing) return existing;
	const tracks = readTracks(root);
	if (tracks === null) return null;
	const hasPortalPlayer = Object.prototype.hasOwnProperty.call(options, 'player');
	if (hasPortalPlayer && !isPlaylistPlayer(options.player)) return null;
	const title = root.dataset.playlistTitle
		|| root.querySelector('.work-detail-audio__title')?.textContent?.trim()
		|| tracks[0]?.release
		|| 'Playlist';
	const workId = Number.parseInt(String(root.dataset.playlistWorkId ?? tracks[0]?.workId ?? 0), 10) || 0;
	const work = { id: workId, title, cover: readCover(root, tracks), tracks };
	const player = hasPortalPlayer ? options.player : createCanonicalPlaylistPlayer(root);
	if (hasPortalPlayer && typeof player.setInlineActive === 'function') player.setInlineActive(true);
	const playlist = createPlaylistComponent(work, player, { announceStatus: !hasPortalPlayer });
	if (!playlist) {
		if (!hasPortalPlayer) player.destroy();
		return null;
	}
	root.replaceChildren(playlist.root);
	if (!hasPortalPlayer) player.mount();
	root.classList.add('work-detail-audio--enhanced');
	playlist.mount();
	const controller = {
		destroy() {
			playlist.destroy();
			if (hasPortalPlayer && typeof player.setInlineActive === 'function') player.setInlineActive(false);
			if (!hasPortalPlayer) player.destroy();
			controllersByRoot.delete(root);
		},
	};
	controllersByRoot.set(root, controller);
	return controller;
}

function bootstrapCanonicalWorkDetailAudio() {
	if (!document.body.classList.contains('single-portfolio_work')) return;
	initializeWorkDetailAudio(document.querySelector('[data-work-detail-audio]'));
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', bootstrapCanonicalWorkDetailAudio, { once: true });
} else {
	bootstrapCanonicalWorkDetailAudio();
}
