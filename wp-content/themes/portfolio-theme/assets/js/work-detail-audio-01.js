import { createPlaylistComponent, isPlaylistPlayer } from './playlist-component-01.js';
import { createMusicPlayer } from './music-player-01.js';
import { attachMusicCapsule } from './music-player-capsule-01.js';

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
	const mobilePlayback = window.matchMedia('(max-width: 700px)');
	const syncViewportVolume = () => {
		if (destroyed) return;
		const storedVolume = volumes.get(queueKey(queue));
		audio.volume = mobilePlayback.matches ? 1 : (storedVolume ?? 1);
		audio.muted = audio.volume === 0;
		notify();
	};
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
		if (mobilePlayback.matches) {
			audio.volume = 1;
			audio.muted = false;
		}
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
			mobilePlayback.removeEventListener('change', syncViewportVolume);
			subscribers.clear();
			if (!audio.paused) audio.pause();
			audio.remove();
		},
	};
	for (const type of ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'volumechange']) {
		audio.addEventListener(type, notify);
	}
	mobilePlayback.addEventListener('change', syncViewportVolume);
	audio.addEventListener('ended', () => { void api.next(); });
	return api;
}

function formatClock(seconds) {
	const value = Math.max(0, Math.floor(Number(seconds) || 0));
	return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

// Work Detail J: the PLAY button under the catalogue and the "now playing" line under the cover.
function bindDetailControls(detail, player, playlist) {
	if (!(detail instanceof HTMLElement)) return () => {};
	const actions = detail.querySelector('[data-work-detail-actions]');
	const now = detail.querySelector('[data-work-detail-now]');
	const nowTitle = now?.querySelector('[data-work-detail-now-title]');
	const nowTime = now?.querySelector('[data-work-detail-now-time]');
	let button = null;
	let label = null;
	if (actions instanceof HTMLElement) {
		button = document.createElement('button');
		button.type = 'button';
		button.className = 'work-detail__play';
		button.innerHTML = '<svg class="work-detail__play-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg><svg class="work-detail__pause-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor"/></svg>';
		label = document.createElement('span');
		label.textContent = 'PLAY';
		button.append(label);
		button.addEventListener('click', () => playlist.toggleWork());
		actions.prepend(button);
		actions.hidden = false;
	}
	const render = (state) => {
		const owned = playlist.ownsQueue(state);
		const playing = owned && state.playing === true;
		if (button && label) {
			button.classList.toggle('is-playing', playing);
			button.setAttribute('aria-pressed', String(playing));
			label.textContent = playing ? 'PAUSE' : 'PLAY';
		}
		if (now instanceof HTMLElement) {
			const shown = owned && state.activated !== false && Boolean(state.activeTrack);
			now.classList.toggle('is-shown', shown);
			now.classList.toggle('is-playing', playing);
			if (nowTitle instanceof HTMLElement) nowTitle.textContent = shown ? state.activeTrack.title : '';
			if (nowTime instanceof HTMLElement) nowTime.textContent = shown ? formatClock(state.currentTime) : '';
		}
	};
	const unsubscribe = player.subscribe(render);
	render(player.getState());
	return () => {
		if (typeof unsubscribe === 'function') unsubscribe();
		button?.remove();
		if (actions instanceof HTMLElement && actions.childElementCount === 0) actions.hidden = true;
		now?.classList.remove('is-shown', 'is-playing');
	};
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
	const playlist = createPlaylistComponent(work, player, { announceStatus: !hasPortalPlayer, showHeader: false });
	if (!playlist) {
		if (!hasPortalPlayer) player.destroy();
		return null;
	}
	root.replaceChildren(playlist.root);
	if (!hasPortalPlayer) player.mount();
	root.classList.add('work-detail-audio--enhanced');
	playlist.mount();
	const releaseDetailControls = bindDetailControls(root.closest('.work-detail'), player, playlist);
	const controller = {
		destroy() {
			releaseDetailControls();
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
	const audioRoot = document.querySelector('[data-work-detail-audio]');
	// A Direct Work page plays through the same pop-up player (capsule) as the Portal.
	const capsuleRoot = document.querySelector('[data-music-capsule]');
	const player = capsuleRoot instanceof HTMLElement ? createMusicPlayer(capsuleRoot) : null;
	if (player) {
		attachMusicCapsule(capsuleRoot, player);
		initializeWorkDetailAudio(audioRoot, { player });
		return;
	}
	initializeWorkDetailAudio(audioRoot);
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', bootstrapCanonicalWorkDetailAudio, { once: true });
} else {
	bootstrapCanonicalWorkDetailAudio();
}
