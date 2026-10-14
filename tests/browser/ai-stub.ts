// Shared by playwright.config.ts and ai.spec.ts: the AI test build talks to the
// local SSE stub (scripts/sse-stub.mjs) with a dummy key, never to OpenRouter.
export const AI_URL = "http://127.0.0.1:4174";
export const STUB_URL = "http://127.0.0.1:4175";
export const AI_KEY = "sk-or-v1-playwright-dummy-key";
