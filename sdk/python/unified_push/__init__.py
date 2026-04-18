"""Unified Push — End-to-end encrypted push notification SDK."""

from unified_push.client import UnifiedPushClient
from unified_push.models import Priority

__all__ = ["push", "UnifiedPushClient", "Priority"]

# Convenience function — uses env vars for config
_default_client: UnifiedPushClient | None = None


def push(
    title: str,
    body: str = "",
    *,
    priority: str = "default",
    group: str = "general",
    recipients: list[str] | None = None,
) -> dict:
    """Send an encrypted push notification using environment variable config.

    Environment variables:
        UNIFIED_PUSH_ENDPOINT: API endpoint URL
        UNIFIED_PUSH_TOKEN: API bearer token
        UNIFIED_PUSH_RECIPIENTS: JSON array of {name, public_key} objects
    """
    global _default_client
    if _default_client is None:
        _default_client = UnifiedPushClient.from_env()
    return _default_client.send(title, body, priority=priority, group=group, recipients=recipients)
