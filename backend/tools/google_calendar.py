import json
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from agno.tools.decorator import tool
from googleapiclient.discovery import build

from services.google_token_manager import GoogleTokenManager

try:
    _DEFAULT_ZONE_NAME = "America/New_York"
    ZoneInfo(_DEFAULT_ZONE_NAME)
except Exception:
    _DEFAULT_ZONE_NAME = "UTC"


def _to_rfc3339(iso_or_empty: str, fallback: datetime) -> str:
    """Coerce a user-provided ISO string (or blank) into RFC3339 with tz."""
    if not iso_or_empty:
        dt = fallback
    else:
        dt = datetime.fromisoformat(iso_or_empty)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo(_DEFAULT_ZONE_NAME))
    return dt.isoformat()


def _event_summary(ev: dict) -> dict:
    """Convert a Google Calendar API event dict to our normalized shape."""
    start = ev.get("start", {})
    end = ev.get("end", {})
    attendees = [
        a.get("email") for a in ev.get("attendees", []) if a.get("email")
    ]
    return {
        "id": ev.get("id"),
        "summary": ev.get("summary") or "(no title)",
        "start": start.get("dateTime") or start.get("date") or "",
        "end": end.get("dateTime") or end.get("date") or "",
        "location": ev.get("location") or "",
        "attendees": attendees,
        "organizer": (ev.get("organizer") or {}).get("email") or "",
        "html_link": ev.get("htmlLink") or "",
        "status": ev.get("status") or "",
        "is_all_day": "date" in start,
    }


def create_google_calendar_tools(
    token_manager: GoogleTokenManager, user_id: str
) -> list:
    """Create Google Calendar tool functions with credentials bound via closure."""

    async def _service():
        creds = await token_manager.get_credentials(user_id)
        return build("calendar", "v3", credentials=creds, cache_discovery=False)

    @tool
    async def list_events(
        time_min: str = "",
        time_max: str = "",
        max_results: int = 10,
        calendar_id: str = "primary",
    ) -> str:
        """List upcoming events from a Google Calendar.

        Args:
            time_min: Start of the window, ISO format. Defaults to now.
            time_max: End of the window, ISO format. Defaults to end of today.
            max_results: Max number of events. Default 10.
            calendar_id: Which calendar to read. 'primary' by default.
        """
        service = await _service()

        now = datetime.now(timezone.utc)
        start = _to_rfc3339(time_min, now)
        end_of_day = now.replace(
            hour=23, minute=59, second=59, microsecond=0
        )
        end = _to_rfc3339(time_max, end_of_day)

        result = service.events().list(
            calendarId=calendar_id,
            timeMin=start,
            timeMax=end,
            maxResults=max_results,
            singleEvents=True,
            orderBy="startTime",
        ).execute()

        return json.dumps([_event_summary(e) for e in result.get("items", [])])

    @tool
    async def get_event(event_id: str, calendar_id: str = "primary") -> str:
        """Get details of a specific Google Calendar event.

        Args:
            event_id: The Google Calendar event ID.
            calendar_id: Which calendar. 'primary' by default.
        """
        service = await _service()
        ev = service.events().get(
            calendarId=calendar_id, eventId=event_id
        ).execute()
        details = _event_summary(ev)
        details["description"] = ev.get("description") or ""
        return json.dumps(details)

    @tool(requires_confirmation=True)
    async def create_event(
        summary: str,
        start_time: str,
        end_time: str = "",
        description: str = "",
        attendees: str = "",
        location: str = "",
        calendar_id: str = "primary",
    ) -> str:
        """Create a new event on a Google Calendar.

        Args:
            summary: Event title.
            start_time: Start time, ISO format. Include timezone offset if known.
            end_time: End time, ISO format. Defaults to 1 hour after start if omitted.
            description: Event description. Optional.
            attendees: Comma-separated email addresses. Optional.
            location: Event location (address or video link). Optional.
            calendar_id: Which calendar to add to. 'primary' by default.
        """
        service = await _service()

        start_dt = datetime.fromisoformat(start_time)
        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=ZoneInfo(_DEFAULT_ZONE_NAME))
        if end_time:
            end_dt = datetime.fromisoformat(end_time)
            if end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=ZoneInfo(_DEFAULT_ZONE_NAME))
        else:
            end_dt = start_dt + timedelta(hours=1)

        body: dict = {
            "summary": summary,
            "start": {
                "dateTime": start_dt.isoformat(),
                "timeZone": str(start_dt.tzinfo) or _DEFAULT_ZONE_NAME,
            },
            "end": {
                "dateTime": end_dt.isoformat(),
                "timeZone": str(end_dt.tzinfo) or _DEFAULT_ZONE_NAME,
            },
        }
        if description:
            body["description"] = description
        if location:
            body["location"] = location
        if attendees:
            body["attendees"] = [
                {"email": a.strip()} for a in attendees.split(",") if a.strip()
            ]

        ev = service.events().insert(
            calendarId=calendar_id, body=body, sendUpdates="all"
        ).execute()

        return json.dumps(
            {
                "status": "created",
                "id": ev.get("id"),
                "summary": ev.get("summary"),
                "html_link": ev.get("htmlLink") or "",
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
        calendar_id: str = "primary",
    ) -> str:
        """Update an existing Google Calendar event.

        Args:
            event_id: The Google Calendar event ID.
            summary: New event title. Optional.
            start_time: New start time, ISO format. Optional.
            end_time: New end time, ISO format. Optional.
            description: New description. Optional.
            attendees: New comma-separated attendees. Optional (replaces list).
            location: New location. Optional.
            calendar_id: Which calendar. 'primary' by default.
        """
        service = await _service()
        ev = service.events().get(
            calendarId=calendar_id, eventId=event_id
        ).execute()

        if summary:
            ev["summary"] = summary
        if start_time:
            dt = datetime.fromisoformat(start_time)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=ZoneInfo(_DEFAULT_ZONE_NAME))
            ev["start"] = {
                "dateTime": dt.isoformat(),
                "timeZone": str(dt.tzinfo) or _DEFAULT_ZONE_NAME,
            }
        if end_time:
            dt = datetime.fromisoformat(end_time)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=ZoneInfo(_DEFAULT_ZONE_NAME))
            ev["end"] = {
                "dateTime": dt.isoformat(),
                "timeZone": str(dt.tzinfo) or _DEFAULT_ZONE_NAME,
            }
        if description:
            ev["description"] = description
        if location:
            ev["location"] = location
        if attendees:
            ev["attendees"] = [
                {"email": a.strip()} for a in attendees.split(",") if a.strip()
            ]

        updated = service.events().update(
            calendarId=calendar_id, eventId=event_id, body=ev, sendUpdates="all"
        ).execute()
        return json.dumps({"status": "updated", "id": updated.get("id")})

    @tool(requires_confirmation=True)
    async def delete_event(event_id: str, calendar_id: str = "primary") -> str:
        """Delete a Google Calendar event.

        Args:
            event_id: The event ID to delete.
            calendar_id: Which calendar. 'primary' by default.
        """
        service = await _service()
        service.events().delete(
            calendarId=calendar_id, eventId=event_id, sendUpdates="all"
        ).execute()
        return json.dumps({"status": "deleted", "id": event_id})

    return [list_events, get_event, create_event, update_event, delete_event]
