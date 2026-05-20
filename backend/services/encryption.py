"""Fernet token encryption with rotation support.

We use MultiFernet so a key rotation can run with both the new primary
key and the previous key(s) enabled at the same time. The primary
(first key in `settings.fernet_key_list`) is always used for new
encryptions; decrypt walks the list and returns the first that
succeeds. After running scripts/rotate_fernet_key.py to re-encrypt
every integrations row onto the new primary, drop the old key from
ENCRYPTION_KEYS. See docs/oauth.md.
"""

from cryptography.fernet import Fernet, MultiFernet

from config import settings

_multi: MultiFernet | None = None


def _get_multifernet() -> MultiFernet:
    global _multi
    if _multi is None:
        keys = settings.fernet_key_list
        if not keys:
            raise RuntimeError(
                "No encryption key configured — set ENCRYPTION_KEY (single) "
                "or ENCRYPTION_KEYS (csv) in the environment."
            )
        _multi = MultiFernet([Fernet(k.encode()) for k in keys])
    return _multi


def encrypt_token(plaintext: str) -> str:
    """Encrypt a token using the current primary Fernet key."""
    return _get_multifernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a Fernet token, trying each configured key in order."""
    return _get_multifernet().decrypt(ciphertext.encode()).decode()


def reset_for_tests() -> None:
    """Clear the cached MultiFernet so tests that mutate settings can see
    the change. Not called in production code."""
    global _multi
    _multi = None
