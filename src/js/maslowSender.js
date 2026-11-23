// Sends a G-code file to a Maslow CNC on the user's network.
//
// Abundance is served over https and the machine is plain http, so the browser blocks every
// request to it (mixed content). An https page may open an http page in a new tab, though, and
// the two can talk with window.postMessage. So this opens the machine's own web UI and hands it
// the file. That UI uploads the file to its SD card and loads it for preview; the user presses
// Play there. Nothing here starts a job.
//
// The receiving side and the message spec are in the Maslow_4 repository:
// ESP3D-WEBUI/www/js/jobreceiver.js and docs/protocol.md section 7.
//
// This only works while the window.opener link between the two tabs is intact. Abundance must
// not be served with Cross-Origin-Opener-Policy: same-origin, and the tab must not be opened
// with noopener or noreferrer.

export const DEFAULT_MACHINE_ADDRESS = "http://maslow.local/";
export const ADDRESS_STORAGE_KEY = "maslow-machine-address";

/** The name of the tab the machine's UI opens in, so sending again reuses it. */
const WINDOW_NAME = "maslow";

const HELLO_INTERVAL_MS = 500;
const READY_TIMEOUT_MS = 30000;
// The UI uploads to an ESP32, which is slow for large files
const RESULT_TIMEOUT_MS = 5 * 60000;

/**
 * Turn what the user typed into the address to open.
 * @param {string} input - e.g. "maslow.local", "192.168.1.50" or "http://maslow.local/"
 * @returns {{address: string, origin: string} | {error: string}}
 */
export function normalizeMachineAddress(input) {
  let text = String(input ?? "").trim();
  if (!text) {
    text = DEFAULT_MACHINE_ADDRESS;
  }
  if (/^https:/i.test(text)) {
    return {
      error:
        "The Maslow address must start with http://, not https://. The machine does not serve https.",
    };
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    text = `http://${text}`;
  }
  let url;
  try {
    // Some browsers accept spaces in a host name, which is never what was meant
    url = /\s/.test(text) ? null : new URL(text);
  } catch {
    url = null;
  }
  if (!url || url.protocol !== "http:" || !url.hostname) {
    return {
      error: `"${String(input).trim()}" is not a valid Maslow address. Use something like ${DEFAULT_MACHINE_ADDRESS} or http://192.168.1.50/.`,
    };
  }
  return { address: url.href, origin: url.origin };
}

/** The machine address the user last saved, or the default. */
export function getMachineAddress(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(ADDRESS_STORAGE_KEY) || DEFAULT_MACHINE_ADDRESS;
  } catch {
    return DEFAULT_MACHINE_ADDRESS;
  }
}

/**
 * Check and remember a machine address.
 * @returns {{address: string, origin: string} | {error: string}} what normalizeMachineAddress returns
 */
export function saveMachineAddress(input, storage = globalThis.localStorage) {
  const normalized = normalizeMachineAddress(input);
  if (!normalized.error) {
    try {
      storage?.setItem(ADDRESS_STORAGE_KEY, normalized.address);
    } catch {
      // Storage can be unavailable (private windows); the address still works for this send
    }
  }
  return normalized;
}

/**
 * Open the machine's UI and send it a G-code file.
 *
 * Call this directly from a click handler: it opens the tab before doing anything else, and a
 * browser blocks window.open when it doesn't come straight from a user action.
 *
 * @param {object} options
 * @param {string} options.address - The machine address (anything normalizeMachineAddress accepts)
 * @param {string} options.name - The file name, e.g. "chair.gcode"
 * @param {string|Blob} options.gcode - The file's contents
 * @param {(status: {stage: string}) => void} [options.onStatus] - Called with the stage as it
 *   changes: "opening", "waiting" (for the machine's UI to answer), then "sending"
 * @param {object} [options.env] - For tests: {window, setInterval, clearInterval, setTimeout,
 *   clearTimeout}. window needs open, addEventListener and removeEventListener.
 * @returns {{result: Promise<object>, cancel: () => void}} result never rejects. It resolves with
 *   {ok: true, name, path} (where the file went on the SD card; the UI may have changed the name)
 *   or {ok: false, reason, detail}. detail is a sentence for the user. reason is one the UI
 *   reported ("invalid", "not-ready", "busy", "rejected", "bad-reply", "failed") or one of ours:
 *   "bad-address", "popup-blocked", "timeout", "closed", "cancelled".
 */
