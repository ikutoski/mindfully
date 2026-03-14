import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures these are initialised before vi.mock factories run
// ---------------------------------------------------------------------------

const {
  mockVerifyIdToken,
  mockAgentsRepo,
  mockSessionsRepo,
  mockMessagesRepo,
  mockExecutionsRepo,
  mockBuildMessages,
  mockMaybeSummarise,
  mockUpsertMessages,
  mockStream,
} = vi.hoisted(() => ({
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
  mockBuildMessages: vi.fn(),
  mockMaybeSummarise: vi.fn(),
  mockUpsertMessages: vi.fn(),
  mockStream: vi.fn(),
}));

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
vi.mock('core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('core')>();
  return {
    ...actual,
    ContextManager: vi.fn().mockImplementation(() => ({
      buildMessages: mockBuildMessages,
      maybeSummarise: mockMaybeSummarise,
      upsertMessages: mockUpsertMessages,
    })),
  };
});
vi.mock('agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('agent')>();
  return {
    ...actual,
    AgentRunner: vi.fn().mockImplementation(() => ({
      stream: mockStream,
    })),
  };
});
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
  return { id: agentId, user_id: userId, name: 'Test Agent' };
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
    mockBuildMessages.mockResolvedValue([]);
    mockMaybeSummarise.mockResolvedValue(null);
    mockUpsertMessages.mockResolvedValue(undefined);
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
      yield { type: 'token', content: 'Hello ' };
      yield { type: 'token', content: 'world' };
      yield { type: 'done', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hello world' }], cost: undefined };
    }
    mockStream.mockReturnValueOnce(fakeStream());

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

  it('streams error event when agent stream yields error', async () => {
    async function* fakeErrorStream() {
      yield { type: 'error', message: 'Something went wrong' };
    }
    mockStream.mockReturnValueOnce(fakeErrorStream());

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
      yield { type: 'tool_start', name: 'search', args: { q: 'test' }, id: 'tc-1' };
      yield { type: 'tool_result', name: 'search', result: 'results', id: 'tc-1' };
      yield { type: 'done', messages: [], cost: undefined };
    }
    mockStream.mockReturnValueOnce(fakeToolStream());

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
      yield { type: 'done', messages: [], cost: undefined };
    }
    mockStream.mockReturnValueOnce(fakeStream());

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

  it('includes cost info in done event when cost is present', async () => {
    const cost = { inputTokens: 10, outputTokens: 20, totalCost: 0.001, totalTokens: 30 };
    async function* fakeStream() {
      yield {
        type: 'done',
        messages: [{ role: 'assistant', content: 'reply', tool_calls: null }],
        cost,
      };
    }
    mockStream.mockReturnValueOnce(fakeStream());

    const app = makeApp();
    const res = await request(app)
      .post(`/api/agent/${agentId}/run`)
      .set('Authorization', 'Bearer valid-token')
      .send({ message: 'hi' });

    const events = parseSseEvents(res.text);
    const doneEvents = events.filter((e) => e.event === 'done');
    expect(doneEvents).toHaveLength(1);
    const doneData = doneEvents[0].data as { cost: { inputTokens: number } | null };
    expect(doneData.cost?.inputTokens).toBe(10);
  });

  it('streams error event when the route handler throws unexpectedly', async () => {
    mockExecutionsRepo.create.mockRejectedValueOnce(new Error('DB down'));

    async function* fakeStream() {
      yield { type: 'done', messages: [], cost: undefined };
    }
    mockStream.mockReturnValueOnce(fakeStream());

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
});
