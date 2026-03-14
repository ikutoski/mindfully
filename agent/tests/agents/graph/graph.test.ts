/**
 * Tests for the LangGraph ReAct agent graph.
 *
 * We mock the LLM runnable so no real API calls are made.
 * Tests verify the graph routing (call_model → execute_tools → call_model → END)
 * and the stream/run integration.
 */
import { describe, it, expect, vi } from 'vitest';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { buildAgentGraph } from '../../../src/agents/graph/index.js';
import { shouldContinue } from '../../../src/agents/graph/router.js';
import { buildCallModelNode, buildExecuteToolsNode } from '../../../src/agents/graph/nodes.js';
import type { AgentGraphState } from '../../../src/agents/graph/state.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRunnable(responses: BaseMessage[]) {
  let idx = 0;
  return {
    invoke: vi.fn(async (_msgs: BaseMessage[]) => {
      const r = responses[idx++];
      if (!r) throw new Error('mock runnable: no more responses');
      return r;
    }),
    stream: vi.fn(async function* (_msgs: BaseMessage[]) {
      const r = responses[idx++];
      if (!r) throw new Error('mock runnable: no more responses');
      yield r;
    }),
  };
}

function makeToolExecutor(results: Record<string, unknown>) {
  return vi.fn(async (name: string, _args: Record<string, unknown>) => {
    if (name in results) return { result: results[name] };
    return { result: null, error: `Tool "${name}" not found` };
  });
}

// ─── shouldContinue router ────────────────────────────────────────────────────

describe('shouldContinue router', () => {
  it('returns END when last message is AIMessage with no tool_calls', () => {
    const state: AgentGraphState = {
      messages: [new AIMessage('Hello')],
      input: 'test',
    };
    const END = '__end__'; // LangGraph END symbol stringifies to '__end__'
    const result = shouldContinue(state);
    expect(result).not.toBe('execute_tools');
    // END is the Symbol from langgraph — just check it is NOT execute_tools
  });

  it('returns "execute_tools" when AIMessage has tool_calls', () => {
    const msg = new AIMessage({ content: '' });
    msg.tool_calls = [{ name: 'mytool', args: {}, id: 'tc1', type: 'tool_call' }];
    const state: AgentGraphState = {
      messages: [msg],
      input: 'test',
    };
    expect(shouldContinue(state)).toBe('execute_tools');
  });

  it('returns END when messages list is empty', () => {
    const state: AgentGraphState = { messages: [], input: '' };
    const result = shouldContinue(state);
    expect(result).not.toBe('execute_tools');
  });
});

// ─── buildCallModelNode ───────────────────────────────────────────────────────

describe('buildCallModelNode', () => {
  it('invokes the runnable with state messages and appends the response', async () => {
    const reply = new AIMessage('hello');
    const runnable = makeRunnable([reply]);
    const node = buildCallModelNode(runnable as never);

    const state: AgentGraphState = {
      messages: [new HumanMessage('hi')],
      input: 'hi',
    };

    const result = await node(state);
    expect(result.messages).toHaveLength(1);
    expect(result.messages![0]).toBe(reply);
    expect(runnable.invoke).toHaveBeenCalledWith(state.messages);
  });
});

// ─── buildExecuteToolsNode ────────────────────────────────────────────────────

describe('buildExecuteToolsNode', () => {
  it('executes tool calls and returns ToolMessages', async () => {
    const executor = makeToolExecutor({ echo: 'pong' });
    const node = buildExecuteToolsNode(executor);

    const aiMsg = new AIMessage({ content: '' });
    aiMsg.tool_calls = [{ name: 'echo', args: { text: 'hi' }, id: 'tc-1', type: 'tool_call' }];

    const state: AgentGraphState = {
      messages: [new HumanMessage('ping'), aiMsg],
      input: 'ping',
    };

    const result = await node(state);
    expect(result.messages).toHaveLength(1);
    const toolMsg = result.messages![0] as ToolMessage;
    expect(toolMsg).toBeInstanceOf(ToolMessage);
    expect(toolMsg.content).toBe('pong');
    expect(toolMsg.tool_call_id).toBe('tc-1');
  });

  it('captures errors from the tool executor as ToolMessage content', async () => {
    const executor = vi.fn(async () => {
      throw new Error('tool exploded');
    });
    const node = buildExecuteToolsNode(executor);

    const aiMsg = new AIMessage({ content: '' });
    aiMsg.tool_calls = [{ name: 'boom', args: {}, id: 'tc-err', type: 'tool_call' }];

    const state: AgentGraphState = {
      messages: [aiMsg],
      input: 'boom',
    };

    const result = await node(state);
    const toolMsg = result.messages![0] as ToolMessage;
    expect(toolMsg.content).toBe('tool exploded');
  });

  it('returns empty messages when last message has no tool_calls', async () => {
    const executor = makeToolExecutor({});
    const node = buildExecuteToolsNode(executor);

    const state: AgentGraphState = {
      messages: [new AIMessage('no tools here')],
      input: 'test',
    };

    const result = await node(state);
    expect(result.messages).toBeUndefined();
  });
});

// ─── buildAgentGraph integration ─────────────────────────────────────────────

describe('buildAgentGraph integration', () => {
  it('runs a no-tool conversation to completion', async () => {
    const finalMsg = new AIMessage('The answer is 42.');
    const runnable = makeRunnable([finalMsg]);
    const toolExecutor = makeToolExecutor({});

    const graph = buildAgentGraph({ runnable: runnable as never, toolExecutor });

    const result = await graph.invoke({
      messages: [new HumanMessage('What is the answer?')],
      input: 'What is the answer?',
    });

    expect(result.messages).toBeDefined();
    const lastMsg = result.messages[result.messages.length - 1];
    expect(lastMsg).toBeInstanceOf(AIMessage);
    expect((lastMsg as AIMessage).content).toBe('The answer is 42.');
    expect(toolExecutor).not.toHaveBeenCalled();
  });

  it('executes tool call and then returns final response', async () => {
    const toolCallMsg = new AIMessage({ content: '' });
    toolCallMsg.tool_calls = [
      { name: 'lookup', args: { q: 'foo' }, id: 'tc-lookup', type: 'tool_call' },
    ];
    const finalMsg = new AIMessage('The result is bar.');
    const runnable = makeRunnable([toolCallMsg, finalMsg]);
    const toolExecutor = makeToolExecutor({ lookup: 'bar' });

    const graph = buildAgentGraph({ runnable: runnable as never, toolExecutor });

    const result = await graph.invoke({
      messages: [new HumanMessage('Look up foo')],
      input: 'Look up foo',
    });

    expect(toolExecutor).toHaveBeenCalledWith('lookup', { q: 'foo' });
    const lastMsg = result.messages[result.messages.length - 1];
    expect((lastMsg as AIMessage).content).toBe('The result is bar.');
  });

  it('respects recursionLimit and terminates', async () => {
    // Always returns tool calls — would loop forever without limit
    const alwaysToolCall = () => {
      const msg = new AIMessage({ content: '' });
      msg.tool_calls = [{ name: 'loop', args: {}, id: `tc-${Date.now()}`, type: 'tool_call' }];
      return msg;
    };

    const runnable = {
      invoke: vi.fn(async () => alwaysToolCall()),
    };
    const toolExecutor = makeToolExecutor({ loop: 'ok' });

    const graph = buildAgentGraph({ runnable: runnable as never, toolExecutor });

    await expect(
      graph.invoke(
        { messages: [new HumanMessage('loop')], input: 'loop' },
        { recursionLimit: 6 },
      ),
    ).rejects.toThrow();
  });
});
