// Narrow layouts show the first eight credits; one delegated handler covers
// Direct pages and Work details loaded into the Portal.
const toggleSelector = '[data-work-credits-toggle]';

document.addEventListener('click', (event) => {
	const toggle = event.target instanceof Element ? event.target.closest(toggleSelector) : null;
	if (!(toggle instanceof HTMLButtonElement)) return;

	const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
	if (!(list instanceof HTMLElement)) return;

	const expanded = list.classList.toggle('is-collapsed') === false;
	toggle.setAttribute('aria-expanded', String(expanded));
	toggle.textContent = expanded ? toggle.dataset.labelLess ?? '' : toggle.dataset.labelMore ?? '';
});
