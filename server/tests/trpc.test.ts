import { describe, it, expect } from 'vitest';

describe('tRPC Configuration', () => {
  it('should export router function', async () => {
    const { router } = await import('../src/trpc');
    expect(typeof router).toBe('function');
  });

  it('should export publicProcedure', async () => {
    const { publicProcedure } = await import('../src/trpc');
    expect(publicProcedure).toBeDefined();
  });
});
