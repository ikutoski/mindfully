import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { StructuredToolInterface } from '@langchain/core/tools';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any dynamic imports.
// ---------------------------------------------------------------------------

// Mock createReactAgent from @langchain/langgraph/prebuilt
vi.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: vi.fn(),
}));

// Mock GraphRecursionError from @langchain/langgraph so we can throw it in tests
vi.mock('@langchain/langgraph', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@langchain/langgraph')>();
  // Provide a real subclass so `err instanceof GraphRecursionError` works in the impl
  class GraphRecursionError extends Error {
    constructor(message?: string) {
      super(message ?? 'Recursion limit exceeded');
      this.name = 'GraphRecursionError';
    }
  }
  return { ...actual, GraphRecursionError };
});

// ---------------------------------------------------------------------------
// Imports (after mocks are set up)
// ---------------------------------------------------------------------------

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { GraphRecursionError } from '@langchain/langgraph';
import { createSpawnAgentTool } from '../src/tools/builtin/spawn-agent.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModel(): BaseChatModel {
  return {} as unknown as BaseChatModel;
}

function makeTool(name: string): StructuredToolInterface {
  return { name } as unknown as StructuredToolInterface;
}

/** Build a fake graph whose invoke() resolves with the given messages. */
function makeGraph(messages: unknown[]) {
  return {
    invoke: vi.fn().mockResolvedValue({ messages }),
  };
}

