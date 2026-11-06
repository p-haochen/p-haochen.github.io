/*
 * Tab icon T (docs/prototypes/site-icon, candidate T): the engine is shared with the prototype
 * (docs/prototypes/site-icon/hao-engine.js); the site wiring follows it.
 */
/*
 * T · 波形 HΛO — the tab icon as a living signal.
 *
 * One line, always moving like the scanning wave (L): it flows as a waveform and,
 * without ever stopping, bends into three designed letterforms and back:
 *   H  two stems joined by a flowing sine "carrier" instead of a flat bar
 *   Λ  the brand's Λ, a plucked string that keeps ringing
 *   O  a polar wave: a ring whose radius oscillates around the circle
 * Every shape is resampled to the same number of points, and each one moves on its
 * own, so the morphs are continuous rather than a swap of pictures.
 *
 * Events it answers:
 *   play     the tile lights up: an ember ring and glow pulse on every beat, the
 *            line swells with the music's level, letters punch in on the beat
 *   pause    the motion rings down like a string left alone
 *   click    a pluck: a ripple runs along the line and fades
 *   page     channel switch: the line collapses to a flat trace, a scan bar sweeps,
 *            it draws itself back in and briefly shows the page's own glyph
 *   scroll   scrubs the wave: it runs with the scroll speed
 *   return   coming back to the tab: the line draws in and spells H Λ O quickly
 *   idle     after 20 s without input it slows to a quiet breathing trace
 */
