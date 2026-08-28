(() => {
	'use strict';

	const root = document.querySelector('.photo-draft-shell');
	const landing = root?.querySelector('.photo-draft');
	if (!(root instanceof HTMLElement) || !(landing instanceof HTMLElement)) return;

	const navigation = root.querySelector('.photo-draft__navigation');
	const socials = root.querySelector('.photo-draft__socials');
	const openButton = navigation?.querySelector('.wp-block-navigation__responsive-container-open');
	const responsiveContainer = navigation?.querySelector('.wp-block-navigation__responsive-container');

	if (!(openButton instanceof HTMLButtonElement) || !(responsiveContainer instanceof HTMLElement)) return;

	const syncExpandedState = () => {
		const isOpen = responsiveContainer.classList.contains('is-menu-open');
		openButton.setAttribute('aria-expanded', String(isOpen));
		root.classList.toggle('is-photo-menu-open', isOpen);
		landing.classList.toggle('is-photo-menu-open', isOpen);
		if (socials instanceof HTMLElement) socials.inert = isOpen;
	};

	const observer = new MutationObserver(syncExpandedState);
	observer.observe(responsiveContainer, {
		attributes: true,
		attributeFilter: ['class'],
	});

	syncExpandedState();
})();
