# Orbit Roadmap

## Phase 1: Make It Work (current)

Get every agent returning real data end-to-end through the full SSE pipeline.

- [ ] Debug O365 token flow — `TokenManager.get_account()` must build a working Account object
- [ ] Test `list_emails` tool in isolation with `debug_mode=True`
- [ ] Get "Check my emails" returning real Outlook emails end-to-end
- [ ] Get activity feed populating from SSE — right panel shows tool calls in real time
- [ ] Get calendar tools working — "What's on my calendar today?" returns real events
- [ ] Get tasks tools working — "What are my tasks?" returns real To Do items
- [ ] Verify orchestrator routing — email/calendar/tasks queries go to correct specialist
- [ ] Get attachment reading working — emails with attachments are opened and analyzed
- [ ] Fix response speed — streaming should feel snappy, not laggy

## Phase 2: Approval Flow + Cross-Tool Synthesis

Wire up write operations and multi-agent queries.

- [ ] `requires_confirmation=True` triggers approval card in UI (Approve / Edit / Reject)
- [ ] Approval cards stack when multiple are pending, each showing what will happen
- [ ] "Send Sarah an email saying I'll be late" shows draft for approval before sending
- [ ] Cross-tool: "What should I focus on today?" queries all three agents, synthesizes briefing
- [ ] Cross-tool: "Find action items in my recent emails and create tasks for them"
- [ ] Log every action to `activity_log` with status, timestamps, token usage
- [ ] Iterate on orchestrator instructions until routing is reliable

## Phase 3: Memory + Conversation History + Polish

Make Orbit remember things and feel complete.

- [ ] Enable `update_memory_on_run=True` on orchestrator
- [ ] Test: "I prefer morning meetings" persists across sessions
- [ ] Conversation history sidebar — list past conversations, click to resume
- [ ] Token cost tracking — read `response.metrics`, store, display daily cost
- [ ] Trust level progression — track approval/rejection counts, auto-approve reads after threshold
- [ ] Dashboard polish — loading states, error states, empty states, responsive layout
- [ ] Activity feed colors per agent type, clean entry formatting

## Phase 4: SMS Interface (Twilio)

Text your AI assistant from your phone.

- [ ] Twilio number + webhook endpoint in FastAPI
- [ ] Incoming SMS -> `orchestrator.arun()` -> response via Twilio API
- [ ] Approval flow over SMS — send draft as text, reply "yes" or "no"
- [ ] Morning briefing delivered via text
- [ ] Dashboard and SMS share same backend, same agents, same memory

## Phase 5: Expand Integrations

Each follows the same pattern: OAuth, `@tool` functions, specialist agent, add to team.

- [ ] Google Workspace — Gmail, Google Calendar (for users not on Microsoft)
- [ ] Notion — Notes Agent: "Save my meeting notes to Notion"
- [ ] Slack — "Summarize what happened in #engineering while I was in meetings"
- [ ] GitHub — Dev Agent: "What PRs need my review?"
- [ ] Settings page shows all integrations with connect/disconnect

## Phase 6: Proactive Agents (Scheduled Tasks)

Orbit works for you in the background.

- [ ] APScheduler or cron system in FastAPI
- [ ] Daily morning briefing at 8am — calendar, overdue tasks, urgent emails
- [ ] Midday inbox digest at noon
- [ ] Friday weekly review at 5pm
- [ ] Scheduled run results pushed via SMS and stored in dashboard
- [ ] `automations` table: user_id, cron_expression, action_type, action_config, enabled

---

## The Vision

You wake up and there's a text waiting — your calendar, overdue tasks, urgent emails, synthesized. You reply "move my 2pm to tomorrow" and it handles it. You text "draft a response to the professor email, formal tone" and get a draft with Approve/Reject. You open the web dashboard for the full picture — activity history, conversations, settings. It remembers you hate meetings before 10am, that you write casually to friends and formally to professors, that your CS 216 deadlines are priority this month. One assistant across every channel — browser, phone, text — one shared brain.

Starts with making "Check my emails" return real emails.
