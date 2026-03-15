import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIMessage, AIMessageChunk, HumanMessage, ToolMessage } from '@langchain/core/messages';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const {
  mockPrint,
  mockPrintln,
  mockAddTool,
  mockCompleteTool,
  mockRendererStop,
} = vi.hoisted(() => {
  const mockAddTool = vi.fn();
  const mockCompleteTool = vi.fn();
  const mockRendererStop = vi.fn();
  return {
    mockPrint: vi.fn(),
    mockPrintln: vi.fn(),
    mockAddTool,
    mockCompleteTool,
    mockRendererStop,
  };
});

vi.mock('../src/render.js', () => ({
  print: mockPrint,
  println: mockPrintln,
  renderHeader: vi.fn(),
  renderMarkdown: vi.fn((text: string) => text),
  renderError: vi.fn(),
  ConcurrentToolRenderer: vi.fn(() => ({
    addTool: mockAddTool,
    completeTool: mockCompleteTool,
    stop: mockRendererStop,
  })),
}));

import { runExchange } from '../src/run-agent.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function streamedText(): string {
  return mockPrint.mock.calls
    .map((args) => (typeof args[0] === 'string' ? args[0] : ''))
    .join('');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runExchange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('streams response tokens for simple Q&A (no tools)', async () => {
    const finalMsg = new AIMessage({ content: 'The answer is 42', tool_calls: [] });

    async function* fakeStream() {
      yield ['messages', [new AIMessageChunk({ content: 'The answer is 42' }), { langgraph_node: 'model_request' }]];
      yield ['updates', { model_request: { messages: [finalMsg] } }];
      yield ['values', { messages: [new HumanMessage('what is the answer?'), finalMsg] }];
    }

    const mockGraph = { stream: vi.fn().mockReturnValue(fakeStream()) };
    await runExchange({ prompt: 'what is the answer?', messages: [], graph: mockGraph as any, cwd: '/tmp' });

    expect(streamedText()).toContain('The answer is 42');
    expect(mockAddTool).not.toHaveBeenCalled();
  });

  it('streams intermediate text before a tool call', async () => {
    const intermediateMsg = new AIMessage({
      content: 'Let me check.',
      tool_calls: [{ name: 'bash', args: { command: 'ls' }, id: 'tc-1', type: 'tool_call' }],
    });
    const toolResult = new ToolMessage({ content: 'file.txt', tool_call_id: 'tc-1', name: 'bash' });
    const finalMsg = new AIMessage({ content: 'Found: file.txt', tool_calls: [] });

    async function* fakeStream() {
      yield ['messages', [new AIMessageChunk({ content: 'Let me check.' }), { langgraph_node: 'model_request' }]];
      yield ['messages', [new AIMessageChunk({ content: '', tool_calls: [{ name: 'bash', args: { command: 'ls' }, id: 'tc-1', type: 'tool_call' }] }), { langgraph_node: 'model_request' }]];
      yield ['updates', { tools: { messages: [toolResult] } }];
      yield ['messages', [new AIMessageChunk({ content: 'Found: file.txt' }), { langgraph_node: 'model_request' }]];
      yield ['updates', { model_request: { messages: [finalMsg] } }];
      yield ['values', { messages: [new HumanMessage('ls'), intermediateMsg, toolResult, finalMsg] }];
    }

    const mockGraph = { stream: vi.fn().mockReturnValue(fakeStream()) };
    await runExchange({ prompt: 'ls', messages: [], graph: mockGraph as any, cwd: '/tmp' });

    expect(streamedText()).toContain('Let me check.');
    expect(streamedText()).toContain('Found: file.txt');
  });

  it('prints blank line before first tool call', async () => {
    const toolResult = new ToolMessage({ content: 'hi', tool_call_id: 'tc-1', name: 'bash' });
    const finalMsg = new AIMessage({ content: 'Done.', tool_calls: [] });

    async function* fakeStream() {
      yield ['messages', [new AIMessageChunk({ content: '', tool_calls: [{ name: 'bash', args: { command: 'echo hi' }, id: 'tc-1', type: 'tool_call' }] }), { langgraph_node: 'model_request' }]];
      yield ['updates', { tools: { messages: [toolResult] } }];
      yield ['updates', { model_request: { messages: [finalMsg] } }];
      yield ['values', { messages: [new HumanMessage('echo'), toolResult, finalMsg] }];
    }

    const mockGraph = { stream: vi.fn().mockReturnValue(fakeStream()) };
    await runExchange({ prompt: 'echo', messages: [], graph: mockGraph as any, cwd: '/tmp' });

    // println() called with no args → blank line before tools
    expect(mockPrintln).toHaveBeenCalledWith();
  });

  it('only prints one blank line per tool section, not per tool', async () => {
    const toolResult1 = new ToolMessage({ content: 'a', tool_call_id: 'tc-1', name: 'bash' });
    const toolResult2 = new ToolMessage({ content: 'b', tool_call_id: 'tc-2', name: 'bash' });
    const finalMsg = new AIMessage({ content: 'Done.', tool_calls: [] });

    async function* fakeStream() {
      // Both tool calls arrive in a single chunk
      yield ['messages', [new AIMessageChunk({ content: '', tool_calls: [
        { name: 'bash', args: { command: 'a' }, id: 'tc-1', type: 'tool_call' },
        { name: 'bash', args: { command: 'b' }, id: 'tc-2', type: 'tool_call' },
      ] }), { langgraph_node: 'model_request' }]];
      yield ['updates', { tools: { messages: [toolResult1, toolResult2] } }];
      yield ['updates', { model_request: { messages: [finalMsg] } }];
      yield ['values', { messages: [finalMsg] }];
    }

    const mockGraph = { stream: vi.fn().mockReturnValue(fakeStream()) };
    await runExchange({ prompt: 'x', messages: [], graph: mockGraph as any, cwd: '/tmp' });

    const blankLineCalls = mockPrintln.mock.calls.filter((args) => args.length === 0).length;
    // One blank line before the tool section, one after (from updates['tools'] handler)
    expect(blankLineCalls).toBe(2);
    expect(mockAddTool).toHaveBeenCalledTimes(2);
  });

  it('calls addTool and completeTool on ConcurrentToolRenderer', async () => {
    const toolResult = new ToolMessage({ content: 'file.txt', tool_call_id: 'tc-1', name: 'bash' });
    const finalMsg = new AIMessage({ content: 'Done.', tool_calls: [] });

    async function* fakeStream() {
      yield ['messages', [new AIMessageChunk({ content: '', tool_calls: [{ name: 'bash', args: { command: 'ls' }, id: 'tc-1', type: 'tool_call' }] }), { langgraph_node: 'model_request' }]];
      yield ['updates', { tools: { messages: [toolResult] } }];
      yield ['updates', { model_request: { messages: [finalMsg] } }];
      yield ['values', { messages: [new HumanMessage('ls'), toolResult, finalMsg] }];
    }

    const mockGraph = { stream: vi.fn().mockReturnValue(fakeStream()) };
    await runExchange({ prompt: 'ls', messages: [], graph: mockGraph as any, cwd: '/tmp' });

    expect(mockAddTool).toHaveBeenCalledOnce();
    expect(mockAddTool).toHaveBeenCalledWith('tc-1', 'bash', { command: 'ls' });
    expect(mockCompleteTool).toHaveBeenCalledOnce();
    expect(mockCompleteTool).toHaveBeenCalledWith('tc-1', 'file.txt', undefined);
  });

  it('returns finalMessages from values mode', async () => {
    const humanMsg = new HumanMessage('hi');
    const aiMsg = new AIMessage({ content: 'hello', tool_calls: [] });

    async function* fakeStream() {
      yield ['messages', [new AIMessageChunk({ content: 'hello' }), { langgraph_node: 'model_request' }]];
      yield ['values', { messages: [humanMsg, aiMsg] }];
    }

    const mockGraph = { stream: vi.fn().mockReturnValue(fakeStream()) };
    const result = await runExchange({ prompt: 'hi', messages: [], graph: mockGraph as any, cwd: '/tmp' });

    expect(result).toHaveLength(2);
    expect(result[1]).toBe(aiMsg);
  });

  it('stops renderer in finally', async () => {
    const aiMsg = new AIMessage({ content: 'hi', tool_calls: [] });

    async function* fakeStream() {
      yield ['messages', [new AIMessageChunk({ content: 'hi' }), { langgraph_node: 'model_request' }]];
      yield ['values', { messages: [aiMsg] }];
    }

    const mockGraph = { stream: vi.fn().mockReturnValue(fakeStream()) };
    await runExchange({ prompt: 'hi', messages: [], graph: mockGraph as any, cwd: '/tmp' });

    expect(mockRendererStop).toHaveBeenCalled();
  });
});
