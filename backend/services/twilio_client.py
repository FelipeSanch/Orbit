"""Twilio client wrapper.

Lazily constructs the REST client so the backend can boot without the
SMS env vars set. Provides:
  - send_sms(to, body): outbound message
  - validate_request(url, params, signature): verify Twilio webhook signature
"""

from __future__ import annotations

import logging

from twilio.base.exceptions import TwilioRestException
from twilio.request_validator import RequestValidator
from twilio.rest import Client as TwilioRest

from config import settings

logger = logging.getLogger(__name__)

_client: TwilioRest | None = None
_validator: RequestValidator | None = None


def _get_client() -> TwilioRest:
    global _client
    if _client is None:
        if not settings.twilio_account_sid or not settings.twilio_auth_token:
            raise RuntimeError("Twilio credentials are not configured")
        _client = TwilioRest(
            settings.twilio_account_sid, settings.twilio_auth_token
        )
    return _client


def _get_validator() -> RequestValidator:
    global _validator
    if _validator is None:
        if not settings.twilio_auth_token:
            raise RuntimeError("Twilio auth token is not configured")
        _validator = RequestValidator(settings.twilio_auth_token)
    return _validator


def is_configured() -> bool:
    return bool(
        settings.twilio_account_sid
        and settings.twilio_auth_token
        and settings.twilio_phone_number
    )


def validate_request(url: str, params: dict, signature: str) -> bool:
    """Verify a Twilio webhook is authentic.

    `url` must be the *full* URL Twilio used to call us (including scheme,
    host, path, and query string). `params` are the form-encoded POST body
    fields. `signature` is the value of the X-Twilio-Signature header.
    """
    if not settings.twilio_webhook_validate:
        logger.warning(
            "Twilio webhook signature validation is disabled (dev mode)."
        )
        return True
    try:
        return _get_validator().validate(url, params, signature)
    except Exception as e:
        logger.exception("Twilio signature validation error: %s", e)
        return False


def send_sms(to: str, body: str) -> str:
    """Send an SMS. Returns the message SID. Raises on failure.

    TwilioRestException is logged with code + status + msg so we can
    branch on it later (retry 20429 throttles, drop 21610 unsubscribed,
    etc.). Until TFV clears we just log and re-raise — caller handles.
    """
    client = _get_client()
    try:
        msg = client.messages.create(
            from_=settings.twilio_phone_number,
            to=to,
            body=body,
        )
    except TwilioRestException as e:
        logger.error(
            "Twilio send rejected: code=%s status=%s msg=%s to=%s",
            getattr(e, "code", "?"),
            getattr(e, "status", "?"),
            getattr(e, "msg", str(e)),
            to,
        )
        raise
    logger.info("Sent SMS to %s — sid=%s", to, msg.sid)
    return msg.sid
