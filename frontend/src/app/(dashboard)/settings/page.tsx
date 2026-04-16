"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { env } from "@/lib/env";
import { useAuthStore } from "@/stores/auth-store";

export default function SettingsPage() {
  const session = useAuthStore((s) => s.session);
  const isMicrosoftConnected = useAuthStore((s) => s.isMicrosoftConnected);
  const setMicrosoftConnected = useAuthStore((s) => s.setMicrosoftConnected);
  const [isLoading, setIsLoading] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("microsoft") === "connected") {
      setMicrosoftConnected(true);
    }
  }, [searchParams, setMicrosoftConnected]);

  useEffect(() => {
    if (!session?.access_token) return;

    fetch(`${env.apiUrl}/api/auth/microsoft/status`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then((data) => setMicrosoftConnected(data.connected))
      .catch(() => {});
  }, [session?.access_token, setMicrosoftConnected]);

  const handleConnect = () => {
    if (!session?.access_token) return;
    window.location.href = `${env.apiUrl}/api/auth/microsoft?authorization=Bearer ${session.access_token}`;
  };

  const handleDisconnect = async () => {
    if (!session?.access_token) return;
    setIsLoading(true);
    try {
      await fetch(`${env.apiUrl}/api/auth/microsoft`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setMicrosoftConnected(false);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col p-8">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>

      <Card padding="lg" className="max-w-lg">
        <h2 className="mb-4 text-lg font-semibold">Microsoft Account</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Connect your Microsoft account to let Orbit access your Outlook Mail,
          Calendar, and To Do.
        </p>

        <div className="flex items-center gap-3">
          <div
            className={`h-3 w-3 rounded-full ${
              isMicrosoftConnected ? "bg-green-500" : "bg-zinc-300"
            }`}
          />
          <span className="text-sm">
            {isMicrosoftConnected ? "Connected" : "Not connected"}
          </span>
        </div>

        <div className="mt-4">
          {isMicrosoftConnected ? (
            <Button
              variant="danger"
              size="sm"
              onClick={handleDisconnect}
              disabled={isLoading}
            >
              Disconnect Microsoft Account
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={handleConnect}>
              Connect Microsoft Account
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
