import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CLOSE_CODES,
  ERROR_CODES,
  isAllowedOrigin,
} from "../../src/agent/protocol.js";
import { PageHub } from "../pageHub.js";
import { connectFakePage } from "./fakePage.js";

const TOKEN = "abd-test-token";

describe("isAllowedOrigin", () => {
  it("accepts production and any loopback dev origin", () => {
    expect(isAllowedOrigin("https://abundance.maslowcnc.com")).toBe(true);
    expect(isAllowedOrigin("http://localhost:4444")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:4173")).toBe(true);
    expect(isAllowedOrigin("http://localhost")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isAllowedOrigin(undefined)).toBe(false);
    expect(isAllowedOrigin("https://evil.example")).toBe(false);
    expect(isAllowedOrigin("http://abundance.maslowcnc.com")).toBe(false);
    expect(isAllowedOrigin("https://localhost:4444")).toBe(false);
    expect(isAllowedOrigin("http://localhost.evil.example")).toBe(false);
    expect(
      isAllowedOrigin("https://abundance.maslowcnc.com.evil.example"),
    ).toBe(false);
  });

  it("accepts explicitly listed extra origins", () => {
    expect(
      isAllowedOrigin("https://preview.example", ["https://preview.example"]),
    ).toBe(true);
  });
});

describe("PageHub", () => {
  let hub;
  let port;
  const pages = [];
  const page = (opts) => {
    const p = connectFakePage(port, { token: TOKEN, ...opts });
    pages.push(p);
    return p;
  };

  beforeEach(async () => {
    hub = new PageHub({
      token: TOKEN,
      port: 0,
      helloTimeoutMs: 300,
      callTimeoutMs: 500,
    });
    port = await hub.start();
  });

  afterEach(async () => {
    pages.splice(0).forEach((p) => p.ws.terminate());
    await hub.stop();
  });

  it("binds to loopback only", () => {
    expect(hub.wss.address().address).toBe("127.0.0.1");
  });

  it("completes the handshake and lists the session", async () => {
    const p = page();
    const hello = await p.hello;
    expect(hello.result.sessionId).toBe("tab-1");
    expect(hello.result.protocolVersion).toBe(1);
    const sessions = hub.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      session_id: "tab-1",
      active: true,
      project: { owner: "moatmaslow", repo: "Wall-Anchor" },
      mode: "read",
    });
  });

  it("refuses a wrong token and closes the socket", async () => {
    const p = page({ token: "abd-wrong" });
    const hello = await p.hello;
    expect(hello.error.code).toBe(ERROR_CODES.PERMISSION_DENIED);
    const closed = await p.closed;
    expect(closed.code).toBe(CLOSE_CODES.BAD_TOKEN);
    expect(hub.listSessions()).toHaveLength(0);
  });

  it("refuses an origin that is not allowed before upgrading", async () => {
    const p = page({ origin: "https://evil.example" });
    await expect(p.opened).rejects.toThrow("HTTP 403");
  });

  it("refuses a protocol mismatch with an explanation", async () => {
    const p = page({ protocolVersion: 99 });
    const hello = await p.hello;
    expect(hello.error.message).toMatch(/Protocol mismatch/);
    expect((await p.closed).code).toBe(CLOSE_CODES.VERSION_MISMATCH);
  });

  it("closes connections that never say hello", async () => {
    const p = page({ sendHello: false });
    await p.opened;
    expect((await p.closed).code).toBe(CLOSE_CODES.HELLO_TIMEOUT);
  });

  it("relays a tool call and returns the page's result", async () => {
    page({ handler: async (name, args) => ({ echoed: { name, args } }) });
    await pages[0].hello;
    const result = await hub.call(undefined, "get_atom", { atom: "id-1" });
    expect(result).toEqual({
      echoed: { name: "get_atom", args: { atom: "id-1" } },
    });
  });

  it("turns page errors into ToolErrors with the page's code", async () => {
    page({
      handler: async () => {
        const err = new Error("Edits are turned off");
        err.code = ERROR_CODES.PERMISSION_DENIED;
        throw err;
      },
    });
    await pages[0].hello;
    await expect(hub.call(undefined, "set_param", {})).rejects.toMatchObject({
      code: ERROR_CODES.PERMISSION_DENIED,
      message: "Edits are turned off",
    });
  });

  it("times out when the page never answers", async () => {
    page({ handler: async () => undefined });
    await pages[0].hello;
    await expect(
      hub.call(undefined, "get_project", {}, { timeoutMs: 100 }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.TIMEOUT,
    });
  });

  it("forwards progress and treats it as a sign of life", async () => {
    const progress = [];
    page({
      handler: async (_name, _args, ctx) => {
        for (let i = 1; i <= 3; i++) {
          await new Promise((r) => setTimeout(r, 80));
          ctx.progress({ progress: i, total: 3, message: `step ${i}` });
        }
        return { done: true };
      },
    });
    await pages[0].hello;
    // 240ms of work with a 150ms timeout only succeeds because progress resets the clock.
    const result = await hub.call(
      undefined,
      "wait_for_settle",
      {},
      {
        timeoutMs: 150,
        onProgress: (p) => progress.push(p.message),
      },
    );
    expect(result).toEqual({ done: true });
    expect(progress).toEqual(["step 1", "step 2", "step 3"]);
  });

  it("fails in-flight calls when the page disconnects", async () => {
    page({ handler: async () => undefined });
    await pages[0].hello;
    const pending = hub.call(undefined, "get_project", {});
    await new Promise((r) => setTimeout(r, 20));
    pages[0].close();
    await expect(pending).rejects.toMatchObject({
      code: ERROR_CODES.NO_PROJECT,
    });
  });

  it("errors clearly when no page is connected", async () => {
    await expect(hub.call(undefined, "get_project", {})).rejects.toThrow(
      /No Abundance page is connected/,
    );
  });

  it("keeps the session ID when the same tab reconnects", async () => {
    const first = page({ clientId: "client-a" });
    expect((await first.hello).result.sessionId).toBe("tab-1");
    const second = page({ clientId: "client-a" });
    expect((await second.hello).result.sessionId).toBe("tab-1");
    expect((await first.closed).code).toBe(CLOSE_CODES.REPLACED);
    expect(hub.listSessions()).toHaveLength(1);
  });

  it("routes to the most recently focused tab, or a pinned one", async () => {
    const a = page({
      clientId: "a",
      project: { owner: "o", repo: "A" },
      handler: async () => "A",
    });
    await a.hello;
    const b = page({
      clientId: "b",
      project: { owner: "o", repo: "B" },
      focused: false,
      handler: async () => "B",
    });
    await b.hello;
    expect(await hub.call(undefined, "x", {})).toBe("A");

    b.send({
      jsonrpc: "2.0",
      method: "session.update",
      params: { focused: true },
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(await hub.call(undefined, "x", {})).toBe("B");

    hub.selectSession("tab-1");
    expect(await hub.call(undefined, "x", {})).toBe("A");
    expect(await hub.call("tab-2", "x", {})).toBe("B");
  });

  it("records mode changes from session.update", async () => {
    const p = page();
    await p.hello;
    p.send({
      jsonrpc: "2.0",
      method: "session.update",
      params: { mode: "edit" },
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(hub.listSessions()[0].mode).toBe("edit");
  });

  it("ignores malformed frames without dropping the session", async () => {
    const p = page({ handler: async () => "still here" });
    await p.hello;
    p.ws.send("not json");
    p.ws.send(JSON.stringify({ hello: "world" }));
    expect(await hub.call(undefined, "x", {})).toBe("still here");
  });
});

describe("PageHub session IDs", () => {
  it("gives a reloaded tab the same session ID after it disconnected", async () => {
    const hub = new PageHub({ token: TOKEN, port: 0 });
    const port = await hub.start();
    const first = connectFakePage(port, {
      token: TOKEN,
      clientId: "reload-me",
    });
    expect((await first.hello).result.sessionId).toBe("tab-1");
    first.close();
    await first.closed;
    await new Promise((r) => setTimeout(r, 20));
    const second = connectFakePage(port, {
      token: TOKEN,
      clientId: "reload-me",
    });
    expect((await second.hello).result.sessionId).toBe("tab-1");
    const other = connectFakePage(port, {
      token: TOKEN,
      clientId: "someone-else",
    });
    expect((await other.hello).result.sessionId).toBe("tab-2");
    second.ws.terminate();
    other.ws.terminate();
    await hub.stop();
  });
});
