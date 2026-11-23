import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DEFAULT_MACHINE_ADDRESS,
  ADDRESS_STORAGE_KEY,
  normalizeMachineAddress,
  getMachineAddress,
  saveMachineAddress,
  sendToMaslow,
} from "../src/js/maslowSender.js";

const ORIGIN = "http://maslow.local";

/** A stand-in for the Abundance window and the machine tab it opens. */
function makeEnv({ blocked = false } = {}) {
  const listeners = new Set();
  const machine = { closed: false, posted: [], postMessage: vi.fn() };
  machine.postMessage.mockImplementation((message, targetOrigin) => {
    machine.posted.push({ message, targetOrigin });
  });
  const window = {
    open: vi.fn(() => (blocked ? null : machine)),
    addEventListener: (type, fn) => type === "message" && listeners.add(fn),
    removeEventListener: (type, fn) =>
      type === "message" && listeners.delete(fn),
  };
  /** Deliver a message as if the machine tab had posted it. */
  const reply = (data, { origin = ORIGIN, source = machine } = {}) => {
    for (const fn of [...listeners]) fn({ data, origin, source });
  };
  const ofType = (type) =>
    machine.posted.filter((p) => p.message.type === type);
  return { env: { window }, machine, listeners, reply, ofType };
}

const start = (ctx, options = {}) => {
  const stages = [];
  const send = sendToMaslow({
    address: DEFAULT_MACHINE_ADDRESS,
    name: "chair.gcode",
    gcode: "G0 X0\n",
    onStatus: (s) => stages.push(s.stage),
    env: ctx.env,
    ...options,
  });
  return { ...send, stages };
};

describe("normalizeMachineAddress", () => {
  it("keeps a full http address", () => {
    expect(normalizeMachineAddress("http://maslow.local/")).toEqual({
      address: "http://maslow.local/",
      origin: ORIGIN,
    });
  });

  it("adds http:// when there is no scheme", () => {
    expect(normalizeMachineAddress(" 192.168.1.50 ")).toEqual({
      address: "http://192.168.1.50/",
      origin: "http://192.168.1.50",
    });
    expect(normalizeMachineAddress("maslow.local:8080").origin).toBe(
      "http://maslow.local:8080",
    );
  });

  it("uses the default for an empty address", () => {
    expect(normalizeMachineAddress("").address).toBe(DEFAULT_MACHINE_ADDRESS);
  });

  it("rejects https with a message that says why", () => {
    expect(normalizeMachineAddress("https://maslow.local/").error).toMatch(
      /http:\/\/, not https/,
    );
    expect(normalizeMachineAddress("HTTPS://maslow.local").error).toBeTruthy();
  });

  it("rejects other schemes and nonsense", () => {
    expect(normalizeMachineAddress("ftp://maslow.local").error).toBeTruthy();
    expect(normalizeMachineAddress("http://").error).toBeTruthy();
    expect(normalizeMachineAddress("not an address").error).toBeTruthy();
  });
});

describe("the saved machine address", () => {
  const makeStorage = () => {
    const data = new Map();
    return {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(k, v),
    };
  };

  it("defaults to maslow.local", () => {
    expect(getMachineAddress(makeStorage())).toBe(DEFAULT_MACHINE_ADDRESS);
  });

  it("remembers a normalized address", () => {
    const storage = makeStorage();
    expect(saveMachineAddress("192.168.1.50", storage).address).toBe(
      "http://192.168.1.50/",
    );
    expect(storage.getItem(ADDRESS_STORAGE_KEY)).toBe("http://192.168.1.50/");
    expect(getMachineAddress(storage)).toBe("http://192.168.1.50/");
  });

  it("does not save a rejected address", () => {
    const storage = makeStorage();
    expect(
      saveMachineAddress("https://maslow.local", storage).error,
    ).toBeTruthy();
    expect(storage.getItem(ADDRESS_STORAGE_KEY)).toBeNull();
  });
});

