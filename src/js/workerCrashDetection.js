/**
 * Worker Crash Detection and Recovery Service
 * Provides mechanisms to detect worker crashes and initiate recovery
 */

class WorkerCrashDetection {
  constructor(worker, saveCallback, reloadCallback) {
    this.worker = worker;
    this.saveCallback = saveCallback;
    this.reloadCallback = reloadCallback;
    this.heartbeatInterval = null;
    this.heartbeatTimeout = null;
    this.isRecovering = false;
    this.lastHeartbeat = Date.now();
    this.operationTimeouts = new Map();
    
    this.init();
  }

  init() {
    // Listen for worker errors
    if (this.worker && this.worker.addEventListener) {
      this.worker.addEventListener('error', this.handleWorkerError.bind(this));
    }

    // Listen for unhandled promise rejections that might indicate worker issues
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection.bind(this));

    // Start heartbeat monitoring
    this.startHeartbeat();
  }

  /**
   * Handle direct worker errors
   */
  handleWorkerError(error) {
    console.error('Worker error detected:', error);
    this.initiateRecovery('Worker error: ' + error.message);
  }

  /**
   * Handle unhandled promise rejections that might be from worker operations
   */
  handleUnhandledRejection(event) {
    // Check if this rejection is related to worker operations
    if (event.reason && (
      event.reason.message?.includes('worker') ||
      event.reason.message?.includes('Worker') ||
      event.reason.stack?.includes('worker.js')
    )) {
      console.error('Worker-related unhandled rejection:', event.reason);
      this.initiateRecovery('Worker promise rejection: ' + event.reason.message);
    }
  }

  /**
   * Start heartbeat monitoring to detect unresponsive worker
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Send heartbeat to worker and expect response
   */
  async sendHeartbeat() {
    if (this.isRecovering) return;

    try {
      // Clear any existing timeout
      if (this.heartbeatTimeout) {
        clearTimeout(this.heartbeatTimeout);
        this.heartbeatTimeout = null;
      }

      this.heartbeatTimeout = setTimeout(() => {
        console.error('Worker heartbeat timeout');
        this.initiateRecovery('Worker heartbeat timeout');
      }, 10000); // 10 second timeout

      // Try a simple operation to test worker responsiveness
      if (this.worker && this.worker.createMesh) {
        await this.worker.createMesh(1);
        this.lastHeartbeat = Date.now();
        if (this.heartbeatTimeout) {
          clearTimeout(this.heartbeatTimeout);
          this.heartbeatTimeout = null;
        }
      }
    } catch (error) {
      console.error('Heartbeat failed:', error);
      if (this.heartbeatTimeout) {
        clearTimeout(this.heartbeatTimeout);
        this.heartbeatTimeout = null;
      }
      this.initiateRecovery('Heartbeat failed: ' + error.message);
    }
  }

  /**
   * Add timeout monitoring for specific operations
   */
  addOperationTimeout(operationId, timeoutMs = 120000) {
    const timeout = setTimeout(() => {
      console.error(`Operation ${operationId} timed out`);
      this.initiateRecovery(`Operation timeout: ${operationId}`);
    }, timeoutMs);
    
    this.operationTimeouts.set(operationId, timeout);
  }

  /**
   * Clear operation timeout when operation completes
   */
  clearOperationTimeout(operationId) {
    const timeout = this.operationTimeouts.get(operationId);
    if (timeout) {
      clearTimeout(timeout);
      this.operationTimeouts.delete(operationId);
    }
  }

  /**
   * Initiate crash recovery process
   */
  async initiateRecovery(reason) {
    if (this.isRecovering) {
      console.log('Recovery already in progress, ignoring additional crash detection');
      return;
    }

    this.isRecovering = true;
    console.warn('Initiating worker crash recovery:', reason);

    try {
      // Clear all intervals and timeouts
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      if (this.heartbeatTimeout) {
        clearTimeout(this.heartbeatTimeout);
        this.heartbeatTimeout = null;
      }
      
      // Clear all operation timeouts
      this.operationTimeouts.forEach(timeout => clearTimeout(timeout));
      this.operationTimeouts.clear();

      // Show user notification
      this.showRecoveryNotification();

      // Attempt to save the project if we have required data
      if (this.saveCallback) {
        // Check if we have the required global variables for saving
        const hasRequiredData = (
          typeof window !== 'undefined' &&
          window.GlobalVariables &&
          window.GlobalVariables.topLevelMolecule &&
          window.GlobalVariables.currentUser &&
          window.GlobalVariables.currentRepo
        );
        
        if (hasRequiredData) {
          console.log('Attempting to save project before recovery...');
          await this.saveCallback();
          console.log('Project saved successfully');
        } else {
          console.warn('Save skipped - required project data not available or user not authenticated');
        }
      } else {
        console.warn('Save skipped - no save callback available');
      }

      // Wait a moment for save to complete
      setTimeout(() => {
        console.log('Reloading page after crash recovery...');
        if (this.reloadCallback) {
          this.reloadCallback();
        } else {
          window.location.reload();
        }
      }, 2000);

    } catch (error) {
      console.error('Error during crash recovery:', error);
      // Force reload even if save failed
      setTimeout(() => {
        console.log('Forcing page reload after recovery error...');
        window.location.reload();
      }, 1000);
    }
  }

  /**
   * Show user notification about crash recovery
   */
  showRecoveryNotification() {
    // Create a simple notification
    const notification = document.createElement('div');
    notification.id = 'crash-recovery-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ff6b35;
      color: white;
      padding: 15px 20px;
      border-radius: 5px;
      z-index: 10000;
      font-family: Arial, sans-serif;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      max-width: 300px;
    `;
    notification.innerHTML = `
      <strong>System Recovery</strong><br>
      A system issue was detected. Saving your work and restarting...
    `;
    
    document.body.appendChild(notification);
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
    }
    this.operationTimeouts.forEach(timeout => clearTimeout(timeout));
    this.operationTimeouts.clear();
    
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection.bind(this));
  }
}

export default WorkerCrashDetection;