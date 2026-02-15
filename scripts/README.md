# QuarterPlan Backup Scripts

Automated backup and restore utilities for the QuarterPlan kanban state.

## Scripts

### `backup-quarterplan.ts`
Creates timestamped backups of quarterplan data to S3.

**Usage:**
```bash
bun scripts/backup-quarterplan.ts
```

**What it backs up:**
- `quarterplan/initiatives.json` - All initiatives and their state
- `quarterplan/arr-data.json` - ARR/MRR statistics

**Backup location:**
- S3: `quarterplan/backups/{timestamp}/`
- Example: `quarterplan/backups/2026-02-14T23-57-38-025Z/initiatives.json`

### `restore-quarterplan.ts`
Restores quarterplan data from a timestamped backup.

**Usage:**
```bash
# List available backups
bun scripts/restore-quarterplan.ts --list

# Dry-run restore (preview only, no changes)
bun scripts/restore-quarterplan.ts 2026-02-14T23-57-38-025Z --dry-run

# Actual restore
bun scripts/restore-quarterplan.ts 2026-02-14T23-57-38-025Z
```

## Automated Backups

The NanoClaw heartbeat automatically runs backups every 6 hours via scheduled task:

```typescript
schedule_task({
  prompt: "Run quarterplan backup script",
  schedule_type: "cron",
  schedule_value: "0 */6 * * *"  // Every 6 hours
})
```

## S3 Configuration

The scripts require the following environment variables to be set:

```bash
export S3_ENDPOINT="https://s3.us-east-005.backblazeb2.com"
export S3_BUCKET="omniaura-agents"
export S3_ACCESS_KEY_ID="your-access-key-id"
export S3_SECRET_ACCESS_KEY="your-secret-access-key"
export S3_REGION="us-east-005"  # Optional, defaults to us-east-005
```

**For NanoClaw agents**, these are automatically available from the container environment.

**For local testing**, add them to your shell profile or create a `.env` file:

```bash
# .env (DO NOT commit this file!)
S3_ENDPOINT=https://s3.us-east-005.backblazeb2.com
S3_BUCKET=omniaura-agents
S3_ACCESS_KEY_ID=your-key-here
S3_SECRET_ACCESS_KEY=your-secret-here
```

Then load them before running scripts:
```bash
source .env
bun scripts/backup-quarterplan.ts
```

## Recovery Scenarios

### Accidental deletion
```bash
# Find the most recent backup
bun scripts/restore-quarterplan.ts --list

# Restore it
bun scripts/restore-quarterplan.ts <most-recent-timestamp>
```

### Corrupted data
```bash
# Dry-run to verify backup is good
bun scripts/restore-quarterplan.ts <timestamp> --dry-run

# Restore
bun scripts/restore-quarterplan.ts <timestamp>
```

### Rollback to earlier state
```bash
# List all backups to find the right timestamp
bun scripts/restore-quarterplan.ts --list

# Restore from that point in time
bun scripts/restore-quarterplan.ts <desired-timestamp>
```

## Benefits

- 🛡️ **Protection against data loss** - Automatic backups every 6 hours
- 📜 **Historical snapshots** - Keep track of quarterplan evolution
- 🔄 **Point-in-time recovery** - Restore from any backup timestamp
- ⚡ **On-demand backups** - Run manual backups anytime
- 🔍 **Dry-run mode** - Preview restores before applying them