/** Build a fake graph whose invoke() rejects with an error. */
function makeFailingGraph(err: Error) {
  return {
    invoke: vi.fn().mockRejectedValue(err),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('spawn_agent tool', () => {
  const mockedCreateReactAgent = vi.mocked(createReactAgent);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('returns the final AIMessage text', async () => {
    const finalMsg = new AIMessage('Done! Here is your answer.');
    const graph = makeGraph([new HumanMessage('task'), finalMsg]);
    mockedCreateReactAgent.mockReturnValue(graph as never);

    const allTools = [makeTool('read'), makeTool('bash')];
    const spawnTool = createSpawnAgentTool(makeModel(), allTools);

    const result = await spawnTool.invoke({ prompt: 'Do the thing' });

    expect(result).toBe('Done! Here is your answer.');
  });

  it('returns text from last AIMessage with array content blocks', async () => {
    const finalMsg = new AIMessage({
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world' },
      ],
    });
    const graph = makeGraph([finalMsg]);
    mockedCreateReactAgent.mockReturnValue(graph as never);

    const spawnTool = createSpawnAgentTool(makeModel(), [makeTool('read')]);
    const result = await spawnTool.invoke({ prompt: 'task' });

    expect(result).toBe('Hello world');
  });

  // ── Context / message construction ────────────────────────────────────────

  it('prepends a SystemMessage when context is provided', async () => {
    const graph = makeGraph([new AIMessage('ok')]);
    mockedCreateReactAgent.mockReturnValue(graph as never);

    const allTools = [makeTool('read')];
    const spawnTool = createSpawnAgentTool(makeModel(), allTools);

    await spawnTool.invoke({ prompt: 'Do task', context: 'Some background info' });

    const invokeArgs = graph.invoke.mock.calls[0][0] as { messages: unknown[] };
    const msgs = invokeArgs.messages;

    expect(msgs[0]).toBeInstanceOf(SystemMessage);
    expect((msgs[0] as SystemMessage).content).toBe('Some background info');
    expect(msgs[1]).toBeInstanceOf(HumanMessage);
    expect((msgs[1] as HumanMessage).content).toBe('Do task');
  });

  it('starts with HumanMessage only when context is omitted', async () => {
    const graph = makeGraph([new AIMessage('ok')]);
    mockedCreateReactAgent.mockReturnValue(graph as never);

    const spawnTool = createSpawnAgentTool(makeModel(), [makeTool('read')]);
    await spawnTool.invoke({ prompt: 'Do task' });

    const invokeArgs = graph.invoke.mock.calls[0][0] as { messages: unknown[] };
    const msgs = invokeArgs.messages;

    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toBeInstanceOf(HumanMessage);
  });

  // ── Tool filtering ─────────────────────────────────────────────────────────

  it('passes only requested tools to createReactAgent', async () => {
    const graph = makeGraph([new AIMessage('filtered')]);
    mockedCreateReactAgent.mockReturnValue(graph as never);

    const readTool = makeTool('read');
    const bashTool = makeTool('bash');
    const spawnTool = createSpawnAgentTool(makeModel(), [readTool, bashTool]);

    await spawnTool.invoke({ prompt: 'task', tools: ['bash'] });

    const createArgs = mockedCreateReactAgent.mock.calls[0][0] as {
      tools: StructuredToolInterface[];
    };
    expect(createArgs.tools).toHaveLength(1);
    expect(createArgs.tools[0].name).toBe('bash');
  });

  it('passes all tools to createReactAgent when tools param is omitted', async () => {
    const graph = makeGraph([new AIMessage('all tools')]);
    mockedCreateReactAgent.mockReturnValue(graph as never);

    const allTools = [makeTool('read'), makeTool('bash'), makeTool('glob')];
    const spawnTool = createSpawnAgentTool(makeModel(), allTools);

    await spawnTool.invoke({ prompt: 'task' });

    const createArgs = mockedCreateReactAgent.mock.calls[0][0] as {
      tools: StructuredToolInterface[];
    };
    expect(createArgs.tools).toHaveLength(3);
    expect(createArgs.tools.map((t) => t.name)).toEqual(['read', 'bash', 'glob']);
  });

  it('returns "Unknown tools: ..." for unrecognised tool names', async () => {
    const spawnTool = createSpawnAgentTool(makeModel(), [makeTool('read')]);

    const result = await spawnTool.invoke({ prompt: 'task', tools: ['read', 'nonexistent'] });

    expect(result).toBe('Unknown tools: nonexistent');
    expect(mockedCreateReactAgent).not.toHaveBeenCalled();
  });

  // ── createReactAgent configuration ────────────────────────────────────────

  it('calls createReactAgent with checkpointer: false', async () => {
    const graph = makeGraph([new AIMessage('ok')]);
    mockedCreateReactAgent.mockReturnValue(graph as never);

    const spawnTool = createSpawnAgentTool(makeModel(), [makeTool('read')]);
    await spawnTool.invoke({ prompt: 'task' });

    const createArgs = mockedCreateReactAgent.mock.calls[0][0] as {
      checkpointer: unknown;
    };
    expect(createArgs.checkpointer).toBe(false);
  });

  // ── maxIterations / recursionLimit ─────────────────────────────────────────

  it('passes recursionLimit = maxIterations * 2 to graph.invoke', async () => {
    const graph = makeGraph([new AIMessage('ok')]);
    mockedCreateReactAgent.mockReturnValue(graph as never);

    const spawnTool = createSpawnAgentTool(makeModel(), [makeTool('read')]);
    await spawnTool.invoke({ prompt: 'task', maxIterations: 5 });

    const invokeConfig = graph.invoke.mock.calls[0][1] as { recursionLimit: number };
    expect(invokeConfig.recursionLimit).toBe(10); // 5 * 2
  });

  it('defaults maxIterations to 20, giving recursionLimit of 40', async () => {
    const graph = makeGraph([new AIMessage('ok')]);
    mockedCreateReactAgent.mockReturnValue(graph as never);

    const spawnTool = createSpawnAgentTool(makeModel(), [makeTool('read')]);
    await spawnTool.invoke({ prompt: 'task' }); // no maxIterations

    const invokeConfig = graph.invoke.mock.calls[0][1] as { recursionLimit: number };
    expect(invokeConfig.recursionLimit).toBe(40); // 20 * 2
  });

  // ── configurable / workspaceDir ────────────────────────────────────────────

  it('forwards workspaceDir from parent configurable to graph.invoke', async () => {
    const graph = makeGraph([new AIMessage('ok')]);
    mockedCreateReactAgent.mockReturnValue(graph as never);

    const spawnTool = createSpawnAgentTool(makeModel(), [makeTool('read')]);
    await spawnTool.invoke(
      { prompt: 'task' },
      { configurable: { workspaceDir: '/project/root' } },
    );

    const invokeConfig = graph.invoke.mock.calls[0][1] as {
      configurable: { workspaceDir: string };
    };
    expect(invokeConfig.configurable.workspaceDir).toBe('/project/root');
  });

  it('passes workspaceDir as undefined when parent has no configurable', async () => {
    const graph = makeGraph([new AIMessage('ok')]);
    mockedCreateReactAgent.mockReturnValue(graph as never);

    const spawnTool = createSpawnAgentTool(makeModel(), [makeTool('read')]);
    await spawnTool.invoke({ prompt: 'task' }); // no config arg

    const invokeConfig = graph.invoke.mock.calls[0][1] as {
      configurable: { workspaceDir: unknown };
    };
    expect(invokeConfig.configurable.workspaceDir).toBeUndefined();
  });

  // ── callbacks isolation ────────────────────────────────────────────────────

  it('passes callbacks: [] to graph.invoke to isolate child from parent stream', async () => {
    const graph = makeGraph([new AIMessage('ok')]);
    mockedCreateReactAgent.mockReturnValue(graph as never);

    const spawnTool = createSpawnAgentTool(makeModel(), [makeTool('read')]);
    await spawnTool.invoke({ prompt: 'task' });

    const invokeConfig = graph.invoke.mock.calls[0][1] as { callbacks: unknown[] };
    expect(invokeConfig.callbacks).toEqual([]);
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  it('returns "Child agent hit iteration limit" when GraphRecursionError is thrown', async () => {
    const graph = makeFailingGraph(new GraphRecursionError());
    mockedCreateReactAgent.mockReturnValue(graph as never);

    const spawnTool = createSpawnAgentTool(makeModel(), [makeTool('read')]);
    const result = await spawnTool.invoke({ prompt: 'task' });

    expect(result).toBe('Child agent hit iteration limit');
  });

  it('returns "Child agent failed: ..." for non-recursion errors', async () => {
    const graph = makeFailingGraph(new Error('LLM rate limited'));
    mockedCreateReactAgent.mockReturnValue(graph as never);

    const spawnTool = createSpawnAgentTool(makeModel(), [makeTool('read')]);
    const result = await spawnTool.invoke({ prompt: 'task' });

    expect(result).toBe('Child agent failed: LLM rate limited');
  });

  it('handles non-Error thrown values', async () => {
    const graph = { invoke: vi.fn().mockRejectedValue('plain string error') };
    mockedCreateReactAgent.mockReturnValue(graph as never);

    const spawnTool = createSpawnAgentTool(makeModel(), [makeTool('read')]);
    const result = await spawnTool.invoke({ prompt: 'task' });

    expect(result).toBe('Child agent failed: plain string error');
  });

  // ── No response ────────────────────────────────────────────────────────────

  it('returns "(no response)" when child produces no text', async () => {
    const graph = makeGraph([new AIMessage('')]);
    mockedCreateReactAgent.mockReturnValue(graph as never);

    const spawnTool = createSpawnAgentTool(makeModel(), [makeTool('read')]);
    const result = await spawnTool.invoke({ prompt: 'task' });

    expect(result).toBe('(no response)');
  });

  it('returns "(no response)" when messages array is empty', async () => {
    const graph = makeGraph([]);
    mockedCreateReactAgent.mockReturnValue(graph as never);

    const spawnTool = createSpawnAgentTool(makeModel(), [makeTool('read')]);
    const result = await spawnTool.invoke({ prompt: 'task' });

    expect(result).toBe('(no response)');
  });

  it('returns "(no response)" when last message is not an AIMessage', async () => {
    const graph = makeGraph([new HumanMessage('just human')]);
    mockedCreateReactAgent.mockReturnValue(graph as never);

    const spawnTool = createSpawnAgentTool(makeModel(), [makeTool('read')]);
    const result = await spawnTool.invoke({ prompt: 'task' });

    expect(result).toBe('(no response)');
  });
});
