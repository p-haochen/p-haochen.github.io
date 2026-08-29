const contactFormSelector = '[data-contact-form]';
const pendingForms = new WeakSet();

function fieldErrorElement(form, fieldName) {
	return form.querySelector(`[data-contact-field-error="${CSS.escape(fieldName)}"]`);
}

function clearFieldError(form, field) {
	if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
	field.removeAttribute('aria-invalid');
	const error = fieldErrorElement(form, field.name);
	if (!(error instanceof HTMLElement)) return;
	error.textContent = '';
	error.hidden = true;
}

function clearFieldErrors(form) {
	for (const field of form.querySelectorAll('input[name], textarea[name]')) clearFieldError(form, field);
}

function setFieldError(form, fieldName, message) {
	const field = form.elements.namedItem(fieldName);
	const error = fieldErrorElement(form, fieldName);
	if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) || !(error instanceof HTMLElement)) return false;
	field.setAttribute('aria-invalid', 'true');
	error.textContent = message;
	error.hidden = false;
	return true;
}

function setStatus(status, state, message) {
	status.dataset.state = state;
	status.textContent = message;
	status.setAttribute('role', state === 'error' ? 'alert' : 'status');
}

function responseErrors(payload) {
	if (!payload || typeof payload !== 'object' || !Array.isArray(payload.errors)) return [];
	return payload.errors.filter((item) => item && typeof item === 'object');
}

document.addEventListener('input', (event) => {
	if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) return;
	const form = event.target.closest(contactFormSelector);
	if (!(form instanceof HTMLFormElement)) return;
	clearFieldError(form, event.target);
});

document.addEventListener('submit', async (event) => {
	const form = event.target;
	if (!(form instanceof HTMLFormElement) || !form.matches(contactFormSelector)) return;
	event.preventDefault();
	if (pendingForms.has(form)) return;

	const submitButton = form.querySelector('[data-contact-submit]');
	const status = form.querySelector('[data-contact-form-status]');
	if (!(submitButton instanceof HTMLButtonElement) || !(status instanceof HTMLElement)) return;

	pendingForms.add(form);
	clearFieldErrors(form);
	setStatus(status, 'pending', '訊息傳送中，請稍候。 · SENDING');
	form.setAttribute('aria-busy', 'true');
	submitButton.disabled = true;
	const idleLabel = submitButton.textContent;
	submitButton.textContent = '傳送中 · SENDING';

	try {
		const response = await fetch(form.action, {
			method: 'POST',
			body: new FormData(form),
			headers: { Accept: 'application/json' },
		});
		let payload = null;
		try {
			payload = await response.json();
		} catch {
			payload = null;
		}

		if (!response.ok) {
			let hasFieldError = false;
			for (const item of responseErrors(payload)) {
				if (typeof item.field !== 'string' || typeof item.message !== 'string') continue;
				hasFieldError = setFieldError(form, item.field, item.message) || hasFieldError;
			}
			setStatus(
				status,
				'error',
				hasFieldError
					? '請檢查標示的欄位後再送出。 · PLEASE CHECK THE FORM'
					: '目前無法送出，請稍後再試，或直接以 Email 聯絡。 · UNABLE TO SEND',
			);
			return;
		}

		form.reset();
		clearFieldErrors(form);
		setStatus(status, 'success', '訊息已成功送出，謝謝你的聯絡。 · MESSAGE SENT');
	} catch {
		setStatus(status, 'error', '目前無法送出，請檢查網路後再試，或直接以 Email 聯絡。 · UNABLE TO SEND');
	} finally {
		pendingForms.delete(form);
		form.setAttribute('aria-busy', 'false');
		submitButton.disabled = false;
		submitButton.textContent = idleLabel;
	}
});
