"""HX-HouTiKu client — encrypts and sends messages."""

from __future__ import annotations

import time
import uuid
from pathlib import Path

import httpx

from hx_houtiku.config import Config
from hx_houtiku.crypto import encrypt_for_recipient
from hx_houtiku.models import ContentType, Message, Priority, Recipient


class HxHoutikuClient:
    """Client for sending encrypted push notifications.

    Recipients can be:
    - Configured locally (via constructor / env / config file)
    - Fetched automatically from the Worker API (if not configured)
    - Mixed: local config as fallback, explicit fetch to refresh
    """

    def __init__(
        self,
        endpoint: str,
        api_token: str,
        recipients: list[dict | Recipient] | None = None,
        *,
        timeout: float = 30.0,
        auto_fetch_recipients: bool = True,
    ) -> None:
        self.endpoint = endpoint.rstrip("/")
        self.api_token = api_token
        self.timeout = timeout
        self._auto_fetch = auto_fetch_recipients

        self._recipients: list[Recipient] = []
        for r in recipients or []:
            if isinstance(r, dict):
                self._recipients.append(Recipient(name=r["name"], public_key=r["public_key"]))
            else:
                self._recipients.append(r)

        self._http = httpx.Client(
            base_url=self.endpoint,
            headers={"Authorization": f"Bearer {self.api_token}"},
            timeout=timeout,
        )

    @property
    def recipients(self) -> list[Recipient]:
        """Active recipients. Auto-fetches from API if none configured."""
        if not self._recipients and self._auto_fetch:
            self.fetch_recipients()
        return self._recipients

    @classmethod
    def from_env(cls) -> HxHoutikuClient:
        """Create client from environment variables.

        Recipients are optional — if HX_HOUTIKU_RECIPIENTS is not set,
        they will be fetched automatically from the Worker API.
        """
        config = Config.from_env()
        return cls(
            endpoint=config.endpoint,
            api_token=config.api_token,
            recipients=config.recipients or None,
        )

    @classmethod
    def from_config(cls, path: str | Path) -> HxHoutikuClient:
        """Create client from YAML/JSON config file."""
        config = Config.from_file(path)
        return cls(
            endpoint=config.endpoint,
            api_token=config.api_token,
            recipients=config.recipients or None,
        )

    def fetch_recipients(self) -> list[Recipient]:
        """Fetch active recipients from the Worker API.

        Updates the local recipient list and returns it.
        Call this to refresh after adding/removing devices.
        """
        resp = self._http.get("/api/recipients")
        resp.raise_for_status()
        data = resp.json()

        self._recipients = [
            Recipient(name=r["name"], public_key=r["public_key"])
            for r in data.get("recipients", [])
            if r.get("is_active", True)
        ]
        return self._recipients

    def send(
        self,
        title: str,
        body: str = "",
        *,
        priority: str = "default",
        content_type: str = "markdown",
        group: str = "general",
        recipients: list[str] | None = None,
        tags: list[str] | None = None,
    ) -> dict:
        """Encrypt and send a push notification.

        Args:
            title: Message title.
            body: Message body.
            priority: One of: urgent, high, default, low, debug.
            content_type: One of: text, markdown, html, json.
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
            content_type=ContentType(content_type),
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
            "content_type": content_type,
            "group": group,
            "timestamp": int(time.time() * 1000),
        }

        resp = self._http.post("/api/push", json=payload)
        resp.raise_for_status()
        return resp.json()

    def _resolve_recipients(self, names: list[str] | None) -> list[Recipient]:
        all_recipients = self.recipients  # triggers auto-fetch if empty
        if not all_recipients:
            raise ValueError(
                "No recipients available. "
                "Either configure them locally or register devices at the Worker first."
            )
        if not names:
            return all_recipients
        name_set = set(names)
        matched = [r for r in all_recipients if r.name in name_set]
        missing = name_set - {r.name for r in matched}
        if missing:
            raise ValueError(f"Unknown recipients: {missing}")
        return matched

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> HxHoutikuClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()
