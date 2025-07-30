const Status = Object.freeze({
  STALE: "stale",
  PROCESSING: "processing",
  ERROR: "error",
  READY: "ready",
});

/**
 * An observable component of the project DAG.
 */
export default class ObservableEntity {
  constructor() {
    this.status = Status.STALE;
    this.subscribers = [];
  }

  setStatus(status) {
    if (this.status != status) {
      this.status = status;
      this.propagateChange();
    }
  }

  setStale() {
    this.setStatus(Status.STALE);
  }

  setProcessing() {
    this.setStatus(Status.PROCESSING);
  }

  setError() {
    this.setStatus(Status.ERROR);
  }

  setReady() {
    this.setStatus(Status.READY);
  }

  /**
   * Subscribe to changes in this atom with the given callback function.
   *
   * Whenever this atom's state changes (e.g. from stale to processing, or processing to ready),
   * the callback function will be called with no arguments. In general, this callback should
   * return quickly, though of course it may dispatch an async operation if it needs to do heavier
   * computation.
   *
   * This function returns a callable function which can be used to unsubscribe. Calling the
   * unsubscribe function will ensure that onChange receives no further updates.
   *
   * @param {function} onChange callback
   * @returns {function} unsubscribe function
   * @throws {Error} if onChange is not a function
   */
  subscribe(onChange) {
    if (typeof onChange === "function") {
      this.subscribers.push(onChange);
      return () => {
        this.subscribers = this.subscribers.filter((obs) => obs !== onChange);
      };
    } else {
      throw new Error("Observer must be a function");
    }
  }

  propagateChange() {
    // Notify all subscribers of this atom that it has changed
    this.subscribers.forEach((subscriber) => {
      subscriber();
    });
  }
}
