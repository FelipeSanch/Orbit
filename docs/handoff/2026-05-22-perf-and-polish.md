# Handoff — perf, passkeys, README

> **Superseded by `2026-05-22-coordinate-mode-decision.md`.** Kept as a
> timeline marker — describes the state at the start of the validation
> session, before route mode's cross-domain limitations and Anthropic
> overload behavior forced the architecture decision. Read that file
> first; this one is for context decay.

Status: production deploy is live and the OAuth gauntlet is done — sign-in (email/Google/Microsoft) and Hub data-scope connections (Microsoft 365 + Google Calendar) all work end-to-end on `https://orbit-ruby-one.vercel.app`. This conversation got long; the next chat picks up here cold.

## What just happened (this session, ~30 commits)

### Telegram channel shipped (`3407f4d`)
Full peer surface to web chat: free-text inbound, inline-button approvals, `/start <code>` pairing, single-use codes, webhook secret enforcement, fallback-path round-trip verified by tests. Bot is `@orbit101bot`, Railway webhook registered. 90 backend tests passing.

### UX polish pass (5 commits, `483ca00..ec87d10`)
- Chat errors render as distinct red-bordered "Issue" bubbles instead of looking like normal Orbit replies. "Open Hub" copy fix (was incorrectly "Open Settings").
- Empty state for users with no integrations shows "Connect a service" callout + "Open the Hub" CTA instead of dead-end suggestion chips.
- Hub Connect buttons now show spinner + "Connecting…" through OAuth redirect commit window.
- Persona/microcopy: dropped FastAPI/Agno/Claude engineer-speak from Settings About, "tool calls"/"delegations" → "actions"/"hand-offs", "Activity Log" → "Activity".
- Settings → Usage card shows daily spend cap as `$X.XXXX / $1.00` progress bar with amber→red state tracking.

### `requirements.txt` for Railway (`360b965`)
Generated via `uv export --format requirements-txt --no-hashes > backend/requirements.txt`. 87 packages pinned. Regenerate after every dep change. `pyproject.toml` + `uv.lock` kept for local `uv sync`.

### Auth overhaul merge (`ef1ebe8`)
Three commits merged via `--no-ff` from `feat/auth-overhaul`:
- `bb73692` — `trustedOrigins`, social providers, explicit `baseURL`, `secret`, `accountLinking.enabled`, conditional spread of socialProviders. Fixed the actual root cause of "signup fails on Vercel" (missing explicit `baseURL` + no `trustedOrigins`).
- `d7fc08e` — Real-company login: continuous mesh-gradient backdrop (5 floating blobs on 55–95s independent cycles, no rotation), social buttons with brand SVGs, tab switcher, password strength meter (5 checks, all required for signup), `friendlyError()` mapping Better Auth error codes to UI copy, loading isolation across providers.
- `33268da` — `auth-provider` fail-closed on `getSession()` reject so the splash gate can't hang.

### Eye-toggle on password field (`8a9fa6a`)
Per-field local state, `tabIndex={-1}` so tab order is email → password → submit.

### Auth fixes for prod after deployment (`057a01d`, `e8d095d`, `3d04de5`)
- Middleware was checking only `better-auth.session_token`. In HTTPS prod Better Auth uses `__Secure-better-auth.session_token` (cookie-spec mandate when `Secure` is set). Middleware was bouncing every authenticated user to `/login`. Fixed to check both names + treat empty-value cookies as absent.
- Sign-out wasn't clearing chat/activity stores and used `router.push("/")` which is a client-side transition that doesn't re-run middleware. Now wipes all three stores and uses `window.location.href = "/"` for a real HTTP request through middleware. Then refined to land on `/` (landing), not `/login`, to match convention.

### Database split (Neon dev branch)
- Created Neon branch `ep-shiny-dawn-amenvebx-pooler` from main.
- `backend/.env` + `frontend/.env.local` both point at the dev branch.
- Vercel + Railway env vars point at prod (`ep-restless-sea-amp6lywu`).
- Local dev signups no longer pollute prod, vice versa.

