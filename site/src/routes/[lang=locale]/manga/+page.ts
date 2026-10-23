import { api } from '$lib/data';

export const load = async ({ fetch }) => ({ chapters: await api(fetch).chapters() });
