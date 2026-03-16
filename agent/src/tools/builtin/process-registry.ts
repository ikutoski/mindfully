import { ChildProcess, spawn } from 'child_process';

export interface ProcessEntry {
  id: string;
  command: string;
  cwd: string;
  pid?: number;
  startedAt: Date;
  status: 'running' | 'exited' | 'killed';
  exitCode?: number;
  stdout: string;
  stderr: string;
  process: ChildProcess;
}

/**
 * Module-level singleton registry for background processes.
 * Keeps processes alive across tool invocations within the same Node.js process.
 */
export class ProcessRegistry {
  private static instance: ProcessRegistry;
  private entries = new Map<string, ProcessEntry>();
  private nextId = 1;

  private constructor() {}

  static getInstance(): ProcessRegistry {
    if (!ProcessRegistry.instance) {
      ProcessRegistry.instance = new ProcessRegistry();
    }
    return ProcessRegistry.instance;
  }

  /** For testing: reset the singleton state */
  static reset(): void {
    if (ProcessRegistry.instance) {
      for (const entry of ProcessRegistry.instance.entries.values()) {
        try {
          entry.process.kill();
        } catch {
          // ignore
        }
      }
      ProcessRegistry.instance.entries.clear();
      ProcessRegistry.instance.nextId = 1;
    }
  }

  spawn(command: string, cwd: string): ProcessEntry {
    const id = String(this.nextId++);

    const child = spawn('sh', ['-c', command], {
      cwd,
      detached: false,
      stdio: 'pipe',
    });

    const entry: ProcessEntry = {
      id,
      command,
      cwd,
      pid: child.pid,
      startedAt: new Date(),
      status: 'running',
      stdout: '',
      stderr: '',
      process: child,
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      entry.stdout += chunk.toString();
      // Cap at 1 MB to avoid unbounded growth
      if (entry.stdout.length > 1_048_576) {
        entry.stdout = entry.stdout.slice(-1_048_576);
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      entry.stderr += chunk.toString();
      if (entry.stderr.length > 1_048_576) {
        entry.stderr = entry.stderr.slice(-1_048_576);
      }
    });

    child.on('exit', (code) => {
      entry.status = 'exited';
      entry.exitCode = code ?? undefined;
    });

    child.on('error', () => {
      if (entry.status === 'running') {
        entry.status = 'exited';
      }
    });

    this.entries.set(id, entry);
    return entry;
  }

  get(id: string): ProcessEntry | undefined {
    return this.entries.get(id);
  }

  list(): ProcessEntry[] {
    return Array.from(this.entries.values());
  }

  kill(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    if (entry.status !== 'running') return false;
    entry.process.kill('SIGTERM');
    entry.status = 'killed';
    return true;
  }

  write(id: string, input: string): boolean {
    const entry = this.entries.get(id);
    if (!entry || entry.status !== 'running') return false;
    const stdin = entry.process.stdin;
    if (!stdin || stdin.destroyed) return false;
    stdin.write(input);
    return true;
  }
}
