import { describe, it, expect } from 'vitest';

describe('App Router', () => {
  it('should export appRouter', async () => {
    const { appRouter } = await import('../../src/router/index');
    expect(appRouter).toBeDefined();
    expect(typeof appRouter).toBe('object');
  });

  it('should have hello procedure', async () => {
    const { appRouter } = await import('../../src/router/index');
    expect(appRouter.hello).toBeDefined();
  });
});