(() => {
	'use strict';
	const N = 120;
	const BG = '#0b0c0f', INK = [240, 238, 232], EMBER = [237, 102, 28];
	const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
	const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
	const smooth = (k) => k * k * (3 - 2 * k);
	const mix = (a, b, k) => a + (b - a) * k;
	const rgb = (c, a = 1) => `rgb(${c[0] | 0} ${c[1] | 0} ${c[2] | 0} / ${a})`;

	function resample(pts, n = N) {
		const seg = []; let total = 0;
		for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
		const out = [];
		for (let k = 0; k < n; k++) {
			let d = total * k / (n - 1), i = 0;
			while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i += 1; }
			const r = seg[i] ? Math.min(1, d / seg[i]) : 0;
			out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r]);
		}
		return out;
	}

	/* ---------- shapes: each a function of time, so letters keep moving too ---------- */
	const wave = (t, amp) => Array.from({ length: N }, (_, s) => { const u = s / (N - 1); return [8 + u * 48, 32 - amp * (Math.sin(u * Math.PI * 3 - t * 4.2) * 0.8 + Math.sin(u * Math.PI * 7.5 - t * 6.1) * 0.2)]; });
	function letterH(t) {
		const carrier = [];
		for (let s = 0; s <= 24; s++) { const u = s / 24; carrier.push([16 + u * 32, 33 - 3.4 * Math.sin(u * Math.PI * 3 - t * 4.2) * Math.sin(Math.PI * u)]); }
		// stems are slightly flared at the ends, like a tuning fork
		return resample([[13, 50], [16, 46], [16, 15], [13, 13], [16, 15], [16, 33], ...carrier, [48, 33], [48, 15], [51, 13], [48, 15], [48, 46], [51, 50]]);
	}
	function letterL(t) {
		// the brand Λ: a plucked string that keeps ringing (with an ember overshoot at the apex)
		const pts = [];
		for (let s = 0; s < N; s++) {
			const u = s / (N - 1), peak = 1 - Math.abs(u * 2 - 1);
			const ring = 0.06 * Math.sin(u * Math.PI * 6 - t * 9) * Math.sin(Math.PI * u);
			const swing = 1 - 0.12 * (0.5 - 0.5 * Math.cos(t * 5));
			pts.push([11 + u * 42, 50 - 36 * (peak * swing + ring)]);
		}
		return pts;
	}
	function letterO(t) {
		// a polar wave: a ring whose radius oscillates, slowly turning
		return Array.from({ length: N }, (_, s) => { const a = Math.PI - (s / (N - 1)) * Math.PI * 2; const r = 16.5 + 1.3 * Math.sin(5 * a - t * 3.2) + 0.45 * Math.sin(11 * a + t * 5); return [32 + r * Math.cos(a), 32 - r * Math.sin(a)]; });
	}
	// page glyphs shown briefly after a page switch
	const pageGlyph = {
		WORKS: (t) => resample([[13, 13], [29, 13], [29, 29], [13, 29], [13, 13], [13, 31], [13, 35], [29, 35], [29, 51], [13, 51], [13, 35], [31, 35], [35, 35], [51, 35], [51, 51], [35, 51], [35, 35], [35, 31], [35, 29], [35, 13], [51, 13], [51, 29], [35, 29]].map(([x, y]) => [x, y + Math.sin(t * 6 + x * 0.2) * 0.5])),
		CV: (t) => resample([[8, 40], [20, 40], [20, 26], [32, 26], [32, 34], [44, 34], [44, 22], [56, 22]].map(([x, y]) => [x, y + Math.sin(t * 5 + x * 0.3) * 0.8])),
		CONTACT: (t) => Array.from({ length: N }, (_, s) => { const u = s / (N - 1); return [8 + u * 48, 32 - 10 * Math.exp(-((u - 0.5) ** 2) / 0.02) * Math.sin(u * Math.PI * 14 - t * 8)]; }),
	};

	// the loop of shapes: wave → H → wave → Λ → wave → O → (wave …)
	const LOOP = ['wave', 'H', 'wave', 'L', 'wave', 'O'];
	const isLetter = (key) => key === 'H' || key === 'L' || key === 'O';

	/* ---------- state ---------- */
	const S = {
		t: 0, last: performance.now(), speed: 1, cycle: 0,
		playing: false, energy: 0, ringDown: 0, beat: 0, beatAt: 0, level: 0,
		plucks: [], page: null, pageAt: -10, wakeAt: -10, scrollV: 0, lastInput: performance.now(), sleep: 0,
		listeners: new Set(),
	};
	const log = (name) => S.listeners.forEach((fn) => fn(name));

	function shapeOf(key, t, amp) {
		if (key === 'H') return letterH(t);
		if (key === 'L') return letterL(t);
		if (key === 'O') return letterO(t);
		return wave(t, amp);
	}

	function step(now) {
		const dt = Math.min(0.1, (now - S.last) / 1000); S.last = now;
		const idle = (now - S.lastInput) / 1000;
		S.sleep = mix(S.sleep, idle > 20 && !S.playing ? 1 : 0, dt * 1.5);
		S.energy = mix(S.energy, S.playing ? 1 : 0, dt * (S.playing ? 3 : 1.2));
		S.ringDown = Math.max(0, S.ringDown - dt * 0.6);
		S.scrollV *= Math.pow(0.02, dt);
		S.speed = (1 - S.sleep * 0.75) * (1 + S.energy * 0.6) + clamp(S.scrollV, -6, 6);
		S.t += dt * S.speed;
		S.cycle += dt * (0.62 - S.sleep * 0.4) * (1 + S.energy * 0.5);
		// simulated music: a kick on every half second, the level follows a slow phrase
		if (S.playing) {
			const beatLen = 0.5;
			if ((now - S.beatAt) / 1000 >= beatLen) { S.beatAt = now; S.beat = 1; }
			S.level = 0.55 + 0.35 * Math.sin(now / 1000 * 1.3) * Math.sin(now / 1000 * 0.37);
		}
		S.beat *= Math.pow(0.0008, dt);
		S.plucks = S.plucks.filter((p) => now - p.at < 1600);
	}

	function frame(now = performance.now()) {
		step(now);
		const t = S.t;
		// continuous morph through the loop: every shape holds briefly but never stands still
		const pos = S.cycle % LOOP.length, i = Math.floor(pos), k = pos - i;
		const e = smooth(clamp((k - 0.2) / 0.6, 0, 1));
		let a = LOOP[i], b = LOOP[(i + 1) % LOOP.length];
		// coming back to the tab: spell H Λ O quickly
		const wake = (now - S.wakeAt) / 1000;
		let wakeE = null;
		if (wake >= 0 && wake < 1.6) { const seq = ['wave', 'H', 'L', 'O', 'wave']; const p = wake / 1.6 * (seq.length - 1); const j = Math.floor(p); a = seq[j]; b = seq[j + 1]; wakeE = smooth(p - j); }
		const blend = wakeE ?? e;
		const amp = (11 - S.sleep * 8) * (1 + S.energy * (0.25 + 0.55 * S.level) + S.beat * 0.5 * S.energy) + Math.abs(S.scrollV) * 0.6;
		const A = shapeOf(a, t, amp), B = shapeOf(b, t, amp);
		let pts = A.map((p, n) => [mix(p[0], B[n][0], blend), mix(p[1], B[n][1], blend)]);
		let letterW = mix(isLetter(a) ? 1 : 0, isLetter(b) ? 1 : 0, blend);

		// page switch: collapse to a flat trace, sweep a scan bar, draw back in through the page glyph
		const ps = (now - S.pageAt) / 1000;
		let scanX = null, drawTo = 1, flat = 0;
		if (ps >= 0 && ps < 1.7) {
			if (ps < 0.18) flat = smooth(ps / 0.18);
			else if (ps < 0.5) { flat = 1; scanX = 8 + (ps - 0.18) / 0.32 * 48; }
			else { flat = 1 - smooth(clamp((ps - 0.5) / 0.25, 0, 1)); drawTo = clamp((ps - 0.5) / 0.35, 0, 1); }
			if (ps > 0.5 && ps < 1.5 && S.page && pageGlyph[S.page]) {
				const g = pageGlyph[S.page](t), gk = ps < 1.25 ? 1 : 1 - smooth((ps - 1.25) / 0.25);
				pts = pts.map((p, n) => [mix(p[0], g[n][0], gk), mix(p[1], g[n][1], gk)]);
				letterW = mix(letterW, 1, gk);
			}
			pts = pts.map(([x, y]) => [x, mix(y, 32, flat)]);
		}
		// letters punch in on the beat while music plays
		if (S.energy > 0.01 && letterW > 0) { const sc = 1 + 0.08 * S.beat * S.energy * letterW; pts = pts.map(([x, y]) => [32 + (x - 32) * sc, 32 + (y - 32) * sc]); }
		// plucks (clicks) run along the line
		if (S.plucks.length) pts = pts.map(([x, y], n) => { const u = n / (N - 1); let d = 0; for (const p of S.plucks) { const age = (now - p.at) / 1000; d += 7 * Math.exp(-age * 3.2) * Math.sin(u * Math.PI * 9 - age * 26 + p.seed) * Math.exp(-((u - p.u) ** 2) / (0.02 + age * 0.4)); } return [x, y + d]; });
		// pause: the last swing rings down
		if (S.ringDown > 0) pts = pts.map(([x, y], n) => [x, y + 6 * S.ringDown * Math.sin((n / (N - 1)) * Math.PI * 2 + t * 10) * Math.sin(Math.PI * n / (N - 1))]);

		const cut = Math.max(2, Math.round(drawTo * N));
		let d = '';
		for (let n = 0; n < cut; n++) d += `${n ? 'L' : 'M'}${pts[n][0].toFixed(2)} ${pts[n][1].toFixed(2)}`;
		const color = [mix(EMBER[0], INK[0], letterW), mix(EMBER[1], INK[1], letterW), mix(EMBER[2], INK[2], letterW)];
		return { d, color, letterW, energy: S.energy, beat: S.beat, scanX, sleep: S.sleep };
	}

	// Several surfaces (preview, tab icon, cards) ask for the same moment: render it once per ~frame.
	let cachedAt = -1, cached = '';
	function svg() {
		const now = performance.now();
		if (now - cachedAt < 12) return cached;
		cachedAt = now;
		cached = render(now);
		return cached;
	}

	function render(now) {
		const f = frame(now);
		const glow = f.energy > 0.02 ? `<path d="${f.d}" fill="none" stroke="${rgb(EMBER, (0.25 + 0.45 * f.beat) * f.energy)}" stroke-width="${(9 + 6 * f.beat).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"/>` : '';
		const ring = f.energy > 0.02 ? `<rect x="2" y="2" width="60" height="60" rx="12.5" fill="none" stroke="${rgb(EMBER, (0.3 + 0.7 * f.beat) * f.energy)}" stroke-width="${(2.5 + 2 * f.beat).toFixed(1)}"/>` : '';
		const fill = f.energy > 0.02 ? `<rect width="64" height="64" rx="14" fill="${rgb([60, 22, 6], 0.55 * f.beat * f.energy)}"/>` : '';
		const scan = f.scanX != null ? `<rect x="${(f.scanX - 1.5).toFixed(1)}" y="8" width="3" height="48" fill="${rgb(INK, 0.95)}"/><rect x="${(f.scanX - 9).toFixed(1)}" y="8" width="8" height="48" fill="${rgb(EMBER, 0.25)}"/>` : '';
		const width = (4.2 + 0.8 * f.letterW + 1.2 * f.beat * f.energy).toFixed(2);
		return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${BG}"/>${fill}${ring}${glow}<path d="${f.d}" fill="none" stroke="${rgb(f.color, 1 - f.sleep * 0.35)}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>${scan}</svg>`;
	}

	// A still frame for the PNG / SVG fallbacks (Safari, reduced motion, no script): the Λ, formed.
	function staticSvg(key = 'L', square = false) {
		// a clean, still Λ (no ringing): the brand peak
		const pts = key === 'L' ? resample([[11, 50], [32, 14], [53, 50]]) : shapeOf(key, 0, 11);
		let d = '';
		pts.forEach(([x, y], n) => { d += `${n ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`; });
		return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${square ? 0 : 14}" fill="${BG}"/><path d="${d}" fill="none" stroke="${rgb(INK)}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="32" cy="${(pts[Math.floor(N / 2)][1] - 0.5).toFixed(2)}" r="2.6" fill="${rgb(EMBER)}"/></svg>`;
	}

	/* ---------- events ---------- */
	const touch = () => { S.lastInput = performance.now(); };
	const api = {
		svg,
		staticSvg,
		frame,
		on(fn) { S.listeners.add(fn); return () => S.listeners.delete(fn); },
		setPlaying(on) {
			if (on === S.playing) return; touch();
			S.playing = on;
			if (!on) S.ringDown = 1;
			log(on ? '播放音樂：外框與光暈跟著節拍亮起、線條隨音量起伏' : '暫停：最後一下擺動慢慢停下');
		},
		get playing() { return S.playing; },
		pluck(u = 0.5) { touch(); S.plucks.push({ at: performance.now(), u, seed: Math.random() * 6 }); log('點擊：一道波紋沿著線跑過'); },
		page(name) { touch(); S.page = name; S.pageAt = performance.now(); log(`切換頁面 → ${name}：關台、掃描、重新畫出並短暫顯示頁面符號`); },
		scroll(dy) { touch(); S.scrollV += clamp(dy / 160, -2, 2); },
		wake() { touch(); S.wakeAt = performance.now(); log('回到分頁：線條重新畫入並快速拼出 H Λ O'); },
		input: touch,
		reduceMotion: reduce,
	};
	window.HAO_ENGINE = api;
})();

