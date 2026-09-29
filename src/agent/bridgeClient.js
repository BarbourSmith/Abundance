/**
 * Browser side of the local agent bridge.
 *
 * When the user turns it on, the page opens a WebSocket to the bridge on
 * 127.0.0.1, authenticates with the pairing token, and answers tool calls by
 * running them against the live project (./runtime.js, loaded lazily).
 *
 * Nothing here touches the network unless the user enabled the bridge, so
 * ordinary visitors never probe localhost or see a local-network prompt.
 *
 * UI components subscribe with `subscribe` / `getState` (useSyncExternalStore).
 */
import {
  CLOSE_CODES,
  DEFAULT_BRIDGE_PORT,
  ERROR_CODES,
  PROTOCOL_VERSION,
  makeError,
  makeNotification,
  makeRequest,
  makeResult,
  parseMessage,
} from "./protocol.js";
import { TOOLS_BY_NAME } from "./tools.js";

export const SETTINGS_STORAGE_KEY = "abundance-agent-bridge";
const CLIENT_ID_KEY = "abundance-agent-bridge-client";
const MAX_BACKOFF_MS = 30_000;
const PROJECT_POLL_MS = 2_000;

/** Settings persisted in localStorage. Edit mode is deliberately not saved. */
export function loadSettings(storage = safeLocalStorage()) {
  const defaults = { enabled: false, port: DEFAULT_BRIDGE_PORT, token: "" };
  try {
    const raw = storage?.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      enabled: !!parsed.enabled,
      port: Number(parsed.port) || DEFAULT_BRIDGE_PORT,
      token: typeof parsed.token === "string" ? parsed.token : "",
    };
  } catch {
    return defaults;
  }
}

function saveSettings(settings, storage = safeLocalStorage()) {
  try {
    storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage full or blocked: settings just won't persist
  }
}

function safeLocalStorage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Safari refuses connections from an https page to a local ws:// server, so
 * say that instead of suggesting the bridge isn't running.
 */
function unreachableMessage(port) {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent || "";
  const isSafari =
    /safari/i.test(ua) && !/chrome|chromium|crios|android|edg/i.test(ua);
  const isHttps =
    typeof location !== "undefined" && location.protocol === "https:";
  if (isSafari && isHttps) {
    return "Safari blocks secure sites from reaching programs on this computer. Use Chrome or Firefox for the AI agent.";
  }
  return `Can't reach the bridge on port ${port}. Is it running?`;
}

