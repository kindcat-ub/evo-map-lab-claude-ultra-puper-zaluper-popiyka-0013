import type { Handle } from '@sveltejs/kit';
import { base } from '$app/paths';

/** <html lang> follows the language segment of the URL. */
export const handle: Handle = ({ event, resolve }) => {
	const lang = event.url.pathname.slice(base.length).split('/')[1] === 'en' ? 'en' : 'ru';
	return resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', lang) });
};
