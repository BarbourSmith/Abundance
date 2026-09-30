/**
 * Wire protocol shared by the Abundance page and the local agent bridge.
 *
 * The page opens a WebSocket to the bridge (never the other way around) and
 * both sides exchange JSON-RPC 2.0 messages:
 *
 *   page   -> bridge  request       "bridge.hello"   (first message, carries the pairing token)
 *   bridge -> page    request       "tool.call"      { name, arguments }
 *   page   -> bridge  notification  "session.update" (project/mode/focus changed)
 *   page   -> bridge  notification  "tool.progress"  { callId, message, progress, total }
 *
 * This file must stay dependency-free: it is imported by browser code and by
 * the Node bridge (bridge/).
 */

/** Bumped whenever a change would break an older page or bridge. */
export const PROTOCOL_VERSION = 1;

/** Default localhost port the bridge listens on. */
export const DEFAULT_BRIDGE_PORT = 4455;

/** Origins that may connect to the bridge (localhost ports are matched by pattern). */
export const PRODUCTION_ORIGINS = ["https://abundance.maslowcnc.com"];

/**
 * Returns true if a page served from `origin` may connect to the bridge.
 * Any http://localhost:<port> or http://127.0.0.1:<port> origin is accepted so
 * the dev server and `vite preview` work; everything else must be listed.
 * @param {string|undefined} origin
 * @param {string[]} [extraOrigins]
 */
export function isAllowedOrigin(origin, extraOrigins = []) {
  if (!origin || typeof origin !== "string") return false;
  if (PRODUCTION_ORIGINS.includes(origin)) return true;
  if (extraOrigins.includes(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}

/** WebSocket close codes the bridge uses to explain a rejected session. */
export const CLOSE_CODES = Object.freeze({
  BAD_TOKEN: 4001,
  VERSION_MISMATCH: 4002,
  BAD_ORIGIN: 4003,
  HELLO_TIMEOUT: 4004,
  REPLACED: 4005,
  PAGE_DISCONNECT: 4006,
});

/** JSON-RPC error codes used in tool responses. */
export const ERROR_CODES = Object.freeze({
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  PERMISSION_DENIED: -32001,
  NOT_FOUND: -32002,
  NO_PROJECT: -32003,
  TIMEOUT: -32004,
  CONFLICT: -32005,
});

/** Error thrown by tool implementations; carries a JSON-RPC error code. */
export class ToolError extends Error {
  constructor(code, message, data) {
    super(message);
    this.name = "ToolError";
    this.code = code;
    this.data = data;
  }
}

export function makeRequest(id, method, params) {
  return { jsonrpc: "2.0", id, method, params };
}

export function makeNotification(method, params) {
  return { jsonrpc: "2.0", method, params };
}

export function makeResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

export function makeError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id, error };
}

/**
 * Parse one incoming frame. Returns null (instead of throwing) for anything
 * that is not a JSON-RPC 2.0 object so a bad frame can never crash a socket.
 * @param {string} text
 */
export function parseMessage(text) {
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return null;
  }
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0") return null;
  return msg;
}
