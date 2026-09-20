#!/usr/bin/env node
// CommonJS wrapper to guarantee PLAYWRIGHT_BROWSERS_PATH=0 is set
// BEFORE any ESM module (which may import playwright) is loaded.
// This is needed because ESM imports are hoisted and the env var
// must be in process.env before Playwright reads it.

process.env.PLAYWRIGHT_BROWSERS_PATH = '0';

// Dynamically import the ESM entry point
import('./src/server.js').catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});
