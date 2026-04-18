"""ECIES encryption utilities wrapping eciespy."""

from __future__ import annotations

import base64

from ecies import encrypt as ecies_encrypt


def encrypt_for_recipient(public_key_hex: str, plaintext: str) -> str:
    """Encrypt plaintext using recipient's public key (ECIES).

    Args:
        public_key_hex: Recipient's secp256k1 public key in hex format.
        plaintext: UTF-8 plaintext to encrypt.

    Returns:
        Base64-encoded ciphertext containing:
        ephemeral_pk + iv + ciphertext + auth_tag
    """
    public_key_bytes = bytes.fromhex(public_key_hex)
    plaintext_bytes = plaintext.encode("utf-8")
    ciphertext = ecies_encrypt(public_key_bytes, plaintext_bytes)
    return base64.b64encode(ciphertext).decode("ascii")
