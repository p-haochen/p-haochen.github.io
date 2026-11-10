/**
 * Click-to-load YouTube for Work Details (Portal panel and Direct /works/<slug>/).
 *
 * The page shows only the video's still (.work-youtube). Pressing it swaps in
 * the official YouTube player, with the same embed URL and permissions the
 * page used before, plus autoplay so a single press starts playback where the
 * browser allows it (some phones still ask for one more tap inside the
 * player). Until then no YouTube player, script or ad request is made.
 *
 * Delegated on the document, so Work Details the Portal swaps in work too.
 */

const TRIGGER_SELECTOR = '.work-youtube';
const ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

function embedUrl(button) {
	const id = button.dataset.youtubeId ?? '';
	if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
	try {
		const url = new URL(button.dataset.youtubeSrc ?? '');
		if (url.protocol !== 'https:' || url.hostname !== 'www.youtube.com' || url.pathname !== `/embed/${id}`) return null;
		url.searchParams.set('autoplay', '1');
		return url.href;
	} catch {
		return null;
	}
}

function play(button) {
	const src = embedUrl(button);
	if (!src) return;
	const frame = document.createElement('iframe');
	frame.src = src;
	frame.title = button.dataset.youtubeTitle ?? 'YouTube video';
	frame.allow = ALLOW;
	frame.referrerPolicy = 'strict-origin-when-cross-origin';
	frame.allowFullscreen = true;
	const holder = button.parentElement;
	holder?.querySelector('noscript')?.remove();
	button.replaceWith(frame);
	frame.focus({ preventScroll: true });
}

document.addEventListener('click', (event) => {
	const button = event.target instanceof Element ? event.target.closest(TRIGGER_SELECTOR) : null;
	if (!(button instanceof HTMLButtonElement)) return;
	event.preventDefault();
	play(button);
});

// A video without a 1280px still answers with YouTube's 120px placeholder:
// fall back to the still every video has. (load / error do not bubble: capture.)
function usePosterFallback(event) {
	const image = event.target;
	if (!(image instanceof HTMLImageElement) || !image.classList.contains('work-youtube__poster')) return;
	const fallback = image.dataset.youtubeFallback ?? '';
	if (fallback === '' || image.src === fallback) return;
	if (event.type === 'error' || image.naturalWidth <= 120) {
		delete image.dataset.youtubeFallback;
		image.src = fallback;
	}
}
document.addEventListener('load', usePosterFallback, true);
document.addEventListener('error', usePosterFallback, true);
for (const image of document.querySelectorAll('.work-youtube__poster')) {
	if (image instanceof HTMLImageElement && image.complete) usePosterFallback({ target: image, type: image.naturalWidth === 0 ? 'error' : 'load' });
}
