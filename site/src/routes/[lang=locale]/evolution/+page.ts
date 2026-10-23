import { api } from '$lib/data';

export const load = async ({ fetch }) => ({ graph: await api(fetch).graph() });
