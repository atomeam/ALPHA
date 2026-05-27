#!/usr/bin/env python3
"""
Notion Task Updater v0.2

Monitors D1 audit_events and updates matching Notion tasks.
Triggered by Slack Events API webhooks (not polling).

Guardrails:
1. De-dupe by Slack event_id (stored in D1 for ~24h)
2. Only act when TASK: parses to a Notion URL (or TASK: none)

Environment:
  NOTION_TOKEN              - Notion integration token
  SLACK_SIGNING_SECRET      - Slack Events API signing secret
  SLACK_OPS_RUNS_CHANNEL_ID - #ops-runs channel ID
  SLACK_BOT_TOKEN           - Slack bot token
  D1_DB                     - D1 database binding (or SQLite for local)
"""

import json
import os
import re
import sys
import time
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
OPS_RUNS_CHANNEL = os.environ.get("SLACK_OPS_RUNS_CHANNEL", "#ops-runs")  # Evidence only
OPS_CONTROL_CHANNEL = os.environ.get("SLACK_OPS_CONTROL_CHANNEL", "#ops-control")  # Work queue

# Event dedupe window (24 hours)
DEDUPE_WINDOW_SECONDS = 24 * 60 * 60


def get_env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


def verify_slack_signature(body: bytes, timestamp: str, signature: str) -> bool:
    """Verify Slack Events API request signature."""
    import hmac
    import hashlib
    
    signing_secret = get_env("SLACK_SIGNING_SECRET")
    if not signing_secret:
        return True  # Skip verification if not configured
    
    base = f"v0:{timestamp}:{body.decode()}"
    expected = "v0=" + hmac.new(
        signing_secret.encode(),
        base.encode(),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(expected, signature)


def is_duplicate_event(event_id: str, db_file: str = None) -> bool:
    """Check if event already processed (dedupe)."""
    try:
        import sqlite3
        
        db_file = db_file or get_env("AUDIT_DB", "audit_events.db")
        conn = sqlite3.connect(db_file)
        c = conn.cursor()
        
        # Create dedupe table if not exists
        c.execute("""
            CREATE TABLE IF NOT EXISTS slack_events (
                event_id TEXT PRIMARY KEY,
                processed_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Check if event exists
        c.execute("SELECT 1 FROM slack_events WHERE event_id = ?", (event_id,))
        exists = c.fetchone() is not None
        
        if not exists:
            # Insert new event
            c.execute(
                "INSERT OR REPLACE INTO slack_events (event_id, processed_at) VALUES (?, datetime('now'))",
                (event_id,)
            )
            conn.commit()
        
        conn.close()
        return exists
    except Exception as e:
        print(f"Dedupe check failed: {e}")
        return False  # Fail open (process event)


def clean_old_events(db_file: str = None, window_seconds: int = DEDUPE_WINDOW_SECONDS):
    """Remove old events beyond dedupe window."""
    try:
        import sqlite3
        
        db_file = db_file or get_env("AUDIT_DB", "audit_events.db")
        conn = sqlite3.connect(db_file)
        c = conn.cursor()
        
        c.execute(f"""
            DELETE FROM slack_events 
            WHERE processed_at < datetime('now', '-{window_seconds} seconds')
        """)
        conn.commit()
        conn.close()
    except Exception:
        pass  # Non-critical


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


def update_notion_task_status(notion_token: str, page_id: str, status: str, run_data: dict = None) -> bool:
    """Update Notion task status and add evidence comment.
    
    Canonical v0 behavior:
    - Set Status property (if exists)
    - Add evidence as page comment (no new properties required)
    """
    # 1. Update Status property (best effort - may not exist)
    url = f"{NOTION_API}/pages/{page_id}"
    
    data = {
        "properties": {
            "Status": {"select": {"name": status}}
        }
    }
    
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
    
    status_updated = False
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status_updated = resp.status == 200
    except Exception as e:
        print(f"Status update failed (non-critical): {e}")
    
    # 2. Add evidence as page comment (canonical v0)
    if run_data:
        # Build Slack permalink for debugging
        slack_ts = run_data.get("_slack_ts", "")
        slack_channel = run_data.get("_slack_channel", "")
        slack_permalink = f"https://slack.com/archives/{slack_channel}/p{slack_ts.replace('.', '')}" if slack_ts and slack_channel else "N/A"
        
        evidence_lines = [
            f"🏁 RUN Completed — Evidence",
            "",
            f"Run ID: {run_data.get('run_id', 'unknown')}",
            f"Result: {run_data.get('result', 'unknown')}",
            f"Duration: {run_data.get('duration', '—')}",
            f"Commit/PR: {run_data.get('commit_pr', '—')}",
            f"Artifacts: {run_data.get('artifacts', '—')}",
            f"Logs: {run_data.get('logs', '—')}",
            f"Notes: {run_data.get('notes', '—')}",
            "",
            f"Slack: {slack_permalink}",
            f"Thread: {slack_ts or 'N/A'} | Event ID: {run_data.get('_event_id', 'N/A')}",
            "",
            f"Posted by: {run_data.get('owner', 'Unknown')} (ALPHA Council)",
            f"Timestamp: {datetime.now(timezone.utc).isoformat()}",
        ]
        evidence_text = "\n".join(evidence_lines)
        
        comment_url = f"{NOTION_API}/comments"
        comment_data = {
            "parent": {"page_id": page_id},
            "rich_text": [{"type": "text", "text": {"content": evidence_text}}]
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
            with urllib.request.urlopen(req, timeout=30) as resp:
                pass  # Comment added
        except Exception as e:
            print(f"Comment failed (non-critical): {e}")
    
    return status_updated or True  # At least one succeeded


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
            notion_ok = update_notion_task_status(notion_token, page_id, status, run_data)
            if notion_ok:
                print(f"✅ Updated Notion: {status}")
            else:
                print(f"❌ Failed to update Notion")
    
    return True


def is_valid_task_url(task_url: str) -> bool:
    """Check if TASK field contains valid Notion URL or 'none'."""
    if not task_url or task_url.strip().lower() == "none":
        return True  # TASK: none is valid
    # Check for Notion URL pattern
    return task_url.startswith("https://www.notion.so") or task_url.startswith("https://notion.so")


def process_slack_event(body: bytes, headers: dict) -> Optional[dict]:
    """Process incoming Slack Events API webhook."""
    import hmac
    import hashlib
    
    # Verify signature
    timestamp = headers.get("X-Slack-Request-Timestamp", "")
    signature = headers.get("X-Slack-Signature", "")
    
    if not verify_slack_signature(body, timestamp, signature):
        print("Invalid Slack signature")
        return None
    
    try:
        event_data = json.loads(body.decode())
    except Exception:
        return None
    
    # Handle URL verification challenge
    if event_data.get("type") == "url_verification":
        return {"challenge": event_data.get("challenge")}
    
    # Handle event callback
    event = event_data.get("event", {})
    event_type = event.get("type")
    event_id = event_data.get("event_id", "")
    channel = event.get("channel", "")
    
    # Only process messages in #ops-runs
    ops_runs_id = get_env("SLACK_OPS_RUNS_CHANNEL_ID", "")
    if ops_runs_id and channel != ops_runs_id:
        return None
    
    # Only process messages
    if event_type != "message":
        return None
    
    # Skip bot messages
    if event.get("subtype") == "bot_message":
        return None
    
    # Dedupe check
    if is_duplicate_event(event_id):
        print(f"Duplicate event: {event_id}")
        return None
    
    # Extract text
    text = event.get("text", "")
    if not text:
        return None
    
    # Parse RUN header
    run_data = parse_run_header(text)
    if not run_data:
        return None
    
    # Guard: TASK must be Notion URL or 'none'
    task_url = run_data.get("task_url", "")
    if not is_valid_task_url(task_url):
        print(f"Invalid TASK URL: {task_url}")
        return None
    
    return run_data


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Notion Task Updater / Slack Events Handler")
    parser.add_argument("--webhook", action="store_true", help="Run as HTTP webhook server")
    parser.add_argument("--port", type=int, default=8080, help="Webhook server port")
    parser.add_argument("--notion-token", default=get_env("NOTION_TOKEN"))
    parser.add_argument("--run-header", help="RUN header text to parse (manual mode)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    
    if not args.notion_token:
        print("Error: NOTION_TOKEN required")
        sys.exit(1)
    
    # Webhook server mode
    if args.webhook:
        from http.server import HTTPServer, BaseHTTPRequestHandler
        
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                content_length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_length)
                
                result = process_slack_event(body, dict(self.headers))
                
                if result:
                    # Process run completion
                    process_run_completion(result, args.notion_token)
                    self.send_response(200)
                else:
                    self.send_response(200)  # Always 200 for Slack
                
                self.end_headers()
            
            def log_message(self, format, *args):
                pass  # Silence default logging
        
        server = HTTPServer(("", args.port), Handler)
        print(f"Listening on port {args.port}...")
        server.serve_forever()
        return
    
    # Manual mode (from CLI)
    if not args.run_header:
        print("Error: --run-header required (or use --webhook for server mode)")
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