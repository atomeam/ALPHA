#!/usr/bin/env python3
"""
Notion Task Updater v0.1

Monitors D1 audit_events and updates matching Notion tasks.
Run as automation trigger or cron job.

Triggered by:
- D1 INSERT into audit_events
- Slack message with RUN RESULT posted
- Manual invocation

Environment:
  NOTION_TOKEN      - Notion integration token
  D1_DB             - D1 database binding (for Workers) or direct SQLite
  SLACK_BOT_TOKEN   - Slack bot token (for reading threads)
  SLACK_CHANNEL     - Channel to monitor (default: #ops-runs)
"""

import json
import os
import re
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


def get_env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


def parse_run_header(text: str) -> Optional[dict]:
    """Parse a RUN header from Slack message text."""
    # Extract fields from RUN header format
    fields = {}
    
    patterns = {
        "run_id": r"RUN:\s*(.+)",
        "task_url": r"TASK:\s*(https?://[^\s]+|[\w-]+)",
        "run_type": r"TYPE:\s*(\w+)",
        "env": r"ENV:\s*(\w+)",
        "owner": r"OWNER:\s*(.+)",
        "result": r"RESULT:\s*(\w+)",
        "start": r"START:\s*(.+)",
        "end": r"END:\s*(.+)",
        "duration": r"DURATION:\s*(.+)",
        "commit_pr": r"COMMIT/PR:\s*(https?://[^\s]+|[\w-]+)",
        "artifacts": r"ARTIFACTS:\s*(.+)",
        "logs": r"LOGS:\s*(.+)",
        "notes": r"NOTES:\s*(.+)"
    }
    
    for key, pattern in patterns.items():
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            fields[key] = match.group(1).strip()
    
    return fields if fields else None


def find_notion_page_by_url(notion_token: str, url: str) -> Optional[str]:
    """Find Notion page by URL."""
    # Extract page ID from URL
    # Notion URLs: https://www.notion.so/Owner/Page-Title-pageid or https://www.notion.so/pageid
    match = re.search(r"([a-f0-9]{32}|[a-f0-9]{28})(?:\?|$)", url)
    if not match:
        return None
    
    page_id = match.group(1)
    return page_id


def update_notion_task_status(notion_token: str, page_id: str, status: str, notes: str = "") -> bool:
    """Update Notion task status."""
    url = f"{NOTION_API}/pages/{page_id}"
    
    data = {
        "properties": {
            "Status": {"select": {"name": status}}
        }
    }
    
    if notes:
        # Add as comment
        comment_url = f"{NOTION_API}/comments"
        comment_data = {
            "parent": {"page_id": page_id},
            "rich_text": [{"type": "text", "text": {"content": notes}}]
        }
        req = urllib.request.Request(
            comment_url,
            data=json.dumps(comment_data).encode(),
            headers={
                "Authorization": f"Bearer {notion_token}",
                "Notion-Version": NOTION_VERSION,
                "Content-Type": "application/json"
            },
            method="POST"
        )
        try:
            urllib.request.urlopen(req, timeout=30)
        except Exception:
            pass  # Comment optional
    
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode(),
        headers={
            "Authorization": f"Bearer {notion_token}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json"
        },
        method="PATCH"
    )
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status == 200
    except Exception as e:
        print(f"Failed to update Notion page: {e}")
        return False


def record_run_to_d1(run_data: dict, db_path: str = None) -> bool:
    """Record run to D1/SQLite."""
    # For Cloudflare Workers, this would use the D1 binding
    # For local testing, uses SQLite
    try:
        import sqlite3
        
        db_file = db_path or get_env("AUDIT_DB", "audit_events.db")
        conn = sqlite3.connect(db_file)
        c = conn.cursor()
        
        c.execute("""
            CREATE TABLE IF NOT EXISTS audit_events (
                run_id TEXT PRIMARY KEY,
                task_url TEXT,
                run_type TEXT,
                env TEXT,
                owner TEXT,
                result TEXT,
                start_time TEXT,
                end_time TEXT,
                duration TEXT,
                commit_pr TEXT,
                artifacts TEXT,
                logs TEXT,
                notes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        c.execute("""
            INSERT INTO audit_events (run_id, task_url, run_type, env, owner, result, start_time, end_time, duration, commit_pr, artifacts, logs, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                result = excluded.result,
                end_time = excluded.end_time,
                duration = excluded.duration,
                artifacts = excluded.artifacts,
                logs = excluded.logs,
                notes = excluded.notes
        """, (
            run_data.get("run_id"),
            run_data.get("task_url"),
            run_data.get("run_type"),
            run_data.get("env"),
            run_data.get("owner"),
            run_data.get("result"),
            run_data.get("start"),
            run_data.get("end"),
            run_data.get("duration"),
            run_data.get("commit_pr"),
            run_data.get("artifacts"),
            run_data.get("logs"),
            run_data.get("notes"),
        ))
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Failed to record to D1: {e}")
        return False


def process_run_completion(run_data: dict, notion_token: str) -> bool:
    """Process a completed run: update D1 and Notion."""
    
    # 1. Record to D1
    d1_ok = record_run_to_d1(run_data)
    if not d1_ok:
        print("Warning: Failed to record to D1")
    
    # 2. Update Notion task if TASK URL present
    task_url = run_data.get("task_url", "")
    if task_url and task_url.startswith("http"):
        page_id = find_notion_page_by_url(notion_token, task_url)
        if page_id:
            status = "Done" if run_data.get("result") == "success" else "In Progress"
            notes = f"Run completed: {run_data.get('result', 'unknown')}"
            if run_data.get("duration"):
                notes += f" ({run_data.get('duration')})"
            if run_data.get("artifacts"):
                notes += f"\nArtifacts: {run_data.get('artifacts')}"
            
            notion_ok = update_notion_task_status(notion_token, page_id, status, notes)
            if notion_ok:
                print(f"✅ Updated Notion: {status}")
            else:
                print(f"❌ Failed to update Notion")
    
    return True


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Notion Task Updater")
    parser.add_argument("--run-header", help="RUN header text to parse")
    parser.add_argument("--notion-token", default=get_env("NOTION_TOKEN"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    
    if not args.notion_token:
        print("Error: NOTION_TOKEN required")
        sys.exit(1)
    
    if not args.run_header:
        print("Error: --run-header required")
        sys.exit(1)
    
    run_data = parse_run_header(args.run_header)
    if not run_data:
        print("Error: Could not parse RUN header")
        sys.exit(1)
    
    print(f"Parsed RUN: {run_data.get('run_id', 'unknown')}")
    print(f"Result: {run_data.get('result', 'unknown')}")
    print(f"Task: {run_data.get('task_url', 'none')}")
    
    if args.dry_run:
        print("\nDry run - not updating Notion or D1")
        return 0
    
    process_run_completion(run_data, args.notion_token)
    print("✅ Run completion processed")
    return 0


if __name__ == "__main__":
    sys.exit(main())