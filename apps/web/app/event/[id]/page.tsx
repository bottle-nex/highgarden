import EventDetail from '@/components/event/EventDetail';
import EventNavbar from '@/components/event/EventNavbar';

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return (
        <div className="min-h-screen w-full bg-dark-alpha text-white/80 flex flex-col">
            <EventNavbar />
            <EventDetail id={id} />
        </div>
    );
}
