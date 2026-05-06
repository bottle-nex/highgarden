// import LandingBentoSection from '@/components/hero/LandingBentoSection';
import LandingCtaSection from '@/components/hero/LandingCtaSection';
import LandingFeatureCardsSection from '@/components/hero/LandingFeatureCardsSection';
import LandingFooter from '@/components/hero/LandingFooter';
import LandingMagicLanes from '@/components/hero/LandingMagicLanes';
import LandingTextContent from '@/components/hero/LandingTextContent';
import AppFaq from '@/components/faq/AppFaq';
// import LandingFeatureCardsSection from '@/components/hero/LandingFeatureCardsSection';
// import LandingFooter from '@/components/hero/LandingFooter';
// import LandingInteractiveSection from '@/components/hero/LandingInteractiveSection';
import LandingNavbar from '@/components/navbar/LandingNavbar';
import LandingInteractiveSection from '@/components/hero/LandingInteractiveSection';

export default function Home() {
    return (
        <div className="min-h-screen w-screen bg-dark-alpha flex flex-col">
            <LandingNavbar />
            <LandingCtaSection />
            <LandingTextContent />
            <LandingFeatureCardsSection />
            <LandingMagicLanes />
            <LandingInteractiveSection />
            <section className="relative z-30 w-full bg-dark-alpha px-6 pt-24 md:px-10">
                <div className="mx-auto w-full max-w-7xl">
                    <AppFaq />
                </div>
            </section>
            {/* <LandingBentoSection /> */}
            <LandingFooter />
        </div>
    );
}
