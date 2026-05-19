"use client";

import { useEffect, useState } from "react";

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");

  useEffect(() => {
    const enterTimer = setTimeout(() => setPhase("hold"), 800);
    const exitTimer = setTimeout(() => setPhase("exit"), 2000);
    const doneTimer = setTimeout(() => onComplete(), 2600);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-background transition-opacity duration-500 ${
        phase === "exit" ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Subtle radial glow behind the logo */}
      <div
        className={`absolute h-64 w-64 rounded-full bg-accent/10 blur-3xl transition-all duration-1000 ${
          phase === "enter"
            ? "scale-0 opacity-0"
            : "scale-100 opacity-100"
        }`}
      />

      <div className="relative flex flex-col items-center gap-6">
        {/* Animated logo */}
        <div
          className={`transition-all duration-700 ease-out ${
            phase === "enter"
              ? "scale-50 opacity-0"
              : "scale-100 opacity-100"
          }`}
        >
          <svg
            width="80"
            height="80"
            viewBox="0 0 32 32"
            fill="none"
            className="overflow-visible"
          >
            {/* Core planet */}
            <circle
              cx="16"
              cy="16"
              r="6"
              className="fill-accent"
              style={{
                animation:
                  phase !== "enter"
                    ? "splash-pulse 2s ease-in-out infinite"
                    : "none",
              }}
            />
            <circle
              cx="16"
              cy="16"
              r="5"
              className="fill-accent"
              opacity="0.8"
            />

            {/* Orbital ring that draws in */}
            <ellipse
              cx="16"
              cy="16"
              rx="14"
              ry="4.5"
              transform="rotate(-30 16 16)"
              className="stroke-accent"
              strokeWidth="1.5"
              fill="none"
              style={{
                strokeDasharray: 90,
                strokeDashoffset: phase === "enter" ? 90 : 0,
                transition: "stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />

            {/* Orbiting moon */}
            <circle
              cx="24.5"
              cy="9.5"
              r="2"
              className="fill-accent"
              style={{
                opacity: phase === "enter" ? 0 : 0.6,
                transition: "opacity 0.4s ease 0.6s",
              }}
            />
          </svg>
        </div>

        {/* Text */}
        <div
          className={`flex flex-col items-center gap-2 transition-all duration-500 ${
            phase === "enter"
              ? "translate-y-3 opacity-0"
              : "translate-y-0 opacity-100"
          }`}
          style={{ transitionDelay: "300ms" }}
        >
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Orbit
          </h1>
          <p className="text-sm text-muted-foreground">
            Your AI assistant
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes splash-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
