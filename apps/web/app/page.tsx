
import LandingCtaSection from '@/components/hero/LandingCtaSection';
import LandingFeatureCardsSection from '@/components/hero/LandingFeatureCardsSection';
import LandingFeaturesSection from '@/components/hero/LandingFeaturesSection';
import LandingHeroSection from '@/components/hero/LandingHeroSection';
import LandingInteractiveSection from '@/components/hero/LandingInteractiveSection';
import LandingNavbar from '@/components/navbar/LandingNavbar';

export default function Home() {
  return (
    <div className="min-h-screen w-screen bg-dark-alpha flex flex-col">
      <LandingNavbar />
      <LandingHeroSection />
      <LandingFeaturesSection />
      <LandingFeatureCardsSection />
      <LandingInteractiveSection />
      <LandingCtaSection />
      <div className='h-screen w-screen'>
    sdv
      </div>
    </div>
  );
}
