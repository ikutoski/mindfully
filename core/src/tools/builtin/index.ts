import { DynamicStructuredTool } from "@langchain/core/tools";
import { createReadTool } from './read.js';
import { createWriteTool } from './write.js';
import { createEditTool } from './edit.js';
import { createBashTool } from './bash.js';
import { createHttpTool } from './http.js';
import { createWebsearchTool } from './websearch.js';
import { createGlobTool } from './glob.js';
import { createWebFetchTool } from './web-fetch.js';
import { createProcessTool } from './process.js';
import { createImageTool } from './image.js';

export { createReadTool } from './read.js';
export { createWriteTool } from './write.js';
export { createEditTool } from './edit.js';
export { createBashTool } from './bash.js';
export { createHttpTool } from './http.js';
export { createWebsearchTool } from './websearch.js';
export { createGlobTool } from './glob.js';
export { createWebFetchTool } from './web-fetch.js';
export { createProcessTool } from './process.js';
export { ProcessRegistry } from './process-registry.js';
export { createImageTool } from './image.js';
export type { VisionProvider } from './image.js';

export function createBuiltinTools() {
  return [
    createReadTool(),
    createWriteTool(),
    createEditTool(),
    createBashTool(),
    createHttpTool(),
    createWebsearchTool(),
    createGlobTool(),
    createWebFetchTool(),
    // createProcessTool(),
    createImageTool(),
  ];
}

export const builtinToolNames = [
  'read', 'write', 'edit', 'bash', 'http', 'web_search',
  'glob', 'web_fetch', 'process', 'image',
] as const;
export type BuiltinToolName = typeof builtinToolNames[number];
