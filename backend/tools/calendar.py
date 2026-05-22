import json
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from agno.tools.decorator import tool

from services.graph_safety import ensure_ok
from services.token_manager import TokenManager

# O365 rejects datetimes whose tzinfo is a plain UTC offset — it wants a
# real IANA zone (ZoneInfo). Default to America/New_York since the user
# base is US-East; fall back to UTC if the zone isn't available.
try:
    _DEFAULT_ZONE = ZoneInfo("America/New_York")
except Exception:
    _DEFAULT_ZONE = ZoneInfo("UTC")


def _parse_event_datetime(iso_str: str) -> datetime:
    """Parse an ISO datetime and guarantee a ZoneInfo tzinfo (O365 requires it)."""
    dt = datetime.fromisoformat(iso_str)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=_DEFAULT_ZONE)
    # Preserve the instant but re-anchor to a ZoneInfo. If the offset matches
    # our default zone's current offset, keep it; otherwise fall back to UTC.
    default_offset = datetime.now(_DEFAULT_ZONE).utcoffset()
    if dt.utcoffset() == default_offset:
        return dt.astimezone(_DEFAULT_ZONE)
    return dt.astimezone(ZoneInfo("UTC"))


PROVIDER = "outlook_calendar"


def _not_connected_payload() -> str:
    return json.dumps(
        {
            "provider": PROVIDER,
            "error": "not_connected",
            "message": (
                "Microsoft 365 isn't connected. Open the Hub and link your "
                "Microsoft account to use Outlook Calendar."
            ),
        }
    )


