# Notes for AI agents working on Abundance

## The user's open project

If the `abundance` MCP tools are available (from `.mcp.json`), they act on the project open in the user's browser. Follow the `abundance-live-project` skill. Setup and the safety model are in `bridge/README.md`.

## Tests

- Unit tests need a real browser for the OpenCascade WASM: `npx vitest run --config=vitest.headless.config.ts <files>`. The default Node config can't load it.
- Many tests already fail on `main`. Compare failures before and after a change instead of expecting a green run.
- A full-suite run often crashes the browser partway through, reliably at `tests/gcode-incremental-visualization.test.js`. Run files individually when comparing.
- Agent bridge: `npm run test:bridge` (Node), `tests/agent-runtime.test.js` (headless browser), and `npm run test:bridge:e2e` with `npm start` running.
