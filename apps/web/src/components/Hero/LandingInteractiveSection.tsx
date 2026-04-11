"use client";
import { JSX, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface InteractiveSectionType {
  id: number;
  slug: string;
  title: string;
  description: string;
  bullets: string[];
  cta: string;
}

const sections: InteractiveSectionType[] = [
  {
    id: 1,
    slug: "pick-a-market",
    title: "Pick a market",
    description:
      "Browse live event markets — elections, crypto prices, sports, macro. Every market on SolMarket is backed by a real, resolving outcome, not a vibe. Prices, depth and history are streamed in real time.",
    bullets: [
      "Live markets across politics, crypto, sports and macro",
      "Real resolution sources, not vibes",
      "Streaming prices, depth and trade history",
      "Search and filter by category, volume or close date",
    ],
    cta: "EXPLORE MARKETS",
  },
  {
    id: 2,
    slug: "instant-quote",
    title: "Get an instant quote",
    description:
      "Click YES or NO and SolMarket returns a signed, time-bounded quote. The price you see is the price you trade — no slippage surprises, no waiting for a maker to show up.",
    bullets: [
      "Signed, time-bounded quotes on every click",
      "Zero slippage between quote and fill",
      "No waiting for a counterparty to show up",
      "Transparent fees, baked into the price",
    ],
    cta: "SEE A QUOTE",
  },
  {
    id: 3,
    slug: "trade-on-solana",
    title: "Trade on Solana",
    description:
      "Sign one transaction from your Solana wallet. USDC moves, shares mint into your position, and the fill confirms in under a second. No bridging, no wrapped assets, no Polygon detour.",
    bullets: [
      "One signature from your Solana wallet",
      "Native USDC in, position shares out",
      "Sub-second confirmation on mainnet",
      "No bridges, no wrapped assets, no detours",
    ],
    cta: "CONNECT WALLET",
  },
  {
    id: 4,
    slug: "hedged-in-real-time",
    title: "Hedged in real time",
    description:
      "Behind the scenes, every fill is offset against Polymarket within seconds. That is how SolMarket stays neutral, spreads stay tight, and the book stays deep from day one.",
    bullets: [
      "Every fill offset against Polymarket in seconds",
      "Venue stays delta-neutral at all times",
      "Tight spreads and deep books from day one",
      "Hedge telemetry auditable on-chain",
    ],
    cta: "HEDGING DETAILS",
  },
  {
    id: 5,
    slug: "settle-and-claim",
    title: "Settle and claim",
    description:
      "When the market resolves, winning shares are redeemable 1:1 for USDC on Solana. Claim whenever you want — one click, one signature, straight to your wallet.",
    bullets: [
      "Winning shares redeem 1:1 for USDC",
      "Claim on your schedule, no deadline",
      "One click, one signature, straight to wallet",
      "Settlement fully on Solana — no bridging back",
    ],
    cta: "CLAIM FLOW",
  },
];

export default function LandingInteractiveSection(): JSX.Element {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeSection, setActiveSection] = useState<number>(0);

  useEffect(() => {
    let rafId = 0;
    function update() {
      rafId = 0;
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const total = rect.height - viewportH;
      if (total <= 0) {
        setActiveSection(0);
        return;
      }
      const scrolled = Math.min(Math.max(-rect.top, 0), total);
      const progress = scrolled / total;
      const idx = Math.min(
        sections.length - 1,
        Math.max(0, Math.floor(progress * sections.length)),
      );
      setActiveSection(idx);
    }
    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  function scrollToSection(i: number) {
    const el = sectionRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const total = rect.height - viewportH;
    if (total <= 0) return;
    const sectionTop = rect.top + window.scrollY;
    const target = sectionTop + (i / sections.length) * total + 1;
    window.scrollTo({ top: target, behavior: "smooth" });
  }

  return (
    <section ref={sectionRef} className="w-full relative h-[500vh] bg-black text-white">
      <main className="relative grid grid-cols-[16.5%_33.5%_50%] items-start w-full h-full">
        <div className="w-full sticky top-20 h-screen flex flex-col gap-y-4 p-4">
          <ul className="flex flex-col font-mono text-white gap-y-2 mt-8">
            {sections.map((section, i) => {
              const isActive = i === activeSection;
              return (
                <li
                  key={section.id}
                  onClick={() => scrollToSection(i)}
                  className="flex items-center gap-x-3 cursor-pointer group"
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center border tabular-nums text-xs transition-colors",
                      isActive
                        ? "border-white bg-white text-black"
                        : "border-transparent text-white/70 group-hover:bg-alpha group-hover:text-dark-alpha",
                    )}
                  >
                    {section.id.toString().padStart(2, "0")}
                  </span>
                  <h2
                    className={cn(
                      "text-sm tracking-wider uppercase transition-colors",
                      isActive ? "text-white" : "text-white/60",
                    )}
                  >
                    {section.title}
                  </h2>
                </li>
              );
            })}
          </ul>
          <div className="h-full w-full bg-[radial-gradient(rgba(255,255,255,0.592)_0.5px,transparent_1px)] bg-size-[8px_8px]" />
        </div>

        <div className="w-full h-full flex flex-col">
          {sections.map((section) => (
            <article
              key={section.id}
              className="h-screen w-full flex flex-col justify-center px-4 pr-12"
            >
              <h3 className="text-5xl md:text-6xl font-semibold leading-[1.05] tracking-tight text-white">
                {section.title}
              </h3>
              <p className="mt-8 text-xl leading-relaxed text-white/80 max-w-xl">
                {section.description}
              </p>
              <ul className="mt-8 space-y-3 text-lg text-white/90 max-w-xl">
                {section.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-x-3">
                    <span
                      aria-hidden
                      className="mt-[0.55rem] h-1.5 w-1.5 rounded-full bg-white/80 shrink-0"
                    />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-10">
                <button
                  type="button"
                  className="font-mono text-xs tracking-[0.2em] uppercase px-6 py-3 rounded-full border border-white/80 text-white hover:bg-white hover:text-black transition-colors"
                >
                  {section.cta}
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="w-full sticky top-20 h-screen flex items-center justify-center p-8">
          <div className="relative w-full max-w-md aspect-4/5">
            {sections.map((section, i) => (
              <SectionVisual key={section.id} section={section} isActive={i === activeSection} />
            ))}
          </div>
        </div>
      </main>
    </section>
  );
}

function SectionVisual({
  section,
  isActive,
}: {
  section: InteractiveSectionType;
  isActive: boolean;
}): JSX.Element {
  return (
    <div
      className={cn(
        "absolute inset-0 rounded-2xl border border-white/15 bg-linear-to-br from-white/6 to-white/2 p-6 flex flex-col transition-all duration-500",
        isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none",
      )}
    >
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-white/50">
        <span>{section.id.toString().padStart(2, "0")}</span>
        <span>{section.slug}</span>
      </div>

      <div className="mt-6 flex-1">
        {section.id === 1 && <PickMarketVisual />}
        {section.id === 2 && <QuoteVisual />}
        {section.id === 3 && <TradeVisual />}
        {section.id === 4 && <HedgeVisual />}
        {section.id === 5 && <ClaimVisual />}
      </div>
    </div>
  );
}

function PickMarketVisual() {
  const rows = [
    { q: "BTC > $150k by Dec 31", y: 0.62, v: "$4.2M" },
    { q: "Fed cuts in Q2?", y: 0.41, v: "$1.8M" },
    { q: "ETH ETF inflows > $1B", y: 0.73, v: "$912K" },
    { q: "SOL closes > $300", y: 0.28, v: "$640K" },
  ];
  return (
    <div className="flex flex-col gap-y-3">
      {rows.map((r) => (
        <div
          key={r.q}
          className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-4 py-3"
        >
          <div className="flex flex-col">
            <span className="text-sm text-white">{r.q}</span>
            <span className="font-mono text-[10px] text-white/40">vol {r.v}</span>
          </div>
          <div className="flex items-center gap-x-2 font-mono text-xs">
            <span className="text-emerald-400">{Math.round(r.y * 100)}¢</span>
            <span className="text-white/30">/</span>
            <span className="text-rose-400">{Math.round((1 - r.y) * 100)}¢</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function QuoteVisual() {
  return (
    <div className="rounded-xl border border-white/15 bg-black/40 p-5 flex flex-col gap-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/70">BTC &gt; $150k</span>
        <span className="font-mono text-[10px] text-white/40">expires in 00:08</span>
      </div>
      <div className="flex items-baseline gap-x-2">
        <span className="font-mono text-5xl text-white">0.62</span>
        <span className="font-mono text-sm text-emerald-400">YES</span>
      </div>
      <div className="h-px w-full bg-white/10" />
      <div className="grid grid-cols-2 gap-x-3 font-mono text-[10px] text-white/50">
        <div className="flex justify-between">
          <span>SIZE</span>
          <span className="text-white/80">1,000</span>
        </div>
        <div className="flex justify-between">
          <span>FEE</span>
          <span className="text-white/80">0.00</span>
        </div>
        <div className="flex justify-between">
          <span>PAYOUT</span>
          <span className="text-white/80">1,612</span>
        </div>
        <div className="flex justify-between">
          <span>SIG</span>
          <span className="text-white/80">0x3f…a1</span>
        </div>
      </div>
      <div className="mt-2 rounded-md bg-white py-2 text-center font-mono text-[11px] tracking-widest text-black">
        ACCEPT QUOTE
      </div>
    </div>
  );
}

function TradeVisual() {
  const steps = [
    { label: "Sign transaction", done: true },
    { label: "USDC debited", done: true },
    { label: "Shares minted", done: true },
    { label: "Confirmed on Solana", done: true },
  ];
  return (
    <div className="flex flex-col gap-y-4">
      <div className="rounded-xl border border-white/15 bg-black/40 p-5">
        <div className="font-mono text-[10px] uppercase tracking-widest text-white/40">
          Transaction
        </div>
        <div className="mt-2 font-mono text-xs text-white/80 break-all">5k7Q…wX1a</div>
        <div className="mt-4 flex items-center justify-between">
          <span className="font-mono text-[10px] text-white/40">BLOCK</span>
          <span className="font-mono text-xs text-white">289,441,203</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="font-mono text-[10px] text-white/40">FINALITY</span>
          <span className="font-mono text-xs text-emerald-400">0.7s</span>
        </div>
      </div>
      <ul className="flex flex-col gap-y-2">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-x-3 text-sm text-white/80">
            <span className="flex h-4 w-4 items-center justify-center rounded-full border border-emerald-400/60 bg-emerald-400/20 text-[9px] text-emerald-300">
              ✓
            </span>
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HedgeVisual() {
  const bars: { top: string; bot: string }[] = [
    { top: "h-[30%]", bot: "h-[28%]" },
    { top: "h-[42%]", bot: "h-[39%]" },
    { top: "h-[36%]", bot: "h-[33%]" },
    { top: "h-[58%]", bot: "h-[53%]" },
    { top: "h-[48%]", bot: "h-[44%]" },
    { top: "h-[64%]", bot: "h-[59%]" },
    { top: "h-[52%]", bot: "h-[48%]" },
    { top: "h-[70%]", bot: "h-[64%]" },
    { top: "h-[60%]", bot: "h-[55%]" },
    { top: "h-[74%]", bot: "h-[68%]" },
    { top: "h-[66%]", bot: "h-[61%]" },
    { top: "h-[80%]", bot: "h-[74%]" },
  ];
  return (
    <div className="flex flex-col gap-y-5">
      <div className="flex items-end justify-between h-32 gap-x-1">
        {bars.map((b, i) => (
          <div key={i} className="flex-1 flex flex-col gap-y-0.5">
            <div className={cn("w-full bg-emerald-400/70", b.top)} />
            <div className={cn("w-full bg-rose-400/60", b.bot)} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between font-mono text-[10px] text-white/50">
        <span>SOLMARKET FILL</span>
        <span>POLYMARKET HEDGE</span>
      </div>
      <div className="rounded-lg border border-white/10 bg-black/30 px-4 py-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-white/50">
          Net delta
        </span>
        <span className="font-mono text-sm text-emerald-400">+0.003</span>
      </div>
    </div>
  );
}

function ClaimVisual() {
  return (
    <div className="rounded-xl border border-white/15 bg-black/40 p-5 flex flex-col gap-y-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-white/50">
          Resolved
        </span>
        <span className="font-mono text-[10px] text-emerald-400">YES</span>
      </div>
      <div>
        <div className="text-sm text-white/70">BTC &gt; $150k</div>
        <div className="mt-4 flex items-baseline gap-x-2">
          <span className="font-mono text-5xl text-white">1,612</span>
          <span className="font-mono text-xs text-white/50">USDC</span>
        </div>
      </div>
      <div className="h-px w-full bg-white/10" />
      <div className="flex items-center justify-between font-mono text-[10px] text-white/50">
        <span>REDEEM RATIO</span>
        <span className="text-white/80">1 : 1</span>
      </div>
      <div className="flex items-center justify-between font-mono text-[10px] text-white/50">
        <span>NETWORK</span>
        <span className="text-white/80">Solana</span>
      </div>
      <div className="mt-2 rounded-md bg-white py-2 text-center font-mono text-[11px] tracking-widest text-black">
        CLAIM TO WALLET
      </div>
    </div>
  );
}
