/*
 * Portal WORKS "signal patch" views (accepted prototype: docs/prototypes/works-signal-patch).
 *
 * COVERS: works are nodes in the current sort order, each wired to its MUSIC / LIVE / LAB
 * category node. Nodes can be dragged; only a short, still click on a cover opens the work.
 * LIST:   one row per work, resting on a string that is plucked when the pointer crosses it.
 * DSP:    opt-in, short synthesized sound effects (never the works' own audio). Off by default.
 *
 * Data, SORT, FILTER, History and the B3 reveal stay in works-multiview-01.js and
 * home-portal-panels-01.js; this module only renders a list of works and handles its gestures.
 */
const NS = 'http://www.w3.org/2000/svg';
const CATS = ['music', 'live', 'tech'];
const CAT_NAME = { music: 'MUSIC', live: 'LIVE', tech: 'LAB' };
const CAT_OP = { music: 'osc~ music', live: 'jit.matrix live', tech: 'node.script lab' };
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

const el = (tag, className, text) => {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text != null) node.textContent = text;
	return node;
};
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/* ---------- cover colour (tunes the sounds) ---------- */
const colours = new Map();
function hashUnit(id) {
	let hash = 2166136261;
	for (const char of String(id)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
	return (hash >>> 0) / 4294967295;
}
function sampleColour(work, image) {
	if (colours.has(work.id)) return colours.get(work.id);
	if (!(image instanceof HTMLImageElement) || !image.complete || !image.naturalWidth) return null;
	try {
		const canvas = document.createElement('canvas');
		canvas.width = 8; canvas.height = 8;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		context.drawImage(image, 0, 0, 8, 8);
		const data = context.getImageData(0, 0, 8, 8).data;
		let r = 0, g = 0, b = 0;
		for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
		const colour = [r / 64 / 255, g / 64 / 255, b / 64 / 255];
		colours.set(work.id, colour);
		return colour;
	} catch {
		colours.set(work.id, null);
		return null;
	}
}
function pitchOf(work) {
	const colour = colours.get(work.id);
	if (!colour) return 110 * 2 ** (hashUnit(work.id) * 1.9);
	const [r, g, b] = colour;
	const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, light = (max + min) / 2;
	let hue = 0.5;
	if (d / (max || 1) >= 0.14) {
		hue = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
	}
	return 110 * 2 ** (hue * 1.6 + light * 0.8);
}

/* ---------- sound: one shared engine, off until the visitor turns DSP on ---------- */
const SND = { on: false, ac: null, out: null, send: null, an: null, buf: null, buses: new Map(), noiseBuffer: null, last: 0, lastPluck: 0, peak: 0, listeners: new Set() };

function audioInit() {
	const AudioContextClass = window.AudioContext || window.webkitAudioContext;
	if (!AudioContextClass) return false;
	if (SND.ac) { void SND.ac.resume(); return true; }
	const ac = new AudioContextClass();
	const out = ac.createGain(), comp = ac.createDynamicsCompressor(), an = ac.createAnalyser();
	out.gain.value = 0.85; comp.threshold.value = -20; comp.ratio.value = 4; an.fftSize = 1024;
	const length = Math.round(ac.sampleRate * 2.4), impulse = ac.createBuffer(2, length, ac.sampleRate);
	for (let channel = 0; channel < 2; channel += 1) {
		const data = impulse.getChannelData(channel);
		for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3.4;
	}
	const convolver = ac.createConvolver(), wet = ac.createGain(), send = ac.createGain();
	convolver.buffer = impulse; wet.gain.value = 0.3;
	send.connect(convolver); convolver.connect(wet); wet.connect(comp); out.connect(comp); comp.connect(an); an.connect(ac.destination);
	Object.assign(SND, { ac, out, send, an, buf: new Float32Array(an.fftSize) });
	return true;
}
function noise() {
	const ac = SND.ac;
	if (!SND.noiseBuffer) {
		SND.noiseBuffer = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
		const data = SND.noiseBuffer.getChannelData(0);
		for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
	}
	const source = ac.createBufferSource();
	source.buffer = SND.noiseBuffer; source.loop = true;
	return source;
}
function busOf(cat) {
	let bus = SND.buses.get(cat);
	if (!bus) {
		const ac = SND.ac, gain = ac.createGain(), an = ac.createAnalyser(), send = ac.createGain();
		an.fftSize = 512; send.gain.value = 0.45;
		gain.connect(an); gain.connect(SND.out); gain.connect(send); send.connect(SND.send);
		bus = { gain, an, buf: new Float32Array(512) };
		SND.buses.set(cat, bus);
	}
	return bus;
}
function into(cat) {
	const node = SND.ac.createGain();
	node.connect(cat ? busOf(cat).gain : SND.out);
	return node;
}
function tone(dest, { f = 880, to = null, type = 'sine', at = 0, dur = 0.15, peak = 0.2, attack = 0.004 }) {
	const ac = SND.ac, t = ac.currentTime + at, osc = ac.createOscillator(), gain = ac.createGain();
	osc.type = type; osc.frequency.setValueAtTime(f, t);
	if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
	gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(peak, t + attack); gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	osc.connect(gain); gain.connect(dest); osc.start(t); osc.stop(t + dur + 0.02);
}
function burst(dest, { f = 3000, to = null, q = 2, at = 0, dur = 0.03, peak = 0.2, type = 'bandpass' }) {
	const ac = SND.ac, t = ac.currentTime + at, source = noise(), filter = ac.createBiquadFilter(), gain = ac.createGain();
	filter.type = type; filter.Q.value = q; filter.frequency.setValueAtTime(f, t);
	if (to) filter.frequency.exponentialRampToValueAtTime(to, t + dur);
	gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(peak, t + 0.002); gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	source.connect(filter); filter.connect(gain); gain.connect(dest); source.start(t, Math.random()); source.stop(t + dur + 0.02);
}
function crusher(dest, steps) {
	const shaper = SND.ac.createWaveShaper(), n = 512, curve = new Float32Array(n);
	for (let i = 0; i < n; i += 1) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.round(x * steps) / steps; }
	shaper.curve = curve; shaper.connect(dest);
	return shaper;
}
function cloud(dest, { n = 24, span = 0.25, lo = 800, hi = 6000, peak = 0.3, at = 0, qLo = 12, qHi = 36, dLo = 0.002, dHi = 0.009 }) {
	for (let i = 0; i < n; i += 1) {
		const u = Math.random() ** 1.7, f = lo * (hi / lo) ** Math.random();
		burst(dest, { f, q: qLo + Math.random() * (qHi - qLo), at: at + u * span, dur: dLo + Math.random() * (dHi - dLo), peak: peak * (1 - u * 0.75) * (0.5 + Math.random() * 0.5) });
	}
}
function metal(dest, { f = 98, dur = 0.8, peak = 0.1 }) {
	[[1, 1], [2.76, 0.55], [5.4, 0.3], [8.93, 0.16]].forEach(([ratio, amp]) => tone(dest, { f: f * ratio, dur: dur / Math.sqrt(ratio), peak: peak * amp, attack: 0.002 }));
	burst(dest, { f: 4200, q: 1.5, dur: 0.006, peak: peak * 2.2 });
}
function hum(dest, { at = 0, dur = 0.14, peak = 0.1 }) {
	const ac = SND.ac, t = ac.currentTime + at, filter = ac.createBiquadFilter(), gain = ac.createGain();
	filter.type = 'lowpass'; filter.frequency.value = 420; filter.Q.value = 1.2;
	gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(peak, t + 0.006); gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	filter.connect(gain); gain.connect(dest);
	[[50, 'sawtooth'], [100, 'square']].forEach(([f, type], index) => {
		const osc = ac.createOscillator(), level = ac.createGain();
		osc.type = type; osc.frequency.value = f; level.gain.value = index ? 0.25 : 1;
		osc.connect(level); level.connect(filter); osc.start(t); osc.stop(t + dur + 0.02);
	});
}
function glitch(dest, { at = 0, dur = 0.09, peak = 0.06, rate = 0.008 }) {
	const ac = SND.ac, t = ac.currentTime + at, osc = ac.createOscillator(), gain = ac.createGain();
	osc.type = 'square';
	for (let k = 0; k * rate < dur; k += 1) osc.frequency.setValueAtTime(80 * 60 ** Math.random(), t + k * rate);
	gain.gain.setValueAtTime(peak, t); gain.gain.setValueAtTime(peak, t + dur * 0.8); gain.gain.linearRampToValueAtTime(0, t + dur);
	osc.connect(crusher(gain, 6)); gain.connect(dest); osc.start(t); osc.stop(t + dur + 0.01);
}
function swell(dest, { dur = 0.18, peak = 0.22, lo = 300, hi = 3200 }) {
	const ac = SND.ac, t = ac.currentTime, source = noise(), filter = ac.createBiquadFilter(), gain = ac.createGain();
	filter.type = 'bandpass'; filter.Q.value = 3; filter.frequency.setValueAtTime(lo, t); filter.frequency.exponentialRampToValueAtTime(hi, t + dur);
	gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(peak, t + dur * 0.92); gain.gain.linearRampToValueAtTime(0, t + dur);
	source.connect(filter); filter.connect(gain); gain.connect(dest); source.start(t, Math.random()); source.stop(t + dur + 0.02);
}
const sound = {
	category(cat) {
		if (!SND.on) return;
		const dest = into(cat);
		if (cat === 'music') metal(dest, { f: 98, dur: 0.9, peak: 0.13 });
		else if (cat === 'live') { cloud(dest, { n: 34, span: 0.38, lo: 600, hi: 7000, peak: 0.5 }); tone(dest, { f: 46, to: 38, dur: 0.16, peak: 0.32 }); }
		else { glitch(dest, { dur: 0.1, peak: 0.07 }); burst(dest, { f: 5200, q: 1, at: 0.1, dur: 0.004, peak: 0.3 }); }
	},
	pickUp(cat) { if (!SND.on) return; const dest = into(cat); tone(dest, { f: 62, to: 36, dur: 0.16, peak: 0.3 }); cloud(dest, { n: 6, span: 0.08, lo: 2000, hi: 8000, peak: 0.2 }); },
	plugIn(cat) { if (!SND.on) return; const dest = into(cat); burst(dest, { f: 3800, q: 2, dur: 0.006, peak: 0.4 }); hum(dest, { at: 0.004, dur: 0.13, peak: 0.09 }); },
	detent(cat) { if (!SND.on) return; burst(into(cat), { f: 5000 + Math.random() * 3000, q: 1, dur: 0.003, peak: 0.06 + Math.random() * 0.05, type: 'highpass' }); },
	work(work) {
		if (!SND.on || !work) return;
		const now = SND.ac.currentTime;
		if (now - SND.last < 0.07) return;
		SND.last = now;
		const f = pitchOf(work), dest = into(work.cat);
		if (work.cat === 'music') {
			tone(dest, { f, dur: 0.08, peak: 0.26, attack: 0.001 });
			tone(dest, { f: f * 2.76, dur: 0.035, peak: 0.08, attack: 0.001 });
			burst(dest, { f: f * 6, q: 4, dur: 0.008, peak: 0.35 });
		} else if (work.cat === 'live') cloud(dest, { n: 9, span: 0.09, lo: f * 4, hi: f * 16, peak: 0.9, qLo: 3, qHi: 8, dLo: 0.005, dHi: 0.014 });
		else { glitch(dest, { dur: 0.035, peak: 0.07, rate: 0.006 }); burst(dest, { f: 6000, q: 1, at: 0.035, dur: 0.004, peak: 0.35 }); }
	},
	open(work) { if (!SND.on || !work) return; const dest = into(work.cat); swell(dest, { dur: 0.17, peak: 0.3 }); burst(dest, { f: 4500, q: 1.5, at: 0.17, dur: 0.005, peak: 0.35 }); },
	/* Karplus–Strong pluck. The loop filter must not resonate (Q -12) or the loop gain exceeds 1. */
	pluck(work, amp) {
		if (!SND.on || !work) return;
		const ac = SND.ac, t = ac.currentTime;
		if (t - SND.lastPluck < 0.035) return;
		SND.lastPluck = t;
		const f = clamp(pitchOf(work), 80, 320);
		const source = noise(), excite = ac.createGain(), delay = ac.createDelay(0.05), feedback = ac.createGain(), lowpass = ac.createBiquadFilter(), out = ac.createGain();
		delay.delayTime.value = 1 / f;
		feedback.gain.value = work.cat === 'tech' ? 0.88 : 0.975;
		lowpass.type = 'lowpass'; lowpass.Q.value = -12; lowpass.frequency.value = work.cat === 'live' ? 2600 : 4200;
		excite.gain.setValueAtTime(0, t); excite.gain.linearRampToValueAtTime(1, t + 0.001); excite.gain.linearRampToValueAtTime(0, t + 0.012);
		out.gain.setValueAtTime(Math.min(1.1, 0.45 + amp * 0.06), t); out.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
		source.connect(excite); excite.connect(delay); delay.connect(lowpass); lowpass.connect(feedback); feedback.connect(delay); lowpass.connect(out); out.connect(into(work.cat));
		source.start(t, Math.random()); source.stop(t + 0.015);
		window.setTimeout(() => { try { feedback.disconnect(); delay.disconnect(); lowpass.disconnect(); out.disconnect(); excite.disconnect(); } catch { /* already gone */ } }, 1800);
	},
};
function powerUp() {
	const ac = SND.ac, dest = into(null), t = ac.currentTime, osc = ac.createOscillator(), filter = ac.createBiquadFilter(), gain = ac.createGain();
	osc.type = 'sawtooth'; osc.frequency.value = 50; filter.type = 'lowpass'; filter.Q.value = 4;
	filter.frequency.setValueAtTime(90, t); filter.frequency.exponentialRampToValueAtTime(1400, t + 0.32);
	gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.14, t + 0.05); gain.gain.setValueAtTime(0.14, t + 0.28); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
	osc.connect(filter); filter.connect(gain); gain.connect(dest); osc.start(t); osc.stop(t + 0.45);
	cloud(dest, { n: 10, span: 0.3, lo: 1500, hi: 9000, peak: 0.25 });
}
function powerDown() {
	const ac = SND.ac, dest = into(null), t = ac.currentTime, osc = ac.createOscillator(), filter = ac.createBiquadFilter(), gain = ac.createGain();
	osc.type = 'sawtooth'; osc.frequency.setValueAtTime(140, t); osc.frequency.exponentialRampToValueAtTime(18, t + 0.38);
	filter.type = 'lowpass'; filter.frequency.setValueAtTime(1600, t); filter.frequency.exponentialRampToValueAtTime(120, t + 0.38);
	gain.gain.setValueAtTime(0.16, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
	osc.connect(filter); filter.connect(gain); gain.connect(dest); osc.start(t); osc.stop(t + 0.42);
}
function levelOf(analyser, buffer) {
	analyser.getFloatTimeDomainData(buffer);
	let sum = 0;
	for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
	return Math.sqrt(sum / buffer.length);
}

export function isSignalSoundOn() {
	return SND.on;
}

/** Turn the DSP on or off. Returns the resulting state (false when Web Audio is unavailable). */
export function setSignalSound(on) {
	if (on && !SND.on) {
		if (!audioInit()) return false;
		SND.on = true;
		powerUp();
	} else if (!on && SND.on) {
		powerDown();
		SND.on = false;
	}
	SND.listeners.forEach((listener) => listener(SND.on));
	return SND.on;
}

export function onSignalSoundChange(listener) {
	SND.listeners.add(listener);
	return () => SND.listeners.delete(listener);
}

/** Output level with peak hold, 0–1, for the DSP meter. */
export function signalSoundLevel() {
	const level = SND.on && SND.an ? Math.min(1, levelOf(SND.an, SND.buf) * 5) : 0;
	SND.peak = Math.max(level, SND.peak * 0.86);
	return SND.peak;
}

document.addEventListener('visibilitychange', () => {
	if (!SND.ac) return;
	if (document.hidden) void SND.ac.suspend();
	else if (SND.on) void SND.ac.resume();
});

/* ---------- category displays inside the category nodes ---------- */
function drawMusic(context, W, H, A, t, bus) {
	context.strokeStyle = 'rgba(240,238,232,.08)'; context.lineWidth = 1;
	context.beginPath(); context.moveTo(0, H / 2); context.lineTo(W, H / 2); context.stroke();
	const ys = [];
	if (bus) { bus.an.getFloatTimeDomainData(bus.buf); for (let i = 0; i <= W; i += 2) ys.push(bus.buf[Math.floor(i / W * 400)] * 2.6); }
	else for (let i = 0; i <= W; i += 2) { const u = i / W; ys.push((Math.sin(u * 6.283 * 2 + t * 3) * 0.6 + Math.sin(u * 6.283 * 3.01 - t * 2) * 0.3) * A); }
	context.beginPath();
	ys.forEach((value, i) => { const X = i * 2, Y = H / 2 - clamp(value, -1, 1) * (H / 2 - 1.5); if (i) context.lineTo(X, Y); else context.moveTo(X, Y); });
	context.strokeStyle = A > 0.5 ? '#ed661c' : 'rgba(240,238,232,.42)'; context.lineWidth = A > 0.5 ? 1.5 : 1.1;
	if (A > 0.5) { context.shadowColor = 'rgba(237,102,28,.8)'; context.shadowBlur = 6; }
	context.stroke(); context.shadowBlur = 0;
}
function drawLive(context, W, H, A, t, bus, led) {
	const P = 4, cols = Math.floor(W / P), rows = Math.floor(H / P), ox = (W - cols * P) / 2 + P / 2, oy = (H - rows * P) / 2 + P / 2;
	const level = bus ? Math.min(1, levelOf(bus.an, bus.buf) * 6) : 0;
	if (A > 0.5 && t - led.lastBeat > (bus ? 0.45 : 0.62)) { led.lastBeat = t; led.beat = 1; }
	led.beat *= 0.86;
	const cx = cols * (0.5 + 0.38 * Math.sin(t * 0.9)), sweep = (t * 0.55) % 1.4 - 0.2;
	for (let j = 0; j < rows; j += 1) for (let i = 0; i < cols; i += 1) {
		const u = i / cols, v = j / rows;
		const beam = Math.exp(-(((u - sweep) * 7) ** 2)) * 0.9;
		const wash = 0.5 + 0.5 * Math.sin(u * 9 - t * 2.2 + Math.sin(v * 3 + t) * 1.5);
		const ring = Math.exp(-((Math.hypot(i - cx, (j - rows / 2) * 1.6) - (1 - led.beat) * 22) ** 2) / 6) * led.beat;
		const b = Math.min(1, (0.2 + 0.62 * wash * wash + beam + ring * 1.2) * A + 0.06 + level * 0.5 * wash);
		context.fillStyle = beam + ring > 0.35
			? `rgba(255,${Math.round(205 + 40 * b)},${Math.round(170 + 70 * b)},${b})`
			: `rgba(255,${Math.round(48 + 110 * wash)},${Math.round(24 + 20 * wash)},${b})`;
		context.beginPath(); context.arc(ox + i * P, oy + j * P, P * 0.36, 0, 6.283); context.fill();
	}
}
function drawLab(context, W, H, A, t, bus, automaton) {
	const P = 3, cols = Math.floor(W / P), rows = Math.floor(H / P), ox = (W - cols * P) / 2;
	const every = bus ? 0.125 : A > 0.5 ? 0.16 : 0.7;
	if (t - automaton.last > every || automaton.cols !== cols) {
		automaton.last = t;
		if (automaton.cols !== cols || !automaton.rows.length) { automaton.cols = cols; automaton.rows = [Array.from({ length: cols }, () => (Math.random() < 0.3 ? 1 : 0))]; }
		const r0 = automaton.rows.at(-1);
		const r1 = r0.map((_, i) => (110 >> (r0[(i - 1 + cols) % cols] << 2 | r0[i] << 1 | r0[(i + 1) % cols]) & 1));
		if (!r1.some(Boolean) || r1.every(Boolean)) r1.forEach((_, i) => { r1[i] = Math.random() < 0.3 ? 1 : 0; });
		automaton.rows.push(r1);
		if (automaton.rows.length > 12) automaton.rows.shift();
	}
	const shown = automaton.rows.slice(-rows);
	shown.forEach((row, j) => {
		const newest = j === shown.length - 1, age = (shown.length - 1 - j) / Math.max(1, rows - 1);
		row.forEach((on, i) => {
			if (!on) return;
			context.fillStyle = newest && A > 0.5 ? '#ed661c' : `rgba(240,238,232,${((1 - age * 0.75) * (A > 0.5 ? 0.85 : 0.38)).toFixed(3)})`;
			context.fillRect(ox + i * P, (rows - shown.length + j) * P + (H - rows * P) / 2, P - 1, P - 1);
		});
	});
	if (A > 0.5 && Math.floor(t * 2.4) % 2) { context.fillStyle = 'rgba(237,102,28,.9)'; context.fillRect(W - 4, H - 4, 3, 3); }
}

/* ---------- the view ---------- */
function normalizeWork(work, categorySlugs) {
	const cat = categorySlugs(work).find((slug) => CATS.includes(slug)) ?? 'music';
	return {
		id: work.id,
		title: String(work.title ?? ''),
		url: String(work.canonical_url ?? ''),
		year: typeof work.year === 'string' ? work.year : '',
		cat,
		catName: CAT_NAME[cat],
		roles: Array.isArray(work.roles) ? work.roles.map((role) => role?.label).filter(Boolean) : [],
		source: work,
	};
}

// Each category has its own small signal under the cover: MUSIC a level meter, LIVE a row of stage
// lights that chase, LAB a row of bits that compute. All are five <i> cells driven by CSS.
function createVu(className, cat = 'music') {
	const vu = el('span', `${className} is-${cat}`);
	vu.setAttribute('aria-hidden', 'true');
	for (let k = 0; k < 5; k += 1) { const bar = el('i'); bar.style.setProperty('--k', String(k)); vu.append(bar); }
	return vu;
}

/**
 * @param {object} options
 * @param {Array} options.works       Ordered works to show.
 * @param {string} options.view       all | music | live | tech.
 * @param {'covers'|'list'} options.display
 * @param {boolean} options.grouped   Group the list by year (NEWEST / OLDEST).
 * @param {object} options.helpers    { createArtwork, annotateWorkItem, categorySlugs } from works-multiview-01.js.
 */
export function createSignalView({ works, view, display, grouped = false, helpers }) {
	const items = works.map((work) => normalizeWork(work, helpers.categorySlugs));
	const byId = new Map(items.map((item) => [String(item.id), item]));
	const root = el('div', `works-signal works-signal--${display}`);
	root.dataset.display = display;
	const cleanups = [];
	const listen = (target, type, handler, options) => {
		target.addEventListener(type, handler, options);
		cleanups.push(() => target.removeEventListener(type, handler, options));
	};
	let destroyed = false;
	let scroller = null;
	const scrollRect = () => (scroller instanceof HTMLElement ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth });

	function workItem(item, tag, className) {
		const node = el(tag, ['wp-block-post', `post-${item.id}`, `work_category-${item.cat}`, className].join(' '));
		helpers.annotateWorkItem(node, item.source);
		node.dataset.signalCat = item.cat;
		return node;
	}
	function coverImage(node) {
		return node.querySelector('.works-card__media img');
	}

	/* ===== COVERS: node network ===== */
	const NET = { nodes: new Map(), paths: new Map(), srcs: new Map(), host: null, svg: null, list: null, vertical: false, W: 0, H: 0, srcW: 0, srcH: 0, wob: 0, t: 0, raf: 0, drag: null, sdrag: null, activeCat: null, hotCat: null, laidOut: false };
	const pulseTimers = { cat: 0, work: 0 };
	const visual = { raf: 0, last: 0, visible: true, act: { music: 0, live: 0, tech: 0 }, led: { beat: 0, lastBeat: 0 }, automaton: { rows: [], last: 0, cols: 0 } };
	const tiles = new Map();

	function buildCovers() {
		const net = el('div', 'works-net');
		const svg = document.createElementNS(NS, 'svg');
		svg.setAttribute('class', 'works-net__wires');
		svg.setAttribute('aria-hidden', 'true');
		const list = el('ul', 'works-net__list');
		list.setAttribute('aria-label', 'Works');
		for (const item of items) {
			const node = workItem(item, 'li', 'works-node');
			node.style.viewTransitionName = `work-${item.id}`;
			const link = el('a', 'works-node__link');
			link.href = item.url;
			link.setAttribute('aria-label', [item.title, item.catName, item.year].filter(Boolean).join(', '));
			link.draggable = false;
			const cap = el('span', 'works-node__cap');
			cap.setAttribute('aria-hidden', 'true');
			cap.append(el('span', 'works-node__title', item.title));
			const media = helpers.createArtwork(item.source.cover, 'works-card__media works-node__media');
			const foot = el('span', 'works-node__ft');
			foot.setAttribute('aria-hidden', 'true');
			foot.append(el('span', 'works-node__op', item.cat === 'tech' ? 'lab' : item.cat), createVu('works-node__vu', item.cat), el('span', null, item.year));
			link.append(cap, media, foot);
			const port = el('i', 'works-node__port');
			port.setAttribute('aria-hidden', 'true');
			node.append(link, port);
			list.append(node);
			tiles.set(item.id, node);
		}
		const cats = view === 'all' ? CATS : CATS.filter((cat) => cat === view);
		for (const [index, cat] of cats.entries()) {
			const count = items.filter((item) => item.cat === cat).length;
			const src = el('div', `works-net__src${count ? '' : ' is-empty'}`);
			src.dataset.cat = cat;
			src.setAttribute('aria-hidden', 'true');
			src.innerHTML = `<span class="works-net__op">${CAT_OP[cat]}</span><span class="works-net__row"><b>${CAT_NAME[cat]}</b><span class="works-net__n">${count}</span></span><canvas class="works-net__scope"></canvas><i class="works-net__port"></i>`;
			NET.srcs.set(cat, { el: src, index, x: 0, y: null, pinned: false, vy: 0 });
			net.append(src);
		}
		net.prepend(svg);
		net.append(list);
		Object.assign(NET, { host: net, svg, list });
		root.append(net);
	}

	function layoutNet(animateWires) {
		const net = NET.host;
		const W = net.clientWidth;
		if (!W) return;
		const vertical = W < 760, catCount = NET.srcs.size;
		const gx = vertical ? 12 : 26, gy = 30;
		const srcW = vertical ? Math.min(150, (W - 10 * (catCount - 1)) / Math.max(1, catCount)) : 150, srcH = vertical ? 42 : 82;
		const left = vertical ? 0 : srcW + 86, top0 = vertical ? srcH + 46 : 0, avail = W - left;
		const cols = vertical ? 2 : clamp(Math.floor((avail + gx) / (240 + gx)), 2, 5);
		const NW = (avail - gx * (cols - 1)) / cols, PH = Math.round(NW * 0.7), NH = 26 + PH + 24;
		Object.assign(NET, { vertical, W, srcW, srcH });
		NET.nodes = new Map();
		items.forEach((item, j) => {
			const c = j % cols, r = Math.floor(j / cols), x = left + c * (NW + gx), y = top0 + r * (NH + gy);
			const tile = tiles.get(item.id);
			Object.assign(tile.style, { left: `${x}px`, top: `${y}px`, width: `${NW}px` });
			tile.style.setProperty('--H', `${PH}px`);
			tile.style.setProperty('--i', String(j));
			NET.nodes.set(item.id, { tile, item, x, y, w: NW, h: NH, cat: item.cat });
		});
		const rows = Math.ceil(items.length / cols);
		NET.H = Math.max(top0 + rows * (NH + gy) - gy, vertical ? srcH : catCount * (srcH + 34));
		let index = 0;
		NET.srcs.forEach((src) => {
			src.el.style.width = `${srcW}px`;
			src.el.style.height = `${srcH}px`;
			src.x = vertical ? index * (srcW + 10) + (W - catCount * srcW - (catCount - 1) * 10) / 2 : 0;
			src.pinned = false;
			src.y = null;
			index += 1;
		});
		net.style.height = `${NET.H}px`;
		NET.svg.setAttribute('width', String(W));
		NET.svg.setAttribute('height', String(NET.H));
		placeSources(true);
		drawWires(animateWires);
		NET.laidOut = true;
	}

	function sourceTargets() {
		const out = new Map();
		if (NET.vertical) { NET.srcs.forEach((_, cat) => out.set(cat, 0)); return out; }
		const rect = NET.host.getBoundingClientRect(), clip = scrollRect();
		const n = NET.srcs.size, gap = 34, stackH = n * NET.srcH + (n - 1) * gap;
		const visTop = Math.max(rect.top, clip.top + 12), visBottom = Math.min(rect.bottom, clip.bottom - 24);
		const mid = (visTop + visBottom) / 2 - rect.top;
		const y0 = clamp(mid - stackH / 2, 0, Math.max(0, NET.H - stackH));
		NET.srcs.forEach((src, cat) => out.set(cat, y0 + src.index * (NET.srcH + gap)));
		return out;
	}
	function placeSources(snap) {
		if (!NET.host?.isConnected) return false;
		const targets = sourceTargets(), top = NET.host.getBoundingClientRect().top;
		let moving = false;
		NET.srcs.forEach((src, cat) => {
			if (src.pinned && (NET.vertical || NET.sdrag?.src === src)) {
				src.el.style.transform = `translate3d(${src.x.toFixed(1)}px, ${src.y.toFixed(1)}px, 0)`;
				return;
			}
			// A node the visitor moved keeps its place on screen; the others float in the visible middle.
			const ty = src.pinned ? clamp(src.vy - top, -40, NET.H - NET.srcH + 40) : targets.get(cat);
			if (src.y == null || snap || reduceMotion.matches) src.y = ty;
			else {
				const dv = (ty - src.y) * 0.16;
				src.y += dv;
				if (Math.abs(dv) > 2) NET.wob = Math.min(0.5, NET.wob + Math.abs(dv) * 0.006);
			}
			if (Math.abs(ty - src.y) > 0.4) moving = true; else src.y = ty;
			src.el.style.transform = `translate3d(${src.x.toFixed(1)}px, ${src.y.toFixed(1)}px, 0)`;
		});
		return moving;
	}
	function portOf(cat) {
		const src = NET.srcs.get(cat);
		if (!src) return null;
		return NET.vertical ? { x: src.x + NET.srcW / 2, y: src.y + NET.srcH } : { x: src.x + NET.srcW, y: src.y + NET.srcH / 2 };
	}
	function wirePath(node) {
		const port = portOf(node.cat);
		if (!port) return '';
		if (NET.vertical) {
			const x2 = node.x + node.w / 2, y2 = node.y, d = Math.max(30, Math.abs(y2 - port.y) * 0.5);
			return `M${port.x},${port.y} C${port.x},${port.y + d} ${x2},${y2 - d} ${x2},${y2}`;
		}
		const x2 = node.x, y2 = node.y + node.h / 2, d = Math.max(46, (x2 - port.x) * 0.5);
		const sag = Math.min(70, Math.hypot(x2 - port.x, y2 - port.y) * 0.09) * (1 + NET.wob * Math.sin(NET.t * 11 + (node.x + node.y) * 0.013));
		return `M${port.x},${port.y} C${port.x + d},${port.y + sag} ${x2 - d},${y2 + sag} ${x2},${y2}`;
	}
	function drawWires(animate) {
		NET.svg.replaceChildren();
		NET.paths = new Map();
		let k = 0;
		for (const [id, node] of NET.nodes) {
			if (!NET.srcs.has(node.cat)) continue;
			const path = document.createElementNS(NS, 'path');
			path.setAttribute('class', 'works-net__wire');
			path.setAttribute('d', wirePath(node));
			path.dataset.cat = node.cat;
			NET.svg.append(path);
			NET.paths.set(id, path);
			if (animate && !reduceMotion.matches && typeof path.animate === 'function') {
				const length = path.getTotalLength();
				path.style.strokeDasharray = `${length}`;
				path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: 900, delay: 200 + k * 35, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'backwards' })
					.finished.then(() => { path.style.strokeDasharray = ''; }).catch(() => {});
			}
			k += 1;
		}
	}
	function updateWires() {
		NET.paths.forEach((path, id) => { const node = NET.nodes.get(id); if (node) path.setAttribute('d', wirePath(node)); });
	}
	function netTick() {
		NET.raf = 0;
		if (destroyed || !NET.host?.isConnected) return;
		const moving = placeSources(false);
		NET.t = performance.now() / 1000;
		NET.wob *= 0.93;
		if (NET.wob < 0.01) NET.wob = 0;
		updateWires();
		if (moving || NET.wob) NET.raf = window.requestAnimationFrame(netTick);
	}
	const netKick = () => { if (!NET.raf && !destroyed) NET.raf = window.requestAnimationFrame(netTick); };
	function excite(amount) {
		if (reduceMotion.matches) return;
		NET.wob = Math.min(0.9, NET.wob + amount);
		netKick();
	}

	function arrive(id) {
		const node = NET.nodes.get(id);
		if (!node) return;
		node.tile.classList.remove('is-sig');
		void node.tile.offsetWidth;
		node.tile.classList.add('is-sig');
		window.clearTimeout(node.sigTimer);
		node.sigTimer = window.setTimeout(() => node.tile.classList.remove('is-sig'), 650);
	}
	function sendPulse(id) {
		const path = NET.paths.get(id);
		if (!path || !path.isConnected || destroyed) return;
		if (reduceMotion.matches || typeof path.animate !== 'function') { arrive(id); return; }
		const length = path.getTotalLength(), seg = 26, pulse = document.createElementNS(NS, 'path');
		pulse.setAttribute('class', 'works-net__pulse');
		pulse.setAttribute('d', path.getAttribute('d'));
		pulse.style.strokeDasharray = `${seg} ${length + seg * 2}`;
		NET.svg.append(pulse);
		pulse.animate([{ strokeDashoffset: seg }, { strokeDashoffset: -length }], { duration: Math.max(280, length / 1.15), easing: 'cubic-bezier(.45,0,.55,1)' })
			.finished.then(() => { pulse.remove(); arrive(id); }).catch(() => pulse.remove());
	}
	function catPulses(cat) {
		window.clearInterval(pulseTimers.cat);
		if (!cat) return;
		const fire = () => NET.paths.forEach((path, id) => { if (path.dataset.cat === cat) window.setTimeout(() => sendPulse(id), Math.random() * 160); });
		fire();
		pulseTimers.cat = window.setInterval(fire, 1300);
	}
	function workPulses(id) {
		window.clearInterval(pulseTimers.work);
		if (id == null) return;
		sendPulse(id);
		pulseTimers.work = window.setInterval(() => sendPulse(id), 900);
	}
	function hotWire(id, on) {
		const path = NET.paths.get(id);
		const node = NET.nodes.get(id);
		node?.tile.classList.toggle('is-play', on);
		if (!path) return;
		path.classList.toggle('is-hot', on);
		if (on) NET.svg.append(path);
		NET.srcs.get(path.dataset.cat)?.el.classList.toggle('is-hot', on);
		NET.hotCat = on ? path.dataset.cat : null;
		workPulses(on ? id : null);
		visKick();
	}
	function litCat(cat) {
		if (cat === NET.activeCat) return;
		NET.activeCat = cat;
		catPulses(cat);
		if (cat) sound.category(cat);
		NET.paths.forEach((path) => path.classList.toggle('is-flow', !!cat && path.dataset.cat === cat));
		NET.nodes.forEach((node) => node.tile.classList.toggle('is-lit', !!cat && node.cat === cat));
		NET.srcs.forEach((src, key) => src.el.classList.toggle('is-on', key === cat));
		visKick();
	}

	function drawScope(cat, canvas, now) {
		const W = canvas.clientWidth, H = canvas.clientHeight;
		if (!W || !H) return;
		const ratio = Math.min(window.devicePixelRatio || 1, 2);
		if (canvas.width !== Math.round(W * ratio)) { canvas.width = Math.round(W * ratio); canvas.height = Math.round(H * ratio); }
		const context = canvas.getContext('2d');
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		context.clearRect(0, 0, W, H);
		const target = NET.activeCat === cat || NET.hotCat === cat || NET.sdrag?.cat === cat ? 1 : 0.2;
		visual.act[cat] += (target - visual.act[cat]) * 0.18;
		const bus = SND.on ? SND.buses.get(cat) : null;
		const active = bus && levelOf(bus.an, bus.buf) * 6 > 0.02 ? bus : null;
		const A = Math.max(visual.act[cat], active ? 1 : 0), t = now / 1000;
		if (cat === 'music') drawMusic(context, W, H, A, t, active);
		else if (cat === 'live') drawLive(context, W, H, A, t, active, visual.led);
		else drawLab(context, W, H, A, t, active, visual.automaton);
	}
	function visLoop(now) {
		visual.raf = 0;
		if (destroyed || document.hidden || !visual.visible || !NET.host?.isConnected) return;
		if (now - visual.last >= 32) {
			visual.last = now;
			NET.srcs.forEach((src, cat) => { const canvas = src.el.querySelector('.works-net__scope'); if (canvas && canvas.offsetParent) drawScope(cat, canvas, now); });
		}
		if (!reduceMotion.matches) visual.raf = window.requestAnimationFrame(visLoop);
	}
	function visKick() {
		if (!visual.raf && !destroyed && NET.host) visual.raf = window.requestAnimationFrame(visLoop);
	}

	let hot = null;
	function enter(tile) {
		if (hot === tile) return;
		if (hot) leave(hot);
		hot = tile;
		hotWire(Number(tile.dataset.workId), true);
		const item = byId.get(tile.dataset.workId);
		sampleColour(item, coverImage(tile));
		sound.work(item);
	}
	function leave(tile) {
		if (!tile) return;
		hotWire(Number(tile.dataset.workId), false);
		if (hot === tile) hot = null;
	}

	function bindCovers() {
		const net = NET.host;
		/* Hover (fine pointers) and keyboard focus light a work and its wire. */
		listen(net, 'pointerover', (event) => {
			if (NET.drag || NET.sdrag) return;
			const src = event.target.closest?.('.works-net__src');
			litCat(src ? src.dataset.cat : null);
			if (!finePointer.matches) return;
			const tile = event.target.closest?.('.works-node');
			if (tile) enter(tile); else if (hot) leave(hot);
		});
		listen(net, 'pointerleave', () => { if (!NET.drag && !NET.sdrag) { litCat(null); if (hot) leave(hot); } });
		listen(net, 'focusin', (event) => { const tile = event.target.closest?.('.works-node'); if (tile) enter(tile); });
		listen(net, 'focusout', (event) => { if (!net.contains(event.relatedTarget) && hot) leave(hot); });

		/* Only a deliberate click on a cover opens the work: short, still and on the image.
		 * The link loses its href while pressed so nothing (the Portal included) can open it by accident. */
		const press = { tile: null, link: null, x: 0, y: 0, at: 0, moved: false, onCover: false };
		const restoreLink = (link) => { if (link && link.dataset.href && !link.hasAttribute('href')) link.setAttribute('href', link.dataset.href); };
		listen(net, 'pointerdown', (event) => {
			restoreLink(press.link);
			const tile = event.target.closest?.('.works-node');
			Object.assign(press, { tile, link: null, x: event.clientX, y: event.clientY, at: performance.now(), moved: false, onCover: !!event.target.closest?.('.works-node__media') });
			if (!tile) return;
			const link = tile.querySelector('.works-node__link');
			if (link.hasAttribute('href')) { link.dataset.href = link.getAttribute('href'); link.removeAttribute('href'); }
			press.link = link;
		}, true);
		listen(window, 'pointermove', (event) => {
			if (press.tile && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4) press.moved = true;
		}, true);
		listen(window, 'pointerup', (event) => {
			const link = press.link;
			if (!link) return;
			const ok = event.button === 0 && !press.moved && press.onCover && performance.now() - press.at < 450;
			if (ok) { restoreLink(link); sound.open(byId.get(press.tile.dataset.workId)); }
			else window.setTimeout(() => restoreLink(link), 250);
		}, true);
		listen(window, 'pointercancel', () => { const link = press.link; window.setTimeout(() => restoreLink(link), 250); }, true);
		listen(net, 'click', (event) => {
			const tile = event.target.closest?.('.works-node');
			if (!tile || event.detail === 0) return; // keyboard Enter still opens the work
			const ok = press.tile === tile && !press.moved && press.onCover && performance.now() - press.at < 450;
			if (!ok) { event.preventDefault(); event.stopPropagation(); }
		}, true);

		/* Category nodes: drag to move; a moved node stops floating and keeps its place. */
		const DET = 22;
		listen(net, 'pointerdown', (event) => {
			if (event.button !== 0) return;
			const srcEl = event.target.closest?.('.works-net__src');
			if (!srcEl) return;
			const src = NET.srcs.get(srcEl.dataset.cat);
			if (!src) return;
			event.preventDefault();
			srcEl.setPointerCapture?.(event.pointerId);
			NET.sdrag = { src, cat: srcEl.dataset.cat, sx: event.clientX, sy: event.clientY, x0: src.x, y0: src.y ?? 0, moved: false, step: 0 };
			litCat(srcEl.dataset.cat);
		});
		/* Works: drag a node around; its wire follows and swings. */
		listen(net, 'pointerdown', (event) => {
			if (event.button !== 0 || event.pointerType !== 'mouse') return;
			const tile = event.target.closest?.('.works-node');
			if (!tile) return;
			const node = NET.nodes.get(Number(tile.dataset.workId));
			if (!node) return;
			event.preventDefault();
			NET.drag = { node, sx: event.clientX, sy: event.clientY, x0: node.x, y0: node.y, moved: false, cell: [0, 0] };
		});
		listen(window, 'pointermove', (event) => {
			const sdrag = NET.sdrag;
			if (sdrag) {
				const dx = event.clientX - sdrag.sx, dy = event.clientY - sdrag.sy;
				if (!sdrag.moved && Math.hypot(dx, dy) > 4) { sdrag.moved = true; sdrag.src.pinned = true; sdrag.src.el.classList.add('is-grab'); net.classList.add('is-dragging'); sound.pickUp(sdrag.cat); }
				if (!sdrag.moved) return;
				sdrag.src.x = clamp(sdrag.x0 + dx, -40, NET.W - NET.srcW + 40);
				sdrag.src.y = clamp(sdrag.y0 + dy, -40, NET.H - NET.srcH + 40);
				sdrag.src.vy = sdrag.src.y + NET.host.getBoundingClientRect().top;
				sdrag.src.el.style.transform = `translate3d(${sdrag.src.x.toFixed(1)}px, ${sdrag.src.y.toFixed(1)}px, 0)`;
				const step = Math.round(dy / DET);
				if (step !== sdrag.step) { sdrag.step = step; sound.detent(sdrag.cat); }
				excite(Math.hypot(event.movementX || 0, event.movementY || 0) * 0.006);
				updateWires();
				return;
			}
			const drag = NET.drag;
			if (!drag) return;
			const dx = event.clientX - drag.sx, dy = event.clientY - drag.sy;
			if (!drag.moved && Math.hypot(dx, dy) > 6) {
				drag.moved = true;
				drag.node.tile.classList.add('is-grab', 'is-play');
				net.classList.add('is-dragging');
				sound.pickUp(drag.node.cat);
			}
			if (!drag.moved) return;
			drag.node.x = drag.x0 + dx;
			drag.node.y = drag.y0 + dy;
			drag.node.tile.style.left = `${drag.node.x}px`;
			drag.node.tile.style.top = `${drag.node.y}px`;
			const cell = [Math.round(event.clientX / DET), Math.round(event.clientY / DET)];
			if (cell[0] !== drag.cell[0] || cell[1] !== drag.cell[1]) { drag.cell = cell; sound.detent(drag.node.cat); }
			excite(Math.hypot(event.movementX || 0, event.movementY || 0) * 0.004);
			NET.paths.get(drag.node.item.id)?.setAttribute('d', wirePath(drag.node));
		});
		const endDrags = () => {
			const sdrag = NET.sdrag;
			if (sdrag) {
				sdrag.src.el.classList.remove('is-grab');
				net.classList.remove('is-dragging');
				NET.sdrag = null;
				if (sdrag.moved) sound.plugIn(sdrag.cat);
				if (!sdrag.src.el.matches(':hover')) litCat(null);
			}
			const drag = NET.drag;
			if (drag) {
				if (drag.moved) {
					drag.node.tile.classList.remove('is-grab');
					if (hot !== drag.node.tile) drag.node.tile.classList.remove('is-play');
					net.classList.remove('is-dragging');
					sound.plugIn(drag.node.cat);
				}
				NET.drag = null;
			}
		};
		listen(window, 'pointerup', endDrags);
		listen(window, 'pointercancel', endDrags);
		listen(net, 'dragstart', (event) => event.preventDefault());
		if (scroller instanceof HTMLElement) listen(scroller, 'scroll', netKick, { passive: true });
		listen(window, 'resize', netKick, { passive: true });
	}

	/* ===== LIST: string rows ===== */
	const STR = new Map(), side = new Map();
	const ptr = { x: -1, y: -1, v: 0, t: 0 };
	let strRaf = 0;
	let rowsHost = null;
	let peek = null;

	function buildList() {
		const list = el('ol', 'works-list');
		list.setAttribute('aria-label', 'Works');
		let year = null;
		for (const item of items) {
			if (grouped && item.year !== year) {
				year = item.year;
				const count = items.filter((other) => other.year === year).length;
				const header = el('li', 'works-list__year');
				header.setAttribute('aria-hidden', 'true');
				header.append(el('b', null, year || '—'), el('i'), el('span', null, String(count).padStart(2, '0')));
				list.append(header);
			}
			const row = workItem(item, 'li', 'works-row');
			row.style.viewTransitionName = `work-${item.id}`;
			const link = el('a', 'works-row__link');
			link.href = item.url;
			link.setAttribute('aria-label', [item.title, item.catName, item.year].filter(Boolean).join(', '));
			const thumb = helpers.createArtwork(item.source.cover, 'works-card__media works-row__thumb');
			const title = el('span', 'works-row__title', item.title);
			const roles = el('span', 'works-row__roles', item.roles.join(' · '));
			const cat = el('span', 'works-row__cat', item.catName);
			const string = el('span', 'works-row__string');
			string.setAttribute('aria-hidden', 'true');
			string.innerHTML = '<svg viewBox="0 0 1000 20" preserveAspectRatio="none" focusable="false"><path d="M0 10 L1000 10"/></svg>';
			for (const part of [title, roles, cat]) part.setAttribute('aria-hidden', 'true');
			const yearLabel = el('span', 'works-row__year', item.year);
			yearLabel.setAttribute('aria-hidden', 'true');
			link.append(thumb, title, roles, cat, createVu('works-row__vu', item.cat), yearLabel, string);
			row.append(link);
			list.append(row);
		}
		rowsHost = list;
		peek = el('figure', 'works-peek');
		peek.setAttribute('aria-hidden', 'true');
		peek.append(el('img'));
		root.append(list, peek);
	}

	// px/py are viewport coordinates. A transformed ancestor (the Portal panel) turns position: fixed
	// into "relative to that ancestor", so the applied translate is offset by the measured origin.
	const peekState = { px: 0, py: 0, tx: 0, ty: 0, raf: 0, on: false, ox: 0, oy: 0, ax: -999, ay: 0 };
	function measurePeekOrigin() {
		const rect = peek.getBoundingClientRect();
		peekState.ox = rect.left - peekState.ax;
		peekState.oy = rect.top - peekState.ay;
	}
	function peekLoop() {
		const k = reduceMotion.matches ? 1 : 0.16;
		peekState.px += (peekState.tx - peekState.px) * k;
		peekState.py += (peekState.ty - peekState.py) * k;
		peekState.ax = peekState.px - peekState.ox;
		peekState.ay = peekState.py - peekState.oy;
		peek.style.transform = `translate3d(${peekState.ax}px, ${peekState.ay}px, 0)`;
		peekState.raf = !destroyed && (peekState.on || Math.abs(peekState.tx - peekState.px) + Math.abs(peekState.ty - peekState.py) > 0.5)
			? window.requestAnimationFrame(peekLoop) : 0;
	}
	function showPeek(row, x, y) {
		const image = coverImage(row);
		if (!(image instanceof HTMLImageElement)) { hidePeek(); return; }
		const peekImage = peek.querySelector('img');
		const source = image.currentSrc || image.src;
		if (!source) { hidePeek(); return; }
		if (peekImage.src !== source) peekImage.src = source;
		measurePeekOrigin();
		const width = peek.offsetWidth, height = peek.offsetHeight || width;
		if (!peekState.on) { peekState.px = x + 40; peekState.py = y - 80; }
		peekState.on = true;
		peek.classList.add('is-on');
		peekState.tx = Math.min(window.innerWidth - width - 16, x + 40);
		peekState.ty = clamp(y - height / 2, 16, window.innerHeight - height - 16);
		if (!peekState.raf) peekState.raf = window.requestAnimationFrame(peekLoop);
	}
	function hidePeek() {
		peekState.on = false;
		peek?.classList.remove('is-on');
	}

	const MODES = 6;
	function strFrame(now) {
		strRaf = 0;
		for (const [row, st] of STR) {
			const t = (now - st.t0) / 1000, A = st.amp * Math.exp(-2.4 * t);
			if (A < 0.12 || !row.isConnected) { st.path.setAttribute('d', 'M0 10 L1000 10'); row.style.setProperty('--a', '0'); STR.delete(row); continue; }
			let s0 = 0;
			for (let n = 1; n <= MODES; n += 1) s0 += Math.sin(n * Math.PI * st.p) ** 2 / (n * n);
			let d = '';
			for (let i = 0; i <= 40; i += 1) {
				const x = i / 40;
				let y = 0;
				for (let n = 1; n <= MODES; n += 1) y += Math.sin(n * Math.PI * st.p) / (n * n) * Math.sin(n * Math.PI * x) * Math.cos(2 * Math.PI * 5.5 * n * t);
				d += `${i ? 'L' : 'M'}${(x * 1000).toFixed(0)} ${(10 + A * y / s0).toFixed(2)} `;
			}
			st.path.setAttribute('d', d);
			row.style.setProperty('--a', Math.min(1, A / 5).toFixed(3));
		}
		if (STR.size && !destroyed) strRaf = window.requestAnimationFrame(strFrame);
	}
	function pluck(row, position, amp) {
		const st = STR.get(row) || { path: row.querySelector('.works-row__string path') };
		Object.assign(st, { p: clamp(position, 0.08, 0.92), amp, t0: performance.now() });
		STR.set(row, st);
		const item = byId.get(row.dataset.workId);
		sampleColour(item, coverImage(row));
		sound.pluck(item, amp);
		if (!strRaf && !reduceMotion.matches) strRaf = window.requestAnimationFrame(strFrame);
	}
	function checkPluck() {
		if (!rowsHost?.isConnected) return;
		const touch = !finePointer.matches;
		const clip = scrollRect();
		const px = touch ? window.innerWidth / 2 : ptr.x;
		const py = touch ? (clip.top + clip.bottom) / 2 : ptr.y;
		if (px < 0) return;
		for (const row of rowsHost.querySelectorAll('.works-row')) {
			const rect = row.getBoundingClientRect(), current = rect.bottom > py ? 1 : -1, previous = side.get(row);
			side.set(row, current);
			if (previous && previous !== current && px >= rect.left && px <= rect.right) pluck(row, (px - rect.left) / rect.width, Math.min(10, 3.5 + ptr.v * 0.35));
		}
	}

	function bindList() {
		listen(window, 'pointermove', (event) => {
			if (event.pointerType !== 'mouse') return;
			const now = performance.now();
			if (ptr.t) ptr.v = Math.abs(event.clientY - ptr.y) / Math.max(8, now - ptr.t) * 16;
			ptr.x = event.clientX; ptr.y = event.clientY; ptr.t = now;
			checkPluck();
		}, { passive: true });
		listen(document.documentElement, 'mouseleave', () => { ptr.x = -1; ptr.y = -1; });
		if (scroller instanceof HTMLElement) {
			listen(scroller, 'scroll', () => { ptr.v = 6; checkPluck(); hidePeek(); }, { passive: true });
		}
		listen(rowsHost, 'pointermove', (event) => {
			if (!finePointer.matches) return;
			const row = event.target.closest?.('.works-row');
			if (!row) { hidePeek(); return; }
			showPeek(row, event.clientX, event.clientY);
		});
		listen(rowsHost, 'pointerleave', hidePeek);
		listen(rowsHost, 'focusout', hidePeek);
	}

	/* ===== lifecycle ===== */
	if (display === 'list') buildList(); else buildCovers();

	let resizeObserver = null;
	let visibilityObserver = null;
	return {
		root,
		/** Lay out synchronously once the root is in the document, before cover readiness is measured. */
		layout() {
			scroller = root.closest('.photo-portal__scroller');
			if (display === 'covers') layoutNet(true);
		},
		mount() {
			if (destroyed) return;
			scroller = root.closest('.photo-portal__scroller');
			if (display === 'covers') {
				if (!NET.laidOut) layoutNet(true);
				bindCovers();
				let lastWidth = NET.host.clientWidth;
				resizeObserver = new ResizeObserver(() => {
					const width = NET.host.clientWidth;
					if (!width || width === lastWidth) return;
					lastWidth = width;
					layoutNet(false);
				});
				resizeObserver.observe(NET.host);
				visibilityObserver = new IntersectionObserver((entries) => {
					visual.visible = entries.some((entry) => entry.isIntersecting);
					if (visual.visible) visKick();
				});
				visibilityObserver.observe(NET.host);
				listen(document, 'visibilitychange', visKick);
				if (reduceMotion.matches) {
					// Draw the category displays once, still.
					window.requestAnimationFrame((now) => NET.srcs.forEach((src, cat) => { const canvas = src.el.querySelector('.works-net__scope'); if (canvas) drawScope(cat, canvas, now); }));
				} else visKick();
				const unsubscribe = onSignalSoundChange((on) => { if (on) NET.paths.forEach((_, id) => window.setTimeout(() => sendPulse(id), Math.random() * 450)); });
				cleanups.push(unsubscribe);
			} else {
				bindList();
			}
		},
		destroy() {
			if (destroyed) return;
			destroyed = true;
			cleanups.splice(0).forEach((cleanup) => cleanup());
			resizeObserver?.disconnect();
			visibilityObserver?.disconnect();
			window.cancelAnimationFrame(NET.raf);
			window.cancelAnimationFrame(visual.raf);
			window.cancelAnimationFrame(strRaf);
			window.cancelAnimationFrame(peekState.raf);
			window.clearInterval(pulseTimers.cat);
			window.clearInterval(pulseTimers.work);
			STR.clear();
			side.clear();
		},
	};
}
