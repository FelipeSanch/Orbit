"use client";

import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isMicrosoftConnected: boolean;
  setAuth: (user: User | null, session: Session | null) => void;
  setMicrosoftConnected: (connected: boolean) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isLoading: true,
  isMicrosoftConnected: false,
  setAuth: (user, session) => set({ user, session, isLoading: false }),
  setMicrosoftConnected: (connected) =>
    set({ isMicrosoftConnected: connected }),
  setLoading: (loading) => set({ isLoading: loading }),
  clear: () =>
    set({
      user: null,
      session: null,
      isLoading: false,
      isMicrosoftConnected: false,
    }),
}));
