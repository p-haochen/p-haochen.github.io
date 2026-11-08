/*
 * Contact sound field (J3 "noise cancelling").
 *
 * A field of shimmering noise; quiet zones cancel it around the cursor, a hovered
 * node, the message pill and a slowly wandering bubble. The message pill opens
 * the form view with a circular reveal. Form submission stays in contact-form-01.js.
 * Works for server-rendered pages and for Portal panels injected later.
 */
const FIELD_SELECTOR = '[data-contact-field]';
const fields = new WeakMap();
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Node order in the markup: email, instagram, facebook, x, spotify, soundcloud, streetvoice, github.
const LAYOUT = {
	wide: [[0.22, 0.3], [0.36, 0.62], [0.1, 0.56], [0.6, 0.24], [0.82, 0.42], [0.66, 0.64], [0.9, 0.7], [0.42, 0.2], [0.2, 0.8]],
	tall: [[0.24, 0.12], [0.2, 0.56], [0.16, 0.32], [0.76, 0.16], [0.8, 0.38], [0.74, 0.6], [0.6, 0.76], [0.28, 0.78], [0.5, 0.42]],
};

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
	const style = getComputedStyle(root);
	const fg = style.getPropertyValue('--contact-fg').trim() || '#f0eee8';
	const accent = style.getPropertyValue('--contact-accent').trim() || '#d2bd7a';

	const state = {
		raf: 0, running: false, visible: true, last: 0, phase: 0, speed: 1,
		pointer: null, pts: [], half: 28, tall: false, hoverIdx: -1, pillHover: false,
		dots: [], gridKey: '', bubbles: [], cursorQ: 0, wanderQ: 0, pillQ: 0,
		quietR: new Array(nodes.length).fill(0), wander: { x: 0, y: 0 },
	};
	fields.set(root, state);

	root.classList.add('is-enhanced');
	nodes.forEach((node, index) => node.style.setProperty('--contact-i', String(index)));
	formView.inert = true;
	formView.setAttribute('aria-hidden', 'true');

	const size = () => { const rect = stage.getBoundingClientRect(); return { w: rect.width, h: rect.height }; };
	const pillCenter = () => { const s = stage.getBoundingClientRect(), b = pill.getBoundingClientRect(); return [b.left + b.width / 2 - s.left, b.top + b.height / 2 - s.top]; };

	function geometry(w, h) {
		state.tall = w < 700;
		state.half = (nodes[0]?.offsetWidth ?? 56) / 2;
		const layout = state.tall ? LAYOUT.tall : LAYOUT.wide;
		state.pts = nodes.map((_, i) => { const [u, v] = layout[i % layout.length]; return [u * w, v * h]; });
	}
	function place() {
		const { half, pts } = state;
		nodes.forEach((node, i) => { node.style.transform = `translate(${(pts[i][0] - half).toFixed(1)}px, ${(pts[i][1] - half).toFixed(1)}px)`; });
	}
	const nearNode = (x, y) => { let m = Infinity; for (const p of state.pts) m = Math.min(m, Math.hypot(x - p[0], y - p[1])); return m; };

	function draw(dt, w, h) {
		const dpr = Math.min(window.devicePixelRatio || 1, 2), cw = Math.round(w * dpr), ch = Math.round(h * dpr);
		if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
		ctx.clearRect(0, 0, cw, ch);
		const gap = state.tall ? 7 : 8, key = `${Math.round(w)}x${Math.round(h)}`;
		if (key !== state.gridKey) {
			state.gridKey = key; state.dots = [];
			for (let y = gap / 2; y < h; y += gap) for (let x = gap / 2; x < w; x += gap) state.dots.push([x, y, Math.random() * 100]);
		}
		const ease = (ms) => Math.min(1, (dt || 16) / ms);
		const { tall } = state;
		for (let i = 0; i < nodes.length; i++) state.quietR[i] += ((i === state.hoverIdx ? (tall ? 120 : 190) : 0) - state.quietR[i]) * ease(320);
		const engaged = state.pointer || state.hoverIdx >= 0 || state.pillHover;
		state.cursorQ += ((state.pointer && state.hoverIdx < 0 && !state.pillHover ? (tall ? 80 : 110) : 0) - state.cursorQ) * ease(240);
		state.wanderQ += ((engaged ? 0 : (tall ? 70 : 95)) - state.wanderQ) * ease(600);
		state.pillQ += ((state.pillHover ? (tall ? 120 : 170) : (tall ? 52 : 64)) - state.pillQ) * ease(300);
		state.wander.x = w * (0.5 + 0.34 * Math.sin(state.phase * 0.00021));
		state.wander.y = h * (0.46 + 0.26 * Math.sin(state.phase * 0.00033 + 1.2));
		state.bubbles = state.bubbles.filter((b) => (b.life -= (dt || 0) / 3200) > 0);

		const [px, py] = pillCenter();
		const zones = state.pts.map((p, i) => [p[0], p[1], state.quietR[i]]);
		zones.push([px, py, state.pillQ]);
		if (state.pointer && state.cursorQ > 1) zones.push([state.pointer.x, state.pointer.y, state.cursorQ]);
		if (state.wanderQ > 1) zones.push([state.wander.x, state.wander.y, state.wanderQ]);
		for (const b of state.bubbles) zones.push([b.x, b.y, b.r * Math.sin(Math.min(1, b.life * 1.4) * Math.PI / 2)]);

		const t = state.phase * 0.001;
		for (const [x, y, seed] of state.dots) {
			let calm = 0, edge = 0;
			for (const [zx, zy, zr] of zones) {
				if (zr < 2) continue;
				const d = Math.hypot(x - zx, y - zy);
				calm = Math.max(calm, Math.min(1, Math.max(0, (zr - d) / 40)));
				edge = Math.max(edge, Math.exp(-(((d - zr) / 6) ** 2)) * Math.min(1, zr / 60));
			}
			const noise = 1 - calm;
			const n1 = Math.sin(seed * 12.9898 + t * 23.1) * 43758.5453, r1 = n1 - Math.floor(n1);
			const n2 = Math.sin(seed * 78.233 + t * 19.7) * 12543.1, r2 = n2 - Math.floor(n2);
			const fade = Math.min(1, Math.max(0, (nearNode(x, y) - 34) / 26));
			if (fade <= 0) continue;
			const alpha = (noise * (0.08 + 0.32 * r2) + calm * 0.22 + edge * 0.5) * fade;
			if (alpha < 0.03) continue;
			ctx.globalAlpha = alpha;
			ctx.fillStyle = edge > 0.5 ? accent : fg;
			const s = (edge > 0.5 ? 1.6 : 1.1) * dpr;
			ctx.fillRect((x + (r1 - 0.5) * 5 * noise) * dpr - s / 2, (y + (r2 - 0.5) * 5 * noise) * dpr - s / 2, s, s);
		}
		ctx.globalAlpha = 1;
	}

	function frame(dt) { const { w, h } = size(); if (w < 1 || h < 1) return; geometry(w, h); place(); draw(dt, w, h); }
	function loop(time) {
		if (!state.running) return;
		if (!root.isConnected) { teardown(); return; }
		const dt = state.last ? Math.min(40, time - state.last) : 16; state.last = time;
		const hovered = wrap.querySelector('.contact-node:hover, .contact-node:focus-visible');
		state.hoverIdx = hovered ? nodes.indexOf(hovered) : -1;
		state.pillHover = pill.matches(':hover, :focus-visible');
		state.speed += ((root.classList.contains('is-writing') ? 0.2 : 1) - state.speed) * Math.min(1, dt / 250);
		state.phase += dt * state.speed;
		frame(dt * state.speed);
		state.raf = requestAnimationFrame(loop);
	}
	function play() {
		if (state.running || reduceMotion.matches || document.hidden || !state.visible) return;
		state.running = true; state.last = 0; state.raf = requestAnimationFrame(loop);
	}
	function pause() { state.running = false; cancelAnimationFrame(state.raf); }

	function setWriting(on, moveFocus = true) {
		if (on) {
			const [x, y] = pillCenter();
			formView.style.setProperty('--contact-ox', `${x}px`);
			formView.style.setProperty('--contact-oy', `${y}px`);
			state.bubbles.push({ x, y, r: 320, life: 1 });
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
		if (reduceMotion.matches) frame(16);
	}

	const onPointerMove = (event) => { const r = stage.getBoundingClientRect(); state.pointer = { x: event.clientX - r.left, y: event.clientY - r.top }; };
	const onPointerLeave = () => { state.pointer = null; };
	const onPointerDown = (event) => {
		if (event.target instanceof Element && event.target.closest('a, button, input, textarea, label')) return;
		const r = stage.getBoundingClientRect();
		state.bubbles.push({ x: event.clientX - r.left, y: event.clientY - r.top, r: state.tall ? 110 : 160, life: 1 });
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
		if (copyStatus) copyStatus.textContent = '已複製電子郵件。 · EMAIL COPIED';
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
	document.addEventListener('keydown', onKeydown, true);
	pill.addEventListener('click', onOpen);
	back?.addEventListener('click', onClose);
	copy?.addEventListener('click', onCopy);
	document.addEventListener('visibilitychange', onVisibility);
	reduceMotion.addEventListener?.('change', onMotionChange);
	const resizeObserver = new ResizeObserver(() => { state.gridKey = ''; if (!state.running) frame(0); });
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
	if (reduceMotion.matches) { for (let i = 0; i < 30; i += 1) { state.phase += 16; frame(16); } }
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
