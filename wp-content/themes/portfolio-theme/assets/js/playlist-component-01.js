let playlistControlId = 0;

function formatTime(value) {
	if (!Number.isFinite(value) || value < 0) return '0:00';
	const hours = Math.floor(value / 3600);
	const minutes = Math.floor(value / 60);
	const seconds = Math.floor(value % 60).toString().padStart(2, '0');
	return hours > 0 ? `${hours}:${String(minutes % 60).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

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

function clampVolume(value, fallback = 1) {
	return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
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
	frame.className = 'music-collection__artwork';
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

function createVolumeToggle(workTitle) {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'music-collection__volume-toggle';
	button.dataset.musicCollectionVolumeToggle = '';
	button.setAttribute('aria-label', `Mute ${workTitle}`);
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('focusable', 'false');
	svg.setAttribute('aria-hidden', 'true');
	const speaker = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	speaker.setAttribute('d', 'M4 9v6h4l5 4V5L8 9H4Z');
	speaker.setAttribute('fill', 'currentColor');
	const waves = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	waves.dataset.volumeState = 'on';
	waves.setAttribute('d', 'M16 8.5a5 5 0 0 1 0 7M18.7 6a8.5 8.5 0 0 1 0 12');
	const muted = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	muted.dataset.volumeState = 'muted';
	muted.setAttribute('d', 'm16.75 9 4.5 4.5m0-4.5-4.5 4.5');
	for (const detail of [waves, muted]) {
		detail.setAttribute('fill', 'none');
		detail.setAttribute('stroke', 'currentColor');
		detail.setAttribute('stroke-width', '1.5');
		detail.setAttribute('stroke-linecap', 'round');
	}
	svg.append(speaker, waves, muted);
	button.append(svg);
	return { button, waves, muted };
}

export function createPlaylistComponent(work, player, options = {}) {
	if (!work || typeof work.title !== 'string' || !isPlaylistPlayer(player)) return null;
	const tracks = playlistTracksForWork(work);
	if (tracks.length === 0) return null;
	const announceStatus = options.announceStatus === true;

	const module = document.createElement('article');
	module.className = 'portfolio-playlist music-collection';
	module.dataset.workId = String(work.id ?? tracks[0]?.workId ?? '');
	const heading = document.createElement('h3');
	heading.className = 'music-collection__title';
	heading.textContent = work.title;
	const now = document.createElement('div');
	now.className = 'music-collection__now';
	now.append(createArtwork(work.cover));
	const current = document.createElement('div');
	current.className = 'music-collection__current';
	const metadata = document.createElement('div');
	metadata.className = 'music-collection__metadata';
	const label = document.createElement('p');
	label.className = 'music-collection__eyebrow';
	label.textContent = 'NOW PLAYING';
	const currentTitle = document.createElement('p');
	currentTitle.className = 'music-collection__current-title';
	currentTitle.textContent = tracks[0].title;
	const controls = document.createElement('div');
	controls.className = 'music-collection__controls';
	const control = (labelText, text, className = '') => {
		const button = document.createElement('button');
		button.type = 'button';
		button.setAttribute('aria-label', labelText);
		button.textContent = text;
		if (className !== '') button.className = className;
		return button;
	};
	const previousButton = control(`Previous track in ${work.title}`, '◀', 'music-collection__previous');
	const playButton = control(`Play current track in ${work.title}`, '▶', 'music-collection__play');
	const nextButton = control(`Next track in ${work.title}`, '▶', 'music-collection__next');
	controls.append(previousButton, playButton, nextButton);

	const controlId = ++playlistControlId;
	const timeline = document.createElement('div');
	timeline.className = 'music-collection__timeline';
	const seekId = `portfolio-playlist-seek-${work.id ?? 'work'}-${controlId}`;
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
	time.className = 'music-collection__time';
	time.dataset.musicCollectionTime = '';
	time.htmlFor = seekId;
	time.textContent = '0:00 / 0:00';
	timeline.append(seekLabel, seek, time);

	const volumeControl = document.createElement('div');
	volumeControl.className = 'music-collection__volume';
	const volumeId = `portfolio-playlist-volume-${work.id ?? 'work'}-${controlId}`;
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
	volume.value = String(typeof player.getVolumeForQueue === 'function' ? player.getVolumeForQueue(tracks) : 1);
	const volumeToggle = createVolumeToggle(work.title);
	volumeControl.append(volumeLabel, volumeToggle.button, volume);
	metadata.append(label, currentTitle);
	current.append(metadata, timeline, controls, volumeControl);
	now.append(current);

	const list = document.createElement('ol');
	list.className = 'music-collection__tracks';
	list.tabIndex = 0;
	list.setAttribute('aria-label', `${work.title} track list`);
	const buttons = [];
	const equalizers = [];
	const listeners = [];
	const on = (target, type, listener) => {
		target.addEventListener(type, listener);
		listeners.push(() => target.removeEventListener(type, listener));
	};
	for (const [index, track] of tracks.entries()) {
		const item = document.createElement('li');
		const button = document.createElement('button');
		button.type = 'button';
		button.dataset.musicCollectionTrack = '';
		button.dataset.musicCollectionTrackIndex = String(index);
		button.setAttribute('aria-current', 'false');
		button.setAttribute('aria-label', `Play track ${index + 1}: ${track.title}`);
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
		item.append(button);
		list.append(item);
		buttons.push(button);
		equalizers.push(equalizer);
	}
	const liveRegion = document.createElement('p');
	liveRegion.className = 'music-collection__status screen-reader-text';
	if (announceStatus) {
		liveRegion.setAttribute('role', 'status');
		liveRegion.setAttribute('aria-live', 'polite');
		liveRegion.setAttribute('aria-atomic', 'true');
	}
	module.append(heading, now, list, liveRegion);

	let selectedIndex = 0;
	let destroyed = false;
	let lastScrolledIndex = -1;
	let lastSnapshot = null;
	let wasPlaying = false;
	let lastNonZeroVolume = Math.max(0.01, clampVolume(Number.parseFloat(volume.value), 1) || 1);
	const ownsQueue = (snapshot) => queuesMatch(snapshot?.queue, tracks);
	const requestPlayback = (operation) => {
		try { void Promise.resolve(operation()).catch(() => {}); } catch { /* Player owns error status. */ }
	};

	function render(snapshot = {}) {
		if (destroyed) return;
		lastSnapshot = snapshot;
		const ownsActiveQueue = ownsQueue(snapshot);
		const activeIndex = ownsActiveQueue && Number.isInteger(snapshot.activeIndex)
			&& snapshot.activeIndex >= 0 && snapshot.activeIndex < tracks.length ? snapshot.activeIndex : -1;
		if (activeIndex >= 0) selectedIndex = activeIndex;
		const selectedTrack = tracks[selectedIndex] ?? tracks[0];
		const playing = activeIndex >= 0 && snapshot.playing === true;
		const duration = activeIndex >= 0 && Number.isFinite(snapshot.duration) ? Math.max(0, snapshot.duration) : 0;
		const elapsed = activeIndex >= 0 && Number.isFinite(snapshot.currentTime)
			? Math.max(0, duration > 0 ? Math.min(snapshot.currentTime, duration) : snapshot.currentTime) : 0;
		const storedVolume = typeof player.getVolumeForQueue === 'function' ? player.getVolumeForQueue(tracks) : 1;
		const nextVolume = ownsActiveQueue ? clampVolume(snapshot.volume, storedVolume) : clampVolume(storedVolume);
		currentTitle.textContent = selectedTrack.title;
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
		if (document.activeElement !== seek) seek.value = String(elapsed);
		time.textContent = `${formatTime(elapsed)} / ${formatTime(duration)}`;
		syncVolumeUi(nextVolume);
		if (announceStatus && playing && !wasPlaying) liveRegion.textContent = `Now playing: ${selectedTrack.title}`;
		else if (announceStatus && !playing && wasPlaying) liveRegion.textContent = `Paused: ${selectedTrack.title}`;
		wasPlaying = playing;

		if (activeIndex < 0 || activeIndex === lastScrolledIndex || !module.isConnected) return;
		lastScrolledIndex = activeIndex;
		const row = buttons[activeIndex]?.closest('li');
		if (!(row instanceof HTMLElement) || row.parentElement !== list) return;
		const rowRect = row.getBoundingClientRect();
		const listRect = list.getBoundingClientRect();
		if (rowRect.top < listRect.top) list.scrollTop -= Math.ceil(listRect.top - rowRect.top) + 1;
		else if (rowRect.bottom > listRect.bottom) list.scrollTop += Math.ceil(rowRect.bottom - listRect.bottom) + 1;
	}

	function syncVolumeUi(value) {
		const nextVolume = clampVolume(value);
		const isMuted = nextVolume <= 0;
		if (!isMuted) lastNonZeroVolume = nextVolume;
		if (document.activeElement !== volume) volume.value = String(nextVolume);
		volumeToggle.button.dataset.muted = String(isMuted);
		volumeToggle.button.setAttribute('aria-pressed', String(isMuted));
		volumeToggle.button.setAttribute('aria-label', `${isMuted ? 'Restore volume for' : 'Mute'} ${work.title}`);
		volumeToggle.waves.toggleAttribute('hidden', isMuted);
		volumeToggle.muted.toggleAttribute('hidden', !isMuted);
	}

	function writeVolume(value) {
		const nextVolume = clampVolume(value);
		if (nextVolume > 0) lastNonZeroVolume = nextVolume;
		volume.value = String(nextVolume);
		syncVolumeUi(nextVolume);
		if (typeof player.setVolumeForQueue === 'function') player.setVolumeForQueue(tracks, nextVolume);
		else if (ownsQueue(player.getState())) player.setVolume(nextVolume);
	}

	const startLocalSelection = (index) => {
		selectedIndex = (index + tracks.length) % tracks.length;
		render(lastSnapshot ?? player.getState());
		requestPlayback(() => player.playQueue(tracks, selectedIndex));
	};
	on(previousButton, 'click', () => ownsQueue(player.getState())
		? requestPlayback(() => player.previous()) : startLocalSelection(selectedIndex - 1));
	on(playButton, 'click', () => ownsQueue(player.getState())
		? requestPlayback(() => player.toggle()) : startLocalSelection(selectedIndex));
	on(nextButton, 'click', () => ownsQueue(player.getState())
		? requestPlayback(() => player.next()) : startLocalSelection(selectedIndex + 1));
	on(seek, 'input', () => {
		if (!ownsQueue(player.getState())) return;
		const seconds = Number.parseFloat(seek.value);
		if (Number.isFinite(seconds)) player.seekTo(seconds);
	});
	on(volume, 'input', () => {
		const value = Number.parseFloat(volume.value);
		if (!Number.isFinite(value)) return;
		writeVolume(value);
	});
	on(volumeToggle.button, 'click', () => {
		const currentVolume = clampVolume(Number.parseFloat(volume.value));
		writeVolume(currentVolume > 0 ? 0 : lastNonZeroVolume);
	});
	buttons.forEach((button, index) => on(button, 'click', () => {
		selectedIndex = index;
		requestPlayback(() => player.playQueue(tracks, index));
	}));

	const unsubscribe = player.subscribe(render);
	render(player.getState());
	return {
		root: module,
		mount() { render(player.getState()); },
		destroy() {
			if (destroyed) return;
			destroyed = true;
			if (typeof unsubscribe === 'function') unsubscribe();
			listeners.splice(0).forEach((remove) => remove());
		},
	};
}
