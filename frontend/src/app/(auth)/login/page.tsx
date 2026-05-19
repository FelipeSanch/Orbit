"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { OrbitLogo } from "@/components/ui/orbit-logo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (isSignUp) {
      const { error: authError } = await authClient.signUp.email({
        email,
        password,
        name: name || email.split("@")[0],
      });
      setLoading(false);
      if (authError) {
        setError(authError.message ?? "Sign up failed");
        return;
      }
      router.push("/chat");
    } else {
      const { error: authError } = await authClient.signIn.email({
        email,
        password,
      });
      setLoading(false);
      if (authError) {
        setError(authError.message ?? "Invalid credentials");
        return;
      }
      router.push("/chat");
    }
  };

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-background">
      <div className="flex w-full max-w-sm flex-col items-center gap-10 px-4">
        <div className="flex flex-col items-center gap-4">
          <OrbitLogo size={56} />
          <div className="flex flex-col items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Orbit</h1>
            <p className="text-center text-sm text-muted-foreground">
              Your AI assistant for email, calendar, and tasks.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
          {isSignUp && (
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          )}
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-accent text-sm font-medium text-accent-foreground shadow-sm shadow-accent/25 transition-all hover:brightness-110 active:brightness-95 disabled:opacity-50"
          >
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-foreground/30 border-t-accent-foreground" />
            ) : isSignUp ? (
              "Create Account"
            ) : (
              "Sign In"
            )}
          </button>
          {error && (
            <p className="text-center text-xs text-red-500">{error}</p>
          )}
        </form>

        <button
          type="button"
          onClick={() => {
            setIsSignUp(!isSignUp);
            setError("");
          }}
          className="cursor-pointer text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {isSignUp
            ? "Already have an account? Sign in"
            : "Don\u2019t have an account? Sign up"}
        </button>
      </div>
    </div>
  );
}
