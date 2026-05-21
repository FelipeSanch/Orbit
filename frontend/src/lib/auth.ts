import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import { db } from "@/db";
import { users, sessions, accounts, verifications, jwks } from "@/db/schema";

export const auth = betterAuth({
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
