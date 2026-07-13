export const CAD_WORKER_TIMEOUT_STORAGE_KEY = "cadWorkerInactivityTimeoutMs";
export const CAD_WORKER_TIMEOUT_DEFAULT_MS = 90_000;
export const CAD_WORKER_TIMEOUT_MIN_MS = 30_000;
export const CAD_WORKER_TIMEOUT_MAX_MS = 900_000;

export function clampCadWorkerTimeoutMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return CAD_WORKER_TIMEOUT_DEFAULT_MS;
  }

  return Math.min(
    CAD_WORKER_TIMEOUT_MAX_MS,
    Math.max(CAD_WORKER_TIMEOUT_MIN_MS, Math.round(parsed)),
  );
}

export function readCadWorkerTimeoutMs() {
  if (typeof window === "undefined" || !window.localStorage) {
    return CAD_WORKER_TIMEOUT_DEFAULT_MS;
  }

  const storedValue = window.localStorage.getItem(CAD_WORKER_TIMEOUT_STORAGE_KEY);
  if (storedValue === null) {
    return CAD_WORKER_TIMEOUT_DEFAULT_MS;
  }

  return clampCadWorkerTimeoutMs(Number.parseInt(storedValue, 10));
}

export function writeCadWorkerTimeoutMs(timeoutMs) {
  const normalizedTimeoutMs = clampCadWorkerTimeoutMs(timeoutMs);

  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(
      CAD_WORKER_TIMEOUT_STORAGE_KEY,
      String(normalizedTimeoutMs),
    );
  }

  return normalizedTimeoutMs;
}
