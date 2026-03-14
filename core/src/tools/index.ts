import { z } from 'zod';

export { z } from 'zod';

export interface ToolContext {
  userId?: string;
  agentId?: string;
  workspaceDir?: string;
  /** Called with partial output chunks during tool execution (e.g. bash stdout/stderr). */
  onChunk?: (text: string) => void;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolCallResult {
  name: string;
  result: unknown;
  error?: string;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  execute(input: unknown, context?: ToolContext): Promise<unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolOptions {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  execute: (input: unknown, context?: ToolContext) => Promise<unknown>;
}

export function createTool(options: ToolOptions): Tool {
  return {
    name: options.name,
    description: options.description,
    inputSchema: options.inputSchema,
    execute: async (input: unknown, context?: ToolContext) => {
      const parsed = options.inputSchema.parse(input);
      return options.execute(parsed, context);
    },
  };
}

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  list(): ToolDefinition[];
  getNames(): string[];
}

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, Tool>();

  return {
    register(tool: Tool): void {
      if (tools.has(tool.name)) {
        console.warn(`Tool "${tool.name}" is already registered. Replacing.`);
      }
      tools.set(tool.name, tool);
    },

    get(name: string): Tool | undefined {
      return tools.get(name);
    },

    list(): ToolDefinition[] {
      return Array.from(tools.values()).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
    },

    getNames(): string[] {
      return Array.from(tools.keys());
    },
  };
}

export function toolToLangChain(tools: Tool[]): unknown[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    schema: tool.inputSchema,
  }));
}
