import type { Lang } from '$contracts';

export const load = ({ params }) => ({ lang: params.lang as Lang });
