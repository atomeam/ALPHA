#!/usr/bin/env python3
"""
Slack RUN Header Reporter v0.1

Posts canonical RUN headers to #ops-runs for CI and agent runs.
Designed for OpenHands/Devin to post artifacts and status updates.

Usage:
  python3 slack_run_reporter.py --type deploy --env staging --owner OpenHands
  python3 slack_run_reporter.py --type migration --env prod --owner "Devin" --result success
  
Environment variables:
  SLACK_BOT_TOKEN   - Slack bot token (xoxb-...)
  SLACK_CHANNEL     - Channel name (default: #ops-runs)

Or use --token and --channel flags directly.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Optional

try:
    import urllib.request
    import urllib.error
except ImportError:
    print("Error: urllib not available", file=sys.stderr)
    sys.exit(1)


def get_env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


def format_duration(start: str, end: Optional[str] = None) -> str:
    """Calculate duration between two ISO timestamps."""
    try:
        start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
        if end:
            end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
        else:
            end_dt = datetime.now(timezone.utc)
        
        delta = end_dt - start_dt
        total_seconds = int(delta.total_seconds())
        
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60
        
        if hours > 0:
            return f"{hours}h{minutes}m{seconds}s"
        elif minutes > 0:
            return f"{minutes}m{seconds}s"
        else:
            return f"{seconds}s"
    except Exception:
        return ""


def build_run_header(
    run_id: str,
    run_type: str,
    env: str,
    owner: str,
    task_id: str = "",
    result: str = "unknown",
    start_time: str = "",
    end_time: str = "",
    duration: str = "",
    commit_pr: str = "",
    artifacts: str = "",
    logs: str = "",
    notes: str = "",
) -> str:
    """Build canonical RUN header message."""
    lines = [
        f"RUN: {run_id}",
        f"TASK: {task_id}" if task_id else "TASK: ",
        f"TYPE: {run_type}",
        f"ENV: {env}",
        f"OWNER: {owner}",
        f"RESULT: {result}",
        f"START: {start_time or datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        f"END: {end_time}" if end_time else "",
        f"DURATION: {duration}" if duration else "",
        f"COMMIT/PR: {commit_pr}" if commit_pr else "",
        f"ARTIFACTS: {artifacts}" if artifacts else "",
        f"LOGS: {logs}" if logs else "",
        f"NOTES: {notes}" if notes else "",
    ]
    # Filter empty lines
    return "\n".join(line for line in lines if line.split(": ", 1)[-1].strip())


def post_to_slack(
    message: str,
    channel: str,
    token: str,
    thread_ts: Optional[str] = None,
) -> Optional[dict]:
    """Post message to Slack via API."""
    url = "https://slack.com/api/chat.postMessage"
    
    data = {
        "channel": channel.lstrip('#'),
        "text": message,
        "unfurl_links": False,
        "mrkdwn": False,  # Use plain text for clean header formatting
    }
    
    if thread_ts:
        data["thread_ts"] = thread_ts
    
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode())
            if result.get("ok"):
                return {
                    "ts": result.get("ts"),
                    "channel": result.get("channel"),
                }
            else:
                print(f"Slack API error: {result.get('error')}", file=sys.stderr)
                return None
    except urllib.error.URLError as e:
        print(f"Failed to post to Slack: {e}", file=sys.stderr)
        return None


def reply_in_thread(
    message: str,
    channel: str,
    token: str,
    thread_ts: str,
) -> Optional[dict]:
    """Post reply in existing thread."""
    return post_to_slack(message, channel, token, thread_ts)


def generate_run_id(run_type: str, slug: str = "") -> str:
    """Generate run ID from timestamp."""
    now = datetime.now(timezone.utc)
    date_part = now.strftime("%Y-%m-%d")
    time_part = now.strftime("%H%M")
    type_part = run_type[:8]  # Truncate type
    slug_part = f"-{slug[:20]}" if slug else ""
    return f"{date_part}-{time_part}-{type_part}{slug_part}"


def main():
    parser = argparse.ArgumentParser(
        description="Post RUN header to Slack",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Post deploy start
  python3 slack_run_reporter.py --type deploy --env staging --owner OpenHands
  
  # Post completion with result
  python3 slack_run_reporter.py --type deploy --env staging --owner OpenHands \\
    --result success --start-time 2026-05-27T18:00:00Z --end-time 2026-05-27T18:06:12Z
  
  # Reply in thread with artifacts
  python3 slack_run_reporter.py --type deploy --env staging --owner OpenHands \\
    --thread-ts 1234567890.123456 --artifacts "https://github.com/org/repo/actions/runs/123"
        """,
    )
    
    # Required
    parser.add_argument("--type", required=True,
                       help="deploy|migration|smoke|incident|build|other")
    parser.add_argument("--env", required=True,
                       help="staging|prod|dev|other")
    parser.add_argument("--owner", required=True,
                       help="Owner/agent name")
    
    # Optional
    parser.add_argument("--token", default=get_env("SLACK_BOT_TOKEN"),
                       help="Slack bot token (or set SLACK_BOT_TOKEN env)")
    parser.add_argument("--channel", default=get_env("SLACK_CHANNEL", "#ops-runs"),
                       help="Slack channel (default: #ops-runs)")
    parser.add_argument("--run-id", help="Custom run ID (auto-generated if not provided)")
    parser.add_argument("--task-id", default="", help="Notion task URL or D1 task ID")
    parser.add_argument("--result", default="unknown",
                       help="success|failed|aborted|unknown (default: unknown)")
    parser.add_argument("--start-time", default="", help="ISO 8601 start time")
    parser.add_argument("--end-time", default="", help="ISO 8601 end time")
    parser.add_argument("--duration", default="", help="Human-readable duration")
    parser.add_argument("--commit-pr", default="", help="Commit SHA or PR URL")
    parser.add_argument("--artifacts", default="", help="Comma-separated artifact links")
    parser.add_argument("--logs", default="", help="Comma-separated log links")
    parser.add_argument("--notes", default="", help="Short notes or bullets")
    parser.add_argument("--thread-ts", default="", help="Parent message ts for threading")
    
    args = parser.parse_args()
    
    # Validate required token
    if not args.token:
        print("Error: SLACK_BOT_TOKEN required (--token or env var)", file=sys.stderr)
        sys.exit(1)
    
    # Generate run ID if not provided
    run_id = args.run_id or generate_run_id(args.type)
    
    # Calculate duration if start_time provided but not duration
    if args.start_time and not args.duration:
        args.duration = format_duration(args.start_time, args.end_time)
    
    # Build and post header
    header = build_run_header(
        run_id=run_id,
        run_type=args.type,
        env=args.env,
        owner=args.owner,
        task_id=args.task_id,
        result=args.result,
        start_time=args.start_time,
        end_time=args.end_time,
        duration=args.duration,
        commit_pr=args.commit_pr,
        artifacts=args.artifacts,
        logs=args.logs,
        notes=args.notes,
    )
    
    print(f"Posting to {args.channel}:")
    print("-" * 40)
    print(header)
    print("-" * 40)
    
    result = post_to_slack(header, args.channel, args.token, args.thread_ts or None)
    
    if result:
        print(f"\n✅ Posted successfully")
        print(f"   Channel: {result['channel']}")
        print(f"   Timestamp: {result['ts']}")
        print(f"\n   For thread replies, use: --thread-ts {result['ts']}")
        return 0
    else:
        print("\n❌ Failed to post", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())