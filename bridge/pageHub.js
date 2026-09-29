import { EventEmitter } from "node:events";
import { WebSocketServer } from "ws";
import {
  CLOSE_CODES,
  ERROR_CODES,
  PROTOCOL_VERSION,
  ToolError,
  isAllowedOrigin,
  makeError,
  makeRequest,
  makeResult,
  parseMessage,
} from "../src/agent/protocol.js";
import { tokensMatch } from "./token.js";

const HEARTBEAT_MS = 20_000;

/**
 * Accepts WebSocket connections from Abundance pages and relays tool calls to
 * them. Each authenticated connection is a "session" (one browser tab).
 *
 * Events:
 *   "session"        (session)            a page completed the handshake
 *   "session-closed" (session, code)      a page went away
 *   "session-update" (session)            a page reported new project/mode info
 *   "rejected"       ({ reason, origin })  a connection was refused
 */
export class PageHub extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.token - pairing token pages must present
   * @param {number} [options.port]
   * @param {string} [options.host] - always loopback in production
   * @param {string[]} [options.extraOrigins]
   * @param {number} [options.helloTimeoutMs]
   * @param {number} [options.callTimeoutMs] - default per-call timeout
   * @param {string} [options.bridgeVersion]
   */
  constructor({
    token,
    port = 0,
    host = "127.0.0.1",
    extraOrigins = [],
    helloTimeoutMs = 5_000,
    callTimeoutMs = 150_000,
    bridgeVersion = "0.0.0",
  }) {
    super();
    this.token = token;
    this.port = port;
    this.host = host;
    this.extraOrigins = extraOrigins;
    this.helloTimeoutMs = helloTimeoutMs;
    this.callTimeoutMs = callTimeoutMs;
    this.bridgeVersion = bridgeVersion;
    /** @type {Map<string, Session>} */
    this.sessions = new Map();
    this._nextCallId = 1;
    this._nextSessionNumber = 1;
    /** Session IDs by page client ID, so a reloaded tab keeps its ID. */
    this._idsByClient = new Map();
    this.wss = null;
    this.listenError = null;
  }

  /** Start listening. Resolves with the bound port. */
  start() {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({
        host: this.host,
        port: this.port,
        maxPayload: 256 * 1024 * 1024,
        verifyClient: (info, done) => {
          const origin = info.origin || info.req.headers.origin;
          if (!isAllowedOrigin(origin, this.extraOrigins)) {
            this.emit("rejected", { reason: "origin", origin });
            done(false, 403, "Origin not allowed");
            return;
          }
          done(true);
        },
      });
      const onError = (err) => {
        this.listenError = err;
        reject(err);
      };
      wss.once("error", onError);
      wss.once("listening", () => {
        wss.off("error", onError);
        wss.on("error", (err) => this.emit("error", err));
        this.wss = wss;
        this.port = wss.address().port;
        this._heartbeat = setInterval(() => this._pingAll(), HEARTBEAT_MS);
        this._heartbeat.unref?.();
        resolve(this.port);
      });
      wss.on("connection", (ws, req) => this._onConnection(ws, req));
    });
  }

  async stop() {
    clearInterval(this._heartbeat);
    for (const session of this.sessions.values()) {
      this._failPending(session, "Bridge shutting down");
      session.ws.terminate();
    }
    this.sessions.clear();
    if (this.wss) {
      await new Promise((resolve) => this.wss.close(() => resolve()));
      this.wss = null;
    }
  }

  // ------------------------------------------------------------------ sessions

  listSessions() {
    const active = this.activeSession();
    return [...this.sessions.values()].map((s) => ({
      session_id: s.id,
      active: s === active,
      project: s.info.project || null,
      mode: s.info.mode || "read",
      url: s.info.url || null,
      focused: !!s.info.focused,
      app_version: s.info.appVersion || null,
      connected_at: new Date(s.connectedAt).toISOString(),
    }));
  }

  /**
   * The session tool calls go to when none is named: the one pinned with
   * selectSession, else the most recently focused tab, else the newest.
   */
  activeSession() {
    if (this.pinnedSessionId && this.sessions.has(this.pinnedSessionId)) {
      return this.sessions.get(this.pinnedSessionId);
    }
    let best = null;
    for (const s of this.sessions.values()) {
      if (!best) {
        best = s;
        continue;
      }
      const sScore = s.lastFocusAt || 0;
      const bScore = best.lastFocusAt || 0;
      if (
        sScore > bScore ||
        (sScore === bScore && s.connectedAt > best.connectedAt)
      ) {
        best = s;
      }
    }
    return best;
  }

  selectSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      throw new ToolError(
        ERROR_CODES.NOT_FOUND,
        `No connected session "${sessionId}". Call list_sessions to see what is connected.`,
      );
    }
    this.pinnedSessionId = sessionId;
    return this.sessions.get(sessionId);
  }

  /**
   * Call a tool in a page.
   * @param {string|undefined} sessionId
   * @param {string} name
   * @param {object} args
   * @param {{ timeoutMs?: number, onProgress?: Function }} [options]
   */
  call(sessionId, name, args, { timeoutMs, onProgress } = {}) {
    const session = sessionId
      ? this.sessions.get(sessionId)
      : this.activeSession();
    if (!session) {
      return Promise.reject(
        new ToolError(
          ERROR_CODES.NO_PROJECT,
          sessionId
            ? `No connected session "${sessionId}".`
            : "No Abundance page is connected to the bridge. Call bridge_status for pairing instructions to give the user.",
        ),
      );
    }
    const id = this._nextCallId++;
    const timeout = timeoutMs ?? this.callTimeoutMs;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        session.pending.delete(id);
        reject(
          new ToolError(
            ERROR_CODES.TIMEOUT,
            `The page did not answer ${name} within ${Math.round(timeout / 1000)}s.`,
          ),
        );
      }, timeout);
      timer.unref?.();
      session.pending.set(id, { resolve, reject, timer, onProgress, name });
      this._send(
        session.ws,
        makeRequest(id, "tool.call", { name, arguments: args ?? {} }),
      );
    });
  }

  // ------------------------------------------------------------------ internals

  _onConnection(ws, req) {
    const origin = req.headers.origin;
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    let session = null;
    const helloTimer = setTimeout(() => {
      if (!session) {
        this.emit("rejected", { reason: "hello-timeout", origin });
        ws.close(CLOSE_CODES.HELLO_TIMEOUT, "No hello received");
      }
    }, this.helloTimeoutMs);
    helloTimer.unref?.();

    ws.on("message", (data) => {
      const msg = parseMessage(data.toString());
      if (!msg) return;

      if (!session) {
        if (msg.method !== "bridge.hello" || msg.id === undefined) {
          ws.close(CLOSE_CODES.HELLO_TIMEOUT, "Expected bridge.hello");
          return;
        }
        clearTimeout(helloTimer);
        session = this._handleHello(ws, msg, origin);
        return;
      }
      this._onSessionMessage(session, msg);
    });

    ws.on("close", (code) => {
      clearTimeout(helloTimer);
      if (session && this.sessions.get(session.id) === session) {
        this.sessions.delete(session.id);
        this._failPending(session, "The Abundance page disconnected.");
        this.emit("session-closed", session, code);
      }
    });
    ws.on("error", () => {});
  }

  _handleHello(ws, msg, origin) {
    const params = msg.params || {};
    if (params.protocolVersion !== PROTOCOL_VERSION) {
      const message = `Protocol mismatch: page speaks v${params.protocolVersion}, bridge speaks v${PROTOCOL_VERSION}. Update ${
        (params.protocolVersion ?? 0) < PROTOCOL_VERSION
          ? "the page (reload it)"
          : "the bridge (restart your AI app; installs using @maslowcnc/abundance-bridge@latest update on restart)"
      }.`;
      this._send(ws, makeError(msg.id, ERROR_CODES.INVALID_REQUEST, message));
      ws.close(CLOSE_CODES.VERSION_MISMATCH, "Protocol version mismatch");
      this.emit("rejected", { reason: "version", origin });
      return null;
    }
    if (!tokensMatch(this.token, params.token)) {
      this._send(
        ws,
        makeError(
          msg.id,
          ERROR_CODES.PERMISSION_DENIED,
          "Pairing token does not match this bridge.",
        ),
      );
      ws.close(CLOSE_CODES.BAD_TOKEN, "Bad pairing token");
      this.emit("rejected", { reason: "token", origin });
      return null;
    }

    // A tab that reconnects keeps its session ID; drop the stale socket.
    const clientId =
      typeof params.clientId === "string" ? params.clientId : null;
    let id = null;
    if (clientId) {
      for (const existing of this.sessions.values()) {
        if (existing.clientId === clientId) {
          id = existing.id;
          this.sessions.delete(existing.id);
          this._failPending(existing, "The page reconnected.");
          existing.ws.close(
            CLOSE_CODES.REPLACED,
            "Replaced by a newer connection",
          );
        }
      }
    }
    if (!id && clientId) id = this._idsByClient.get(clientId) || null;
    if (!id) id = `tab-${this._nextSessionNumber++}`;
    if (clientId) this._idsByClient.set(clientId, id);

    const session = {
      id,
      clientId,
      ws,
      origin,
      connectedAt: Date.now(),
      lastFocusAt: params.focused ? Date.now() : 0,
      info: pickInfo(params),
      pending: new Map(),
    };
    this.sessions.set(id, session);
    this._send(
      ws,
      makeResult(msg.id, {
        sessionId: id,
        protocolVersion: PROTOCOL_VERSION,
        bridgeVersion: this.bridgeVersion,
      }),
    );
    this.emit("session", session);
    return session;
  }

  _onSessionMessage(session, msg) {
    // Response to a tool.call we sent.
    if (msg.id !== undefined && msg.method === undefined) {
      const pending = session.pending.get(msg.id);
      if (!pending) return;
      session.pending.delete(msg.id);
      clearTimeout(pending.timer);
      if (msg.error) {
        pending.reject(
          new ToolError(
            msg.error.code ?? ERROR_CODES.INTERNAL_ERROR,
            msg.error.message,
            msg.error.data,
          ),
        );
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    if (msg.method === "session.update") {
      const params = msg.params || {};
      session.info = { ...session.info, ...pickInfo(params) };
      if (params.focused) session.lastFocusAt = Date.now();
      this.emit("session-update", session);
      return;
    }

    if (msg.method === "tool.progress") {
      const params = msg.params || {};
      const pending = session.pending.get(params.callId);
      if (!pending) return;
      // Progress means the page is alive: restart the timeout clock.
      pending.timer.refresh?.();
      pending.onProgress?.(params);
      return;
    }

    if (msg.id !== undefined) {
      this._send(
        session.ws,
        makeError(
          msg.id,
          ERROR_CODES.METHOD_NOT_FOUND,
          `Unknown method ${msg.method}`,
        ),
      );
    }
  }

  _failPending(session, message) {
    for (const [id, pending] of session.pending) {
      clearTimeout(pending.timer);
      pending.reject(new ToolError(ERROR_CODES.NO_PROJECT, message));
      session.pending.delete(id);
    }
  }

  _pingAll() {
    for (const session of this.sessions.values()) {
      const ws = session.ws;
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        // socket already closing
      }
    }
  }

  _send(ws, msg) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }
}

function pickInfo(params) {
  const info = {};
  for (const key of ["project", "mode", "url", "focused", "appVersion"]) {
    if (params[key] !== undefined) info[key] = params[key];
  }
  return info;
}