def create_calendar_tools(token_manager: TokenManager, user_id: str) -> list:
    """Create Outlook Calendar tool functions with credentials bound via closure."""

    async def _get_calendar():
        try:
            account = await token_manager.get_account(user_id)
        except ValueError as e:
            if "not connected" in str(e).lower():
                return None
            raise
        schedule = account.schedule()
        return schedule.get_default_calendar()

    @tool
    async def list_events(time_min: str = "", time_max: str = "", max_results: int = 10) -> str:
        """List upcoming calendar events.

        Args:
            time_min: Start time in ISO format (e.g. '2024-01-15T00:00:00Z'). Defaults to now.
            time_max: End time in ISO format. Defaults to end of today.
            max_results: Maximum events to return. Default 10.
        """
        calendar = await _get_calendar()
        if calendar is None:
            return _not_connected_payload()

        now = datetime.now(timezone.utc)
        start = datetime.fromisoformat(time_min) if time_min else now
        if time_max:
            end = datetime.fromisoformat(time_max)
        else:
            end = now.replace(hour=23, minute=59, second=59)

        query = calendar.new_query("start").greater_equal(start)
        query.chain("and").on_attribute("start").less_equal(end)

        events_iter = calendar.get_events(query=query, limit=max_results, include_recurring=True)

        events = []
        for event in events_iter:
            location_str = ""
            if event.location:
                location_str = (
                    event.location.get("displayName", str(event.location))
                    if isinstance(event.location, dict)
                    else str(event.location)
                )

            attendee_list = []
            if event.attendees:
                for att in event.attendees:
                    attendee_list.append(str(att))

            events.append(
                {
                    "id": event.object_id,
                    "summary": event.subject or "(no title)",
                    "start": event.start.isoformat() if event.start else "",
                    "end": event.end.isoformat() if event.end else "",
                    "location": location_str,
                    "attendees": attendee_list,
                    "is_all_day": event.is_all_day,
                }
            )

        return json.dumps({"provider": PROVIDER, "items": events})

    @tool
    async def get_event(event_id: str) -> str:
        """Get details of a specific calendar event.

        Args:
            event_id: The Outlook calendar event ID.
        """
        calendar = await _get_calendar()
        if calendar is None:
            return _not_connected_payload()
        event = calendar.get_event(object_id=event_id)

        if not event:
            return json.dumps({"provider": PROVIDER, "error": "Event not found"})

        location_str = ""
        if event.location:
            location_str = (
                event.location.get("displayName", str(event.location))
                if isinstance(event.location, dict)
                else str(event.location)
            )

        attendee_list = []
        if event.attendees:
            for att in event.attendees:
                attendee_list.append(str(att))

        return json.dumps(
            {
                "provider": PROVIDER,
                "id": event.object_id,
                "summary": event.subject or "",
                "start": event.start.isoformat() if event.start else "",
                "end": event.end.isoformat() if event.end else "",
                "location": location_str,
                "description": event.body or "",
                "attendees": attendee_list,
                "organizer": str(event.organizer) if event.organizer else "",
                "is_all_day": event.is_all_day,
                "web_link": getattr(event, "web_link", "") or "",
            }
        )

    @tool(requires_confirmation=True)
    async def create_event(
        summary: str,
        start_time: str,
        end_time: str,
        description: str = "",
        attendees: str = "",
        location: str = "",
    ) -> str:
        """Create a new calendar event.

        Args:
            summary: Event title.
            start_time: Start time in ISO format (e.g. '2024-01-15T14:00:00-05:00').
            end_time: End time in ISO format.
            description: Event description. Optional.
            attendees: Comma-separated email addresses of attendees. Optional.
            location: Event location. Optional.
        """
        calendar = await _get_calendar()
        if calendar is None:
            return _not_connected_payload()
        event = calendar.new_event()

        event.subject = summary
        event.start = _parse_event_datetime(start_time)
        event.end = _parse_event_datetime(end_time)

        if description:
            event.body = description
        if location:
            event.location = location
        if attendees:
            for email in attendees.split(","):
                event.attendees.add(email.strip())

        ensure_ok(event.save(), action="the event-create request")

        return json.dumps(
            {
                "provider": PROVIDER,
                "status": "created",
                "id": event.object_id,
                "summary": event.subject,
            }
        )

    @tool(requires_confirmation=True)
    async def update_event(
        event_id: str,
        summary: str = "",
        start_time: str = "",
        end_time: str = "",
        description: str = "",
        attendees: str = "",
        location: str = "",
    ) -> str:
        """Update an existing calendar event.

        Args:
            event_id: The Outlook calendar event ID.
            summary: New event title. Optional.
            start_time: New start time in ISO format. Optional.
            end_time: New end time in ISO format. Optional.
            description: New description. Optional.
            attendees: Comma-separated emails. Replaces existing attendees. Optional.
            location: New location. Optional.
        """
        calendar = await _get_calendar()
        if calendar is None:
            return _not_connected_payload()
        event = calendar.get_event(object_id=event_id)

        if not event:
            return json.dumps({"provider": PROVIDER, "error": "Event not found"})

        if summary:
            event.subject = summary
        if start_time:
            event.start = datetime.fromisoformat(start_time)
        if end_time:
            event.end = datetime.fromisoformat(end_time)
        if description:
            event.body = description
        if location:
            event.location = location
        if attendees:
            event.attendees.clear()
            for email in attendees.split(","):
                event.attendees.add(email.strip())

        ensure_ok(event.save(), action="the event-update request")

        return json.dumps(
            {"provider": PROVIDER, "status": "updated", "id": event.object_id}
        )

    @tool(requires_confirmation=True)
    async def delete_event(event_id: str) -> str:
        """Delete a calendar event.

        Args:
            event_id: The Outlook calendar event ID to delete.
        """
        calendar = await _get_calendar()
        if calendar is None:
            return _not_connected_payload()
        event = calendar.get_event(object_id=event_id)

        if not event:
            return json.dumps({"provider": PROVIDER, "error": "Event not found"})

        ensure_ok(event.delete(), action="the event-delete request")

        return json.dumps({"provider": PROVIDER, "status": "deleted", "id": event_id})

    return [list_events, get_event, create_event, update_event, delete_event]
