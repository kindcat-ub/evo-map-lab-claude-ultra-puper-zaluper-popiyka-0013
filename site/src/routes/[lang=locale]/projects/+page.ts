import { api } from '$lib/data';

export const load = async ({ fetch }) => ({ projects: await api(fetch).projects() });
