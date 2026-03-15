import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { tool, ToolRuntime } from "langchain";
import type { RunnableConfig } from '@langchain/core/runnables';
import { createLogger } from '../../logger.js';

const logger = createLogger('core:read');

const ReadSchema = z.object({
  path: z.string().describe('The file path to read'),
});

export type ReadInput = z.infer<typeof ReadSchema>;

export function createReadTool() {
  return tool(
    async (args: ReadInput, config?: RunnableConfig) => {
      try {
        const workspaceDir =
          (config?.configurable as Record<string, unknown> | undefined)?.['workspaceDir'] as string | undefined
          ?? process.cwd();
        const filePath = path.isAbsolute(args.path)
          ? args.path
          : path.join(workspaceDir, args.path);

        logger.debug('read file', { path: filePath });
        const content = await fs.readFile(filePath, 'utf-8');
        logger.debug('read file succeeded', { path: filePath, bytes: content.length });

        return JSON.stringify({
          success: true,
          content,
          path: filePath,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to read file';
        logger.warn('read file failed', { path: args.path, error: message });
        return JSON.stringify({
          success: false,
          error: message,
        });
      }
    },
    {
      name: 'read',
      description: 'Read the contents of a file from the file system',
      schema: ReadSchema,
    },
  );
}
