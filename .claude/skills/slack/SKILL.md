# Slack Integration Skill

This skill provides Slack integration using a Python script with `uv` runtime.

## What This Skill Does

- Read Slack threads and messages
- Send messages to Slack channels
- Post replies to threads
- Fetch channel history
- Standalone Python implementation (no TypeScript modifications needed)

## Usage

All Slack operations are handled through `slack.py` using `uv`:

```bash
# Read messages from a channel
uv run slack.py read --channel C123456 --limit 10

# Send a message to a channel
uv run slack.py send --channel C123456 --text "Hello from NanoClaw!"

# Reply to a thread
uv run slack.py reply --channel C123456 --thread-ts 1234567890.123456 --text "Reply text"

# Fetch thread messages
uv run slack.py thread --channel C123456 --thread-ts 1234567890.123456
```

## Setup

1. Create a Slack app at https://api.slack.com/apps
2. Add the following Bot Token Scopes:
   - `channels:history` - Read public channel messages
   - `channels:read` - List public channels
   - `chat:write` - Send messages
   - `groups:history` - Read private channel messages
   - `groups:read` - List private channels
   - `im:history` - Read DM history
   - `im:read` - List DMs
   - `mpim:history` - Read group DM history
   - `mpim:read` - List group DMs

3. Install the app to your workspace
4. Copy the Bot User OAuth Token
5. Set environment variable:
   ```bash
   export SLACK_BOT_TOKEN="xoxb-your-token-here"
   ```

## Python Dependencies

The script uses `uv` for Python runtime management. Dependencies are managed in `pyproject.toml`:

```toml
[project]
name = "nanoclaw-slack"
version = "0.1.0"
dependencies = [
    "slack-sdk>=3.27.0",
]
```

## Integration with NanoClaw

This skill can be invoked from NanoClaw agents to:
- Monitor Slack channels for mentions
- Post agent responses back to Slack
- Enable cross-platform communication (WhatsApp ↔ Slack)

Example NanoClaw integration:
```typescript
// Call from TypeScript
const { stdout } = await $`uv run .claude/skills/slack/slack.py send --channel ${channelId} --text ${message}`;
```

## Architecture

Unlike the PR #5 approach (TypeScript integration), this skill:
- ✅ No modifications to NanoClaw core codebase
- ✅ Standalone Python script using `uv` runtime
- ✅ Simple CLI interface for easy testing
- ✅ Can be invoked from any NanoClaw agent or skill
- ✅ Easier to maintain and debug

## Files

- `SKILL.md` - This documentation
- `slack.py` - Main Python script for Slack operations
- `pyproject.toml` - Python dependencies configuration
