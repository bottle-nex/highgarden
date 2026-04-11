import LandingFeaturesSection from "@/components/Hero/LandingFeaturesSection";
import LandingHeroSection from "@/components/Hero/LandingHeroSection";
import LandingNavbar from "@/components/Navbar/LandingNavbar";

export default function Home() {
  return (
    <div className="min-h-screen w-screen overflow-y-auto bg-dark-alpha flex flex-col">
      <LandingNavbar />
      <LandingHeroSection />
      <LandingFeaturesSection />
    </div>
  );
}
