/*
 * Brand mark J (docs/prototypes/brand-mark).
 *
 * The Λ is a plucked string: a clean peak at rest; while music plays in the
 * pop-up player, or while the pointer is on the mark, the peak swings and a small
 * ripple runs along it. The role line decodes through every job credited to
 * PO HAO CHEN across the works (credits and ROLE terms, merged).
 */
const ROLES = [
	'COMPOSER', 'PRODUCER', 'SOUND DESIGN', 'MIXING', 'GUITARIST', 'BASSIST', 'ARRANGER', 'VOCAL PRODUCER',
	'MASTERING', 'AUDIO EDITING', 'KEYS / SYNTH', 'DRUM PROGRAMMING', 'BACKING VOCALS', 'VOCALIST',
	'MUSIC DIRECTOR', 'MUSIC DESIGN', 'BAND LEADER', 'SHOW PROGRAMMER', 'LIVE ELECTRONICS', 'SPATIAL AUDIO',
	'LIVE SOUND', 'RECORDING', 'STAGE MANAGER', 'SOFTWARE DEVELOPER',
];
const GLYPHS = '01<>/#%_=+*';
const ROLE_INTERVAL = 2400;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function init(brand) {
	const wave = brand.querySelector('.photo-draft__brand-wave');
	const role = brand.querySelector('[data-brand-role]');
	if (!(wave instanceof SVGPathElement) || !(role instanceof HTMLElement)) return;

	/* waveform */
	let hover = false;
	let playing = false;
	let frame = 0;
	let time = 0;
	const draw = (energy) => {
		let d = 'M11 10';
		for (let x = 0; x <= 30; x += 1) {
			const u = x / 30;
			const peak = 1 - Math.abs(u * 2 - 1);
			const swing = 1 - energy * (0.5 - 0.5 * Math.cos(time * 9)) * 0.6;
			const ripple = energy * 0.16 * Math.sin(u * Math.PI * 4 - time * 14) * Math.sin(Math.PI * u);
			d += ` L${(14 + x).toFixed(1)} ${(10 - 9 * (peak * swing + ripple)).toFixed(2)}`;
		}
		wave.setAttribute('d', `${d} L44 10`);
	};
	const active = () => (hover || playing) && !reduceMotion.matches && !document.hidden;
	const loop = () => {
		frame = 0;
		time += 0.012;
		const on = active();
		draw(on ? 1 : 0);
		if (on) frame = window.requestAnimationFrame(loop);
	};
	const wake = () => { if (!frame) frame = window.requestAnimationFrame(loop); };
	draw(0);
	brand.addEventListener('pointerenter', () => { hover = true; wake(); nextRole(); });
	brand.addEventListener('pointerleave', () => { hover = false; });
	brand.addEventListener('focus', () => { hover = true; wake(); });
	brand.addEventListener('blur', () => { hover = false; });

	// Follow the pop-up player: it marks itself .is-playing while music plays.
	const capsule = document.querySelector('[data-music-capsule]');
	if (capsule instanceof HTMLElement) {
		const sync = () => {
			playing = capsule.classList.contains('is-playing') && !capsule.hidden;
			wake();
		};
		new MutationObserver(sync).observe(capsule, { attributes: true, attributeFilter: ['class', 'hidden'] });
		sync();
	}

	/* role line */
	let index = 0;
	let decodeFrame = 0;
	const decode = (target) => {
		window.cancelAnimationFrame(decodeFrame);
		if (reduceMotion.matches) {
			role.textContent = target;
			return;
		}
		let start = 0;
		const step = (now) => {
			if (!start) start = now;
			const progress = Math.min(1, (now - start) / 480);
			const fixed = Math.floor(progress * target.length);
			role.textContent = target.slice(0, fixed) + [...target.slice(fixed)]
				.map((character) => (character === ' ' || character === '/' ? character : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
				.join('');
			if (progress < 1) decodeFrame = window.requestAnimationFrame(step);
		};
		decodeFrame = window.requestAnimationFrame(step);
	};
	function nextRole() {
		index = (index + 1) % ROLES.length;
		decode(ROLES[index]);
	}
	role.textContent = ROLES[0];
	// Reduced motion keeps the first role still; otherwise the line moves on while the page is visible.
	window.setInterval(() => {
		if (!reduceMotion.matches && !document.hidden && brand.getClientRects().length > 0) nextRole();
	}, ROLE_INTERVAL);
	document.addEventListener('visibilitychange', wake);
}

function boot() {
	document.querySelectorAll('[data-brand-mark]').forEach((brand) => init(brand));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
