"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@base-ui/react";
import { cn } from "@/lib/utils";
// import { Exo_2 } from "next/font/google";

// const exo2 = Exo_2({
//   subsets: ["latin"],
//   weight: ["800"],
//   style: ["italic"],
//   display: "swap",
// });

export default function LandingNavbar() {
  const [isScrolled, setIsScrolled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.scrollY > 80;
  });

  const handleScroll = useCallback(() => {
    if (window.scrollY > 80) {
      setIsScrolled(true);
    } else {
      setIsScrolled(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  return (
    <nav
      className={cn(
        "h-18 w-full fixed top-0 left-0 flex items-center justify-between px-8 text-[12px] font-sans z-50 transition-all duration-500",
        isScrolled
          ? "bg-dark-alpha backdrop-blur-xl  text-light-base"
          : "bg-transparent text-light-base/80",
      )}
    >
      <div className="flex gap-x-8 items-center">
        {/* <span
          className={cn(
            'text-light-base leading-none pb-1 transition-transform duration-300',
            exo2.className,
            isScrolled ? "scale-95" : "scale-100"
          )}
        >
          SOLMARKET
        </span> */}
        <div className="flex gap-x-6">
          {["SOLMARKET", "ABOUT", "RESOURCES", "ECOSYSTEM"].map((item) => (
            <span
              key={item}
              className="cursor-pointer hover:text-light-base transition-colors duration-150"
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center">
        <Button
          className={cn(
            "bg-light-base text-dark-base px-6 py-2 rounded-full font-sans font-medium hover:opacity-90 transition-all",
            isScrolled ? "py-1.5 text-[11px]" : "py-2",
          )}
        >
          LOGIN
        </Button>
      </div>
    </nav>
  );
}
