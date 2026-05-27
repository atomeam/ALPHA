#!/usr/bin/env python3
"""
Notion Task Intake Agent v0.2

Recurring automation that:
1. Queries Notion Todo List for P0/P1 Council tasks
2. Generates work instructions with deliverable format
3. Posts to Slack #ops-control (work queue channel)

NOT to #ops-runs — that channel is for RUN evidence only.
Intake messages would pollute the evidence stream.

Environment:
  NOTION_TOKEN              - Notion integration token
  SLACK_BOT_TOKEN           - Slack bot token
  SLACK_OPS_CONTROL_CHANNEL - Control channel (default: #ops-control)
"""

import json
import os
import sys
from datetime import datetime, timezone
from typing import Optional

try:
    import urllib.request
    import urllib.error
except ImportError:
    print("Error: urllib not available")
    sys.exit(1)


NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"

# Channel separation (canonical)
OPS_CONTROL_CHANNEL = os.environ.get("SLACK_OPS_CONTROL_CHANNEL", "#ops-control")  # Work queue
OPS_RUNS_CHANNEL = os.environ.get("SLACK_OPS_RUNS_CHANNEL", "#ops-runs")  # Evidence only


def get_env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


def notion_search_tasks(token: str, query: str = "") -> Optional[list]:
    """Search Notion for tasks matching query."""
    url = f"{NOTION_API}/search"
    data = {
        "query": query or "Todo List",
        "page_size": 10,
        "filter": {"property": "object", "value": "database"}
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json"
        },
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
            return result.get("results", [])
    except Exception as e:
        print(f"Notion search failed: {e}")
        return None


def notion_query_database(token: str, db_id: str, filter_props: dict = None) -> Optional[list]:
    """Query a Notion database with filters."""
    url = f"{NOTION_API}/databases/{db_id}/query"
    
    # Default filter: Status != Done, Priority in (P0, P1), Owner = Council
    body = {
        "filter": {
            "and": [
                {"property": "Status", "select": {"does_not_equal": "Done"}},
                {"property": "Priority", "select": {"in": ["P0", "P1"]}},
                {"property": "Owner", "select": {"equals": "Council"}}
            ]
        },
        "sorts": [{"property": "Priority", "direction": "ascending"}],
        "page_size": 3
    }
    
    if filter_props:
        body["filter"] = filter_props
    
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json"
        },
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
            return result.get("results", [])
    except Exception as e:
        print(f"Notion query failed: {e}")
        return None


def notion_get_page_props(page_id: str, token: str) -> Optional[dict]:
    """Get properties of a Notion page."""
    url = f"{NOTION_API}/pages/{page_id}"
    
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Notion-Version": NOTION_VERSION
        }
    )
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"Notion get page failed: {e}")
        return None


def extract_task_info(page: dict) -> dict:
    """Extract relevant task info from Notion page."""
    props = page.get("properties", {})
    
    # Extract common property types
    def get_title(props, key):
        val = props.get(key, {})
        return val.get("title", [{}])[0].get("plain_text", "") or val.get("name", {}).get("title", [{}])[0].get("plain_text", "")
    
    def get_select(props, key):
        return props.get(key, {}).get("select", {}).get("name", "")
    
    def get_url(props, key):
        return props.get(key, {}).get("url", "") or props.get(key, {}).get("rich_text", [{}])[0].get("plain_text", "")
    
    return {
        "id": page.get("id", ""),
        "url": page.get("url", ""),
        "title": get_title(props, "Name") or get_title(props, "Title"),
        "status": get_select(props, "Status"),
        "priority": get_select(props, "Priority"),
        "owner": get_select(props, "Owner"),
        "task_type": get_select(props, "Type"),
    }


def post_to_slack(message: str, channel: str, token: str) -> Optional[dict]:
    """Post message to Slack."""
    url = "https://slack.com/api/chat.postMessage"
    
    data = {
        "channel": channel.lstrip("#"),
        "text": message,
        "unfurl_links": False
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
            if result.get("ok"):
                return {"ts": result.get("ts"), "channel": result.get("channel")}
            return None
    except Exception as e:
        print(f"Slack post failed: {e}")
        return None


def build_work_instruction(task: dict) -> str:
    """Build a work instruction message for a task."""
    lines = [
        f"📋 *WORK QUEUE* — From Notion Todo List",
        f"",
        f"*Task:* {task.get('title', 'Unknown')}",
        f"*Priority:* {task.get('priority', 'Unknown')}",
        f"*Owner:* {task.get('owner', 'Council')}",
        f"*URL:* {task.get('url', '')}",
        f"",
        f"*Deliverable Format:*",
        f"```",
        f"RUN: <run_id>",
        f"TASK: {task.get('url', '')}",
        f"TYPE: <deploy|migration|smoke|build|other>",
        f"ENV: <staging|prod|dev>",
        f"OWNER: <name>",
        f"RESULT: success|failed",
        f"ARTIFACTS: <links>",
        f"LOGS: <links>",
        f"NOTES: <evidence summary>",
        f"```",
        f"",
        f"*Post to:* #ops-runs (evidence stream)",
        f"",
        f"*Definition of Done:*",
        f"• PR created with implementation",
        f"• RUN header posted to #ops-runs",
        f"• Notion task status updated to Done",
    ]
    return "\n".join(lines)


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Notion Task Intake Agent")
    parser.add_argument("--dry-run", action="store_true", help="Print output without posting")
    parser.add_argument("--notion-token", default=get_env("NOTION_TOKEN"))
    parser.add_argument("--slack-token", default=get_env("SLACK_BOT_TOKEN"))
    parser.add_argument("--slack-channel", default=get_env("SLACK_CHANNEL", "#ops-runs"))
    parser.add_argument("--db-id", help="Notion database ID (auto-detect if not provided)")
    args = parser.parse_args()
    
    # Validate credentials
    if not args.notion_token:
        print("Error: NOTION_TOKEN required (--notion-token or env)")
        sys.exit(1)
    if not args.slack_token and not args.dry_run:
        print("Error: SLACK_BOT_TOKEN required for posting")
        sys.exit(1)
    
    print(f"🔍 Querying Notion for P0/P1 Council tasks...")
    
    # Find Todo List database
    databases = notion_search_tasks(args.notion_token, "Todo List")
    if not databases:
        print("Warning: Could not find Todo List database")
        databases = []
    
    # Query tasks from first matching database
    tasks = []
    for db in databases:
        db_id = db.get("id")
        if db_id:
            results = notion_query_database(args.notion_token, db_id)
            if results:
                tasks.extend([extract_task_info(r) for r in results])
                break
    
    if not tasks:
        print("No pending P0/P1 Council tasks found")
        if args.dry_run:
            print("Dry run complete - no tasks to post")
        return 0
    
    print(f"📋 Found {len(tasks)} pending tasks")
    
    if args.dry_run:
        print("\n--- DRY RUN OUTPUT ---")
        for task in tasks:
            print(build_work_instruction(task))
            print("---")
        return 0
    
    # Post each task as separate message
    for task in tasks:
        msg = build_work_instruction(task)
        result = post_to_slack(msg, args.slack_channel, args.slack_token)
        if result:
            print(f"✅ Posted: {task.get('title', 'Unknown')[:50]}...")
        else:
            print(f"❌ Failed: {task.get('title', 'Unknown')[:50]}...")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())