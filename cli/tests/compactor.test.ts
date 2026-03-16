import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';

import { estimateTokens, maybeCompact } from '../src/compactor.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMessages(count: number, prefix = 'message'): BaseMessage[] {
  return Array.from({ length: count }, (_, i) =>
    i % 2 === 0
      ? new HumanMessage(`${prefix} ${i}`)
      : new AIMessage(`${prefix} ${i}`),
  );
}

/** Build a mock agent with controllable graph.getState / graph.updateState */
function makeAgent(messages: BaseMessage[], throws = false) {
  const getState = throws
    ? vi.fn().mockRejectedValue(new Error('no checkpoint'))
    : vi.fn().mockResolvedValue({ values: { messages } });
  const updateState = vi.fn().mockResolvedValue({} as RunnableConfig);
  return {
    graph: { getState, updateState },
    getState,
    updateState,
  };
}

/** Build a mock model that returns a given AIMessage */
function makeModel(response: AIMessage) {
  return { invoke: vi.fn().mockResolvedValue(response) };
}

const baseConfig: RunnableConfig = { configurable: { thread_id: 'test' } };

// ─── estimateTokens ───────────────────────────────────────────────────────────

describe('estimateTokens', () => {
  it('returns 0 for an empty array', () => {
    expect(estimateTokens([])).toBe(0);
  });

  it('estimates tokens from string content (length / 4, ceiled)', () => {
    const msg = new HumanMessage('abcd'); // 4 chars → 1 token
    expect(estimateTokens([msg])).toBe(1);
  });

  it('sums over multiple messages', () => {
    const msgs = [
      new HumanMessage('abcd'),   // 4 chars
      new AIMessage('efgh'),      // 4 chars
    ];
    expect(estimateTokens(msgs)).toBe(2);
  });

  it('handles array content blocks with text field', () => {
    const msg = new HumanMessage({
      content: [{ type: 'text', text: 'hello world' }], // 11 chars → ceil(11/4) = 3
    });
    expect(estimateTokens([msg])).toBe(3);
  });

  it('ignores array content blocks without text field', () => {
    const msg = new HumanMessage({
      content: [{ type: 'image_url', image_url: { url: 'http://example.com' } }],
    });
    expect(estimateTokens([msg])).toBe(0);
  });

  it('handles mixed string and array content messages', () => {
    const msgs = [
      new HumanMessage('abcdefgh'),  // 8 chars → 2 tokens
      new HumanMessage({ content: [{ type: 'text', text: 'abcdefgh' }] }),  // 8 chars → 2 tokens
    ];
    expect(estimateTokens(msgs)).toBe(4);
  });
});

// ─── maybeCompact ─────────────────────────────────────────────────────────────

