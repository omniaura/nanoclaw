# QuarterPlan MCP Server

MCP server for managing quarter planning initiatives and ARR tracking via S3.

## Purpose

Real-time visibility into what's shipping, tied to growth/revenue metrics.

## Tools

- `create_initiative` - Create new shipping goals
- `update_initiative` - Update status/details
- `link_pr` - Link GitHub PRs to initiatives
- `get_quarter_plan` - View all initiatives (filterable)
- `add_update` - Post progress updates
- `update_arr_data` / `get_arr_data` - Track revenue metrics

## Configuration

Add to MCP config (`~/.config/claude/mcp.json`):

```json
{
  "mcpServers": {
    "quarterplan": {
      "command": "bun",
      "args": ["container/mcp-servers/quarterplan/server.ts"],
      "env": {
        "S3_ENDPOINT": "s3.us-east-005.backblazeb2.com",
        "S3_BUCKET": "omniaura-agents",
        "S3_ACCESS_KEY_ID": "your_key_id",
        "S3_SECRET_ACCESS_KEY": "your_secret_key",
        "S3_REGION": "us-east-005"
      }
    }
  }
}
```

## S3 Structure

```
s3://omniaura-agents/
├── quarterplan/
│   ├── initiatives.json  # All initiatives
│   ├── arr-data.json     # Growth metrics
│   └── updates/          # Progress updates
```

## Dashboard

Separate Astro dashboard: https://github.com/omniaura/quarterplan-dashboard
