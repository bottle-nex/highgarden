import LandingBentoSection from '@/components/hero/LandingBentoSection';
import LandingCtaSection from '@/components/hero/LandingCtaSection';
import LandingFeatureCardsSection from '@/components/hero/LandingFeatureCardsSection';
import LandingFooter from '@/components/hero/LandingFooter';
import LandingInteractiveSection from '@/components/hero/LandingInteractiveSection';
import LandingNavbar from '@/components/navbar/LandingNavbar';

export default function Home() {
    return (
        <div data-lenis-prevent className="min-h-screen w-screen bg-neutral-950 flex flex-col">
            <LandingNavbar />
            <LandingCtaSection />
            <LandingFeatureCardsSection />
            <LandingInteractiveSection />
            <LandingBentoSection />
            <LandingFooter />
        </div>
    );
}
