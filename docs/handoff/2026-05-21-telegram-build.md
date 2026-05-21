# Handoff — build the Telegram channel

Status: Twilio fully removed (commit on `main`). Telegram is the next chunk of work; this conversation is too long to keep going, so the next chat picks up here cold.

## What just happened

1. **Phase H** shipped — approval card success/failure now driven by the `tool_result` SSE event, not the `/approve` 200 OK. (`92a3293`)
2. **Landing page rebuilt** — added the "See exactly what it's doing" transparency section, upgraded the demo mockups to show a real dashboard layout (chat + activity feed sidebar), tightened the hero with a status pill linking to GitHub, rebuilt the footer as a 4-column structure with a link to the upstream Agno issue. (`7902043`, `4226ed8`, `e393b74`)
3. **"Built on" tech-stack strip** added then removed per user feedback. (`e393b74` then `47bc1d1`)
4. **Twilio fully killed** — files deleted, deps dropped, env stripped, Hub UI updated. 80 tests passing.

User explicitly chose Telegram over SMS this conversation. The reason: SMS was TFV-gated and plain-text constrained; Telegram is permissionless, free, and gives us real inline-button approvals + slash-command shortcuts.

## Recent commits worth knowing

```
chore: kill Twilio / SMS — clear the way for Telegram
47bc1d1 polish(landing): drop the Built On stack strip
e393b74 polish(landing): startup-grade hero pill, stack strip, structured footer
4226ed8 feat(landing): upgrade demo mockups + how-it-works to match real product
7902043 feat(landing): add "See exactly what it's doing" transparency section
c1dd778 docs(landing): correct AES-256 claim, add Google Calendar, fix hero grammar
92a3293 feat(phase-h): drive approval card status from tool_result, not /approve 200 OK
75c3892 fix(sms): twilio audit drift — TwilioRestException, E.164, UCS-2 [reverted by kill]
a30a72b fix(rotate_fernet_key): default to dry-run, require typed-host confirm to execute
35dd086 feat(phase-12): Fernet key rotation — MultiFernet chain + scripted rewrite
e7286dd chore(tools): audit O365 write tools for ignored boolean returns + document env vars
c3aedef feat(phase-11): Graph timeouts, tool_progress, typed error envelope, titler guard
5de2916 fix(approve): detect silent Agno resume failures, run fallback that emits the full SSE shape
```

## What to build next (Telegram)

### Scope

A Telegram channel that mirrors what the web chat does:

- Free-text in Telegram → agent run → response back in Telegram
- Write tool → inline-keyboard approval card with ✅ Send / ❌ Reject buttons (instead of YES/NO text)
- `/start <code>` flow to link a Telegram chat to an Orbit user
- `/help` and any other slash commands worth having

### File-level plan

**Backend (new files)**:

| File | Purpose |
|---|---|
| `backend/services/telegram_client.py` | httpx-based wrapper around the Telegram Bot API. Methods: `send_message(chat_id, text, *, reply_markup=None)`, `edit_message_reply_markup(chat_id, message_id, reply_markup)`, `answer_callback_query(query_id, text)`, `set_webhook(url, secret_token)`. No `python-telegram-bot` dep — keep it lightweight. |
| `backend/services/telegram_dispatch.py` | `handle_inbound_message(chat_id, text)` and `handle_callback_query(chat_id, message_id, query_id, data)`. Mirror the sms_dispatch.py shape (which we deleted but you can pull from git history at commit `5de2916^` or earlier). On a write tool pause, build inline-keyboard markup and send the approval card. On callback, parse `approve:<id>` or `reject:<id>` and call `run_resume.resume_approval`. |
| `backend/api/routes/telegram.py` | `POST /api/webhooks/telegram/inbound` — verifies `X-Telegram-Bot-Api-Secret-Token` header, parses the Update object, routes to dispatch. Returns 200 fast (Telegram retries on non-200). Also `POST /api/channels/telegram/pair` (auth-gated) that generates a 6-digit code, stores it in Redis with TTL=600s keyed `telegram:pair:<code>` → user_id, returns `{code, bot_username}`. |

