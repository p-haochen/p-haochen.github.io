/**
 * SHARE for Work Details (Portal panel and Direct /works/<slug>/).
 *
 * Draws a 1080×1920 Story card (blurred cover backdrop, cover, category / year,
 * title, site mark) on a canvas and offers it through the device share sheet
 * (Web Share API with files), so it can be posted to an Instagram Story or any
 * other app. Where file sharing is unavailable the card can be saved and the
 * link copied. No third-party SDK and no network request beyond the cover image.
 */

const ROOT_SELECTOR = '.work-detail';
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1920;
const COLORS = Object.freeze({
	canvas: '#0b0c0f',
	ink: '#f0eee8',
	muted: '#aaa69f',
	ember: '#ed661c',
	line: 'rgba(240, 238, 232, 0.14)',
});
const SHARE_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 1.5 4.75 4.75l.9.9L7.36 3.94V10h1.28V3.94l1.71 1.71.9-.9z" fill="currentColor"/><path d="M3 7.5h2v1.25H4.25v4.5h7.5v-4.5H11V7.5h2v7H3z" fill="currentColor"/></svg>';

const instances = new WeakMap();

function readSource(root) {
	const script = root.querySelector('script[type="application/json"][data-work-share-source]');
	if (!(script instanceof HTMLScriptElement)) return null;
	try {
		const data = JSON.parse(script.textContent ?? '');
		if (!data || typeof data !== 'object' || typeof data.url !== 'string' || typeof data.title !== 'string') return null;
		const url = new URL(data.url, window.location.origin);
		if (url.origin !== window.location.origin) return null;
		const hero = root.querySelector('.work-detail__hero img');
		const cover = hero instanceof HTMLImageElement && (hero.currentSrc || hero.src)
			? hero.currentSrc || hero.src
			: typeof data.cover === 'string' && data.cover !== '' ? new URL(data.cover, window.location.origin).href : '';
		return {
			url: url.href,
			slug: url.pathname.split('/').filter(Boolean).pop() || 'work',
			title: data.title.trim() || document.title,
			category: typeof data.category === 'string' ? data.category.trim().toUpperCase() : '',
			year: typeof data.year === 'string' ? data.year.trim() : '',
			// Roles credited to PO HAO CHEN in this Work's Credits (may be empty).
			roles: Array.isArray(data.roles) ? data.roles.filter((role) => typeof role === 'string' && role.trim() !== '').map((role) => role.trim()) : [],
			cover,
		};
	} catch {
		return null;
	}
}

function loadImage(src) {
	return new Promise((resolve) => {
		if (!src) {
			resolve(null);
			return;
		}
		const image = new Image();
		image.decoding = 'async';
		image.onload = () => resolve(image);
		image.onerror = () => resolve(null);
		image.src = src;
	});
}

function fontFamilyOf(element, fallback) {
	if (!(element instanceof Element)) return fallback;
	const family = window.getComputedStyle(element).fontFamily;
	return family && family.trim() !== '' ? family : fallback;
}

function setSpacing(context, value) {
	if ('letterSpacing' in context) context.letterSpacing = value;
}

/** CJK characters break anywhere; Latin words and numbers stay whole. */
function tokens(text) {
	return text.match(/[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]|[^\s\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]+|\s+/g) ?? [];
}

const TITLE_OPENERS = new Set(['《', '【', '〈', '「', '『', '（', '(', '[', '〔']);
const TITLE_CLOSERS = new Set(['》', '】', '〉', '」', '』', '）', ')', ']', '〕']);

/**
 * Title wrap units, matching the Work Detail title (work-detail-j-01.js
 * titleSegments): break at spaces, before an opening bracket, after a closing
 * bracket and after "|"; a unit wider than the line falls back to tokens().
 */
function titleTokens(context, text, maxWidth) {
	const segments = [];
	let current = '';
	let depth = 0;
	let spaceBefore = false;
	const push = () => {
		if (current !== '') segments.push({ text: current, spaceBefore });
		current = '';
		spaceBefore = false;
	};
	for (const character of text.replace(/\s+/g, ' ').trim()) {
		if (character === ' ' && depth === 0) {
			push();
			spaceBefore = true;
			continue;
		}
		if (TITLE_OPENERS.has(character)) {
			if (depth === 0) push();
			depth += 1;
			current += character;
			continue;
		}
		current += character;
		if (TITLE_CLOSERS.has(character)) {
			depth = Math.max(0, depth - 1);
			if (depth === 0) push();
		} else if ((character === '|' || character === '｜') && depth === 0) {
			push();
		}
	}
	push();
	const out = [];
	for (const segment of segments) {
		if (segment.spaceBefore && out.length > 0) out.push(' ');
		if (context.measureText(segment.text).width <= maxWidth) out.push(segment.text);
		else out.push(...tokens(segment.text));
	}
	return out;
}

