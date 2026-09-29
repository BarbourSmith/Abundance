import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Directory holding the bridge's pairing token. Override with
 * ABUNDANCE_BRIDGE_HOME (used by tests so they never touch the real token).
 */
export function bridgeHome() {
  return (
    process.env.ABUNDANCE_BRIDGE_HOME ||
    path.join(os.homedir(), ".abundance-bridge")
  );
}

export function generateToken() {
  return "abd-" + crypto.randomBytes(18).toString("base64url");
}

/**
 * Load the pairing token, creating it on first run. The token is stable across
 * bridge restarts so the user only pastes it into Abundance once.
 * ABUNDANCE_BRIDGE_TOKEN overrides the stored token entirely.
 * @param {{ regenerate?: boolean }} [options]
 * @returns {{ token: string, file: string | null, created: boolean }}
 */
export function loadOrCreateToken({ regenerate = false } = {}) {
  if (process.env.ABUNDANCE_BRIDGE_TOKEN) {
    return {
      token: process.env.ABUNDANCE_BRIDGE_TOKEN,
      file: null,
      created: false,
    };
  }
  const dir = bridgeHome();
  const file = path.join(dir, "token");
  if (!regenerate) {
    try {
      const existing = fs.readFileSync(file, "utf8").trim();
      if (existing) return { token: existing, file, created: false };
    } catch {
      // fall through and create one
    }
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const token = generateToken();
  fs.writeFileSync(file, token + "\n", { mode: 0o600 });
  return { token, file, created: true };
}

/** Constant-time token comparison. */
export function tokensMatch(expected, provided) {
  if (typeof expected !== "string" || typeof provided !== "string") {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