**Backend (modified)**:

- `backend/main.py` — register the telegram router
- `backend/config.py` — add `telegram_bot_token: str = ""` and `telegram_webhook_secret: str = ""`
- `backend/.env.example` — document both
- `backend/repositories/channels.py` — no changes needed; `upsert_verified(user_id, "telegram", chat_id)` is the call site

**Frontend (modified)**:

- `frontend/src/app/(dashboard)/hub/page.tsx` — change `telegram` out of the COMING_SOON set; add a click handler that calls `POST /api/channels/telegram/pair`, displays the code + bot link, polls for connection
- `frontend/src/lib/api.ts` — add `pairTelegram(token)` client helper

### Already-built infrastructure to reuse

- `channels` table — has the `(type, address)` unique index. `channels_repo.upsert_verified(user_id, "telegram", str(chat_id))` is the link mechanism.
- `pending_approvals.channel` column — set to `"telegram"` when the approval came from there. `approval_repo.get_latest_pending_for_user(user_id, "telegram")` already supports this.
- `services/run_resume.resume_approval()` — channel-neutral. Returns a string content. Telegram dispatch passes the string into `send_message` after the callback.
- The pattern from sms_dispatch.py (free text → agent run, pending approval → resume, persist user + assistant messages) is the template. Pull it from `git show 5de2916:backend/services/sms_dispatch.py` if you want the exact shape.

### Telegram-specific details that bit me in planning

- Inline-keyboard callbacks have a 30-character limit on `callback_data`. Use approval_id (UUID is 36 chars — won't fit). Either truncate to a short pairing token stored in the approval row, or generate a short token at approval creation time and look up the approval_id from it. Easiest fix: add a `short_token` column to `pending_approvals` (8 chars, random), put `approve:<short>` and `reject:<short>` in callback_data.
- Telegram webhook secret is set via the `setWebhook` API call, then included in every inbound request as `X-Telegram-Bot-Api-Secret-Token`. Verify by string comparison — no HMAC, just a shared bearer.
- Telegram retries inbound updates if you don't return 200 within ~15s. The dispatch must run in a background task (fastapi.BackgroundTasks) and the webhook returns 200 immediately. This is the same gap we noted in the Twilio audit (background-task dispatch as a missing piece). Telegram needs it too — don't skip.
- The user needs to create the bot via @BotFather first. They get a token like `1234567890:ABCdef...`. We need that token in `TELEGRAM_BOT_TOKEN` before anything can be tested. Bot username comes back from `getMe` — cache it once at boot.

### Open follow-ups (not Telegram, leave for later)

- **#5**: Watch for Agno >2.6.8 release that fixes the route-mode `acontinue_run` bug (filed at agno-agi/agno#8029). When it lands, revisit the Part-2 revert in `event_translator.py`.
- **Deployment** to Railway + Vercel + OAuth production verification (Microsoft multi-tenant + Google CASA). Deferred this conversation because the demo target is local-first.

## Environment state

- Branch: `main`, ~10 commits ahead of `origin`. Push when ready or wait for review.
- Local dev: backend on `:8000`, frontend on `:3000`. May or may not be running — check `lsof -i :8000 -i :3000`.
- Tests: 80 backend passing, frontend `tsc --noEmit` clean.
- Microsoft + Google integrations were re-OAuth'd earlier this conversation after the Fernet rotation incident. Both should be live.
- `.env` has leftover `TWILIO_*` keys — `config.py` now uses `extra="ignore"` so they don't break boot. Optional cleanup but not required.

## Quick-start for the new chat

Drop this in the first message:

> Picking up from `docs/handoff/2026-05-21-telegram-build.md`. Build the Telegram channel per the file-level plan in that doc. I'll create the bot in @BotFather and paste you the token. Start with `telegram_client.py` and the webhook route, then wire the dispatch + pairing flow, then the Hub UI. Confirm scope and any open questions before you start writing.

That hands the agent enough context to pick up cold without re-reading this entire conversation.
