import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures variables are available when vi.mock factory runs
// ---------------------------------------------------------------------------

const { mockTool } = vi.hoisted(() => ({
  mockTool: {
    name: 'test-tool',
    description: 'A test tool',
    execute: vi.fn(),
  },
}));

vi.mock('core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('core')>();
  return {
    ...actual,
    createBuiltinTools: vi.fn().mockReturnValue([mockTool]),
  };
});

import { getBuiltinTools, executeTool } from '../../src/tools/index.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tools/index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTool.execute.mockReset();
  });

  describe('getBuiltinTools', () => {
    it('returns the list of builtin tools from core', () => {
      const tools = getBuiltinTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test-tool');
    });
  });

  describe('executeTool', () => {
    it('executes a known tool and returns its result', async () => {
      mockTool.execute.mockResolvedValue('tool output');

      const result = await executeTool('test-tool', { arg: 'value' });
      expect(result).toEqual({ result: 'tool output' });
      expect(mockTool.execute).toHaveBeenCalledWith({ arg: 'value' }, undefined);
    });

    it('returns an error when tool is not found', async () => {
      const result = await executeTool('unknown-tool', {});
      expect(result).toEqual({
        result: null,
        error: 'Tool "unknown-tool" not found',
      });
    });

    it('returns an error when tool execution throws an Error', async () => {
      mockTool.execute.mockRejectedValue(new Error('execution failed'));

      const result = await executeTool('test-tool', {});
      expect(result).toEqual({
        result: null,
        error: 'execution failed',
      });
    });

    it('returns a generic error message when tool throws a non-Error', async () => {
      mockTool.execute.mockRejectedValue('string error');

      const result = await executeTool('test-tool', {});
      expect(result).toEqual({
        result: null,
        error: 'Tool execution failed',
      });
    });

    it('forwards ToolContext to tool.execute when provided', async () => {
      mockTool.execute.mockResolvedValue('ctx output');
      const context = { workspaceDir: '/my/workspace' };

      const result = await executeTool('test-tool', { arg: 1 }, context);
      expect(result).toEqual({ result: 'ctx output' });
      expect(mockTool.execute).toHaveBeenCalledWith({ arg: 1 }, context);
    });

    it('forwards undefined context when context is omitted', async () => {
      mockTool.execute.mockResolvedValue('no ctx');

      await executeTool('test-tool', { x: 'y' });
      expect(mockTool.execute).toHaveBeenCalledWith({ x: 'y' }, undefined);
    });
  });
});
