from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from agno.db.postgres.async_postgres import AsyncPostgresDb
from sqlalchemy.ext.asyncio import create_async_engine

from config import settings

_agno_db: AsyncPostgresDb | None = None

# Query-string keys libpq understands but asyncpg rejects.
# asyncpg connects via TLS when `ssl` is passed; Neon needs TLS, so we translate
# sslmode=require (plus channel_binding) out of the URL and set connect_args.
_LIBPQ_ONLY_PARAMS = {"sslmode", "channel_binding", "sslrootcert", "sslcert", "sslkey"}


def _to_async_url(url: str) -> tuple[str, dict]:
    """Convert libpq-style URL to SQLAlchemy-asyncpg form.

    Returns (url_without_libpq_params, connect_args).
    asyncpg doesn't accept `sslmode` — we strip it and translate to the
    `ssl` connect_arg if Neon/libpq requested TLS.
    """
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]

    parts = urlsplit(url)
    query_pairs = parse_qsl(parts.query, keep_blank_values=True)

    libpq_params = {k: v for k, v in query_pairs if k in _LIBPQ_ONLY_PARAMS}
    remaining = [(k, v) for k, v in query_pairs if k not in _LIBPQ_ONLY_PARAMS]

    connect_args: dict = {}
    sslmode = libpq_params.get("sslmode")
    if sslmode:
        # asyncpg understands libpq-style strings directly (require / prefer /
        # disable / verify-ca / verify-full). This matches Neon's default of
        # encrypted-without-cert-verification.
        connect_args["ssl"] = sslmode

    new_url = urlunsplit(
        (
            parts.scheme,
            parts.netloc,
            parts.path,
            urlencode(remaining),
            parts.fragment,
        )
    )
    return new_url, connect_args


def get_agno_db() -> AsyncPostgresDb:
    """Singleton AsyncPostgresDb for Agno session/approval storage."""
    global _agno_db
    if _agno_db is None:
        async_url, connect_args = _to_async_url(settings.database_url)
        engine = create_async_engine(
            async_url,
            pool_pre_ping=True,
            pool_recycle=3600,
            connect_args=connect_args,
        )
        _agno_db = AsyncPostgresDb(db_engine=engine, db_schema="agno")
    return _agno_db
