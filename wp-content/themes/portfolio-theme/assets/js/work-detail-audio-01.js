const controllersByRoot = new WeakMap();

function formatTime(value) {
	if (!Number.isFinite(value) || value < 0) return '0:00';
	const hours = Math.floor(value / 3600);
	const minutes = Math.floor(value / 60);
	const seconds = Math.floor(value % 60).toString().padStart(2, '0');
	return hours > 0 ? `${hours}:${String(minutes % 60).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

function normalizeTrack(track) {
	if (!track || typeof track !== 'object' || typeof track.src !== 'string' || track.src.trim() === '') return null;
	return {
		...track,
		src: track.src.trim(),
		title: typeof track.title === 'string' && track.title.trim() !== '' ? track.title.trim() : 'Untitled track',
	};
}

function readTracks(root) {
	const queueScript = root.querySelector(':scope > script[type="application/json"][data-work-detail-audio-tracks]');
	if (!(queueScript instanceof HTMLScriptElement)) return null;

	let parsedTracks;
	try {
		parsedTracks = JSON.parse(queueScript.textContent ?? '');
	} catch {
		return null;
	}
	if (!Array.isArray(parsedTracks)) return null;

	const tracks = parsedTracks.map(normalizeTrack);
	if (tracks.length === 0 || tracks.some((track) => track === null)) return null;
	return tracks;
}

function sameTrack(track, candidate) {
	if (!track || !candidate || typeof candidate !== 'object' || typeof candidate.src !== 'string' || track.src !== candidate.src) return false;
	const trackWorkId = Number.parseInt(String(track.workId ?? 0), 10) || 0;
	const candidateWorkId = Number.parseInt(String(candidate.workId ?? 0), 10) || 0;
	if (trackWorkId > 0 && candidateWorkId > 0 && trackWorkId !== candidateWorkId) return false;
	const trackId = Number.parseInt(String(track.id ?? track.attachment_id ?? 0), 10) || 0;
	const candidateId = Number.parseInt(String(candidate.id ?? candidate.attachment_id ?? 0), 10) || 0;
	if (trackId > 0 && candidateId > 0) return trackId === candidateId;
	return track.title === candidate.title;
}

function isSingletonPlayer(player) {
	return Boolean(
		player
		&& typeof player.setInlineActive === 'function'
		&& typeof player.subscribe === 'function'
		&& typeof player.getState === 'function'
		&& typeof player.prepareQueue === 'function'
		&& typeof player.playQueue === 'function'
		&& typeof player.previous === 'function'
		&& typeof player.next === 'function'
		&& typeof player.toggle === 'function'
		&& typeof player.seekTo === 'function'
		&& typeof player.setVolume === 'function',
	);
}

function queuesMatch(queue, tracks) {
	return Array.isArray(queue)
		&& queue.length === tracks.length
		&& queue.every((track, index) => sameTrack(tracks[index], track));
}

function trackIndexForButton(button, trackCount) {
	const value = button.dataset.workDetailAudioTrackIndex;
	if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/.test(value)) return null;
	const index = Number(value);
	return Number.isSafeInteger(index) && index < trackCount ? index : null;
}

function createPortalAdapter(player, tracks, onState) {
	player.setInlineActive(true);
	let selectedIndex = 0;
	let lastSnapshot = player.getState();
	const ownsQueue = (snapshot) => queuesMatch(snapshot?.queue, tracks);
	const renderSnapshot = (snapshot) => {
		lastSnapshot = snapshot;
		if (ownsQueue(snapshot) && Number.isInteger(snapshot.activeIndex) && snapshot.activeIndex >= 0 && snapshot.activeIndex < tracks.length) selectedIndex = snapshot.activeIndex;
		onState(snapshot);
	};
	const unsubscribe = player.subscribe(renderSnapshot);
	if (ownsQueue(lastSnapshot)) renderSnapshot(lastSnapshot);
	else if (lastSnapshot?.activated === true) renderSnapshot(lastSnapshot);
	else player.prepareQueue(tracks, selectedIndex);
	const startLocalSelection = (index) => {
		selectedIndex = (index + tracks.length) % tracks.length;
		return player.playQueue(tracks, selectedIndex);
	};

	return {
		playQueue(index) {
			return startLocalSelection(index);
		},
		previous() {
			return ownsQueue(player.getState()) ? player.previous() : startLocalSelection(selectedIndex - 1);
		},
		next() {
			return ownsQueue(player.getState()) ? player.next() : startLocalSelection(selectedIndex + 1);
		},
		toggle() {
			return ownsQueue(player.getState()) ? player.toggle() : startLocalSelection(selectedIndex);
		},
		seekTo(seconds) {
			return ownsQueue(player.getState()) ? player.seekTo(seconds) : false;
		},
		setVolume(value) {
			return player.setVolume(value);
		},
		destroy() {
			if (typeof unsubscribe === 'function') unsubscribe();
			player.setInlineActive(false);
		},
	};
}

function createCanonicalAdapter(root, tracks, onState) {
	const audio = document.createElement('audio');
	audio.preload = 'metadata';
	audio.hidden = true;
	root.append(audio);

	const queue = [...tracks];
	let activeIndex = 0;
	let activated = false;
	let operationGeneration = 0;
	let pendingPlaybackGeneration = 0;
	let acceptedPlaybackGeneration = 0;
	let desiredPlayback = false;
	let pendingInternalPauseEvents = 0;
	let adapterDestroyed = false;

	function currentTrack() {
		return activeIndex >= 0 && activeIndex < queue.length ? queue[activeIndex] : null;
	}

	function isPlaying() {
		return desiredPlayback
			&& acceptedPlaybackGeneration === operationGeneration
			&& !audio.paused
			&& !audio.ended
			&& !audio.error;
	}

	function pauseAudio() {
		if (audio.paused || audio.ended) return false;
		pendingInternalPauseEvents += 1;
		audio.pause();
		return true;
	}

	function invalidatePlayback() {
		pendingPlaybackGeneration = 0;
		acceptedPlaybackGeneration = 0;
		desiredPlayback = false;
		operationGeneration += 1;
		return operationGeneration;
	}

	function snapshot() {
		const track = currentTrack();
		return {
			queue: [...queue],
			activeIndex,
			activeTrack: track ? { ...track } : null,
			activated,
			routeIsMusic: false,
			inlineActive: true,
			playing: isPlaying(),
			currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
			duration: Number.isFinite(audio.duration) ? audio.duration : 0,
			volume: audio.volume,
			muted: audio.muted || audio.volume === 0,
		};
	}

	function notify(announcement = '') {
		onState(snapshot(), announcement);
	}

	function load(index) {
		if (queue.length === 0) return false;
		invalidatePlayback();
		pauseAudio();
		activeIndex = (index + queue.length) % queue.length;
		const track = currentTrack();
		if (!track) return false;
		audio.src = track.src;
		audio.load();
		notify();
		return true;
	}

	async function playCurrent() {
		if (!currentTrack() || adapterDestroyed) return false;
		const generation = ++operationGeneration;
		desiredPlayback = true;
		acceptedPlaybackGeneration = 0;
		pendingPlaybackGeneration = generation;
		try {
			await audio.play();
			if (generation !== operationGeneration || !desiredPlayback || adapterDestroyed) {
				if (!isPlaying() && !audio.paused) pauseAudio();
				return false;
			}
			pendingPlaybackGeneration = 0;
			acceptedPlaybackGeneration = generation;
			activated = true;
			notify();
			return true;
		} catch {
			if (generation !== operationGeneration || adapterDestroyed) return false;
			pendingPlaybackGeneration = 0;
			acceptedPlaybackGeneration = 0;
			desiredPlayback = false;
			pauseAudio();
			notify('Playback could not start.');
			return false;
		}
	}

	async function playQueue(index = 0) {
		if (!load(index)) return false;
		return playCurrent();
	}

	async function previous() {
		if (!load(activeIndex - 1)) return false;
		return playCurrent();
	}

	async function next() {
		if (!load(activeIndex + 1)) return false;
		return playCurrent();
	}

	async function toggle() {
		if (!currentTrack()) return false;
		if (desiredPlayback || isPlaying()) {
			invalidatePlayback();
			pauseAudio();
			notify();
			return true;
		}
		if (audio.error) {
			if (!load(activeIndex)) return false;
		} else if (audio.getAttribute('src') === null && !load(activeIndex)) return false;
		return playCurrent();
	}

	function seekTo(seconds) {
		const nextTime = Number(seconds);
		if (!Number.isFinite(nextTime) || nextTime < 0) return false;
		audio.currentTime = Number.isFinite(audio.duration) ? Math.min(nextTime, audio.duration) : nextTime;
		notify();
		return true;
	}

	function setVolume(value) {
		const nextVolume = Number(value);
		if (!Number.isFinite(nextVolume)) return false;
		audio.volume = Math.min(1, Math.max(0, nextVolume));
		audio.muted = audio.volume === 0;
		notify();
		return true;
	}

	const onLoadedMetadata = () => notify();
	const onTimeUpdate = () => notify();
	const onPlay = () => {
		if (desiredPlayback && pendingPlaybackGeneration === operationGeneration) return;
		if (!isPlaying()) {
			pauseAudio();
			return;
		}
		notify();
	};
	const onPause = () => {
		if (pendingInternalPauseEvents > 0) {
			pendingInternalPauseEvents -= 1;
			return;
		}
		if (desiredPlayback || acceptedPlaybackGeneration !== 0) invalidatePlayback();
		notify();
	};
	const onVolumeChange = () => notify();
	const onEnded = () => { void next(); };
	const onError = () => {
		invalidatePlayback();
		pauseAudio();
		notify('Playback could not start.');
	};
	audio.addEventListener('loadedmetadata', onLoadedMetadata);
	audio.addEventListener('timeupdate', onTimeUpdate);
	audio.addEventListener('play', onPlay);
	audio.addEventListener('pause', onPause);
	audio.addEventListener('volumechange', onVolumeChange);
	audio.addEventListener('ended', onEnded);
	audio.addEventListener('error', onError);
	notify();

	return {
		playQueue,
		previous,
		next,
		toggle,
		seekTo,
		setVolume,
		destroy() {
			adapterDestroyed = true;
			invalidatePlayback();
			audio.removeEventListener('loadedmetadata', onLoadedMetadata);
			audio.removeEventListener('timeupdate', onTimeUpdate);
			audio.removeEventListener('play', onPlay);
			audio.removeEventListener('pause', onPause);
			audio.removeEventListener('volumechange', onVolumeChange);
			audio.removeEventListener('ended', onEnded);
			audio.removeEventListener('error', onError);
			pauseAudio();
			audio.remove();
		},
	};
}

export function initializeWorkDetailAudio(root, options = {}) {
	if (!(root instanceof HTMLElement)) return null;
	const existingController = controllersByRoot.get(root);
	if (existingController) return existingController;
	const tracks = readTracks(root);
	if (tracks === null) return null;
	const { player } = options;
	const hasPortalPlayer = Object.prototype.hasOwnProperty.call(options, 'player');
	if (hasPortalPlayer && !isSingletonPlayer(player)) return null;

	const currentTitle = root.querySelector('.work-detail-audio__current-title');
	const liveRegion = root.querySelector('.work-detail-audio__status');
	const previousButton = root.querySelector('[data-work-detail-audio-action="previous"]');
	const playButton = root.querySelector('[data-work-detail-audio-action="play"]');
	const nextButton = root.querySelector('[data-work-detail-audio-action="next"]');
	const seek = root.querySelector('[data-work-detail-audio-seek]');
	const time = root.querySelector('[data-work-detail-audio-time]');
	const volume = root.querySelector('[data-work-detail-audio-volume]');
	const trackButtons = [...root.querySelectorAll('[data-work-detail-audio-track]')];
	const equalizers = [...root.querySelectorAll('[data-work-detail-audio-equalizer]')];
	if (
		!(currentTitle instanceof HTMLElement)
		|| !(liveRegion instanceof HTMLElement)
		|| !(previousButton instanceof HTMLButtonElement)
		|| !(playButton instanceof HTMLButtonElement)
		|| !(nextButton instanceof HTMLButtonElement)
		|| !(seek instanceof HTMLInputElement)
		|| !(time instanceof HTMLElement)
		|| !(volume instanceof HTMLInputElement)
		|| trackButtons.length !== tracks.length
		|| equalizers.length !== tracks.length
		|| trackButtons.some((button) => !(button instanceof HTMLButtonElement))
		|| equalizers.some((indicator) => !(indicator instanceof HTMLElement))
	) return null;

	const buttonsByIndex = new Map();
	for (const button of trackButtons) {
		const index = trackIndexForButton(button, tracks.length);
		if (index === null || buttonsByIndex.has(index)) return null;
		buttonsByIndex.set(index, button);
	}
	if (buttonsByIndex.size !== tracks.length) return null;

	let wasPlaying = false;
	let destroyed = false;
	let adapter = null;
	let lastSnapshot = null;
	let suppressPortalPauseAnnouncement = false;
	let playbackRequestGeneration = 0;

	function sync(snapshot = { queue: tracks, activeIndex: 0, playing: false, currentTime: 0, duration: 0, volume: 1, muted: false }, announcement = '') {
		if (destroyed) return;
		lastSnapshot = snapshot;
		const activeOwnQueue = queuesMatch(snapshot.queue, tracks);
		const activeIndex = activeOwnQueue
			&& Number.isInteger(snapshot.activeIndex)
			&& snapshot.activeIndex >= 0
			&& snapshot.activeIndex < tracks.length
			? snapshot.activeIndex
			: -1;
		const selectedTrack = activeIndex >= 0 ? tracks[activeIndex] : tracks[0];
		const playing = activeIndex >= 0 && snapshot.playing === true;
		const duration = activeIndex >= 0 && Number.isFinite(snapshot.duration) ? Math.max(0, snapshot.duration) : 0;
		const currentTime = activeIndex >= 0 && Number.isFinite(snapshot.currentTime)
			? Math.max(0, duration > 0 ? Math.min(snapshot.currentTime, duration) : snapshot.currentTime)
			: 0;
		const nextVolume = Number.isFinite(snapshot.volume) ? Math.min(1, Math.max(0, snapshot.volume)) : 1;
		currentTitle.textContent = selectedTrack.title;
		for (const [index, button] of buttonsByIndex) {
			button.setAttribute('aria-current', String(index === activeIndex));
		}
		equalizers.forEach((indicator, index) => {
			indicator.classList.toggle('is-active', index === activeIndex);
			indicator.classList.toggle('is-playing', index === activeIndex && playing);
		});
		previousButton.disabled = tracks.length < 2;
		nextButton.disabled = tracks.length < 2;
		playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play');
		playButton.setAttribute('aria-pressed', String(playing));
		playButton.textContent = playing ? 'Ⅱ' : '▶';
		seek.disabled = activeIndex < 0;
		seek.max = String(duration);
		if (document.activeElement !== seek) seek.value = String(currentTime);
		time.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
		volume.value = String(nextVolume);
		if (hasPortalPlayer) liveRegion.textContent = '';
		else if (announcement !== '') liveRegion.textContent = announcement;
		else if (playing && !wasPlaying && !hasPortalPlayer) liveRegion.textContent = `Now playing: ${selectedTrack.title}`;
		else if (!playing && wasPlaying && snapshot.activated !== false && !suppressPortalPauseAnnouncement) liveRegion.textContent = `Paused: ${selectedTrack.title}`;
		wasPlaying = playing;
	}

	sync();
	adapter = hasPortalPlayer
		? createPortalAdapter(player, tracks, sync)
		: createCanonicalAdapter(root, tracks, sync);

	async function requestPlayback(operation, options = {}) {
		const generation = ++playbackRequestGeneration;
		if (hasPortalPlayer) suppressPortalPauseAnnouncement = options.suppressIntermediatePause === true;
		try {
			const succeeded = await operation();
			if (generation !== playbackRequestGeneration || destroyed) return;
			if (succeeded === false) {
				if (hasPortalPlayer) liveRegion.textContent = '';
				else sync(lastSnapshot ?? undefined, 'Playback could not start.');
			}
		} catch {
			if (generation !== playbackRequestGeneration || destroyed) return;
			if (hasPortalPlayer) liveRegion.textContent = '';
			else sync(lastSnapshot ?? undefined, 'Playback could not start.');
		} finally {
			if (generation === playbackRequestGeneration) suppressPortalPauseAnnouncement = false;
		}
	}

	const onTrackClick = (event) => {
		const button = event.currentTarget;
		if (!(button instanceof HTMLButtonElement) || destroyed) return;
		const index = trackIndexForButton(button, tracks.length);
		if (index === null || !buttonsByIndex.has(index)) return;
		void requestPlayback(() => adapter.playQueue(index), { suppressIntermediatePause: true });
	};
	const onPreviousClick = () => {
		if (!destroyed) void requestPlayback(() => adapter.previous(), { suppressIntermediatePause: true });
	};
	const onPlayClick = () => {
		if (!destroyed) void requestPlayback(() => adapter.toggle());
	};
	const onNextClick = () => {
		if (!destroyed) void requestPlayback(() => adapter.next(), { suppressIntermediatePause: true });
	};
	const onSeekInput = () => {
		if (destroyed) return;
		const seconds = Number.parseFloat(seek.value);
		if (Number.isFinite(seconds)) adapter.seekTo(seconds);
	};
	const onVolumeInput = () => {
		if (destroyed) return;
		const nextVolume = Number.parseFloat(volume.value);
		if (Number.isFinite(nextVolume)) adapter.setVolume(nextVolume);
	};

	for (const button of trackButtons) button.addEventListener('click', onTrackClick);
	previousButton.addEventListener('click', onPreviousClick);
	playButton.addEventListener('click', onPlayClick);
	nextButton.addEventListener('click', onNextClick);
	seek.addEventListener('input', onSeekInput);
	volume.addEventListener('input', onVolumeInput);

	const controller = {
		destroy() {
			if (destroyed) return;
			destroyed = true;
			playbackRequestGeneration += 1;
			for (const button of trackButtons) button.removeEventListener('click', onTrackClick);
			previousButton.removeEventListener('click', onPreviousClick);
			playButton.removeEventListener('click', onPlayClick);
			nextButton.removeEventListener('click', onNextClick);
			seek.removeEventListener('input', onSeekInput);
			volume.removeEventListener('input', onVolumeInput);
			adapter.destroy();
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
