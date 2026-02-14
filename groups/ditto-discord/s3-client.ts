#!/usr/bin/env bun
/**
 * S3 Client for OmniAura Shared Bucket
 * Backblaze B2 compatible S3 interface
 */

import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load credentials from .env.s3
const envPath = join(import.meta.dir, '.env.s3');
const envContent = readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.+)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

// Configure S3 client for Backblaze B2
const s3 = new S3Client({
  endpoint: `https://${env.S3_ENDPOINT}`,
  region: env.S3_REGION || 'us-east-005',
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
  // Backblaze B2 specific settings
  forcePathStyle: false, // B2 uses virtual-hosted-style
  tls: true,
});

const BUCKET = env.S3_BUCKET;
const AGENT_ID = 'omni-discord'; // This agent's identifier

export class OmniS3Client {
  /**
   * Upload a file to the shared bucket
   */
  async upload(key: string, content: string | Buffer, contentType = 'application/octet-stream') {
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: content,
      ContentType: contentType,
    });
    await s3.send(command);
    console.log(`✓ Uploaded: s3://${BUCKET}/${key}`);
  }

  /**
   * Download a file from the shared bucket
   */
  async download(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });
    const response = await s3.send(command);
    const content = await response.Body?.transformToString();
    if (!content) throw new Error(`Empty response for ${key}`);
    return content;
  }

  /**
   * List files in a prefix
   */
  async list(prefix: string): Promise<string[]> {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
    });
    const response = await s3.send(command);
    return (response.Contents || []).map(obj => obj.Key!);
  }

  /**
   * Delete a file
   */
  async delete(key: string) {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });
    await s3.send(command);
    console.log(`✓ Deleted: s3://${BUCKET}/${key}`);
  }

  /**
   * Write to this agent's workspace
   */
  async writeToMySpace(filename: string, content: string | Buffer, contentType?: string) {
    await this.upload(`agents/${AGENT_ID}/${filename}`, content, contentType);
  }

  /**
   * Read from another agent's workspace
   */
  async readFromAgent(agentId: string, filename: string): Promise<string> {
    return this.download(`agents/${agentId}/${filename}`);
  }

  /**
   * Write to shared quarterplan data
   */
  async writeQuarterPlan(filename: string, content: string | Buffer) {
    await this.upload(`quarterplan/${filename}`, content, 'application/json');
  }

  /**
   * Read quarterplan data
   */
  async readQuarterPlan(filename: string): Promise<string> {
    return this.download(`quarterplan/${filename}`);
  }
}

// CLI interface for testing
if (import.meta.main) {
  const client = new OmniS3Client();
  const [action, ...args] = process.argv.slice(2);

  switch (action) {
    case 'test':
      // Test connectivity
      await client.upload('agents/omni-discord/test.txt', `Test from omni-discord at ${new Date().toISOString()}`, 'text/plain');
      console.log('✓ S3 connection successful!');
      break;

    case 'upload':
      await client.upload(args[0], args[1]);
      break;

    case 'download':
      console.log(await client.download(args[0]));
      break;

    case 'list':
      const files = await client.list(args[0] || '');
      console.log(files.join('\n'));
      break;

    default:
      console.log('Usage: bun s3-client.ts [test|upload|download|list] [args...]');
  }
}
