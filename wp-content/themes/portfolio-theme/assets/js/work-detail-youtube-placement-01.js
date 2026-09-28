const workDetailSelector = '.work-detail';
const youtubeSectionSelector = '.work-media-embed--youtube';
const audioSectionSelector = '.work-detail-audio';
const desktopLayout = window.matchMedia('(min-width: 761px)');
const minimumContentClearance = 24;
const activeWorkDetailPlacements = new Map();

function createMediaPlacementController(root) {
	const visual = root.querySelector('.work-detail__visual');
	const postContent = root.querySelector('.work-detail__post-content');
	const sections = [
		...[...root.querySelectorAll(youtubeSectionSelector)].map((section) => ({ section, target: 'visual' })),
		...[...root.querySelectorAll(audioSectionSelector)].map((section) => ({ section, target: 'copy' })),
	]
		.map(({ section, target }) => {
			const sourceParent = section.parentElement;
			const sourceMedia = section.closest('.work-media');
			if (!(sourceParent instanceof HTMLElement) || !(sourceMedia instanceof HTMLElement)) return null;

			const marker = document.createComment('work-media-placement');
			sourceParent.insertBefore(marker, section);
			return { section, target, sourceParent, sourceMedia, marker };
		})
		.filter(Boolean);

	if (!(visual instanceof HTMLElement) || !(postContent instanceof HTMLElement) || sections.length === 0) return null;

	const hiddenMediaContainers = new Set();
	let scheduledFrame = 0;
	let active = true;

	function restoreSection(entry) {
		if (entry.section.parentNode !== entry.sourceParent) {
			entry.sourceParent.insertBefore(entry.section, entry.marker.nextSibling);
		}
	}

	function revealManagedMedia() {
		for (const media of hiddenMediaContainers) media.hidden = false;
		hiddenMediaContainers.clear();
	}

	function restoreAllSections() {
		for (const entry of sections) restoreSection(entry);
		revealManagedMedia();
	}

	function hideEmptyMedia(media) {
		if (media.children.length === 0 && !media.hidden) {
			media.hidden = true;
			hiddenMediaContainers.add(media);
		}
	}

	function revealMediaIfNeeded(media) {
		if (hiddenMediaContainers.has(media)) {
			media.hidden = false;
			hiddenMediaContainers.delete(media);
		}
	}

	function playbackControlsFit(section) {
		const now = section.querySelector('.music-collection__now');
		if (!(now instanceof HTMLElement)) return false;

		const bounds = now.getBoundingClientRect();
		const controls = [...section.querySelectorAll('.music-collection__previous, .music-collection__play, .music-collection__next, .music-collection__volume-toggle, [data-music-collection-volume]')];
		if (controls.length !== 5) return false;

		const contained = controls.every((control) => {
			const rect = control.getBoundingClientRect();
			return rect.left >= bounds.left - 1 && rect.top >= bounds.top - 1
				&& rect.right <= bounds.right + 1 && rect.bottom <= bounds.bottom + 1;
		});
		const next = section.querySelector('.music-collection__next')?.getBoundingClientRect();
		const volume = section.querySelector('.music-collection__volume-toggle')?.getBoundingClientRect();
		const overlap = next && volume && next.right > volume.left + 1 && next.left < volume.right - 1
			&& next.top < volume.bottom - 1 && next.bottom > volume.top + 1;
		return contained && !overlap;
	}

	function placeFittingPlayers() {
		scheduledFrame = 0;
		if (!active) return;

		restoreAllSections();
		if (!root.isConnected || !desktopLayout.matches) return;

		const contentRect = postContent.getBoundingClientRect();
		if (contentRect.width <= 0 || contentRect.height <= 0) return;

		for (const entry of sections.filter((section) => section.target === 'visual')) {
			if (!entry.section.isConnected || !entry.sourceParent.isConnected) continue;

			visual.append(entry.section);
			hideEmptyMedia(entry.sourceMedia);

			const playerRect = entry.section.getBoundingClientRect();
			const currentContentRect = postContent.getBoundingClientRect();
			const fitsBesideCopy = playerRect.width > 0
				&& playerRect.height > 0
				&& currentContentRect.height > 0
				&& playerRect.bottom <= currentContentRect.bottom - minimumContentClearance;

			if (!fitsBesideCopy) {
				restoreSection(entry);
				revealMediaIfNeeded(entry.sourceMedia);
			}
		}

		for (const entry of sections.filter((section) => section.target === 'copy')) {
			if (!entry.section.isConnected || !entry.sourceParent.isConnected) continue;

			postContent.append(entry.section);
			hideEmptyMedia(entry.sourceMedia);

			const playerRect = entry.section.getBoundingClientRect();
			const visualRect = visual.getBoundingClientRect();
			const fitsBelowCopy = playerRect.width > 0
				&& playerRect.height > 0
				&& visualRect.height > 0
				&& playerRect.bottom <= visualRect.bottom - minimumContentClearance
				&& playbackControlsFit(entry.section);

			if (!fitsBelowCopy) {
				restoreSection(entry);
				revealMediaIfNeeded(entry.sourceMedia);
			}
		}
	}

	function schedulePlacement() {
		if (!active || scheduledFrame) return;
		scheduledFrame = window.requestAnimationFrame(placeFittingPlayers);
	}

	const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(schedulePlacement) : null;
	for (const target of [
		root.querySelector('.work-detail__layout'),
		visual,
		root.querySelector('.work-detail__hero'),
		root.querySelector('.work-detail__metadata'),
		postContent,
		...sections.map((entry) => entry.section),
	]) {
		if (target instanceof HTMLElement) resizeObserver?.observe(target);
	}

	window.addEventListener('resize', schedulePlacement, { passive: true });
	window.addEventListener('orientationchange', schedulePlacement);
	if (typeof desktopLayout.addEventListener === 'function') desktopLayout.addEventListener('change', schedulePlacement);
	else desktopLayout.addListener(schedulePlacement);
	window.addEventListener('load', schedulePlacement, true);
	document.fonts?.ready?.then(schedulePlacement).catch(() => {});

	placeFittingPlayers();

	return {
		destroy() {
			if (!active) return;
			active = false;
			if (scheduledFrame) window.cancelAnimationFrame(scheduledFrame);
			resizeObserver?.disconnect();
			window.removeEventListener('resize', schedulePlacement);
			window.removeEventListener('orientationchange', schedulePlacement);
			if (typeof desktopLayout.removeEventListener === 'function') desktopLayout.removeEventListener('change', schedulePlacement);
			else desktopLayout.removeListener(schedulePlacement);
			window.removeEventListener('load', schedulePlacement, true);
			restoreAllSections();
			for (const entry of sections) entry.marker.remove();
		},
	};
}

