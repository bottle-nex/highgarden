import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { CATEGORY_TABS } from '@/utils/constants';

export type Category = (typeof CATEGORY_TABS)[number];

interface CategoryState {
    activeCategory: Category;
    setActiveCategory: (c: Category) => void;
}

export const useCategoryStore = create<CategoryState>()(
    devtools(
        (set) => ({
            activeCategory: 'Trending',
            setActiveCategory: (activeCategory) =>
                set({ activeCategory }, false, 'category/setActive'),
        }),
        { name: 'CategoryStore' },
    ),
);

export const selectActiveCategory = (s: CategoryState) => s.activeCategory;
