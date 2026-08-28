const validCategories = new Set(['all', 'music', 'live', 'tech']);
const directoryStates = new WeakMap();
const controlRootStates = new WeakMap();

function normalizeCategory(value) {
	return typeof value === 'string' && validCategories.has(value) ? value : 'all';
}

function cardCategories(card) {
	return [...card.classList]
		.filter((className) => className.startsWith('work_category-'))
		.map((className) => className.slice('work_category-'.length))
		.filter((slug) => validCategories.has(slug) && slug !== 'all');
}

function directoryCards(directory) {
	return [...directory.querySelectorAll('.works-grid > .wp-block-post')]
		.filter((card) => card instanceof HTMLElement);
}

function controlRootState(controlsRoot) {
	let rootState = controlRootStates.get(controlsRoot);
	if (rootState) return rootState;

	rootState = { directory: null };
	controlRootStates.set(controlsRoot, rootState);
	controlsRoot.addEventListener('click', (event) => {
		const button = event.target instanceof Element ? event.target.closest('[data-work-filter]') : null;
		const directory = rootState.directory;
		if (!(button instanceof HTMLButtonElement) || !controlsRoot.contains(button)) return;
		if (!(directory instanceof HTMLElement) || !directory.isConnected) return;
		const state = directoryStates.get(directory);
		const category = normalizeCategory(button.dataset.workFilter);
		if (typeof state?.onFilterRequest === 'function') {
			state.onFilterRequest({ directory, category, button });
			return;
		}
		setWorksFilter(directory, category);
	});
	return rootState;
}

export function setWorksFilter(directory, category, options = {}) {
	if (!(directory instanceof HTMLElement)) return { category: 'all', visibleCount: 0 };

	const normalized = normalizeCategory(category);
	const cards = directoryCards(directory);
	let visibleCount = 0;

	for (const card of cards) {
		const visible = normalized === 'all' || cardCategories(card).includes(normalized);
		card.hidden = !visible;
		if (visible) visibleCount += 1;
	}

	const state = directoryStates.get(directory);
	const controlsRoot = state?.controlsRoot instanceof Element ? state.controlsRoot : directory;
	for (const button of controlsRoot.querySelectorAll('[data-work-filter]')) {
		if (!(button instanceof HTMLButtonElement)) continue;
		button.setAttribute('aria-pressed', String(button.dataset.workFilter === normalized));
	}

	const empty = directory.querySelector('.works-directory__empty');
	if (empty instanceof HTMLElement) {
		empty.hidden = visibleCount !== 0;
		empty.classList.toggle('is-visible', visibleCount === 0);
	}
	directory.dataset.activeWorkCategory = normalized;

	const detail = { category: normalized, visibleCount };
	if (options.emit !== false) {
		directory.dispatchEvent(new CustomEvent('portfolio:works-filter-change', { bubbles: true, detail }));
		if (typeof state?.onFilterChange === 'function') state.onFilterChange(detail);
	}

	return detail;
}

export function initializeWorksDirectories(root = document, options = {}) {
	const directories = [];
	if (root instanceof Element && root.matches('.works-directory')) directories.push(root);
	if ('querySelectorAll' in root) directories.push(...root.querySelectorAll('.works-directory'));

	for (const directory of directories) {
		if (!(directory instanceof HTMLElement)) continue;
		let state = directoryStates.get(directory);
		if (!state) {
			state = { controlsRoot: directory, onFilterChange: null, onFilterRequest: null };
			directoryStates.set(directory, state);
		}

		const controlsRoot = options.controlsRoot instanceof HTMLElement ? options.controlsRoot : directory;
		state.controlsRoot = controlsRoot;
		const rootState = controlRootState(controlsRoot);
		rootState.directory = directory;

		state.onFilterChange = typeof options.onFilterChange === 'function' ? options.onFilterChange : null;
		state.onFilterRequest = typeof options.onFilterRequest === 'function' ? options.onFilterRequest : null;
		const empty = directory.querySelector('.works-directory__empty');
		if (empty instanceof HTMLElement) {
			empty.setAttribute('role', 'status');
			empty.setAttribute('aria-live', 'polite');
		}

		const selected = options.initialCategory
			?? controlsRoot.querySelector('[data-work-filter][aria-pressed="true"]')?.getAttribute('data-work-filter')
			?? 'all';
		setWorksFilter(directory, selected, { emit: false });
	}

	return directories;
}

function initializeDocumentDirectories() {
	initializeWorksDirectories(document);
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializeDocumentDirectories, { once: true });
} else {
	initializeDocumentDirectories();
}
