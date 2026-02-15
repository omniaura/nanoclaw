#!/usr/bin/env bun
/**
 * Backup QuarterPlan Kanban State
 * Creates timestamped backups of quarterplan data to S3
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

async function backupQuarterPlan() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  console.log(`🔄 Starting QuarterPlan backup (${timestamp})...`);
  
  // Files to backup
  const files = [
    'quarterplan/initiatives.json',
    'quarterplan/arr-data.json'
  ];
  
  const backupResults = [];
  
  for (const file of files) {
    try {
      // Read current data
      const getResponse = await s3.send(new GetObjectCommand({
        Bucket: BUCKET,
        Key: file
      }));
      
      const data = await getResponse.Body?.transformToString();
      
      if (!data) {
        console.warn(`⚠️  ${file} is empty, skipping...`);
        continue;
      }
      
      // Write backup with timestamp
      const backupKey = `quarterplan/backups/${timestamp}/${file.split('/').pop()}`;
      
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: backupKey,
        Body: data,
        ContentType: 'application/json',
        Metadata: {
          'original-key': file,
          'backup-timestamp': timestamp
        }
      }));
      
      backupResults.push({
        original: file,
        backup: backupKey,
        size: Buffer.byteLength(data, 'utf8')
      });
      
      console.log(`✅ Backed up ${file} → ${backupKey} (${backupResults[backupResults.length - 1].size} bytes)`);
      
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        console.warn(`⚠️  ${file} does not exist yet, skipping...`);
      } else {
        console.error(`❌ Error backing up ${file}:`, error.message);
      }
    }
  }
  
  // List all backups
  console.log('\n📦 Checking all backups...');
  try {
    const listResponse = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: 'quarterplan/backups/'
    }));
    
    const backups = listResponse.Contents || [];
    console.log(`Found ${backups.length} backup file(s) in S3`);
    
    // Group by timestamp
    const byTimestamp = new Map<string, any[]>();
    for (const backup of backups) {
      const parts = backup.Key!.split('/');
      const ts = parts[2]; // quarterplan/backups/{timestamp}/file.json
      if (!byTimestamp.has(ts)) {
        byTimestamp.set(ts, []);
      }
      byTimestamp.get(ts)!.push(backup);
    }
    
    console.log(`\nBackup timestamps (${byTimestamp.size} total):`);
    const sortedTimestamps = Array.from(byTimestamp.keys()).sort().reverse();
    for (const ts of sortedTimestamps.slice(0, 10)) {
      const files = byTimestamp.get(ts)!;
      const totalSize = files.reduce((sum, f) => sum + (f.Size || 0), 0);
      console.log(`  • ${ts}: ${files.length} file(s), ${totalSize} bytes`);
    }
    
  } catch (error: any) {
    console.error(`❌ Error listing backups:`, error.message);
  }
  
  console.log(`\n✅ Backup complete! Created ${backupResults.length} backup(s)`);
  return backupResults;
}

// Run backup
backupQuarterPlan().catch(console.error);
