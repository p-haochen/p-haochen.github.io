/*
 * MUSIC COLLECTIONS (Portal MUSIC view), three styles the visitor can switch:
 *
 *   CRATE  唱片櫃   records stand on a shelf; pick one onto the deck below, which
 *                    lists its tracks; the record spins while it plays.
 *   LINER  節目單   every release printed like the back of a CD: all tracks, dotted
 *                    leaders to each length.
 *   TABLE  曲目總表 every track in one table, sortable, searchable, filterable by release.
 *
 * Accepted candidates B, F and G of docs/prototypes/music-collections. All playback
 * goes through the shared pop-up player; the chosen style is remembered.
 */
import { isPlaylistPlayer, playlistTracksForWork } from './playlist-component-01.js';

// v2: LINER became the default (2026-11-06); earlier saved choices start from LINER again.
const STYLE_KEY = 'portfolio:music-collections-style-v2';
const STYLES = [
	{ key: 'crate', label: 'CRATE', name: '唱片櫃', icon: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="1.5" y="3" width="7" height="10" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="11" cy="8" r="3.6" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="11" cy="8" r=".9" fill="currentColor"/></svg>' },
	{ key: 'liner', label: 'LINER', name: '節目單', icon: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 3.5h5M2 8h5M2 12.5h5" stroke="currentColor" stroke-width="1.2"/><path d="M8.5 3.5h3.5M8.5 8h3.5M8.5 12.5h3.5" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1 1.6"/><path d="M13.5 3.5h.5M13.5 8h.5M13.5 12.5h.5" stroke="currentColor" stroke-width="1.2"/></svg>' },
	{ key: 'table', label: 'TABLE', name: '曲目總表', icon: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="1.5" y="2.5" width="13" height="11" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1.5 6h13M1.5 9.5h13M5.5 2.5v11" stroke="currentColor" stroke-width="1"/></svg>' },
];
const PLAY = '<svg class="music-collections__icon-play" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>';
const PAUSE = '<svg class="music-collections__icon-pause" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor"/></svg>';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const el = (tag, className, text) => {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text != null) node.textContent = text;
	return node;
};

function formatTime(seconds) {
	const value = Math.max(0, Math.floor(Number(seconds) || 0));
	const hours = Math.floor(value / 3600);
	const minutes = Math.floor((value % 3600) / 60);
	const rest = String(value % 60).padStart(2, '0');
	return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

function readStyle() {
	try {
		const stored = window.localStorage.getItem(STYLE_KEY);
		return STYLES.some((style) => style.key === stored) ? stored : 'liner';
	} catch {
		return 'liner';
	}
}

function writeStyle(key) {
	try { window.localStorage.setItem(STYLE_KEY, key); } catch { /* private mode */ }
}

function sameTrack(a, b) {
	return Boolean(a && b) && a.src === b.src && (Number(a.workId) || 0) === (Number(b.workId) || 0);
}

function coverImage(work, className = '') {
	const image = el('img', className);
	image.alt = '';
	image.loading = 'lazy';
	image.decoding = 'async';
	if (work.cover?.src) image.src = work.cover.src;
	return image;
}

// The Portal opens Work links found inside a .wp-block-post post-{id} element as a panel.
function workLink(release, className = '') {
	const link = el('a', className, release.work.title);
	if (release.work.canonical_url) link.href = release.work.canonical_url;
	return link;
}

function markWork(node, release) {
	node.classList.add('wp-block-post', `post-${release.work.id}`);
	node.dataset.workTitle = release.work.title;
}

function createWave(peaks) {
	const box = el('span', 'music-collections__wave');
	box.setAttribute('aria-hidden', 'true');
	if (!Array.isArray(peaks) || peaks.length === 0) return { box, draw() {} };
	const rest = el('canvas');
	const played = el('canvas', 'music-collections__wave-played');
	box.append(rest, played);
	return {
		box,
		draw() {
			const width = box.clientWidth;
			const height = box.clientHeight;
			if (!width || !height) return;
			const ratio = Math.min(2, window.devicePixelRatio || 1);
			[[rest, 'rgb(240 238 232 / 32%)'], [played, '#ed661c']].forEach(([canvas, color]) => {
				canvas.width = Math.round(width * ratio);
				canvas.height = Math.round(height * ratio);
				const context = canvas.getContext('2d');
				if (!context) return;
				context.setTransform(ratio, 0, 0, ratio, 0, 0);
				context.fillStyle = color;
				const count = Math.max(4, Math.floor(width / 3));
				for (let index = 0; index < count; index += 1) {
					const start = Math.floor(index * peaks.length / count);
					const end = Math.max(start + 1, Math.floor((index + 1) * peaks.length / count));
					let peak = 0;
					for (let cursor = start; cursor < end; cursor += 1) peak = Math.max(peak, peaks[cursor] ?? 0);
					const bar = Math.max(1, (peak / 99) * (height / 2 - 1));
					context.fillRect(index * 3, height / 2 - bar, 2, bar * 2);
				}
			});
		},
	};
}

/**
 * @param {object[]} works  Public Work view records that have site audio.
 * @param {object}   player music-player-01 controller.
 * @returns {{root: HTMLElement, switcher: HTMLElement, mount(): void, destroy(): void}|null}
 */
export function createMusicCollections(works, player) {
	if (!isPlaylistPlayer(player)) return null;
	const releases = works
		.map((work) => ({ work, tracks: playlistTracksForWork(work) }))
		.filter((release) => release.tracks.length > 0)
		.map((release) => ({ ...release, runtime: release.tracks.reduce((total, track) => total + (Number(track.duration) || 0), 0) }));
	if (releases.length === 0) return null;

	const root = el('div', 'music-collections');
	const stage = el('div', 'music-collections__stage');
	root.append(stage);
	const waves = new Set();
	const drawWaves = () => waves.forEach((wave) => wave.draw());
	const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(drawWaves) : null;
	resizeObserver?.observe(stage);

	let state = player.getState();
	let syncs = [];
	let teardown = [];
	const request = (operation) => {
		try { void Promise.resolve(operation()).catch(() => {}); } catch { /* the player reports its own errors */ }
	};
	// A release is "playing" when the player's current track is one of its tracks, whichever queue
	// that came from (its own, or the TABLE's cross-release order).
	const playingIn = (release, index, snapshot = state) => snapshot.activated !== false && sameTrack(snapshot.activeTrack, release.tracks[index]);
	const owns = (release, snapshot = state) => release.tracks.some((_, index) => playingIn(release, index, snapshot));
	const progress = (release, index) => {
		if (!playingIn(release, index)) return '0%';
		const total = Number(state.duration) || Number(release.tracks[index].duration) || 0;
		return `${total > 0 ? Math.min(100, (Number(state.currentTime) || 0) / total * 100).toFixed(2) : 0}%`;
	};
	const playTrack = (release, index) => {
		const snapshot = player.getState();
		if (playingIn(release, index, snapshot)) request(() => player.toggle());
		else request(() => player.playQueue(release.tracks, index));
	};
	const playRelease = (release) => {
		if (owns(release, player.getState())) request(() => player.toggle());
		else request(() => player.playQueue(release.tracks, 0));
	};
	const meta = (release) => [release.work.year, `${release.tracks.length} ${release.tracks.length === 1 ? 'TRACK' : 'TRACKS'}`, release.runtime > 0 ? formatTime(release.runtime) : ''].filter(Boolean).join(' · ');

	// One track row, shared by CRATE and LINER.
	function trackRow(release, index, { leader = false, wave = false } = {}) {
		const track = release.tracks[index];
		const button = el('button', 'music-collections__track');
		button.type = 'button';
		const stateIcon = el('span', 'music-collections__state');
		stateIcon.innerHTML = `${PLAY}<b aria-hidden="true"><i></i><i></i><i></i></b>`;
		button.append(el('span', 'music-collections__number', String(index + 1).padStart(2, '0')), stateIcon, el('span', 'music-collections__track-title', track.title));
		if (leader) button.append(el('span', 'music-collections__leader'));
		let waveform = null;
		if (wave) {
			waveform = createWave(track.peaks);
			waves.add(waveform);
			button.append(waveform.box);
		}
		button.append(el('span', 'music-collections__length', Number(track.duration) > 0 ? formatTime(track.duration) : ''));
		button.addEventListener('click', () => playTrack(release, index));
		return {
			button,
			sync() {
				const current = playingIn(release, index);
				const playing = current && state.playing === true;
				button.classList.toggle('is-current', current);
				button.classList.toggle('is-playing', playing);
				button.setAttribute('aria-pressed', String(playing));
				button.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${track.title}${track.duration ? `, ${formatTime(track.duration)}` : ''}`);
				const value = progress(release, index);
				button.style.setProperty('--track-progress', value);
				waveform?.box.style.setProperty('--track-progress', value);
			},
		};
	}

	function trackList(release, options) {
		const list = el('ol', 'music-collections__tracks');
		list.setAttribute('aria-label', `${release.work.title} tracks`);
		const rows = release.tracks.map((_, index) => {
			const row = trackRow(release, index, options);
			const item = el('li');
			item.append(row.button);
			list.append(item);
			return row;
		});
		return { list, sync: () => rows.forEach((row) => row.sync()) };
	}

	/* ---------- CRATE ---------- */
	function mountCrate() {
		const view = el('div', 'music-crate');
		const shelf = el('div', 'music-crate__shelf');
		shelf.setAttribute('role', 'listbox');
		shelf.setAttribute('aria-label', 'Releases');
		shelf.setAttribute('aria-orientation', 'horizontal');
		const deck = el('div', 'music-crate__deck');
		deck.setAttribute('aria-live', 'polite');
		let selected = releases.find((release) => owns(release)) ?? releases[0];
		let deckList = null;
		const sleeves = releases.map((release) => {
			const sleeve = el('button', 'music-crate__sleeve');
			sleeve.type = 'button';
			sleeve.setAttribute('role', 'option');
			sleeve.setAttribute('aria-label', `${release.work.title} (${release.work.year})`);
			const disc = el('span', 'music-crate__disc');
			disc.setAttribute('aria-hidden', 'true');
			if (release.work.cover?.src) disc.style.setProperty('--label', `url("${release.work.cover.src}")`);
			sleeve.append(disc, coverImage(release.work, 'music-crate__cover'), el('span', 'music-crate__tag', `${release.work.year} · ${release.work.title}`));
			sleeve.addEventListener('click', () => {
				if (selected === release) playRelease(release);
				else select(release, true);
			});
			shelf.append(sleeve);
			return { sleeve, release };
		});
		shelf.addEventListener('keydown', (event) => {
			if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
			event.preventDefault();
			const index = Math.min(releases.length - 1, Math.max(0, releases.indexOf(selected) + (event.key === 'ArrowRight' ? 1 : -1)));
			select(releases[index], true);
			sleeves[index].sleeve.focus();
		});

		function select(release, animate) {
			selected = release;
			const big = el('div', 'music-crate__big');
			const disc = el('span', 'music-crate__disc');
			disc.setAttribute('aria-hidden', 'true');
			if (release.work.cover?.src) disc.style.setProperty('--label', `url("${release.work.cover.src}")`);
			const play = el('button', 'music-crate__play');
			play.type = 'button';
			play.innerHTML = PLAY + PAUSE;
			play.addEventListener('click', () => playRelease(release));
			big.append(disc, coverImage(release.work), play);
			const info = el('div', 'music-crate__info');
			markWork(info, release);
			const title = el('h3', 'music-crate__title');
			title.append(workLink(release));
			deckList = trackList(release, { wave: true });
			info.append(el('p', 'music-crate__eyebrow', 'ON THE DECK'), title, el('p', 'music-crate__meta', meta(release)), deckList.list);
			deck.replaceChildren(big, info);
			if (animate && !reduceMotion.matches) {
				deck.classList.remove('is-swapping');
				void deck.offsetWidth;
				deck.classList.add('is-swapping');
			}
			sync();
			window.requestAnimationFrame(drawWaves);
		}

		function sync() {
			for (const { sleeve, release } of sleeves) {
				sleeve.classList.toggle('is-selected', release === selected);
				sleeve.setAttribute('aria-selected', String(release === selected));
				sleeve.classList.toggle('is-armed', owns(release));
				sleeve.classList.toggle('is-playing', owns(release) && state.playing);
			}
			const playing = owns(selected) && state.playing;
			deck.classList.toggle('is-playing', playing);
			const play = deck.querySelector('.music-crate__play');
			if (play) {
				play.classList.toggle('is-playing', playing);
				play.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${selected.work.title}`);
			}
			deckList?.sync();
		}

		view.append(shelf, deck);
		select(selected, false);
		return { view, sync };
	}

	/* ---------- LINER ---------- */
	function mountLiner() {
		const view = el('div', 'music-liner');
		const blocks = releases.map((release, index) => {
			const block = el('article', 'music-liner__block');
			markWork(block, release);
			block.style.setProperty('--block-index', String(index % 3));
			const head = el('header', 'music-liner__head');
			const cover = el('button', 'music-liner__cover');
			cover.type = 'button';
			cover.append(coverImage(release.work));
			cover.insertAdjacentHTML('beforeend', `<span class="music-liner__cover-play">${PLAY}${PAUSE}</span>`);
			cover.addEventListener('click', () => playRelease(release));
			const text = el('div');
			const title = el('h3', 'music-liner__title');
			title.append(workLink(release));
			text.append(title, el('p', 'music-liner__meta', meta(release)));
			head.append(cover, text);
			const list = trackList(release, { leader: true });
			block.append(head, list.list);
			view.append(block);
			return { block, cover, release, list };
		});
		const observer = typeof IntersectionObserver === 'function' && !reduceMotion.matches
			? new IntersectionObserver((entries) => entries.forEach((entry) => {
				if (!entry.isIntersecting) return;
				entry.target.classList.add('is-in');
				observer.unobserve(entry.target);
			}), { rootMargin: '0px 0px -6% 0px' })
			: null;
		blocks.forEach(({ block }) => (observer ? observer.observe(block) : block.classList.add('is-in')));
		teardown.push(() => observer?.disconnect());
		return {
			view,
			sync() {
				for (const { block, cover, release, list } of blocks) {
					const playing = owns(release) && state.playing;
					block.classList.toggle('is-armed', owns(release));
					cover.classList.toggle('is-playing', playing);
					cover.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${release.work.title}`);
					list.sync();
				}
			},
		};
	}

	/* ---------- TABLE ---------- */
	function mountTable() {
		const view = el('div', 'music-table');
		const all = releases.flatMap((release, releaseIndex) => release.tracks.map((track, index) => ({ release, track, index, order: releaseIndex * 1000 + index })));
		const tools = el('div', 'music-table__tools');
		const search = el('input', 'music-table__search');
		search.type = 'search';
		search.placeholder = 'Search tracks / releases';
		search.setAttribute('aria-label', 'Search tracks or releases');
		const chip = el('button', 'music-table__chip');
		chip.type = 'button';
		chip.hidden = true;
		const count = el('span', 'music-table__count');
		count.setAttribute('aria-live', 'polite');
		tools.append(search, chip, count);
		const scroll = el('div', 'music-table__scroll');
		const table = el('table', 'music-table__table');
		const head = el('thead');
		const headRow = el('tr');
		const body = el('tbody');
		const columns = [['number', '#', 'order'], ['title', 'TITLE', 'title'], ['release', 'RELEASE', 'release'], ['year', 'YEAR', 'year'], ['wave', 'WAVE', null], ['length', 'LENGTH', 'duration']];
		let sortKey = 'order';
		let direction = 1;
		let only = null;
		columns.forEach(([className, label, key]) => {
			const cell = el('th', `music-table__${className}`);
			cell.scope = 'col';
			if (key) {
				const button = el('button', null, label);
				button.type = 'button';
				button.addEventListener('click', () => {
					direction = sortKey === key ? -direction : 1;
					sortKey = key;
					render(true);
				});
				cell.append(button);
			} else {
				cell.textContent = label;
			}
			headRow.append(cell);
		});
		head.append(headRow);
		table.append(head, body);
		scroll.append(table);

		const rows = new Map();
		for (const item of all) {
			const row = el('tr', 'music-table__row');
			markWork(row, item.release);
			row.tabIndex = 0;
			row.setAttribute('aria-label', `${item.track.title}, ${item.release.work.title}`);
			const number = el('td', 'music-table__number');
			const title = el('td', 'music-table__title');
			title.append(el('b', null, item.track.title), el('small', null, item.release.work.title));
			const releaseCell = el('td', 'music-table__release');
			const filter = el('button', 'music-table__filter');
			filter.type = 'button';
			filter.setAttribute('aria-label', `Show only ${item.release.work.title}`);
			filter.append(coverImage(item.release.work), el('span', null, item.release.work.title));
			filter.addEventListener('click', (event) => {
				event.stopPropagation();
				only = item.release;
				render(true);
			});
			const open = workLink(item.release, 'music-table__open');
			open.textContent = '↗';
			open.setAttribute('aria-label', `Open ${item.release.work.title}`);
			open.addEventListener('click', (event) => event.stopPropagation());
			releaseCell.append(filter, open);
			const waveCell = el('td', 'music-table__wave');
			const wave = createWave(item.track.peaks);
			waves.add(wave);
			waveCell.append(wave.box);
			row.append(number, title, releaseCell, el('td', 'music-table__year', item.release.work.year), waveCell, el('td', 'music-table__length', Number(item.track.duration) > 0 ? formatTime(item.track.duration) : ''));
			row.addEventListener('click', () => playFromTable(item));
			row.addEventListener('keydown', (event) => {
				if (event.target !== row || (event.key !== 'Enter' && event.key !== ' ')) return;
				event.preventDefault();
				playFromTable(item);
			});
			rows.set(item, { row, number, wave });
		}
		chip.addEventListener('click', () => {
			only = null;
			render(true);
		});
		search.addEventListener('input', () => render(true));

		// TABLE plays its rows in the order shown: the queue is the visible list (after sort, search and
		// release filter), so previous / next step through the table, across releases.
		let visible = [];
		const isPlaying = (item) => state.activated !== false && sameTrack(state.activeTrack, item.track);
		function playFromTable(item) {
			if (isPlaying(item)) {
				request(() => player.toggle());
				return;
			}
			const list = visible.length > 0 ? visible : [item];
			const index = Math.max(0, list.indexOf(item));
			request(() => player.playQueue(list.map((entry) => entry.track), index));
		}

		function value(item) {
			if (sortKey === 'title') return item.track.title;
			if (sortKey === 'release') return item.release.work.title;
			if (sortKey === 'year') return Number(item.release.work.year) || 0;
			if (sortKey === 'duration') return Number(item.track.duration) || 0;
			return item.order;
		}

		function render(animate) {
			const term = search.value.trim().toLowerCase();
			visible = all.filter((item) => (!only || item.release === only)
				&& (!term || item.track.title.toLowerCase().includes(term) || item.release.work.title.toLowerCase().includes(term)));
			visible.sort((a, b) => {
				const first = value(a);
				const second = value(b);
				const compared = typeof first === 'string' ? first.localeCompare(second, 'zh-Hant') : first - second;
				return (compared || a.order - b.order) * direction;
			});
			// FLIP: rows glide from their old place to their new one.
			const before = new Map();
			if (animate && !reduceMotion.matches) rows.forEach(({ row }, item) => { if (row.isConnected) before.set(item, row.getBoundingClientRect().top); });
			body.replaceChildren(...visible.map((item, index) => {
				const entry = rows.get(item);
				entry.number.textContent = String(index + 1).padStart(2, '0');
				return entry.row;
			}));
			if (animate && !reduceMotion.matches) {
				for (const item of visible) {
					const { row } = rows.get(item);
					const top = before.get(item);
					if (top == null) {
						row.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
						continue;
					}
					const delta = top - row.getBoundingClientRect().top;
					if (Math.abs(delta) > 0.5) row.animate?.([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2, .8, .2, 1)' });
				}
			}
			headRow.querySelectorAll('th').forEach((cell, index) => {
				if (columns[index][2] === sortKey) cell.setAttribute('aria-sort', direction > 0 ? 'ascending' : 'descending');
				else cell.removeAttribute('aria-sort');
			});
			chip.hidden = !only;
			if (only) {
				chip.textContent = '';
				chip.append(el('span', null, only.work.title), el('span', 'music-table__chip-x', '✕'));
				chip.setAttribute('aria-label', `Show all releases (now only ${only.work.title})`);
			}
			count.textContent = `${visible.length} / ${all.length} TRACKS`;
			window.requestAnimationFrame(drawWaves);
		}

		view.append(tools, scroll);
		render(false);
		return {
			view,
			sync() {
				rows.forEach(({ row, wave }, item) => {
					const current = isPlaying(item);
					row.classList.toggle('is-current', current);
					row.classList.toggle('is-playing', current && state.playing === true);
					const total = Number(state.duration) || Number(item.track.duration) || 0;
					wave.box.style.setProperty('--track-progress', current && total > 0 ? `${Math.min(100, (Number(state.currentTime) || 0) / total * 100).toFixed(2)}%` : '0%');
				});
			},
		};
	}

	/* ---------- switcher ---------- */
	const MOUNTS = { crate: mountCrate, liner: mountLiner, table: mountTable };
	const switcher = el('div', 'music-collections__switch');
	switcher.setAttribute('role', 'radiogroup');
	switcher.setAttribute('aria-label', 'Collection style');
	const switchButtons = STYLES.map((style) => {
		const button = el('button', 'music-collections__switch-button');
		button.type = 'button';
		button.setAttribute('role', 'radio');
		button.dataset.collectionStyle = style.key;
		button.title = style.name;
		button.innerHTML = style.icon;
		button.append(el('span', null, style.label));
		button.addEventListener('click', () => show(style.key, true));
		button.addEventListener('keydown', (event) => {
			if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
			event.preventDefault();
			const index = (STYLES.indexOf(style) + (event.key === 'ArrowRight' ? 1 : STYLES.length - 1)) % STYLES.length;
			show(STYLES[index].key, true);
			switchButtons[index].focus();
		});
		switcher.append(button);
		return button;
	});

	let current = '';
	function show(key, animate) {
		if (key === current) return;
		current = key;
		writeStyle(key);
		teardown.splice(0).forEach((release) => release());
		waves.clear();
		const mounted = MOUNTS[key]();
		syncs = [mounted.sync];
		stage.replaceChildren(mounted.view);
		root.dataset.collectionStyle = key;
		switchButtons.forEach((button) => {
			const active = button.dataset.collectionStyle === key;
			button.setAttribute('aria-checked', String(active));
			button.tabIndex = active ? 0 : -1;
		});
		const index = STYLES.findIndex((style) => style.key === key);
		switcher.style.setProperty('--switch-index', String(index));
		if (animate && !reduceMotion.matches) {
			stage.classList.remove('is-switching');
			void stage.offsetWidth;
			stage.classList.add('is-switching');
		}
		mounted.sync();
		window.requestAnimationFrame(drawWaves);
	}

	const unsubscribe = player.subscribe((next) => {
		state = next;
		syncs.forEach((sync) => sync());
	});
	show(readStyle(), false);

	return {
		root,
		switcher,
		mount() {
			state = player.getState();
			syncs.forEach((sync) => sync());
			window.requestAnimationFrame(drawWaves);
		},
		destroy() {
			unsubscribe?.();
			resizeObserver?.disconnect();
			teardown.splice(0).forEach((release) => release());
		},
	};
}
