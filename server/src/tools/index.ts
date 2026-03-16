import { createBuiltinTools, type StructuredToolInterface } from 'agent';

/**
 * Returns the builtin tool list for the server-side agent runner.
 * Tools read workspaceDir from config.configurable at invocation time.
 */
export function getBuiltinTools(): StructuredToolInterface[] {
  return createBuiltinTools();
}
