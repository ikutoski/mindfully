import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/db/index.js', () => ({ db: { query: vi.fn() } }));
vi.mock('../../src/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../src/auth/utils/id-token.js', () => ({
  verifyIdToken: vi.fn().mockReturnValue({ sub: 'user-1' }),
}));

const mockAgentsRepo = {
  findById: vi.fn(),
  create: vi.fn(),
  findByUserId: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

const mockSessionsRepo = {
  create: vi.fn(),
  findById: vi.fn(),
  findByAgentId: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
};

const mockMessagesRepo = {
  create: vi.fn(),
  createBatch: vi.fn(),
  findBySessionId: vi.fn(),
  getLastN: vi.fn(),
  count: vi.fn(),
  nextSequenceNumber: vi.fn(),
};

vi.mock('../../src/db/repositories/agents.js', () => ({
  agentsRepository: mockAgentsRepo,
}));

vi.mock('../../src/db/repositories/agent-sessions.js', () => ({
  agentSessionsRepository: mockSessionsRepo,
  sessionMessagesRepository: mockMessagesRepo,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const userId = 'user-1';
const agentId = '00000000-0000-0000-0000-000000000001';
const sessionId = '00000000-0000-0000-0000-000000000002';

function makeCtx() {
  return {
    userId,
    req: { headers: { authorization: 'Bearer fake-token' } } as never,
    res: {} as never,
  };
}

function makeAgent(overrides = {}) {
  return { id: agentId, user_id: userId, name: 'Test Agent', ...overrides };
}

function makeSession(overrides = {}) {
  return {
    id: sessionId,
    agent_id: agentId,
    user_id: userId,
    title: null,
    status: 'active' as const,
    summary: null,
    summary_up_to: 0,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sessionRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('creates a session when agent belongs to user', async () => {
      mockAgentsRepo.findById.mockResolvedValueOnce(makeAgent());
      mockSessionsRepo.create.mockResolvedValueOnce(makeSession());

      const { sessionRouter } = await import('../../src/router/session.js');
      const caller = sessionRouter.createCaller(makeCtx());

      const result = await caller.create({ agentId });
      expect(result.id).toBe(sessionId);
      expect(mockSessionsRepo.create).toHaveBeenCalledWith({
        agent_id: agentId,
        user_id: userId,
      });
    });

    it('throws NOT_FOUND when agent does not exist', async () => {
      mockAgentsRepo.findById.mockResolvedValueOnce(null);

      const { sessionRouter } = await import('../../src/router/session.js');
      const caller = sessionRouter.createCaller(makeCtx());

      await expect(caller.create({ agentId })).rejects.toThrow(TRPCError);
    });

    it('throws NOT_FOUND when agent belongs to different user', async () => {
      mockAgentsRepo.findById.mockResolvedValueOnce(makeAgent({ user_id: 'other-user' }));

      const { sessionRouter } = await import('../../src/router/session.js');
      const caller = sessionRouter.createCaller(makeCtx());

      await expect(caller.create({ agentId })).rejects.toThrow(TRPCError);
    });
  });

  describe('list', () => {
    it('returns sessions for the agent', async () => {
      mockAgentsRepo.findById.mockResolvedValueOnce(makeAgent());
      mockSessionsRepo.findByAgentId.mockResolvedValueOnce({ items: [makeSession()], nextCursor: null });

      const { sessionRouter } = await import('../../src/router/session.js');
      const caller = sessionRouter.createCaller(makeCtx());

      const result = await caller.list({ agentId, limit: 20 });
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });

    it('throws NOT_FOUND for unowned agent', async () => {
      mockAgentsRepo.findById.mockResolvedValueOnce(null);

      const { sessionRouter } = await import('../../src/router/session.js');
      const caller = sessionRouter.createCaller(makeCtx());

      await expect(caller.list({ agentId, limit: 20 })).rejects.toThrow(TRPCError);
    });
  });

  describe('get', () => {
    it('returns session and messages', async () => {
      mockSessionsRepo.findById.mockResolvedValueOnce(makeSession());
      mockMessagesRepo.getLastN.mockResolvedValueOnce([]);

      const { sessionRouter } = await import('../../src/router/session.js');
      const caller = sessionRouter.createCaller(makeCtx());

      const result = await caller.get({ sessionId });
      expect(result.session.id).toBe(sessionId);
      expect(result.messages).toEqual([]);
    });

    it('throws NOT_FOUND when session does not exist', async () => {
      mockSessionsRepo.findById.mockResolvedValueOnce(null);

      const { sessionRouter } = await import('../../src/router/session.js');
      const caller = sessionRouter.createCaller(makeCtx());

      await expect(caller.get({ sessionId })).rejects.toThrow(TRPCError);
    });

    it('throws NOT_FOUND when session belongs to different user', async () => {
      mockSessionsRepo.findById.mockResolvedValueOnce(makeSession({ user_id: 'other-user' }));

      const { sessionRouter } = await import('../../src/router/session.js');
      const caller = sessionRouter.createCaller(makeCtx());

      await expect(caller.get({ sessionId })).rejects.toThrow(TRPCError);
    });
  });

  describe('messages', () => {
    it('returns paginated messages for the session', async () => {
      mockSessionsRepo.findById.mockResolvedValueOnce(makeSession());
      mockMessagesRepo.findBySessionId.mockResolvedValueOnce({ items: [], nextCursor: null });

      const { sessionRouter } = await import('../../src/router/session.js');
      const caller = sessionRouter.createCaller(makeCtx());

      const result = await caller.messages({ sessionId, limit: 50 });
      expect(result.items).toEqual([]);
    });

    it('throws NOT_FOUND when session not owned by user', async () => {
      mockSessionsRepo.findById.mockResolvedValueOnce(null);

      const { sessionRouter } = await import('../../src/router/session.js');
      const caller = sessionRouter.createCaller(makeCtx());

      await expect(caller.messages({ sessionId })).rejects.toThrow(TRPCError);
    });
  });

  describe('archive', () => {
    it('archives the session and returns updated session', async () => {
      const archived = makeSession({ status: 'archived' as const });
      mockSessionsRepo.findById.mockResolvedValueOnce(makeSession());
      mockSessionsRepo.archive.mockResolvedValueOnce(archived);

      const { sessionRouter } = await import('../../src/router/session.js');
      const caller = sessionRouter.createCaller(makeCtx());

      const result = await caller.archive({ sessionId });
      expect(result.status).toBe('archived');
    });

    it('throws NOT_FOUND when session not owned', async () => {
      mockSessionsRepo.findById.mockResolvedValueOnce(null);

      const { sessionRouter } = await import('../../src/router/session.js');
      const caller = sessionRouter.createCaller(makeCtx());

      await expect(caller.archive({ sessionId })).rejects.toThrow(TRPCError);
    });

    it('throws INTERNAL_SERVER_ERROR when archive returns null', async () => {
      mockSessionsRepo.findById.mockResolvedValueOnce(makeSession());
      mockSessionsRepo.archive.mockResolvedValueOnce(null);

      const { sessionRouter } = await import('../../src/router/session.js');
      const caller = sessionRouter.createCaller(makeCtx());

      await expect(caller.archive({ sessionId })).rejects.toThrow(TRPCError);
    });
  });
});
