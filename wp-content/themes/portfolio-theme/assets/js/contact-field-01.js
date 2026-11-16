/*
 * Contact sound field (G "speaker rig").
 *
 * An Ambisonic studio dome around the listener: rings of loudspeakers at 0°, 30°, 60° and
 * the zenith. Every contact is one of the speakers; each speaker now and then sends a
 * wavefront toward the listener, and a hovered contact keeps sending its own. Drag the
 * stage to orbit the dome.
 * The message pill opens the form view with a circular reveal; Escape closes it. Form
 * submission stays in contact-form-01.js. Works for server-rendered pages and for Portal
 * panels injected later.
 */
const FIELD_SELECTOR = '[data-contact-field]';
const fields = new WeakMap();
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const DEG = Math.PI / 180;

// Contacts on the rig, in markup order: email, instagram, facebook, x, spotify,
// soundcloud, streetvoice, github, portaly, discord (the zenith speaker).
// Azimuth + = left, elevation + = up.
const RIG = [
	{ az: 0, el: 0 }, { az: 60, el: 0 }, { az: 120, el: 0 }, { az: 157.5, el: 30 }, { az: -150, el: 0 },
	{ az: -112.5, el: 30 }, { az: -60, el: 0 }, { az: 22.5, el: 30 }, { az: -45, el: 60 }, { az: 0, el: 90 },
];
// [elevation, speakers, azimuth offset]
const RINGS = [[0, 12, 0], [30, 8, 22.5], [60, 4, 45], [90, 1, 0]];
const TRAVEL = 2800; // ms for a wavefront to reach the listener
const rand = (a, b) => a + Math.random() * (b - a);
const FLOOR = -0.34;

// World: x right, y up, z toward the viewer; the listener faces -z.
function dir(az, el) {
	const a = az * DEG, e = el * DEG;
	return [-Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)];
}

// Perspective camera orbiting the origin: project(p) -> [x, y, depth (-1 far .. 1 near), scale].
function camera(yaw, pitch, dist, focal, cx, cy) {
	const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
	return (p) => {
		const x = p[0] * cyw + p[2] * syw;
		const z = -p[0] * syw + p[2] * cyw;
		const y2 = p[1] * cp - z * sp;
		const z2 = p[1] * sp + z * cp;
		const k = focal / (dist - z2);
		return [cx + x * k, cy - y2 * k, z2, k];
	};
}

