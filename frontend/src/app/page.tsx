"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { OrbitLogo } from "@/components/ui/orbit-logo";

// ─── Splash screen (orbit reveal → comet trail → curtain) ─────────────

function SplashScreen({ onComplete }: { onComplete: () => void }) {
  // 0=blank, 1=logo spins in, 2=text wipes left→right, 3=hold, 4=logo launches up, 5=curtain
  const [phase, setPhase] = useState(0);
  const logoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 150),   // logo spins in
      setTimeout(() => setPhase(2), 700),   // text wipe begins
      setTimeout(() => setPhase(3), 1700),  // fully visible, hold
      setTimeout(() => setPhase(4), 2000),  // logo launches up with trail
      setTimeout(() => setPhase(5), 2400),  // curtain slides up
      setTimeout(() => onComplete(), 3300), // cleanup
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-background"
      style={{
        transform: phase >= 5 ? "translateY(-100%)" : "translateY(0)",
        transition:
          phase >= 5
            ? "transform 0.85s cubic-bezier(0.76, 0, 0.24, 1)"
            : "none",
        willChange: "transform",
      }}
    >
      <div className="relative flex items-center gap-4">
        {/* Logo — spins in, then launches upward. Trail is a child so it moves with it */}
        <div
          ref={logoRef}
          className="relative"
          style={{
            opacity: phase >= 1 && phase < 5 ? 1 : 0,
            transform:
              phase === 0
                ? "scale(0.5) rotate(-180deg)"
                : phase >= 4
                  ? "translateY(-120vh)"
                  : "scale(1) rotate(0deg)",
            transition:
              phase === 0
                ? "none"
                : phase >= 4
                  ? "transform 0.6s cubic-bezier(0.5, 0, 1, 0.5), opacity 0.2s ease-out 0.4s"
                  : "opacity 0.6s ease-out, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <OrbitLogo size={48} />
          {/* Trail — hangs below the logo, grows as it launches, fades before curtain */}
          <div
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              top: "100%",
              width: "2px",
              background:
                "linear-gradient(to bottom, rgba(255,255,255,0.8), rgba(255,255,255,0.2) 60%, transparent)",
              height: phase === 4 ? "60vh" : "0",
              opacity: phase === 4 ? 1 : 0,
              transition:
                phase === 4
                  ? "height 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.1s ease-out"
                  : "opacity 0.15s ease-out, height 0.15s ease-out",
            }}
          />
        </div>

        {/* Text — clip-path wipe from left to right */}
        <span
          className="text-4xl font-bold tracking-tight text-foreground"
          style={{
            clipPath:
              phase >= 2
                ? "inset(0 0% 0 0)"
                : "inset(0 100% 0 0)",
            transition:
              phase >= 2
                ? "clip-path 0.7s cubic-bezier(0.16, 1, 0.3, 1)"
                : "none",
          }}
        >
          Orbit
        </span>
      </div>

      {/* Star field */}
      {phase >= 1 && phase < 5 && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {(
            [
              // [left%, top%, size px, opacity, pulse duration, delay]
              [8, 15, 2, 0.5, 3.0, 0],
              [22, 8, 1.5, 0.35, 3.6, 0.4],
              [35, 72, 2.5, 0.55, 2.8, 0.1],
              [12, 55, 1.5, 0.3, 4.0, 0.8],
              [50, 12, 2, 0.45, 3.2, 0.3],
              [65, 80, 1.5, 0.35, 3.8, 0.6],
              [78, 20, 2.5, 0.5, 2.6, 0.2],
              [88, 45, 2, 0.4, 3.4, 0.5],
              [42, 88, 1.5, 0.3, 4.2, 0.9],
              [92, 72, 2, 0.45, 3.0, 0.7],
              [5, 82, 2, 0.4, 3.6, 0.3],
              [72, 42, 1.5, 0.3, 3.8, 1.0],
              [55, 30, 2, 0.5, 2.8, 0.15],
              [30, 40, 1.5, 0.25, 4.4, 0.6],
              [82, 60, 2.5, 0.45, 3.2, 0.4],
              [18, 92, 1.5, 0.35, 3.6, 0.8],
            ] as [number, number, number, number, number, number][]
          ).map(([left, top, size, opacity, dur, delay], i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: `${size}px`,
                height: `${size}px`,
                backgroundColor: "white",
                opacity,
                boxShadow: `0 0 ${size * 3}px ${size}px rgba(255,255,255,0.4)`,
                animation: `pulse ${dur}s ease-in-out infinite`,
                animationDelay: `${delay}s`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Scroll-triggered fade-up ─────────────────────────────────────────

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) translateZ(0)" : "translateY(40px) translateZ(0)",
        transition: `opacity 0.9s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.9s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────

function NavBar() {
  // Pill nav floats from the top with side gutters — Clave-style.
  // The inner shell stays opaque so links stay readable over hero
  // gradients; a tiny scroll listener bumps the shadow once the
  // user has moved past the splash so the bar reads as "anchored"
  // when scrolling.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4 sm:top-6 sm:px-6">
      <div
        className={`pointer-events-auto flex h-14 w-full max-w-5xl items-center justify-between rounded-full border border-border/60 bg-surface/85 px-4 backdrop-blur-xl transition-shadow duration-300 sm:px-5 ${
          scrolled ? "shadow-xl shadow-black/10" : "shadow-md shadow-black/5"
        }`}
      >
        <Link href="/" className="flex items-center gap-2.5">
          <OrbitLogo size={26} />
          <span className="text-base font-semibold tracking-tight text-foreground">
            Orbit
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:px-4"
          >
            Log in
          </Link>
          <Link
            href="/login"
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground shadow-sm shadow-accent/25 transition-all hover:brightness-110 hover:shadow-md hover:shadow-accent/30 sm:px-5 sm:py-2"
          >
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── Hero cards on dual orbital paths ────────────────────────────────

type OrbitCard = { content: ReactNode; className: string; x: number; y: number };

// Outer orbit (rx=580, ry=290) — communication cards at 15°, 150°, 270°
const outerCards: OrbitCard[] = [
  {
    x: 560, y: -75, className: "w-52",
    content: (
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-400/15 text-[8px] font-bold text-violet-400">JW</div>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-foreground">James Wright</p>
          <p className="truncate text-[10px] text-muted-foreground">Contract ready for review</p>
        </div>
      </div>
    ),
  },
  {
    x: -502, y: -145, className: "w-52",
    content: (
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-400/15 text-[8px] font-bold text-blue-400">SC</div>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-foreground">Sarah Chen</p>
          <p className="truncate text-[10px] text-muted-foreground">Q3 budget: needs sign-off</p>
        </div>
      </div>
    ),
  },
  {
    x: 0, y: 290, className: "w-52",
    content: (
      <>
        <div className="flex items-center gap-2.5">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400/15">
            <svg className="h-2.5 w-2.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <span className="text-[10px] text-muted-foreground">
            Send email to <span className="font-medium text-foreground">Lisa Park</span>?
          </span>
        </div>
        <div className="mt-2 flex gap-2">
          <div className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[9px] font-semibold text-emerald-400">Approve</div>
          <div className="rounded-md bg-red-500/15 px-2 py-0.5 text-[9px] font-semibold text-red-400">Reject</div>
        </div>
      </>
    ),
  },
];

// Inner orbit (rx=450, ry=240) — productivity cards at 80°, 210°, 330°
const innerCards: OrbitCard[] = [
  {
    x: 78, y: -236, className: "w-48",
    content: (
      <>
        <div className="flex items-center gap-2.5">
          <div className="h-2 w-2 shrink-0 rounded-full bg-violet-400" />
          <span className="font-mono text-[10px] font-medium text-accent">10:30</span>
          <span className="text-[11px] text-foreground">Design review</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2.5">
          <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          <span className="font-mono text-[10px] font-medium text-accent">1:00</span>
          <span className="text-[11px] text-foreground">Lunch with Alex</span>
        </div>
      </>
    ),
  },
  {
    x: -390, y: 120, className: "w-44",
    content: (
      <>
        <p className="mb-1 text-[9px] font-semibold tracking-wider text-muted-foreground uppercase">To Do</p>
        {([
          { text: "Review PR #142", done: true },
          { text: "Book flights", done: false },
        ] as const).map((t) => (
          <div key={t.text} className="flex items-center gap-2 py-0.5">
            <div className={`h-3 w-3 shrink-0 rounded-[3px] border ${t.done ? "border-emerald-500/50 bg-emerald-500/20" : "border-muted-foreground/30"}`}>
              {t.done && (
                <svg className="h-3 w-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className={`text-[10px] ${t.done ? "text-muted-foreground line-through" : "text-foreground"}`}>{t.text}</span>
          </div>
        ))}
      </>
    ),
  },
  {
    x: 390, y: 120, className: "w-52",
    content: (
      <div className="flex items-center gap-2.5">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/15">
          <svg className="h-3 w-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Completed <span className="font-medium text-foreground">Finalize Q3 slides</span>
        </p>
      </div>
    ),
  },
];

// Decorative icon SVG paths (mail, calendar, task)
const decoIconPaths = [
  "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75",
  "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
];

// ─── Hero ─────────────────────────────────────────────────────────────

const OUTER_CIRC = 2810;
const INNER_CIRC = 2218;
const OUTER_CARD_POS = [15, 150, 270].map((a) => (((360 - a) % 360) / 360) * OUTER_CIRC);
const INNER_CARD_POS = [80, 210, 330].map((a) => (((360 - a) % 360) / 360) * INNER_CIRC);
const DECO_RX = 700;
const DECO_RY = 370;

function HeroSection() {
  const [activeOuter, setActiveOuter] = useState(-1);
  const [activeInner, setActiveInner] = useState(-1);
  const hoveredRef = useRef<{ orbit: "o" | "i"; idx: number } | null>(null);

  // Outer sweep
  const oSweepRef = useRef<SVGEllipseElement>(null);
  const oGlowRef = useRef<SVGEllipseElement>(null);
  const oSweepPos = useRef(0);
  const lastOuter = useRef(-1);

  // Inner sweep
  const iSweepRef = useRef<SVGEllipseElement>(null);
  const iGlowRef = useRef<SVGEllipseElement>(null);
  const iSweepPos = useRef(0);
  const lastInner = useRef(-1);

  // Decorative icons
  const decoRefs = useRef<(HTMLDivElement | null)[]>([]);
  const decoAngle = useRef(0);

  const rafRef = useRef<number>(0);
  const lastT = useRef<number | null>(null);

  useEffect(() => {
    const oDur = 35;
    const iDur = 24;
    const oDash = 400;
    const iDash = 320;

    const tick = (time: number) => {
      const paused = hoveredRef.current !== null;
      const dt = lastT.current !== null && !paused ? (time - lastT.current) / 1000 : 0;
      lastT.current = time;

      // Outer sweep
      oSweepPos.current = (oSweepPos.current + (dt / oDur) * OUTER_CIRC) % OUTER_CIRC;
      const oOff = `${-oSweepPos.current}`;
      if (oSweepRef.current) oSweepRef.current.style.strokeDashoffset = oOff;
      if (oGlowRef.current) oGlowRef.current.style.strokeDashoffset = oOff;

      // Inner sweep
      iSweepPos.current = (iSweepPos.current + (dt / iDur) * INNER_CIRC) % INNER_CIRC;
      const iOff = `${-iSweepPos.current}`;
      if (iSweepRef.current) iSweepRef.current.style.strokeDashoffset = iOff;
      if (iGlowRef.current) iGlowRef.current.style.strokeDashoffset = iOff;

      // Activate closest card per orbit
      if (!hoveredRef.current) {
        const oc = (oSweepPos.current + oDash / 2) % OUTER_CIRC;
        let ci = 0, cd = Infinity;
        for (let i = 0; i < OUTER_CARD_POS.length; i++) {
          let d = Math.abs(oc - OUTER_CARD_POS[i]);
          if (d > OUTER_CIRC / 2) d = OUTER_CIRC - d;
          if (d < cd) { cd = d; ci = i; }
        }
        if (ci !== lastOuter.current) { lastOuter.current = ci; setActiveOuter(ci); }

        const ic = (iSweepPos.current + iDash / 2) % INNER_CIRC;
        ci = 0; cd = Infinity;
        for (let i = 0; i < INNER_CARD_POS.length; i++) {
          let d = Math.abs(ic - INNER_CARD_POS[i]);
          if (d > INNER_CIRC / 2) d = INNER_CIRC - d;
          if (d < cd) { cd = d; ci = i; }
        }
        if (ci !== lastInner.current) { lastInner.current = ci; setActiveInner(ci); }
      }

      // Decorative icons orbit
      decoAngle.current = (decoAngle.current + dt * (360 / 160)) % 360;
      for (let i = 0; i < 3; i++) {
        const el = decoRefs.current[i];
        if (el) {
          const a = ((decoAngle.current + i * 120) * Math.PI) / 180;
          el.style.transform = `translate(${DECO_RX * Math.cos(a)}px, ${-DECO_RY * Math.sin(a)}px) translate(-50%, -50%)`;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const onEnter = useCallback((orbit: "o" | "i", idx: number) => {
    hoveredRef.current = { orbit, idx };
    if (orbit === "o") { lastOuter.current = idx; setActiveOuter(idx); }
    else { lastInner.current = idx; setActiveInner(idx); }
  }, []);

  const onLeave = useCallback(() => {
    hoveredRef.current = null;
    lastT.current = null;
  }, []);

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      {/* Orbital rings + cards — hidden on mobile */}
      <div className="absolute inset-0 hidden md:block">
        <svg
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          width="1500" height="820" viewBox="-750 -410 1500 820" fill="none"
        >
          <defs>
            <filter id="og"><feGaussianBlur stdDeviation="8" /></filter>
            <filter id="ig"><feGaussianBlur stdDeviation="5" /></filter>
          </defs>

          {/* Decorative outermost ring */}
          <ellipse cx="0" cy="0" rx="700" ry="370" stroke="var(--accent)" strokeWidth="1" opacity="0.12" />

          {/* ── Outer orbit (rx=580, ry=290) ── */}
          <ellipse cx="0" cy="0" rx="580" ry="290" stroke="var(--accent)" strokeWidth="6" opacity="0.1" filter="url(#og)" />
          <ellipse cx="0" cy="0" rx="580" ry="290" stroke="var(--accent)" strokeWidth="1.2" opacity="0.18" />
          <ellipse ref={oSweepRef} cx="0" cy="0" rx="580" ry="290" stroke="var(--accent)" strokeWidth="2" opacity="0.45" strokeDasharray="400 2410" strokeLinecap="round" />
          <ellipse ref={oGlowRef} cx="0" cy="0" rx="580" ry="290" stroke="var(--accent)" strokeWidth="8" opacity="0.12" strokeDasharray="400 2410" strokeLinecap="round" style={{ filter: "url(#og)" }} />

          {/* ── Inner orbit (rx=450, ry=240) ── */}
          <ellipse cx="0" cy="0" rx="450" ry="240" stroke="var(--accent)" strokeWidth="3" opacity="0.04" filter="url(#ig)" />
          <ellipse cx="0" cy="0" rx="450" ry="240" stroke="var(--accent)" strokeWidth="0.75" opacity="0.08" />
          <ellipse ref={iSweepRef} cx="0" cy="0" rx="450" ry="240" stroke="var(--accent)" strokeWidth="1.2" opacity="0.25" strokeDasharray="320 1898" strokeLinecap="round" />
          <ellipse ref={iGlowRef} cx="0" cy="0" rx="450" ry="240" stroke="var(--accent)" strokeWidth="5" opacity="0.06" strokeDasharray="320 1898" strokeLinecap="round" style={{ filter: "url(#ig)" }} />

          {/* Node dots — outer */}
          {outerCards.map((c, i) => (
            <circle key={`on${i}`} cx={c.x} cy={c.y} r={activeOuter === i ? 3.5 : 2} fill="var(--accent)" opacity={activeOuter === i ? 0.6 : 0.15} style={{ transition: "r 0.5s, opacity 0.5s" }} />
          ))}
          {/* Node dots — inner */}
          {innerCards.map((c, i) => (
            <circle key={`in${i}`} cx={c.x} cy={c.y} r={activeInner === i ? 3 : 1.5} fill="var(--accent)" opacity={activeInner === i ? 0.5 : 0.12} style={{ transition: "r 0.5s, opacity 0.5s" }} />
          ))}
        </svg>

        {/* Outer orbit cards */}
        {outerCards.map((card, i) => {
          const active = activeOuter === i;
          return (
            <div key={`oc${i}`} className="absolute left-1/2 top-1/2" style={{ transform: `translate(${card.x}px, ${card.y}px) translate(-50%, -50%)` }} onMouseEnter={() => onEnter("o", i)} onMouseLeave={onLeave}>
              <div className={`cursor-default rounded-xl border px-3 py-2.5 backdrop-blur-md transition-all duration-500 ease-out ${card.className} ${active ? "border-accent/30 bg-background shadow-lg shadow-accent/10" : "border-border/40 bg-background/70 shadow-md shadow-black/5"}`} style={{ opacity: active ? 1 : 0.55, transform: active ? "scale(1.04)" : "scale(0.98)" }}>
                {card.content}
              </div>
            </div>
          );
        })}

        {/* Inner orbit cards */}
        {innerCards.map((card, i) => {
          const active = activeInner === i;
          return (
            <div key={`ic${i}`} className="absolute left-1/2 top-1/2" style={{ transform: `translate(${card.x}px, ${card.y}px) translate(-50%, -50%)` }} onMouseEnter={() => onEnter("i", i)} onMouseLeave={onLeave}>
              <div className={`cursor-default rounded-xl border px-3 py-2.5 backdrop-blur-md transition-all duration-500 ease-out ${card.className} ${active ? "border-accent/30 bg-background shadow-lg shadow-accent/10" : "border-border/40 bg-background/70 shadow-md shadow-black/5"}`} style={{ opacity: active ? 1 : 0.5, transform: active ? "scale(1.04)" : "scale(0.97)" }}>
                {card.content}
              </div>
            </div>
          );
        })}

        {/* Decorative orbiting icons */}
        {decoIconPaths.map((d, i) => (
          <div key={`di${i}`} ref={(el) => { decoRefs.current[i] = el; }} className="pointer-events-none absolute left-1/2 top-1/2">
            <svg className="h-3.5 w-3.5 text-accent/[0.12]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={d} />
            </svg>
          </div>
        ))}
      </div>

      {/* Orb glow behind hero text */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="h-[400px] w-[500px] rounded-full opacity-15 blur-[120px]" style={{ background: "radial-gradient(ellipse, var(--accent) 0%, transparent 70%)" }} />
      </div>

      {/* Center content */}
      <div className="relative z-10 flex max-w-3xl flex-col items-center gap-8 text-center">
        {/* Status pill — Linear / Vercel pattern, signals living project */}
        <a
          href="https://github.com/FelipeSanch/Orbit"
          target="_blank"
          rel="noopener noreferrer"
          className="landing-hero-stagger group flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur-md transition-all hover:border-accent/40 hover:text-foreground"
          style={{ animationDelay: "0.1s" }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="font-mono text-[10px] tracking-wider uppercase text-accent">
            v0.1
          </span>
          <span className="text-border">·</span>
          <span>Live build, source on GitHub</span>
          <svg
            className="h-3 w-3 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 8l4 4m0 0l-4 4m4-4H3"
            />
          </svg>
        </a>

        <h1
          className="landing-hero-stagger text-5xl leading-[1.05] font-bold tracking-tight sm:text-7xl"
          style={{ animationDelay: "0.25s" }}
        >
          One chat for
          <br />
          <span className="landing-gradient-text bg-gradient-to-r from-accent via-indigo-400 to-accent bg-clip-text text-transparent">
            all your work
          </span>
        </h1>

        <p
          className="landing-hero-stagger max-w-lg text-lg leading-relaxed text-muted-foreground"
          style={{ animationDelay: "0.4s" }}
        >
          A personal AI assistant for Outlook, Calendar, and Tasks —
          plus Telegram as a peer channel. Real tool calls, live
          activity feed, approval before any write.
        </p>

        <div
          className="landing-hero-stagger flex items-center gap-3"
          style={{ animationDelay: "0.55s" }}
        >
          <Link
            href="/login"
            className="rounded-xl bg-accent px-6 py-3 text-sm font-medium text-accent-foreground shadow-lg shadow-accent/25 transition-all hover:shadow-xl hover:shadow-accent/30"
          >
            Get Started
          </Link>
          <a
            href="#demo"
            className="rounded-xl px-5 py-3 text-sm font-medium text-muted-foreground transition-all hover:text-foreground"
          >
            See how it works →
          </a>
        </div>
      </div>
    </section>
  );
}
// ─── Tech stack strip — "Built on" ────────────────────────────────────

const STACK = [
  { label: "Claude Sonnet + Haiku", sub: "Anthropic" },
  { label: "Agno", sub: "Multi-agent" },
  { label: "FastAPI", sub: "Python" },
  { label: "Next.js 16", sub: "App Router" },
  { label: "Neon", sub: "Postgres" },
  { label: "Telegram", sub: "Peer channel" },
];

function StackStrip() {
  return (
    <section className="border-y border-border/40 bg-surface/30 py-10 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-12">
          <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60 uppercase">
            Built on
          </p>
          <div className="flex flex-1 flex-wrap items-center justify-center gap-x-8 gap-y-4 sm:justify-between">
            {STACK.map((item) => (
              <div
                key={item.label}
                className="group flex flex-col items-center text-center transition-all sm:flex-row sm:gap-2 sm:text-left"
              >
                <span className="text-sm font-medium text-foreground/80 transition-colors group-hover:text-foreground">
                  {item.label}
                </span>
                <span className="font-mono text-[10px] tracking-wider text-muted-foreground/50 uppercase">
                  {item.sub}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Scroll-hijacked demo showcase ────────────────────────────────────

// Mini activity-feed rows that appear alongside each demo's chat —
// pulled from the same event-type vocabulary the real dashboard uses.
type DemoActivity = {
  icon: "delegate" | "tool" | "result" | "approve";
  title: string;
  subtitle: string;
  tone: "default" | "approve" | "success";
};

const demos = [
  {
    label: "Mail",
    tag: "01",
    title: "Triage your inbox",
    description:
      "Search, summarize, and act on Outlook mail without switching apps.",
    activity: [
      { icon: "delegate", title: "Email-Agent", subtitle: "Delegated", tone: "default" },
      { icon: "tool", title: "Search Emails", subtitle: "Executing", tone: "default" },
      { icon: "result", title: "Result Received", subtitle: "2 urgent found", tone: "success" },
      { icon: "approve", title: "Approval Needed", subtitle: "reply_to_email", tone: "approve" },
    ] satisfies DemoActivity[],
    messages: [
      { role: "user" as const, text: "Any urgent emails today?" },
      {
        role: "assistant" as const,
        content: (
          <>
            <p className="text-[12px] text-muted-foreground">
              Found{" "}
              <span className="font-medium text-foreground">2 urgent</span>{" "}
              emails:
            </p>
            <div className="mt-1.5 space-y-1">
              {[
                {
                  from: "Sarah Chen",
                  subject: "Q3 budget: needs your sign-off",
                  time: "9:14 AM",
                  tag: "Approval",
                  tagColor: "bg-amber-400/10 text-amber-400",
                },
                {
                  from: "HR Team",
                  subject: "Benefits enrollment closes Friday",
                  time: "7:30 AM",
                  tag: "Deadline",
                  tagColor: "bg-red-400/10 text-red-400",
                },
              ].map((email) => (
                <div
                  key={email.from}
                  className="flex items-center gap-2.5 rounded-lg border border-border/50 px-2.5 py-1.5"
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[8px] font-semibold text-accent">
                    {email.from
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-medium text-foreground">
                        {email.from}
                      </span>
                      <span className="shrink-0 text-[9px] text-muted-foreground">
                        {email.time}
                      </span>
                    </div>
                    <p className="truncate text-[9px] text-muted-foreground">
                      {email.subject}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-medium ${email.tagColor}`}
                  >
                    {email.tag}
                  </span>
                </div>
              ))}
            </div>
          </>
        ),
      },
      { role: "user" as const, text: "Reply to Sarah, approve it and ask for the final PDF" },
      {
        role: "assistant" as const,
        content: (
          <>
            <p className="text-[11px] text-muted-foreground">
              Drafted reply to{" "}
              <span className="font-medium text-foreground">Sarah Chen</span>:
            </p>
            <div className="mt-1.5 rounded-lg border border-border/50 px-2.5 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
              Budget looks good, approved! Could you send the final PDF?
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-2 py-1">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              <span className="text-[9px] font-medium text-accent">
                Waiting for approval to send
              </span>
            </div>
          </>
        ),
      },
    ],
  },
  {
    label: "Calendar",
    tag: "02",
    title: "Own your schedule",
    description:
      "Check availability, create events, and resolve conflicts in natural language.",
    activity: [
      { icon: "delegate", title: "Calendar-Agent", subtitle: "Delegated", tone: "default" },
      { icon: "tool", title: "List Events", subtitle: "Executing", tone: "default" },
      { icon: "result", title: "Result Received", subtitle: "3 events tomorrow", tone: "success" },
      { icon: "approve", title: "Approval Needed", subtitle: "create_event", tone: "approve" },
      { icon: "result", title: "Event Created", subtitle: "invite dispatched", tone: "success" },
    ] satisfies DemoActivity[],
    messages: [
      { role: "user" as const, text: "What does tomorrow look like?" },
      {
        role: "assistant" as const,
        content: (
          <>
            <p className="text-[13px] text-muted-foreground">
              <span className="font-medium text-foreground">
                Wednesday, Apr 18
              </span>
              {" "}has 3 events:
            </p>
            <div className="mt-2 space-y-1">
              {[
                {
                  time: "9:00",
                  event: "Team standup",
                  duration: "30m",
                  color: "bg-blue-400",
                },
                {
                  time: "10:30",
                  event: "Design review",
                  duration: "1h",
                  color: "bg-violet-400",
                },
                {
                  time: "3:00",
                  event: "Sprint planning",
                  duration: "1h 30m",
                  color: "bg-amber-400",
                },
              ].map((item) => (
                <div
                  key={item.time}
                  className="flex items-center gap-2.5 rounded-lg border border-border/50 px-2.5 py-1.5"
                >
                  <div
                    className={`h-2 w-2 shrink-0 rounded-full ${item.color}`}
                  />
                  <span className="w-10 shrink-0 font-mono text-[10px] text-accent">
                    {item.time}
                  </span>
                  <span className="flex-1 text-[11px] text-foreground">
                    {item.event}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    {item.duration}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 rounded-lg border border-dashed border-accent/30 px-2.5 py-1.5 text-[10px] text-accent">
              Open: 11:00 AM – 3:00 PM
            </div>
          </>
        ),
      },
      {
        role: "user" as const,
        text: "Book a 1:1 with Alex at noon tomorrow",
      },
      {
        role: "assistant" as const,
        content: (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-border/50 px-2.5 py-2">
              <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
              <div className="flex-1">
                <p className="text-[11px] font-medium text-foreground">
                  1:1 with Alex
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Wed, Apr 18 · 12:00 – 12:30 PM
                </p>
              </div>
              <svg
                className="h-3.5 w-3.5 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Created and invite sent to Alex. No conflicts.
            </p>
          </>
        ),
      },
    ],
  },
  {
    label: "Tasks",
    tag: "03",
    title: "Stay on track",
    description:
      "Create, complete, and organize tasks in Microsoft To Do from the chat.",
    activity: [
      { icon: "delegate", title: "Tasks-Agent", subtitle: "Delegated", tone: "default" },
      { icon: "tool", title: "List Tasks", subtitle: "Executing", tone: "default" },
      { icon: "result", title: "Result Received", subtitle: "3 due this week", tone: "success" },
      { icon: "approve", title: "Approval Needed", subtitle: "complete_task", tone: "approve" },
      { icon: "result", title: "Task Completed", subtitle: "1 marked done", tone: "success" },
    ] satisfies DemoActivity[],
    messages: [
      { role: "user" as const, text: "What's due this week?" },
      {
        role: "assistant" as const,
        content: (
          <>
            <p className="text-[13px] text-muted-foreground">
              <span className="font-medium text-foreground">3 tasks</span>{" "}
              due this week:
            </p>
            <div className="mt-2 space-y-1">
              {[
                {
                  task: "Finalize Q3 slides",
                  due: "Wed",
                  done: false,
                  list: "Work",
                },
                {
                  task: "Send invoice to Acme",
                  due: "Thu",
                  list: "Finance",
                  done: false,
                },
                {
                  task: "Book flights for offsite",
                  due: "Fri",
                  list: "Travel",
                  done: false,
                },
              ].map((item) => (
                <div
                  key={item.task}
                  className="flex items-center gap-2.5 rounded-lg border border-border/50 px-2.5 py-1.5"
                >
                  <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border border-muted-foreground/30" />
                  <span className="flex-1 text-[11px] text-foreground">
                    {item.task}
                  </span>
                  <span className="rounded-full bg-accent/5 px-1.5 py-0.5 text-[8px] text-muted-foreground">
                    {item.list}
                  </span>
                  <span className="font-mono text-[9px] text-muted-foreground">
                    {item.due}
                  </span>
                </div>
              ))}
            </div>
          </>
        ),
      },
      {
        role: "user" as const,
        text: "Mark the slides as done and add 'Prep offsite agenda' for Friday",
      },
      {
        role: "assistant" as const,
        content: (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5 rounded-lg border border-border/50 px-2.5 py-1.5">
                <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border border-emerald-500/50 bg-emerald-500/20">
                  <svg
                    className="h-2 w-2 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <span className="flex-1 text-[11px] text-muted-foreground line-through">
                  Finalize Q3 slides
                </span>
                <span className="text-[9px] text-emerald-400">Done</span>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-accent/20 bg-accent/5 px-2.5 py-1.5">
                <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border border-accent/30">
                  <div className="h-1 w-1 rounded-full bg-accent" />
                </div>
                <span className="flex-1 text-[11px] text-foreground">
                  Prep offsite agenda
                </span>
                <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[8px] text-accent">
                  New
                </span>
                <span className="font-mono text-[9px] text-muted-foreground">
                  Fri
                </span>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Marked complete and created new task. 2 remaining this week.
            </p>
          </>
        ),
      },
    ],
  },
];

function UserBubble({ text }: { text: string }) {
  return (
    <div className="self-end rounded-2xl rounded-br-md bg-accent/10 px-3.5 py-2 text-[12px] text-foreground">
      {text}
    </div>
  );
}

function AssistantBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 self-start">
      <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10">
        <OrbitLogo size={12} />
      </div>
      <div className="rounded-2xl rounded-bl-md border border-border px-3 py-2">
        {children}
      </div>
    </div>
  );
}

