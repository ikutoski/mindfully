import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { tool } from "langchain";
import type { RunnableConfig } from '@langchain/core/runnables';
import { createLogger } from 'core';

const logger = createLogger('core:write');

const WriteSchema = z.object({
  path: z.string().describe('The file path to write'),
  content: z.string().describe('The content to write to the file'),
});

export type WriteInput = z.infer<typeof WriteSchema>;

export function createWriteTool() {
  return tool(
    async (args: WriteInput, config?: RunnableConfig) => {
      try {
        const workspaceDir =
          (config?.configurable as Record<string, unknown> | undefined)?.['workspaceDir'] as string | undefined
          ?? process.cwd();
        const filePath = path.isAbsolute(args.path)
          ? args.path
          : path.join(workspaceDir, args.path);

        logger.debug('write file', { path: filePath, bytes: args.content.length });
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, args.content, 'utf-8');
        logger.debug('write file succeeded', { path: filePath, bytes: args.content.length });

        return JSON.stringify({
          success: true,
          path: filePath,
          bytesWritten: args.content.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to write file';
        logger.warn('write file failed', { path: args.path, error: message });
        return JSON.stringify({
          success: false,
          error: message,
        });
      }
    },
    {
      name: 'write',
      description: 'Write content to a file. Creates the file if it does not exist.',
      schema: WriteSchema,
    },
  );
}
