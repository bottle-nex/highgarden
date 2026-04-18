import LandingBentoSection from '@/components/hero/LandingBentoSection';
import LandingCtaSection from '@/components/hero/LandingCtaSection';
import LandingFeatureCardsSection from '@/components/hero/LandingFeatureCardsSection';
import LandingFooter from '@/components/hero/LandingFooter';
import LandingInteractiveSection from '@/components/hero/LandingInteractiveSection';
import LandingNavbar from '@/components/navbar/LandingNavbar';
import DepositDialogTrigger from '@/components/ui/deposit-dialog-trigger';

export default function Home() {
    return (
        <div className="min-h-screen w-screen bg-neutral-950 flex flex-col">
            <LandingNavbar />
            <DepositDialogTrigger />
            <LandingCtaSection />
            <LandingFeatureCardsSection />
            <LandingInteractiveSection />
            <LandingBentoSection />

            <LandingFooter />
        </div>
    );
}
