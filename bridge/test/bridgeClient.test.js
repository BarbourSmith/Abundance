/**
 * Integration test: the page's real AgentBridgeClient talking to the real
 * PageHub over a real socket, with the in-page runtime replaced by a stub.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { AgentBridgeClient } from "../../src/agent/bridgeClient.js";
import { ERROR_CODES, ToolError } from "../../src/agent/protocol.js";
import { PageHub } from "../pageHub.js";

const TOKEN = "abd-client-test";

/** ws needs an Origin header to pass the bridge's origin check, like a browser sends. */
class BrowserLikeWebSocket extends WebSocket {
  constructor(url) {
    super(url, { origin: "http://localhost:4444" });
  }
}

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => delete data[k],
  };
}

const waitFor = async (predicate, timeoutMs = 3000) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe("AgentBridgeClient against a real bridge", () => {
  let hub;
  let port;
  let client;
  let runtimeCalls;
  let runtimeImpl;

  beforeEach(async () => {
    globalThis.localStorage = memoryStorage();
    globalThis.sessionStorage = memoryStorage();
    hub = new PageHub({ token: TOKEN, port: 0, callTimeoutMs: 2000 });
    port = await hub.start();
    runtimeCalls = [];
    runtimeImpl = async (name, args) => ({ ran: name, args });
    client = new AgentBridgeClient({
      WebSocketImpl: BrowserLikeWebSocket,
      loadRuntime: async () => ({
        runTool: async (name, args, ctx) => {
          runtimeCalls.push({ name, args, mode: ctx.mode });
          return runtimeImpl(name, args, ctx);
        },
      }),
      getProject: () => ({ owner: "moatmaslow", repo: "Wall-Anchor" }),
      appVersion: "test",
    });
  });

  afterEach(async () => {
    client.stop();
    await hub.stop();
    delete globalThis.localStorage;
    delete globalThis.sessionStorage;
  });

  it("stays off and never connects until enabled", async () => {
    client.start();
    await new Promise((r) => setTimeout(r, 50));
    expect(client.getState().status).toBe("off");
    expect(hub.listSessions()).toHaveLength(0);
  });

  it("connects with the pairing token and reports the project", async () => {
    client.start();
    client.updateSettings({ enabled: true, port, token: TOKEN });
    await waitFor(() => client.getState().status === "connected");
    expect(client.getState().sessionId).toBe("tab-1");
    expect(hub.listSessions()[0]).toMatchObject({
      project: { owner: "moatmaslow", repo: "Wall-Anchor" },
      mode: "read",
      app_version: "test",
    });
    // Settings persist, edit mode does not.
    expect(JSON.parse(localStorage.getItem("abundance-agent-bridge"))).toEqual({
      enabled: true,
      port,
      token: TOKEN,
    });
  });

  it("runs tool calls in the page and passes the current mode", async () => {
    client.start();
    client.updateSettings({ enabled: true, port, token: TOKEN });
    await waitFor(() => client.getState().status === "connected");
    const result = await hub.call(undefined, "get_atom", { atom: "Box" });
    expect(result).toEqual({ ran: "get_atom", args: { atom: "Box" } });
    expect(runtimeCalls[0].mode).toBe("read");

    client.setMode("edit");
    await waitFor(() => hub.listSessions()[0].mode === "edit");
    await hub.call(undefined, "set_param", {
      atom: "Box",
      param: "x",
      value: 1,
    });
    expect(runtimeCalls[1].mode).toBe("edit");
    expect(client.getState().activity).toMatchObject({
      tool: "set_param",
      ok: true,
    });
  });

  it("returns runtime errors with their codes", async () => {
    runtimeImpl = async () => {
      throw new ToolError(ERROR_CODES.NOT_FOUND, "No atom named Box");
    };
    client.start();
    client.updateSettings({ enabled: true, port, token: TOKEN });
    await waitFor(() => client.getState().status === "connected");
    await expect(
      hub.call(undefined, "get_atom", { atom: "Box" }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
      message: "No atom named Box",
    });
    expect(client.getState().activity).toMatchObject({ ok: false });
  });

  it("forwards progress from long-running tools", async () => {
    runtimeImpl = async (_name, _args, ctx) => {
      ctx.progress({ progress: 1, total: 2, message: "half" });
      return { done: true };
    };
    client.start();
    client.updateSettings({ enabled: true, port, token: TOKEN });
    await waitFor(() => client.getState().status === "connected");
    const seen = [];
    await hub.call(
      undefined,
      "wait_for_settle",
      {},
      { onProgress: (p) => seen.push(p.message) },
    );
    expect(seen).toEqual(["half"]);
  });

  it("runs edits one at a time, in order, while reads are not blocked", async () => {
    const order = [];
    let releaseFirst;
    runtimeImpl = async (name, args) => {
      order.push(`start ${args.n}`);
      if (args.n === 1) await new Promise((r) => (releaseFirst = r));
      order.push(`end ${args.n}`);
      return args.n;
    };
    client.start();
    client.updateSettings({ enabled: true, port, token: TOKEN });
    client.setMode("edit");
    await waitFor(() => client.getState().status === "connected");

    const first = hub.call(undefined, "set_param", { n: 1 });
    const second = hub.call(undefined, "set_param", { n: 2 });
    await waitFor(() => order.includes("start 1"));
    const read = await hub.call(undefined, "get_project", { n: 3 });
    expect(read).toBe(3);
    expect(order).not.toContain("start 2");
    releaseFirst();
    expect(await first).toBe(1);
    expect(await second).toBe(2);
    expect(order.indexOf("end 1")).toBeLessThan(order.indexOf("start 2"));
  });

  it("stops retrying and explains when the token is wrong", async () => {
    client.start();
    client.updateSettings({ enabled: true, port, token: "abd-wrong" });
    await waitFor(() => client.getState().status === "error");
    expect(client.getState().error).toMatch(/Pairing token does not match/);
    await new Promise((r) => setTimeout(r, 1200));
    expect(client.getState().status).toBe("error");
    expect(hub.listSessions()).toHaveLength(0);
  });

  it("asks for a token before trying to connect", async () => {
    client.start();
    client.updateSettings({ enabled: true, port, token: "" });
    expect(client.getState()).toMatchObject({ status: "error" });
    expect(client.getState().error).toMatch(/pairing token/i);
  });

  it("reconnects after the bridge restarts and keeps its session ID", async () => {
    client.start();
    client.updateSettings({ enabled: true, port, token: TOKEN });
    await waitFor(() => client.getState().status === "connected");
    await hub.stop();
    await waitFor(() => client.getState().status === "error");
    expect(client.getState().error).toMatch(/Lost the connection/);

    hub = new PageHub({ token: TOKEN, port });
    await hub.start();
    await waitFor(() => client.getState().status === "connected", 5000);
    expect(hub.listSessions()).toHaveLength(1);
  });

  it("retries at once when the tab regains focus instead of waiting out the backoff", async () => {
    await hub.stop();
    client.start();
    client.updateSettings({ enabled: true, port, token: TOKEN });
    await waitFor(() => client.getState().status === "error");
    // Simulate a long backoff, as a background tab would see.
    clearTimeout(client.reconnectTimer);
    expect(client.waitingToRetry).toBe(true);

    hub = new PageHub({ token: TOKEN, port });
    await hub.start();
    client._onFocusChange();
    await waitFor(() => client.getState().status === "connected", 1000);
  });

  it("does not retry on focus after a wrong token", async () => {
    client.start();
    client.updateSettings({ enabled: true, port, token: "abd-wrong" });
    await waitFor(() => client.getState().status === "error");
    await new Promise((r) => setTimeout(r, 50));
    client._onFocusChange();
    await new Promise((r) => setTimeout(r, 200));
    expect(hub.listSessions()).toHaveLength(0);
    expect(client.getState().error).toMatch(/Pairing token does not match/);
  });

  it("disconnects when turned off", async () => {
    client.start();
    client.updateSettings({ enabled: true, port, token: TOKEN });
    await waitFor(() => client.getState().status === "connected");
    client.updateSettings({ enabled: false });
    expect(client.getState().status).toBe("off");
    await waitFor(() => hub.listSessions().length === 0);
  });
});
