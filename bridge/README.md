# Abundance local agent bridge

The bridge lets an AI agent running on your computer, such as Claude Code, inspect and edit the Abundance project open in your browser. It works with the live site and with the local dev server.

```
Claude Code ──MCP over stdio──▶ bridge (node bridge/index.js) ◀──WebSocket on 127.0.0.1── Abundance tab
```

The browser tab connects out to the bridge. The website never accepts connections, and a tab only connects after you turn the feature on and paste the bridge's pairing token.

## Setup with Claude Code

1. Run `npm install` in this repository.
2. Start Claude Code in the repository. It reads `.mcp.json` and offers to enable the `abundance` MCP server. Accept it.
3. Get the pairing token. Either ask the agent to call `bridge_status`, or run:

   ```bash
   npm run bridge:token
   ```

4. Open Abundance in Chrome or Firefox and open **Connect an AI agent**. In run mode it's the sparkle button in the column on the right. In the editor it's **AI Agent** in the menu. You can also add `#agent` to the end of any Abundance address. The same settings are in Developer Settings (Ctrl+Shift+D, or Cmd+Shift+D on a Mac).
5. Paste the token, check the port, and turn on **Connect local AI agent**.

A chip at the top of the window shows the connection. The agent starts read-only. Tick **Allow edits** in the chip to let it change the project. Edit permission resets to read-only whenever the page reloads.

To use the bridge from another directory or MCP client, point it at this file:

```bash
claude mcp add abundance -- node /path/to/Abundance/bridge/index.js
```

## What the agent can do

| Permission | Tools |
|---|---|
| Always | `bridge_status`, `list_sessions`, `use_session` |
| Read | `get_project`, `list_atoms`, `get_atom`, `list_atom_types`, `list_library_molecules`, `search_molecules`, `get_errors`, `wait_for_settle`, `get_state_report`, `get_worker_logs`, `get_bom`, `get_readme`, `render_image`, `export_geometry`, `get_gcode`, `get_undo_history` |
| View | `select_atom`, `open_molecule` |
| Edit | `set_param`, `set_code`, `add_atom`, `add_github_molecule`, `connect`, `disconnect`, `delete_atoms`, `apply_edits`, `undo`, `save_project` |

The tool list and schemas live in `src/agent/tools.js`, shared by the page and the bridge. The page-side implementations are in `src/agent/runtime.js`.

Atoms are addressed by path, such as `Wall-Anchor/Bolt/Rotate`, or by the unique ID any tool returns. When two atoms in a molecule share a name, the error lists their IDs.

`set_param` changes the same fields the properties panel shows, through the same handlers, so equations and atom-specific behavior work as they do for a person. Equation atoms rename themselves to their equation. When that happens the result reports the new name.

Exports, renders, and G-code go to `abundance-output/` in the directory the bridge was started from, or to `output_path` when given. Only the path and a summary go back to the model.

## Built-ins and library molecules first

The server instructions tell the agent to build with built-in atoms first, then shared GitHub molecules, and to write a Code atom only for what neither can do. The tools back that up:

- `list_atom_types` describes every built-in atom with its inputs and defaults, read from the running app.
- `list_library_molecules` returns the curated library in `src/agent/moleculeLibrary.json`: the 20 most-used public molecules, with their inputs.
- `search_molecules` searches every public project, most used first, and `add_github_molecule` imports one as a read-only GitHub molecule.
- `add_atom` refuses a Code atom without a `reason`, which appears in the user's undo history.

Regenerate the library as usage changes, and add hand-written guidance for any molecule in `src/agent/moleculeLibrary.notes.json`:

```bash
npm run agent:library
```

## Safety model

- **Opt-in per browser.** A tab never touches localhost unless the user turned the bridge on in that browser.
- **Loopback only.** The bridge binds to 127.0.0.1 and accepts only the Abundance site and `http://localhost` origins. Add others with `--origin`.
- **Pairing token.** A tab must present the token stored in `~/.abundance-bridge/token`. Regenerate it with `node bridge/index.js --new-token`.
- **Read-only by default.** Edits need the user to tick Allow edits, which resets on reload.
- **One undo step per agent change.** Every edit, and every batch from `apply_edits`, is a single entry labeled `AI:` in the user's undo history. A failed batch is rolled back. The agent's `undo` refuses to undo the user's own changes.
- **No silent commits.** Autosave pauses while edits are allowed. `save_project` shows a confirmation, and only the user's click saves to GitHub.
- **No arbitrary code in the page.** There is no tool that runs JavaScript in the tab. Code atoms run in the CAD worker as they do for users.
- **The GitHub token never leaves the page.**
- **Imported GitHub molecules are read-only** to the agent, since they belong to another repository.
- **Project text is untrusted.** Names, READMEs, and code can come from other people's shared projects. Tool descriptions tell the model to treat them as data.

## Troubleshooting

- **"Can't reach the bridge"**: the bridge isn't running, or it's on a different port. Check `bridge_status`, then press Retry in the chip.
- **"Pairing token does not match"**: copy the token again. The tab stops retrying until the token changes.
- **Port already in use**: another bridge is running, often from a second Claude Code session. Stop it, or start this one with `--port` and change the port in Developer Settings.
- **Safari**: Safari blocks secure sites from reaching programs on this computer. Use Chrome or Firefox.
- **Edits turned off after a code change**: in the dev server, hot reload recreates the page's bridge client, which starts read-only again.

## Tests

```bash
npm run test:bridge
npx vitest run --config=vitest.headless.config.ts tests/agent-runtime.test.js
npm start   # in another terminal, then:
npm run test:bridge:e2e
```

- `bridge/test/` runs in Node: the WebSocket hub, the MCP server through the SDK's in-memory client, the real bridge process over stdio, and the page's bridge client against the real hub.
- `tests/agent-runtime.test.js` runs in headless Chromium against a real atom graph.
- `bridge/e2e.mjs` opens a public project in headless Chromium, pairs through the settings UI, and drives it with an MCP client. Pass `--project owner/repo` or `--base URL` to change the target.

## Protocol

JSON-RPC 2.0 over the WebSocket, defined in `src/agent/protocol.js`. The page sends `bridge.hello` with the pairing token and protocol version. The bridge then sends `tool.call` requests. The page sends `session.update` when its project, focus, or edit mode changes, and `tool.progress` during long calls. Bump `PROTOCOL_VERSION` for any change an older page or bridge can't handle.
