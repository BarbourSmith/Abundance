import WebSocket from "ws";
import { PROTOCOL_VERSION } from "../../src/agent/protocol.js";

/**
 * A minimal stand-in for an Abundance tab: connects, says hello, and answers
 * tool.call requests with `handler(name, args, ctx)`.
 */
export function connectFakePage(
  port,
  {
    token,
    origin = "http://localhost:4444",
    clientId = null,
    protocolVersion = PROTOCOL_VERSION,
    project = { owner: "moatmaslow", repo: "Wall-Anchor" },
    mode = "read",
    focused = true,
    handler = async () => ({ ok: true }),
    sendHello = true,
  } = {},
) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
  const page = {
    ws,
    calls: [],
    closed: new Promise((resolve) =>
      ws.on("close", (code, reason) =>
        resolve({ code, reason: reason.toString() }),
      ),
    ),
    hello: null,
    send(msg) {
      ws.send(JSON.stringify(msg));
    },
    close() {
      ws.close();
    },
  };
  page.opened = new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
    ws.on("unexpected-response", (_req, res) =>
      reject(new Error(`HTTP ${res.statusCode}`)),
    );
  });
  page.hello = new Promise((resolve) => {
    ws.on("message", async (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === "hello") {
        resolve(msg);
        return;
      }
      if (msg.method === "tool.call") {
        page.calls.push(msg.params);
        try {
          const result = await handler(msg.params.name, msg.params.arguments, {
            callId: msg.id,
            progress: (params) =>
              page.send({
                jsonrpc: "2.0",
                method: "tool.progress",
                params: { callId: msg.id, ...params },
              }),
          });
          if (result === undefined) return; // handler chose not to answer
          page.send({ jsonrpc: "2.0", id: msg.id, result });
        } catch (err) {
          page.send({
            jsonrpc: "2.0",
            id: msg.id,
            error: { code: err.code ?? -32603, message: err.message },
          });
        }
      }
    });
  });
  if (sendHello) {
    page.opened
      .then(() =>
        page.send({
          jsonrpc: "2.0",
          id: "hello",
          method: "bridge.hello",
          params: {
            protocolVersion,
            token,
            clientId,
            project,
            mode,
            focused,
            url: origin + "/run/x/y",
            appVersion: "test",
          },
        }),
      )
      .catch(() => {});
  }
  return page;
}
