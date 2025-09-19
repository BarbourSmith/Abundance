const Status = Object.freeze({
  DISABLED: "disabled",
  WAITING: "waiting",
  PROCESSING: "processing",
  ERROR: "error",
  UPSTREAM_ERROR: "upstream_error",
  READY: "ready",
});

/**
 * An observable component of the project DAG.
 */
class ObservableEntity {
  constructor() {
    this.status = Status.DISABLED;
    this.value = null;
    this.subscribers = {};
  }

  setStatus(status, value = null) {
    if (status == Status.READY && value === null) {
      throw new Error("Ready status must have a value");
    } else if (
      status !== Status.READY &&
      status !== Status.DISABLED &&
      value !== null
    ) {
      throw new Error(
        "Only READY or DISABLED status can have a value. Was: " + status
      );
    }
    if (this.status != status || this.value !== value) {
      if (this.status == Status.READY && status == Status.READY) {
        // Special case for transitioning from READY to READY with a different value.
        // Force all downstream subscribers into a WAITING status in between. For downstream
        // components with multiple paths from this component, we need to ensure they wait
        // for all long paths to be READY before they attempt to reprocess.
        this.status = Status.PROCESSING;
        this.value = null;
        this.propagateChange();
      }
      console.debug(
        `Status change for ${this.name} (${this.uniqueID}): ${this.status} -> ${status}`
      );
      this.status = status;
      this.value = value;
      this.propagateChange();
    }
  }

  setDisabled() {
    // Preserve value when making disabled.
    this.setStatus(Status.DISABLED, this.value);
  }

  setWaiting() {
    this.setStatus(Status.WAITING);
  }

  setProcessing() {
    this.setStatus(Status.PROCESSING);
  }

  setError() {
    this.setStatus(Status.ERROR);
  }

  setUpstreamError() {
    this.setStatus(Status.UPSTREAM_ERROR);
  }

  setReady(value) {
    this.setStatus(Status.READY, value);
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
  subscribe(subscriber, id, immediateCallback = true) {
    if (typeof subscriber === "function") {
      if (id in this.subscribers) {
        console.trace(`Subscriber with id ${id} already exists. replacing.`);
      }
      this.subscribers[id] = subscriber;
      if (immediateCallback) {
        subscriber(); // Call the callback immediately to notify the subscriber of the current state
      }
    } else {
      throw new Error("Observer must be a function");
    }
  }

  /**
   * Remove all subscribers from this entity.
   */
  unsubscribeAll() {
    this.subscribers = {};
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

  /**
   * @returns current status and value of this entity
   */
  getState() {
    return {
      status: this.status,
      value: this.value,
    };
  }

  propagateChange() {
    // Notify all subscribers of this atom that it has changed
    Object.entries(this.subscribers).forEach(([id, subscriber]) => {
      try {
        subscriber();
      } catch (error) {
        console.error(`Error notifying subscriber ${id}:`, error);
      }
    });
  }
}

export { ObservableEntity, Status };
