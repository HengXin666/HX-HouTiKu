"""HX-HouTiKu — End-to-end encrypted push notification SDK."""

from hx_houtiku.client import HxHoutikuClient
from hx_houtiku.models import ContentType, Priority

__all__ = ["push", "HxHoutikuClient", "Priority", "ContentType"]

# Convenience function — uses env vars for config
_default_client: HxHoutikuClient | None = None


def push(
    title: str,
    body: str = "",
    *,
    priority: str = "default",
    content_type: str = "markdown",
    group: str = "general",
    channel_id: str = "default",
    group_key: str = "",
    recipients: list[str] | None = None,
) -> dict:
    """Send an encrypted push notification using environment variable config.

    Environment variables:
        HX_HOUTIKU_ENDPOINT: API endpoint URL (required)
        HX_HOUTIKU_TOKEN: API bearer token (required)
        HX_HOUTIKU_RECIPIENTS: JSON array of {name, public_key} objects (optional,
            auto-fetched from Worker API if omitted)
    """
    global _default_client
    if _default_client is None:
        _default_client = HxHoutikuClient.from_env()
    return _default_client.send(
        title,
        body,
        priority=priority,
        content_type=content_type,
        group=group,
        channel_id=channel_id,
        group_key=group_key,
        recipients=recipients,
    )