export function sendToMaslow({ address, name, gcode, onStatus, env = {} }) {
  const win = env.window ?? globalThis.window;
  const startInterval = env.setInterval ?? globalThis.setInterval;
  const stopInterval = env.clearInterval ?? globalThis.clearInterval;
  const startTimeout = env.setTimeout ?? globalThis.setTimeout;
  const stopTimeout = env.clearTimeout ?? globalThis.clearTimeout;
  const status = (stage) => onStatus?.({ stage });
  const failure = (reason, detail) => ({ ok: false, reason, detail });
  const done = (value) => ({ result: Promise.resolve(value), cancel() {} });

  const target = normalizeMachineAddress(address);
  if (target.error) {
    return done(failure("bad-address", target.error));
  }

  status("opening");
  // No "noopener" or "noreferrer": either one cuts the link postMessage needs
  const machine = win.open(target.address, WINDOW_NAME);
  if (!machine) {
    return done(
      failure(
        "popup-blocked",
        "The browser blocked the Maslow tab. Allow popups for this site and try again.",
      ),
    );
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let sent = false;
  let finish;
  let interval;
  let timeout;

  const post = (message) => {
    try {
      machine.postMessage(message, target.origin);
    } catch {
      // The tab is gone or mid-navigation; the closed check and the timeout handle it
    }
  };

  const tick = () => {
    if (machine.closed) {
      finish(
        failure(
          "closed",
          sent
            ? "The Maslow tab was closed before it confirmed the file. Check the machine's file list."
            : "The Maslow tab was closed before the file was sent.",
        ),
      );
    } else if (!sent) {
      post({ type: "maslow:hello" });
    }
  };

  const onMessage = (event) => {
    if (event.origin !== target.origin || event.source !== machine) {
      return;
    }
    const data = event.data;
    if (!data || typeof data !== "object") {
      return;
    }
    if (data.type === "maslow:ready" && !sent) {
      sent = true;
      status("sending");
      stopTimeout(timeout);
      timeout = startTimeout(() => {
        finish(
          failure(
            "timeout",
            "The Maslow did not confirm the file. Check the machine's file list before sending again.",
          ),
        );
      }, RESULT_TIMEOUT_MS);
      post({ type: "maslow:gcode", id, name, gcode });
    } else if (data.type === "maslow:result" && sent && data.id === id) {
      finish(
        data.ok
          ? { ok: true, name: data.name ?? name, path: data.path }
          : failure(
              data.reason ?? "failed",
              data.detail || "The Maslow could not take the file.",
            ),
      );
    }
  };

  const result = new Promise((resolve) => {
    finish = (value) => {
      stopInterval(interval);
      stopTimeout(timeout);
      win.removeEventListener("message", onMessage);
      finish = () => {};
      resolve(value);
    };
  });

  win.addEventListener("message", onMessage);
  status("waiting");
  // The UI stays silent until it has connected to its machine, and a message posted while the
  // tab is loading is lost, so keep asking
  interval = startInterval(tick, HELLO_INTERVAL_MS);
  timeout = startTimeout(() => {
    finish(
      failure(
        "timeout",
        `The Maslow could not be reached at ${target.address}. Check the address, and that this computer is on the same network as the Maslow.`,
      ),
    );
  }, READY_TIMEOUT_MS);
  tick();

  return {
    result,
    cancel: () => finish(failure("cancelled", "Sending was cancelled.")),
  };
}
