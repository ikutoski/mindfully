import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { StructuredToolInterface } from '@langchain/core/tools';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any dynamic imports.
// ---------------------------------------------------------------------------

// Mock MemorySaver from @langchain/langgraph
vi.mock('@langchain/langgraph', () => ({
  MemorySaver: vi.fn().mockImplementation(() => ({})),
}));

// Mock createAgent from langchain
vi.mock('langchain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('langchain')>();
  return {
    ...actual,
    createAgent: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks are set up)
// ---------------------------------------------------------------------------

import { MemorySaver } from '@langchain/langgraph';
import { createAgent } from 'langchain';
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

/** Build a fake graph whose invoke() resolves with messages. */
function makeGraph(messages: unknown[]) {
  return {
    invoke: vi.fn().mockResolvedValue({ messages }),
  };
}

/** Build a fake graph whose invoke() rejects with an error. */
function makeFailingGraph(message: string) {
  return {
    invoke: vi.fn().mockRejectedValue(new Error(message)),
  };
}

/**
 * Cast a fake graph object to the createAgent return type.
 * Requires going through `unknown` because the types don't overlap directly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asGraph(g: { invoke: any }): ReturnType<typeof createAgent> {
  return g as unknown as ReturnType<typeof createAgent>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('spawn_agent tool', () => {
  const mockedCreateAgent = vi.mocked(createAgent);
  const mockedMemorySaver = vi.mocked(MemorySaver);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Happy path — returns final AIMessage text
  it('returns the final AIMessage text', async () => {
    const finalMsg = new AIMessage('Done! Here is your answer.');
    const graph = makeGraph([new HumanMessage('task'), finalMsg]);
    mockedCreateAgent.mockReturnValue(asGraph(graph));

    const allTools = [makeTool('read'), makeTool('bash')];
    const spawnTool = createSpawnAgentTool(makeModel(), allTools);

    const result = await spawnTool.invoke({ prompt: 'Do the thing' });

    expect(result).toBe('Done! Here is your answer.');
  });

  // 2. Context injection — first input is SystemMessage when context provided
  it('prepends a SystemMessage when context is provided', async () => {
    const graph = makeGraph([new AIMessage('ok')]);
    mockedCreateAgent.mockReturnValue(asGraph(graph));

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

  // 3. No context — first input is HumanMessage when context omitted
  it('starts with HumanMessage when context is omitted', async () => {
    const graph = makeGraph([new AIMessage('ok')]);
    mockedCreateAgent.mockReturnValue(asGraph(graph));

    const allTools = [makeTool('read')];
    const spawnTool = createSpawnAgentTool(makeModel(), allTools);

    await spawnTool.invoke({ prompt: 'Do task' });

    const invokeArgs = graph.invoke.mock.calls[0][0] as { messages: unknown[] };
    const msgs = invokeArgs.messages;

    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toBeInstanceOf(HumanMessage);
  });

  // 4. Tool filtering — createAgent receives only the requested tool
  it('passes only requested tools to createAgent', async () => {
    const graph = makeGraph([new AIMessage('filtered')]);
    mockedCreateAgent.mockReturnValue(asGraph(graph));

    const readTool = makeTool('read');
    const bashTool = makeTool('bash');
    const allTools = [readTool, bashTool];
    const spawnTool = createSpawnAgentTool(makeModel(), allTools);

    await spawnTool.invoke({ prompt: 'task', tools: ['bash'] });

    const createAgentArgs = mockedCreateAgent.mock.calls[0][0] as { tools: StructuredToolInterface[] };
    expect(createAgentArgs.tools).toHaveLength(1);
    expect(createAgentArgs.tools[0].name).toBe('bash');
  });

  // 5. Omit tools = all — createAgent receives all allTools
  it('passes all tools to createAgent when tools param is omitted', async () => {
    const graph = makeGraph([new AIMessage('all tools')]);
    mockedCreateAgent.mockReturnValue(asGraph(graph));

    const allTools = [makeTool('read'), makeTool('bash'), makeTool('glob')];
    const spawnTool = createSpawnAgentTool(makeModel(), allTools);

    await spawnTool.invoke({ prompt: 'task' });

    const createAgentArgs = mockedCreateAgent.mock.calls[0][0] as { tools: StructuredToolInterface[] };
    expect(createAgentArgs.tools).toHaveLength(3);
    expect(createAgentArgs.tools.map((t) => t.name)).toEqual(['read', 'bash', 'glob']);
  });

  // 6. Unknown tool name — returns error string, createAgent not called
  it('returns "Unknown tools: ..." for unrecognised tool names', async () => {
    const allTools = [makeTool('read')];
    const spawnTool = createSpawnAgentTool(makeModel(), allTools);

    const result = await spawnTool.invoke({ prompt: 'task', tools: ['read', 'nonexistent'] });

    expect(result).toBe('Unknown tools: nonexistent');
    expect(mockedCreateAgent).not.toHaveBeenCalled();
  });

  // 7. Child graph throws — returns "Child agent failed: ..."
  it('returns "Child agent failed: ..." when graph.invoke throws', async () => {
    const graph = makeFailingGraph('LLM rate limited');
    mockedCreateAgent.mockReturnValue(asGraph(graph));

    const allTools = [makeTool('read')];
    const spawnTool = createSpawnAgentTool(makeModel(), allTools);

    const result = await spawnTool.invoke({ prompt: 'task' });

    expect(result).toBe('Child agent failed: LLM rate limited');
  });

  // callbacks isolation — graph.invoke must receive callbacks: [] to prevent
  // the child from inheriting the parent's LangGraph streaming context
  it('passes callbacks: [] to graph.invoke to isolate child from parent stream', async () => {
    const graph = makeGraph([new AIMessage('ok')]);
    mockedCreateAgent.mockReturnValue(asGraph(graph));

    const spawnTool = createSpawnAgentTool(makeModel(), [makeTool('read')]);
    await spawnTool.invoke({ prompt: 'task' });

    const invokeConfig = graph.invoke.mock.calls[0][1] as { callbacks?: unknown[] };
    expect(invokeConfig.callbacks).toEqual([]);
  });

  // Bonus: MemorySaver is instantiated once per invocation
  it('creates a new MemorySaver per invocation', async () => {
    const graph = makeGraph([new AIMessage('ok')]);
    mockedCreateAgent.mockReturnValue(asGraph(graph));

    const spawnTool = createSpawnAgentTool(makeModel(), [makeTool('read')]);

    await spawnTool.invoke({ prompt: 'first' });
    await spawnTool.invoke({ prompt: 'second' });

    expect(mockedMemorySaver).toHaveBeenCalledTimes(2);
  });

  // Bonus: (no response) when all messages lack text
  it('returns "(no response)" when child produces no text', async () => {
    const emptyAI = new AIMessage('');
    const graph = makeGraph([emptyAI]);
    mockedCreateAgent.mockReturnValue(asGraph(graph));

    const spawnTool = createSpawnAgentTool(makeModel(), [makeTool('read')]);
    const result = await spawnTool.invoke({ prompt: 'task' });

    expect(result).toBe('(no response)');
  });
});
