"""Tests for the Fernet rotation chain.

Encryption now goes through MultiFernet so an operator can rotate the
key with both new and old live at once. These cases assert:
  * A token encrypted with the OLD key still decrypts after the chain
    swaps to [NEW, OLD].
  * A token encrypted AFTER the rotation uses the NEW key (i.e. an old-
    only deployment cannot decrypt it).
  * Dropping the old key from the chain after a re-encrypt sweep leaves
    every freshly-rotated token still readable.
"""

from __future__ import annotations

import pytest
from cryptography.fernet import Fernet

import services.encryption as enc
from config import settings


def _set_chain(monkeypatch, *keys: str) -> None:
    """Force the encryption module to rebuild its MultiFernet from the
    given key list (first = primary)."""
    monkeypatch.setattr(settings, "encryption_keys", ",".join(keys))
    enc.reset_for_tests()


@pytest.fixture
def old_key() -> str:
    return Fernet.generate_key().decode()


@pytest.fixture
def new_key() -> str:
    return Fernet.generate_key().decode()


def test_old_ciphertext_decrypts_after_rotation_chain_loaded(
    monkeypatch, old_key: str, new_key: str
) -> None:
    # 1. Encrypt under the OLD key only.
    _set_chain(monkeypatch, old_key)
    cipher = enc.encrypt_token("hunter2")

    # 2. Operator drops in the new key as primary, keeps old for fallback.
    _set_chain(monkeypatch, new_key, old_key)

    # The old ciphertext still decrypts thanks to MultiFernet's fallback.
    assert enc.decrypt_token(cipher) == "hunter2"


def test_fresh_encrypt_uses_new_primary_after_rotation(
    monkeypatch, old_key: str, new_key: str
) -> None:
    # Chain has the new primary up front.
    _set_chain(monkeypatch, new_key, old_key)
    cipher = enc.encrypt_token("rotated-secret")

    # An old-key-only deployment must NOT be able to decrypt this — the
    # primary really moved.
    _set_chain(monkeypatch, old_key)
    with pytest.raises(Exception):
        enc.decrypt_token(cipher)


def test_after_resweep_chain_can_shrink_to_new_key_only(
    monkeypatch, old_key: str, new_key: str
) -> None:
    # Encrypt under old.
    _set_chain(monkeypatch, old_key)
    old_cipher = enc.encrypt_token("legacy")

    # Rotate: new primary, old fallback. The rotation script re-encrypts
    # everything to the new primary.
    _set_chain(monkeypatch, new_key, old_key)
    rotated = enc.encrypt_token(enc.decrypt_token(old_cipher))

    # Operator removes the old key. The rotated ciphertext is still
    # readable; the original old-only ciphertext is not.
    _set_chain(monkeypatch, new_key)
    assert enc.decrypt_token(rotated) == "legacy"
    with pytest.raises(Exception):
        enc.decrypt_token(old_cipher)


def test_missing_chain_raises_helpful_runtime_error(monkeypatch) -> None:
    monkeypatch.setattr(settings, "encryption_key", "")
    monkeypatch.setattr(settings, "encryption_keys", "")
    enc.reset_for_tests()
    with pytest.raises(RuntimeError, match="No encryption key configured"):
        enc.encrypt_token("x")
