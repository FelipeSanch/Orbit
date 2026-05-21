"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { OrbitLogo } from "@/components/ui/orbit-logo";

// ─── Backdrop ──────────────────────────────────────────────────────────
// Continuous mesh-gradient layer. Five soft blobs float on independent
// long-cycle keyframes (defined in globals.css). The composition keeps
// morphing without ever repeating phase. No rotation, no focal motion;
// just ambient color. Honors prefers-reduced-motion via class overrides.

function LoginBackdrop() {
  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <div className="mesh-blob mesh-blob-1" />
      <div className="mesh-blob mesh-blob-2" />
      <div className="mesh-blob mesh-blob-3" />
      <div className="mesh-blob mesh-blob-4" />
      <div className="mesh-blob mesh-blob-5" />
      <div className="mesh-noise" />
      {/* Soft vignette pulls focus toward the form. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 100% 80% at 50% 50%, transparent 50%, color-mix(in oklab, var(--background) 65%, transparent) 100%)",
        }}
      />
    </div>
  );
}

// ─── Brand icons ───────────────────────────────────────────────────────
// Inline SVG to avoid extra requests + keep brand colors crisp on both
// themes. Kept tiny; they only appear inside 44px buttons.

function GoogleIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09 0-.73.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function MicrosoftIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2"  y="2"  width="9.5" height="9.5" fill="#F25022" />
      <rect x="12.5" y="2"  width="9.5" height="9.5" fill="#7FBA00" />
      <rect x="2"  y="12.5" width="9.5" height="9.5" fill="#00A4EF" />
      <rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#FFB900" />
    </svg>
  );
}

// ─── Password strength ─────────────────────────────────────────────────
// Five binary checks. Score = number passing. We require all five for
// signup; sign-in skips the meter so existing accounts aren't locked
// out by retroactive policy.

interface PasswordCheck {
  label: string;
  passed: boolean;
}

function evaluatePassword(pw: string): PasswordCheck[] {
  return [
    { label: "At least 8 characters", passed: pw.length >= 8 },
    { label: "An uppercase letter", passed: /[A-Z]/.test(pw) },
    { label: "A lowercase letter", passed: /[a-z]/.test(pw) },
    { label: "A number", passed: /\d/.test(pw) },
    { label: "A special character", passed: /[^A-Za-z0-9]/.test(pw) },
  ];
}

function PasswordMeter({ password }: { password: string }) {
  const checks = useMemo(() => evaluatePassword(password), [password]);
  const score = checks.filter((c) => c.passed).length;
  const strength = score === 5 ? "Strong" : score >= 3 ? "Medium" : score > 0 ? "Weak" : "";
  const barColor =
    score === 5
      ? "bg-emerald-500"
      : score >= 3
        ? "bg-amber-500"
        : score > 0
          ? "bg-red-500"
          : "bg-muted";
  const strengthColor =
    score === 5
      ? "text-emerald-500"
      : score >= 3
        ? "text-amber-500"
        : "text-red-500";

  // Don't show the meter until the user has typed something.
  if (password.length === 0) return null;

  return (
    <div className="mt-1 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div
          className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={5}
          aria-label="Password strength"
        >
          <div
            className={`h-full transition-all duration-300 ${barColor}`}
            style={{ width: `${(score / 5) * 100}%` }}
          />
        </div>
        <span className={`text-[11px] font-medium tabular-nums ${strengthColor}`}>
          {strength}
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
        {checks.map((c) => (
          <li
            key={c.label}
            className={`flex items-center gap-1.5 text-[11px] ${
              c.passed ? "text-emerald-500" : "text-muted-foreground"
            }`}
          >
            <svg
              className="h-3 w-3 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              {c.passed ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              ) : (
                <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
              )}
            </svg>
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<null | "email" | "google" | "microsoft">(
    null,
  );

  const passwordChecks = useMemo(() => evaluatePassword(password), [password]);
  const passwordOk = passwordChecks.every((c) => c.passed);

  // Mirror env flags into the client so we can show buttons only when the
  // provider is actually configured. Both env vars must be set as
  // NEXT_PUBLIC_* in Vercel for the button to appear.
  const googleEnabled = Boolean(
    process.env.NEXT_PUBLIC_GOOGLE_ENABLED ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  );
  const microsoftEnabled = Boolean(
    process.env.NEXT_PUBLIC_MICROSOFT_ENABLED ?? process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID,
  );
  // Always show in dev; on prod, hide unless env says enabled. Since
  // most local devs don't set these, default to showing both — the
  // server will reject the click with a clear error if not configured.
  const showGoogle = googleEnabled || process.env.NODE_ENV !== "production";
  const showMicrosoft =
    microsoftEnabled || process.env.NODE_ENV !== "production";

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (mode === "signup" && !passwordOk) {
      setError("Password must meet all five requirements below.");
      return;
    }

    setLoading("email");
    try {
      if (mode === "signup") {
        const { error: authError } = await authClient.signUp.email({
          email,
          password,
          name: name.trim() || email.split("@")[0],
        });
        if (authError) {
          setError(friendlyError(authError, "signup"));
          return;
        }
      } else {
        const { error: authError } = await authClient.signIn.email({
          email,
          password,
        });
        if (authError) {
          setError(friendlyError(authError, "signin"));
          return;
        }
      }
      router.push("/chat");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(null);
    }
  };

  const handleSocial = async (provider: "google" | "microsoft") => {
    setError("");
    setLoading(provider);
    try {
      // Better Auth redirects on success — control won't return here.
      await authClient.signIn.social({
        provider,
        callbackURL: "/chat",
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Couldn't reach ${provider === "google" ? "Google" : "Microsoft"}. Please try again.`,
      );
      setLoading(null);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden bg-background">
      <LoginBackdrop />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-6 px-4 py-8">
        {/* Brand */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 -m-3 rounded-full bg-accent/20 blur-2xl" />
            <div className="relative">
              <OrbitLogo size={52} />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-center text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to your AI assistant."
              : "Take a few things off your plate."}
          </p>
        </div>

        {/* Card */}
        <div className="w-full rounded-2xl border border-border/60 bg-surface/75 p-6 shadow-2xl shadow-black/10 backdrop-blur-xl dark:shadow-black/50">
          {/* Tab switcher */}
          <div className="mb-5 flex rounded-lg border border-border bg-muted/60 p-0.5 text-[13px]">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
                className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 font-medium transition-colors ${
                  mode === m
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                aria-pressed={mode === m}
              >
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          {/* Social */}
          {(showGoogle || showMicrosoft) && (
            <>
              <div className="flex flex-col gap-2">
                {showGoogle && (
                  <SocialButton
                    onClick={() => handleSocial("google")}
                    disabled={loading !== null}
                    loading={loading === "google"}
                    icon={<GoogleIcon className="h-4 w-4" />}
                    label={`Continue with Google`}
                  />
                )}
                {showMicrosoft && (
                  <SocialButton
                    onClick={() => handleSocial("microsoft")}
                    disabled={loading !== null}
                    loading={loading === "microsoft"}
                    icon={<MicrosoftIcon className="h-4 w-4" />}
                    label={`Continue with Microsoft`}
                  />
                )}
              </div>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
                  or continue with email
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          {/* Email + password */}
          <form onSubmit={handleEmailSubmit} className="flex w-full flex-col gap-3">
            {mode === "signup" && (
              <Field
                type="text"
                placeholder="Full name (optional)"
                value={name}
                onChange={setName}
                autoComplete="name"
              />
            )}
            <Field
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={setEmail}
              required
              autoFocus
              autoComplete="email"
            />
            <Field
              type="password"
              placeholder="Password"
              value={password}
              onChange={setPassword}
              required
              minLength={8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />

            {mode === "signup" && <PasswordMeter password={password} />}

            {mode === "signin" && (
              <button
                type="button"
                onClick={() =>
                  setError(
                    "Password reset isn't set up yet. Sign in with Google or Microsoft, or reach out for a manual reset.",
                  )
                }
                className="-mt-1 self-end cursor-pointer text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Forgot password?
              </button>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12px] text-red-600 dark:text-red-400"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading !== null || (mode === "signup" && !passwordOk)}
              className="mt-1 flex h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-accent text-sm font-medium text-accent-foreground shadow-sm shadow-accent/25 transition-all duration-150 hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading === "email" ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-foreground/30 border-t-accent-foreground" />
              ) : mode === "signin" ? (
                "Sign in"
              ) : (
                "Create account"
              )}
            </button>
          </form>
        </div>

        {/* Fine print */}
        <p className="max-w-sm text-center text-[11px] leading-relaxed text-muted-foreground/70">
          By {mode === "signin" ? "signing in" : "creating an account"}, you
          agree to Orbit&apos;s portfolio-deploy terms. This is a personal
          project — your data lives only in the database backing this
          deployment.
        </p>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function Field({
  type,
  placeholder,
  value,
  onChange,
  required,
  autoFocus,
  autoComplete,
  minLength,
}: {
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  minLength?: number;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      autoFocus={autoFocus}
      autoComplete={autoComplete}
      minLength={minLength}
      className="h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/20"
    />
  );
}

function SocialButton({
  onClick,
  disabled,
  loading,
  icon,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-border bg-surface text-sm font-medium text-foreground transition-all duration-150 hover:bg-muted active:bg-border disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
      ) : (
        icon
      )}
      <span>{label}</span>
    </button>
  );
}

// ─── Error mapping ─────────────────────────────────────────────────────
// Better Auth error messages are decent but inconsistent. Translate the
// common ones into one-sentence user-facing copy. Falls back to whatever
// Better Auth said.

function friendlyError(
  authError: { message?: string; code?: string },
  flow: "signin" | "signup",
): string {
  const raw = (authError.message ?? "").toLowerCase();
  const code = (authError.code ?? "").toLowerCase();

  if (code.includes("user_already_exists") || raw.includes("already exists")) {
    return "An account with that email already exists. Try signing in, or use a different email.";
  }
  if (code.includes("invalid_password") || raw.includes("invalid password")) {
    return "That password isn't right. Double-check, or use a social provider.";
  }
  if (
    code.includes("user_not_found") ||
    raw.includes("user not found") ||
    raw.includes("invalid credentials")
  ) {
    return flow === "signin"
      ? "No account with that email and password. Want to sign up instead?"
      : "Something's off with those credentials.";
  }
  if (raw.includes("password") && raw.includes("too short")) {
    return "Password is too short — needs to be at least 8 characters.";
  }
  if (raw.includes("rate") && raw.includes("limit")) {
    return "Too many attempts. Wait a moment and try again.";
  }
  if (raw.includes("fetch") || raw.includes("network")) {
    return "Couldn't reach the server. Check your connection and retry.";
  }
  return (
    authError.message ?? (flow === "signin" ? "Sign in failed." : "Sign up failed.")
  );
}