function DemoActivityIcon({ kind }: { kind: DemoActivity["icon"] }) {
  const paths: Record<DemoActivity["icon"], string> = {
    delegate: "M12 4.5v15m7.5-7.5h-15",
    tool: "M10.5 6L4 12.5 10.5 19M13.5 6L20 12.5 13.5 19",
    result: "M4.5 12.75l6 6 9-13.5",
    approve:
      "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z",
  };
  return (
    <svg
      className="h-3 w-3"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={paths[kind]} />
    </svg>
  );
}

function DemoActivityFeed({ items }: { items: DemoActivity[] }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
        <span className="text-[10px] font-medium text-muted-foreground">
          Activity
        </span>
        <span className="font-mono text-[9px] text-muted-foreground/60">
          {items.length}
        </span>
      </div>
      <div className="flex flex-col gap-0 overflow-hidden px-2 py-2">
        {items.map((row, i) => {
          const tone =
            row.tone === "approve"
              ? "text-amber-300"
              : row.tone === "success"
                ? "text-emerald-400"
                : "text-accent";
          const bg =
            row.tone === "approve"
              ? "bg-amber-300/10"
              : row.tone === "success"
                ? "bg-emerald-400/10"
                : "bg-accent/10";
          return (
            <div
              key={`${row.title}-${i}`}
              className="flex items-center gap-2 py-1.5"
            >
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${bg} ${tone}`}
              >
                <DemoActivityIcon kind={row.icon} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-medium text-foreground">
                  {row.title}
                </p>
                <p className="truncate text-[9px] text-muted-foreground">
                  {row.subtitle}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DemoSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const scrolled = -rect.top;
    const total = el.offsetHeight - window.innerHeight;
    if (total <= 0) return;
    const progress = Math.max(0, Math.min(1, scrolled / total));
    const idx = Math.min(
      demos.length - 1,
      Math.floor(progress * demos.length),
    );
    setActiveIndex(idx);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  return (
    <section
      ref={containerRef}
      id="demo"
      className="mt-32"
      style={{ height: `${(demos.length + 1.5) * 100}vh` }}
    >
      <div className="sticky top-0 flex h-screen items-center pt-16">
        <div className="mx-auto grid w-full max-w-7xl gap-16 px-6 md:grid-cols-[1fr_1.5fr] md:gap-24">
          {/* Left — labels */}
          <div className="flex flex-col justify-center">
            <p className="mb-6 font-mono text-xs tracking-widest text-accent/60 uppercase">
              See it in action
            </p>
            {demos.map((demo, i) => (
              <div
                key={demo.tag}
                className={`transition-all duration-500 ${
                  i === activeIndex
                    ? "opacity-100"
                    : "pointer-events-none absolute opacity-0"
                }`}
              >
                <span className="mb-3 inline-block font-mono text-xs tracking-widest text-accent uppercase">
                  {demo.tag} / {demo.label}
                </span>
                <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
                  {demo.title}
                </h2>
                <p className="mt-4 max-w-sm text-base leading-relaxed text-muted-foreground">
                  {demo.description}
                </p>
              </div>
            ))}

            {/* Progress indicators */}
            <div className="mt-12 flex items-center gap-3">
              {demos.map((demo, i) => (
                <button
                  key={demo.tag}
                  onClick={() => {
                    const el = containerRef.current;
                    if (!el) return;
                    const top =
                      el.offsetTop +
                      (i / demos.length) *
                        (el.offsetHeight - window.innerHeight);
                    window.scrollTo({ top, behavior: "smooth" });
                  }}
                  className={`flex items-center gap-2 transition-all duration-300 ${
                    i === activeIndex
                      ? "opacity-100"
                      : "opacity-40 hover:opacity-70"
                  }`}
                >
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      i === activeIndex
                        ? "w-8 bg-accent"
                        : "w-1.5 bg-muted-foreground"
                    }`}
                  />
                  <span
                    className={`text-xs font-medium transition-all duration-300 ${
                      i === activeIndex
                        ? "text-foreground opacity-100"
                        : "w-0 overflow-hidden opacity-0"
                    }`}
                  >
                    {demo.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Right — Orbit dashboard window (chat + activity panel) */}
          <div className="relative flex items-center justify-center">
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/30">
              {/* App chrome — Orbit-branded, not generic macOS */}
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <OrbitLogo size={14} />
                  <span className="text-[11px] font-semibold text-foreground">
                    Orbit
                  </span>
                  <span className="text-border">·</span>
                  <span className="text-[11px] text-muted-foreground">
                    Chat
                  </span>
                </div>
                <div className="flex items-center gap-1.5 rounded-md bg-emerald-400/10 px-2 py-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[9px] font-medium text-emerald-400">
                    Connected
                  </span>
                </div>
              </div>

              {/* Body — chat (left) + activity feed (right) */}
              <div className="relative grid h-[460px] grid-cols-[1fr_180px]">
                {/* Chat column — crossfade between demos */}
                <div className="relative border-r border-border/60">
                  {demos.map((demo, i) => (
                    <div
                      key={demo.tag}
                      className="absolute inset-0 flex flex-col justify-center gap-3 overflow-hidden p-4 transition-all duration-500"
                      style={{
                        opacity: i === activeIndex ? 1 : 0,
                        transform:
                          i === activeIndex
                            ? "translateY(0)"
                            : i > activeIndex
                              ? "translateY(12px)"
                              : "translateY(-12px)",
                        pointerEvents: i === activeIndex ? "auto" : "none",
                      }}
                    >
                      {demo.messages.map((msg, j) =>
                        msg.role === "user" ? (
                          <UserBubble key={j} text={msg.text!} />
                        ) : (
                          <AssistantBubble key={j}>
                            {msg.content}
                          </AssistantBubble>
                        ),
                      )}
                    </div>
                  ))}
                </div>

                {/* Activity column — also crossfades per demo */}
                <div className="relative bg-surface-raised/40">
                  {demos.map((demo, i) => (
                    <div
                      key={demo.tag}
                      className="absolute inset-0 transition-all duration-500"
                      style={{
                        opacity: i === activeIndex ? 1 : 0,
                        pointerEvents: i === activeIndex ? "auto" : "none",
                      }}
                    >
                      <DemoActivityFeed items={demo.activity} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Input bar — split to match the chat-only width */}
              <div className="grid grid-cols-[1fr_180px] border-t border-border">
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-2">
                    <span className="flex-1 text-[12px] text-muted-foreground/50">
                      Message Orbit...
                    </span>
                    <svg
                      className="h-4 w-4 text-muted-foreground/30"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                      />
                    </svg>
                  </div>
                </div>
                <div className="border-l border-border/60 px-3 py-3">
                  <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                    <span className="h-1 w-1 rounded-full bg-accent" />
                    <span>Microsoft 365</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[9px] text-muted-foreground">
                    <span className="h-1 w-1 rounded-full bg-accent" />
                    <span>Google Calendar</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── How it works ─────────────────────────────────────────────────────

// Step illustrations — mini UI mockups for each step
function StepIllustrationConnect() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-raised">
      <div className="border-b border-border px-4 py-2.5">
        <span className="text-[11px] font-medium text-muted-foreground">Settings / Integrations</span>
      </div>
      <div className="space-y-2 p-4">
        {/* Microsoft 365 — connected */}
        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#00a4ef]/10">
            <svg className="h-5 w-5 text-[#00a4ef]" viewBox="0 0 23 23" fill="currentColor">
              <path d="M1 1h10v10H1zM12 1h10v10H12zM1 12h10v10H1zM12 12h10v10H12z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-[12px] font-medium text-foreground">Microsoft 365</p>
            <p className="text-[10px] text-muted-foreground">Mail, Calendar, To Do</p>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-emerald-400/10 px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="text-[10px] font-medium text-emerald-400">Connected</span>
          </div>
        </div>

        {/* Google Calendar — connect CTA */}
        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4285f4]/10">
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285f4" d="M19 4h-2V2h-2v2H9V2H7v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-[12px] font-medium text-foreground">Google Calendar</p>
            <p className="text-[10px] text-muted-foreground">Optional · calendar-only scope</p>
          </div>
          <div className="rounded-lg bg-accent px-3 py-1.5 text-[10px] font-medium text-accent-foreground">
            Connect
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
          <svg className="h-3 w-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          Encrypted token storage with rotation
        </div>
      </div>
    </div>
  );
}

function StepIllustrationChat() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-raised">
      <div className="border-b border-border px-4 py-2.5 text-center">
        <span className="font-mono text-[10px] text-muted-foreground">orbit</span>
      </div>
      <div className="flex flex-col gap-2.5 p-4">
        <div className="self-end rounded-2xl rounded-br-md bg-accent/10 px-3 py-1.5 text-[11px] text-foreground">
          Show me tomorrow&apos;s meetings
        </div>
        <div className="flex gap-2 self-start">
          <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/10">
            <OrbitLogo size={10} />
          </div>
          <div className="rounded-2xl rounded-bl-md border border-border px-3 py-1.5">
            <p className="text-[10px] text-muted-foreground">
              Routing to <span className="font-medium text-accent">Calendar Agent</span>...
            </p>
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-border/50 px-2 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              <span className="text-[10px] text-foreground">Team standup</span>
              <span className="ml-auto font-mono text-[9px] text-muted-foreground">9:00</span>
            </div>
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-border/50 px-2 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-violet-400" />
              <span className="text-[10px] text-foreground">Design review</span>
              <span className="ml-auto font-mono text-[9px] text-muted-foreground">10:30</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepIllustrationApprove() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-raised">
      <div className="border-b border-border px-4 py-2.5 text-center">
        <span className="font-mono text-[10px] text-muted-foreground">orbit</span>
      </div>
      <div className="flex flex-col gap-2.5 p-4">
        <div className="flex gap-2 self-start">
          <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/10">
            <OrbitLogo size={10} />
          </div>
          <div className="rounded-2xl rounded-bl-md border border-border px-3 py-2">
            <p className="text-[10px] text-muted-foreground">Ready to send this email:</p>
            <div className="mt-1.5 rounded-lg border border-border/50 px-2.5 py-1.5">
              <p className="text-[10px] font-medium text-foreground">Re: Q3 Budget</p>
              <p className="mt-0.5 text-[9px] text-muted-foreground">To: sarah.chen@company.com</p>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5">
                <svg className="h-3 w-3 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-[10px] font-medium text-accent-foreground">Approve</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5">
                <svg className="h-3 w-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-[10px] font-medium text-muted-foreground">Reject</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepItem({
  number,
  title,
  description,
  isLast,
  illustration,
}: {
  number: string;
  title: string;
  description: string;
  isLast: boolean;
  illustration: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { rootMargin: "-80px 0px -80px 0px", threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="grid min-h-[240px] gap-10 overflow-visible md:grid-cols-[auto_1fr_1fr] md:gap-12">
      {/* Number + connecting line */}
      <div className="flex flex-col items-center">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-mono text-base font-bold transition-all ease-out ${
            isLast ? "border-2" : "border"
          }`}
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "scale(1)" : "scale(0.15)",
            transitionDuration: "1s",
            borderColor: visible
              ? "var(--accent)"
              : "var(--border)",
            color: visible ? "var(--accent)" : "var(--muted-foreground)",
            boxShadow: visible && isLast ? "0 0 20px rgba(99,102,241,0.3)" : "none",
          }}
        >
          {number}
        </span>
        {!isLast && (
          <div className="relative mt-2 -mb-[7rem] w-px flex-1" style={{ zIndex: 0 }}>
            <div className="absolute inset-0 bg-border" />
            <div
              className="absolute top-0 left-0 w-full bg-accent/40 transition-all ease-out"
              style={{
                height: visible ? "100%" : "0%",
                transitionDuration: "1.5s",
                transitionDelay: "0.6s",
              }}
            />
          </div>
        )}
      </div>

      {/* Text content */}
      <div
        className="flex flex-col justify-center pb-4"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0) scale(1) translateZ(0)" : "translateY(40px) scale(0.95) translateZ(0)",
          transition: "opacity 1.1s cubic-bezier(0.22,1,0.36,1) 0.15s, transform 1.1s cubic-bezier(0.22,1,0.36,1) 0.15s",
        }}
      >
        <h3 className="text-xl font-bold sm:text-2xl">{title}</h3>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>

      {/* Illustration */}
      <div
        className="flex items-center pb-4"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateX(0) scale(1) translateZ(0)" : "translateX(50px) scale(0.9) translateZ(0)",
          transition: "opacity 1.1s cubic-bezier(0.22,1,0.36,1) 0.3s, transform 1.1s cubic-bezier(0.22,1,0.36,1) 0.3s",
        }}
      >
        {illustration}
      </div>
    </div>
  );
}

function HowItWorksSection() {
  const steps = [
    {
      number: "01",
      title: "Connect your accounts",
      description:
        "One-click OAuth links Outlook Mail, Calendar, and To Do — or Google Calendar — to Orbit. Tokens are encrypted at rest with rotation support, and you can revoke access anytime from settings.",
      illustration: <StepIllustrationConnect />,
    },
    {
      number: "02",
      title: "Ask in plain English",
      description:
        "No commands to memorize. Use the web dashboard or message @orbit101bot on Telegram — same agents, same memory, same approval flow on both. A team-leader agent reads your request, routes to the right specialist (mail, calendar, or tasks), and streams the work back to you in real time.",
      illustration: <StepIllustrationChat />,
    },
    {
      number: "03",
      title: "Approve before it acts",
      description:
        "Every write tool pauses for your confirmation. The success indicator only flips green when Microsoft Graph actually executed — not when the approval endpoint returned 200.",
      illustration: <StepIllustrationApprove />,
    },
  ];

  return (
    <section className="px-6 py-40">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <p className="text-center font-mono text-xs tracking-widest text-accent uppercase">
            How it works
          </p>
          <h2 className="mt-4 text-center text-3xl font-bold tracking-tight sm:text-5xl">
            Three steps to flow
          </h2>
        </Reveal>

        <div className="mt-24 space-y-28">
          {steps.map((step, i) => (
            <StepItem
              key={step.number}
              number={step.number}
              title={step.title}
              description={step.description}
              isLast={i === steps.length - 1}
              illustration={step.illustration}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Telegram peer channel showcase ──────────────────────────────────

function PhoneFrame({ children }: { children: ReactNode }) {
  // iPhone-shaped frame. Targets the real ~2:1 height:width ratio
  // (320 × 640) so it reads as a device, not a squat tile. Thin
  // titanium-style bezel, real Dynamic Island as a long pill,
  // status row matches iOS (time | island | signal/wifi/battery),
  // home indicator at the bottom.
  return (
    <div className="relative mx-auto w-[320px]">
      {/* Outer titanium bezel — very rounded, thin border. */}
      <div className="relative h-[640px] overflow-hidden rounded-[54px] bg-[#1a1a1f] p-[3px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.65)] ring-1 ring-black/40">
        {/* Inner screen */}
        <div className="relative flex h-full flex-col overflow-hidden rounded-[51px] bg-surface-raised">
          {/* Status bar — pinned at the very top, leaves room for the
              Dynamic Island in the middle */}
          <div className="relative flex items-center justify-between px-7 pt-3 pb-1.5">
            <span className="text-[13px] font-semibold tabular-nums text-foreground">
              9:41
            </span>
            <div className="flex items-center gap-1.5">
              <svg
                className="h-3 w-4 text-foreground"
                viewBox="0 0 18 12"
                fill="currentColor"
                aria-hidden
              >
                <rect x="0" y="8" width="2.5" height="4" rx="0.5" />
                <rect x="4.5" y="6" width="2.5" height="6" rx="0.5" />
                <rect x="9" y="3" width="2.5" height="9" rx="0.5" />
                <rect x="13.5" y="0" width="2.5" height="12" rx="0.5" />
              </svg>
              <svg
                className="h-3 w-3.5 text-foreground"
                viewBox="0 0 16 12"
                fill="currentColor"
                aria-hidden
              >
                <path d="M8 9.5l-2-2 0.7-0.7L8 8.1l1.3-1.3 0.7 0.7zM4 5.5L2.7 4.2C4.1 2.8 6 2 8 2s3.9 0.8 5.3 2.2L12 5.5C10.9 4.4 9.5 3.8 8 3.8S5.1 4.4 4 5.5z" />
              </svg>
              <svg
                className="h-3 w-6 text-foreground"
                viewBox="0 0 25 12"
                fill="none"
                aria-hidden
              >
                <rect
                  x="0.5"
                  y="0.5"
                  width="21"
                  height="11"
                  rx="2.5"
                  stroke="currentColor"
                  strokeOpacity="0.55"
                />
                <rect x="2" y="2" width="14" height="8" rx="1" fill="currentColor" />
                <rect
                  x="22"
                  y="4"
                  width="2"
                  height="4"
                  rx="0.5"
                  fill="currentColor"
                  opacity="0.55"
                />
              </svg>
            </div>
            {/* Dynamic Island — long horizontal pill, centered */}
            <div className="pointer-events-none absolute left-1/2 top-2 h-[26px] w-[110px] -translate-x-1/2 rounded-full bg-black" />
          </div>

          {/* Bot identity bar */}
          <div className="mt-4 flex items-center justify-between border-b border-border/50 px-4 pb-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#229ED9]/15">
                <svg
                  className="h-4 w-4 text-[#229ED9]"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M22 2L2 10l7 2.5L19 5l-7 9 2.5 7L22 2z" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-[12px] font-semibold leading-tight">
                  Orbit
                </span>
                <span className="text-[10px] leading-tight text-muted-foreground">
                  @orbit101bot · online
                </span>
              </div>
            </div>
          </div>

          {/* Body — children render here, taking remaining vertical
              space so different stages don't snap-collapse the frame. */}
          <div className="flex flex-1 flex-col">{children}</div>

          {/* Home indicator */}
          <div className="flex justify-center pb-2 pt-1.5">
            <div className="h-1 w-28 rounded-full bg-foreground/30" />
          </div>
        </div>
      </div>
    </div>
  );
}

function PairCodeMockup() {
  // Stage 1 — Hub modal with the pair code. No composer (this is the
  // web Hub, not Telegram), so the content vertically centers in the
  // available phone body.
  return (
    <PhoneFrame>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Hub · Pair Telegram
        </div>
        <p className="text-center text-[12px] text-muted-foreground">
          One-time code. Expires in 10 minutes.
        </p>
        <div className="flex gap-1.5 rounded-2xl border border-border bg-surface px-4 py-3">
          {["4", "8", "2", "9", "1", "0"].map((d, i) => (
            <div
              key={i}
              className="flex h-9 w-7 items-center justify-center rounded-md bg-accent/10 text-[18px] font-bold tabular-nums text-accent"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22 2L2 10l7 2.5L19 5l-7 9 2.5 7L22 2z" />
          </svg>
          Send <span className="font-mono text-foreground">/start 482910</span>{" "}
          to @orbit101bot
        </div>
        <button
          type="button"
          className="mt-2 flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-[11px] font-medium text-accent-foreground shadow-md shadow-accent/30"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22 2L2 10l7 2.5L19 5l-7 9 2.5 7L22 2z" />
          </svg>
          Open Telegram
        </button>
      </div>
    </PhoneFrame>
  );
}

function StartCommandMockup() {
  // Stage 2 — Telegram chat showing the /start handshake. Messages
  // flex-1 so the composer always anchors at the bottom of the
  // phone, no matter how few messages are shown.
  return (
    <PhoneFrame>
      <div className="flex flex-1 flex-col gap-2 px-3 py-4">
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-accent px-3 py-2 font-mono text-[12px] text-accent-foreground">
            /start 482910
          </div>
        </div>
        <div className="flex justify-start">
          <div className="flex max-w-[88%] flex-col gap-1 rounded-2xl rounded-tl-md bg-muted px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-500">
              <svg
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Linked
            </div>
            <p className="text-[11px] text-foreground/90">
              You can talk to me here now — try{" "}
              <span className="font-medium">
                &ldquo;what&apos;s on my calendar today?&rdquo;
              </span>{" "}
              or send /help.
            </p>
          </div>
        </div>
      </div>
      <div className="border-t border-border/60 bg-surface px-3 py-2.5">
        <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5">
          <span className="text-[11px] text-muted-foreground/70">Message</span>
          <span className="ml-auto text-[10px] text-muted-foreground/40">
            ↵
          </span>
        </div>
      </div>
    </PhoneFrame>
  );
}

function TelegramChatMockup() {
  return (
    <PhoneFrame>
      {/* Messages — flex-1 so the composer below sticks to the
          bottom of the phone screen */}
      <div className="flex flex-1 flex-col gap-2 px-3 py-4">
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-accent px-3 py-2 text-[12px] text-accent-foreground">
            what&apos;s on my calendar today?
          </div>
        </div>
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-2xl rounded-tl-md bg-muted px-3 py-2 text-[12px] text-foreground">
            Nothing on your Google Calendar today — clear day.
          </div>
        </div>
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-accent px-3 py-2 text-[12px] text-accent-foreground">
            send Sarah a note: I&apos;ll review the deck by Friday
          </div>
        </div>
        <div className="flex justify-start">
          <div className="flex max-w-[88%] flex-col gap-1.5 rounded-2xl rounded-tl-md bg-muted px-3 py-2.5">
            <div className="text-[11px] font-medium text-muted-foreground">
              📧 Send email to sarah@stripe.com
            </div>
            <div className="text-[11px] text-foreground/90">
              Subject: Re: Q3 deck review
            </div>
            <div className="text-[11px] text-muted-foreground/80">
              I&apos;ll review the deck by Friday and send notes.
            </div>
            <div className="mt-1 flex gap-1.5">
              <button
                type="button"
                className="flex-1 rounded-lg bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-500"
              >
                ✅ Send
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg bg-muted-foreground/10 px-2 py-1 text-[11px] font-medium text-muted-foreground"
              >
                ❌ Reject
              </button>
            </div>
          </div>
        </div>
        <div className="flex justify-start">
          <div className="max-w-[60%] rounded-2xl rounded-tl-md bg-muted px-3 py-2 text-[12px] text-muted-foreground">
            Sent. ✔
          </div>
        </div>
      </div>

      {/* Composer hint */}
      <div className="border-t border-border/60 bg-surface px-3 py-2.5">
        <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5">
          <span className="text-[11px] text-muted-foreground/70">
            Message
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground/40">
            ↵
          </span>
        </div>
      </div>
    </PhoneFrame>
  );
}

const TELEGRAM_STEPS = [
  {
    n: "1",
    tag: "Pair",
    title: "Open the Hub. Grab a code.",
    copy: "Hub → Telegram → tap Pair. Orbit generates a one-time, 10-minute code unique to your account.",
    mockup: <PairCodeMockup />,
  },
  {
    n: "2",
    tag: "Send",
    title: "Message the bot once.",
    copy: "Open @orbit101bot, send /start <code>. The chat binds to your account permanently — no re-auth on future messages.",
    mockup: <StartCommandMockup />,
  },
  {
    n: "3",
    tag: "Use",
    title: "Talk to Orbit anywhere.",
    copy: "Same agents, same memory, same approvals — now reachable from your phone with inline ✅ / ❌ buttons on every write.",
    mockup: <TelegramChatMockup />,
  },
];

function TelegramSection() {
  // Scroll-hijacked walkthrough. Mirrors DemoSection's pattern: section
  // is N×100vh tall, inner content sticks to the viewport, scroll
  // progress advances activeIndex through the 3 stages.
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const scrolled = -rect.top;
    const total = el.offsetHeight - window.innerHeight;
    if (total <= 0) return;
    const progress = Math.max(0, Math.min(1, scrolled / total));
    const idx = Math.min(
      TELEGRAM_STEPS.length - 1,
      Math.floor(progress * TELEGRAM_STEPS.length),
    );
    setActiveIndex(idx);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  return (
    <section
      ref={containerRef}
      className="border-t border-border/40"
      style={{
        height: `${(TELEGRAM_STEPS.length + 1) * 100}vh`,
      }}
    >
      <div className="sticky top-0 flex h-screen items-center pt-16">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 md:grid-cols-[1fr_1.1fr] md:gap-16">
          {/* Left — step labels (crossfade through them) */}
          <div className="flex flex-col justify-center">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent">
              <svg
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M22 2L2 10l7 2.5L19 5l-7 9 2.5 7L22 2z" />
              </svg>
              Telegram peer channel
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">
              Carry Orbit in your pocket
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              Three steps. One-time setup. Then Orbit lives wherever
              you already chat.
            </p>

            {/* Active step (crossfade) */}
            <div className="relative mt-10 min-h-[140px]">
              {TELEGRAM_STEPS.map((s, i) => (
                <div
                  key={s.n}
                  className={`transition-all duration-500 ${
                    i === activeIndex
                      ? "opacity-100"
                      : "pointer-events-none absolute inset-0 opacity-0"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[16px] font-semibold text-accent">
                      {s.n}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="font-mono text-[10px] tracking-widest text-accent uppercase">
                        Step {s.n} / {s.tag}
                      </span>
                      <h3 className="text-xl font-semibold text-foreground sm:text-2xl">
                        {s.title}
                      </h3>
                      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                        {s.copy}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Progress indicators (clickable) */}
            <div className="mt-10 flex items-center gap-3">
              {TELEGRAM_STEPS.map((s, i) => (
                <button
                  key={s.n}
                  onClick={() => {
                    const el = containerRef.current;
                    if (!el) return;
                    const top =
                      el.offsetTop +
                      (i / TELEGRAM_STEPS.length) *
                        (el.offsetHeight - window.innerHeight);
                    window.scrollTo({ top, behavior: "smooth" });
                  }}
                  className={`flex items-center gap-2 transition-all duration-300 ${
                    i === activeIndex
                      ? "opacity-100"
                      : "opacity-40 hover:opacity-70"
                  }`}
                  aria-label={`Go to step ${s.n}`}
                >
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      i === activeIndex
                        ? "w-8 bg-accent"
                        : "w-1.5 bg-muted-foreground"
                    }`}
                  />
                  <span
                    className={`text-xs font-medium transition-all duration-300 ${
                      i === activeIndex
                        ? "text-foreground opacity-100"
                        : "w-0 overflow-hidden opacity-0"
                    }`}
                  >
                    {s.tag}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Right — phone mockup that crossfades through stages */}
          <div className="relative flex items-center justify-center">
            <div className="relative h-[660px] w-[320px]">
              {TELEGRAM_STEPS.map((s, i) => (
                <div
                  key={s.n}
                  className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${
                    i === activeIndex
                      ? "scale-100 opacity-100"
                      : "pointer-events-none scale-95 opacity-0"
                  }`}
                >
                  {s.mockup}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Transparency / Activity feed showcase ───────────────────────────

// Lifecycle of a real Orbit request, in the order the activity feed
// actually emits it. Each row appears sequentially when the section
// scrolls into view; the whole strip pauses, fades, then loops.
type ActivityRow = {
  icon: "delegate" | "tool" | "result" | "approve" | "send";
  title: string;
  subtitle: string;
  tone: "default" | "approve" | "success";
};

const _ACTIVITY_LIFECYCLE: ActivityRow[] = [
  {
    icon: "delegate",
    title: "Email-Agent",
    subtitle: "Delegated",
    tone: "default",
  },
  {
    icon: "tool",
    title: "Search Emails",
    subtitle: "Executing",
    tone: "default",
  },
  {
    icon: "result",
    title: "Result Received",
    subtitle: "Tool completed",
    tone: "success",
  },
  {
    icon: "approve",
    title: "Approval Needed",
    subtitle: "send email",
    tone: "approve",
  },
  {
    icon: "approve",
    title: "Approved",
    subtitle: "Action confirmed",
    tone: "success",
  },
  {
    icon: "send",
    title: "Send Email",
    subtitle: "Executing",
    tone: "default",
  },
  {
    icon: "result",
    title: "Result Received",
    subtitle: "Tool completed",
    tone: "success",
  },
];

function ActivityIcon({ kind }: { kind: ActivityRow["icon"] }) {
  // Match the icon style used in the actual product dashboard so the
  // mockup feels like a screenshot rather than a marketing illustration.
  const paths: Record<ActivityRow["icon"], string> = {
    delegate:
      "M12 4.5v15m7.5-7.5h-15", // plus-style: agent fanout
    tool:
      "M10.5 6L4 12.5 10.5 19M13.5 6L20 12.5 13.5 19", // chevron pair
    result:
      "M4.5 12.75l6 6 9-13.5", // checkmark
    approve:
      "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z",
    send:
      "M6 12L3.269 3.125A59.769 59.769 0 0121.485 12 59.768 59.768 0 013.27 20.875L5.999 12zm0 0h7.5",
  };
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={paths[kind]} />
    </svg>
  );
}

function ActivityFeedMockup() {
  const [revealed, setRevealed] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancel: number | undefined;
    let timeouts: number[] = [];

    const startLoop = () => {
      // Reveal each row 600ms apart; hold for 2.5s when complete; reset.
      setRevealed(0);
      _ACTIVITY_LIFECYCLE.forEach((_, i) => {
        timeouts.push(
          window.setTimeout(() => setRevealed(i + 1), 350 + i * 550),
        );
      });
      const total = 350 + _ACTIVITY_LIFECYCLE.length * 550 + 2800;
      cancel = window.setTimeout(startLoop, total);
    };

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) startLoop();
        else {
          timeouts.forEach(clearTimeout);
          timeouts = [];
          if (cancel !== undefined) clearTimeout(cancel);
        }
      },
      { threshold: 0.35 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      timeouts.forEach(clearTimeout);
      if (cancel !== undefined) clearTimeout(cancel);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-xl shadow-black/30"
    >
      {/* macOS-style header to match the existing chat mockups */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        </div>
        <span className="font-mono text-[10px] tracking-widest text-muted-foreground/70 uppercase">
          Activity
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          {revealed}
        </span>
      </div>

      <div className="flex flex-col gap-0 p-4 sm:p-5">
        {_ACTIVITY_LIFECYCLE.map((row, i) => {
          const visible = i < revealed;
          const toneClass =
            row.tone === "approve"
              ? "text-amber-300"
              : row.tone === "success"
                ? "text-emerald-400"
                : "text-accent";
          const bgClass =
            row.tone === "approve"
              ? "bg-amber-300/10"
              : row.tone === "success"
                ? "bg-emerald-400/10"
                : "bg-accent/10";
          return (
            <div
              key={`${row.title}-${i}`}
              className="flex items-center gap-3 py-2"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(6px)",
                transition:
                  "opacity 0.45s cubic-bezier(0.22,1,0.36,1), transform 0.45s cubic-bezier(0.22,1,0.36,1)",
              }}
            >
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${bgClass} ${toneClass}`}
              >
                <ActivityIcon kind={row.icon} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-[12.5px] font-medium text-foreground">
                  {row.title}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {row.subtitle}
                </p>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground/60">
                {`${12 + Math.floor(i / 2)}:0${i}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TransparencySection() {
  return (
    <section className="px-6 py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-16 lg:grid-cols-2">
        <Reveal>
          <p className="font-mono text-xs tracking-widest text-accent uppercase">
            Transparency
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">
            See exactly
            <br />
            <span className="landing-gradient-text bg-gradient-to-r from-accent via-indigo-400 to-accent bg-clip-text text-transparent">
              what it&apos;s doing
            </span>
          </h2>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground">
            Every tool call, every agent delegation, every approval — Orbit
            streams it live to a dashboard next to your chat. No black box.
            If you ever wonder &ldquo;what did it actually do?&rdquo; the answer
            is already on screen.
          </p>

          <ul className="mt-8 space-y-3 text-sm">
            {[
              {
                accent: "text-accent",
                label: "Tool calls",
                detail: "see the exact tool, args, and result",
              },
              {
                accent: "text-amber-300",
                label: "Approval gates",
                detail: "pause for confirmation on every write",
              },
              {
                accent: "text-emerald-400",
                label: "Real results",
                detail: "the green check comes from Microsoft Graph, not a 200 OK",
              },
            ].map((row) => (
              <li
                key={row.label}
                className="flex items-start gap-3 text-muted-foreground"
              >
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${row.accent.replace("text-", "bg-")}`}
                />
                <span>
                  <span className={`font-medium ${row.accent}`}>{row.label}</span>{" "}
                  — {row.detail}
                </span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="relative">
            {/* Soft glow */}
            <div
              aria-hidden
              className="absolute -inset-4 -z-10 rounded-3xl opacity-40 blur-3xl"
              style={{
                background:
                  "radial-gradient(ellipse at center, var(--accent) 0%, transparent 65%)",
              }}
            />
            <ActivityFeedMockup />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─── Trust & Security ─────────────────────────────────────────────────

function TrustSection() {
  return (
    <section className="px-6 py-32">
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <p className="text-center font-mono text-xs tracking-widest text-accent uppercase">
            Security
          </p>
          <h2 className="mt-4 text-center text-3xl font-bold tracking-tight sm:text-5xl">
            Built for trust
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-center text-base leading-relaxed text-muted-foreground">
            Your data stays yours. Orbit reads on demand and forgets. No email
            content is ever stored. Tokens are encrypted at rest, and every
            action requires your sign-off.
          </p>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="mt-16 grid grid-cols-3 divide-x divide-border">
            {[
              { stat: "Zero", label: "emails stored", sub: "read on demand, never cached" },
              { stat: "Fernet", label: "token encryption", sub: "AES-128-CBC + HMAC, rotation-ready" },
              { stat: "You approve", label: "every action", sub: "human-in-the-loop always" },
            ].map((item) => (
              <div
                key={item.label}
                className="flex flex-col items-center px-6 py-8 text-center"
              >
                <span className="text-2xl font-bold tracking-tight text-foreground">
                  {item.stat}
                </span>
                <span className="mt-1 text-sm font-medium text-accent">
                  {item.label}
                </span>
                <span className="mt-2 text-xs text-muted-foreground">
                  {item.sub}
                </span>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.25}>
          <div className="mt-12 space-y-4">
            {[
              "Scoped Microsoft Graph permissions: Mail, Calendar, Tasks, and User profile only",
              "Optional Google Calendar uses a calendar-only OAuth scope",
              "App-level authorization with per-query user scoping, no ambient access",
              "One-click revocation deletes all stored tokens immediately",
            ].map((point) => (
              <div key={point} className="flex items-start gap-3">
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="text-sm text-muted-foreground">{point}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─── CTA ──────────────────────────────────────────────────────────────

function CTASection() {
  return (
    <section className="px-6 py-40">
      <Reveal>
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <OrbitLogo size={48} />
          <h2 className="mt-8 text-4xl font-bold tracking-tight sm:text-5xl">
            Start in under a minute
          </h2>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-muted-foreground">
            Connect Microsoft 365 (and optionally Google Calendar), ask your
            first question, and let Orbit handle the rest.
          </p>
          <div className="mt-10 flex items-center gap-4">
            <Link
              href="/login"
              className="rounded-xl bg-accent px-8 py-4 text-sm font-medium text-accent-foreground shadow-lg shadow-accent/25 transition-all hover:shadow-xl hover:shadow-accent/30"
            >
              Get Started
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-border px-8 py-4 text-sm font-medium text-foreground transition-all hover:border-accent/30 hover:bg-accent/5"
            >
              Log In
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-border bg-surface/20 px-6 pt-16 pb-10">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          {/* Brand column */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <OrbitLogo size={22} />
              <span className="text-sm font-semibold text-foreground">
                Orbit
              </span>
            </div>
            <p className="max-w-xs text-[13px] leading-relaxed text-muted-foreground">
              A personal AI assistant that connects to your work tools and
              shows you exactly what it does.
            </p>
            <div className="mt-2 flex items-center gap-3">
              <a
                href="https://github.com/FelipeSanch/Orbit"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground"
                aria-label="GitHub repository"
              >
                <svg
                  className="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.92.57.1.78-.25.78-.55v-2.02c-3.2.7-3.87-1.36-3.87-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.04 1.78 2.72 1.27 3.38.97.1-.75.4-1.27.74-1.56-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 015.78 0c2.21-1.5 3.17-1.18 3.17-1.18.63 1.58.24 2.75.12 3.04.74.8 1.18 1.82 1.18 3.08 0 4.43-2.7 5.41-5.26 5.69.41.36.77 1.06.77 2.14v3.17c0 .31.2.66.79.55A11.51 11.51 0 0023.5 12c0-6.35-5.15-11.5-11.5-11.5z" />
                </svg>
              </a>
              <span className="font-mono text-[10px] tracking-wider text-muted-foreground/50 uppercase">
                v0.1
              </span>
            </div>
          </div>

          {/* Product column */}
          <div className="flex flex-col gap-3">
            <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60 uppercase">
              Product
            </p>
            <Link
              href="/login"
              className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Get started
            </Link>
            <a
              href="#demo"
              className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              See it in action
            </a>
          </div>

          {/* Engineering column */}
          <div className="flex flex-col gap-3">
            <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60 uppercase">
              Engineering
            </p>
            <a
              href="https://github.com/FelipeSanch/Orbit"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Source on GitHub
            </a>
            <a
              href="https://github.com/agno-agi/agno/issues/8029"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Upstream Agno issue
            </a>
            <span className="text-[13px] text-muted-foreground">
              Fernet rotation script
            </span>
          </div>

          {/* Built with */}
          <div className="flex flex-col gap-3">
            <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60 uppercase">
              Built with
            </p>
            <span className="text-[13px] text-muted-foreground">
              Claude Sonnet 4.6
            </span>
            <span className="text-[13px] text-muted-foreground">
              Agno · FastAPI
            </span>
            <span className="text-[13px] text-muted-foreground">
              Next.js · Neon
            </span>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-border/40 pt-6 sm:flex-row sm:items-center">
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground/60 uppercase">
            © {new Date().getFullYear()} Orbit · Personal project by Felipe
            Sanchez
          </p>
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground/60">
            Deployed on Vercel + Railway · Neon Postgres · Upstash Redis
          </p>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [splashDone, setSplashDone] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    window.scrollTo(0, 0);
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
  }, []);

  const handleSplashComplete = useCallback(() => {
    setSplashDone(true);
    setShowSplash(false);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
      {/* Delay hero stagger animations until splash finishes */}
      <div className={splashDone ? "animate-fade-in" : "opacity-0"}>
        <NavBar />
        <HeroSection />
        <DemoSection />
        <HowItWorksSection />
        <TelegramSection />
        <TransparencySection />
        <TrustSection />
        <CTASection />
        <Footer />
      </div>
    </div>
  );
}
