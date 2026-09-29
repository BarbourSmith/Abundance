import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { TOOLS } from "../../src/agent/tools.js";
import { createMcpServer } from "../mcpServer.js";
import { PageHub } from "../pageHub.js";
import { parseArgs } from "../index.js";
import { loadOrCreateToken, tokensMatch } from "../token.js";
import { transpileCodeAtom } from "../transpile.js";
import { connectFakePage } from "./fakePage.js";

const TOKEN = "abd-mcp-test";

describe("MCP server", () => {
  let hub;
  let port;
  let client;
  let outDir;
  const pages = [];

  beforeEach(async () => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), "abundance-bridge-out-"));
    hub = new PageHub({ token: TOKEN, port: 0, callTimeoutMs: 2000 });
    port = await hub.start();
    const { server } = createMcpServer(hub, {
      outDir,
      tokenInfo: { token: TOKEN, file: "/tmp/token" },
      version: "test",
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    pages.splice(0).forEach((p) => p.ws.terminate());
    await client.close();
    await hub.stop();
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  const connectPage = async (handler) => {
    const p = connectFakePage(port, { token: TOKEN, handler });
    pages.push(p);
    await p.hello;
    return p;
  };

  const text = (result) =>
    JSON.parse(result.content.find((c) => c.type === "text").text);

  it("lists every shared tool plus the bridge tools, each with session_id", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const t of TOOLS) expect(names).toContain(t.name);
    expect(names).toEqual(
      expect.arrayContaining(["bridge_status", "list_sessions", "use_session"]),
    );
    const setParam = tools.find((t) => t.name === "set_param");
    expect(setParam.inputSchema.properties.session_id).toBeDefined();
    expect(setParam.annotations.readOnlyHint).toBe(false);
    expect(
      tools.find((t) => t.name === "get_atom").annotations.readOnlyHint,
    ).toBe(true);
    expect(
      tools.find((t) => t.name === "delete_atoms").annotations.destructiveHint,
    ).toBe(true);
  });

  it("bridge_status explains pairing when no tab is connected", async () => {
    const status = text(
      await client.callTool({ name: "bridge_status", arguments: {} }),
    );
    expect(status.listening).toBe(true);
    expect(status.sessions).toEqual([]);
    expect(status.pairing_instructions).toContain(TOKEN);
    expect(status.pairing_instructions).toContain(String(port));
  });

  it("reports a clear error when no tab is connected", async () => {
    const result = await client.callTool({
      name: "get_project",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    expect(text(result).message).toMatch(/No Abundance page is connected/);
  });

  it("relays calls to the page and strips bridge-only arguments", async () => {
    const page = await connectPage(async (name, args) => ({ name, args }));
    const result = text(
      await client.callTool({
        name: "get_atom",
        arguments: { atom: "id-3", session_id: "tab-1" },
      }),
    );
    expect(result).toEqual({ name: "get_atom", args: { atom: "id-3" } });
    expect(page.calls[0]).toEqual({
      name: "get_atom",
      arguments: { atom: "id-3" },
    });
  });

  it("passes page errors back as tool errors", async () => {
    await connectPage(async () => {
      const err = new Error("Edits are turned off in the page.");
      err.code = -32001;
      throw err;
    });
    const result = await client.callTool({
      name: "set_param",
      arguments: { atom: "a", param: "b", value: 1 },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toEqual({
      error: "PERMISSION_DENIED",
      message: "Edits are turned off in the page.",
    });
  });

  it("returns render_image results as MCP image content", async () => {
    await connectPage(async () => ({
      base64: "iVBORw0KGgo=",
      mimeType: "image/png",
      atom: "Top",
      view: "iso",
    }));
    const result = await client.callTool({
      name: "render_image",
      arguments: {},
    });
    expect(result.content[0]).toEqual({
      type: "image",
      data: "iVBORw0KGgo=",
      mimeType: "image/png",
    });
    expect(text(result)).toEqual({ atom: "Top", view: "iso" });
  });

  it("writes file results to the output directory", async () => {
    const bytes = Buffer.from("solid test\nendsolid test\n");
    await connectPage(async () => ({
      filename: "Wall Anchor.stl",
      base64: bytes.toString("base64"),
      format: "STL",
    }));
    const result = text(
      await client.callTool({
        name: "export_geometry",
        arguments: { format: "STL" },
      }),
    );
    expect(result.path).toBe(path.join(outDir, "Wall Anchor.stl"));
    expect(result.bytes).toBe(bytes.length);
    expect(fs.readFileSync(result.path, "utf8")).toBe(bytes.toString());
  });

  it("honors output_path and writes text payloads", async () => {
    const page = await connectPage(async () => ({
      filename: "part.gcode",
      text: "G21\nG90\n",
      lines: 2,
    }));
    const target = path.join(outDir, "nested", "custom.gcode");
    const result = text(
      await client.callTool({
        name: "get_gcode",
        arguments: { atom: "Gcode", output_path: target },
      }),
    );
    expect(result).toMatchObject({ path: target, lines: 2, bytes: 8 });
    expect(fs.readFileSync(target, "utf8")).toBe("G21\nG90\n");
    expect(page.calls[0].arguments).toEqual({ atom: "Gcode" });
  });

  it("transpiles TypeScript for set_code and apply_edits", async () => {
    const page = await connectPage(async () => ({ ok: true }));
    const code =
      "function run(width: number = 5): number { return width * 2; }";
    await client.callTool({
      name: "set_code",
      arguments: { atom: "Code", code },
    });
    expect(page.calls[0].arguments.compiled_code).toMatch(
      /function run\(width = 5\)/,
    );
    expect(page.calls[0].arguments.compiled_code).not.toMatch(/: number/);

    await client.callTool({
      name: "apply_edits",
      arguments: {
        description: "x",
        edits: [{ tool: "set_code", arguments: { atom: "Code", code } }],
      },
    });
    expect(page.calls[1].arguments.edits[0].arguments.compiled_code).toMatch(
      /function run/,
    );
  });

  it("reports TypeScript syntax errors without reaching the page", async () => {
    const page = await connectPage(async () => ({ ok: true }));
    const result = await client.callTool({
      name: "set_code",
      arguments: { atom: "Code", code: "function run( { return 1 }" },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatchObject({ error: "INVALID_PARAMS" });
    expect(text(result).message).toMatch(/TypeScript did not compile: line 1/);
    expect(page.calls).toHaveLength(0);
  });

  it("forwards page progress as MCP progress notifications", async () => {
    await connectPage(async (_name, _args, ctx) => {
      ctx.progress({ progress: 1, total: 4, message: "1 of 4 atoms ready" });
      ctx.progress({ progress: 4, total: 4, message: "4 of 4 atoms ready" });
      await new Promise((r) => setTimeout(r, 20));
      return { settled: true };
    });
    const seen = [];
    const result = await client.callTool(
      { name: "wait_for_settle", arguments: {} },
      undefined,
      { onprogress: (p) => seen.push(p) },
    );
    expect(text(result)).toEqual({ settled: true });
    expect(seen.map((p) => p.message)).toEqual([
      "1 of 4 atoms ready",
      "4 of 4 atoms ready",
    ]);
    expect(seen[1]).toMatchObject({ progress: 4, total: 4 });
  });

  it("list_sessions and use_session pick the target tab", async () => {
    await connectPage(async () => "first");
    const second = connectFakePage(port, {
      token: TOKEN,
      clientId: "b",
      focused: false,
      handler: async () => "second",
    });
    pages.push(second);
    await second.hello;
    const { sessions } = text(
      await client.callTool({ name: "list_sessions", arguments: {} }),
    );
    expect(sessions.map((s) => s.session_id)).toEqual(["tab-1", "tab-2"]);
    await client.callTool({
      name: "use_session",
      arguments: { session_id: "tab-2" },
    });
    const routed = await client.callTool({
      name: "get_project",
      arguments: {},
    });
    expect(routed.content[0].text).toBe("second");
    const bad = await client.callTool({
      name: "use_session",
      arguments: { session_id: "tab-9" },
    });
    expect(bad.isError).toBe(true);
  });
});

describe("token storage", () => {
  let home;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "abundance-bridge-home-"));
    process.env.ABUNDANCE_BRIDGE_HOME = home;
    delete process.env.ABUNDANCE_BRIDGE_TOKEN;
  });
  afterEach(() => {
    delete process.env.ABUNDANCE_BRIDGE_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("creates a private token once and reuses it", () => {
    const first = loadOrCreateToken();
    expect(first.created).toBe(true);
    expect(first.token).toMatch(/^abd-[\w-]{24}$/);
    expect(fs.statSync(first.file).mode & 0o777).toBe(0o600);
    const second = loadOrCreateToken();
    expect(second).toMatchObject({ token: first.token, created: false });
    const regenerated = loadOrCreateToken({ regenerate: true });
    expect(regenerated.token).not.toBe(first.token);
  });

  it("lets ABUNDANCE_BRIDGE_TOKEN override the stored token", () => {
    process.env.ABUNDANCE_BRIDGE_TOKEN = "abd-from-env";
    expect(loadOrCreateToken()).toEqual({
      token: "abd-from-env",
      file: null,
      created: false,
    });
    delete process.env.ABUNDANCE_BRIDGE_TOKEN;
  });

  it("compares tokens safely", () => {
    expect(tokensMatch("abc", "abc")).toBe(true);
    expect(tokensMatch("abc", "abd")).toBe(false);
    expect(tokensMatch("abc", "abcd")).toBe(false);
    expect(tokensMatch("abc", undefined)).toBe(false);
  });
});

describe("transpileCodeAtom", () => {
  it("strips types and keeps ES module imports that are used", async () => {
    const js = await transpileCodeAtom(
      'import x from "y";\ninterface P { a: number }\nfunction run(shape: Assembly, n: number = x): Assembly[] { return [shape]; }',
    );
    expect(js).toContain('import x from "y"');
    expect(js).toContain("function run(shape, n = x)");
    expect(js).not.toContain("interface");
  });
});

describe("parseArgs", () => {
  it("reads flags", () => {
    const opts = parseArgs([
      "--port",
      "5000",
      "--out-dir",
      "/tmp/out",
      "--origin",
      "https://a.example",
    ]);
    expect(opts).toMatchObject({
      port: 5000,
      outDir: "/tmp/out",
      origins: ["https://a.example"],
    });
  });

  it("rejects unknown or malformed flags", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown argument/);
    expect(() => parseArgs(["--port", "abc"])).toThrow(/--port/);
    expect(() => parseArgs(["--port"])).toThrow(/needs a value/);
  });
});
