import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HumanMessage, AIMessage, SystemMessage, ToolMessage, RemoveMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';

import { estimateTokens, maybeCompact } from 'agent';

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

  it('sends RemoveMessages for all compacted messages (SystemMessage stays in state, not in payload)', async () => {
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
    // All leading messages should be RemoveMessages (for the compacted window)
    const removeMessages = updateValues.messages.filter((m) => m instanceof RemoveMessage);
    expect(removeMessages.length).toBeGreaterThan(0);
    // SystemMessage is NOT in the payload — it stays in state untouched
    const systemInPayload = updateValues.messages.find((m) => m instanceof SystemMessage);
    expect(systemInPayload).toBeUndefined();
  });

  it('inserts HumanMessage("Previous conversation summary:") after all RemoveMessages', async () => {
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
    // After all RemoveMessages comes the HumanMessage summary header
    const firstNonRemove = updateValues.messages.find((m) => !(m instanceof RemoveMessage));
    expect(firstNonRemove).toBeInstanceOf(HumanMessage);
    expect((firstNonRemove as HumanMessage).content).toBe('Previous conversation summary:');
  });

  it('inserts the model summary AIMessage as the last element', async () => {
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
    const last = updateValues.messages[updateValues.messages.length - 1];
    expect(last).toBe(summaryMsg);
  });

  it('does NOT include toKeep messages in the updateState payload (they stay in state)', async () => {
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
    const payload = updateValues.messages;
    // Payload = N RemoveMessages + HumanMessage + AIMessage (summary pair only)
    const nonRemove = payload.filter((m) => !(m instanceof RemoveMessage));
    expect(nonRemove).toHaveLength(2); // only the summary pair
    // The tail messages that were kept are NOT re-sent
    const originalTail = messages.slice(-keepRecent);
    for (const tailMsg of originalTail) {
      expect(payload).not.toContain(tailMsg);
    }
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
    // First non-RemoveMessage should be the summary header HumanMessage
    const firstNonRemove = updateValues.messages.find((m) => !(m instanceof RemoveMessage));
    expect(firstNonRemove).toBeInstanceOf(HumanMessage);
    expect((firstNonRemove as HumanMessage).content).toBe('Previous conversation summary:');
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
    const aiWithTool = (callId: string, msgId: string) =>
      new AIMessage({ content: '', id: msgId, tool_calls: [{ id: callId, name: 'fn', args: {} }] });

    const messages: BaseMessage[] = [
      new SystemMessage({ content: 'sys', id: 'id-0' }),
      new HumanMessage({ content: 'hi', id: 'id-1' }),
      aiWithTool('call_1', 'id-2'),
      new ToolMessage({ content: 'result', tool_call_id: 'call_1', id: 'id-3' }),
      new HumanMessage({ content: 'next', id: 'id-4' }),
      aiWithTool('call_2', 'id-5'),
      new ToolMessage({ content: 'result', tool_call_id: 'call_2', id: 'id-6' }),
      new AIMessage({ content: 'ok', id: 'id-7' }),
      new HumanMessage({ content: 'done', id: 'id-8' }),
      new AIMessage({ content: 'bye', id: 'id-9' }),
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
    const payload = updateValues.messages;

    // Payload must be: RemoveMessages... + HumanMessage(summary header) + AIMessage(summary)
    const removeMessages = payload.filter((m) => m instanceof RemoveMessage);
    expect(removeMessages.length).toBeGreaterThan(0);

    const nonRemove = payload.filter((m) => !(m instanceof RemoveMessage));
    expect(nonRemove).toHaveLength(2);
    expect(nonRemove[0]).toBeInstanceOf(HumanMessage);
    expect((nonRemove[0] as HumanMessage).content).toBe('Previous conversation summary:');
    expect(nonRemove[1]).toBeInstanceOf(AIMessage);

    // Snap: windowEnd snaps from 6 back to 4 (HumanMessage).
    // windowStart=1 (system at 0), toCompact = messages[1..3] → ids id-1, id-2, id-3
    const removedIds = new Set(removeMessages.map((m) => (m as RemoveMessage).id));
    expect(removedIds.has('id-1')).toBe(true);
    expect(removedIds.has('id-2')).toBe(true);
    expect(removedIds.has('id-3')).toBe(true);
    // system + tail messages must NOT be in removed set
    expect(removedIds.has('id-0')).toBe(false);
    for (const tailId of ['id-4', 'id-5', 'id-6', 'id-7', 'id-8', 'id-9']) {
      expect(removedIds.has(tailId)).toBe(false);
    }
  });

  it('snaps windowEnd back when it lands on a mid-turn AIMessage', async () => {
    // system, h, ai, h, ai(tool_calls), tool, ai, h, ai, h, ai
    // indices: 0  1  2  3  4             5     6   7  8   9  10
    // With keepRecent=5: initial windowEnd = 11-5 = 6 → messages[6] = AIMessage (no tool_calls).
    // Should snap back to index 3 (HumanMessage), compacting indices 1..2 = 2 messages.
    const toolMsg = new ToolMessage({ content: 'out', tool_call_id: 'c1', id: 'id-5' });
    const aiWithTool = new AIMessage({ content: '', id: 'id-4', tool_calls: [{ id: 'c1', name: 'fn', args: {} }] });

    const messages: BaseMessage[] = [
      new SystemMessage({ content: 'sys', id: 'id-0' }),
      new HumanMessage({ content: 'a', id: 'id-1' }),
      new AIMessage({ content: 'b', id: 'id-2' }),
      new HumanMessage({ content: 'c', id: 'id-3' }),
      aiWithTool,                  // 4
      toolMsg,                     // 5
      new AIMessage({ content: 'd', id: 'id-6' }),  // ← initial windowEnd
      new HumanMessage({ content: 'e', id: 'id-7' }),
      new AIMessage({ content: 'f', id: 'id-8' }),
      new HumanMessage({ content: 'g', id: 'id-9' }),
      new AIMessage({ content: 'h', id: 'id-10' }),
    ];
    const agent = makeAgent(messages);
    const model = makeModel(new AIMessage('summary'));

    const result = await maybeCompact(agent as any, baseConfig, model as any, {
      tokenThreshold: 999_999,
      messageThreshold: 5,
      keepRecent: 5,
    });

    expect(result.compacted).toBe(true);
    // Snap: windowEnd snaps from 6 to 3 (HumanMessage 'c').
    // toCompact = messages[1..2] = id-1, id-2
    expect(result.removedCount).toBe(2);

    const [, updateValues] = agent.updateState.mock.calls[0] as [RunnableConfig, { messages: BaseMessage[] }, string];
    const payload = updateValues.messages;

    const removeMessages = payload.filter((m) => m instanceof RemoveMessage);
    expect(removeMessages).toHaveLength(2);

    const removedIds = new Set(removeMessages.map((m) => (m as RemoveMessage).id));
    expect(removedIds.has('id-1')).toBe(true);
    expect(removedIds.has('id-2')).toBe(true);
    // The tool-call pair (id-4, id-5) must NOT be removed — they are in the kept tail
    expect(removedIds.has('id-4')).toBe(false);
    expect(removedIds.has('id-5')).toBe(false);

    // Payload contains no ToolMessages (only RemoveMessages + summary pair)
    expect(payload.some((m) => m instanceof ToolMessage)).toBe(false);
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
