"use client";

import { useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "orbit:theme";

/**
 * Apply a theme preference to <html> as a class.
 *
 * "light" / "dark" force the explicit class (CSS rules in globals.css
 * key off `.light` / `.dark`).
 *
 * "system" removes both classes — the @media (prefers-color-scheme)
 * fallback in globals.css then takes over.
 */
function applyTheme(pref: ThemePreference) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (pref === "light") root.classList.add("light");
  else if (pref === "dark") root.classList.add("dark");
}

/**
 * Read the persisted preference. Returns "system" if missing/invalid
 * so first-time visitors fall through to the prefers-color-scheme
 * media query.
 */
function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // localStorage unavailable
  }
  return "system";
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemePreference>("system");

  // Hydrate from storage on mount + apply once. Without this, the SSR'd
  // markup wouldn't know the user's pref and we'd briefly render in the
  // system default before switching.
  useEffect(() => {
    const stored = readStored();
    setThemeState(stored);
    applyTheme(stored);
  }, []);

  const setTheme = (next: ThemePreference) => {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  return { theme, setTheme };
}
