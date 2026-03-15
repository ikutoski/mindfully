import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { AIMessageChunk, HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures these are initialised before vi.mock factories run
// ---------------------------------------------------------------------------

const {
  mockVerifyIdToken,
  mockAgentsRepo,
  mockSessionsRepo,
  mockMessagesRepo,
  mockExecutionsRepo,
  mockStream,
  mockCreateAgent,
} = vi.hoisted(() => {
  const mockStream = vi.fn();
  const mockCreateAgent = vi.fn().mockReturnValue({
    stream: mockStream,
  });
  return {
    mockVerifyIdToken: vi.fn(),
    mockAgentsRepo: { findById: vi.fn() },
    mockSessionsRepo: {
      create: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
    },
    mockMessagesRepo: {
      count: vi.fn(),
      nextSequenceNumber: vi.fn(),
      create: vi.fn(),
      findBySessionId: vi.fn(),
      createBatch: vi.fn(),
    },
    mockExecutionsRepo: {
      create: vi.fn(),
      update: vi.fn(),
      linkSession: vi.fn(),
    },
    mockStream,
    mockCreateAgent,
  };
});

vi.mock('../../src/db/index.js', () => ({ db: { query: vi.fn() } }));
vi.mock('../../src/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../src/auth/utils/id-token.js', () => ({
  verifyIdToken: mockVerifyIdToken,
}));
vi.mock('../../src/db/repositories/agents.js', () => ({
  agentsRepository: mockAgentsRepo,
}));
vi.mock('../../src/db/repositories/agent-sessions.js', () => ({
  agentSessionsRepository: mockSessionsRepo,
  sessionMessagesRepository: mockMessagesRepo,
}));
vi.mock('../../src/db/repositories/executions.js', () => ({
  executionsRepository: mockExecutionsRepo,
}));
vi.mock('agent', () => ({
  createAgent: mockCreateAgent,
}));
vi.mock('../../src/tools/index.js', () => ({
  getBuiltinTools: vi.fn().mockReturnValue([]),
  executeTool: vi.fn(),
}));

// Static import — picked up after mocks are registered
import agentStreamRouter from '../../src/sse/agent-stream.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const agentId = 'agent-abc';
const userId = 'user-1';
const sessionId = 'sess-1';
const executionId = 'exec-1';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', agentStreamRouter);
  return app;
}

function makeAgent() {
  return { id: agentId, user_id: userId, name: 'Test Agent', system_prompt: null };
}

function makeSession() {
  return { id: sessionId, agent_id: agentId, user_id: userId, title: null, status: 'active', summary: null, summary_up_to: 0, created_at: new Date(), updated_at: new Date() };
}

function makeExecution() {
  return { id: executionId };
}

// SSE response body → array of parsed event data objects
function parseSseEvents(body: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  const lines = body.split('\n');
  let currentEvent = '';
  let currentData = '';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      currentData = line.slice(6).trim();
    } else if (line === '' && currentEvent) {
      try {
        events.push({ event: currentEvent, data: JSON.parse(currentData) });
      } catch {
        events.push({ event: currentEvent, data: currentData });
      }
      currentEvent = '';
      currentData = '';
    }
  }
  return events;
}

// ─── Fake stream helpers ──────────────────────────────────────────────────────

/** Produce a token chunk as [mode, payload] using a real AIMessageChunk */
function tokenChunk(content: string): ['messages', [AIMessageChunk, Record<string, unknown>]] {
  return ['messages', [new AIMessageChunk({ content }), {}]];
}

/** Produce a values chunk with messages as [mode, payload] */
function valuesChunk(messages: unknown[]): ['values', { messages: unknown[] }] {
  return ['values', { messages }];
}

/** Produce a tool start chunk */
function toolStartChunk(name: string, input: unknown, id?: string): ['tools', { event: string; name: string; input: unknown; toolCallId?: string }] {
  return ['tools', { event: 'on_tool_start', name, input, toolCallId: id }];
}

