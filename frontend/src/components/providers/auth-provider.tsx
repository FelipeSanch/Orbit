"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { env } from "@/lib/env";
import { useAuthStore } from "@/stores/auth-store";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const setMicrosoftConnected = useAuthStore((s) => s.setMicrosoftConnected);
  const setGoogleConnected = useAuthStore((s) => s.setGoogleConnected);
  const setTelegramConnected = useAuthStore((s) => s.setTelegramConnected);
  const setIntegrationsHydrated = useAuthStore(
    (s) => s.setIntegrationsHydrated,
  );

  useEffect(() => {
    const fetchSession = async () => {
      // Fail closed — if Better Auth's getSession call rejects (backend
      // down, network blip, expired+refused refresh), treat the user as
      // unauthenticated rather than leaving the splash gate spinning.
      // The router/middleware will bounce them to /login.
      let data: Awaited<ReturnType<typeof authClient.getSession>>["data"] = null;
      try {
        const result = await authClient.getSession();
        data = result.data;
      } catch {
        setAuth(null, null);
        return;
      }

      if (data?.session && data?.user) {
        setAuth(
          {
            id: data.user.id,
            name: data.user.name,
            email: data.user.email,
            image: data.user.image ?? null,
          },
          {
            token: data.session.token,
            expiresAt: new Date(data.session.expiresAt),
          },
        );

        const token = data.session.token;
        const headers = { Authorization: `Bearer ${token}` };
        // Load all integration statuses in parallel and only flip the
        // integrationsHydrated flag once all three have resolved.
        // Pages that need a stable connection state (the Hub grid)
        // gate their render on that flag so cards don't pop in one
        // at a time as fetches land.
        Promise.all([
          fetch(`${env.apiUrl}/api/auth/microsoft/status`, { headers })
            .then((r) => (r.ok ? r.json() : { connected: false }))
            .catch(() => ({ connected: false })),
          fetch(`${env.apiUrl}/api/auth/google/status`, { headers })
            .then((r) => (r.ok ? r.json() : { connected: false }))
            .catch(() => ({ connected: false })),
          fetch(`${env.apiUrl}/api/channels/telegram/status`, { headers })
            .then((r) => (r.ok ? r.json() : { connected: false }))
            .catch(() => ({ connected: false })),
        ]).then(([ms, g, tg]) => {
          setMicrosoftConnected(Boolean(ms.connected));
          setGoogleConnected(Boolean(g.connected));
          setTelegramConnected(Boolean(tg.connected));
          setIntegrationsHydrated(true);
        });
      } else {
        setAuth(null, null);
      }
    };

    fetchSession();
  }, [
    setAuth,
    setMicrosoftConnected,
    setGoogleConnected,
    setTelegramConnected,
    setIntegrationsHydrated,
  ]);

  return <>{children}</>;
}
