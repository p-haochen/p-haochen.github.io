// Language switch N: 中 / fader / EN. Pressing the other language (or the
// fader) slides the cap over and shows the same view in that language.
// Inside the Portal the open view is swapped in place, like a page
// translator: no reload, same scroll position, the music keeps playing.
// Anywhere else (or if the other language cannot be loaded) it opens the
// same address in that language.
const root = document.querySelector('[data-language-switch]');

if (root) {
	const prefix = (root.dataset.languagePrefix ?? '/en').replace(/\/$/, '');
	const homePath = prefix.slice(0, -'/en'.length);
	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
	let busy = false;

	const targetUrl = (language) => {
		const url = new URL(window.location.href);
		let path = url.pathname.startsWith(homePath) ? url.pathname.slice(homePath.length) : url.pathname;
		if (path === '/en' || path.startsWith('/en/')) path = path.slice(3) || '/';
		if (!path.startsWith('/')) path = `/${path}`;
		url.pathname = language === 'en' ? `${prefix}${path}` : `${homePath}${path}`;
		return url.href;
	};

	// Redraw the switch for the language now shown: the current one is a label,
	// the other one a link to the same view.
	const render = (language) => {
		root.dataset.state = language;
		root.setAttribute('aria-label', language === 'en' ? 'Language' : 'Language / 語言');
		const other = language === 'en' ? 'zh' : 'en';
		const option = (lang) => {
			const code = lang === 'en' ? 'en' : 'zh-Hant';
			const text = lang === 'en' ? 'EN' : '中';
			if (lang === language) {
				const span = document.createElement('span');
				span.className = 'language-switch__option is-current';
				span.lang = code;
				span.setAttribute('aria-current', 'true');
				span.textContent = text;
				return span;
			}
			const link = document.createElement('a');
			link.className = 'language-switch__option';
			link.lang = code;
			link.hreflang = code;
			link.href = targetUrl(lang);
			link.dataset.languageTarget = lang;
			link.textContent = text;
			return link;
		};
		const track = root.querySelector('.language-switch__track');
		track.dataset.languageTarget = other;
		for (const element of root.querySelectorAll('.language-switch__option')) element.remove();
		const label = root.querySelector('.language-switch__label');
		label.after(option('zh'));
		track.after(option('en'));
	};

	// Warm the other language before the press.
	const warm = () => window.dispatchEvent(new CustomEvent('portfolio:language-prefetch'));
	root.addEventListener('pointerenter', warm);
	root.addEventListener('focusin', warm);
	root.addEventListener('touchstart', warm, { passive: true });

	root.addEventListener('click', async (event) => {
		const control = event.target.closest('[data-language-target]');
		if (!control || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		if (busy) return;
		const language = control.dataset.languageTarget;
		const previous = root.dataset.state;
		const href = targetUrl(language);
		root.dataset.state = language;

		const request = new CustomEvent('portfolio:language-request', { cancelable: true, detail: { language, handled: null } });
		window.dispatchEvent(request);
		if (request.defaultPrevented && request.detail.handled instanceof Promise) {
			busy = true;
			root.classList.add('is-switching');
			const switched = await request.detail.handled.catch(() => false);
			root.classList.remove('is-switching');
			busy = false;
			if (switched) {
				render(language);
				return;
			}
		}
		// No Portal here, or the other language could not be loaded: open the page.
		window.setTimeout(() => { window.location.assign(href); }, reduceMotion.matches ? 0 : 280);
		if (previous === undefined) root.dataset.state = language;
	});

	// Keep the other language's link in step with the address (the Portal changes it without reloading).
	const refreshLink = () => {
		const link = root.querySelector('a[data-language-target]');
		if (link) link.href = targetUrl(link.dataset.languageTarget);
	};
	window.addEventListener('popstate', refreshLink);
	// Back / Forward into the other language: the Portal switched; follow it.
	window.addEventListener('portfolio:language-changed', (event) => {
		if (event instanceof CustomEvent && (event.detail?.language === 'en' || event.detail?.language === 'zh')) render(event.detail.language);
	});
	root.addEventListener('pointerenter', refreshLink);
	root.addEventListener('focusin', refreshLink);
}