function initializeWorkDetailMediaPlacement(root) {
	if (!(root instanceof HTMLElement) || activeWorkDetailPlacements.has(root)) return;
	const controller = createMediaPlacementController(root);
	if (controller) activeWorkDetailPlacements.set(root, controller);
}

function initializeWorkDetailsWithin(node) {
	if (node instanceof Element && node.matches(workDetailSelector)) initializeWorkDetailMediaPlacement(node);
	if (node instanceof Element) {
		for (const root of node.querySelectorAll(workDetailSelector)) initializeWorkDetailMediaPlacement(root);
	}
}

function observeWorkDetails() {
	if (!(document.body instanceof HTMLElement)) return;

	initializeWorkDetailsWithin(document.body);
	const contentObserver = new MutationObserver((records) => {
		for (const record of records) {
			for (const node of record.addedNodes) initializeWorkDetailsWithin(node);
		}

		for (const [root, controller] of activeWorkDetailPlacements) {
			if (!root.isConnected) {
				controller.destroy();
				activeWorkDetailPlacements.delete(root);
			}
		}
	});
	contentObserver.observe(document.body, { childList: true, subtree: true });
}

if (document.body instanceof HTMLElement) observeWorkDetails();
else document.addEventListener('DOMContentLoaded', observeWorkDetails, { once: true });
