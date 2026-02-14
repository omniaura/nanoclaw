#!/usr/bin/env python3
"""
Slack Integration for NanoClaw

A standalone Python script using `uv` runtime to interact with Slack.
Provides CLI interface for reading/sending messages, managing threads.

Usage:
    uv run slack.py read --channel C123456 --limit 10
    uv run slack.py send --channel C123456 --text "Hello!"
    uv run slack.py reply --channel C123456 --thread-ts 1234567890.123456 --text "Reply"
    uv run slack.py thread --channel C123456 --thread-ts 1234567890.123456
"""

import os
import sys
import json
import argparse
from typing import Optional
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError


def get_client() -> WebClient:
    """Initialize Slack client with bot token from environment."""
    token = os.getenv("SLACK_BOT_TOKEN")
    if not token:
        print("Error: SLACK_BOT_TOKEN environment variable not set", file=sys.stderr)
        sys.exit(1)
    return WebClient(token=token)


def read_messages(channel: str, limit: int = 10, oldest: Optional[str] = None) -> None:
    """
    Read messages from a Slack channel.

    Args:
        channel: Channel ID (e.g., C123456)
        limit: Number of messages to fetch (default: 10)
        oldest: Only messages after this timestamp
    """
    client = get_client()

    try:
        response = client.conversations_history(
            channel=channel,
            limit=limit,
            oldest=oldest
        )

        messages = response["messages"]

        # Print as JSON for easy parsing by TypeScript
        print(json.dumps({
            "ok": True,
            "messages": messages,
            "has_more": response.get("has_more", False)
        }, indent=2))

    except SlackApiError as e:
        print(json.dumps({
            "ok": False,
            "error": str(e)
        }), file=sys.stderr)
        sys.exit(1)


def send_message(channel: str, text: str, thread_ts: Optional[str] = None) -> None:
    """
    Send a message to a Slack channel.

    Args:
        channel: Channel ID (e.g., C123456)
        text: Message text
        thread_ts: Thread timestamp if replying to a thread
    """
    client = get_client()

    try:
        response = client.chat_postMessage(
            channel=channel,
            text=text,
            thread_ts=thread_ts
        )

        print(json.dumps({
            "ok": True,
            "ts": response["ts"],
            "channel": response["channel"]
        }, indent=2))

    except SlackApiError as e:
        print(json.dumps({
            "ok": False,
            "error": str(e)
        }), file=sys.stderr)
        sys.exit(1)


def read_thread(channel: str, thread_ts: str) -> None:
    """
    Read all messages in a thread.

    Args:
        channel: Channel ID (e.g., C123456)
        thread_ts: Thread timestamp
    """
    client = get_client()

    try:
        response = client.conversations_replies(
            channel=channel,
            ts=thread_ts
        )

        print(json.dumps({
            "ok": True,
            "messages": response["messages"]
        }, indent=2))

    except SlackApiError as e:
        print(json.dumps({
            "ok": False,
            "error": str(e)
        }), file=sys.stderr)
        sys.exit(1)


def list_channels() -> None:
    """List all channels the bot has access to."""
    client = get_client()

    try:
        response = client.conversations_list(
            types="public_channel,private_channel"
        )

        channels = [
            {
                "id": ch["id"],
                "name": ch["name"],
                "is_private": ch.get("is_private", False),
                "is_member": ch.get("is_member", False)
            }
            for ch in response["channels"]
        ]

        print(json.dumps({
            "ok": True,
            "channels": channels
        }, indent=2))

    except SlackApiError as e:
        print(json.dumps({
            "ok": False,
            "error": str(e)
        }), file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Slack integration for NanoClaw",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    # Read command
    read_parser = subparsers.add_parser("read", help="Read messages from a channel")
    read_parser.add_argument("--channel", required=True, help="Channel ID")
    read_parser.add_argument("--limit", type=int, default=10, help="Number of messages")
    read_parser.add_argument("--oldest", help="Oldest timestamp")

    # Send command
    send_parser = subparsers.add_parser("send", help="Send a message to a channel")
    send_parser.add_argument("--channel", required=True, help="Channel ID")
    send_parser.add_argument("--text", required=True, help="Message text")

    # Reply command
    reply_parser = subparsers.add_parser("reply", help="Reply to a thread")
    reply_parser.add_argument("--channel", required=True, help="Channel ID")
    reply_parser.add_argument("--thread-ts", required=True, help="Thread timestamp")
    reply_parser.add_argument("--text", required=True, help="Reply text")

    # Thread command
    thread_parser = subparsers.add_parser("thread", help="Read all messages in a thread")
    thread_parser.add_argument("--channel", required=True, help="Channel ID")
    thread_parser.add_argument("--thread-ts", required=True, help="Thread timestamp")

    # List command
    subparsers.add_parser("list", help="List all channels")

    args = parser.parse_args()

    if args.command == "read":
        read_messages(args.channel, args.limit, args.oldest)
    elif args.command == "send":
        send_message(args.channel, args.text)
    elif args.command == "reply":
        send_message(args.channel, args.text, args.thread_ts)
    elif args.command == "thread":
        read_thread(args.channel, args.thread_ts)
    elif args.command == "list":
        list_channels()


if __name__ == "__main__":
    main()