function clientId() {
  try {
    let id = sessionStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = `c-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      sessionStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export class AgentBridgeClient {
  /**
   * @param {object} [deps] - injectable for tests
   * @param {typeof WebSocket} [deps.WebSocketImpl]
   * @param {() => Promise<{ runTool: Function }>} [deps.loadRuntime]
   * @param {() => object|null} [deps.getProject]
   * @param {string} [deps.appVersion]
   */
  constructor({
    WebSocketImpl = typeof WebSocket === "undefined" ? null : WebSocket,
    loadRuntime = () => import("./runtime.js"),
    getProject = () => null,
    appVersion = "unknown",
  } = {}) {
    this.WebSocketImpl = WebSocketImpl;
    this.loadRuntime = loadRuntime;
    this.getProject = getProject;
    this.appVersion = appVersion;
    this.listeners = new Set();
    this.settings = loadSettings();
    this.state = {
      status: "off", // off | connecting | connected | error
      mode: "read", // read | edit
      sessionId: null,
      error: null,
      activity: null, // { tool, at, ok }
      settings: this.settings,
    };
    this.ws = null;
    this.backoffMs = 1000;
    this.reconnectTimer = null;
    this.editQueue = Promise.resolve();
    this.lastProject = null;
    /**
     * Set by the editor route: (reason) => Promise<{ saved, message? }>. Must
     * ask the user before saving. Null when the page can't save (run mode).
     */
    this.saveHandler = null;
    /** True while a reconnect is scheduled (not after a fatal close). */
    this.waitingToRetry = false;
    this._onFocusChange = () => {
      const focused = this._isFocused();
      this._sendUpdate({ focused });
      // Background tabs run timers late, so the backoff can stretch to
      // minutes. When the user comes back to the tab, try again right away.
      if (focused && this.waitingToRetry && this.settings.enabled && !this.ws) {
        this.backoffMs = 1000;
        this._connect();
      }
    };
    this._started = false;
  }

  // ------------------------------------------------------------ public API

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;

  /** Begin honoring the saved settings. Safe to call more than once. */
  start() {
    if (this._started) return;
    this._started = true;
    if (typeof window !== "undefined") {
      window.addEventListener("focus", this._onFocusChange);
      window.addEventListener("blur", this._onFocusChange);
      document.addEventListener?.("visibilitychange", this._onFocusChange);
    }
    this._projectTimer = setInterval(
      () => this._checkProject(),
      PROJECT_POLL_MS,
    );
    if (this.settings.enabled) this._connect();
  }

  stop() {
    this._started = false;
    clearInterval(this._projectTimer);
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", this._onFocusChange);
      window.removeEventListener("blur", this._onFocusChange);
      document.removeEventListener?.("visibilitychange", this._onFocusChange);
    }
    this._disconnect("off");
  }

  /** Update and persist settings; reconnects when anything relevant changed. */
  updateSettings(patch) {
    const next = { ...this.settings, ...patch };
    next.port = Number(next.port) || DEFAULT_BRIDGE_PORT;
    next.token = String(next.token || "").trim();
    const changed =
      next.enabled !== this.settings.enabled ||
      next.port !== this.settings.port ||
      next.token !== this.settings.token;
    this.settings = next;
    saveSettings(next);
    this._setState({ settings: next });
    if (!changed) return;
    this._disconnect(next.enabled ? "connecting" : "off");
    if (next.enabled) this._connect();
  }

  /** Turn edits on or off for this page load. */
  setMode(mode) {
    const next = mode === "edit" ? "edit" : "read";
    if (next === this.state.mode) return;
    this._setState({ mode: next });
    this._sendUpdate({ mode: next });
  }

  isEditMode() {
    return this.state.mode === "edit";
  }

  /** Retry now instead of waiting for the backoff timer. */
  retry() {
    if (!this.settings.enabled) return;
    this._disconnect("connecting");
    this.backoffMs = 1000;
    this._connect();
  }

  // ------------------------------------------------------------ internals

  _setState(patch) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.error("[agent-bridge] listener failed", e);
      }
    }
  }

  _isFocused() {
    if (typeof document === "undefined") return true;
    return (
      document.visibilityState !== "hidden" && (document.hasFocus?.() ?? true)
    );
  }

  _connect() {
    clearTimeout(this.reconnectTimer);
    this.waitingToRetry = false;
    if (!this.WebSocketImpl) {
      this._setState({
        status: "error",
        error: "This browser has no WebSocket support.",
      });
      return;
    }
    if (!this.settings.token) {
      this._setState({
        status: "error",
        errorKind: "no-token",
        error: "Paste the bridge's pairing token to connect.",
      });
      return;
    }
    this._setState({ status: "connecting", error: null, errorKind: null });
    let ws;
    try {
      ws = new this.WebSocketImpl(`ws://127.0.0.1:${this.settings.port}`);
    } catch (err) {
      this._scheduleReconnect(`Could not open a connection: ${err.message}`);
      return;
    }
    this.ws = ws;
    let helloDone = false;
    let fatal = null;

    ws.onopen = () => {
      this._send(
        makeRequest("hello", "bridge.hello", {
          protocolVersion: PROTOCOL_VERSION,
          token: this.settings.token,
          clientId: clientId(),
          appVersion: this.appVersion,
          url: typeof location === "undefined" ? null : location.href,
          project: this.getProject(),
          mode: this.state.mode,
          focused: this._isFocused(),
        }),
      );
    };

    ws.onmessage = (event) => {
      const msg = parseMessage(
        typeof event.data === "string" ? event.data : "",
      );
      if (!msg) return;
      if (msg.id === "hello" && msg.method === undefined) {
        if (msg.error) {
          fatal = msg.error.message;
          return;
        }
        helloDone = true;
        this.backoffMs = 1000;
        this.lastProject = JSON.stringify(this.getProject());
        this._setState({
          status: "connected",
          sessionId: msg.result?.sessionId ?? null,
          error: null,
        });
        return;
      }
      if (msg.method === "tool.call" && msg.id !== undefined) {
        this._handleToolCall(msg);
      }
    };

    ws.onclose = (event) => {
      if (this.ws !== ws) return; // superseded by a newer socket
      this.ws = null;
      if (!this.settings.enabled) {
        this._setState({ status: "off", sessionId: null });
        return;
      }
      const code = event?.code;
      if (code === CLOSE_CODES.BAD_TOKEN) {
        this._setState({
          status: "error",
          sessionId: null,
          error:
            fatal ||
            "The pairing token does not match the bridge. Copy it again from the bridge.",
        });
        return; // retrying with the same token can't succeed
      }
      if (code === CLOSE_CODES.VERSION_MISMATCH) {
        this._setState({
          status: "error",
          sessionId: null,
          error: fatal || "The bridge and page versions differ.",
        });
        return;
      }
      if (code === CLOSE_CODES.REPLACED) {
        this._setState({
          status: "error",
          sessionId: null,
          error: "Another connection from this tab replaced this one.",
        });
        return;
      }
      this._scheduleReconnect(
        helloDone
          ? "Lost the connection to the bridge. Reconnecting…"
          : unreachableMessage(this.settings.port),
      );
    };

    ws.onerror = () => {
      // onclose follows and handles reconnecting.
    };
  }

  _scheduleReconnect(message) {
    this._setState({ status: "error", sessionId: null, error: message });
    clearTimeout(this.reconnectTimer);
    this.waitingToRetry = true;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    this.reconnectTimer = setTimeout(() => {
      if (this.settings.enabled && !this.ws) this._connect();
    }, delay);
  }

  _disconnect(status) {
    clearTimeout(this.reconnectTimer);
    this.waitingToRetry = false;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try {
        ws.close(CLOSE_CODES.PAGE_DISCONNECT, "Disconnected by the user");
      } catch {
        // already closed
      }
    }
    this._setState({ status, sessionId: null, error: null });
  }

  _send(msg) {
    const ws = this.ws;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  _sendUpdate(params) {
    if (this.state.status === "connected") {
      this._send(makeNotification("session.update", params));
    }
  }

  _checkProject() {
    if (this.state.status !== "connected") return;
    const project = JSON.stringify(this.getProject());
    if (project !== this.lastProject) {
      this.lastProject = project;
      this._sendUpdate({
        project: this.getProject(),
        url: typeof location === "undefined" ? null : location.href,
      });
    }
  }

  async _handleToolCall(msg) {
    const { name, arguments: args } = msg.params || {};
    const tool = TOOLS_BY_NAME[name];
    const progress = (p) =>
      this._send(makeNotification("tool.progress", { callId: msg.id, ...p }));
    const run = async () => {
      const runtime = await this.loadRuntime();
      return runtime.runTool(name, args || {}, {
        mode: this.state.mode,
        progress,
      });
    };

    // Edits and view changes run one at a time so undo groups never interleave.
    let promise;
    if (tool && tool.permission !== "read") {
      promise = this.editQueue.then(run, run);
      this.editQueue = promise.catch(() => {});
    } else {
      promise = run();
    }

    this._setState({ activity: { tool: name, at: Date.now(), ok: null } });
    try {
      const result = await promise;
      this._send(makeResult(msg.id, result === undefined ? null : result));
      this._setState({ activity: { tool: name, at: Date.now(), ok: true } });
    } catch (err) {
      const code = Number.isInteger(err?.code)
        ? err.code
        : ERROR_CODES.INTERNAL_ERROR;
      if (code === ERROR_CODES.INTERNAL_ERROR)
        console.error(`[agent-bridge] ${name} failed`, err);
      this._send(makeError(msg.id, code, err?.message || String(err)));
      this._setState({ activity: { tool: name, at: Date.now(), ok: false } });
    }
  }
}

/** The page's single bridge client. */
export const agentBridge = new AgentBridgeClient();