describe("sendToMaslow", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("opens the UI, says hello until ready, sends the file and reports where it went", async () => {
    const ctx = makeEnv();
    const { result, stages } = start(ctx);

    expect(ctx.env.window.open).toHaveBeenCalledTimes(1);
    // Exactly two arguments: a features string with noopener would cut the link
    expect(ctx.env.window.open).toHaveBeenCalledWith(
      "http://maslow.local/",
      "maslow",
    );

    // The tab is still loading: hello is repeated every 500 ms
    expect(ctx.ofType("maslow:hello")).toHaveLength(1);
    vi.advanceTimersByTime(1500);
    expect(ctx.ofType("maslow:hello")).toHaveLength(4);
    expect(ctx.ofType("maslow:gcode")).toHaveLength(0);
    expect(stages).toEqual(["opening", "waiting"]);

    ctx.reply({ type: "maslow:ready", version: 1 });
    expect(stages).toEqual(["opening", "waiting", "sending"]);
    const [file] = ctx.ofType("maslow:gcode");
    expect(file.message).toMatchObject({
      name: "chair.gcode",
      gcode: "G0 X0\n",
    });
    expect(file.message.id).toBeTruthy();

    // No more hellos, and a second ready does not send the file twice
    vi.advanceTimersByTime(2000);
    ctx.reply({ type: "maslow:ready", version: 1 });
    expect(ctx.ofType("maslow:hello")).toHaveLength(4);
    expect(ctx.ofType("maslow:gcode")).toHaveLength(1);

    // Every message goes only to the machine's origin
    expect(ctx.machine.posted.every((p) => p.targetOrigin === ORIGIN)).toBe(
      true,
    );

    ctx.reply({
      type: "maslow:result",
      version: 1,
      id: file.message.id,
      ok: true,
      name: "chair.gcode",
      path: "/chair.gcode",
    });
    await expect(result).resolves.toEqual({
      ok: true,
      name: "chair.gcode",
      path: "/chair.gcode",
    });

    // Cleaned up: no listener, no timers
    expect(ctx.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the origin of a custom address", () => {
    const ctx = makeEnv();
    start(ctx, { address: "192.168.1.50" });
    expect(ctx.env.window.open).toHaveBeenCalledWith(
      "http://192.168.1.50/",
      "maslow",
    );
    expect(ctx.machine.posted[0].targetOrigin).toBe("http://192.168.1.50");
  });

  it("passes on the reason and detail of an error result", async () => {
    const ctx = makeEnv();
    const { result } = start(ctx);
    ctx.reply({ type: "maslow:ready", version: 1 });
    const { id } = ctx.ofType("maslow:gcode")[0].message;
    ctx.reply({
      type: "maslow:result",
      version: 1,
      id,
      ok: false,
      reason: "busy",
      detail: "The machine is running",
    });
    await expect(result).resolves.toEqual({
      ok: false,
      reason: "busy",
      detail: "The machine is running",
    });
  });

  it("ignores a result with someone else's id", async () => {
    const ctx = makeEnv();
    const { result } = start(ctx);
    ctx.reply({ type: "maslow:ready", version: 1 });
    const { id } = ctx.ofType("maslow:gcode")[0].message;
    ctx.reply({
      type: "maslow:result",
      id: "other",
      ok: false,
      reason: "failed",
    });
    ctx.reply({
      type: "maslow:result",
      id,
      ok: true,
      name: "a.nc",
      path: "/a.nc",
    });
    await expect(result).resolves.toMatchObject({ ok: true, name: "a.nc" });
  });

  it("gives up after 30 s without an answer and says what to check", async () => {
    const ctx = makeEnv();
    const { result } = start(ctx);
    vi.advanceTimersByTime(29000);
    expect(ctx.listeners.size).toBe(1);
    vi.advanceTimersByTime(1000);
    const outcome = await result;
    expect(outcome).toMatchObject({ ok: false, reason: "timeout" });
    expect(outcome.detail).toMatch(
      /could not be reached at http:\/\/maslow\.local\//,
    );
    expect(outcome.detail).toMatch(/address/);
    expect(outcome.detail).toMatch(/same network/);
    expect(ctx.ofType("maslow:gcode")).toHaveLength(0);
    expect(ctx.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not apply the 30 s limit to the upload itself", async () => {
    const ctx = makeEnv();
    const { result } = start(ctx);
    ctx.reply({ type: "maslow:ready", version: 1 });
    const { id } = ctx.ofType("maslow:gcode")[0].message;
    vi.advanceTimersByTime(60000);
    ctx.reply({
      type: "maslow:result",
      id,
      ok: true,
      name: "a.nc",
      path: "/a.nc",
    });
    await expect(result).resolves.toMatchObject({ ok: true });
  });

  it("stops when the Maslow tab is closed before it is ready", async () => {
    const ctx = makeEnv();
    const { result } = start(ctx);
    vi.advanceTimersByTime(1000);
    ctx.machine.closed = true;
    vi.advanceTimersByTime(500);
    await expect(result).resolves.toMatchObject({
      ok: false,
      reason: "closed",
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops when the Maslow tab is closed during the upload", async () => {
    const ctx = makeEnv();
    const { result } = start(ctx);
    ctx.reply({ type: "maslow:ready", version: 1 });
    ctx.machine.closed = true;
    vi.advanceTimersByTime(500);
    const outcome = await result;
    expect(outcome).toMatchObject({ ok: false, reason: "closed" });
    expect(outcome.detail).toMatch(/file list/);
  });

  it("ignores replies from the wrong origin", async () => {
    const ctx = makeEnv();
    const { result } = start(ctx);
    ctx.reply(
      { type: "maslow:ready", version: 1 },
      { origin: "http://evil.example" },
    );
    expect(ctx.ofType("maslow:gcode")).toHaveLength(0);

    ctx.reply({ type: "maslow:ready", version: 1 });
    const { id } = ctx.ofType("maslow:gcode")[0].message;
    ctx.reply(
      { type: "maslow:result", id, ok: true, name: "x", path: "/x" },
      { origin: "http://evil.example" },
    );
    ctx.reply({
      type: "maslow:result",
      id,
      ok: false,
      reason: "busy",
      detail: "Busy",
    });
    await expect(result).resolves.toMatchObject({ ok: false, reason: "busy" });
  });

  it("ignores replies from the wrong window", async () => {
    const ctx = makeEnv();
    const { result } = start(ctx);
    const other = { postMessage: vi.fn() };
    ctx.reply({ type: "maslow:ready", version: 1 }, { source: other });
    expect(ctx.ofType("maslow:gcode")).toHaveLength(0);

    ctx.reply({ type: "maslow:ready", version: 1 });
    const { id } = ctx.ofType("maslow:gcode")[0].message;
    ctx.reply(
      { type: "maslow:result", id, ok: true, name: "x", path: "/x" },
      { source: other },
    );
    ctx.reply({
      type: "maslow:result",
      id,
      ok: false,
      reason: "busy",
      detail: "Busy",
    });
    await expect(result).resolves.toMatchObject({ ok: false, reason: "busy" });
  });

  it("ignores messages that are not objects", () => {
    const ctx = makeEnv();
    start(ctx);
    ctx.reply(null);
    ctx.reply("maslow:ready");
    expect(ctx.ofType("maslow:gcode")).toHaveLength(0);
  });

  it("tells the user to allow popups when the tab is blocked", async () => {
    const ctx = makeEnv({ blocked: true });
    const { result } = start(ctx);
    const outcome = await result;
    expect(outcome).toMatchObject({ ok: false, reason: "popup-blocked" });
    expect(outcome.detail).toMatch(/[Aa]llow popups/);
    expect(ctx.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refuses an https address without opening anything", async () => {
    const ctx = makeEnv();
    const { result } = start(ctx, { address: "https://maslow.local/" });
    await expect(result).resolves.toMatchObject({
      ok: false,
      reason: "bad-address",
    });
    expect(ctx.env.window.open).not.toHaveBeenCalled();
  });

  it("can be cancelled", async () => {
    const ctx = makeEnv();
    const { result, cancel } = start(ctx);
    cancel();
    await expect(result).resolves.toMatchObject({
      ok: false,
      reason: "cancelled",
    });
    expect(ctx.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps going when postMessage throws", () => {
    const ctx = makeEnv();
    ctx.machine.postMessage.mockImplementation(() => {
      throw new Error("gone");
    });
    expect(() => start(ctx)).not.toThrow();
  });
});
