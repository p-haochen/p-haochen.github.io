// Homepage motion background ("burst"): sparks on the projection screen travel
// outward along their own streaks while the performer, instruments and cables
// stay exactly as photographed. Accepted settings are fixed: strength 100,
// speed 60, edge buffer 0. The still <picture> stays visible until the canvas
// has its textures, and remains the only layer for reduced motion, missing
// WebGL or any load failure.
const canvas = document.querySelector('[data-home-hero-motion]');
const still = document.querySelector('.photo-draft__background img');
const assetBase = new URL('../media/homepage-draft-01/motion/', import.meta.url);
const mobileQuery = window.matchMedia('(max-width: 700px)');
const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

const AMP = 1;
const SPEED = 0.3 + 0.6 * 4;
const EDGE = 0.04;
const FRAME_MS = 33;
const VARIANTS = {
	// The mobile textures are a 610 px wide crop (x = 419) of the 1448 px desktop photo. cropX/fullWidth let the
	// shader compute travel, noise and gains in full-photo units so the mobile crop moves exactly like desktop.
	desktop: { suffix: 'desktop', width: 1448, height: 1086, anchorY: 0.48, cropX: 0, fullWidth: 1448 },
	mobile: { suffix: 'mobile', width: 610, height: 1086, anchorY: 0.5, cropX: 419, fullWidth: 1448 },
};

const VERTEX_SHADER = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = vec2(aPos.x * .5 + .5, .5 - aPos.y * .5); gl_Position = vec4(aPos, 0., 1.); }
`;

const FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D uImg;
uniform sampler2D uMask;
uniform sampler2D uFlow;
uniform sampler2D uPlate;
uniform sampler2D uSpeed;
uniform vec2 uRes;
uniform vec2 uImgSize;
uniform vec2 uFullSize;   // the full photo the textures were cut from (desktop: same as uImgSize)
uniform vec2 uCropScale;  // full-photo uv = texture uv * uCropScale + uCropOff (desktop: 1 and 0)
uniform vec2 uCropOff;
uniform float uAnchorY;
uniform float uTime;
uniform float uAmp;
uniform float uEdge;
varying vec2 vUv;

#ifdef EXACT_HASH
// Android GPUs can evaluate the same lattice corner with last-bit differences from one noise cell to
// the next; the sine hash magnifies them into visible blocks. Exact integer arithmetic (mod 289) gives
// every corner one value however it is computed.
vec2 permute(vec2 x) { return mod((x * 34. + 1.) * x, 289.); }
float hash(vec2 p) {
	p = mod(p, 289.);
	vec2 h = permute(vec2(permute(vec2(p.x, 0.)).x + p.y, 0.));
	return h.x / 289.;
}
#else
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
#endif
float noise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	vec2 u = f * f * (3. - 2. * f);
	return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p) {
	float v = 0., a = .5;
	for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= .5; }
	return v;
}
// Same cover crop as the still image's object-fit / object-position.
vec2 cover(vec2 s) {
	float rs = uRes.x / uRes.y, ri = uImgSize.x / uImgSize.y;
	vec2 scale = rs > ri ? vec2(1., ri / rs) : vec2(rs / ri, 1.);
	return s * scale + (1. - scale) * vec2(.5, uAnchorY);
}
// Clean plate: the screen with the performer painted out.
vec3 bg(vec2 p) { return texture2D(uPlate, p).rgb; }
// Displaced sample that never reveals the painted-in area behind the performer.
vec3 bgOff(vec2 uv, vec2 off) {
	float ha = texture2D(uMask, uv + off).b, hb = texture2D(uMask, uv - off).b;
	vec3 c = mix(bg(uv + off), bg(uv - off), ha);
	return mix(c, bg(uv), ha * hb);
}
void main() {
	vec2 uv = cover(vUv);
	vec2 gv = uv * uCropScale + uCropOff;   // full-photo uv: every procedural term below uses it
	vec3 base = texture2D(uImg, uv).rgb;
	float fgA = texture2D(uMask, uv).g;
	float t = uTime;
	vec4 f = texture2D(uFlow, uv);
	vec2 dir = (f.rg * 2. - 1.) * f.b;
	// Right side and the area above the head get extra travel (slower near the burst centre).
	float rightGain = smoothstep(.42, .88, gv.x);
	vec2 hp = (gv - vec2(.52, .15)) * vec2(1., uFullSize.y / uFullSize.x);
	float headGain = exp(-dot(hp, hp) / .012);
	float gain = 1. + .5 * rightGain + .8 * headGain;
	vec3 sp = texture2D(uSpeed, uv).rgb;   // r: slow-down distance, g: edge-fix weight, b: real plate hole
	float mb = mix(.45, 1., smoothstep(0., uEdge * .5, sp.r));
	vec2 d = vec2(dir.x, dir.y * uFullSize.x / uFullSize.y) * .017 * uAmp * mb * mb * gain;
	// Two phase-shifted layers cross-faded into a seamless loop.
	float cyc = t * .135 + noise(gv * 2.6) * 1.7;
	float p0 = fract(cyc), p1 = fract(cyc + .5);
	float w = abs(1. - 2. * p0);
	vec2 g0 = -d * (p0 - .5), g1 = -d * (p1 - .5);   // offsets in full-photo uv
	vec2 o0 = g0 / uCropScale, o1 = g1 / uCropScale;   // the same offsets in texture uv
	vec2 u0 = uv + o0, u1 = uv + o1;
	float e0 = fbm((gv + g0) * vec2(26., 19.5) + floor(cyc) * 7.13), e1 = fbm((gv + g1) * vec2(26., 19.5) + floor(cyc + .5) * 7.13 + 3.7);
	vec3 col = mix(bgOff(uv, o0), bgOff(uv, o1), w);
	float we = w;
	if (sp.g > 0.) {
		// Back and laptop edges only: drop a layer whose sample lands behind the performer.
		float a0 = (1. - w) * (1. - texture2D(uSpeed, u0).b), a1 = w * (1. - texture2D(uSpeed, u1).b);
		float aw = a0 + a1;
		vec3 cn = (bg(u0) * a0 + bg(u1) * a1) / max(aw, 1e-4);
		cn = mix(bg(uv), cn, smoothstep(0., .12, aw));
		col = mix(col, cn, sp.g);
		we = mix(w, a1 / max(a0 + a1, 1e-4), sp.g);
	}
	float lum = dot(col, vec3(.299, .587, .114));
	col *= 1. + (mix(e0, e1, we) - .5) * .55 * uAmp * gain * smoothstep(.25, .8, lum);
	// Add only the change of the background, weighted by how much background the pixel shows.
	gl_FragColor = vec4(clamp(base + (1. - fgA) * (col - bg(uv)), 0., 1.), 1.);
}
`;

