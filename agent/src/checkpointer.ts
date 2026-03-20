/**
 * SQLite checkpointer factory for CLI sessions.
 *
 * Creates a per-thread SQLite database in the given sessions directory,
 * ensuring the directory exists before constructing the saver.
 *
 * Default sessions directory: ~/.mindful/sessions
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';

/** Default directory where per-session SQLite databases are stored. */
export function defaultSessionsDir(): string {
  return join(homedir(), '.mindful', 'sessions');
}

/**
 * Create a SqliteSaver for the given thread ID.
 *
 * @param threadId   - The session / thread ID used as the database file name.
 * @param sessionsDir - Directory to store `.db` files (defaults to `~/.mindful/sessions`).
 * @returns A ready-to-use `SqliteSaver` instance.
 */
export function createCheckpointer(
  threadId: string,
  sessionsDir?: string,
): SqliteSaver {
  const dir = sessionsDir ?? defaultSessionsDir();
  mkdirSync(dir, { recursive: true });
  return SqliteSaver.fromConnString(join(dir, `${threadId}.db`));
}
