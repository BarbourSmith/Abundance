#!/usr/bin/env node
/**
 * Abundance local agent bridge.
 *
 * Runs as an MCP server over stdio (launched by Claude Code or another MCP
 * client) and listens on a loopback WebSocket for Abundance browser tabs.
 * Tool calls from the model are relayed to the connected tab.
 *
 * Usage: node bridge/index.js [--port 4455] [--out-dir ./abundance-output]
 *                             [--origin https://extra.example] [--print-token]
 *                             [--new-token]
 *
 * stdout is reserved for the MCP protocol; all logging goes to stderr.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DEFAULT_BRIDGE_PORT } from "../src/agent/protocol.js";
import { createMcpServer } from "./mcpServer.js";
import { PageHub } from "./pageHub.js";
import { loadOrCreateToken } from "./token.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(
  fs.readFileSync(path.join(here, "..", "package.json"), "utf8"),
).version;

export function parseArgs(argv) {
  const opts = {
    port: Number(process.env.ABUNDANCE_BRIDGE_PORT) || DEFAULT_BRIDGE_PORT,
    outDir: path.resolve("abundance-output"),
    origins: [],
    printToken: false,
    newToken: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      return value;
    };
    if (arg === "--port") opts.port = Number(next());
    else if (arg === "--out-dir") opts.outDir = path.resolve(next());
    else if (arg === "--origin") opts.origins.push(next());
    else if (arg === "--print-token") opts.printToken = true;
    else if (arg === "--new-token") opts.newToken = true;
    else throw new Error(`Unknown argument ${arg}`);
  }
  if (!Number.isInteger(opts.port) || opts.port < 0 || opts.port > 65535) {
    throw new Error("--port must be an integer between 0 and 65535");
  }
  return opts;
}

function log(...args) {
  console.error("[abundance-bridge]", ...args);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const tokenInfo = loadOrCreateToken({ regenerate: opts.newToken });

  if (opts.printToken) {
    process.stdout.write(tokenInfo.token + "\n");
    return;
  }

  const hub = new PageHub({
    token: tokenInfo.token,
    port: opts.port,
    extraOrigins: opts.origins,
    bridgeVersion: VERSION,
  });
  hub.on("session", (s) =>
    log(
      `tab connected: ${s.id} ${formatProject(s.info.project)} from ${s.origin}`,
    ),
  );
  hub.on("session-closed", (s, code) =>
    log(`tab disconnected: ${s.id} (${code})`),
  );
  hub.on("rejected", ({ reason, origin }) =>
    log(`refused connection from ${origin || "unknown origin"}: ${reason}`),
  );

  let listenError = null;
  try {
    const port = await hub.start();
    log(`listening on ws://127.0.0.1:${port}`);
  } catch (err) {
    listenError = err;
    log(`could not listen on port ${opts.port}: ${err.message}`);
  }
  log(
    `pairing token: ${tokenInfo.token}${tokenInfo.file ? ` (stored in ${tokenInfo.file})` : ""}`,
  );
  log(`files are written to ${opts.outDir}`);

  const { server } = createMcpServer(hub, {
    outDir: opts.outDir,
    tokenInfo,
    version: VERSION,
    getListenError: () => listenError,
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async () => {
    await hub.stop().catch(() => {});
    await server.close().catch(() => {});
    process.exit(0);
  };
  process.stdin.on("close", shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function formatProject(project) {
  if (!project) return "(no project)";
  return `${project.owner}/${project.repo}`;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    log(err.stack || err.message);
    process.exit(1);
  });
}
