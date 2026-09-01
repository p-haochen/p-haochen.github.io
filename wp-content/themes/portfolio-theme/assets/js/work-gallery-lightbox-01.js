const GALLERY_ITEM_SELECTOR = '[data-work-gallery-item]';
const FOCUSABLE_SELECTOR = 'button:not([hidden]):not([disabled]), a[href]:not([hidden]), [tabindex]:not([tabindex="-1"]):not([hidden])';

function galleryItemsFor(link) {
	const gallery = link.closest('.work-media-gallery');
	if (!(gallery instanceof HTMLElement)) return [];
	return [...gallery.querySelectorAll(GALLERY_ITEM_SELECTOR)].filter((item) => item instanceof HTMLAnchorElement);
}

function itemDescription(link) {
	const image = link.querySelector('img');
	if (image instanceof HTMLImageElement && image.alt.trim() !== '') return image.alt.trim();
	return link.getAttribute('aria-label')?.replace(/^Open image \d+ of \d+:\s*/i, '').trim() || 'Gallery image';
}

function createDialog() {
	const dialog = document.createElement('dialog');
	dialog.className = 'work-gallery-lightbox';
	dialog.setAttribute('role', 'dialog');
	dialog.setAttribute('aria-modal', 'true');
	dialog.setAttribute('aria-labelledby', 'work-gallery-lightbox-title');
	dialog.innerHTML = `
		<div class="work-gallery-lightbox__surface">
			<h2 id="work-gallery-lightbox-title" class="screen-reader-text">Image viewer</h2>
			<button class="work-gallery-lightbox__close" type="button" data-work-gallery-close aria-label="Close image viewer"><span aria-hidden="true">×</span></button>
			<button class="work-gallery-lightbox__previous" type="button" data-work-gallery-previous aria-label="Previous image"><span aria-hidden="true">‹</span></button>
			<figure class="work-gallery-lightbox__figure">
				<img class="work-gallery-lightbox__image" alt="">
				<figcaption class="work-gallery-lightbox__caption"><span data-work-gallery-counter></span></figcaption>
				<p class="work-gallery-lightbox__status" role="status" aria-live="polite" hidden></p>
			</figure>
			<button class="work-gallery-lightbox__next" type="button" data-work-gallery-next aria-label="Next image"><span aria-hidden="true">›</span></button>
		</div>`;
	return dialog;
}

