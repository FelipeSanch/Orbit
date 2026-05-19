"use client";

import { useCallback, useEffect, useState } from "react";
import { SplashScreen } from "@/components/ui/splash-screen";

const SPLASH_KEY = "orbit-splash-shown";

export function SplashGate({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const shown = sessionStorage.getItem(SPLASH_KEY);
    if (!shown) {
      setShowSplash(true);
    }
    setReady(true);
  }, []);

  const handleComplete = useCallback(() => {
    sessionStorage.setItem(SPLASH_KEY, "1");
    setShowSplash(false);
  }, []);

  // Avoid flash: render nothing until we know whether to show splash
  if (!ready) return null;

  return (
    <>
      {showSplash && <SplashScreen onComplete={handleComplete} />}
      <div
        className={`flex h-full flex-1 ${showSplash ? "opacity-0" : "animate-fade-in opacity-100"}`}
      >
        {children}
      </div>
    </>
  );
}
