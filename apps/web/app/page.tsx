import LandingBentoSection from '@/components/hero/LandingBentoSection';
import LandingCtaSection from '@/components/hero/LandingCtaSection';
import LandingFeatureCardsSection from '@/components/hero/LandingFeatureCardsSection';
import LandingInteractiveSection from '@/components/hero/LandingInteractiveSection';
import LandingNavbar from '@/components/navbar/LandingNavbar';

export default function Home() {
    return (
        <div className="min-h-screen w-screen bg-black flex flex-col">
            <LandingNavbar />
            <LandingCtaSection />
            {/* <LandingHeroSection /> */}
            <LandingFeatureCardsSection />
            <LandingInteractiveSection />
            <LandingBentoSection />
        </div>
    );
}
