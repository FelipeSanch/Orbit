"""Twilio inbound SMS webhook.

Twilio POSTs every received message to this endpoint. We:
  1. Validate the X-Twilio-Signature header (rejects spoofed requests)
  2. Pull `From` and `Body` out of the form-encoded body
  3. Hand off to services.sms_dispatch.handle_inbound_sms
  4. Return an empty TwiML response (we send the reply ourselves via the
     REST API rather than inline TwiML so we can do work asynchronously
     without holding the webhook open).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request, Response

from services.sms_dispatch import handle_inbound_sms
from services.twilio_client import validate_request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks/twilio", tags=["twilio"])

# An empty TwiML <Response> tells Twilio "OK, no inline reply" — our
# outbound is sent via the REST API in handle_inbound_sms.
_EMPTY_TWIML = (
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
)


def _twiml_ok() -> Response:
    return Response(content=_EMPTY_TWIML, media_type="application/xml")


@router.post("/inbound")
async def twilio_inbound(request: Request) -> Response:
    """Handle an inbound SMS from Twilio.

    Always returns 200 with empty TwiML — even on errors — so Twilio
    doesn't retry indefinitely. Errors are logged.
    """
    raw_body = await request.body()
    form = await request.form()
    params = {k: str(v) for k, v in form.items()}

    # Twilio uses the URL it called us with for the signature. Reconstruct
    # what it sees, including https through any proxy/tunnel.
    forwarded_proto = request.headers.get("x-forwarded-proto")
    scheme = forwarded_proto or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.url.netloc
    full_url = f"{scheme}://{host}{request.url.path}"
    if request.url.query:
        full_url = f"{full_url}?{request.url.query}"

    signature = request.headers.get("X-Twilio-Signature", "")
    if not validate_request(full_url, params, signature):
        logger.warning(
            "Rejected Twilio webhook — bad signature. url=%s from=%s",
            full_url,
            params.get("From"),
        )
        return Response(status_code=403)

    from_address = params.get("From", "").strip()
    body = params.get("Body", "").strip()
    logger.info(
        "Inbound SMS from %s (%d chars), bytes=%d",
        from_address or "unknown",
        len(body),
        len(raw_body),
    )

    if not from_address or not body:
        return _twiml_ok()

    try:
        await handle_inbound_sms(from_address, body)
    except Exception as e:
        logger.exception("Inbound SMS handler crashed: %s", e)

    return _twiml_ok()
