"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { OrbitLogo } from "@/components/ui/orbit-logo";

// Decorative backdrop. Echoes the landing page's orbital motif but
// strips it down to slow rings + drifting accent mesh + a sparse
// star field — no interactivity, no focal motion. All animations
// honor prefers-reduced-motion via class-level overrides in
// globals.css.
function LoginBackdrop() {
  // Pre-computed star positions so the field looks scattered rather
  // than gridded. Stagger pulse phase via animationDelay so they
  // never breathe in unison.
  const stars: { left: string; top: string; delay: string; size: string }[] = [
    { left: "8%",  top: "14%", delay: "0s",   size: "2px" },
    { left: "22%", top: "78%", delay: "1.2s", size: "1.5px" },
    { left: "34%", top: "32%", delay: "2.4s", size: "1px" },
    { left: "47%", top: "9%",  delay: "0.6s", size: "1.5px" },
    { left: "61%", top: "82%", delay: "3.1s", size: "1px" },
    { left: "74%", top: "21%", delay: "1.8s", size: "2px" },
    { left: "88%", top: "64%", delay: "0.3s", size: "1.5px" },
    { left: "16%", top: "48%", delay: "2.7s", size: "1px" },
    { left: "92%", top: "36%", delay: "1.5s", size: "1px" },
  ];

  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* Drifting accent mesh — handled entirely in globals.css so the
          gradients reference --accent and adapt to light/dark mode. */}
      <div className="login-bg-drift absolute inset-0" />

      {/* Orbital rings. Sized in vmin so the layout looks consistent on
          ultrawide and portrait viewports. Each ring is its own rotated
          group so the stroke stays an even thickness; ellipse + rotate
          on the same element warps the stroke. */}
      <div className="absolute inset-0 flex items-center justify-center">
        <svg
          viewBox="-100 -100 200 200"
          className="h-[140vmin] w-[140vmin] opacity-[0.18] dark:opacity-[0.22]"
          fill="none"
          stroke="currentColor"
        >
          <g className="login-orbit-1 text-accent">
            <ellipse cx="0" cy="0" rx="86" ry="44" strokeWidth="0.4" />
          </g>
          <g className="login-orbit-2 text-accent">
            <ellipse
              cx="0"
              cy="0"
              rx="64"
              ry="34"
              strokeWidth="0.35"
              transform="rotate(28)"
            />
          </g>
          <g className="login-orbit-3 text-accent">
            <ellipse
              cx="0"
              cy="0"
              rx="42"
              ry="22"
              strokeWidth="0.3"
              transform="rotate(-18)"
            />
          </g>
        </svg>
      </div>

      {/* Pulsing pinpricks. Positioned absolutely so they scatter across
          the full viewport regardless of ring geometry. */}
      {stars.map((s, i) => (
        <span
          key={i}
          className="login-star absolute rounded-full bg-foreground/70 dark:bg-foreground"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animationDelay: s.delay,
          }}
        />
      ))}

      {/* Soft vignette pulls focus toward the form by darkening the
          extreme edges a touch. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 50% 50%, transparent 55%, color-mix(in oklab, var(--background) 80%, transparent) 100%)",
        }}
      />
    </div>
  );
}

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
    <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden bg-background">
      <LoginBackdrop />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-10 px-4">
        <div className="flex flex-col items-center gap-4">
          {/* Logo gets a soft accent halo to lift it off the moving
              backdrop without competing with the rings behind. */}
          <div className="relative">
            <div className="absolute inset-0 -m-2 rounded-full bg-accent/15 blur-xl" />
            <div className="relative">
              <OrbitLogo size={56} />
            </div>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Orbit</h1>
            <p className="text-center text-sm text-muted-foreground">
              Your AI assistant for email, calendar, and tasks.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex w-full flex-col gap-3 rounded-2xl border border-border/60 bg-surface/70 p-5 shadow-xl shadow-black/5 backdrop-blur-xl dark:shadow-black/40"
        >
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
