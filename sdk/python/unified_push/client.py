"""Unified Push client — encrypts and sends messages."""

from __future__ import annotations

import time
import uuid
from pathlib import Path

import httpx

from unified_push.config import Config
from unified_push.crypto import encrypt_for_recipient
from unified_push.models import Message, Priority, Recipient


class UnifiedPushClient:
    """Client for sending encrypted push notifications."""

    def __init__(
        self,
        endpoint: str,
        api_token: str,
        recipients: list[dict | Recipient] | None = None,
        *,
        timeout: float = 30.0,
    ) -> None:
        self.endpoint = endpoint.rstrip("/")
        self.api_token = api_token
        self.timeout = timeout

        self.recipients: list[Recipient] = []
        for r in recipients or []:
            if isinstance(r, dict):
                self.recipients.append(Recipient(name=r["name"], public_key=r["public_key"]))
            else:
                self.recipients.append(r)

        self._http = httpx.Client(
            base_url=self.endpoint,
            headers={"Authorization": f"Bearer {self.api_token}"},
            timeout=timeout,
        )

    @classmethod
    def from_env(cls) -> UnifiedPushClient:
        """Create client from environment variables."""
        config = Config.from_env()
        return cls(
            endpoint=config.endpoint,
            api_token=config.api_token,
            recipients=config.recipients,
        )

    @classmethod
    def from_config(cls, path: str | Path) -> UnifiedPushClient:
        """Create client from YAML/JSON config file."""
        config = Config.from_file(path)
        return cls(
            endpoint=config.endpoint,
            api_token=config.api_token,
            recipients=config.recipients,
        )

    def send(
        self,
        title: str,
        body: str = "",
        *,
        priority: str = "default",
        group: str = "general",
        recipients: list[str] | None = None,
        tags: list[str] | None = None,
    ) -> dict:
        """Encrypt and send a push notification.

        Args:
            title: Message title.
            body: Message body (supports Markdown).
            priority: One of: urgent, high, default, low, debug.
            group: Group/category name.
            recipients: List of recipient names to send to. None = all.
            tags: Optional tags for the message.

        Returns:
            API response dict.
        """
        message = Message(
            title=title,
            body=body,
            priority=Priority(priority),
            group=group,
            tags=tags or [],
        )

        plaintext = message.to_plaintext()
        target_recipients = self._resolve_recipients(recipients)

        encrypted_payloads: dict[str, str] = {}
        for recipient in target_recipients:
            encrypted_payloads[recipient.name] = encrypt_for_recipient(
                recipient.public_key, plaintext
            )

        payload = {
            "id": str(uuid.uuid4()),
            "recipients": [r.name for r in target_recipients],
            "encrypted_payloads": encrypted_payloads,
            "priority": priority,
            "group": group,
            "timestamp": int(time.time() * 1000),
        }

        resp = self._http.post("/api/push", json=payload)
        resp.raise_for_status()
        return resp.json()

    def _resolve_recipients(self, names: list[str] | None) -> list[Recipient]:
        if not names:
            return self.recipients
        name_set = set(names)
        matched = [r for r in self.recipients if r.name in name_set]
        missing = name_set - {r.name for r in matched}
        if missing:
            raise ValueError(f"Unknown recipients: {missing}")
        return matched

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> UnifiedPushClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()