function createRenderer(target) {
	const gl = target.getContext('webgl', { antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
	if (!gl) return null;

	function compile(type, source) {
		const shader = gl.createShader(type);
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile failed.');
		return shader;
	}

	const program = gl.createProgram();
	gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
	// Android only: the exact lattice hash (see EXACT_HASH). Desktop and iOS compile the shader unchanged.
	const android = navigator.userAgentData?.platform === 'Android' || /Android/i.test(navigator.userAgent);
	gl.attachShader(program, compile(gl.FRAGMENT_SHADER, android ? `#define EXACT_HASH\n${FRAGMENT_SHADER}` : FRAGMENT_SHADER));
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Shader link failed.');
	gl.useProgram(program);

	gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
	const position = gl.getAttribLocation(program, 'aPos');
	gl.enableVertexAttribArray(position);
	gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

	const uniforms = {};
	for (const name of ['uImg', 'uMask', 'uFlow', 'uPlate', 'uSpeed', 'uRes', 'uImgSize', 'uFullSize', 'uCropScale', 'uCropOff', 'uAnchorY', 'uTime', 'uAmp', 'uEdge']) {
		uniforms[name] = gl.getUniformLocation(program, name);
	}
	['uImg', 'uMask', 'uFlow', 'uPlate', 'uSpeed'].forEach((name, unit) => gl.uniform1i(uniforms[name], unit));
	gl.uniform1f(uniforms.uAmp, AMP);
	gl.uniform1f(uniforms.uEdge, EDGE);

	const textures = [];
	function loadTexture(unit, src) {
		return new Promise((resolve, reject) => {
			const image = new Image();
			image.decoding = 'async';
			image.onload = () => {
				textures[unit] ??= gl.createTexture();
				gl.activeTexture(gl.TEXTURE0 + unit);
				gl.bindTexture(gl.TEXTURE_2D, textures[unit]);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
				resolve();
			};
			image.onerror = () => reject(new Error(`Motion texture failed: ${src}`));
			image.src = src;
		});
	}

	return {
		async load(variant, stillSource) {
			const asset = (name) => new URL(`${name}-${variant.suffix}.${name === 'plate-clean' ? 'webp' : 'png'}`, assetBase).href;
			await Promise.all([
				loadTexture(0, stillSource),
				loadTexture(1, asset('mask')),
				loadTexture(2, asset('flow-burst')),
				loadTexture(3, asset('plate-clean')),
				loadTexture(4, asset('speed-burst')),
			]);
			gl.uniform2f(uniforms.uImgSize, variant.width, variant.height);
			gl.uniform2f(uniforms.uFullSize, variant.fullWidth, variant.height);
			gl.uniform2f(uniforms.uCropScale, variant.width / variant.fullWidth, 1);
			gl.uniform2f(uniforms.uCropOff, variant.cropX / variant.fullWidth, 0);
			gl.uniform1f(uniforms.uAnchorY, variant.anchorY);
		},
		draw(time) {
			const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
			const width = Math.round(target.clientWidth * ratio);
			const height = Math.round(target.clientHeight * ratio);
			if (width === 0 || height === 0) return;
			if (target.width !== width || target.height !== height) {
				target.width = width;
				target.height = height;
			}
			gl.viewport(0, 0, width, height);
			gl.uniform2f(uniforms.uRes, width, height);
			gl.uniform1f(uniforms.uTime, time);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		},
	};
}

function initializeHeroMotion() {
	if (!(canvas instanceof HTMLCanvasElement) || !(still instanceof HTMLImageElement) || reduceQuery.matches) return;

	let renderer = null;
	try {
		renderer = createRenderer(canvas);
	} catch {
		renderer = null;
	}
	if (!renderer) return;

	const shell = canvas.closest('.photo-draft-shell');
	const panel = document.getElementById('photo-portal-panel');
	let variantKey = '';
	let ready = false;
	let time = 0;
	let last = 0;
	let frame = 0;
	let loading = null;

	// The landing hero is covered while a Portal panel is open (also on deep links).
	function heroVisible() {
		if (document.hidden || reduceQuery.matches) return false;
		if (panel instanceof HTMLElement && !panel.hidden) return false;
		const state = shell instanceof HTMLElement ? shell.dataset.portalShellState : undefined;
		return state === undefined || state === 'landing' || state === 'closing';
	}

	function tick(now) {
		frame = window.requestAnimationFrame(tick);
		if (now - last < FRAME_MS) return;
		const delta = last ? Math.min(now - last, 100) / 1000 : 0;
		last = now;
		time += delta * SPEED;
		renderer.draw(time);
	}

	function stop() {
		if (frame) window.cancelAnimationFrame(frame);
		frame = 0;
		last = 0;
	}

	function update() {
		if (ready && heroVisible()) {
			if (!frame) frame = window.requestAnimationFrame(tick);
		} else {
			stop();
		}
		if (reduceQuery.matches) canvas.classList.remove('is-ready');
	}

	function loadVariant() {
		const key = mobileQuery.matches ? 'mobile' : 'desktop';
		if (key === variantKey) return loading;
		variantKey = key;
		ready = false;
		stop();
		canvas.classList.remove('is-ready');
		const run = (async () => {
			// The still may still be resolving its <source> after a breakpoint change.
			if (!still.complete) await new Promise((resolve) => still.addEventListener('load', resolve, { once: true }));
			await renderer.load(VARIANTS[key], still.currentSrc || still.src);
			if (key !== variantKey) return;
			renderer.draw(time);
			ready = true;
			canvas.classList.add('is-ready');
			update();
		})().catch(() => {
			// Keep the still image; the canvas stays transparent.
			canvas.classList.remove('is-ready');
			ready = false;
			stop();
		});
		loading = run;
		return run;
	}

	document.addEventListener('visibilitychange', update);
	reduceQuery.addEventListener?.('change', update);
	mobileQuery.addEventListener?.('change', () => { void loadVariant(); });
	window.addEventListener('resize', () => { if (ready && !frame) renderer.draw(time); }, { passive: true });
	const observer = new MutationObserver(update);
	if (panel instanceof HTMLElement) observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
	if (shell instanceof HTMLElement) observer.observe(shell, { attributes: true, attributeFilter: ['data-portal-shell-state'] });

	void loadVariant();
}

// Textures load after the page (and its LCP image) has finished loading.
function scheduleHeroMotion() {
	const start = () => {
		if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(initializeHeroMotion, { timeout: 1500 });
		else window.setTimeout(initializeHeroMotion, 200);
	};
	if (document.readyState === 'complete') start();
	else window.addEventListener('load', start, { once: true });
}

scheduleHeroMotion();
