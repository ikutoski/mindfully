import { spawn } from 'child_process';
import { z } from 'zod';
import { createLogger } from '../../logger.js';
import { createTool, type Tool, type ToolContext } from '../index.js';
import { ProcessRegistry } from './process-registry.js';

const logger = createLogger('core:bash');

const BashSchema = z.object({
  command: z.string().describe('The shell command to execute'),
  cwd: z.string().optional().describe('Working directory for the command'),
  timeout: z.number().optional().describe('Timeout in milliseconds (default: 60000)'),
  background: z
    .boolean()
    .optional()
    .describe(
      'Run the command in the background. Returns a process id immediately. ' +
      'Use the process tool to poll stdout/stderr or kill the process.',
    ),
});

export type BashInput = z.infer<typeof BashSchema>;

export function createBashTool(): Tool {
  return createTool({
    name: 'bash',
    description:
      'Execute a shell command in the workspace. ' +
      'Set background:true to start a long-running process; the process tool can then ' +
      'poll its output or kill it.',
    inputSchema: BashSchema,
    execute: async (input: unknown, context?: ToolContext) => {
      const args = input as BashInput;
      const workspaceDir = context?.workspaceDir || process.cwd();
      const cwd = args.cwd || workspaceDir;
      const timeout = args.timeout || 60000;

      // -----------------------------------------------------------------------
      // Background mode: spawn and return immediately with a process ID
      // -----------------------------------------------------------------------
      if (args.background) {
        logger.debug('bash background', { command: args.command, cwd });
        const registry = ProcessRegistry.getInstance();
        const entry = registry.spawn(args.command, cwd);
        return {
          success: true,
          background: true,
          id: entry.id,
          pid: entry.pid,
          message: `Process started in background. Use the process tool with id "${entry.id}" to poll output or kill it.`,
        };
      }

      logger.debug('bash command', { command: args.command, cwd });

      return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let totalBytes = 0;
        const MAX_BUFFER = 10 * 1024 * 1024; // 10 MB

        const child = spawn('sh', ['-c', args.command], {
          cwd,
          env: process.env as NodeJS.ProcessEnv,
        });

        // Kill after timeout
        const timer = setTimeout(() => {
          child.kill('SIGTERM');
        }, timeout);

        child.stdout.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          totalBytes += Buffer.byteLength(text);
          if (totalBytes <= MAX_BUFFER) {
            stdout += text;
            context?.onChunk?.(text);
          }
        });

        child.stderr.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          totalBytes += Buffer.byteLength(text);
          if (totalBytes <= MAX_BUFFER) {
            stderr += text;
            context?.onChunk?.(text);
          }
        });

        child.on('close', (code) => {
          clearTimeout(timer);
          logger.debug('bash command finished', {
            command: args.command,
            exitCode: code,
            stdoutLength: stdout.length,
            hasStderr: stderr.length > 0,
          });
          resolve({
            success: code === 0,
            stdout,
            stderr,
            exitCode: code ?? 0,
          });
        });

        child.on('error', (err) => {
          clearTimeout(timer);
          logger.warn('bash command error', { command: args.command, error: err.message });
          resolve({ success: false, error: err.message });
        });
      });
    },
  });
}
