/**
 * Daytona IPC Poller for NanoClaw
 * Polls IPC directories on Daytona sandboxes for messages and tasks,
 * analogous to sprites-ipc-poller.ts but using the Daytona SDK.
 *
 * Uses relative paths (resolved from sandbox workdir by the FS API).
 *
 * This is now a thin wrapper around the generic CloudIpcPoller.
 */

import { type Sandbox } from '@daytonaio/sdk';

import { RegisteredGroup } from '../types.js';
import { DaytonaBackend } from './daytona-backend.js';
import {
  CloudFileSystemAdapter,
  CloudGroupResolver,
  startCloudIpcPoller,
} from './cloud-ipc-poller.js';

export interface DaytonaIpcPollerDeps {
  daytonaBackend: DaytonaBackend;
  registeredGroups: () => Record<string, RegisteredGroup>;
  processMessage: (sourceGroup: string, data: any) => Promise<void>;
  processTask: (sourceGroup: string, isMain: boolean, data: any) => Promise<void>;
}

/**
 * Daytona filesystem adapter implementation.
 */
class DaytonaFileSystemAdapter implements CloudFileSystemAdapter {
  constructor(private sandbox: Sandbox) {}

  async listJsonFiles(dirPath: string): Promise<string[]> {
    let entries;
    try {
      entries = await this.sandbox.fs.listFiles(dirPath);
    } catch {
      return []; // Directory doesn't exist yet
    }

    return entries
      .filter((e: any) => !e.isDir && e.name.endsWith('.json'))
      .map((e: any) => e.name);
  }

  async readFile(filePath: string): Promise<string> {
    const buf = await this.sandbox.fs.downloadFile(filePath);
    return buf.toString('utf-8');
  }

  async deleteFile(filePath: string): Promise<void> {
    await this.sandbox.fs.deleteFile(filePath);
  }
}

/**
 * Daytona group resolver implementation.
 */
class DaytonaGroupResolver implements CloudGroupResolver {
  constructor(private daytonaBackend: DaytonaBackend) {}

  getAdapter(group: RegisteredGroup): CloudFileSystemAdapter | null {
    const sandbox = this.daytonaBackend.getSandboxForGroup(group.folder);
    if (!sandbox) return null; // Sandbox not started yet

    return new DaytonaFileSystemAdapter(sandbox);
  }

  getIdentifier(group: RegisteredGroup): string {
    return group.folder;
  }
}

/**
 * Start polling Daytona-backed groups for IPC output.
 * Reads workspace/ipc/messages/ and workspace/ipc/tasks/ via Daytona SDK filesystem.
 */
export function startDaytonaIpcPoller(deps: DaytonaIpcPollerDeps): void {
  startCloudIpcPoller({
    backendType: 'daytona',
    registeredGroups: deps.registeredGroups,
    groupResolver: new DaytonaGroupResolver(deps.daytonaBackend),
    processMessage: deps.processMessage,
    processTask: deps.processTask,
    messagesPath: 'workspace/ipc/messages', // Relative path for Daytona
    tasksPath: 'workspace/ipc/tasks',       // Relative path for Daytona
  });
}
