"""Register (or unregister) the Telegram webhook with the Bot API.

Telegram needs a publicly reachable HTTPS URL to push Updates to. In dev
that's typically an ngrok tunnel; in prod it's the Railway URL. This
script wraps the `setWebhook` call so you don't have to curl it by hand.

Usage:
  # Register: pass the full URL to YOUR backend's webhook route.
  python -m scripts.setup_telegram_webhook --url https://xxx.ngrok-free.app

  # Unregister (e.g. before tearing down a tunnel):
  python -m scripts.setup_telegram_webhook --delete

  # Show what Telegram thinks the webhook is right now:
  python -m scripts.setup_telegram_webhook --info

Requires TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in backend/.env.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from dotenv import load_dotenv

# Load .env BEFORE importing config so settings pick up the values.
load_dotenv()

from config import settings  # noqa: E402
from services import telegram_client as tg  # noqa: E402

_WEBHOOK_PATH = "/api/webhooks/telegram/inbound"


def _check_env() -> None:
    missing = []
    if not settings.telegram_bot_token:
        missing.append("TELEGRAM_BOT_TOKEN")
    if not settings.telegram_webhook_secret:
        missing.append("TELEGRAM_WEBHOOK_SECRET")
    if missing:
        print(f"error: missing in backend/.env: {', '.join(missing)}")
        sys.exit(1)


async def _register(base_url: str) -> None:
    url = base_url.rstrip("/") + _WEBHOOK_PATH
    print(f"Registering Telegram webhook → {url}")
    result = await tg.set_webhook(url, settings.telegram_webhook_secret)
    print(f"  result: {result}")
    me = await tg.get_me()
    print(f"  bot: @{me.get('username')} (id={me.get('id')})")
    print("Done. Send /start to your bot from Telegram to confirm.")


async def _delete() -> None:
    print("Deleting Telegram webhook…")
    result = await tg.delete_webhook()
    print(f"  result: {result}")


async def _info() -> None:
    info = await tg.get_webhook_info()
    print("Current webhook info:")
    for key in ("url", "has_custom_certificate", "pending_update_count",
                "last_error_date", "last_error_message", "max_connections",
                "allowed_updates"):
        if key in info:
            print(f"  {key}: {info[key]}")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument(
        "--url",
        help="Public base URL of the backend (e.g. https://abc.ngrok-free.app)",
    )
    g.add_argument(
        "--delete", action="store_true", help="Delete the registered webhook"
    )
    g.add_argument(
        "--info", action="store_true", help="Show the current webhook info"
    )
    args = parser.parse_args()

    _check_env()

    try:
        if args.url:
            await _register(args.url)
        elif args.delete:
            await _delete()
        else:
            await _info()
    except tg.TelegramError as e:
        print(f"error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
