import { JSX } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import BookmarkedMarkets from '@/components/bookmarks/BookmarkedMarkets';

export default function BookmarksPage(): JSX.Element {
    return (
        <DashboardLayout>
            <BookmarkedMarkets />
        </DashboardLayout>
    );
}
