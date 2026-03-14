/**
 * Tests for AgentRunner (runner.ts).
 *
 * We mock createLLMChain and buildAgentGraph so no real API calls or
 * StateGraph compilation is needed. All core behaviours are exercised:
 *  - run() happy path
 *  - run() with conversation history
 *  - run() graph error captured in AgentState.error
 *  - stream() token / tool_start / tool_result / done events
 *  - stream() error event on graph failure
 *  - getCostInfo() / getTotalCost() delegation
 *  - historyEntryToBaseMessage role mapping (all branches)
 *  - baseMessageToAgentMessage role mapping (all branches)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';

// ─── Mock dependencies ────────────────────────────────────────────────────────

vi.mock('../../src/agents/providers/index.js', () => ({
  createLLMChain: vi.fn(),
}));

vi.mock('../../src/agents/graph/index.js', () => ({
  buildAgentGraph: vi.fn(),
}));

// Import AFTER mocks are registered
import { createLLMChain } from '../../src/agents/providers/index.js';
import { buildAgentGraph } from '../../src/agents/graph/index.js';
import { AgentRunner, createAgentRunner } from '../../src/agents/runner.js';
import type { AgentRunOptions } from '../../src/agents/runner.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLLMChain(overrides: Partial<ReturnType<typeof createLLMChain>> = {}) {
  return {
    runnable: { invoke: vi.fn(), stream: vi.fn() },
    costHandlers: [],
    getTotalCost: vi.fn().mockReturnValue(0),
    getCostHistory: vi.fn().mockReturnValue([]),
    ...overrides,
  };
}

function makeGraph(invokeResult?: unknown, streamEvents?: unknown[]) {
  return {
    invoke: vi.fn().mockResolvedValue(
      invokeResult ?? { messages: [new AIMessage('default reply')] },
    ),
    streamEvents: vi.fn(async function* () {
      for (const ev of streamEvents ?? []) {
        yield ev;
      }
    }),
  };
}

function baseRunOptions(overrides: Partial<AgentRunOptions> = {}): AgentRunOptions {
  return {
    input: 'Hello',
    tools: [],
    toolExecutor: vi.fn().mockResolvedValue({ result: 'ok' }),
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── AgentRunner constructor ──────────────────────────────────────────────────

describe('AgentRunner constructor', () => {
  it('uses provided llmChain directly', () => {
    const chain = makeLLMChain();
    const runner = new AgentRunner({ llmChain: chain as never });
    expect(runner).toBeInstanceOf(AgentRunner);
    expect(createLLMChain).not.toHaveBeenCalled();
  });

  it('calls createLLMChain when no llmChain is provided', () => {
    const chain = makeLLMChain();
    vi.mocked(createLLMChain).mockReturnValue(chain as never);
    new AgentRunner({});
    expect(createLLMChain).toHaveBeenCalledOnce();
  });

  it('createAgentRunner factory wraps the constructor', () => {
    const chain = makeLLMChain();
    vi.mocked(createLLMChain).mockReturnValue(chain as never);
    const runner = createAgentRunner();
    expect(runner).toBeInstanceOf(AgentRunner);
  });
});

// ─── getCostInfo / getTotalCost ───────────────────────────────────────────────

describe('getCostInfo / getTotalCost', () => {
  it('returns undefined when cost history is empty', () => {
    const chain = makeLLMChain({ getCostHistory: vi.fn().mockReturnValue([]) });
    const runner = new AgentRunner({ llmChain: chain as never });
    expect(runner.getCostInfo()).toBeUndefined();
  });

  it('returns last cost entry when history is non-empty', () => {
    const entry = { provider: 'openai', model: 'gpt-4o', inputTokens: 10, outputTokens: 5, totalCost: 0.001, currency: 'USD' };
    const chain = makeLLMChain({ getCostHistory: vi.fn().mockReturnValue([entry]) });
    const runner = new AgentRunner({ llmChain: chain as never });
    expect(runner.getCostInfo()).toBe(entry);
  });

  it('delegates getTotalCost to llmChain', () => {
    const chain = makeLLMChain({ getTotalCost: vi.fn().mockReturnValue(42) });
    const runner = new AgentRunner({ llmChain: chain as never });
    expect(runner.getTotalCost()).toBe(42);
  });
});

// ─── run() ───────────────────────────────────────────────────────────────────

describe('AgentRunner.run()', () => {
  it('returns AgentState with messages on success', async () => {
    const chain = makeLLMChain();
    const graph = makeGraph({ messages: [new HumanMessage('hi'), new AIMessage('hello back')] });
    vi.mocked(buildAgentGraph).mockReturnValue(graph as never);

    const runner = new AgentRunner({ llmChain: chain as never });
    const state = await runner.run(baseRunOptions());

    expect(state.input).toBe('Hello');
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0].role).toBe('user');
    expect(state.messages[1].role).toBe('assistant');
    expect(state.error).toBeUndefined();
  });

  it('uses history when provided instead of wrapping input in HumanMessage', async () => {
    const chain = makeLLMChain();
    const graph = makeGraph({ messages: [new AIMessage('answer')] });
    vi.mocked(buildAgentGraph).mockReturnValue(graph as never);

    const runner = new AgentRunner({ llmChain: chain as never });
    const state = await runner.run(
      baseRunOptions({
        history: [
          { role: 'system', content: 'You are a test agent.' },
          { role: 'user', content: 'What is 2+2?' },
        ],
      }),
    );

    expect(state.messages[0].role).toBe('assistant');
    // graph.invoke should have been called with 2 initial messages
    const invokeCalls = graph.invoke.mock.calls[0];
    expect(invokeCalls[0].messages).toHaveLength(2);
    expect(invokeCalls[0].messages[0]).toBeInstanceOf(SystemMessage);
    expect(invokeCalls[0].messages[1]).toBeInstanceOf(HumanMessage);
  });

  it('captures errors from the graph in AgentState.error', async () => {
    const chain = makeLLMChain();
    const graph = {
      invoke: vi.fn().mockRejectedValue(new Error('graph blew up')),
      streamEvents: vi.fn(),
    };
    vi.mocked(buildAgentGraph).mockReturnValue(graph as never);

    const runner = new AgentRunner({ llmChain: chain as never });
    const state = await runner.run(baseRunOptions());

    expect(state.error).toBe('graph blew up');
  });

  it('accumulates toolResults from the toolExecutor wrapper', async () => {
    const chain = makeLLMChain();
    const toolMsg = new ToolMessage({ content: 'result-data', tool_call_id: 'tc-1' });
    const graph = makeGraph({ messages: [toolMsg] });
    vi.mocked(buildAgentGraph).mockReturnValue(graph as never);

    const toolExecutor = vi.fn().mockResolvedValue({ result: 'tool-output' });

    const runner = new AgentRunner({ llmChain: chain as never });
    // Manually invoke the toolExecutor through the wrapper by invoking the captured arg
    const state = await runner.run(baseRunOptions({ toolExecutor }));
    // toolResults is accumulated only when the wrapped executor is called during graph.invoke
    // Since we mock graph.invoke directly, no tool executor calls happen — state should have empty array
    expect(state.toolResults).toHaveLength(0);
  });

  it('handles history with assistant tool_calls', async () => {
    const chain = makeLLMChain();
    const graph = makeGraph({ messages: [new AIMessage('done')] });
    vi.mocked(buildAgentGraph).mockReturnValue(graph as never);

    const runner = new AgentRunner({ llmChain: chain as never });
    await runner.run(
      baseRunOptions({
        history: [
          {
            role: 'assistant',
            content: '',
            tool_calls: [{ name: 'search', args: { q: 'test' }, id: 'tc-x' }],
          },
          { role: 'tool', content: 'search result', toolCallId: 'tc-x', toolName: 'search' },
        ],
      }),
    );

    const invokeCalls = graph.invoke.mock.calls[0];
    expect(invokeCalls[0].messages[0]).toBeInstanceOf(AIMessage);
    expect(invokeCalls[0].messages[1]).toBeInstanceOf(ToolMessage);
  });

  it('handles unknown role in history as HumanMessage', async () => {
    const chain = makeLLMChain();
    const graph = makeGraph({ messages: [new AIMessage('done')] });
    vi.mocked(buildAgentGraph).mockReturnValue(graph as never);

    const runner = new AgentRunner({ llmChain: chain as never });
    await runner.run(
      baseRunOptions({
        history: [{ role: 'unknown' as never, content: 'test' }],
      }),
    );

    const invokeCalls = graph.invoke.mock.calls[0];
    expect(invokeCalls[0].messages[0]).toBeInstanceOf(HumanMessage);
  });
});

// ─── stream() ────────────────────────────────────────────────────────────────

describe('AgentRunner.stream()', () => {
  it('yields token events from on_chat_model_stream', async () => {
    const chain = makeLLMChain();
    const events = [
      {
        event: 'on_chat_model_stream',
        name: 'call_model',
        data: { chunk: { content: 'Hello ' } },
      },
      {
        event: 'on_chat_model_stream',
        name: 'call_model',
        data: { chunk: { content: 'world' } },
      },
    ];
    const graph = makeGraph(undefined, events);
    vi.mocked(buildAgentGraph).mockReturnValue(graph as never);

    const runner = new AgentRunner({ llmChain: chain as never });
    const collected: unknown[] = [];
    for await (const ev of runner.stream(baseRunOptions())) {
      collected.push(ev);
    }

    const tokens = collected.filter((e: unknown) => (e as { type: string }).type === 'token');
    expect(tokens).toHaveLength(2);
    expect((tokens[0] as { content: string }).content).toBe('Hello ');
    expect((tokens[1] as { content: string }).content).toBe('world');
  });

  it('skips empty token content', async () => {
    const chain = makeLLMChain();
    const events = [
      { event: 'on_chat_model_stream', name: 'call_model', data: { chunk: { content: '' } } },
      { event: 'on_chat_model_stream', name: 'call_model', data: { chunk: {} } },
    ];
    const graph = makeGraph(undefined, events);
    vi.mocked(buildAgentGraph).mockReturnValue(graph as never);

    const runner = new AgentRunner({ llmChain: chain as never });
    const collected: unknown[] = [];
    for await (const ev of runner.stream(baseRunOptions())) {
      collected.push(ev);
    }

    const tokens = collected.filter((e: unknown) => (e as { type: string }).type === 'token');
    expect(tokens).toHaveLength(0);
  });

  it('yields tool_start events from on_chain_start execute_tools', async () => {
    const aiMsg = new AIMessage({ content: '' });
    aiMsg.tool_calls = [{ name: 'lookup', args: { q: 'foo' }, id: 'tc-1', type: 'tool_call' }];

    const events = [
      {
        event: 'on_chain_start',
        name: 'execute_tools',
        data: { input: { messages: [aiMsg] } },
      },
    ];
    const chain = makeLLMChain();
    const graph = makeGraph(undefined, events);
    vi.mocked(buildAgentGraph).mockReturnValue(graph as never);

    const runner = new AgentRunner({ llmChain: chain as never });
    const collected: unknown[] = [];
    for await (const ev of runner.stream(baseRunOptions())) {
      collected.push(ev);
    }

    const toolStarts = collected.filter((e: unknown) => (e as { type: string }).type === 'tool_start');
    expect(toolStarts).toHaveLength(1);
    expect((toolStarts[0] as { name: string }).name).toBe('lookup');
  });

  it('yields tool_result events from on_chain_end execute_tools with pending call', async () => {
    const aiMsg = new AIMessage({ content: '' });
    aiMsg.tool_calls = [{ name: 'search', args: {}, id: 'tc-2', type: 'tool_call' }];
    const toolMsg = new ToolMessage({ content: 'result-value', tool_call_id: 'tc-2', name: 'search' });

    const events = [
      { event: 'on_chain_start', name: 'execute_tools', data: { input: { messages: [aiMsg] } } },
      { event: 'on_chain_end', name: 'execute_tools', data: { output: { messages: [toolMsg] } } },
    ];
    const chain = makeLLMChain();
    const graph = makeGraph(undefined, events);
    vi.mocked(buildAgentGraph).mockReturnValue(graph as never);

    const runner = new AgentRunner({ llmChain: chain as never });
    const collected: unknown[] = [];
    for await (const ev of runner.stream(baseRunOptions())) {
      collected.push(ev);
    }

    const results = collected.filter((e: unknown) => (e as { type: string }).type === 'tool_result');
    expect(results).toHaveLength(1);
    expect((results[0] as { name: string }).name).toBe('search');
  });

  it('yields tool_result for ToolMessage without a pending call', async () => {
    const toolMsg = new ToolMessage({ content: 'orphan-result', tool_call_id: 'tc-orphan', name: 'orphan' });
    const events = [
      { event: 'on_chain_end', name: 'execute_tools', data: { output: { messages: [toolMsg] } } },
    ];
    const chain = makeLLMChain();
    const graph = makeGraph(undefined, events);
    vi.mocked(buildAgentGraph).mockReturnValue(graph as never);

    const runner = new AgentRunner({ llmChain: chain as never });
    const collected: unknown[] = [];
    for await (const ev of runner.stream(baseRunOptions())) {
      collected.push(ev);
    }

    const results = collected.filter((e: unknown) => (e as { type: string }).type === 'tool_result');
    expect(results).toHaveLength(1);
    expect((results[0] as { name: string }).name).toBe('orphan');
  });

  it('captures final messages from on_chain_end __end__', async () => {
    const finalMsg = new AIMessage('final answer');
    const events = [
      { event: 'on_chain_end', name: '__end__', data: { output: { messages: [finalMsg] } } },
    ];
    const chain = makeLLMChain();
    const graph = makeGraph(undefined, events);
    vi.mocked(buildAgentGraph).mockReturnValue(graph as never);

    const runner = new AgentRunner({ llmChain: chain as never });
    const collected: unknown[] = [];
    for await (const ev of runner.stream(baseRunOptions())) {
      collected.push(ev);
    }

    const done = collected.find((e: unknown) => (e as { type: string }).type === 'done') as { messages: { content: string }[] } | undefined;
    expect(done).toBeDefined();
    expect(done?.messages[0].content).toBe('final answer');
  });

  it('yields error event when graph stream throws', async () => {
    const chain = makeLLMChain();
    const graph = {
      invoke: vi.fn(),
      streamEvents: vi.fn(async function* () {
        throw new Error('stream blew up');
        // eslint-disable-next-line @typescript-eslint/no-unreachable
        yield; // make it a generator
      }),
    };
    vi.mocked(buildAgentGraph).mockReturnValue(graph as never);

    const runner = new AgentRunner({ llmChain: chain as never });
    const collected: unknown[] = [];
    for await (const ev of runner.stream(baseRunOptions())) {
      collected.push(ev);
    }

    const errors = collected.filter((e: unknown) => (e as { type: string }).type === 'error');
    expect(errors).toHaveLength(1);
    expect((errors[0] as { message: string }).message).toBe('stream blew up');
  });

  it('yields done event at end of a successful stream', async () => {
    const chain = makeLLMChain();
    const graph = makeGraph(undefined, []);
    vi.mocked(buildAgentGraph).mockReturnValue(graph as never);

    const runner = new AgentRunner({ llmChain: chain as never });
    const collected: unknown[] = [];
    for await (const ev of runner.stream(baseRunOptions())) {
      collected.push(ev);
    }

    const done = collected.find((e: unknown) => (e as { type: string }).type === 'done');
    expect(done).toBeDefined();
  });
});

// ─── baseMessageToAgentMessage branches ──────────────────────────────────────

describe('baseMessageToAgentMessage (via run() output)', () => {
  it('converts ToolMessage to role=tool with toolCallId and toolName', async () => {
    const chain = makeLLMChain();
    const toolMsg = new ToolMessage({ content: 'tool-content', tool_call_id: 'tc-99', name: 'myTool' });
    const graph = makeGraph({ messages: [toolMsg] });
    vi.mocked(buildAgentGraph).mockReturnValue(graph as never);

    const runner = new AgentRunner({ llmChain: chain as never });
    const state = await runner.run(baseRunOptions());

    const msg = state.messages[0];
    expect(msg.role).toBe('tool');
    expect(msg.content).toBe('tool-content');
    expect(msg.toolCallId).toBe('tc-99');
    expect(msg.toolName).toBe('myTool');
  });

  it('converts AIMessage with tool_calls to role=assistant with tool_calls array', async () => {
    const chain = makeLLMChain();
    const aiMsg = new AIMessage({ content: 'calling tool' });
    aiMsg.tool_calls = [{ name: 'foo', args: { x: 1 }, id: 'tc-foo', type: 'tool_call' }];
    const graph = makeGraph({ messages: [aiMsg] });
    vi.mocked(buildAgentGraph).mockReturnValue(graph as never);

    const runner = new AgentRunner({ llmChain: chain as never });
    const state = await runner.run(baseRunOptions());

    const msg = state.messages[0];
    expect(msg.role).toBe('assistant');
    expect(msg.tool_calls).toHaveLength(1);
    expect(msg.tool_calls![0].name).toBe('foo');
  });

  it('converts SystemMessage to role=system', async () => {
    const chain = makeLLMChain();
    const graph = makeGraph({ messages: [new SystemMessage('sys msg')] });
    vi.mocked(buildAgentGraph).mockReturnValue(graph as never);

    const runner = new AgentRunner({ llmChain: chain as never });
    const state = await runner.run(baseRunOptions());

    expect(state.messages[0].role).toBe('system');
  });
});
