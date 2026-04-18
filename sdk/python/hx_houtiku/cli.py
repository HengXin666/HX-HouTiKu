"""CLI interface for sending push notifications."""

from __future__ import annotations

import argparse
import sys


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="hx-houtiku",
        description="Send encrypted push notifications from the command line",
    )
    parser.add_argument("title", help="Message title")
    parser.add_argument("--body", "-b", default="", help="Message body (Markdown supported)")
    parser.add_argument(
        "--priority",
        "-p",
        choices=["urgent", "high", "default", "low", "debug"],
        default="default",
        help="Message priority (default: default)",
    )
    parser.add_argument("--group", "-g", default="general", help="Message group (default: general)")
    parser.add_argument(
        "--recipients",
        "-r",
        nargs="*",
        help="Recipient names (default: all configured recipients)",
    )
    parser.add_argument("--config", "-c", help="Path to config file (YAML/JSON)")

    args = parser.parse_args()

    try:
        if args.config:
            from hx_houtiku.client import HxHoutikuClient

            client = HxHoutikuClient.from_config(args.config)
            result = client.send(
                args.title,
                args.body,
                priority=args.priority,
                group=args.group,
                recipients=args.recipients,
            )
            client.close()
        else:
            from hx_houtiku import push

            result = push(
                args.title,
                args.body,
                priority=args.priority,
                group=args.group,
                recipients=args.recipients,
            )

        print(f"✅ Sent: {result}")
    except Exception as e:
        print(f"❌ Failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
