/**
 * Sprites IPC Poller for NanoClaw
 * Polls IPC directories on remote Sprites for messages and tasks,
 * analogous to the local filesystem polling in ipc.ts.
 *
 * This is now a thin wrapper around the generic CloudIpcPoller.
 */

import { logger } from '../logger.js';
import { RegisteredGroup } from '../types.js';
import { SpritesBackend } from './sprites-backend.js';
import {
  CloudFileSystemAdapter,
  CloudGroupResolver,
  startCloudIpcPoller,
} from './cloud-ipc-poller.js';

const API_BASE = 'https://api.sprites.dev/v1';

export interface SpritesIpcPollerDeps {
  spritesBackend: SpritesBackend;
  registeredGroups: () => Record<string, RegisteredGroup>;
  /** Process an IPC message file's contents */
  processMessage: (sourceGroup: string, data: any) => Promise<void>;
  /** Process an IPC task file's contents */
  processTask: (sourceGroup: string, isMain: boolean, data: any) => Promise<void>;
}

/**
 * Sprites filesystem adapter implementation.
 */
class SpritesFileSystemAdapter implements CloudFileSystemAdapter {
  constructor(
    private token: string,
    private spriteName: string,
  ) {}

  async listJsonFiles(dirPath: string): Promise<string[]> {
    const listResp = await fetch(
      `${API_BASE}/sprites/${this.spriteName}/fs/list?path=${encodeURIComponent(dirPath)}`,
      { headers: { 'Authorization': `Bearer ${this.token}` } },
    );

    if (!listResp.ok) {
      if (listResp.status === 404) return []; // Directory doesn't exist yet
      throw new Error(`List failed: ${listResp.status}`);
    }

    const body = await listResp.json() as { entries: Array<{ name: string; type: string }> | null };
    const entries = body.entries || [];
    return entries
      .filter((e) => e.type === 'file' && e.name.endsWith('.json'))
      .map((e) => e.name);
  }

  async readFile(filePath: string): Promise<string> {
    const readResp = await fetch(
      `${API_BASE}/sprites/${this.spriteName}/fs/read?path=${encodeURIComponent(filePath)}`,
      { headers: { 'Authorization': `Bearer ${this.token}` } },
    );

    if (!readResp.ok) {
      throw new Error(`Read failed: ${readResp.status}`);
    }

    return await readResp.text();
  }

  async deleteFile(filePath: string): Promise<void> {
    await fetch(`${API_BASE}/sprites/${this.spriteName}/fs/delete`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: filePath }),
    });
  }
}

/**
 * Sprites group resolver implementation.
 */
class SpritesGroupResolver implements CloudGroupResolver {
  constructor(private token: string | undefined) {}

  getAdapter(group: RegisteredGroup): CloudFileSystemAdapter | null {
    if (!this.token) return null;

    const spriteName = `nanoclaw-${group.folder.replace(/[^a-zA-Z0-9-]/g, '-')}`;
    return new SpritesFileSystemAdapter(this.token, spriteName);
  }

  getIdentifier(group: RegisteredGroup): string {
    return `nanoclaw-${group.folder.replace(/[^a-zA-Z0-9-]/g, '-')}`;
  }
}

/**
 * Start polling Sprites-backed groups for IPC output.
 * Reads /workspace/ipc/messages/ and /workspace/ipc/tasks/ via filesystem API.
 */
export function startSpritesIpcPoller(deps: SpritesIpcPollerDeps): void {
  const token = process.env.SPRITES_TOKEN;
  if (!token) {
    logger.debug('SPRITES_TOKEN not set, skipping Sprites IPC poller');
    return;
  }

  startCloudIpcPoller({
    backendType: 'sprites',
    registeredGroups: deps.registeredGroups,
    groupResolver: new SpritesGroupResolver(token),
    processMessage: deps.processMessage,
    processTask: deps.processTask,
    messagesPath: '/workspace/ipc/messages',
    tasksPath: '/workspace/ipc/tasks',
  });
}
