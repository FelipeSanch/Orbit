import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import { db } from "@/db";
import { users, sessions, accounts, verifications, jwks } from "@/db/schema";

// trustedOrigins gates Better Auth's CSRF-style origin check. In prod,
// requests come from the Vercel URL; in dev, localhost. If the running
// origin isn't here, every signup/signin POST is rejected — that's the
// most common cause of "signup mysteriously fails" reports.
//
// Comma-separated env override (TRUSTED_ORIGINS) for any extra origins
// (preview deploys, custom domains). Always include the BETTER_AUTH_URL
// itself and localhost so dev never breaks.
const trustedOrigins = Array.from(
  new Set(
    [
      process.env.BETTER_AUTH_URL,
      process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
      "http://localhost:3000",
      ...(process.env.TRUSTED_ORIGINS?.split(",").map((s) => s.trim()) ?? []),
    ].filter((s): s is string => Boolean(s && s.length > 0)),
  ),
);

// Social provider credentials reuse the same Azure app + Google OAuth
// client that the backend uses for Outlook/Calendar/Tasks scopes. Same
// client_id and client_secret — only the redirect URI is different
// (/api/auth/callback/google and /api/auth/callback/microsoft on the
// Vercel host, registered alongside the backend's callbacks in the
// respective consoles).
const googleClientId = process.env.GOOGLE_CLIENT_ID ?? "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
const microsoftClientId = process.env.MICROSOFT_CLIENT_ID ?? "";
const microsoftClientSecret = process.env.MICROSOFT_CLIENT_SECRET ?? "";
const microsoftTenantId = process.env.MICROSOFT_TENANT_ID || "common";

const hasGoogle = Boolean(googleClientId && googleClientSecret);
const hasMicrosoft = Boolean(microsoftClientId && microsoftClientSecret);

export const auth = betterAuth({
  // Explicit baseURL so Better Auth knows its own public URL when
  // building callback URLs and signing cookies. Falls back to a
  // sensible default for local dev.
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins,

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
      jwks: jwks,
    },
  }),

  emailAndPassword: {
    enabled: true,
    // Min length enforced server-side AND in the UI password meter
    // (frontend/src/app/(auth)/login/page.tsx). Strength composition
    // (case + number + special) is enforced UI-side only so sign-in
    // for pre-existing accounts doesn't reject valid old passwords.
    minPasswordLength: 8,
    // No verification email for the portfolio deploy — no SMTP
    // provider configured. Flip to true + add an emailVerification
    // sender if/when this serves real users.
    requireEmailVerification: false,
  },

  // Allow a user who first signed up via email to later link Google
  // or Microsoft on the same email address, and vice versa. Without
  // this, a "Continue with Google" against an existing email row
  // throws an account-conflict error.
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "microsoft", "email-password"],
    },
  },

  // Mark email/password signups as verified at creation. We don't run
  // any email-verification flow on this deploy (no SMTP), so leaving
  // emailVerified=false silently blocks later "Continue with Google /
  // Microsoft" linking — the link path requires the existing user's
  // email to be verified, otherwise Better Auth refuses and the social
  // sign-in lands on a fresh user with no integrations/conversations.
  // Reproduced once: sign up via email, connect Microsoft + Google,
  // sign out, sign back in via Google → "?" avatar, 0 conversations,
  // 0 integrations. Setting emailVerified=true at creation keeps the
  // same user across sign-out/sign-in even when the user switches
  // auth mechanism.
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: { ...user, emailVerified: true },
        }),
      },
    },
  },

  // Conditional spread — including a provider with empty credentials
  // would cause Better Auth to throw at startup. The login UI also
  // checks /api/auth/get-session-providers-style flags via NEXT_PUBLIC
  // env mirrors to know whether to show each button.
  socialProviders: {
    ...(hasGoogle && {
      google: {
        clientId: googleClientId,
        clientSecret: googleClientSecret,
      },
    }),
    ...(hasMicrosoft && {
      microsoft: {
        clientId: microsoftClientId,
        clientSecret: microsoftClientSecret,
        tenantId: microsoftTenantId,
      },
    }),
  },

  // Single-user portfolio deploy: the default IP-based rate limit (10
  // requests per 10s window, in-memory store) was blocking legitimate
  // sign-in attempts after a couple of retries during demos. Disable
  // it entirely rather than tune — if this ever grows past one user,
  // flip back to { enabled: true, window: 60, max: 100 } and add
  // `secondaryStorage` so the limiter survives function recycles.
  rateLimit: {
    enabled: false,
  },

  plugins: [jwt()],
});
