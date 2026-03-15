export { z } from 'zod';
export { tool } from '@langchain/core/tools';
export type { StructuredToolInterface } from '@langchain/core/tools';

/** Re-export Tool as an alias for StructuredToolInterface */
export type { StructuredToolInterface as Tool } from '@langchain/core/tools';
