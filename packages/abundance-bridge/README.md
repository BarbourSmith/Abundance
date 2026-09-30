# Abundance AI agent bridge

Lets an AI agent on your computer, such as Claude, inspect and edit the [Abundance](https://abundance.maslowcnc.com) CAD project open in your browser. It's an MCP server: your AI app starts it, and your Abundance tab connects to it over a local, token-protected connection.

It works with any AI app that can run commands on your computer and use MCP servers, such as Claude Code, Codex, GitHub Copilot in agent mode, and Cursor.

## Install

Ask your AI app:

> Set up the Abundance MCP server in the AI app I'm using right now. It's the npm package @maslowcnc/abundance-bridge, a stdio server started with "npx -y @maslowcnc/abundance-bridge@latest". First check that Node.js 18 or newer is installed, and install it if it isn't. Then add the server to this app's MCP configuration under the name "abundance". Finally, tell me what I need to restart so the new tools load.

Restart the app as it tells you so the Abundance tools load.

To set it up by hand instead, you need [Node.js](https://nodejs.org) 18 or newer. Add a stdio server named `abundance` that runs `npx -y @maslowcnc/abundance-bridge@latest`. For example, in Claude Code:

```bash
claude mcp add --scope user abundance -- npx -y @maslowcnc/abundance-bridge@latest
```

`@latest` keeps the bridge in step with the Abundance website, which updates continuously.

## Connect your project

1. In a new chat, ask your AI app:

   > Please find my Abundance pairing token. Start the Abundance connection if needed, then tell me the pairing token and port to enter on abundance.maslowcnc.com.

2. Open Abundance in Chrome or Firefox and open **Connect an AI agent**: the sparkle button on the right in run mode, **AI Agent** in the editor's menu, or add `#agent` to the end of the page address.
3. Paste the token, check the port, and turn on **Connect local AI agent**.
4. Ask your AI app:

   > Connect to the Abundance project open in my browser. Tell me the project name and whether access is read-only.

The agent starts read-only. Tick **Allow edits** in the chip at the top of the window to let it change the project. Edit permission resets whenever the page reloads.

## Options

| Flag | Default | |
|---|---|---|
| `--port <n>` | `4455` | Port the browser tab connects to. Also `ABUNDANCE_BRIDGE_PORT`. |
| `--out-dir <folder>` | `~/Documents/Abundance Exports` | Where exported STL, STEP, SVG and G-code files go. |
| `--print-token` | | Print the pairing token and exit. |
| `--new-token` | | Replace the pairing token. Paired tabs must paste the new one. |
| `--origin <url>` | | Also accept tabs from this site (for self-hosted Abundance). |

The pairing token is stored in `~/.abundance-bridge/token`.

## Security

The bridge only listens on `127.0.0.1`, only accepts tabs from the Abundance website or a local dev server, and only after they present the pairing token. The website never accepts incoming connections: your tab connects out to the bridge.

## Source

Built from [`bridge/`](https://github.com/BarbourSmith/Abundance/tree/main/bridge) in the Abundance repository. Full tool list and design notes are in its README.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
