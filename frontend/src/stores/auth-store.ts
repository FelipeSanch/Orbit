"use client";

import { create } from "zustand";

interface User {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

interface Session {
  token: string;
  expiresAt: Date;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isMicrosoftConnected: boolean;
  isGoogleConnected: boolean;
  isTelegramConnected: boolean;
  // True once the parallel fetches for Microsoft, Google, and
  // Telegram status have all resolved. Surfaces such that pages
  // depending on the connection state can wait until it's truthful
  // instead of rendering with stale-false defaults.
  integrationsHydrated: boolean;
  setAuth: (user: User | null, session: Session | null) => void;
  setMicrosoftConnected: (connected: boolean) => void;
  setGoogleConnected: (connected: boolean) => void;
  setTelegramConnected: (connected: boolean) => void;
  setIntegrationsHydrated: (hydrated: boolean) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isLoading: true,
  isMicrosoftConnected: false,
  isGoogleConnected: false,
  isTelegramConnected: false,
  integrationsHydrated: false,
  setAuth: (user, session) => set({ user, session, isLoading: false }),
  setMicrosoftConnected: (connected) =>
    set({ isMicrosoftConnected: connected }),
  setGoogleConnected: (connected) => set({ isGoogleConnected: connected }),
  setTelegramConnected: (connected) =>
    set({ isTelegramConnected: connected }),
  setIntegrationsHydrated: (hydrated) =>
    set({ integrationsHydrated: hydrated }),
  setLoading: (loading) => set({ isLoading: loading }),
  clear: () =>
    set({
      user: null,
      session: null,
      isLoading: false,
      isMicrosoftConnected: false,
      isGoogleConnected: false,
      isTelegramConnected: false,
      integrationsHydrated: false,
    }),
}));