/*
 * Site wiring: drive the browser tab icon from the engine above and feed it the site's events.
 * Without script, under reduced motion, or in browsers that ignore icon updates (Safari),
 * the still T icons printed in <head> stay.
 */
(() => {
	'use strict';
	const E = window.HAO_ENGINE;
	if (!E || E.reduceMotion.matches) return;

	// One live icon link; the static ones stay as the fallback until the first frame is drawn.
	const live = document.createElement('link');
	live.rel = 'icon';
	live.type = 'image/svg+xml';
	live.id = 'portfolio-live-icon';
	let started = false;
	const draw = () => {
		if (document.hidden) return;
		live.href = `data:image/svg+xml,${encodeURIComponent(E.svg())}`;
		if (!started) {
			started = true;
			document.querySelectorAll('link[rel~="icon"]').forEach((link) => { if (link !== live) link.remove(); });
			document.head.append(live);
		}
	};
	window.setInterval(draw, 100);
	draw();

	// play / pause: the pop-up player marks itself .is-playing
	const watchPlayer = () => {
		const capsule = document.querySelector('[data-music-capsule]');
		if (!(capsule instanceof HTMLElement)) return false;
		const sync = () => E.setPlaying(capsule.classList.contains('is-playing') && !capsule.hidden);
		new MutationObserver(sync).observe(capsule, { attributes: true, attributeFilter: ['class', 'hidden'] });
		sync();
		return true;
	};
	if (!watchPlayer()) document.addEventListener('DOMContentLoaded', watchPlayer, { once: true });

	// page switch: the Portal moves aria-current="page" between the header links
	const header = document.querySelector('#photo-draft-site-header, .site-header');
	if (header) {
		const current = () => header.querySelector('[aria-current="page"]')?.textContent?.trim().toUpperCase() ?? '';
		let last = current();
		new MutationObserver(() => {
			const now = current();
			if (now && now !== last) E.page(now.split(/\s+/)[0]);
			last = now;
		}).observe(header, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
	}

	// click: a pluck where the pointer went down
	document.addEventListener('pointerdown', (event) => E.pluck(Math.min(1, Math.max(0, event.clientX / Math.max(1, window.innerWidth)))), { passive: true });

	// scroll (the window or the Portal's own scroller): the wave runs with it
	const positions = new WeakMap();
	document.addEventListener('scroll', (event) => {
		const target = event.target === document ? document.scrollingElement : event.target;
		if (!(target instanceof Element)) return;
		const top = target.scrollTop;
		const before = positions.get(target);
		positions.set(target, top);
		if (before != null) E.scroll((top - before) * 0.5);
	}, { capture: true, passive: true });

	// coming back to the tab, and first arrival
	document.addEventListener('visibilitychange', () => { if (!document.hidden) E.wake(); });
	E.wake();

	// any input keeps it awake
	['pointermove', 'keydown', 'touchstart', 'wheel'].forEach((type) => window.addEventListener(type, () => E.input(), { passive: true }));
})();
