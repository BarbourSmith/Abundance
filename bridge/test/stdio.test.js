import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { connectFakePage } from "./fakePage.js";

describe("bridge process over stdio", () => {
  let client;
  let home;

  afterEach(async () => {
    await client?.close();
    if (home) fs.rmSync(home, { recursive: true, force: true });
  });

  it("starts, serves MCP on stdout, and relays to a connected page", async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "abundance-bridge-proc-"));
    const stderr = [];
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        "bridge/index.js",
        "--port",
        "0",
        "--out-dir",
        path.join(home, "out"),
      ],
      env: { ...process.env, ABUNDANCE_BRIDGE_HOME: home },
      stderr: "pipe",
    });
    transport.stderr.on("data", (d) => stderr.push(d.toString()));
    client = new Client({ name: "stdio-test", version: "1.0.0" });
    await client.connect(transport);

    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(20);

    const status = JSON.parse(
      (await client.callTool({ name: "bridge_status", arguments: {} }))
        .content[0].text,
    );
    expect(status.listening).toBe(true);
    expect(status.port).toBeGreaterThan(0);

    const token = fs.readFileSync(path.join(home, "token"), "utf8").trim();
    expect(status.pairing_instructions).toContain(token);
    expect(stderr.join("")).toContain("pairing token");

    const page = connectFakePage(status.port, {
      token,
      handler: async () => ({ project: "ok" }),
    });
    await page.hello;
    const result = await client.callTool({
      name: "get_project",
      arguments: {},
    });
    expect(JSON.parse(result.content[0].text)).toEqual({ project: "ok" });
    page.ws.terminate();
  });
});
