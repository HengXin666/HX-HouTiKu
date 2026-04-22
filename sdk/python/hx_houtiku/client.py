"""HX-HouTiKu client — encrypts and sends messages."""

from __future__ import annotations

import time
import uuid
from pathlib import Path

import httpx

from hx_houtiku.config import Config
from hx_houtiku.crypto import encrypt_for_recipient
from hx_houtiku.models import ContentType, Message, Priority, Recipient

# Default TTL for recipient public key cache (1 hour)
_CACHE_TTL = 3600.0

# Retry config
_MAX_RETRIES = 3
_RETRY_BASE = 1.0  # 1 second base for exponential backoff
_RETRY_STATUSES = {502, 503, 504, 429}


class HxHoutikuClient:
    """Client for sending encrypted push notifications.

    Features:
    - Public key caching with configurable TTL (default: 1 hour)
    - Automatic retry with exponential backoff for transient failures
    - Batch sending support
    - Channel and group_key support
    """

    def __init__(
        self,
        endpoint: str,
        api_token: str,
        recipients: list[dict | Recipient] | None = None,
        *,
        timeout: float = 30.0,
        auto_fetch_recipients: bool = True,
        cache_ttl: float = _CACHE_TTL,
        max_retries: int = _MAX_RETRIES,
    ) -> None:
        self.endpoint = endpoint.rstrip("/")
        self.api_token = api_token
        self.timeout = timeout
        self._auto_fetch = auto_fetch_recipients
        self._cache_ttl = cache_ttl
        self._max_retries = max_retries

        self._recipients: list[Recipient] = []
        self._cache_time: float = 0.0

        for r in recipients or []:
            if isinstance(r, dict):
                self._recipients.append(Recipient(name=r["name"], public_key=r["public_key"]))
            else:
                self._recipients.append(r)

        if self._recipients:
            self._cache_time = time.monotonic()

        self._http = httpx.Client(
            base_url=self.endpoint,
            headers={"Authorization": f"Bearer {self.api_token}"},
            timeout=timeout,
        )

    @property
    def recipients(self) -> list[Recipient]:
        """Active recipients. Auto-fetches from API if cache expired or empty."""
        if self._is_cache_expired():
            self.fetch_recipients()
        return self._recipients

    def _is_cache_expired(self) -> bool:
        if not self._recipients and self._auto_fetch:
            return True
        if self._cache_ttl > 0 and self._recipients:
            return (time.monotonic() - self._cache_time) > self._cache_ttl
        return False

    @classmethod
    def from_env(cls) -> HxHoutikuClient:
        """Create client from environment variables."""
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
        """Fetch active recipients from the Worker API. Updates cache."""
        resp = self._request_with_retry("GET", "/api/recipients")
        data = resp.json()

        self._recipients = [
            Recipient(name=r["name"], public_key=r["public_key"])
            for r in data.get("recipients", [])
            if r.get("is_active", True)
        ]
        self._cache_time = time.monotonic()
        return self._recipients

    def send(
        self,
        title: str,
        body: str = "",
        *,
        priority: str = "default",
        content_type: str = "markdown",
        group: str = "general",
        channel_id: str = "default",
        group_key: str = "",
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
            channel_id: Channel identifier (default: "default").
            group_key: Key for grouping related messages (e.g. CI build number).
            recipients: List of recipient names. None = all active recipients.
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

        # Encrypt once with the first recipient's key — all devices share the same key
        first = target_recipients[0]
        encrypted = encrypt_for_recipient(first.public_key, plaintext)

        payload = {
            "id": str(uuid.uuid4()),
            "encrypted_payloads": {first.name: encrypted},
            "priority": priority,
            "content_type": content_type,
            "group": group,
            "channel_id": channel_id,
            "group_key": group_key,
            "timestamp": int(time.time() * 1000),
        }

        resp = self._request_with_retry("POST", "/api/push", json=payload)
        return resp.json()

    def send_batch(
        self,
        messages: list[dict],
        *,
        channel_id: str = "default",
        group_key: str = "",
        recipients: list[str] | None = None,
    ) -> list[dict]:
        """Send multiple messages in sequence.

        Each item in messages should have keys: title, body, priority, content_type, group, tags.

        Returns:
            List of API response dicts, one per message.
        """
        results = []
        for msg in messages:
            result = self.send(
                title=msg["title"],
                body=msg.get("body", ""),
                priority=msg.get("priority", "default"),
                content_type=msg.get("content_type", "markdown"),
                group=msg.get("group", "general"),
                channel_id=channel_id,
                group_key=group_key,
                recipients=recipients,
                tags=msg.get("tags"),
            )
            results.append(result)
        return results

    def invalidate_cache(self) -> None:
        """Force the next property access to re-fetch recipients from API."""
        self._cache_time = 0.0

    def _resolve_recipients(self, names: list[str] | None) -> list[Recipient]:
        all_recipients = self.recipients
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

    def _request_with_retry(
        self,
        method: str,
        path: str,
        **kwargs: object,
    ) -> httpx.Response:
        """Execute an HTTP request with exponential backoff retry."""
        last_err: Exception | None = None

        for attempt in range(self._max_retries + 1):
            try:
                resp = self._http.request(method, path, **kwargs)

                if resp.status_code in _RETRY_STATUSES and attempt < self._max_retries:
                    delay = _RETRY_BASE * (2**attempt)
                    # Honor Retry-After header if present
                    retry_after = resp.headers.get("Retry-After")
                    if retry_after:
                        try:
                            delay = max(delay, float(retry_after))
                        except ValueError:
                            pass
                    time.sleep(delay)
                    continue

                resp.raise_for_status()
                return resp

            except (httpx.ConnectError, httpx.ReadTimeout) as e:
                last_err = e
                if attempt < self._max_retries:
                    time.sleep(_RETRY_BASE * (2**attempt))
                    continue
                raise

        raise last_err  # type: ignore[misc]

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> HxHoutikuClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()
