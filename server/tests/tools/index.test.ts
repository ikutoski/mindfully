import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures variables are available when vi.mock factory runs
// ---------------------------------------------------------------------------

const { mockTool, mockToolWithContext } = vi.hoisted(() => ({
  mockTool: {
    name: 'test-tool',
    description: 'A test tool',
    invoke: vi.fn(),
  },
  mockToolWithContext: {
    name: 'second-tool',
    description: 'A second test tool',
    invoke: vi.fn(),
  },
}));

const mockCreateBuiltinTools = vi.hoisted(() => vi.fn());

vi.mock('core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('core')>();
  return {
    ...actual,
    createBuiltinTools: mockCreateBuiltinTools,
  };
});

import { getBuiltinTools } from '../../src/tools/index.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tools/index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateBuiltinTools.mockReturnValue([mockTool]);
  });

  describe('getBuiltinTools', () => {
    it('returns the list of builtin tools from core', () => {
      const tools = getBuiltinTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test-tool');
    });

    it('calls createBuiltinTools with no arguments', () => {
      getBuiltinTools();
      expect(mockCreateBuiltinTools).toHaveBeenCalledWith();
    });

    it('returns tools that can be invoked via tool.invoke()', async () => {
      mockTool.invoke.mockResolvedValueOnce(JSON.stringify({ success: true, output: 'hello' }));

      const tools = getBuiltinTools();
      const result = JSON.parse(await tools[0].invoke({ arg: 'value' }));
      expect(result).toEqual({ success: true, output: 'hello' });
    });

    it('returns multiple tools when createBuiltinTools returns multiple', () => {
      mockCreateBuiltinTools.mockReturnValue([mockTool, mockToolWithContext]);
      const tools = getBuiltinTools();
      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name)).toEqual(['test-tool', 'second-tool']);
    });

    it('returns empty array when createBuiltinTools returns empty list', () => {
      mockCreateBuiltinTools.mockReturnValue([]);
      const tools = getBuiltinTools();
      expect(tools).toHaveLength(0);
    });
  });
});