### Production deployment — fully wired
**Vercel env vars** (12 total): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GOOGLE_ENABLED`, `NEXT_PUBLIC_MICROSOFT_ENABLED`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`.

**Railway env vars** (19 total): full backend config — see `backend/.env.example` for the canonical list.

**OAuth redirect URIs registered**:
- Google Cloud Console (project owned by `felipesancheznoguera6@gmail.com`): all 4 URIs registered (`callback/google` for Better Auth + `google/callback` for backend, prod + local). `pipenator0826@gmail.com` added to Test users. `.../auth/calendar` + `.../auth/userinfo.email` declared on consent screen.
- Azure Portal (the Orbit app — `client_id=b35e9238-...`, shows under "All applications" view for `pipenator0826@gmail.com` though pipenator isn't listed as owner): 3 URIs registered (missing local Better Auth `http://localhost:3000/api/auth/callback/microsoft`).

### Critical fixes that bit me

- **Stale JWKS row blocked all `get-session` calls.** A `jwks` row from 2026-04-17 was encrypted with a different `BETTER_AUTH_SECRET` than what's now on Vercel. Better Auth's JWT plugin `getSession()` threw `Failed to decrypt private key` and returned 500 with empty body. Fix: `DELETE FROM jwks` on both branches (Better Auth regenerates fresh keypair on next call). User found the error in Vercel function logs.
- **CORS preflight rejecting Vercel origin.** Backend's `FRONTEND_URL` was set to `http://localhost:3000` from a copy of local `.env`. Backend's CORS middleware allows only `settings.frontend_url`. Fixed by setting it to the Vercel URL on Railway.
- **`NEXT_PUBLIC_API_URL` wasn't set, baked `"http://localhost:8000"` into prod JS.** User had typed `NEXT_PUBLIC_BACKEND_URL` instead. Fixed + redeploy with build cache cleared.

## Recent commits (latest 10)

```
3d04de5 polish(auth): sign out lands on landing, not /login
e8d095d fix(auth): sign-out properly clears state + lands on /login
057a01d fix(middleware): also accept __Secure- prefixed session cookie
8a9fa6a feat(login): password visibility toggle (eye icon) on password fields
ef1ebe8 Merge feat/auth-overhaul
33268da fix(auth-provider): fail closed on getSession error, don't hang splash
d7fc08e feat(login): real-company auth page — social, password meter, mesh bg
bb73692 feat(auth): trustedOrigins, social providers, explicit baseURL
2c94452 polish(login): dynamic orbital backdrop + glassmorphism form
751f85d fix(auth): disable Better Auth rate limit on single-user portfolio deploy
```

## What to build next (in priority order)

### 1. Performance — orchestrator latency

**Problem:** User-perceived latency between "send message" and "first content delta" is 5–10s, dominated by the orchestrator's delegation decision. Both orchestrator and specialists run on Claude Sonnet 4.6.

**Diagnosis:** Orchestrator's job is *routing* — decide which specialist (email/calendar/tasks) handles the user message. That's a classification task, not a generative one. Sonnet is overkill.

**Fix:** Change `backend/agents/orchestrator.py:19` model from `claude-sonnet-4-6` to `claude-haiku-4-5-20251001`. Specialists stay on Sonnet (they do real work — tool selection, content synthesis). Routing-only Haiku should cut front-of-flow latency by ~3x without quality loss.

**Validation:** Send 5 common queries ("any urgent emails", "today's calendar", "what's on my task list", cross-domain) before/after the swap and eyeball time-to-first-token. Run the existing 90 backend tests to confirm nothing depends on routing-model semantics. Watch for: orchestrator getting confused by ambiguous queries (cross-domain ones) — if quality drops, fall back to Sonnet specifically for the orchestrator and accept the latency.

**Other latency contributors worth a look but not the headline:**
- `team.arun(stream=True)` already streams content. Good.
- O365 / Google API call latency (~500ms-2s per tool call) — bounded by upstream APIs.
- Railway cold starts on a free tier — first request after idle pays a ~1-2s warm-up.

### 2. Sign-in passkey / Touch ID (user explicitly wants this)

The "Sign in as fs172 with passkey" Touch ID flow Felipe screenshotted from Duke's Shibboleth. Better Auth has a first-party [`passkey()` plugin](https://www.better-auth.com/docs/plugins/passkey). Roughly:
- Schema additions (Better Auth provides Drizzle migration — `drizzle-kit push` to apply).
- `/login` page gets a small "register a passkey" UI for existing signed-in users.
- Detection on `/login` load: if a passkey exists for this browser, show "Sign in as `<email>`" with Face/Touch ID prompt instead of password fields.
- ~150 lines + a schema push. Not blocking but huge UX win.

### 3. README + repo presentation pass (deferred from previous handoff item 2)
- Update for Telegram-as-primary-peer-channel (not SMS).
- Architecture diagram (ASCII or mermaid).
- Roadmap section reflects what shipped (auth, Telegram, deploy) vs open (passkeys, README, /privacy).
- Add a "Demo" section explaining what to try after signing up.
- Remove stale "in flight" claims.

### 4. `/privacy` and `/terms` static pages
Two reasons:
- Required for Google's OAuth verification process (whenever you decide to publish the consent screen to Production, which unlocks the app for anyone without the "unverified" warning).
- Makes the demo look like a real product.
Frontend `app/privacy/page.tsx` and `app/terms/page.tsx`, plain static markdown. ~30 min.

### 5. Quality-of-life: input stuck during stream
The chat input is `disabled={isStreaming}` (`chat-panel.tsx:278`). For long-running queries (5–10s with the orchestrator latency above) this feels frozen. Solving #1 makes this less acute but the underlying UX could also be improved:
- Show a visible "Orbit is thinking…" indicator above the input instead of just disabling.
- OR allow a queue — user types next message while current one streams, it fires when stream_end lands.
- Or just leave the input enabled and abort on new send (would lose the streaming response). Decision for product not for code.

## Open follow-ups (deferred, not Telegram, not auth)

- **Agno >2.6.8 release** that fixes the route-mode `acontinue_run` bug (filed at agno-agi/agno#8029). When it lands, revisit the Part-2 revert in `event_translator.py`.
- **Microsoft local-dev Better Auth redirect URI**: `http://localhost:3000/api/auth/callback/microsoft` not registered in Azure yet. Add when you want to test sign-in locally; currently sign-in via Microsoft locally would fail.
- **Local backend Better Auth Google redirect URI**: same shape — `http://localhost:3000/api/auth/callback/google` is registered, `http://localhost:8000/api/auth/google/callback` is registered. Both already done.
- **OAuth Consent Screen "Production" publication for Google** (verification process — multi-week). Postpone until ready for public demo.

## Environment state

- **Branches**: only `main`. `feat/auth-overhaul` was merged + the branch still exists locally and on origin but the work is in main.
- **Local backend**: dev branch DB. Run `cd backend && uvicorn main:app --reload` on :8000.
- **Local frontend**: dev branch DB. Run `cd frontend && npm run dev` on :3000.
- **Prod backend**: Railway, `https://orbit-production-19ac.up.railway.app`. Prod branch DB.
- **Prod frontend**: Vercel, `https://orbit-ruby-one.vercel.app`. Prod branch DB.
- **Tests**: 90 backend passing (`cd backend && pytest`). Frontend `tsc --noEmit` clean.
- **Linters**: `cd backend && ruff check .` clean. ESLint not run by default.
- **Both Microsoft + Google + Telegram connected on prod for `pipenator0826@gmail.com`**.

## Quick-start prompt for the new chat

Drop this verbatim:

> Picking up from `docs/handoff/2026-05-22-perf-and-polish.md`. Production is fully deployed and the OAuth gauntlet is done — sign-in (email + Google + Microsoft) and Hub data-scope connections all work end-to-end. Start with item 1 in the handoff: orchestrator latency. Change `backend/agents/orchestrator.py:19` to use `claude-haiku-4-5-20251001` instead of `claude-sonnet-4-6`, keep specialists on Sonnet. Validate by running the 5 common queries (any urgent emails, today's calendar, etc.) before/after. After that, ask me whether to go to passkeys, README, or /privacy + /terms next.

That hands the next agent enough to start without re-reading this conversation.
