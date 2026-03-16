import { z } from 'zod';
import { tool } from "langchain";
import { createLogger } from 'core';
import { ProcessRegistry } from './process-registry.js';

const logger = createLogger('core:process');

const ProcessSchema = z.object({
  action: z
    .enum(['list', 'poll', 'write', 'kill'])
    .describe('Action to perform: list all processes, poll output, write to stdin, or kill'),
  id: z
    .string()
    .optional()
    .describe('Process ID (required for poll, write, kill)'),
  input: z
    .string()
    .optional()
    .describe('Text to send to the process stdin (required for write)'),
});

type ProcessInput = z.infer<typeof ProcessSchema>;

/** Trim captured output for display — return last N chars to avoid huge payloads */
function trimOutput(s: string, maxChars = 8192): string {
  if (s.length <= maxChars) return s;
  return `...(truncated)...\n${s.slice(-maxChars)}`;
}

export function createProcessTool() {
  return tool(
    async (args: ProcessInput) => {
      const registry = ProcessRegistry.getInstance();

      switch (args.action) {
        case 'list': {
          const entries = registry.list().map((e) => ({
            id: e.id,
            command: e.command,
            pid: e.pid,
            status: e.status,
            exitCode: e.exitCode,
            startedAt: e.startedAt.toISOString(),
          }));
          logger.debug('process list', { count: entries.length });
          return JSON.stringify({ success: true, processes: entries });
        }

        case 'poll': {
          if (!args.id) return JSON.stringify({ success: false, error: 'id is required for poll' });
          const entry = registry.get(args.id);
          if (!entry) {
            return JSON.stringify({ success: false, error: `Process "${args.id}" not found` });
          }
          logger.debug('process poll', { id: args.id, status: entry.status });
          return JSON.stringify({
            success: true,
            id: entry.id,
            command: entry.command,
            pid: entry.pid,
            status: entry.status,
            exitCode: entry.exitCode,
            startedAt: entry.startedAt.toISOString(),
            stdout: trimOutput(entry.stdout),
            stderr: trimOutput(entry.stderr),
          });
        }

        case 'write': {
          if (!args.id) return JSON.stringify({ success: false, error: 'id is required for write' });
          if (!args.input) return JSON.stringify({ success: false, error: 'input is required for write' });
          const ok = registry.write(args.id, args.input);
          if (!ok) {
            const entry = registry.get(args.id);
            if (!entry) {
              return JSON.stringify({ success: false, error: `Process "${args.id}" not found` });
            }
            return JSON.stringify({
              success: false,
              error: `Process "${args.id}" is not running (status: ${entry.status})`,
            });
          }
          logger.debug('process write', { id: args.id, bytes: args.input.length });
          return JSON.stringify({ success: true, id: args.id, written: args.input.length });
        }

        case 'kill': {
          if (!args.id) return JSON.stringify({ success: false, error: 'id is required for kill' });
          const ok = registry.kill(args.id);
          if (!ok) {
            const entry = registry.get(args.id);
            if (!entry) {
              return JSON.stringify({ success: false, error: `Process "${args.id}" not found` });
            }
            return JSON.stringify({
              success: false,
              error: `Process "${args.id}" is already stopped (status: ${entry.status})`,
            });
          }
          logger.debug('process kill', { id: args.id });
          return JSON.stringify({ success: true, id: args.id, killed: true });
        }
      }
    },
    {
      name: 'process',
      description:
        'Manage long-running background processes started by the bash tool (background:true). ' +
        'Actions: list — show all processes; poll — get current stdout/stderr/status; ' +
        'write — send input to stdin; kill — terminate a process.',
      schema: ProcessSchema,
    },
  );
}