/** Produce a tool end chunk */
function toolEndChunk(name: string, output: unknown, id?: string): ['tools', { event: string; name: string; output: unknown; toolCallId?: string }] {
  return ['tools', { event: 'on_tool_end', name, output, toolCallId: id }];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/agent/:agentId/run', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockVerifyIdToken.mockReturnValue({ sub: userId });
    mockAgentsRepo.findById.mockResolvedValue(makeAgent());
    mockSessionsRepo.create.mockResolvedValue(makeSession());
    mockSessionsRepo.findById.mockResolvedValue(null); // no existing session
    mockMessagesRepo.count.mockResolvedValue(0);
    mockMessagesRepo.nextSequenceNumber.mockResolvedValue(1);
    mockMessagesRepo.create.mockResolvedValue({ id: 'msg-user', session_id: sessionId, sequence_number: 1, role: 'user', content: 'hello', tool_calls: null, tool_call_id: null, tool_name: null, token_count: 0, created_at: new Date() });
    mockMessagesRepo.findBySessionId.mockResolvedValue({ items: [], nextCursor: null });
    mockMessagesRepo.createBatch.mockResolvedValue([]);
    mockExecutionsRepo.create.mockResolvedValue(makeExecution());
    mockExecutionsRepo.update.mockResolvedValue(undefined);
    mockExecutionsRepo.linkSession.mockResolvedValue(undefined);
  });

  it('returns 401 when no Authorization header', async () => {
    const app = makeApp();
    const res = await request(app)
      .post(`/api/agent/${agentId}/run`)
      .send({ message: 'hello' });

    expect(res.status).toBe(401);
  });

  it('returns 401 when token is invalid', async () => {
    mockVerifyIdToken.mockReturnValueOnce(null);
    const app = makeApp();

    const res = await request(app)
      .post(`/api/agent/${agentId}/run`)
      .set('Authorization', 'Bearer bad-token')
      .send({ message: 'hello' });

    expect(res.status).toBe(401);
  });

  it('returns 404 when agent not found', async () => {
    mockAgentsRepo.findById.mockResolvedValueOnce(null);
    const app = makeApp();

    const res = await request(app)
      .post(`/api/agent/${agentId}/run`)
      .set('Authorization', 'Bearer valid-token')
      .send({ message: 'hello' });

    expect(res.status).toBe(404);
  });

  it('returns 400 when message is missing', async () => {
    const app = makeApp();

    const res = await request(app)
      .post(`/api/agent/${agentId}/run`)
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
  });

  it('streams token and done events for successful run', async () => {
    async function* fakeStream() {
      yield tokenChunk('Hello ');
      yield tokenChunk('world');
      yield valuesChunk([new HumanMessage('hi'), new AIMessage('Hello world')]);
    }
    mockStream.mockReturnValueOnce(Promise.resolve(fakeStream()));

    const app = makeApp();
    const res = await request(app)
      .post(`/api/agent/${agentId}/run`)
      .set('Authorization', 'Bearer valid-token')
      .send({ message: 'hi' });

    expect(res.headers['content-type']).toContain('text/event-stream');

    const events = parseSseEvents(res.text);
    const chunkEvents = events.filter((e) => e.event === 'chunk');
    const doneEvents = events.filter((e) => e.event === 'done');

    expect(chunkEvents.length).toBeGreaterThanOrEqual(1);
    expect(doneEvents).toHaveLength(1);
    const doneData = doneEvents[0].data as { sessionId: string };
    expect(doneData.sessionId).toBe(sessionId);
  });

  it('streams error event when agent stream throws', async () => {
    async function* fakeErrorStream() {
      yield tokenChunk('start');
      throw new Error('Something went wrong');
    }
    mockStream.mockReturnValueOnce(Promise.resolve(fakeErrorStream()));

    const app = makeApp();
    const res = await request(app)
      .post(`/api/agent/${agentId}/run`)
      .set('Authorization', 'Bearer valid-token')
      .send({ message: 'hi' });

    const events = parseSseEvents(res.text);
    const errorEvents = events.filter((e) => e.event === 'error');
    expect(errorEvents).toHaveLength(1);
    const errData = errorEvents[0].data as { message: string };
    expect(errData.message).toBe('Something went wrong');
  });

  it('streams tool events during tool execution', async () => {
    async function* fakeToolStream() {
      yield toolStartChunk('search', { q: 'test' }, 'tc-1');
      yield toolEndChunk('search', 'results', 'tc-1');
      yield valuesChunk([]);
    }
    mockStream.mockReturnValueOnce(Promise.resolve(fakeToolStream()));

    const app = makeApp();
    const res = await request(app)
      .post(`/api/agent/${agentId}/run`)
      .set('Authorization', 'Bearer valid-token')
      .send({ message: 'search something' });

    const events = parseSseEvents(res.text);
    const toolEvents = events.filter((e) => e.event === 'tool');
    expect(toolEvents.length).toBeGreaterThanOrEqual(2);

    const startEvent = toolEvents.find((e) => (e.data as { phase: string }).phase === 'start');
    expect(startEvent).toBeDefined();
    expect((startEvent?.data as { name: string }).name).toBe('search');
  });

  it('resumes an existing session when sessionId is provided', async () => {
    mockSessionsRepo.findById.mockResolvedValueOnce(makeSession());
    mockMessagesRepo.count.mockResolvedValueOnce(2); // not first message

    async function* fakeStream() {
      yield valuesChunk([]);
    }
    mockStream.mockReturnValueOnce(Promise.resolve(fakeStream()));

    const app = makeApp();
    const res = await request(app)
      .post(`/api/agent/${agentId}/run`)
      .set('Authorization', 'Bearer valid-token')
      .send({ message: 'follow-up', sessionId });

    const events = parseSseEvents(res.text);
    const doneEvents = events.filter((e) => e.event === 'done');
    expect(doneEvents).toHaveLength(1);
    // Should NOT have called create since session was found
    expect(mockSessionsRepo.create).not.toHaveBeenCalled();
  });

  it('done event contains sessionId', async () => {
    async function* fakeStream() {
      yield valuesChunk([]);
    }
    mockStream.mockReturnValueOnce(Promise.resolve(fakeStream()));

    const app = makeApp();
    const res = await request(app)
      .post(`/api/agent/${agentId}/run`)
      .set('Authorization', 'Bearer valid-token')
      .send({ message: 'hi' });

    const events = parseSseEvents(res.text);
    const doneEvents = events.filter((e) => e.event === 'done');
    expect(doneEvents).toHaveLength(1);
    const doneData = doneEvents[0].data as { sessionId: string };
    expect(doneData.sessionId).toBe(sessionId);
  });

  it('streams error event when the route handler throws unexpectedly', async () => {
    mockExecutionsRepo.create.mockRejectedValueOnce(new Error('DB down'));

    const app = makeApp();
    const res = await request(app)
      .post(`/api/agent/${agentId}/run`)
      .set('Authorization', 'Bearer valid-token')
      .send({ message: 'hi' });

    const events = parseSseEvents(res.text);
    const errorEvents = events.filter((e) => e.event === 'error');
    expect(errorEvents).toHaveLength(1);
    expect((errorEvents[0].data as { message: string }).message).toBe('DB down');
  });

  it('returns 404 when agent belongs to a different user', async () => {
    mockAgentsRepo.findById.mockResolvedValueOnce({ id: agentId, user_id: 'other-user', name: 'Other Agent' });
    const app = makeApp();

    const res = await request(app)
      .post(`/api/agent/${agentId}/run`)
      .set('Authorization', 'Bearer valid-token')
      .send({ message: 'hello' });

    expect(res.status).toBe(404);
  });

  it('does not emit chunk event for ToolMessage in messages stream', async () => {
    async function* fakeStream() {
      // A ToolMessage emitted via messages mode — should be silently skipped
      yield ['messages', [new ToolMessage({ content: 'tool output', tool_call_id: 'tc-1' }), {}]] as ['messages', [ToolMessage, Record<string, unknown>]];
      yield valuesChunk([]);
    }
    mockStream.mockReturnValueOnce(Promise.resolve(fakeStream()));

    const app = makeApp();
    const res = await request(app)
      .post(`/api/agent/${agentId}/run`)
      .set('Authorization', 'Bearer valid-token')
      .send({ message: 'hi' });

    const events = parseSseEvents(res.text);
    const chunkEvents = events.filter((e) => e.event === 'chunk');
    expect(chunkEvents).toHaveLength(0);
    // done event should still fire
    expect(events.filter((e) => e.event === 'done')).toHaveLength(1);
  });

  it('persists AIMessageChunk from finalMessages using isAIMessage check', async () => {
    // LangGraph stores AIMessageChunk (not AIMessage) in graph state due to streaming.
    // The persistence check must use isAIMessage() which returns true for both.
    // inputMessages = [HumanMessage('hi')] (inputLen=1); finalMessages must include those
    // plus the new AI chunk so that freshMessages = finalMessages.slice(1) = [aiChunk].
    const aiChunk = new AIMessageChunk({ content: 'streamed reply' });
    async function* fakeStream() {
      yield tokenChunk('streamed reply');
      yield valuesChunk([new HumanMessage('hi'), aiChunk]);
    }
    mockStream.mockReturnValueOnce(Promise.resolve(fakeStream()));

    const app = makeApp();
    await request(app)
      .post(`/api/agent/${agentId}/run`)
      .set('Authorization', 'Bearer valid-token')
      .send({ message: 'hi' });

    // createBatch should have been called with at least one assistant message
    expect(mockMessagesRepo.createBatch).toHaveBeenCalledOnce();
    const [batch] = mockMessagesRepo.createBatch.mock.calls[0] as [Array<{ role: string; content: string }>];
    const assistantMsgs = batch.filter((m) => m.role === 'assistant');
    expect(assistantMsgs.length).toBeGreaterThanOrEqual(1);
    expect(assistantMsgs[0].content).toBe('streamed reply');
  });
});