export function initializeWorkGalleryLightbox(root = document) {
	if (!(root instanceof Document || root instanceof HTMLElement)) {
		return { close() {}, destroy() {} };
	}

	let dialog = null;
	let image = null;
	let title = null;
	let status = null;
	let counter = null;
	let previousButton = null;
	let nextButton = null;
	let closeButton = null;
	let origin = null;
	let items = [];
	let activeIndex = 0;
	let originObserver = null;

	function show(index) {
		if (!(dialog instanceof HTMLDialogElement) || !(image instanceof HTMLImageElement) || items.length === 0) return;
		activeIndex = (index + items.length) % items.length;
		const item = items[activeIndex];
		const description = itemDescription(item);
		const position = `${activeIndex + 1} / ${items.length}`;

		if (status instanceof HTMLElement) {
			status.hidden = true;
			status.textContent = '';
		}
		image.alt = description;
		image.src = item.href;
		if (title instanceof HTMLElement) title.textContent = `Image ${activeIndex + 1} of ${items.length}: ${description}`;
		if (counter instanceof HTMLElement) counter.textContent = position;
		if (previousButton instanceof HTMLButtonElement) previousButton.hidden = items.length < 2;
		if (nextButton instanceof HTMLButtonElement) nextButton.hidden = items.length < 2;
	}

	function close(options = {}) {
		if (!(dialog instanceof HTMLDialogElement)) return;
		const focusTarget = origin;
		originObserver?.disconnect();
		originObserver = null;
		document.documentElement.classList.remove('portfolio-lightbox-open');
		if (dialog.open) dialog.close();
		dialog.remove();
		dialog = null;
		image = null;
		title = null;
		status = null;
		counter = null;
		previousButton = null;
		nextButton = null;
		closeButton = null;
		origin = null;
		items = [];
		activeIndex = 0;
		if (options.restoreFocus !== false && focusTarget instanceof HTMLElement && focusTarget.isConnected) {
			focusTarget.focus({ preventScroll: true });
		}
	}

	function open(link) {
		const nextItems = galleryItemsFor(link);
		if (nextItems.length === 0) return;
		close({ restoreFocus: false });
		items = nextItems;
		activeIndex = Math.max(0, items.indexOf(link));
		origin = link;
		dialog = createDialog();
		image = dialog.querySelector('.work-gallery-lightbox__image');
		title = dialog.querySelector('#work-gallery-lightbox-title');
		status = dialog.querySelector('.work-gallery-lightbox__status');
		counter = dialog.querySelector('[data-work-gallery-counter]');
		previousButton = dialog.querySelector('[data-work-gallery-previous]');
		nextButton = dialog.querySelector('[data-work-gallery-next]');
		closeButton = dialog.querySelector('[data-work-gallery-close]');

		image?.addEventListener('load', () => {
			if (status instanceof HTMLElement) {
				status.hidden = true;
				status.textContent = '';
			}
		});
		image?.addEventListener('error', () => {
			if (status instanceof HTMLElement) {
				status.textContent = 'Full-size image could not be loaded.';
				status.hidden = false;
			}
		});

		document.body.append(dialog);
		document.documentElement.classList.add('portfolio-lightbox-open');
		show(activeIndex);
		dialog.showModal();
		closeButton?.focus({ preventScroll: true });

		originObserver = new MutationObserver(() => {
			if (!(origin instanceof HTMLElement) || !origin.isConnected) close({ restoreFocus: false });
		});
		originObserver.observe(document.body, { childList: true, subtree: true });
	}

	function handleClick(event) {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const galleryItem = target.closest(GALLERY_ITEM_SELECTOR);
		if (galleryItem instanceof HTMLAnchorElement) {
			event.preventDefault();
			open(galleryItem);
			return;
		}
		if (!(dialog instanceof HTMLDialogElement)) return;
		if (
			target.closest('[data-work-gallery-close]')
			|| target === dialog
			|| target.classList.contains('work-gallery-lightbox__surface')
			|| target.classList.contains('work-gallery-lightbox__figure')
		) {
			close();
			return;
		}
		if (target.closest('[data-work-gallery-previous]')) show(activeIndex - 1);
		if (target.closest('[data-work-gallery-next]')) show(activeIndex + 1);
	}

	function handleKeydown(event) {
		if (!(dialog instanceof HTMLDialogElement)) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
			return;
		}
		if (event.key === 'ArrowLeft' && items.length > 1) {
			event.preventDefault();
			show(activeIndex - 1);
			return;
		}
		if (event.key === 'ArrowRight' && items.length > 1) {
			event.preventDefault();
			show(activeIndex + 1);
			return;
		}
		if (event.key !== 'Tab') return;

		const focusable = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) => element instanceof HTMLElement && element.offsetParent !== null);
		if (focusable.length === 0) {
			event.preventDefault();
			return;
		}
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function handleRouteChange() {
		close({ restoreFocus: false });
	}

	root.addEventListener('click', handleClick);
	document.addEventListener('keydown', handleKeydown);
	window.addEventListener('hashchange', handleRouteChange);
	window.addEventListener('popstate', handleRouteChange);

	return {
		close,
		destroy() {
			close({ restoreFocus: false });
			root.removeEventListener('click', handleClick);
			document.removeEventListener('keydown', handleKeydown);
			window.removeEventListener('hashchange', handleRouteChange);
			window.removeEventListener('popstate', handleRouteChange);
		},
	};
}

if (typeof document !== 'undefined') initializeWorkGalleryLightbox(document);
