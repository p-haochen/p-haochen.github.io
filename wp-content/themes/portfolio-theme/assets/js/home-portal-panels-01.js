import { initializeWorksDirectories, setWorksFilter } from './works-directory-01.js';
import { initializeWorksMultiView, setWorksView } from './works-multiview-01.js';
import { createMusicPlayer } from './music-player-01.js';
import { initializeWorkDetailAudio } from './work-detail-audio-01.js';

const siteHeader = document.querySelector('#photo-draft-site-header');
const landing = document.querySelector('#photo-draft-landing');
const panel = document.querySelector('#photo-portal-panel');
const shell = panel instanceof HTMLElement ? panel.closest('.photo-draft-shell') : null;

if (shell instanceof HTMLElement && siteHeader instanceof HTMLElement && landing instanceof HTMLElement && panel instanceof HTMLElement) {
	const navigation = siteHeader.querySelector('.photo-draft__navigation');
	const brandLink = siteHeader.querySelector('.photo-draft__brand');
	const panelTitle = panel.querySelector('#photo-portal-panel-title');
	const panelHeader = panel.querySelector('.photo-portal__header');
	const contextualControls = panel.querySelector('.photo-portal__contextual-controls');
	const closeButton = panel.querySelector('.photo-portal__close');
	const scroller = panel.querySelector('.photo-portal__scroller');
	const routeRail = panel.querySelector('.photo-portal__route-rail');
	const status = panel.querySelector('.photo-portal__status');
	const content = panel.querySelector('.photo-portal__content');
	const errorRegion = panel.querySelector('.photo-portal__error');
	const errorMessage = panel.querySelector('.photo-portal__error-message');
	const fallbackLink = panel.querySelector('.photo-portal__fallback');
	const musicPlayerRoot = shell.querySelector('[data-music-player]');
	const endpointBase = shell.dataset.portalEndpoint;
	const workEndpointBase = shell.dataset.portfolioWorkEndpoint;
	const staticDataBase = shell.dataset.portalStaticBase ?? '';

	if (
		navigation instanceof HTMLElement
		&& brandLink instanceof HTMLAnchorElement
		&& panelTitle instanceof HTMLElement
		&& panelHeader instanceof HTMLElement
		&& contextualControls instanceof HTMLElement
		&& closeButton instanceof HTMLButtonElement
		&& scroller instanceof HTMLElement
		&& routeRail instanceof HTMLElement
		&& status instanceof HTMLElement
		&& content instanceof HTMLElement
		&& errorRegion instanceof HTMLElement
		&& errorMessage instanceof HTMLElement
		&& fallbackLink instanceof HTMLAnchorElement
		&& typeof endpointBase === 'string'
		&& endpointBase !== ''
	) {
		const supportedMotionModes = new Set(['slide-up', 'fade']);
		const requestedMotionMode = new URLSearchParams(window.location.search).get('portal-motion');
		const defaultMotionMode = supportedMotionModes.has(shell.dataset.portalDefaultMotion)
			? shell.dataset.portalDefaultMotion
			: 'baseline';
		const hasRequestedMotion = supportedMotionModes.has(requestedMotionMode);
		const motionMode = hasRequestedMotion ? requestedMotionMode : defaultMotionMode;
		const isMotionStudy = motionMode !== 'baseline';
		const supportedShellModes = new Set(['brand-on-open', 'frame-on-open', 'frame-on-open-soft', 'frame-on-open-b2', 'frame-on-open-b3']);
		const requestedShellMode = new URLSearchParams(window.location.search).get('portal-shell');
		const defaultShellMode = supportedShellModes.has(shell.dataset.portalDefaultShell)
			? shell.dataset.portalDefaultShell
			: 'existing';
		const shellMode = hasRequestedMotion
			? (motionMode === 'fade' && supportedShellModes.has(requestedShellMode) ? requestedShellMode : 'existing')
			: (motionMode === 'fade' ? defaultShellMode : 'existing');
		const isShellComparison = shellMode !== 'existing';
		const isRefinedFrameMotion = shellMode === 'frame-on-open-soft';
		const isB2Motion = shellMode === 'frame-on-open-b2';
		const isB3Motion = shellMode === 'frame-on-open-b3';
		shell.dataset.portalMotionMode = motionMode;
		shell.dataset.portalShellMode = shellMode;

		const panelDefinitions = Object.freeze({
			work: {
				hash: '#work',
				payloadSlug: 'work',
				title: 'WORKS',
				railLabel: 'PORTFOLIO',
				canonicalPath: '/work/',
			},
			services: {
				hash: '#services',
				payloadSlug: 'services',
				title: 'Services',
				canonicalPath: '/services/',
			},
			about: {
				hash: '#about',
				payloadSlug: 'about',
				title: 'About',
				canonicalPath: '/about/',
			},
			cv: {
				hash: '#cv',
				payloadSlug: 'about',
				title: 'CV',
				railLabel: 'CV',
				canonicalPath: '/about/#cv-placeholder',
			},
			contact: {
				hash: '#contact',
				payloadSlug: 'contact',
				title: 'Contact',
				railLabel: 'CONTACT',
				canonicalPath: '/contact/',
			},
		});
		const cache = new Map();
		const b2PayloadRequests = new Map();
		const b3PayloadRequests = new Map();
		const dynamicWorkDefinitions = new Map();
		const triggers = [];
		const baseUrl = new URL(window.location.href);
		baseUrl.hash = '';
		let currentKey = null;
		let restoreTarget = null;
		let activeController = null;
		let activeRequestToken = 0;
		let activeRenderToken = 0;
		let activeCloseToken = 0;
		let activeVisualController = null;
		let activeCloseController = null;
		let hasKnownBaseEntry = false;
		let b2PrefetchScheduled = false;
		let b3PrefetchScheduled = false;
		let activeB3PreparationController = null;
		let activeB3PreparationToken = 0;
		let b3BusyElement = null;
		let b3LiveRegion = null;
		let preferredLanguageCode = null;
		let pendingWorksRestoration = null;
		let activeWorksFilterController = null;
		let activeWorksFilterToken = 0;
		const musicPlayer = createMusicPlayer(musicPlayerRoot);
		let activeWorkDetailAudio = null;
		let activeWorksMultiView = null;

		function destroyWorksMultiView() {
			activeWorksMultiView?.destroy();
			activeWorksMultiView = null;
		}

		function destroyWorkDetailAudio(controller) {
			if (!controller || activeWorkDetailAudio !== controller) return;
			controller.destroy();
			activeWorkDetailAudio = null;
		}

		function destroyActiveWorkDetailAudio() {
			destroyWorkDetailAudio(activeWorkDetailAudio);
		}

		function mountWorkDetailAudio(key) {
			destroyActiveWorkDetailAudio();
			if (definitionForKey(key)?.kind !== 'work-detail') return;
			const audioRoot = content.querySelector('[data-work-detail-audio]');
			activeWorkDetailAudio = initializeWorkDetailAudio(audioRoot, { player: musicPlayer });
			return activeWorkDetailAudio;
		}

		function definitionForKey(key) {
			return panelDefinitions[key] ?? dynamicWorkDefinitions.get(key) ?? null;
		}

		function definitionCacheKey(definition) {
			return definition.cacheKey ?? definition.payloadSlug;
		}

		function definitionRequestUrl(definition) {
			if (staticDataBase !== '') {
				const normalizedBase = staticDataBase.endsWith('/') ? staticDataBase : `${staticDataBase}/`;
				if (definition.kind === 'work-detail') return `${normalizedBase}works/${definition.postId}.json`;
				return `${normalizedBase}panels/${definition.payloadSlug}.json`;
			}
			return definition.requestUrl ?? `${endpointBase}${definition.payloadSlug}`;
		}

		function definitionCanonicalUrl(definition) {
			return definition.canonicalUrl ?? new URL(definition.canonicalPath, `${window.location.origin}/`).href;
		}

		function createWorkDefinition(postId, title, canonicalUrl) {
			if (!isB3Motion || typeof workEndpointBase !== 'string' || workEndpointBase === '') return null;
			if (!Number.isInteger(postId) || postId < 1 || typeof title !== 'string' || title.trim() === '') return null;

			let targetUrl;
			try {
				targetUrl = new URL(canonicalUrl, window.location.href);
			} catch {
				return null;
			}
			if (targetUrl.origin !== window.location.origin || !/^\/works\/[^/]+\/$/.test(targetUrl.pathname)) return null;

			const key = `work:${postId}`;
			const definition = {
				key,
				cacheKey: key,
				postId,
				title: title.trim(),
				railLabel: 'PORTFOLIO',
				canonicalUrl: targetUrl.href,
				canonicalPath: `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`,
				requestUrl: `${workEndpointBase}${postId}`,
				kind: 'work-detail',
			};
			dynamicWorkDefinitions.set(key, definition);
			return definition;
		}

		function workDefinitionFromHistory(state) {
			if (typeof state?.portfolioPanel !== 'string' || !state.portfolioPanel.startsWith('work:')) return null;
			return createWorkDefinition(
				Number.parseInt(String(state.portfolioWorkId), 10),
				state.portfolioWorkTitle,
				state.portfolioWorkUrl,
			);
		}

		function normalizeLanguageVariants(payload) {
			if (!Array.isArray(payload?.language_variants) || payload.language_variants.length < 2) return [];

			const variants = [];
			const codes = new Set();
			for (const candidate of payload.language_variants) {
				if (typeof candidate !== 'object' || candidate === null) return [];
				const code = typeof candidate.code === 'string' ? candidate.code.trim() : '';
				const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
				const html = typeof candidate.html === 'string' ? candidate.html.trim() : '';
				if (code === '' || label === '' || html === '' || codes.has(code)) return [];
				codes.add(code);
				variants.push({ code, label, html });
			}

			return variants;
		}

		function languagePresentation(payload) {
			const variants = normalizeLanguageVariants(payload);
			if (variants.length < 2) return { variants: [], selected: null, html: payload.html };

			const selected = variants.find((variant) => variant.code === preferredLanguageCode) ?? variants[0];
			return { variants, selected, html: selected.html };
		}

		function clearLanguageControl() {
			panelHeader.querySelector('.photo-portal__language')?.remove();
			panelHeader.classList.remove('has-language-control');
		}

		function clearContextualControls() {
			contextualControls.replaceChildren();
			panelHeader.classList.remove('has-contextual-controls');
		}

		function syncRouteRail(definition) {
			const label = isB3Motion && typeof definition?.railLabel === 'string'
				? definition.railLabel
				: '';
			routeRail.textContent = label;
			routeRail.hidden = label === '';
			panel.classList.toggle('has-route-rail', label !== '');
		}

		function clearRouteRail() {
			routeRail.textContent = '';
			routeRail.hidden = true;
			panel.classList.remove('has-route-rail');
		}

		function mountWorksContextualControls(directory) {
			clearContextualControls();
			const filters = directory.querySelector('.works-directory__filters');
			if (!(filters instanceof HTMLElement)) return false;

			contextualControls.append(filters);
			panelHeader.classList.add('has-contextual-controls');
			return true;
		}

		function prepareIncomingPortalFragment(key, fragment) {
			if (!isB3Motion || key !== 'work') return;
			const duplicateHeading = fragment.querySelector('.works-directory__title');
			if (!(duplicateHeading instanceof HTMLElement)) return;
			duplicateHeading.hidden = true;
			duplicateHeading.setAttribute('aria-hidden', 'true');
			duplicateHeading.removeAttribute('tabindex');
			duplicateHeading.removeAttribute('id');
		}

		function configureRenderedContentHeading(shouldFocus) {
			if (!isMotionStudy) return;
			const definition = currentKey === null ? null : definitionForKey(currentKey);
			panelTitle.setAttribute('aria-hidden', 'true');
			panelTitle.removeAttribute('tabindex');

			if (isB3Motion && currentKey === 'work') {
				const duplicateHeading = content.querySelector('.works-directory__title');
				if (duplicateHeading instanceof HTMLElement) {
					duplicateHeading.hidden = true;
					duplicateHeading.setAttribute('aria-hidden', 'true');
					duplicateHeading.removeAttribute('tabindex');
					duplicateHeading.removeAttribute('id');
				}

				panelTitle.removeAttribute('aria-hidden');
				panelTitle.tabIndex = -1;
				panel.removeAttribute('aria-label');
				panel.setAttribute('aria-labelledby', panelTitle.id);
				if (shouldFocus) panelTitle.focus({ preventScroll: true });
				return;
			}

			panel.removeAttribute('aria-labelledby');
			panel.setAttribute('aria-label', `${definition?.title ?? 'Portfolio'} content`);
			const contentHeading = content.querySelector('h1');
			if (!(contentHeading instanceof HTMLElement)) return;

			contentHeading.id = 'photo-portal-content-title';
			contentHeading.tabIndex = -1;
			panel.removeAttribute('aria-label');
			panel.setAttribute('aria-labelledby', contentHeading.id);
			if (shouldFocus) contentHeading.focus({ preventScroll: true });
		}

		function syncLanguageControl(presentation, key) {
			clearLanguageControl();
			if (presentation.variants.length < 2 || presentation.selected === null) return;

			const languageControl = document.createElement('div');
			languageControl.className = 'photo-portal__language';
			languageControl.setAttribute('role', 'group');
			languageControl.setAttribute('aria-label', 'Content language');

			for (const variant of presentation.variants) {
				const button = document.createElement('button');
				button.type = 'button';
				button.textContent = variant.label;
				button.dataset.languageCode = variant.code;
				button.setAttribute('aria-pressed', String(variant.code === presentation.selected.code));
				button.addEventListener('click', () => {
					if (currentKey !== key || button.getAttribute('aria-pressed') === 'true') return;
					preferredLanguageCode = variant.code;
					for (const peer of languageControl.querySelectorAll('button')) {
						peer.setAttribute('aria-pressed', String(peer === button));
					}

					const template = document.createElement('template');
					template.innerHTML = variant.html;
					clearContextualControls();
					destroyActiveWorkDetailAudio();
					destroyWorksMultiView();
					content.replaceChildren(template.content.cloneNode(true));
					mountWorkDetailAudio(key);
					scroller.scrollTop = 0;
					configureRenderedContentHeading(false);
				});
				languageControl.append(button);
			}

			panelHeader.classList.add('has-language-control');
			panelHeader.insertBefore(languageControl, closeButton);
		}

		function keyFromUrl(url) {
			if (url.origin !== window.location.origin) return null;

			const normalizedPath = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
			if (normalizedPath === '/work/') return 'work';
			if (normalizedPath === '/services/') return 'services';
			if (normalizedPath === '/about/' && url.hash === '#cv-placeholder') return 'cv';
			if (normalizedPath === '/about/') return 'about';
			if (normalizedPath === '/contact/') return 'contact';
			return null;
		}

		function keyFromHash(hash) {
			return Object.keys(panelDefinitions).find((key) => panelDefinitions[key].hash === hash) ?? null;
		}

		function portalHistoryState(depth, key, detail = {}) {
			const currentState = window.history.state && typeof window.history.state === 'object'
				? window.history.state
				: {};
			return {
				...currentState,
				portfolioPortal: true,
				portfolioPortalDepth: depth,
				portfolioPanel: key,
				...detail,
			};
		}

		function currentPortalDepth() {
			const depth = window.history.state?.portfolioPortalDepth;
			return Number.isInteger(depth) && depth > 0 ? depth : 0;
		}

		function isUnmodifiedPrimaryClick(event, anchor) {
			if (event.defaultPrevented || event.button !== 0) return false;
			if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
			if (anchor.hasAttribute('download') || anchor.target.toLowerCase() === '_blank') return false;

			const target = new URL(anchor.href, window.location.href);
			return target.origin === window.location.origin;
		}

		function isEnhanceableClick(event, anchor) {
			if (!isUnmodifiedPrimaryClick(event, anchor)) return false;
			return keyFromUrl(new URL(anchor.href, window.location.href)) !== null;
		}

		function updateTriggerStates(activeKey) {
			const navigationKey = typeof activeKey === 'string' && activeKey.startsWith('work:') ? 'work' : activeKey;
			for (const trigger of triggers) {
				const active = trigger.key === navigationKey;
				trigger.anchor.setAttribute('aria-expanded', String(active));
				if (isMotionStudy && active) trigger.anchor.setAttribute('aria-current', 'page');
				else trigger.anchor.removeAttribute('aria-current');
			}
		}

		function configurePortalSemantics() {
			if (!isMotionStudy) return;
			panel.setAttribute('role', 'region');
			panel.removeAttribute('aria-modal');
			panel.dataset.portalView = 'route';
			panelTitle.setAttribute('aria-hidden', 'true');
			panelTitle.removeAttribute('tabindex');
			status.tabIndex = -1;
			errorRegion.tabIndex = -1;

			if (isB3Motion) {
				b3LiveRegion = document.createElement('p');
				b3LiveRegion.className = 'photo-portal__sr-status';
				b3LiveRegion.setAttribute('role', 'status');
				b3LiveRegion.setAttribute('aria-live', 'polite');
				b3LiveRegion.setAttribute('aria-atomic', 'true');
				shell.append(b3LiveRegion);
			}
		}

		function clearB3PreparationState() {
			b3BusyElement?.setAttribute('aria-busy', 'false');
			b3BusyElement = null;
			if (b3LiveRegion) b3LiveRegion.textContent = '';
		}

		function setB3PreparationState(definition, waiting, token) {
			if (!isB3Motion || token !== activeB3PreparationToken) return;

			if (waiting) {
				b3BusyElement = panel.hidden ? shell : panel;
				b3BusyElement.setAttribute('aria-busy', 'true');
				if (b3LiveRegion) b3LiveRegion.textContent = `Loading ${definition.title} content`;
				return;
			}

			clearB3PreparationState();
		}

		function cancelB3Preparation() {
			if (!isB3Motion) return;
			activeB3PreparationController?.abort();
			activeB3PreparationController = null;
			activeB3PreparationToken += 1;
			clearB3PreparationState();
		}

		function setBrandAvailability(visible) {
			const shouldExpose = !isShellComparison || visible;
			brandLink.classList.toggle('is-shell-brand-visible', shouldExpose);

			if (shouldExpose) {
				brandLink.removeAttribute('aria-hidden');
				brandLink.removeAttribute('tabindex');
				return;
			}

			brandLink.setAttribute('aria-hidden', 'true');
			brandLink.tabIndex = -1;
		}

		function setShellState(state) {
			shell.dataset.portalShellState = state;
			setBrandAvailability(state === 'opening' || state === 'open');
		}

		function prefersReducedMotion() {
			return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		}

		function nextAnimationFrame(signal) {
			if (signal?.aborted) return Promise.resolve();

			return new Promise((resolve) => {
				let settled = false;
				let frameId = null;
				const finish = () => {
					if (settled) return;
					settled = true;
					if (frameId !== null) window.cancelAnimationFrame(frameId);
					signal?.removeEventListener('abort', finish);
					resolve();
				};
				frameId = window.requestAnimationFrame(finish);
				signal?.addEventListener('abort', finish, { once: true });
				if (signal?.aborted) finish();
			});
		}

		async function nextPaint(signal) {
			await nextAnimationFrame(signal);
			if (signal?.aborted) return;
			await nextAnimationFrame(signal);
		}

		function waitForVisualTransition(element, propertyName, maximumMs, signal) {
			if (prefersReducedMotion() || signal?.aborted) return Promise.resolve();

			return new Promise((resolve) => {
				let settled = false;
				let fallbackTimer = null;
				const finish = () => {
					if (settled) return;
					settled = true;
					element.removeEventListener('transitionend', handleEnd);
					signal?.removeEventListener('abort', finish);
					if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
					resolve();
				};
				const handleEnd = (event) => {
					if (event.target === element && event.propertyName === propertyName) finish();
				};
				fallbackTimer = window.setTimeout(finish, maximumMs);
				element.addEventListener('transitionend', handleEnd);
				signal?.addEventListener('abort', finish, { once: true });
				if (signal?.aborted) finish();
			});
		}

		function resetContentTransition() {
			for (const element of [content, errorRegion]) {
				element.classList.remove(
					'is-content-exiting',
					'is-content-entering',
					'is-content-entering-active',
					'is-soft-content-exiting',
					'is-soft-content-entering',
					'is-soft-content-entering-active',
				);
			}
		}

		function resetRefinedContentTransition() {
			for (const element of [content, errorRegion]) {
				element.classList.remove('is-soft-content-exiting', 'is-soft-content-entering', 'is-soft-content-entering-active');
			}
		}

		function resetB2ContentTransition() {
			for (const element of [content, errorRegion]) {
				element.classList.remove('is-b2-content-exiting', 'is-b2-content-entering', 'is-b2-content-entering-active');
			}
		}

		function resetB3ContentTransition() {
			for (const element of [content, errorRegion]) {
				element.classList.remove('is-b3-content-exiting', 'is-b3-content-entering', 'is-b3-content-entering-active');
			}
		}

		function currentRouteView() {
			return errorRegion.hidden ? content : errorRegion;
		}

		async function commitContentView(commit, outgoingElement, incomingElement, renderToken, animateReplacement, signal) {
			const outgoingHasView = outgoingElement === errorRegion
				? !errorRegion.hidden
				: content.childElementCount > 0;
			const shouldAnimate = animateReplacement && !prefersReducedMotion() && outgoingHasView;

			if (shouldAnimate) {
				outgoingElement.classList.add('is-content-exiting');
				await waitForVisualTransition(outgoingElement, 'opacity', 110, signal);
				if (renderToken !== activeRenderToken || signal?.aborted) {
					resetContentTransition();
					return false;
				}
			}

			commit();
			resetContentTransition();

			if (shouldAnimate) {
				incomingElement.classList.add('is-content-entering');
				await nextAnimationFrame(signal);
				if (renderToken !== activeRenderToken || signal?.aborted) {
					resetContentTransition();
					return false;
				}
				incomingElement.classList.add('is-content-entering-active');
				await waitForVisualTransition(incomingElement, 'opacity', 190, signal);
				if (renderToken !== activeRenderToken || signal?.aborted) {
					resetContentTransition();
					return false;
				}
			}

			resetContentTransition();
			return true;
		}

		async function commitRefinedContentView(commit, outgoingElement, incomingElement, renderToken, animateReplacement, signal) {
			const outgoingHasView = outgoingElement === errorRegion
				? !errorRegion.hidden
				: content.childElementCount > 0;
			const shouldAnimate = !prefersReducedMotion();
			const shouldExit = shouldAnimate && animateReplacement && outgoingHasView;

			if (shouldExit) {
				outgoingElement.classList.add('is-soft-content-exiting');
				await waitForVisualTransition(outgoingElement, 'opacity', 120, signal);
				if (renderToken !== activeRenderToken || signal?.aborted) {
					return false;
				}
			}

			commit();
			resetRefinedContentTransition();

			if (shouldAnimate) {
				incomingElement.classList.add('is-soft-content-entering');
				await nextAnimationFrame(signal);
				if (renderToken !== activeRenderToken || signal?.aborted) {
					return false;
				}
				incomingElement.classList.add('is-soft-content-entering-active');
				await waitForVisualTransition(incomingElement, 'opacity', 200, signal);
				if (renderToken !== activeRenderToken || signal?.aborted) {
					return false;
				}
			}

			resetRefinedContentTransition();
			return true;
		}

		async function commitB2ContentView(commit, outgoingElement, incomingElement, renderToken, animateReplacement, signal) {
			const outgoingHasView = outgoingElement === errorRegion
				? !errorRegion.hidden
				: content.childElementCount > 0;
			const shouldAnimate = !prefersReducedMotion();
			const shouldExit = shouldAnimate && animateReplacement && outgoingHasView;

			if (shouldExit) {
				outgoingElement.classList.add('is-b2-content-exiting');
				await waitForVisualTransition(outgoingElement, 'opacity', 110, signal);
				if (renderToken !== activeRenderToken || signal?.aborted) return false;
			}

			commit();
			resetB2ContentTransition();

			if (shouldAnimate) {
				incomingElement.classList.add('is-b2-content-entering');
				await nextPaint(signal);
				if (renderToken !== activeRenderToken || signal?.aborted) return false;
				incomingElement.classList.add('is-b2-content-entering-active');
				await waitForVisualTransition(incomingElement, 'opacity', 220, signal);
				if (renderToken !== activeRenderToken || signal?.aborted) return false;
			}

			resetB2ContentTransition();
			return true;
		}

		async function commitB3ContentView(commit, outgoingElement, incomingElement, renderToken, animateReplacement, signal) {
			const outgoingHasView = outgoingElement === errorRegion
				? !errorRegion.hidden
				: content.childElementCount > 0;
			const shouldAnimate = !prefersReducedMotion();
			const shouldExit = shouldAnimate && animateReplacement && outgoingHasView;

			if (shouldExit) {
				outgoingElement.classList.add('is-b3-content-exiting');
				await waitForVisualTransition(outgoingElement, 'opacity', 110, signal);
				if (renderToken !== activeRenderToken || signal?.aborted) return false;
			}

			commit();
			resetB3ContentTransition();

			if (shouldAnimate) {
				incomingElement.classList.add('is-b3-content-entering');
				await nextPaint(signal);
				if (renderToken !== activeRenderToken || signal?.aborted) return false;
				incomingElement.classList.add('is-b3-content-entering-active');
				await waitForVisualTransition(incomingElement, 'opacity', 260, signal);
				if (renderToken !== activeRenderToken || signal?.aborted) return false;
			}

			resetB3ContentTransition();
			return true;
		}

		function commitRouteView(commit, outgoingElement, incomingElement, renderToken, animateReplacement, signal) {
			if (isB3Motion) {
				return commitB3ContentView(commit, outgoingElement, incomingElement, renderToken, animateReplacement, signal);
			}
			if (isB2Motion) {
				return commitB2ContentView(commit, outgoingElement, incomingElement, renderToken, animateReplacement, signal);
			}
			if (isRefinedFrameMotion) {
				return commitRefinedContentView(commit, outgoingElement, incomingElement, renderToken, animateReplacement, signal);
			}
			return commitContentView(commit, outgoingElement, incomingElement, renderToken, animateReplacement, signal);
		}

		function settlePanelBusyState() {
			if (isB3Motion) {
				panel.setAttribute('aria-busy', 'false');
				return;
			}

			panel.removeAttribute('aria-busy');
		}

		function setLoadingState(definition, preserveContent) {
			panel.setAttribute('aria-busy', 'true');
			if (!preserveContent) {
				panelTitle.textContent = definition.title;
				if (isMotionStudy) {
					panel.removeAttribute('aria-labelledby');
					panel.setAttribute('aria-label', `${definition.title} content`);
				} else {
					panel.setAttribute('aria-labelledby', panelTitle.id);
				}
			}
			status.textContent = isB3Motion ? '' : `Loading ${definition.title}…`;
			if (!preserveContent) {
				clearLanguageControl();
				clearContextualControls();
				destroyActiveWorkDetailAudio();
				destroyWorksMultiView();
				content.replaceChildren();
				errorMessage.textContent = '';
				errorRegion.hidden = true;
				fallbackLink.href = definitionCanonicalUrl(definition);
				scroller.scrollTop = 0;
			}
		}

		function resetB3WorksFilterTransition(directory = content.querySelector('.works-directory')) {
			if (!(directory instanceof HTMLElement)) return;
			directory.classList.remove('is-b3-content-exiting', 'is-b3-content-entering', 'is-b3-content-entering-active');
		}

		function cancelB3WorksFilterTransition() {
			activeWorksFilterController?.abort();
			activeWorksFilterController = null;
			activeWorksFilterToken += 1;
			resetB3WorksFilterTransition();
		}

		function applyWorksView(directory, view, options = {}) {
			if (directory.dataset.worksMultiViewReady === 'true') return setWorksView(directory, view, options);
			return setWorksFilter(directory, view, options);
		}

		async function requestB3WorksFilterTransition(request) {
			const directory = request?.directory;
			const view = request?.view ?? request?.category;
			if (!(directory instanceof HTMLElement) || typeof view !== 'string') return;
			if (!isB3Motion || currentKey !== 'work' || !directory.isConnected) {
				applyWorksView(directory, view);
				return;
			}
			if (activeWorksFilterController === null && (directory.dataset.activeWorkView ?? directory.dataset.activeWorkCategory) === view) return;

			cancelB3WorksFilterTransition();
			const token = ++activeWorksFilterToken;
			const controller = new AbortController();
			const signal = controller.signal;
			activeWorksFilterController = controller;

			if (prefersReducedMotion()) {
				applyWorksView(directory, view);
				if (token === activeWorksFilterToken) activeWorksFilterController = null;
				return;
			}

			directory.classList.add('is-b3-content-exiting');
			await waitForVisualTransition(directory, 'opacity', 110, signal);
			if (token !== activeWorksFilterToken || signal.aborted || !directory.isConnected || currentKey !== 'work') return;

			applyWorksView(directory, view);
			directory.classList.remove('is-b3-content-exiting');
			directory.classList.add('is-b3-content-entering');
			await nextPaint(signal);
			if (token !== activeWorksFilterToken || signal.aborted || !directory.isConnected || currentKey !== 'work') return;

			directory.classList.add('is-b3-content-entering-active');
			await waitForVisualTransition(directory, 'opacity', 260, signal);
			if (token !== activeWorksFilterToken || signal.aborted) return;

			resetB3WorksFilterTransition(directory);
			activeWorksFilterController = null;
		}

		function initializeRenderedWorksDirectory(key, payload) {
			const directory = content.querySelector('.works-directory');
			if (!(directory instanceof HTMLElement)) {
				pendingWorksRestoration = null;
				return null;
			}

			const restoration = key === 'work' ? pendingWorksRestoration : null;
			pendingWorksRestoration = null;
			const initialView = restoration?.view ?? restoration?.category ?? 'all';
			const mountedContextually = isB3Motion && key === 'work'
				? mountWorksContextualControls(directory)
				: false;
			const controlsRoot = mountedContextually ? contextualControls : directory;
			const onViewChange = (detail) => {
				if (!isB3Motion || currentKey !== 'work' || !window.history.state?.portfolioPortal) return;
				const view = detail.view ?? detail.category ?? 'all';
				window.history.replaceState(
					{
						...window.history.state,
						portfolioWorksView: view,
						portfolioWorksFilter: view,
					},
					'',
					window.location.href,
				);
			};
			if (Array.isArray(payload?.works)) {
				activeWorksMultiView = initializeWorksMultiView(directory, {
					works: payload.works,
					initialView,
					controlsRoot,
					player: musicPlayer,
					onViewRequest(request) { void requestB3WorksFilterTransition(request); },
					onViewChange,
				});
			} else {
				initializeWorksDirectories(directory, {
					initialCategory: initialView,
					controlsRoot,
					onFilterRequest(request) { void requestB3WorksFilterTransition(request); },
					onFilterChange,
				});
			}

			if (!restoration?.postId) return null;
			applyWorksView(directory, initialView, { emit: false });
			const originLink = directory.querySelector(`.post-${restoration.postId} a[href*="/works/"]`);
			return originLink instanceof HTMLElement ? originLink : null;
		}

		async function renderPayload(key, payload, renderToken, animateReplacement, signal) {
			if (currentKey !== key || renderToken !== activeRenderToken || signal?.aborted) return;

			const definition = definitionForKey(key);
			if (!definition) return;
			const presentation = languagePresentation(payload);
			const template = document.createElement('template');
			template.innerHTML = presentation.html.trim();
			const incomingFragment = template.content.cloneNode(true);
			prepareIncomingPortalFragment(key, incomingFragment);
			const outgoingElement = currentRouteView();
			let restoredWorkLink = null;
			let mountedWorkDetailAudio = null;
			const committed = await commitRouteView(() => {
				clearContextualControls();
				destroyActiveWorkDetailAudio();
				destroyWorksMultiView();
				content.replaceChildren(incomingFragment);
				mountedWorkDetailAudio = mountWorkDetailAudio(key);
				syncRouteRail(definition);
				syncLanguageControl(presentation, key);
				errorMessage.textContent = '';
				errorRegion.hidden = true;
				fallbackLink.href = payload.canonical_url;
				scroller.scrollTop = 0;
				if (isMotionStudy) {
					panel.removeAttribute('aria-labelledby');
					panel.setAttribute('aria-label', `${definition.title} content`);
				}
				restoredWorkLink = initializeRenderedWorksDirectory(key, payload);
			}, outgoingElement, content, renderToken, animateReplacement, signal);
			if (!committed || currentKey !== key || renderToken !== activeRenderToken || signal?.aborted) {
				if (signal?.aborted) destroyWorkDetailAudio(mountedWorkDetailAudio);
				return;
			}

			panelTitle.textContent = definition.title;
			status.textContent = '';

			if (key !== 'work') {
				const workCategories = Array.isArray(payload?.work?.categories) ? payload.work.categories : [];
				musicPlayer?.setRouteIsMusic(definition.kind === 'work-detail' && workCategories.some((category) => category?.slug === 'music'));
			}
			configureRenderedContentHeading(restoredWorkLink === null);
			if (restoredWorkLink instanceof HTMLElement) restoredWorkLink.focus({ preventScroll: true });
			settlePanelBusyState();
		}

		async function renderError(key, renderToken, animateReplacement, signal) {
			if (currentKey !== key || renderToken !== activeRenderToken || signal?.aborted) return;

			const definition = definitionForKey(key);
			if (!definition) return;
			musicPlayer?.setRouteIsMusic(false);
			const outgoingElement = currentRouteView();
			const committed = await commitRouteView(() => {
				clearLanguageControl();
				clearContextualControls();
				destroyActiveWorkDetailAudio();
				destroyWorksMultiView();
				content.replaceChildren();
				syncRouteRail(definition);
				errorMessage.textContent = `${definition.title} could not be loaded here. Open the full page to continue.`;
				fallbackLink.href = definitionCanonicalUrl(definition);
				errorRegion.hidden = false;
			}, outgoingElement, errorRegion, renderToken, animateReplacement, signal);
			if (!committed || currentKey !== key || renderToken !== activeRenderToken || signal?.aborted) {
				return;
			}

			if (isMotionStudy) {
				panel.removeAttribute('aria-labelledby');
				panel.setAttribute('aria-label', `${definition.title} unavailable`);
			} else {
				panel.setAttribute('aria-labelledby', panelTitle.id);
			}
			status.textContent = '';
			settlePanelBusyState();
			if (isMotionStudy) errorRegion.focus({ preventScroll: true });
		}

		function isValidPanelPayload(payload, expectedSlug) {
			return typeof payload === 'object'
				&& payload !== null
				&& payload.slug === expectedSlug
				&& typeof payload.title === 'string'
				&& typeof payload.html === 'string'
				&& payload.html.trim() !== ''
				&& typeof payload.canonical_url === 'string';
		}

		function isValidWorkPayload(payload, expectedId) {
			return typeof payload === 'object'
				&& payload !== null
				&& payload.id === expectedId
				&& typeof payload.title === 'string'
				&& payload.title.trim() !== ''
				&& typeof payload.html === 'string'
				&& payload.html.trim() !== ''
				&& typeof payload.canonical_url === 'string';
		}

		function isValidDefinitionPayload(payload, definition) {
			return definition.kind === 'work-detail'
				? isValidWorkPayload(payload, definition.postId)
				: isValidPanelPayload(payload, definition.payloadSlug);
		}

		async function requestB2Payload(definition) {
			const cached = cache.get(definition.payloadSlug);
			if (cached) return cached;

			const pending = b2PayloadRequests.get(definition.payloadSlug);
			if (pending) return pending;

			const request = (async () => {
				const response = await fetch(`${endpointBase}${definition.payloadSlug}`, {
					method: 'GET',
					credentials: 'same-origin',
					headers: { Accept: 'application/json' },
				});
				if (!response.ok) throw new Error(`Panel request returned HTTP ${response.status}.`);

				const payload = await response.json();
				if (!isValidPanelPayload(payload, definition.payloadSlug)) {
					throw new Error('Panel response did not match the expected contract.');
				}

				cache.set(definition.payloadSlug, payload);
				return payload;
			})();

			b2PayloadRequests.set(definition.payloadSlug, request);
			try {
				return await request;
			} finally {
				if (b2PayloadRequests.get(definition.payloadSlug) === request) {
					b2PayloadRequests.delete(definition.payloadSlug);
				}
			}
		}

		async function requestB3Payload(definition) {
			const cacheKey = definitionCacheKey(definition);
			const cached = cache.get(cacheKey);
			if (cached) return cached;

			const pending = b3PayloadRequests.get(cacheKey);
			if (pending) return pending;

			const request = (async () => {
				const response = await fetch(definitionRequestUrl(definition), {
					method: 'GET',
					credentials: 'same-origin',
					headers: { Accept: 'application/json' },
				});
				if (!response.ok) throw new Error(`Panel request returned HTTP ${response.status}.`);

				const payload = await response.json();
				if (!isValidDefinitionPayload(payload, definition)) {
					throw new Error('Panel response did not match the expected contract.');
				}

				cache.set(cacheKey, payload);
				return payload;
			})();

			b3PayloadRequests.set(cacheKey, request);
			try {
				return await request;
			} finally {
				if (b3PayloadRequests.get(cacheKey) === request) {
					b3PayloadRequests.delete(cacheKey);
				}
			}
		}

		async function prefetchB2Payloads() {
			const definitionsBySlug = new Map(
				Object.values(panelDefinitions).map((definition) => [definition.payloadSlug, definition]),
			);
			await Promise.allSettled(
				[...definitionsBySlug.values()].map((definition) => requestB2Payload(definition)),
			);
		}

		function scheduleB2Prefetch() {
			if (!isB2Motion || b2PrefetchScheduled || document.readyState !== 'complete') return;
			b2PrefetchScheduled = true;
			const run = () => { void prefetchB2Payloads(); };
			if ('requestIdleCallback' in window) {
				window.requestIdleCallback(run, { timeout: 1000 });
				return;
			}
			window.setTimeout(run, 200);
		}

		async function prefetchB3Payloads() {
			const definitionsBySlug = new Map(
				Object.values(panelDefinitions).map((definition) => [definition.payloadSlug, definition]),
			);
			await Promise.allSettled(
				[...definitionsBySlug.values()].map((definition) => requestB3Payload(definition)),
			);
		}

		function scheduleB3Prefetch() {
			if (!isB3Motion || b3PrefetchScheduled || document.readyState !== 'complete') return;
			b3PrefetchScheduled = true;
			const run = () => { void prefetchB3Payloads(); };
			if ('requestIdleCallback' in window) {
				window.requestIdleCallback(run, { timeout: 1000 });
				return;
			}
			window.setTimeout(run, 200);
		}

		async function loadB2Panel(key, options) {
			const definition = panelDefinitions[key];
			try {
				const payload = await requestB2Payload(definition);
				if (currentKey === key && options.renderToken === activeRenderToken && !options.signal?.aborted) {
					await renderPayload(key, payload, options.renderToken, options.animateReplacement, options.signal);
					scheduleB2Prefetch();
				}
			} catch {
				if (currentKey === key && options.renderToken === activeRenderToken && !options.signal?.aborted) {
					await renderError(key, options.renderToken, options.animateReplacement, options.signal);
				}
			}
		}

		async function loadPanel(key, options) {
			if (isB2Motion) {
				await loadB2Panel(key, options);
				return;
			}

			const definition = definitionForKey(key);
			if (!definition) return;
			const cacheKey = definitionCacheKey(definition);
			const cached = cache.get(cacheKey);
			if (cached) {
				await renderPayload(key, cached, options.renderToken, options.animateReplacement, options.signal);
				return;
			}

			const controller = new AbortController();
			const requestToken = ++activeRequestToken;
			activeController = controller;

			try {
				const response = await fetch(definitionRequestUrl(definition), {
					method: 'GET',
					credentials: 'same-origin',
					headers: { Accept: 'application/json' },
					signal: controller.signal,
				});
				if (!response.ok) throw new Error(`Panel request returned HTTP ${response.status}.`);

				const payload = await response.json();
				if (!isValidDefinitionPayload(payload, definition)) {
					throw new Error('Panel response did not match the expected contract.');
				}

				cache.set(cacheKey, payload);
				if (requestToken === activeRequestToken && currentKey === key) {
					await renderPayload(key, payload, options.renderToken, options.animateReplacement, options.signal);
				}
			} catch (error) {
				if (error instanceof DOMException && error.name === 'AbortError') return;
				if (requestToken === activeRequestToken && currentKey === key) {
					await renderError(key, options.renderToken, options.animateReplacement, options.signal);
				}
			} finally {
				if (requestToken === activeRequestToken) activeController = null;
			}
		}

		async function prepareB3Target(key, options = {}) {
			const definition = definitionForKey(key);
			if (!definition) return;

			cancelB3Preparation();
			const controller = new AbortController();
			activeB3PreparationController = controller;
			const token = activeB3PreparationToken;
			const cached = cache.has(definitionCacheKey(definition));
			if (!cached) setB3PreparationState(definition, true, token);

			let preparedB3Error = false;
			try {
				await requestB3Payload(definition);
			} catch {
				preparedB3Error = true;
			}

			if (controller.signal.aborted || token !== activeB3PreparationToken) return;
			setB3PreparationState(definition, false, token);
			activeB3PreparationController = null;
			openPanel(key, { ...options, preparedB3Error });
		}

		function requestPanel(key, options = {}) {
			if (isB3Motion) {
				void prepareB3Target(key, options);
				return;
			}

			openPanel(key, options);
		}

		function openPanel(key, options = {}) {
			const definition = definitionForKey(key);
			if (!definition) return;
			if (isB3Motion) cancelB3WorksFilterTransition();

			const panelAlreadyOpen = currentKey !== null && !panel.hidden && panel.classList.contains('is-open');
			const isOpenSwitch = isShellComparison && panelAlreadyOpen && currentKey !== key;
			activeController?.abort();
			activeController = null;
			activeRequestToken += 1;
			activeVisualController?.abort();
			if (isRefinedFrameMotion) resetRefinedContentTransition();
			if (isB2Motion) resetB2ContentTransition();
			if (isB3Motion) resetB3ContentTransition();
			activeCloseController?.abort();
			activeVisualController = new AbortController();
			activeCloseToken += 1;
			const renderToken = ++activeRenderToken;

			if (options.updateHistory && definition.kind === 'work-detail') {
				const nextDepth = currentPortalDepth() + 1;
				window.history.pushState(
					portalHistoryState(nextDepth, key, {
						portfolioWorkId: definition.postId,
						portfolioWorkTitle: definition.title,
						portfolioWorkUrl: definition.canonicalUrl,
					}),
					'',
					definition.canonicalUrl,
				);
			} else if (options.updateHistory && window.location.hash !== definition.hash) {
				const nextDepth = currentPortalDepth() + 1;
				window.history.pushState(portalHistoryState(nextDepth, key), '', definition.hash);
			}

			if (!panelAlreadyOpen) setShellState('opening');
			currentKey = key;
			setHeaderActionMode(isB3Motion && definition.kind === 'work-detail' ? 'back' : 'close');
			if (options.restoreTarget instanceof HTMLElement) restoreTarget = options.restoreTarget;
			setLoadingState(definition, isOpenSwitch);
			panel.setAttribute('aria-owns', 'portfolio-music-player portfolio-music-player-status');
			panel.hidden = false;
			landing.inert = true;
			siteHeader.inert = !isMotionStudy;
			shell.classList.add('is-portal-open');
			updateTriggerStates(key);
			if (!panelAlreadyOpen) {
				window.requestAnimationFrame(() => {
					if (renderToken !== activeRenderToken) return;
					panel.classList.add('is-open');
					setShellState('open');
				});
				if (isMotionStudy) status.focus({ preventScroll: true });
				else panelTitle.focus({ preventScroll: true });
			}
			if (isB3Motion && options.preparedB3Error === true) {
				void renderError(key, renderToken, isOpenSwitch, activeVisualController.signal);
			} else {
				void loadPanel(key, {
					renderToken,
					animateReplacement: isOpenSwitch,
					signal: activeVisualController.signal,
				});
			}
		}

		async function finishClose(shouldRestoreFocus) {
			const closeToken = ++activeCloseToken;
			cancelB3Preparation();
			activeVisualController?.abort();
			activeCloseController?.abort();
			activeCloseController = new AbortController();
			const closeSignal = activeCloseController.signal;
			activeController?.abort();
			if (isB3Motion) cancelB3WorksFilterTransition();
			activeController = null;
			activeRequestToken += 1;
			activeRenderToken += 1;
			currentKey = null;
			destroyActiveWorkDetailAudio();
			destroyWorksMultiView();
			if (isB3Motion) resetB3ContentTransition();
			else if (isB2Motion) resetB2ContentTransition();
			else resetContentTransition();
			settlePanelBusyState();
			setShellState('closing');
			panel.classList.remove('is-open');
			updateTriggerStates(null);

			const waits = [waitForVisualTransition(panel, 'opacity', motionMode === 'slide-up' ? 270 : 210, closeSignal)];
			if (shellMode === 'brand-on-open') waits.push(waitForVisualTransition(brandLink, 'opacity', 190, closeSignal));
			if (shellMode === 'frame-on-open') waits.push(waitForVisualTransition(brandLink, 'opacity', 280, closeSignal));
			if (shellMode === 'frame-on-open-soft') waits.push(waitForVisualTransition(brandLink, 'opacity', 230, closeSignal));
			if (shellMode === 'frame-on-open-b2') waits.push(waitForVisualTransition(brandLink, 'opacity', 200, closeSignal));
			if (shellMode === 'frame-on-open-b3') waits.push(waitForVisualTransition(brandLink, 'opacity', 200, closeSignal));
			await Promise.all(waits);
			if (closeToken !== activeCloseToken || closeSignal.aborted) return;

			panel.hidden = true;
			panel.removeAttribute('aria-owns');
			clearRouteRail();
			landing.inert = false;
			siteHeader.inert = false;
			shell.classList.remove('is-portal-open');
			destroyWorksMultiView();
			content.replaceChildren();
			clearLanguageControl();
			clearContextualControls();
			setHeaderActionMode('close');
			status.textContent = '';
			errorRegion.hidden = true;
			setShellState('landing');
			activeCloseController = null;
			if (shouldRestoreFocus && restoreTarget instanceof HTMLElement && restoreTarget.isConnected) {
				restoreTarget.focus({ preventScroll: true });
			}
		}

		function closePanel(options = {}) {
			if (currentKey === null && panel.hidden) return;
			if (options.updateHistory) {
				const depth = currentPortalDepth();
				if (hasKnownBaseEntry && depth > 0) {
					window.history.go(-depth);
					return;
				}

				window.history.replaceState(portalHistoryState(0, null), '', baseUrl.href);
				hasKnownBaseEntry = true;
			}
			void finishClose(options.restoreFocus !== false);
		}

		function setHeaderActionMode(mode) {
			const normalizedMode = mode === 'back' ? 'back' : 'close';
			closeButton.dataset.portalAction = normalizedMode;
			closeButton.setAttribute('aria-label', normalizedMode === 'back' ? 'Back to Works' : 'Close panel');
		}

		function backToWorks() {
			destroyActiveWorkDetailAudio();
			const historyState = window.history.state && typeof window.history.state === 'object'
				? window.history.state
				: {};
			const view = typeof historyState.portfolioWorksView === 'string'
				? historyState.portfolioWorksView
				: typeof historyState.portfolioWorksFilter === 'string'
					? historyState.portfolioWorksFilter
				: '';
			const postId = Number.parseInt(String(historyState.portfolioWorksOriginPostId ?? 0), 10);
			const validCategories = new Set(['all', 'music', 'live', 'tech']);
			const hasValidOrigin = currentPortalDepth() > 0 && postId > 0 && validCategories.has(view);

			if (hasValidOrigin) {
				window.history.back();
				return;
			}

			pendingWorksRestoration = { view: 'all', postId: 0 };
			const matchingTrigger = triggers.find((trigger) => trigger.key === 'work')?.anchor ?? null;
			window.history.replaceState(
				portalHistoryState(Math.max(currentPortalDepth() - 1, 0), 'work', {
					portfolioWorksFilter: 'all',
					portfolioWorksView: 'all',
					portfolioWorksOriginPostId: 0,
				}),
				'',
				new URL(panelDefinitions.work.hash, baseUrl).href,
			);
			requestPanel('work', { updateHistory: false, restoreTarget: matchingTrigger });
		}

		function activateHeaderAction() {
			if (isB3Motion && definitionForKey(currentKey)?.kind === 'work-detail') {
				backToWorks();
				return;
			}

			closePanel({ updateHistory: true, restoreFocus: true });
		}

		function focusableElements() {
			const panelElements = [...panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')];
			const playerElements = musicPlayerRoot instanceof HTMLElement && !musicPlayerRoot.hidden
				? [...musicPlayerRoot.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
				: [];
			return [...panelElements, ...playerElements]
				.filter((element) => element instanceof HTMLElement && !element.hidden && element.getClientRects().length > 0);
		}

		function handlePanelKeydown(event) {
			if (event.key === 'Escape') {
				event.preventDefault();
				closePanel({ updateHistory: true, restoreFocus: true });
				return;
			}
			if (isMotionStudy) return;
			if (event.key !== 'Tab') return;

			const focusable = focusableElements();
			if (focusable.length === 0) {
				event.preventDefault();
				panelTitle.focus({ preventScroll: true });
				return;
			}

			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (event.shiftKey && (document.activeElement === first || document.activeElement === panelTitle)) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}

		function handleStudyEscape(event) {
			if (!isMotionStudy || panel.hidden || event.key !== 'Escape' || panel.contains(event.target)) return;
			event.preventDefault();
			closePanel({ updateHistory: true, restoreFocus: true });
		}

		function handleWorkDetailClick(event) {
			if (!isB3Motion || currentKey !== 'work' || !(event.target instanceof Element)) return;
			const anchor = event.target.closest('.works-card a[href*="/works/"]');
			if (!(anchor instanceof HTMLAnchorElement) || !content.contains(anchor)) return;
			if (!isUnmodifiedPrimaryClick(event, anchor)) return;

			const card = anchor.closest('.wp-block-post');
			if (!(card instanceof HTMLElement)) return;
			const postClass = [...card.classList].find((className) => /^post-[1-9]\d*$/.test(className));
			const postId = postClass ? Number.parseInt(postClass.slice('post-'.length), 10) : 0;
			const cardTitle = card.dataset.workTitle?.trim()
				?? card.querySelector('.wp-block-post-title')?.textContent?.trim()
				?? anchor.textContent?.trim()
				?? '';
			const definition = createWorkDefinition(postId, cardTitle, anchor.href);
			if (!definition) return;

			event.preventDefault();
			const directory = card.closest('.works-directory');
			const view = directory instanceof HTMLElement
				? (directory.dataset.activeWorkView ?? directory.dataset.activeWorkCategory ?? directory.querySelector('[data-work-filter][aria-pressed="true"]')?.getAttribute('data-work-filter') ?? 'all')
				: 'all';
			window.history.replaceState(
				portalHistoryState(currentPortalDepth(), 'work', {
					portfolioWorksFilter: view,
					portfolioWorksView: view,
					portfolioWorksOriginPostId: postId,
				}),
				'',
				window.location.href,
			);
			pendingWorksRestoration = null;
			requestPanel(definition.key, { updateHistory: true, restoreTarget: anchor });
		}

		for (const anchor of navigation.querySelectorAll('a')) {
			if (!(anchor instanceof HTMLAnchorElement)) continue;
			const key = keyFromUrl(new URL(anchor.href, window.location.href));
			if (key === null) continue;

			anchor.setAttribute('aria-controls', panel.id);
			anchor.setAttribute('aria-expanded', 'false');
			triggers.push({ anchor, key });
			anchor.addEventListener('click', (event) => {
				if (!isEnhanceableClick(event, anchor)) return;
				event.preventDefault();

				let nextRestoreTarget = anchor;
				const responsiveContainer = anchor.closest('.wp-block-navigation__responsive-container.is-menu-open');
				if (responsiveContainer instanceof HTMLElement) {
					const menuClose = responsiveContainer.querySelector('.wp-block-navigation__responsive-container-close');
					const menuOpen = navigation.querySelector('.wp-block-navigation__responsive-container-open');
					if (menuClose instanceof HTMLButtonElement) menuClose.click();
					if (menuOpen instanceof HTMLButtonElement) nextRestoreTarget = menuOpen;
				}

				requestPanel(key, { updateHistory: true, restoreTarget: nextRestoreTarget });
			});
		}

		closeButton.addEventListener('click', activateHeaderAction);
		content.addEventListener('click', handleWorkDetailClick);
		panel.addEventListener('keydown', handlePanelKeydown);
		if (musicPlayerRoot instanceof HTMLElement) musicPlayerRoot.addEventListener('keydown', handlePanelKeydown);
		document.addEventListener('keydown', handleStudyEscape);
		brandLink.addEventListener('click', (event) => {
			if (!isMotionStudy || !isUnmodifiedPrimaryClick(event, brandLink)) return;
			event.preventDefault();
			closePanel({ updateHistory: true, restoreFocus: false });
		});
		window.addEventListener('popstate', () => {
			const historyState = window.history.state && typeof window.history.state === 'object'
				? window.history.state
				: {};
			if (isB3Motion) {
				const workDefinition = workDefinitionFromHistory(historyState);
				if (workDefinition) {
					pendingWorksRestoration = null;
					requestPanel(workDefinition.key, { updateHistory: false, restoreTarget: null });
					return;
				}

				if (historyState.portfolioPanel === 'work') {
					pendingWorksRestoration = {
						view: typeof historyState.portfolioWorksView === 'string'
							? historyState.portfolioWorksView
							: typeof historyState.portfolioWorksFilter === 'string' ? historyState.portfolioWorksFilter : 'all',
						postId: Number.parseInt(String(historyState.portfolioWorksOriginPostId ?? 0), 10),
					};
					const matchingTrigger = triggers.find((trigger) => trigger.key === 'work')?.anchor ?? null;
					requestPanel('work', { updateHistory: false, restoreTarget: matchingTrigger });
					return;
				}
			}

			const key = keyFromHash(window.location.hash);
			if (key === null) {
				cancelB3Preparation();
				hasKnownBaseEntry = true;
				closePanel({ updateHistory: false, restoreFocus: true });
				return;
			}

			const matchingTrigger = triggers.find((trigger) => trigger.key === key)?.anchor ?? null;
			requestPanel(key, { updateHistory: false, restoreTarget: matchingTrigger });
		});

		configurePortalSemantics();
		setShellState('landing');
		if (isB2Motion) {
			if (document.readyState === 'complete') scheduleB2Prefetch();
			else window.addEventListener('load', scheduleB2Prefetch, { once: true });
		}
		if (isB3Motion) {
			if (document.readyState === 'complete') scheduleB3Prefetch();
			else window.addEventListener('load', scheduleB3Prefetch, { once: true });
		}
		const initialWorkId = Number.parseInt(shell.dataset.portalInitialWorkId ?? '', 10);
		const initialWorkDefinition = Number.isInteger(initialWorkId) && initialWorkId > 0
			? createWorkDefinition(
				initialWorkId,
				shell.dataset.portalInitialWorkTitle ?? '',
				shell.dataset.portalInitialWorkUrl ?? window.location.href,
			)
			: null;
		const initialPanelKey = shell.dataset.portalInitialPanel;
		const initialKey = initialWorkDefinition?.key
			?? (Object.hasOwn(panelDefinitions, initialPanelKey) ? initialPanelKey : null)
			?? keyFromHash(window.location.hash);
		if (initialKey === null) {
			hasKnownBaseEntry = true;
			window.history.replaceState(portalHistoryState(0, null), '', window.location.href);
		} else {
			requestPanel(initialKey, { updateHistory: false, restoreTarget: null });
		}
	}
}
