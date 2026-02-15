#!/usr/bin/env bun
/**
 * Restore QuarterPlan Kanban State from Backup
 * Restores quarterplan data from a specific backup timestamp
 */

import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

// Validate required environment variables
const requiredEnvVars = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'];
for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    console.error(`Error: Required environment variable ${varName} is not set`);
    console.error('\nPlease set the following environment variables:');
    console.error('  S3_ENDPOINT (e.g., https://s3.us-east-005.backblazeb2.com)');
    console.error('  S3_BUCKET (e.g., omniaura-agents)');
    console.error('  S3_ACCESS_KEY_ID');
    console.error('  S3_SECRET_ACCESS_KEY');
    process.exit(1);
  }
}

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "us-east-005",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
  }
});

const BUCKET = process.env.S3_BUCKET;

async function listBackups() {
  const listResponse = await s3.send(new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: 'quarterplan/backups/'
  }));
  
  const backups = listResponse.Contents || [];
  const byTimestamp = new Map<string, any[]>();
  
  for (const backup of backups) {
    const parts = backup.Key!.split('/');
    const ts = parts[2]; // quarterplan/backups/{timestamp}/file.json
    if (!byTimestamp.has(ts)) {
      byTimestamp.set(ts, []);
    }
    byTimestamp.get(ts)!.push(backup);
  }
  
  return Array.from(byTimestamp.keys()).sort().reverse();
}

async function restoreBackup(timestamp: string, dryRun: boolean = false) {
  console.log(`🔄 Restoring QuarterPlan from backup: ${timestamp}`);
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }
  
  const files = [
    { backup: `quarterplan/backups/${timestamp}/initiatives.json`, target: 'quarterplan/initiatives.json' },
    { backup: `quarterplan/backups/${timestamp}/arr-data.json`, target: 'quarterplan/arr-data.json' }
  ];
  
  for (const { backup, target } of files) {
    try {
      const getResponse = await s3.send(new GetObjectCommand({
        Bucket: BUCKET,
        Key: backup
      }));
      
      const data = await getResponse.Body?.transformToString();
      
      if (!data) {
        console.warn(`⚠️  ${backup} is empty, skipping...`);
        continue;
      }
      
      if (!dryRun) {
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET,
          Key: target,
          Body: data,
          ContentType: 'application/json'
        }));
        console.log(`✅ Restored ${backup} → ${target}`);
      } else {
        console.log(`📋 Would restore ${backup} → ${target} (${Buffer.byteLength(data, 'utf8')} bytes)`);
      }
      
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        console.warn(`⚠️  ${backup} does not exist, skipping...`);
      } else {
        console.error(`❌ Error restoring ${backup}:`, error.message);
      }
    }
  }
  
  if (!dryRun) {
    console.log(`\n✅ Restore complete!`);
  }
}

// CLI usage
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--list') {
  console.log('📦 Available backups:\n');
  const backups = await listBackups();
  backups.forEach((ts, idx) => {
    console.log(`  ${idx + 1}. ${ts}`);
  });
  console.log(`\nUsage: bun restore-quarterplan.ts <timestamp> [--dry-run]`);
  console.log(`Example: bun restore-quarterplan.ts ${backups[0]}`);
} else {
  const timestamp = args[0];
  const dryRun = args.includes('--dry-run');
  await restoreBackup(timestamp, dryRun);
}
