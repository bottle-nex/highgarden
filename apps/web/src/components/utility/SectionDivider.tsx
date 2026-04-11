import { cn } from "../../../lib/utils";
import { robotoCondensed } from "../Hero/LandingHeroSection";

function MarqueeItem() {
  return (
    <>
      <div className="text-2xl text-dark-base uppercase font-semibold whitespace-nowrap">
        SOLANA DEDICATED <span className="font-serif font-normal italic">PREDICTION MARKET</span>
      </div>
      <div className="h-px w-20 bg-dark-base shrink-0" />
    </>
  );
}

export default function SectionDivider() {
  return (
    <div className="h-20 w-full bg-light-base overflow-hidden flex items-center border-y border-dark-base/10">
      <div
        className={cn(
          "flex items-center gap-x-10 animate-marquee w-max",
          robotoCondensed.className,
        )}
      >
        <div className="flex items-center gap-x-10">
          <MarqueeItem />
          <MarqueeItem />
          <MarqueeItem />
          <MarqueeItem />
        </div>

        <div className="flex items-center gap-x-10">
          <MarqueeItem />
          <MarqueeItem />
          <MarqueeItem />
          <MarqueeItem />
        </div>
      </div>
    </div>
  );
}