function rgb(value, fallback) {
	const hex = (value || fallback).trim().replace('#', '');
	const n = Number.parseInt(hex.length === 3 ? hex.replace(/./g, '$&$&') : hex, 16);
	return Number.isNaN(n) ? rgb(fallback, fallback) : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (dt, ms) => Math.min(1, (dt || 16) / ms);
const sameSpeaker = (a, b) => a.el === b.el && Math.abs(((a.az - b.az + 540) % 360) - 180) < 0.1;
const angle = (v) => `${v >= 0 ? '+' : '−'}${String(Math.round(Math.abs(v))).padStart(3, '0')}°`;

// Small mono readout: rows of [label, value, hot, keepCase].
function readout(host, className) {
	const block = document.createElement('div');
	block.className = `contact-field__hud-block ${className}`;
	host.append(block);
	let last = '';
	return (rows) => {
		const key = JSON.stringify(rows);
		if (key === last) return;
		last = key;
		block.replaceChildren(...rows.map(([label, value, hot, keepCase]) => {
			const row = document.createElement('span');
			if (label) { const i = document.createElement('i'); i.textContent = label; row.append(i); }
			const b = document.createElement('b');
			b.textContent = value;
			if (hot) b.classList.add('is-hot');
			if (keepCase) b.classList.add('is-verbatim');
			row.append(b);
			return row;
		}));
	};
}

function initField(root) {
	if (fields.has(root)) return;
	const stage = root.querySelector('.contact-field__stage');
	const canvas = root.querySelector('.contact-field__canvas');
	const nodesView = root.querySelector('.contact-field__view--nodes');
	const formView = root.querySelector('.contact-field__view--form');
	const wrap = root.querySelector('.contact-field__nodes');
	const pill = root.querySelector('[data-contact-open]');
	const back = root.querySelector('[data-contact-close]');
	const copy = root.querySelector('[data-contact-copy]');
	const copyStatus = root.querySelector('[data-contact-copy-status]');
	const ctx = canvas instanceof HTMLCanvasElement ? canvas.getContext('2d') : null;
	if (!(stage instanceof HTMLElement) || !ctx || !(nodesView instanceof HTMLElement) || !(formView instanceof HTMLElement) || !(wrap instanceof HTMLElement) || !(pill instanceof HTMLButtonElement)) return;

	const nodes = [...wrap.querySelectorAll('.contact-node')];
	const labels = nodes.map((node) => node.dataset.label ?? '');
	const style = getComputedStyle(root);
	const fg = rgb(style.getPropertyValue('--contact-fg'), '#f0eee8');
	const accent = rgb(style.getPropertyValue('--contact-accent'), '#ed661c');
	const english = document.documentElement.lang === 'en';

	const hud = document.createElement('div');
	hud.className = 'contact-field__hud';
	hud.setAttribute('aria-hidden', 'true');
	canvas.after(hud);
	const info = readout(hud, 'contact-field__hud-block--info');
	// Where each contact leads: the address or the profile path.
	const routes = nodes.map((node) => {
		const href = node.getAttribute('href') ?? '';
		if (href.startsWith('mailto:')) return href.slice(7);
		try {
			const url = new URL(href, window.location.href);
			return `${url.hostname.replace(/^www\./, '')}${url.pathname.split('/').filter(Boolean).slice(0, 1).map((part) => `/${part}`).join('')}`;
		} catch {
			return '';
		}
	});
	const clockFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false });

	const speakers = [];
	for (const [el, count, offset] of RINGS) for (let k = 0; k < count; k++) speakers.push({ az: offset + (k * 360) / count, el });
	// Each speaker fires on its own random schedule; a hovered contact keeps firing.
	const emitters = speakers.map((spk) => ({ u: dir(spk.az, spk.el), contact: RIG.findIndex((r) => sameSpeaker(r, spk)), pulses: [], next: rand(300, 16000) }));
	const sources = RIG.map((r) => dir(r.az, r.el));

	const state = {
		raf: 0, running: false, visible: true, last: 0, speed: 1, t: 0,
		yaw: Math.PI - 0.4, pitch: 0.5, vy: 0, vp: 0, flash: 0,
		pointer: null, hoverIdx: -1, drag: null, half: 28,
		gain: RIG.map(() => 0.5),
	};
	fields.set(root, state);

	root.classList.add('is-enhanced');
	nodes.forEach((node, index) => node.style.setProperty('--contact-i', String(index)));
	formView.inert = true;
	formView.setAttribute('aria-hidden', 'true');

	const pillCenter = () => { const s = stage.getBoundingClientRect(), b = pill.getBoundingClientRect(); return [b.left + b.width / 2 - s.left, b.top + b.height / 2 - s.top]; };

	function orbit(dt) {
		const drag = state.drag;
		if (drag?.active) {
			const vy = drag.dx * 0.006, vp = drag.dy * 0.004;
			state.yaw += vy; state.pitch += vp;
			state.vy = vy / Math.max(dt, 1); state.vp = vp / Math.max(dt, 1);
			drag.dx = 0; drag.dy = 0;
		} else {
			state.yaw += state.vy * dt; state.pitch += state.vp * dt;
			state.vy *= 0.94; state.vp *= 0.9;
			state.yaw += (state.hoverIdx >= 0 ? 0 : state.pointer ? 0.0000175 : 0.00005) * dt;
			if (Math.abs(state.vp) < 0.0002) state.pitch += (0.5 - state.pitch) * ease(dt, 2400);
		}
		state.pitch = clamp(state.pitch, 0.12, 1.2);
	}

	function draw(dt, w, h) {
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
		if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);

		const tall = w < 700;
		const hover = state.hoverIdx;
		state.t += dt;
		state.gain = state.gain.map((g, i) => g + ((hover === i ? 1 : hover >= 0 ? 0.1 : 0.5) - g) * ease(dt, 260));

		const R = tall ? Math.min(w * 0.43, h * 0.3) : Math.min(w * 0.36, h * 0.4);
		const dist = 3.6;
		const P = camera(state.yaw, state.pitch, dist, R * dist, w / 2, h * 0.5);
		const seg = (a, b, alpha) => { ctx.strokeStyle = css(fg, alpha); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
		const byDepth = (p, lo, hi) => lo + (hi - lo) * ((p[2] + 1) / 2);
		ctx.lineWidth = 1;

		// Floor disc, the 0° / 30° / 60° rings and the meridians of the truss.
		for (let n = 0; n < 96; n++) {
			const a0 = (n / 96) * 360, a1 = ((n + 1) / 96) * 360;
			const f0 = P([Math.cos(a0 * DEG), FLOOR, Math.sin(a0 * DEG)]);
			const f1 = P([Math.cos(a1 * DEG), FLOOR, Math.sin(a1 * DEG)]);
			seg(f0, f1, byDepth(f0, 0.05, 0.16));
			for (const [el] of RINGS.slice(0, 3)) { const p0 = P(dir(a0, el)), p1 = P(dir(a1, el)); seg(p0, p1, byDepth(p0, 0.04, el ? 0.12 : 0.2)); }
		}
		for (let m = 0; m < 8; m++) {
			const az = m * 45;
			for (let e = 0; e < 90; e += 5) { const p0 = P(dir(az, e)), p1 = P(dir(az, e + 5)); seg(p0, p1, byDepth(p0, 0.02, 0.06)); }
			const foot = dir(az, 0);
			const top = P(foot), bottom = P([foot[0], FLOOR, foot[2]]);
			seg(top, bottom, byDepth(top, 0.04, 0.12));
		}

		// Every speaker sends wavefronts toward the listener: shells growing from the
		// speaker (radius 0 → 1, the distance to the sweet spot), drawn as the arc facing it.
		const centre = P([0, 0, 0]);
		const plainGain = hover >= 0 ? 0.25 : 0.55;
		let hit = 0;
		for (const emitter of emitters) {
			const { u, contact } = emitter;
			const hot = contact >= 0 && hover === contact;
			if (hot && emitter.next - state.t > 1300) emitter.next = state.t;
			if (state.t >= emitter.next) {
				emitter.pulses.push(state.t);
				emitter.next = state.t + (hot ? 1300 : contact >= 0 ? rand(6000, 14000) : rand(8000, 20000));
			}
			emitter.pulses = emitter.pulses.filter((start) => state.t - start < TRAVEL);
			if (!emitter.pulses.length) continue;
			const gain = contact >= 0 ? Math.max(0.6, state.gain[contact] * 1.4) * (hover >= 0 && !hot ? 0.4 : 1) : plainGain;
			const pc = P(u);
			const depth = (pc[2] + 1) / 2;
			const toward = Math.atan2(centre[1] - pc[1], centre[0] - pc[0]);
			const color = hot ? accent : mix(fg, accent, contact >= 0 ? 0.45 : 0.2);
			for (const start of emitter.pulses) {
				const age = (state.t - start) / TRAVEL;
				const g = gain * Math.sin(age * Math.PI) ** 0.7 * (0.55 + 0.45 * depth);
				if (contact >= 0 && age > 0.95) hit = Math.max(hit, Math.min(1, gain));
				if (g < 0.03) continue;
				const r = age * pc[3];
				const span = (contact >= 0 ? 0.75 : 0.55) + age * 0.35;
				ctx.strokeStyle = css(color, (hot ? 0.35 : 0.12) * g);
				ctx.lineWidth = hot ? 7 : 5;
				ctx.beginPath(); ctx.arc(pc[0], pc[1], r, toward - span, toward + span); ctx.stroke();
				ctx.strokeStyle = css(color, (hot ? 1 : contact >= 0 ? 0.62 : 0.4) * g);
				ctx.lineWidth = hot ? 1.8 : 1.2;
				ctx.beginPath(); ctx.arc(pc[0], pc[1], r, toward - span, toward + span); ctx.stroke();
			}
		}
		ctx.lineWidth = 1;
		state.flash = Math.max(hit, state.flash - dt / 500);

		// Speakers that are not contacts: small boxes.
		for (const { u, contact } of emitters) {
			if (contact >= 0) continue;
			const p = P(u);
			const t = (p[2] + 1) / 2, size = 3 + 4 * t;
			ctx.fillStyle = css(fg, 0.12 + 0.3 * t);
			ctx.fillRect(p[0] - size / 2, p[1] - size / 2, size, size);
		}

		// Listener at the sweet spot (facing -z), standing over the floor.
		const headR = 0.085 * centre[3];
		const nose = P([0, 0, -0.14]), earL = P([-0.095, 0, 0]), earR = P([0.095, 0, 0]), foot = P([0, FLOOR, 0]);
		ctx.strokeStyle = css(fg, 0.85); ctx.lineWidth = 1.2;
		ctx.beginPath(); ctx.arc(centre[0], centre[1], headR, 0, Math.PI * 2); ctx.stroke();
		ctx.beginPath(); ctx.moveTo(centre[0], centre[1]); ctx.lineTo(nose[0], nose[1]); ctx.stroke();
		for (const e of [earL, earR]) { ctx.beginPath(); ctx.arc(e[0], e[1], headR * 0.28, 0, Math.PI * 2); ctx.stroke(); }
		ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
		seg([centre[0], centre[1] + headR], foot, 0.25);
		ctx.setLineDash([]);
		if (state.flash > 0.01) {
			ctx.strokeStyle = css(accent, 0.8 * state.flash);
			ctx.beginPath(); ctx.arc(centre[0], centre[1], headR * (1.5 + (1 - state.flash) * 1.4), 0, Math.PI * 2); ctx.stroke();
		}

		// Contacts.
		sources.forEach((u, i) => {
			const p = P(u);
			const t = (p[2] + 1) / 2;
			if (hover === i) {
				ctx.strokeStyle = css(accent, 0.8); ctx.lineWidth = 1.3;
				ctx.beginPath(); ctx.moveTo(centre[0], centre[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
				ctx.lineWidth = 1;
			}
			const node = nodes[i];
			const scale = clamp(0.66 + 0.46 * t, 0.66, 1.12);
			node.style.transform = `translate(${(p[0] - state.half).toFixed(1)}px, ${(p[1] - state.half).toFixed(1)}px) scale(${scale.toFixed(3)})`;
			node.style.setProperty('--contact-depth', (0.45 + 0.55 * t).toFixed(3));
			node.style.zIndex = String(10 + Math.round(t * 50));
		});

		// The readout reads the page as a session: the listener at the sweet spot is the
		// artist, every contact is an open channel; the address is there to read or copy.
		if (!state.clock || Date.now() - state.clockAt > 5000) { state.clock = clockFormat.format(new Date()); state.clockAt = Date.now(); }
		info(hover >= 0
			? [['CHANNEL', `${String(hover + 1).padStart(2, '0')} · ${labels[hover]}`, true], ['ROUTE', routes[hover], false, true], ['POSITION', `AZ ${angle(RIG[hover].az)} · EL ${angle(RIG[hover].el)}`]]
			: [['SESSION', 'PO HAO CHEN · CONTACT'], ['EMAIL', routes[0] ?? '', true, true], ['LOCAL TIME', `TAIWAN · UTC+8 · ${state.clock}`], ['CHANNELS', `${String(nodes.length).padStart(2, '0')} OPEN`]]);
	}

	function frame(dt) {
		const rect = stage.getBoundingClientRect();
		if (rect.width < 1 || rect.height < 1) return;
		state.half = (nodes[0]?.offsetWidth ?? 56) / 2;
		orbit(dt);
		draw(dt, rect.width, rect.height);
	}
	function readHover() {
		const hovered = wrap.querySelector('.contact-node:hover, .contact-node:focus-visible');
		state.hoverIdx = hovered ? nodes.indexOf(hovered) : -1;
	}
	function loop(time) {
		if (!state.running) return;
		if (!root.isConnected) { teardown(); return; }
		const dt = state.last ? Math.min(40, time - state.last) : 16; state.last = time;
		readHover();
		state.speed += ((root.classList.contains('is-writing') ? 0.2 : 1) - state.speed) * Math.min(1, dt / 250);
		frame(dt * state.speed);
		state.raf = requestAnimationFrame(loop);
	}
	function play() {
		if (state.running || reduceMotion.matches || document.hidden || !state.visible) return;
		state.running = true; state.last = 0; state.raf = requestAnimationFrame(loop);
	}
	function pause() { state.running = false; cancelAnimationFrame(state.raf); }
	// Reduced motion: no loop, but the rig still answers hover, focus and dragging.
	let still = 0;
	function stillFrame() {
		if (!reduceMotion.matches || still) return;
		still = requestAnimationFrame(() => { still = 0; readHover(); frame(0); });
	}

	function setWriting(on, moveFocus = true) {
		if (on) {
			const [x, y] = pillCenter();
			formView.style.setProperty('--contact-ox', `${x}px`);
			formView.style.setProperty('--contact-oy', `${y}px`);
		}
		root.classList.toggle('is-writing', on);
		nodesView.inert = on; formView.inert = !on;
		nodesView.setAttribute('aria-hidden', String(on)); formView.setAttribute('aria-hidden', String(!on));
		pill.setAttribute('aria-expanded', String(on));
		if (!moveFocus) return;
		window.setTimeout(() => {
			const target = on ? formView.querySelector('input:not([type="hidden"]):not([tabindex="-1"])') : pill;
			if (target instanceof HTMLElement) target.focus({ preventScroll: true });
		}, on ? 550 : 60);
	}

	const local = (event) => { const r = stage.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; };
	const onPointerMove = (event) => {
		const p = local(event);
		if (state.drag?.active) { state.drag.dx += p.x - state.drag.x; state.drag.dy += p.y - state.drag.y; state.drag.x = p.x; state.drag.y = p.y; }
		state.pointer = p;
		stillFrame();
	};
	const onPointerLeave = () => { if (!state.drag?.active) state.pointer = null; stillFrame(); };
	// Drag to orbit with a mouse, pen or finger (the stage has touch-action: none).
	const onPointerDown = (event) => {
		if (event.button !== 0 || root.classList.contains('is-writing')) return;
		if (event.target instanceof Element && event.target.closest('a, button, input, textarea, label')) return;
		const p = local(event);
		state.drag = { active: true, x: p.x, y: p.y, dx: 0, dy: 0 };
		stage.setPointerCapture?.(event.pointerId);
		stage.classList.add('is-grabbing');
	};
	const onPointerUp = (event) => {
		if (!state.drag?.active) return;
		state.drag.active = false;
		stage.classList.remove('is-grabbing');
		// A lifted finger leaves no pointer over the rig, so the slow drift resumes.
		if (event.pointerType !== 'mouse') state.pointer = null;
	};
	// Capture phase on the document: Escape closes the open form view first, even when focus
	// has dropped to <body> (the submit button is disabled while sending), and the surrounding
	// Portal panel only closes on a later Escape.
	const onKeydown = (event) => {
		if (event.key !== 'Escape' || !root.isConnected || !root.classList.contains('is-writing')) return;
		event.stopPropagation();
		event.preventDefault();
		setWriting(false);
	};
	const onCopy = async (event) => {
		if (!(copy instanceof HTMLAnchorElement)) return;
		event.preventDefault();
		try {
			await navigator.clipboard.writeText(copy.dataset.contactCopy ?? '');
		} catch {
			window.location.href = copy.href; // fall back to the mail app
			return;
		}
		const label = copy.dataset.label ?? 'EMAIL';
		copy.dataset.label = copy.dataset.copiedLabel ?? 'COPIED';
		copy.classList.add('is-copied');
		if (copyStatus) copyStatus.textContent = english ? 'Email address copied.' : '已複製電子郵件。 · EMAIL COPIED';
		window.clearTimeout(state.copyTimer);
		state.copyTimer = window.setTimeout(() => { copy.classList.remove('is-copied'); copy.dataset.label = label; }, 1800);
	};
	const onOpen = () => setWriting(true);
	const onClose = () => setWriting(false);
	const onVisibility = () => (document.hidden ? pause() : play());
	const onMotionChange = () => { if (reduceMotion.matches) { pause(); frame(16); } else play(); };

	stage.addEventListener('pointermove', onPointerMove);
	stage.addEventListener('pointerleave', onPointerLeave);
	stage.addEventListener('pointerdown', onPointerDown);
	stage.addEventListener('pointerup', onPointerUp);
	stage.addEventListener('pointercancel', onPointerUp);
	wrap.addEventListener('focusin', stillFrame);
	wrap.addEventListener('focusout', stillFrame);
	document.addEventListener('keydown', onKeydown, true);
	pill.addEventListener('click', onOpen);
	back?.addEventListener('click', onClose);
	copy?.addEventListener('click', onCopy);
	document.addEventListener('visibilitychange', onVisibility);
	reduceMotion.addEventListener?.('change', onMotionChange);
	const resizeObserver = new ResizeObserver(() => { if (!state.running) frame(0); });
	resizeObserver.observe(stage);
	const visibilityObserver = new IntersectionObserver((entries) => {
		state.visible = entries.some((entry) => entry.isIntersecting);
		if (state.visible) play(); else pause();
	});
	visibilityObserver.observe(stage);

	function teardown() {
		pause();
		resizeObserver.disconnect();
		visibilityObserver.disconnect();
		document.removeEventListener('visibilitychange', onVisibility);
		document.removeEventListener('keydown', onKeydown, true);
		reduceMotion.removeEventListener?.('change', onMotionChange);
		fields.delete(root);
	}
	state.teardown = teardown;

	frame(0);
	if (reduceMotion.matches) for (let i = 0; i < 40; i += 1) frame(16);
	requestAnimationFrame(() => root.classList.add('is-placed'));
	window.setTimeout(() => root.classList.add('is-live'), 1600);
	play();
}

function scan(scope) {
	if (scope instanceof Element && scope.matches(FIELD_SELECTOR)) initField(scope);
	scope.querySelectorAll?.(FIELD_SELECTOR).forEach((root) => initField(root));
}

function boot() {
	scan(document);
	// Portal panels insert Contact after load; pick those up and let removed fields stop themselves.
	new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) if (node instanceof Element) scan(node);
			for (const node of mutation.removedNodes) {
				if (!(node instanceof Element)) continue;
				const removed = node.matches(FIELD_SELECTOR) ? [node] : [...node.querySelectorAll(FIELD_SELECTOR)];
				for (const root of removed) if (!root.isConnected) fields.get(root)?.teardown?.();
			}
		}
	}).observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
