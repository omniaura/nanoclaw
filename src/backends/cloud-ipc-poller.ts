/**
 * Generic Cloud IPC Poller for NanoClaw
 *
 * Consolidates duplicate polling logic from:
 * - sprites-ipc-poller.ts
 * - daytona-ipc-poller.ts
 * - s3/ipc-poller.ts
 *
 * All three had ~80% identical code for:
 * - Polling loop structure
 * - Group filtering by backend type
 * - JSON parsing + error handling
 * - Message/task processing flow
 *
 * This generic implementation uses a backend adapter pattern to handle
 * the differences in filesystem operations between cloud providers.
 */

import { IPC_POLL_INTERVAL } from '../config.js';
import { logger } from '../logger.js';
import { RegisteredGroup } from '../types.js';

/**
 * Backend adapter interface for cloud filesystem operations.
 * Each backend (Sprites, Daytona, S3) implements this interface
 * to provide their specific file access methods.
 */
export interface CloudFileSystemAdapter {
  /**
   * List JSON files in a directory.
   * @returns Array of filenames (not full paths)
   */
  listJsonFiles(dirPath: string): Promise<string[]>;

  /**
   * Read a file's contents as a string.
   * @param filePath Full path to the file
   * @returns File contents as UTF-8 string
   */
  readFile(filePath: string): Promise<string>;

  /**
   * Delete a file after successful processing.
   * @param filePath Full path to the file to delete
   */
  deleteFile(filePath: string): Promise<void>;
}

/**
 * Group resolver interface - provides group information for polling.
 */
export interface CloudGroupResolver {
  /**
   * Get the filesystem adapter for this group.
   * Returns null if the group's backend isn't initialized yet.
   */
  getAdapter(group: RegisteredGroup): CloudFileSystemAdapter | null;

  /**
   * Get a human-readable identifier for logging (e.g., sprite name, sandbox ID).
   */
  getIdentifier(group: RegisteredGroup): string;
}

/**
 * Dependencies for the generic cloud IPC poller.
 */
export interface CloudIpcPollerDeps {
  /** Backend type to filter groups by (e.g., 'sprites', 'daytona') */
  backendType: string;

  /** Get all registered groups */
  registeredGroups: () => Record<string, RegisteredGroup>;

  /** Resolve group to filesystem adapter */
  groupResolver: CloudGroupResolver;

  /** Process an IPC message file's contents */
  processMessage: (sourceGroup: string, data: any) => Promise<void>;

  /** Process an IPC task file's contents */
  processTask: (sourceGroup: string, isMain: boolean, data: any) => Promise<void>;

  /** Base path for messages directory (e.g., '/workspace/ipc/messages', 'workspace/ipc/messages') */
  messagesPath: string;

  /** Base path for tasks directory (e.g., '/workspace/ipc/tasks', 'workspace/ipc/tasks') */
  tasksPath: string;
}

let pollerRunning = false;

/**
 * Start a generic cloud IPC poller.
 *
 * This function replaces the individual startSpritesIpcPoller, startDaytonaIpcPoller,
 * and startS3IpcPoller functions with a single, configurable implementation.
 *
 * @param deps Configuration and dependencies for the poller
 */
export function startCloudIpcPoller(deps: CloudIpcPollerDeps): void {
  if (pollerRunning) return;
  pollerRunning = true;

  const poll = async () => {
    const groups = deps.registeredGroups();

    // Find groups using this backend type
    const backendGroups = Object.entries(groups).filter(
      ([, g]) => g.backend === deps.backendType,
    );

    if (backendGroups.length === 0) {
      setTimeout(poll, IPC_POLL_INTERVAL);
      return;
    }

    for (const [jid, group] of backendGroups) {
      const adapter = deps.groupResolver.getAdapter(group);
      if (!adapter) {
        // Backend not initialized yet (e.g., sandbox not started)
        continue;
      }

      const identifier = deps.groupResolver.getIdentifier(group);
      const isMain = group.folder === 'main';

      try {
        // Process message files
        await pollDirectory(
          adapter,
          deps.messagesPath,
          identifier,
          async (filename, content) => {
            const data = JSON.parse(content);
            await deps.processMessage(group.folder, data);
          },
        );

        // Process task files
        await pollDirectory(
          adapter,
          deps.tasksPath,
          identifier,
          async (filename, content) => {
            const data = JSON.parse(content);
            await deps.processTask(group.folder, isMain, data);
          },
        );
      } catch (err) {
        // Only warn on non-404 errors (backend may be hibernating or not ready)
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('404') && !msg.includes('not found') && !msg.includes('NoSuchKey')) {
          logger.warn(
            { group: group.folder, identifier, error: msg },
            `Error polling ${deps.backendType} IPC`,
          );
        }
      }
    }

    setTimeout(poll, IPC_POLL_INTERVAL);
  };

  poll();
  logger.info(`${deps.backendType} IPC poller started`);
}

/**
 * Stop the poller (for testing).
 */
export function stopCloudIpcPoller(): void {
  pollerRunning = false;
}

/**
 * List JSON files in a remote directory, process each one, then delete it.
 *
 * This is the core polling logic that all backends share.
 */
async function pollDirectory(
  adapter: CloudFileSystemAdapter,
  dirPath: string,
  identifier: string,
  handler: (filename: string, content: string) => Promise<void>,
): Promise<void> {
  // List JSON files in the directory
  let jsonFiles: string[];
  try {
    jsonFiles = await adapter.listJsonFiles(dirPath);
  } catch {
    // Directory doesn't exist yet or backend not ready
    return;
  }

  // Process each file
  for (const filename of jsonFiles) {
    const filePath = `${dirPath}/${filename}`;

    try {
      // Read file contents
      const content = await adapter.readFile(filePath);

      // Process it with the provided handler
      await handler(filename, content);

      // Delete after successful processing
      await adapter.deleteFile(filePath);
    } catch (err) {
      logger.warn(
        { identifier, file: filePath, error: err },
        'Error processing cloud IPC file',
      );
    }
  }
}
