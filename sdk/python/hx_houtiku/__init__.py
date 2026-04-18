"""HX-HouTiKu — End-to-end encrypted push notification SDK."""

from hx_houtiku.client import HxHoutikuClient
from hx_houtiku.models import Priority

__all__ = ["push", "HxHoutikuClient", "Priority"]

# Convenience function — uses env vars for config
_default_client: HxHoutikuClient | None = None


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
        HX_HOUTIKU_ENDPOINT: API endpoint URL
        HX_HOUTIKU_TOKEN: API bearer token
        HX_HOUTIKU_RECIPIENTS: JSON array of {name, public_key} objects
    """
    global _default_client
    if _default_client is None:
        _default_client = HxHoutikuClient.from_env()
    return _default_client.send(title, body, priority=priority, group=group, recipients=recipients)
