"""Configuration loading from env vars, YAML, or JSON files."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

from hx_houtiku.models import Recipient


@dataclass
class Config:
    endpoint: str
    api_token: str
    recipients: list[Recipient] = field(default_factory=list)
    default_priority: str = "default"
    default_group: str = "general"

    @classmethod
    def from_env(cls) -> Config:
        """Load config from environment variables.

        HX_HOUTIKU_RECIPIENTS is optional — if omitted, the client
        will automatically fetch recipients from the Worker API.
        """
        endpoint = os.environ.get("HX_HOUTIKU_ENDPOINT")
        if not endpoint:
            raise ValueError("HX_HOUTIKU_ENDPOINT environment variable is required")

        token = os.environ.get("HX_HOUTIKU_TOKEN")
        if not token:
            raise ValueError("HX_HOUTIKU_TOKEN environment variable is required")

        recipients_json = os.environ.get("HX_HOUTIKU_RECIPIENTS", "[]")
        raw_recipients = json.loads(recipients_json)
        recipients = [Recipient(name=r["name"], public_key=r["public_key"]) for r in raw_recipients]

        return cls(endpoint=endpoint, api_token=token, recipients=recipients)

    @classmethod
    def from_file(cls, path: str | Path) -> Config:
        """Load config from YAML or JSON file."""
        path = Path(path).expanduser()
        text = path.read_text(encoding="utf-8")

        if path.suffix in (".yaml", ".yml"):
            import yaml

            data = yaml.safe_load(text)
        else:
            data = json.loads(text)

        recipients = [
            Recipient(name=r["name"], public_key=r["public_key"])
            for r in data.get("recipients", [])
        ]

        return cls(
            endpoint=data["endpoint"],
            api_token=data["api_token"],
            recipients=recipients,
            default_priority=data.get("defaults", {}).get("priority", "default"),
            default_group=data.get("defaults", {}).get("group", "general"),
        )
