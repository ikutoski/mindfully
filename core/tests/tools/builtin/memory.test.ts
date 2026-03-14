import { describe, it, expect, vi } from 'vitest';
import { createMemorySearchTool } from '../../../src/tools/builtin/memory-search.js';
import { createMemoryGetTool } from '../../../src/tools/builtin/memory-get.js';
import type { MemoryService } from '../../../src/memory/service.js';
import type { MemorySearchResult, MemoryEntry } from '../../../src/memory/service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: 'entry-1',
    userId: 'user-1',
    agentId: 'agent-1',
    content: 'test content',
    memoryType: 'user',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeSearchResult(entry: MemoryEntry, score = 0.9): MemorySearchResult {
  return { entry, score };
}

function makeMockService(overrides: Partial<MemoryService> = {}): MemoryService {
  return {
    search: vi.fn().mockResolvedValue([]),
    getRecent: vi.fn().mockResolvedValue([]),
    add: vi.fn(),
    delete: vi.fn(),
    initialize: vi.fn(),
    getMemoryFile: vi.fn().mockResolvedValue(''),
    updateMemoryFile: vi.fn(),
    ...overrides,
  } as unknown as MemoryService;
}

// ---------------------------------------------------------------------------
// memory_search tool
// ---------------------------------------------------------------------------

describe('memory_search tool', () => {
  it('returns empty results when service returns nothing', async () => {
    const service = makeMockService();
    const tool = createMemorySearchTool(service);

    const result = await tool.execute({
      query: 'what did I do yesterday',
      userId: 'user-1',
    }) as { success: boolean; results: unknown[]; count: number };

    expect(result.success).toBe(true);
    expect(result.results).toEqual([]);
    expect(result.count).toBe(0);
  });

  it('returns mapped results with score', async () => {
    const entry = makeEntry({ content: 'I went for a walk' });
    const service = makeMockService({
      search: vi.fn().mockResolvedValue([makeSearchResult(entry, 0.85)]),
    });
    const tool = createMemorySearchTool(service);

    const result = await tool.execute({
      query: 'walk',
      userId: 'user-1',
    }) as { success: boolean; results: Array<{ id: string; content: string; score: number }> };

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].content).toBe('I went for a walk');
    expect(result.results[0].score).toBe(0.85);
  });

  it('passes options to service.search', async () => {
    const service = makeMockService();
    const tool = createMemorySearchTool(service);

    await tool.execute({
      query: 'plans',
      userId: 'user-2',
      limit: 5,
      scoreThreshold: 0.7,
      agentId: 'agent-x',
      memoryType: 'working',
    });

    expect(service.search).toHaveBeenCalledWith('plans', 'user-2', {
      limit: 5,
      scoreThreshold: 0.7,
      agentId: 'agent-x',
      memoryType: 'working',
    });
  });

  it('defaults limit to 10 and memoryType to all', async () => {
    const service = makeMockService();
    const tool = createMemorySearchTool(service);

    await tool.execute({ query: 'test', userId: 'u1' });

    expect(service.search).toHaveBeenCalledWith('test', 'u1', {
      limit: 10,
      scoreThreshold: undefined,
      agentId: undefined,
      memoryType: 'all',
    });
  });

  it('returns error when service throws', async () => {
    const service = makeMockService({
      search: vi.fn().mockRejectedValue(new Error('Qdrant offline')),
    });
    const tool = createMemorySearchTool(service);

    const result = await tool.execute({ query: 'test', userId: 'u1' });
    expect(result).toMatchObject({ success: false, error: 'Qdrant offline' });
  });

  it('includes query in response', async () => {
    const service = makeMockService();
    const tool = createMemorySearchTool(service);

    const result = await tool.execute({ query: 'my query', userId: 'u1' }) as {
      query: string;
    };

    expect(result.query).toBe('my query');
  });
});

// ---------------------------------------------------------------------------
// memory_get tool
// ---------------------------------------------------------------------------

describe('memory_get tool', () => {
  it('returns empty entries when service returns nothing', async () => {
    const service = makeMockService();
    const tool = createMemoryGetTool(service);

    const result = await tool.execute({ userId: 'user-1' }) as {
      success: boolean; entries: unknown[]; count: number;
    };

    expect(result.success).toBe(true);
    expect(result.entries).toEqual([]);
    expect(result.count).toBe(0);
  });

  it('returns mapped entries', async () => {
    const entry = makeEntry({ content: 'remember to call dentist' });
    const service = makeMockService({
      getRecent: vi.fn().mockResolvedValue([entry]),
    });
    const tool = createMemoryGetTool(service);

    const result = await tool.execute({ userId: 'user-1' }) as {
      success: boolean;
      entries: Array<{ id: string; content: string; createdAt: string }>;
    };

    expect(result.success).toBe(true);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].content).toBe('remember to call dentist');
    expect(result.entries[0].createdAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('passes userId, agentId, and limit to service.getRecent', async () => {
    const service = makeMockService();
    const tool = createMemoryGetTool(service);

    await tool.execute({ userId: 'u2', agentId: 'a1', limit: 3 });

    expect(service.getRecent).toHaveBeenCalledWith('u2', 'a1', 3);
  });

  it('defaults limit to 10', async () => {
    const service = makeMockService();
    const tool = createMemoryGetTool(service);

    await tool.execute({ userId: 'u1' });

    expect(service.getRecent).toHaveBeenCalledWith('u1', undefined, 10);
  });

  it('returns error when service throws', async () => {
    const service = makeMockService({
      getRecent: vi.fn().mockRejectedValue(new Error('storage error')),
    });
    const tool = createMemoryGetTool(service);

    const result = await tool.execute({ userId: 'u1' });
    expect(result).toMatchObject({ success: false, error: 'storage error' });
  });

  it('includes userId and agentId in response', async () => {
    const service = makeMockService();
    const tool = createMemoryGetTool(service);

    const result = await tool.execute({ userId: 'u99', agentId: 'a99' }) as {
      userId: string; agentId: string;
    };

    expect(result.userId).toBe('u99');
    expect(result.agentId).toBe('a99');
  });
});
