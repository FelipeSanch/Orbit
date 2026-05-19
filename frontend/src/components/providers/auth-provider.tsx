"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { env } from "@/lib/env";
import { useAuthStore } from "@/stores/auth-store";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const setMicrosoftConnected = useAuthStore((s) => s.setMicrosoftConnected);
  const setGoogleConnected = useAuthStore((s) => s.setGoogleConnected);

  useEffect(() => {
    const fetchSession = async () => {
      const { data } = await authClient.getSession();
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
        // Load integration statuses in parallel so sidebar dots are correct
        // on every page, not just Settings.
        Promise.all([
          fetch(`${env.apiUrl}/api/auth/microsoft/status`, { headers })
            .then((r) => (r.ok ? r.json() : { connected: false }))
            .catch(() => ({ connected: false })),
          fetch(`${env.apiUrl}/api/auth/google/status`, { headers })
            .then((r) => (r.ok ? r.json() : { connected: false }))
            .catch(() => ({ connected: false })),
        ]).then(([ms, g]) => {
          setMicrosoftConnected(Boolean(ms.connected));
          setGoogleConnected(Boolean(g.connected));
        });
      } else {
        setAuth(null, null);
      }
    };

    fetchSession();
  }, [setAuth, setMicrosoftConnected, setGoogleConnected]);

  return <>{children}</>;
}
