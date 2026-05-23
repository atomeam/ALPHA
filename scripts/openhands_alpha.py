#!/usr/bin/env python3
"""
OpenHands Cloud API client for Alpha self-improvement loop.

Usage:
    # Check account
    python scripts/openhands_alpha.py whoami

    # Start an improvement cycle
    python scripts/openhands_alpha.py improve --objective alpha_objectives.md

    # Check conversation status
    python scripts/openhands_alpha.py status <conversation_id>
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
import time
from typing import Any

BASE_URL = "https://app.all-hands.dev"
API_KEY = os.environ.get("OPENHANDS_CLOUD_API_KEY") or os.environ.get("OPENHANDS_API_KEY", "")


def api_request(method: str, path: str, data: dict | None = None) -> dict[str, Any]:
    """Make an authenticated API request to OpenHands Cloud."""
    url = f"{BASE_URL}{path}"
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }
    body = json.dumps(data).encode() if data else None

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else ""
        raise RuntimeError(f"API error {e.code}: {error_body}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Network error: {e}") from e


def read_file(path: str) -> str:
    """Read a file from the local filesystem."""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def cmd_whoami() -> int:
    """Print current user info."""
    result = api_request("GET", "/api/v1/users/me")
    print(json.dumps(result, indent=2))
    return 0


def cmd_search(limit: int = 5) -> int:
    """Search recent conversations."""
    result = api_request("GET", f"/api/v1/app-conversations/search?limit={limit}")
    items = result.get("items", [])
    if not items:
        print("No recent conversations found.")
        return 0
    for item in items:
        status = item.get("execution_status", "unknown")
        title = item.get("title", "Untitled")
        conv_id = item.get("id", item.get("app_conversation_id", "unknown"))
        print(f"[{status}] {title} — {conv_id}")
    return 0


def cmd_start(objective_file: str | None, repo: str = "atomeam/ALPHA", branch: str = "main") -> int:
    """
    Start an OpenHands conversation to run an improvement cycle.

    Reads alpha_objectives.md (or a custom file) and uses it as context for the agent.
    """
    objective_content = ""
    if objective_file:
        objective_content = read_file(objective_file)
    else:
        default_path = os.path.join(os.getcwd(), "alpha_objectives.md")
        if os.path.exists(default_path):
            objective_content = read_file(default_path)

    initial_message = f"""You are Alpha's self-improvement agent. Run an improvement cycle against the ALPHA codebase.

## Your objectives (from alpha_objectives.md):
{objective_content or "(No objectives file found. Focus on general code quality improvements.)"}

## Instructions:
1. Read the current metrics from the backend if available (GET /api/metrics)
2. Identify areas for improvement based on the objectives
3. Make focused, minimal changes that address the objectives
4. Run tests to validate changes
5. Open a PR with a summary of changes, why they improve the objective, and a rollback plan
6. Do NOT modify: packages/permissions/src/grant-types.ts, apps/bridge/, or any auth/billing code

Repository: {repo}
Branch: {branch}
"""

    payload = {
        "initial_message": {
            "content": [{"type": "text", "text": initial_message}]
        },
        "selected_repository": repo,
        "selected_branch": branch,
        "title": "Alpha self-improvement cycle",
    }

    print("Starting improvement cycle...")
    result = api_request("POST", "/api/v1/app-conversations", payload)

    # Handle async start
    start_task_id = result.get("id")
    app_conversation_id = result.get("app_conversation_id")

    if not app_conversation_id and start_task_id:
        print(f"Waiting for conversation to start (task: {start_task_id})...")
        max_attempts = 30
        for i in range(max_attempts):
            time.sleep(2)
            task_result = api_request("GET", f"/api/v1/app-conversations/start-tasks?ids={start_task_id}")
            if task_result.get("status") == "READY":
                app_conversation_id = task_result.get("app_conversation_id")
                break

    if not app_conversation_id:
        print("Failed to get conversation ID. Response:")
        print(json.dumps(result, indent=2))
        return 1

    conv_url = f"{BASE_URL}/conversations/{app_conversation_id}"
    print(f"\n✓ Conversation started")
    print(f"  URL: {conv_url}")
    print(f"  ID: {app_conversation_id}")
    return 0


def cmd_status(conversation_id: str) -> int:
    """Get conversation status and recent events."""
    result = api_request("GET", f"/api/v1/app-conversations?ids={conversation_id}")
    items = result.get("items", [])
    if not items:
        print(f"Conversation not found: {conversation_id}")
        return 1

    conv = items[0]
    print(f"Status: {conv.get('execution_status', 'unknown')}")
    print(f"Sandbox: {conv.get('sandbox_status', 'unknown')}")
    print(f"Title: {conv.get('title', 'Untitled')}")

    # Get recent events
    events_result = api_request(
        "GET",
        f"/api/v1/conversation/{conversation_id}/events/search?limit=10"
    )
    events = events_result.get("items", [])
    if events:
        print("\nRecent events:")
        for event in events[-5:]:
            kind = event.get("kind", "unknown")
            source = event.get("source", "")
            print(f"  [{kind}] {source}")
    return 0


def cmd_dispatch_automation(automation_id: str) -> int:
    """Manually dispatch an automation run."""
    result = api_request("POST", f"/api/automation/v1/{automation_id}/dispatch")
    run_id = result.get("id", "unknown")
    print(f"✓ Automation dispatched")
    print(f"  Run ID: {run_id}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="OpenHands Cloud client for Alpha")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("whoami", help="Show current user info")
    search_parser = sub.add_parser("search", help="Search recent conversations")
    search_parser.add_argument("--limit", "-n", type=int, default=5)

    start_parser = sub.add_parser("start", help="Start an improvement cycle")
    start_parser.add_argument("--objective", help="Path to objectives file")
    start_parser.add_argument("--repo", default="atomeam/ALPHA")
    start_parser.add_argument("--branch", default="main")

    status_parser = sub.add_parser("status", help="Check conversation status")
    status_parser.add_argument("conversation_id", help="Conversation ID")

    dispatch_parser = sub.add_parser("dispatch", help="Dispatch an automation")
    dispatch_parser.add_argument("automation_id", help="Automation ID")

    args = parser.parse_args()

    if not API_KEY:
        print("Error: OPENHANDS_CLOUD_API_KEY not set", file=sys.stderr)
        return 1

    match args.command:
        case "whoami":
            return cmd_whoami()
        case "search":
            return cmd_search(args.limit)
        case "start":
            return cmd_start(args.objective, args.repo, args.branch)
        case "status":
            return cmd_status(args.conversation_id)
        case "dispatch":
            return cmd_dispatch_automation(args.automation_id)
        case _:
            parser.print_help()
            return 1


if __name__ == "__main__":
    sys.exit(main())