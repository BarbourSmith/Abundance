const Status = Object.freeze({
  STALE: "stale",
  PROCESSING: "processing",
  ERROR: "error",
  READY: "ready",
});

/**
 * An observable component of the project DAG.
 */
class ObservableEntity {
  constructor() {
    this.status = Status.STALE;
    this.subscribers = {};
  }

  setStatus(status, force = false) {
    if (this.status != status || force) {
      console.debug(
        "changing status for " +
          this.constructor.name +
          " from " +
          this.status +
          " to " +
          status
      );
      this.status = status;
      this.propagateChange();
    }
  }

  setStale(force = false) {
    this.setStatus(Status.STALE, force);
  }

  setProcessing(force = false) {
    this.setStatus(Status.PROCESSING, force);
  }

  setError(force = false) {
    this.setStatus(Status.ERROR, force);
  }

  setReady(force = false) {
    this.setStatus(Status.READY, force);
  }

  /**
   * Subscribe to changes in this atom with the given callback function.
   *
   * Whenever this atom's state changes (e.g. from stale to processing, or processing to ready),
   * the callback function will be called with no arguments. In general, this callback should
   * return quickly, though of course it may dispatch an async operation if it needs to do heavier
   * computation.
   *
   * @param {function} onChange callback
   * @throws {Error} if onChange is not a function
   */
  subscribe(subscriber, id) {
    if (typeof subscriber === "function") {
      if (id in this.subscribers) {
        console.warn(`Subscriber with id ${id} already exists. no-op.`);
      } else {
        this.subscribers[id] = subscriber;
        subscriber(); // Call the callback immediately to notify the subscriber of the current state
      }
    } else {
      throw new Error("Observer must be a function");
    }
  }

  /**
   * Remove the subscriber with the given id.
   */
  unsubscribe(id) {
    if (this.subscribers[id]) {
      delete this.subscribers[id];
    } else {
      console.warn(
        `No subscriber found with id: ${id} in list: ${Object.keys(
          this.subscribers
        )}`
      );
    }
  }

  propagateChange() {
    // Notify all subscribers of this atom that it has changed
    Object.values(this.subscribers).forEach((subscriber) => {
      subscriber();
    });
  }
}

export { ObservableEntity, Status };
