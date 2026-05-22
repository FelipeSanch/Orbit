"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { SplashGate } from "@/components/layout/splash-gate";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Mobile drawer state. The sidebar is hidden by default below sm
  // (it dominates a phone canvas otherwise) and slides in over the
  // content when the user taps the hamburger. Close on route change
  // so navigation feels right.
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden">
      <SplashGate>
        {/* Mobile hamburger — fixed top-left, only on < sm screens.
            Sits above the chat header. */}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="fixed left-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface/90 text-foreground shadow-sm backdrop-blur-md sm:hidden"
          aria-label="Open navigation"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
            />
          </svg>
        </button>

        {/* Mobile backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm sm:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
        )}

        {/* Sidebar: hidden on mobile by default; slides in when
            mobileOpen. Renders inline on sm+. */}
        <div
          className={`fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out sm:relative sm:transition-none ${
            mobileOpen ? "translate-x-0" : "-translate-x-full sm:translate-x-0"
          }`}
        >
          {/* Pass mobileOpen so the sidebar forces full width + labels
              inside the slide-in drawer (otherwise it'd render at
              icon-only mobile width). */}
          <Sidebar mobileOpen={mobileOpen} />
        </div>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-border">
          {children}
        </main>
      </SplashGate>
    </div>
  );
}
