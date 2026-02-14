# QuarterPlan System

Shared quarter planning infrastructure for OmniAura agents.

## Architecture

- *S3 Bucket*: `omniaura-agents` (Backblaze B2, S3-compatible)
- *MCP Server*: QuarterPlan tools for all agents
- *Dashboard*: Astro UI (TODO)
- *Backend*: Go API for webhooks + stats (TODO)

## S3 Structure

```
s3://omniaura-agents/
├── agents/              # Agent workspaces
│   ├── omni-discord/
│   ├── peytonomni/
│   ├── omarzanji/
│   └── nickiomni/
├── quarterplan/         # Shared planning data
│   ├── initiatives.json
│   ├── updates/
│   └── arr-data.json
└── shared/
    ├── docs/
    └── assets/
```

## MCP Server Setup

Add to your MCP config (`~/.config/claude/mcp.json` or equivalent):

```json
{
  "mcpServers": {
    "quarterplan": {
      "command": "bun",
      "args": ["/workspace/group/mcp-quarterplan-server.ts"],
      "env": {
        "S3_ENDPOINT": "s3.us-east-005.backblazeb2.com",
        "S3_BUCKET": "omniaura-agents",
        "S3_ACCESS_KEY_ID": "005f1542e777e830000000008",
        "S3_SECRET_ACCESS_KEY": "K005Uk6sNPsPuROGIVOhrEU/1ae3IYg",
        "S3_REGION": "us-east-005"
      }
    }
  }
}
```

## Available Tools

### `create_initiative`
Create a new initiative in the quarter plan.

```typescript
{
  title: string;
  description: string;
  owner: string;
  target_date?: string;  // ISO format
  tags?: string[];
}
```

### `update_initiative`
Update an existing initiative.

```typescript
{
  id: string;
  status?: 'planning' | 'in-progress' | 'completed' | 'blocked';
  description?: string;
  target_date?: string;
  tags?: string[];
}
```

### `link_pr`
Link a GitHub PR to an initiative.

```typescript
{
  initiative_id: string;
  pr_url: string;  // Full GitHub PR URL
}
```

### `get_quarter_plan`
Get all initiatives (optionally filtered by status).

```typescript
{
  status?: 'planning' | 'in-progress' | 'completed' | 'blocked';
}
```

### `add_update`
Post a progress update to an initiative.

```typescript
{
  initiative_id: string;
  update: string;
  author: string;  // Agent name
}
```

### `update_arr_data` / `get_arr_data`
Update or retrieve ARR/MRR statistics.

```typescript
{
  mrr?: number;
  arr?: number;
  users?: number;
}
```

## Agent Communication

### Write to your workspace
```typescript
import { OmniS3Client } from './s3-client';
const client = new OmniS3Client();

await client.writeToMySpace('status.json', JSON.stringify({ ... }));
```

### Read from another agent
```typescript
const data = await client.readFromAgent('peytonomni', 'report.json');
```

### Shared QuarterPlan access
```typescript
await client.writeQuarterPlan('custom-data.json', JSON.stringify({ ... }));
const initiatives = await client.readQuarterPlan('initiatives.json');
```

## Files

- `s3-client.ts` - S3 wrapper for Backblaze B2
- `setup-s3-structure.ts` - Initialize bucket structure
- `mcp-quarterplan-server.ts` - MCP server implementation
- `.env.s3` - Credentials (git-ignored)

## Next Steps

1. Build Go backend API for:
   - GitHub webhook handler
   - ARR stats integration
   - REST API for dashboard

2. Build Astro dashboard:
   - Real-time initiative view
   - ARR tracking charts
   - Agent activity feed
   - Deploy to `internal.omniaura.ai`

3. GitHub integration:
   - Track PRs across `omniaura/*` and `ditto-assistant/*`
   - Auto-link PRs to initiatives
   - PR status updates

## Public URLs

Bucket is public (read-only). Access files via:
```
https://omniaura-agents.s3.us-east-005.backblazeb2.com/{key}
```

Example:
```
https://omniaura-agents.s3.us-east-005.backblazeb2.com/README.md
https://omniaura-agents.s3.us-east-005.backblazeb2.com/quarterplan/initiatives.json
```
