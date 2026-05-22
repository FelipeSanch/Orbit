# Draft: comment for agno-agi/agno#8029

Status: draft. Not posted yet. Awaiting Felipe's review of the
coordinate-mode probe results before deciding whether the wording
needs adjustment.

---

## Proposed comment body

Update — **this bug isn't specific to route mode**. The same silent-failure pattern reproduces in `Team` coordinate mode (`mode="coordinate"`) against `agno==2.6.8`. That makes it a framework-level `acontinue_run` lookup issue, not a route-mode quirk.

### Event sequence observed in coordinate mode

```
TEAM PHASE
  RunStartedEvent              run_id=<team>     team_id=orbit
  ModelRequestStartedEvent     run_id=<team>     team_id=orbit
  RunContentEvent              run_id=<team>     team_id=orbit
  ModelRequestCompletedEvent   run_id=<team>     team_id=orbit
  ToolCallStartedEvent         run_id=<team>     team_id=orbit
      tool=delegate_task_to_member

MEMBER PHASE
  RunStartedEvent              run_id=<member>   agent_id=email-agent
  ModelRequestStartedEvent     run_id=<member>   agent_id=email-agent
  RunContentEvent              run_id=<member>   agent_id=email-agent
  ModelRequestCompletedEvent   run_id=<member>   agent_id=email-agent
  RunContentCompletedEvent     run_id=<member>   agent_id=email-agent
  RunPausedEvent               run_id=<member>   agent_id=email-agent
      tools=[{tool_name=send_email, tool_call_id, tool_args, requires_confirmation=True}]
      requirements=[<Requirement wrapping that ToolExecution>]

TEAM PHASE (pause propagation)
  ToolCallCompletedEvent       run_id=<team>     team_id=orbit
      tool=delegate_task_to_member        ← "completes" the delegation
  RunPausedEvent               run_id=<team>     team_id=orbit
      tools=[{tool_name=delegate_task_to_member, ...}]
      requirements=[<wrapper>]
      content="Team run paused. The following require input:\n- Email Agent: send_email requires confirmation"
```

Worth noting for anyone else hitting this: in coordinate mode Agno emits **two** `RunPausedEvent`s with the same Python class — the member-level one (carrying the real tool payload) and the team-level one (carrying `delegate_task_to_member` as its "tool"). Consumers need to filter the `delegate_task_to_member` case explicitly, or they'll surface a spurious approval card for the delegation itself.

### Continuation behavior

`team.aget_session(session_id=..., user_id=...)` returns a session whose `.runs` contains **both** paused runs (member and team, both with `status=PAUSED`, `reqs=1`). So persistence is fine. The issue is in `acontinue_run`.

Calling `team.acontinue_run(run_id=<team_run_id>, requirements=<team_run.requirements>, ...)` produces:

```
ERROR    Error in Agent run: No runs found for run ID <member_run_id>
WARNING  Member email-agent streaming did not yield a final RunOutput
{RunContinuedEvent run_id=<team_run_id> team_id=orbit}
ModelRequestStartedEvent (leader restarts)
```

Same `No runs found for run ID <member_run_id>` error pointing at the **member** run_id (which I never passed), same silent-restart of a fresh leader run that never executes `send_email`. The workaround we shipped for route mode (buffer the continuation, watch for `ToolCallStartedEvent` carrying the target `tool_call_id`, fall through to a direct-tool invocation if it never appears) ports across cleanly — no coordinate-mode-specific changes needed.

### Suggested narrowing

The lookup bug is in `Team.acontinue_run`'s resolution of which paused `RunOutput` to resume, not in the team-mode dispatch. A user-supplied team `run_id` ends up internally hunting for a member `run_id` that was attached during pause but never re-registered with the team's runs container. Member-level fall-through (`team.acontinue_run` walks `team.members` to find a member run carrying a paused tool whose `tool_call_id` matches a confirmed requirement) would fix both modes simultaneously.

Happy to PR — would appreciate a pointer to the intended lookup site so I don't paper over symptoms.
