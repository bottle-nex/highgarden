import type { Category } from '@/store/ui/useCategoryStore';

/**
 * Sidebar categories that aren't real Polymarket tags — they're sort modes /
 * placeholder buckets. Selecting one of these returns no tag filter, which the
 * server treats as "all markets".
 */
const NON_TAG_CATEGORIES = new Set<Category>(['Trending', 'Mentions']);

/**
 * Map a sidebar category to the Polymarket tag(s) we filter on. Returns
 * `null` for non-tag categories so callers can decide whether to skip the
 * filter entirely.
 *
 * Polymarket labels are Title Case (e.g. "Politics"), so we just pass the
 * label through unchanged. If upstream casing ever shifts, normalise here.
 */
export function category_to_tags(category: Category): string[] | null {
    if (NON_TAG_CATEGORIES.has(category)) return null;
    return [category];
}

/** True when this category should bypass the trending layout and show a flat,
 *  filtered grid. */
export function is_tag_category(category: Category): boolean {
    return !NON_TAG_CATEGORIES.has(category);
}
