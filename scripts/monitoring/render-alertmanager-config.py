#!/usr/bin/env python3
"""Render Alertmanager routing without exposing optional credentials."""

import argparse
import json
import os
import tempfile
from pathlib import Path
from urllib.parse import urlparse


def render_config() -> str:
    url = os.environ.get("TNL_ALERTMANAGER_WEBHOOK_URL", "").strip()
    token_file = os.environ.get("TNL_ALERTMANAGER_BEARER_TOKEN_FILE", "").strip()

    receiver = "  - name: no_delivery_configured\n"
    route_receiver = "no_delivery_configured"
    if token_file and not url:
        raise ValueError("A bearer token file requires a configured webhook URL.")
    if url:
        parsed = urlparse(url)
        if parsed.scheme != "https" or not parsed.netloc or any(char in url for char in "\r\n"):
            raise ValueError("Webhook URL must be a valid HTTPS URL.")
        if token_file and not Path(token_file).is_absolute():
            raise ValueError("Bearer token file path must be absolute.")
        route_receiver = "operator_webhook"
        authorization = ""
        if token_file:
            authorization = (
                "        http_config:\n"
                "          authorization:\n"
                "            type: Bearer\n"
                f"            credentials_file: {json.dumps(token_file)}\n"
            )
        receiver = (
            "  - name: operator_webhook\n"
            "    webhook_configs:\n"
            f"      - url: {json.dumps(url)}\n"
            "        send_resolved: true\n"
            f"{authorization}"
        )

    return (
        "global:\n"
        "  resolve_timeout: 5m\n\n"
        "route:\n"
        f"  receiver: {route_receiver}\n"
        "  group_by: [alertname, instance]\n"
        "  group_wait: 30s\n"
        "  group_interval: 5m\n"
        "  repeat_interval: 4h\n\n"
        "receivers:\n"
        f"{receiver}"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        content = render_config()
    except ValueError as error:
        print(f"Invalid Alertmanager environment: {error}")
        return 2

    args.output.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix="alertmanager-", dir=args.output.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            output.write(content)
        os.chmod(temporary, 0o640)
        os.replace(temporary, args.output)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

    print("Alertmanager route rendered; webhook delivery is configured." if os.environ.get("TNL_ALERTMANAGER_WEBHOOK_URL") else "Alertmanager route rendered with no delivery configured.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