function wrapLines(context, text, maxWidth, maxLines, units = null) {
	const lines = [];
	let line = '';
	for (const token of units ?? tokens(text)) {
		const candidate = line + token;
		if (line !== '' && context.measureText(candidate.trimEnd()).width > maxWidth) {
			lines.push(line.trimEnd());
			line = token.trimStart();
		} else {
			line = candidate;
		}
	}
	if (line.trim() !== '') lines.push(line.trimEnd());
	if (lines.length <= maxLines) return { lines, overflow: false };
	const kept = lines.slice(0, maxLines);
	let last = kept[maxLines - 1];
	while (last.length > 1 && context.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
	kept[maxLines - 1] = `${last.trimEnd()}…`;
	return { lines: kept, overflow: true };
}

function containRect(image, boxX, boxY, boxW, boxH) {
	const scale = Math.min(boxW / image.naturalWidth, boxH / image.naturalHeight);
	const width = Math.round(image.naturalWidth * scale);
	const height = Math.round(image.naturalHeight * scale);
	return { x: Math.round(boxX + (boxW - width) / 2), y: boxY, width, height };
}

function drawBackdrop(context, image) {
	context.fillStyle = COLORS.canvas;
	context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
	if (image) {
		// Downsample then upscale: a soft colour field from the cover that works
		// in every browser (canvas `filter` is not universally supported).
		const small = document.createElement('canvas');
		small.width = 27;
		small.height = 48;
		const smallContext = small.getContext('2d');
		const scale = Math.max(small.width / image.naturalWidth, small.height / image.naturalHeight);
		const width = image.naturalWidth * scale;
		const height = image.naturalHeight * scale;
		smallContext.drawImage(image, (small.width - width) / 2, (small.height - height) / 2, width, height);
		context.save();
		context.imageSmoothingEnabled = true;
		context.imageSmoothingQuality = 'high';
		context.globalAlpha = 0.9;
		context.drawImage(small, -60, -60, CARD_WIDTH + 120, CARD_HEIGHT + 120);
		context.restore();
	}
	const shade = context.createLinearGradient(0, 0, 0, CARD_HEIGHT);
	shade.addColorStop(0, 'rgba(11, 12, 15, 0.42)');
	shade.addColorStop(0.5, 'rgba(11, 12, 15, 0.62)');
	shade.addColorStop(1, 'rgba(11, 12, 15, 0.92)');
	context.fillStyle = shade;
	context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

async function drawCard(source, root) {
	const sans = fontFamilyOf(root.querySelector('.work-detail__title'), '"Inter Variable", "Noto Sans TC", sans-serif');
	if (document.fonts?.load) {
		await Promise.allSettled([
			document.fonts.load(`700 76px ${sans}`, source.title),
			document.fonts.load(`600 30px ${sans}`, 'PO HAO CHEN MUSIC 0123456789'),
			document.fonts.load(`500 26px ${sans}`, source.roles.join(' / ') || 'PO HAO CHEN'),
		]);
	}
	const image = await loadImage(source.cover);
	const canvas = document.createElement('canvas');
	canvas.width = CARD_WIDTH;
	canvas.height = CARD_HEIGHT;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Canvas unavailable');
	drawBackdrop(context, image);

	const margin = 120;
	const column = CARD_WIDTH - margin * 2;
	let y = 230;

	// Cover: full image, never cropped (the site's media rule).
	if (image) {
		const rect = containRect(image, margin, y, column, column);
		context.save();
		context.shadowColor = 'rgba(0, 0, 0, 0.6)';
		context.shadowBlur = 90;
		context.shadowOffsetY = 36;
		context.fillStyle = COLORS.canvas;
		context.fillRect(rect.x, rect.y, rect.width, rect.height);
		context.restore();
		context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
		context.strokeStyle = COLORS.line;
		context.lineWidth = 2;
		context.strokeRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
		y = rect.y + rect.height;
	} else {
		y += 120;
	}

	// Eyebrow: CATEGORY —— YEAR, as on the Work Detail.
	y += 96;
	context.textBaseline = 'alphabetic';
	context.textAlign = 'left';
	context.font = `600 28px ${sans}`;
	setSpacing(context, '6px');
	context.fillStyle = COLORS.ember;
	let x = margin;
	if (source.category) {
		context.fillText(source.category, x, y);
		x += context.measureText(source.category).width + 26;
	}
	if (source.category && source.year) {
		context.fillStyle = 'rgba(237, 102, 28, 0.6)';
		context.fillRect(x, y - 10, 64, 2);
		x += 64 + 26;
		context.fillStyle = COLORS.ember;
	}
	if (source.year) context.fillText(source.year, x, y);
	setSpacing(context, '0px');

	// Title: up to three lines, a size step down for long titles.
	y += 44;
	let size = 80;
	let wrapped;
	do {
		context.font = `700 ${size}px ${sans}`;
		wrapped = wrapLines(context, source.title, column, 3, titleTokens(context, source.title, column));
		if (!wrapped.overflow && wrapped.lines.length <= 2) break;
		size -= 8;
	} while (size >= 60);
	context.fillStyle = COLORS.ink;
	const lineHeight = Math.round(size * 1.2);
	for (const line of wrapped.lines) {
		y += lineHeight;
		context.fillText(line, margin, y - Math.round(size * 0.2));
	}

	// Footer: name, his roles in this Work's Credits (none when not credited), address.
	const footerY = CARD_HEIGHT - 190;
	context.fillStyle = COLORS.line;
	context.fillRect(margin, footerY - 78, column, 2);
	context.font = `700 34px ${sans}`;
	setSpacing(context, '7px');
	context.fillStyle = COLORS.ink;
	context.fillText('PO HAO CHEN', margin, footerY);
	if (source.roles.length > 0) {
		context.font = `500 26px ${sans}`;
		setSpacing(context, '1px');
		context.fillStyle = COLORS.ember;
		// Wrap between roles, never inside one (a role wider than the line falls back to tokens()).
		const roleUnits = source.roles.flatMap((role, index) => {
			const unit = index < source.roles.length - 1 ? `${role} / ` : role;
			return context.measureText(unit).width <= column ? [unit] : tokens(unit);
		});
		const roles = wrapLines(context, source.roles.join(' / '), column, 2, roleUnits);
		roles.lines.forEach((line, index) => context.fillText(line, margin, footerY + 46 + index * 38));
	}
	setSpacing(context, '1px');
	context.font = `500 28px ${sans}`;
	context.fillStyle = COLORS.muted;
	context.textAlign = 'right';
	context.fillText(new URL(source.url).host, CARD_WIDTH - margin, footerY);
	context.textAlign = 'left';
	setSpacing(context, '0px');

	const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
	if (!(blob instanceof Blob)) throw new Error('Card could not be encoded');
	return blob;
}

async function copyText(text) {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		const field = document.createElement('textarea');
		field.value = text;
		field.setAttribute('readonly', '');
		field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
		document.body.append(field);
		field.select();
		let copied = false;
		try {
			copied = document.execCommand('copy');
		} catch {
			copied = false;
		}
		field.remove();
		return copied;
	}
}

function openShareDialog(root, trigger) {
	const source = readSource(root);
	if (!source) return;
	const dialog = document.createElement('dialog');
	dialog.className = 'work-share';
	dialog.setAttribute('aria-labelledby', 'work-share-title');
	dialog.innerHTML = `
		<div class="work-share__surface">
			<div class="work-share__head">
				<h2 id="work-share-title" class="work-share__title">SHARE</h2>
				<button class="work-share__close" type="button" data-work-share-close aria-label="Close share"><span aria-hidden="true">×</span></button>
			</div>
			<div class="work-share__preview" aria-busy="true"><img alt="" hidden></div>
			<p class="work-share__status" role="status" aria-live="polite">Preparing image…</p>
			<div class="work-share__actions">
				<button class="work-share__button work-share__button--primary" type="button" data-work-share-image hidden disabled>SHARE IMAGE</button>
				<button class="work-share__button" type="button" data-work-share-save disabled>SAVE IMAGE</button>
				<button class="work-share__button" type="button" data-work-share-copy>COPY LINK</button>
			</div>
			<p class="work-share__hint">Instagram Story: share the image, then add a Link sticker — the link is copied for you.</p>
		</div>`;
	const preview = dialog.querySelector('.work-share__preview');
	const previewImage = preview.querySelector('img');
	const status = dialog.querySelector('.work-share__status');
	const shareButton = dialog.querySelector('[data-work-share-image]');
	const saveButton = dialog.querySelector('[data-work-share-save]');
	const copyButton = dialog.querySelector('[data-work-share-copy]');
	let file = null;
	let objectUrl = '';
	let closed = false;

	const close = () => {
		if (closed) return;
		closed = true;
		if (dialog.open) dialog.close();
		dialog.remove();
		if (objectUrl) URL.revokeObjectURL(objectUrl);
		document.documentElement.classList.remove('work-share-open');
		if (trigger.isConnected) trigger.focus({ preventScroll: true });
	};

	dialog.addEventListener('cancel', (event) => {
		event.preventDefault();
		close();
	});
	dialog.addEventListener('keydown', (event) => {
		// Keep Escape from also reaching the Portal panel or gallery handlers.
		if (event.key === 'Escape') event.stopPropagation();
	});
	dialog.addEventListener('click', (event) => {
		if (event.target === dialog || event.target.closest?.('[data-work-share-close]')) close();
	});

	shareButton.addEventListener('click', () => {
		if (!file) return;
		// Copy first (no await) so the share call keeps the tap's user activation.
		void copyText(source.url);
		navigator.share({ files: [file], title: source.title }).then(() => {
			status.textContent = 'Shared. The link is on your clipboard for a Link sticker.';
		}).catch((error) => {
			if (error?.name === 'AbortError') return;
			status.textContent = 'Sharing is not available here. Save the image instead.';
		});
	});
	saveButton.addEventListener('click', () => {
		if (!objectUrl) return;
		const link = document.createElement('a');
		link.href = objectUrl;
		link.download = `${source.slug}-story.png`;
		document.body.append(link);
		link.click();
		link.remove();
		status.textContent = 'Image saved.';
	});
	copyButton.addEventListener('click', async () => {
		status.textContent = (await copyText(source.url)) ? 'Link copied.' : 'Could not copy the link.';
	});

	document.body.append(dialog);
	document.documentElement.classList.add('work-share-open');
	dialog.showModal();
	dialog.querySelector('[data-work-share-close]').focus({ preventScroll: true });

	drawCard(source, root).then((blob) => {
		if (closed) return;
		file = new File([blob], `${source.slug}-story.png`, { type: 'image/png' });
		objectUrl = URL.createObjectURL(blob);
		previewImage.src = objectUrl;
		previewImage.alt = `Story image: ${source.title}`;
		previewImage.hidden = false;
		preview.removeAttribute('aria-busy');
		const canShareFile = typeof navigator.share === 'function'
			&& typeof navigator.canShare === 'function'
			&& navigator.canShare({ files: [file] });
		shareButton.hidden = !canShareFile;
		shareButton.disabled = !canShareFile;
		saveButton.disabled = false;
		status.textContent = canShareFile ? 'Ready to share.' : 'Ready. Save the image to post it.';
	}).catch(() => {
		if (closed) return;
		preview.removeAttribute('aria-busy');
		status.textContent = 'The image could not be prepared. You can still copy the link.';
	});
}

function init(root) {
	if (instances.has(root)) return;
	const actions = root.querySelector('[data-work-detail-actions]');
	if (!(actions instanceof HTMLElement) || !readSource(root)) return;
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'work-detail__share';
	button.setAttribute('aria-haspopup', 'dialog');
	button.innerHTML = `${SHARE_ICON}<span>SHARE</span>`;
	const onClick = () => openShareDialog(root, button);
	button.addEventListener('click', onClick);
	actions.append(button);
	actions.hidden = false;
	instances.set(root, {
		teardown() {
			button.removeEventListener('click', onClick);
			button.remove();
			instances.delete(root);
		},
	});
}

function scan(scope) {
	if (scope instanceof Element && scope.matches(ROOT_SELECTOR)) init(scope);
	scope.querySelectorAll?.(ROOT_SELECTOR).forEach((root) => init(root));
}

function boot() {
	scan(document);
	new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) if (node instanceof Element) scan(node);
			for (const node of mutation.removedNodes) {
				if (!(node instanceof Element)) continue;
				const removed = node.matches(ROOT_SELECTOR) ? [node] : [...node.querySelectorAll(ROOT_SELECTOR)];
				for (const root of removed) if (!root.isConnected) instances.get(root)?.teardown();
			}
		}
	}).observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
