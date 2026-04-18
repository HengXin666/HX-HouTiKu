"""Data models for HX-HouTiKu SDK."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Priority(str, Enum):
    URGENT = "urgent"
    HIGH = "high"
    DEFAULT = "default"
    LOW = "low"
    DEBUG = "debug"


@dataclass
class Recipient:
    name: str
    public_key: str  # hex-encoded ECIES public key


@dataclass
class Message:
    title: str
    body: str = ""
    priority: Priority = Priority.DEFAULT
    group: str = "general"
    tags: list[str] = field(default_factory=list)

    def to_plaintext(self) -> str:
        """Serialize message to plaintext for encryption."""
        import json

        return json.dumps(
            {
                "title": self.title,
                "body": self.body,
                "tags": self.tags,
            },
            ensure_ascii=False,
        )
