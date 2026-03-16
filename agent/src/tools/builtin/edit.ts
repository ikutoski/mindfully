import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { tool } from "langchain";
import type { RunnableConfig } from '@langchain/core/runnables';
import { createLogger } from 'core';

const logger = createLogger('core:edit');

const EditSchema = z.object({
  path: z.string().describe('The file path to edit'),
  search: z.string().describe('The text to search for in the file'),
  replace: z.string().describe('The text to replace the search text with'),
  replaceAll: z
    .boolean()
    .optional()
    .describe('Replace all occurrences (default: false — replaces first occurrence only)'),
});

export type EditInput = z.infer<typeof EditSchema>;

export function createEditTool() {
  return tool(
    async (args: EditInput, config?: RunnableConfig) => {
      try {
        const workspaceDir =
          (config?.configurable as Record<string, unknown> | undefined)?.['workspaceDir'] as string | undefined
          ?? process.cwd();
        const filePath = path.isAbsolute(args.path)
          ? args.path
          : path.join(workspaceDir, args.path);

        logger.debug('edit file', { path: filePath, searchLength: args.search.length, replaceAll: args.replaceAll ?? false });
        let content = await fs.readFile(filePath, 'utf-8');

        if (!content.includes(args.search)) {
          logger.warn('edit file: search text not found', { path: filePath });
          return JSON.stringify({
            success: false,
            error: `Search text not found in file: ${args.search}`,
          });
        }

        let replacements: number;
        if (args.replaceAll) {
          // Count occurrences before replacing
          const parts = content.split(args.search);
          replacements = parts.length - 1;
          content = parts.join(args.replace);
        } else {
          content = content.replace(args.search, args.replace);
          replacements = 1;
        }

        await fs.writeFile(filePath, content, 'utf-8');
        logger.debug('edit file succeeded', { path: filePath, replacements });

        return JSON.stringify({
          success: true,
          path: filePath,
          replacements,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to edit file';
        logger.warn('edit file failed', { path: args.path, error: message });
        return JSON.stringify({
          success: false,
          error: message,
        });
      }
    },
    {
      name: 'edit',
      description:
        'Edit a file by replacing specific text with new text. ' +
        'By default replaces only the first occurrence; set replaceAll to true to replace every occurrence.',
      schema: EditSchema,
    },
  );
}
