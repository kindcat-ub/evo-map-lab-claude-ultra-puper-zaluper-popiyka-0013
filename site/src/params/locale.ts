import type { ParamMatcher } from '@sveltejs/kit';
import type { Lang } from '$contracts';
import { LANGS } from '$lib/i18n/ui';

export const match = ((param: string): param is Lang =>
	(LANGS as readonly string[]).includes(param)) satisfies ParamMatcher;