describe('maybeCompact', () => {
  // ── no compaction needed ──────────────────────────────────────────────────

  it('returns { compacted: false } when under both thresholds', async () => {
    const messages = makeMessages(5); // 5 messages, tiny content
    const agent = makeAgent(messages);
    const model = makeModel(new AIMessage('summary'));

    const result = await maybeCompact(agent as any, baseConfig, model as any);

    expect(result).toEqual({ compacted: false, removedCount: 0 });
    expect(agent.updateState).not.toHaveBeenCalled();
  });

  it('returns { compacted: false } when getState throws (no checkpoint yet)', async () => {
    const agent = makeAgent([], /* throws */ true);
    const model = makeModel(new AIMessage('summary'));

    const result = await maybeCompact(agent as any, baseConfig, model as any);

    expect(result).toEqual({ compacted: false, removedCount: 0 });
    expect(agent.updateState).not.toHaveBeenCalled();
  });

  it('returns { compacted: false } when messages array is empty', async () => {
    const agent = makeAgent([]);
    const model = makeModel(new AIMessage('summary'));

    const result = await maybeCompact(agent as any, baseConfig, model as any);

    expect(result).toEqual({ compacted: false, removedCount: 0 });
  });

  it('skips compaction when window is too small (≤ keepRecent + 1)', async () => {
    // With keepRecent=6, we need > 7 messages to have a compactable middle.
    // 7 messages: windowEnd = 7-6 = 1, windowStart = 0 (no system msg), so 1 <= 0 is false... 
    // Actually: windowEnd(1) > windowStart(0) is true for 7 messages without a system.
    // Make it 6 messages with > 20 count threshold (need >20): use messageThreshold=4, keepRecent=6.
    // With messageThreshold=4, count=7, keepRecent=6: windowEnd=1 > windowStart=0 → compacts.
    // Use keepRecent=7 so that windowEnd=7-7=0 <= windowStart=0 → skip.
    const messages = makeMessages(21); // triggers count threshold
    const agent = makeAgent(messages);
    const model = makeModel(new AIMessage('summary'));

    const result = await maybeCompact(agent as any, baseConfig, model as any, {
      messageThreshold: 20,
      keepRecent: 25, // keep more than the total → window too small
    });

    expect(result).toEqual({ compacted: false, removedCount: 0 });
    expect(agent.updateState).not.toHaveBeenCalled();
  });

  // ── triggered by message count ────────────────────────────────────────────

  it('triggers compaction when message count exceeds messageThreshold', async () => {
    const messages = makeMessages(10); // > 5
    const agent = makeAgent(messages);
    const model = makeModel(new AIMessage('This is the summary.'));

    const result = await maybeCompact(agent as any, baseConfig, model as any, {
      tokenThreshold: 999_999, // won't trigger by tokens
      messageThreshold: 5,
      keepRecent: 3,
    });

    expect(result.compacted).toBe(true);
    expect(result.removedCount).toBeGreaterThan(0);
    expect(agent.updateState).toHaveBeenCalledOnce();
  });

  // ── triggered by token count ──────────────────────────────────────────────

  it('triggers compaction when token estimate exceeds tokenThreshold', async () => {
    // 10 messages × 400 chars each → ~1000 tokens > threshold of 100
    const longMessages = Array.from({ length: 10 }, (_, i) =>
      i % 2 === 0
        ? new HumanMessage('x'.repeat(400))
        : new AIMessage('x'.repeat(400)),
    );
    const agent = makeAgent(longMessages);
    const model = makeModel(new AIMessage('summary text'));

    const result = await maybeCompact(agent as any, baseConfig, model as any, {
      tokenThreshold: 100,
      messageThreshold: 999_999,
      keepRecent: 3,
    });

    expect(result.compacted).toBe(true);
    expect(agent.updateState).toHaveBeenCalledOnce();
  });

  // ── replacement structure ─────────────────────────────────────────────────

  it('keeps SystemMessage at index 0 after compaction', async () => {
    const system = new SystemMessage('You are a helpful assistant.');
    const messages: BaseMessage[] = [
      system,
      ...makeMessages(20),
    ];
    const agent = makeAgent(messages);
    const summary = new AIMessage('Summary of conversation.');
    const model = makeModel(summary);

    await maybeCompact(agent as any, baseConfig, model as any, {
      tokenThreshold: 999_999,
      messageThreshold: 5,
      keepRecent: 3,
    });

    const [, updateValues] = agent.updateState.mock.calls[0] as [RunnableConfig, { messages: BaseMessage[] }, string];
    expect(updateValues.messages[0]).toBeInstanceOf(SystemMessage);
    expect((updateValues.messages[0] as SystemMessage).content).toBe('You are a helpful assistant.');
  });

  it('inserts HumanMessage("Previous conversation summary:") at index 1', async () => {
    const system = new SystemMessage('sys');
    const messages: BaseMessage[] = [system, ...makeMessages(20)];
    const agent = makeAgent(messages);
    const model = makeModel(new AIMessage('summary'));

    await maybeCompact(agent as any, baseConfig, model as any, {
      tokenThreshold: 999_999,
      messageThreshold: 5,
      keepRecent: 3,
    });

    const [, updateValues] = agent.updateState.mock.calls[0] as [RunnableConfig, { messages: BaseMessage[] }, string];
    const idx1 = updateValues.messages[1];
    expect(idx1).toBeInstanceOf(HumanMessage);
    expect((idx1 as HumanMessage).content).toBe('Previous conversation summary:');
  });

  it('inserts the model summary AIMessage at index 2', async () => {
    const system = new SystemMessage('sys');
    const messages: BaseMessage[] = [system, ...makeMessages(20)];
    const summaryMsg = new AIMessage('Here is the summary.');
    const agent = makeAgent(messages);
    const model = makeModel(summaryMsg);

    await maybeCompact(agent as any, baseConfig, model as any, {
      tokenThreshold: 999_999,
      messageThreshold: 5,
      keepRecent: 3,
    });

    const [, updateValues] = agent.updateState.mock.calls[0] as [RunnableConfig, { messages: BaseMessage[] }, string];
    expect(updateValues.messages[2]).toBe(summaryMsg);
  });

  it('preserves the last keepRecent messages after compaction', async () => {
    const messages = makeMessages(10);
    const agent = makeAgent(messages);
    const model = makeModel(new AIMessage('summary'));
    const keepRecent = 4;

    await maybeCompact(agent as any, baseConfig, model as any, {
      tokenThreshold: 999_999,
      messageThreshold: 5,
      keepRecent,
    });

    const [, updateValues] = agent.updateState.mock.calls[0] as [RunnableConfig, { messages: BaseMessage[] }, string];
    const replacement = updateValues.messages;
    // last keepRecent messages should be the last keepRecent of the original
    const originalTail = messages.slice(-keepRecent);
    const replacementTail = replacement.slice(-keepRecent);
    expect(replacementTail).toEqual(originalTail);
  });

  it('calls graph.updateState with "model_request" as the node', async () => {
    const messages = makeMessages(10);
    const agent = makeAgent(messages);
    const model = makeModel(new AIMessage('summary'));

    await maybeCompact(agent as any, baseConfig, model as any, {
      tokenThreshold: 999_999,
      messageThreshold: 5,
      keepRecent: 3,
    });

    const [, , node] = agent.updateState.mock.calls[0] as [RunnableConfig, unknown, string];
    expect(node).toBe('model_request');
  });

  it('returns correct removedCount', async () => {
    // 10 messages (even=Human, odd=AI), keepRecent=3, no SystemMessage.
    // Initial windowEnd = 10-3 = 7 → messages[7] is AIMessage (odd index).
    // Boundary snap walks back to index 6 (HumanMessage).
    // So compactWindow = messages[0..5] = 6 messages, keep = messages[6..9].
    const messages = makeMessages(10);
    const agent = makeAgent(messages);
    const model = makeModel(new AIMessage('summary'));

    const result = await maybeCompact(agent as any, baseConfig, model as any, {
      tokenThreshold: 999_999,
      messageThreshold: 5,
      keepRecent: 3,
    });

    // windowStart=0, windowEnd snapped to 6 → compacting indices 0..5 = 6 messages
    expect(result.removedCount).toBe(6);
    expect(result.compacted).toBe(true);
  });

  it('works without a SystemMessage (no system at index 0)', async () => {
    const messages = makeMessages(10); // all Human/AI alternating, no SystemMessage
    const agent = makeAgent(messages);
    const model = makeModel(new AIMessage('summary'));

    const result = await maybeCompact(agent as any, baseConfig, model as any, {
      tokenThreshold: 999_999,
      messageThreshold: 5,
      keepRecent: 3,
    });

    expect(result.compacted).toBe(true);
    const [, updateValues] = agent.updateState.mock.calls[0] as [RunnableConfig, { messages: BaseMessage[] }, string];
    // No system message → index 0 should be the HumanMessage summary header
    expect(updateValues.messages[0]).toBeInstanceOf(HumanMessage);
    expect((updateValues.messages[0] as HumanMessage).content).toBe('Previous conversation summary:');
  });

  // ── boundary snapping ─────────────────────────────────────────────────────

  it('snaps windowEnd back when it lands on a ToolMessage', async () => {
    // Build a sequence that mirrors the real-world 30dc8e39 bug:
    // system, h, ai(tool_calls), tool, h, ai(tool_calls), tool, ai, h, ai
    // indices: 0  1  2            3     4  5               6     7   8  9
    // With keepRecent=4: initial windowEnd = 10-4 = 6 → messages[6] = ToolMessage.
    // Should snap back to index 4 (HumanMessage), compacting indices 1..3 = 3 messages.
    const toolMsg = (id: string) =>
      new ToolMessage({ content: 'result', tool_call_id: id });
    const aiWithTool = (id: string) =>
      new AIMessage({ content: '', tool_calls: [{ id, name: 'fn', args: {} }] });

    const messages: BaseMessage[] = [
      new SystemMessage('sys'),          // 0
      new HumanMessage('hi'),            // 1
      aiWithTool('call_1'),              // 2
      toolMsg('call_1'),                 // 3
      new HumanMessage('next'),          // 4
      aiWithTool('call_2'),              // 5
      toolMsg('call_2'),                 // 6  ← initial windowEnd lands here
      new AIMessage('ok'),               // 7
      new HumanMessage('done'),          // 8
      new AIMessage('bye'),              // 9
    ];
    const agent = makeAgent(messages);
    const model = makeModel(new AIMessage('summary'));

    const result = await maybeCompact(agent as any, baseConfig, model as any, {
      tokenThreshold: 999_999,
      messageThreshold: 5,
      keepRecent: 4,
    });

    expect(result.compacted).toBe(true);

    const [, updateValues] = agent.updateState.mock.calls[0] as [RunnableConfig, { messages: BaseMessage[] }, string];
    const replacement = updateValues.messages;

    // The tail must not start with a ToolMessage
    const tailStart = replacement.findIndex((m) => m instanceof HumanMessage && (m as HumanMessage).content !== 'Previous conversation summary:');
    const firstTailMsg = replacement[tailStart];
    expect(firstTailMsg).toBeInstanceOf(HumanMessage);

    // No orphaned ToolMessage (i.e. every ToolMessage is preceded by an AI msg with tool_calls)
    for (let i = 0; i < replacement.length; i++) {
      if (replacement[i] instanceof ToolMessage) {
        const prev = replacement[i - 1];
        expect(prev).toBeInstanceOf(AIMessage);
        expect((prev as AIMessage).tool_calls?.length).toBeGreaterThan(0);
      }
    }
  });

  it('snaps windowEnd back when it lands on a mid-turn AIMessage', async () => {
    // system, h, ai, h, ai(tool_calls), tool, ai, h, ai, h, ai
    // indices: 0  1  2  3  4             5     6   7  8   9  10
    // With keepRecent=5: initial windowEnd = 11-5 = 6 → messages[6] = AIMessage (no tool_calls).
    // Should snap back to index 3 (HumanMessage), compacting indices 1..2 = 2 messages.
    const toolMsg = new ToolMessage({ content: 'out', tool_call_id: 'c1' });
    const aiWithTool = new AIMessage({ content: '', tool_calls: [{ id: 'c1', name: 'fn', args: {} }] });

    const messages: BaseMessage[] = [
      new SystemMessage('sys'),    // 0
      new HumanMessage('a'),       // 1
      new AIMessage('b'),          // 2
      new HumanMessage('c'),       // 3
      aiWithTool,                  // 4
      toolMsg,                     // 5
      new AIMessage('d'),          // 6  ← initial windowEnd lands here
      new HumanMessage('e'),       // 7
      new AIMessage('f'),          // 8
      new HumanMessage('g'),       // 9
      new AIMessage('h'),          // 10
    ];
    const agent = makeAgent(messages);
    const model = makeModel(new AIMessage('summary'));

    const result = await maybeCompact(agent as any, baseConfig, model as any, {
      tokenThreshold: 999_999,
      messageThreshold: 5,
      keepRecent: 5,
    });

    expect(result.compacted).toBe(true);

    const [, updateValues] = agent.updateState.mock.calls[0] as [RunnableConfig, { messages: BaseMessage[] }, string];
    const replacement = updateValues.messages;

    // Every ToolMessage in replacement must be preceded by an AI with tool_calls
    for (let i = 0; i < replacement.length; i++) {
      if (replacement[i] instanceof ToolMessage) {
        const prev = replacement[i - 1];
        expect(prev).toBeInstanceOf(AIMessage);
        expect((prev as AIMessage).tool_calls?.length).toBeGreaterThan(0);
      }
    }
  });

  it('returns { compacted: false } when no safe HumanMessage boundary exists after snapping', async () => {
    // After the system message, all messages are AI or tool — no HumanMessage to snap to.
    // windowEnd snaps all the way to windowStart → should bail out.
    const toolMsg = new ToolMessage({ content: 'out', tool_call_id: 'c1' });
    const aiWithTool = new AIMessage({ content: '', tool_calls: [{ id: 'c1', name: 'fn', args: {} }] });

    const messages: BaseMessage[] = [
      new SystemMessage('sys'),  // 0 — windowStart = 1
      aiWithTool,                // 1
      toolMsg,                   // 2
      new AIMessage('done'),     // 3
      aiWithTool,                // 4
      toolMsg,                   // 5
      new AIMessage('end'),      // 6
    ];
    const agent = makeAgent(messages);
    const model = makeModel(new AIMessage('summary'));

    // keepRecent=3 → initial windowEnd = 7-3 = 4 → messages[4] = AIMessage (tool_calls)
    // snap: 4→AI, 3→AI, 2→Tool, 1→AI — never hits a HumanMessage → bails
    const result = await maybeCompact(agent as any, baseConfig, model as any, {
      tokenThreshold: 999_999,
      messageThreshold: 5,
      keepRecent: 3,
    });

    expect(result).toEqual({ compacted: false, removedCount: 0 });
    expect(agent.updateState).not.toHaveBeenCalled();
  });
});
