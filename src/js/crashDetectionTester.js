/**
 * Test script for Worker Crash Detection
 * This script can be pasted into the browser console to test crash detection mechanisms
 */

// Test utilities
const CrashDetectionTester = {
  
  /**
   * Test worker error detection by simulating worker error
   */
  testWorkerError() {
    console.log('Testing worker error detection...');
    
    if (window.crashDetection) {
      // Simulate a worker error
      const errorEvent = new ErrorEvent('error', {
        message: 'Test worker error',
        filename: 'worker.js',
        lineno: 1,
        colno: 1
      });
      
      window.crashDetection.handleWorkerError(errorEvent);
    } else {
      console.warn('Crash detection not available - ensure you are on a CreateMode page');
    }
  },

  /**
   * Test unhandled rejection detection by simulating worker promise rejection
   */
  testUnhandledRejection() {
    console.log('Testing unhandled rejection detection...');
    
    if (window.crashDetection) {
      // Simulate an unhandled rejection from worker
      const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
        promise: Promise.reject(new Error('Test worker promise rejection')),
        reason: new Error('Test worker promise rejection from worker.js')
      });
      
      window.crashDetection.handleUnhandledRejection(rejectionEvent);
    } else {
      console.warn('Crash detection not available - ensure you are on a CreateMode page');
    }
  },

  /**
   * Test heartbeat timeout by disabling worker responses
   */
  testHeartbeatTimeout() {
    console.log('Testing heartbeat timeout...');
    
    if (window.crashDetection) {
      // Force a heartbeat timeout
      window.crashDetection.sendHeartbeat = async function() {
        console.log('Simulating heartbeat timeout...');
        this.heartbeatTimeout = setTimeout(() => {
          console.error('Worker heartbeat timeout');
          this.initiateRecovery('Simulated heartbeat timeout');
        }, 1000); // Short timeout for testing
      };
      
      window.crashDetection.sendHeartbeat();
    } else {
      console.warn('Crash detection not available - ensure you are on a CreateMode page');
    }
  },

  /**
   * Test operation timeout detection
   */
  testOperationTimeout() {
    console.log('Testing operation timeout...');
    
    if (window.crashDetection) {
      // Add a short timeout for testing
      window.crashDetection.addOperationTimeout('test_operation', 2000);
      console.log('Operation timeout added - should trigger in 2 seconds');
    } else {
      console.warn('Crash detection not available - ensure you are on a CreateMode page');
    }
  },

  /**
   * Test emergency save without triggering reload
   */
  testEmergencySave() {
    console.log('Testing emergency save...');
    
    if (window.crashDetection) {
      // Override reload callback for testing
      const originalReloadCallback = window.crashDetection.reloadCallback;
      window.crashDetection.reloadCallback = () => {
        console.log('Emergency save completed - reload would happen here');
        // Restore original callback
        window.crashDetection.reloadCallback = originalReloadCallback;
      };
      
      // Trigger recovery
      window.crashDetection.initiateRecovery('Test emergency save');
    } else {
      console.warn('Crash detection not available - ensure you are on a CreateMode page');
    }
  },

  /**
   * Add crash detection reference to window for testing
   */
  setupTestAccess() {
    // This would be called from App.jsx in development mode
    const script = document.createElement('script');
    script.textContent = `
      // Make crash detection available for testing
      if (typeof window !== 'undefined') {
        window.CrashDetectionTester = ${CrashDetectionTester.toString()};
        console.log('Crash detection tester available. Use window.CrashDetectionTester methods for testing.');
      }
    `;
    document.head.appendChild(script);
  }
};

// Instructions for manual testing
console.log(`
Worker Crash Detection Test Instructions:
1. Navigate to a project in CreateMode (e.g., /:owner/:repoName route)
2. Open browser console
3. Run the following commands to test different scenarios:

   // Test worker error detection
   CrashDetectionTester.testWorkerError()
   
   // Test unhandled rejection detection  
   CrashDetectionTester.testUnhandledRejection()
   
   // Test heartbeat timeout
   CrashDetectionTester.testHeartbeatTimeout()
   
   // Test operation timeout
   CrashDetectionTester.testOperationTimeout()
   
   // Test emergency save (without reload)
   CrashDetectionTester.testEmergencySave()

4. Monitor console for crash detection logs and recovery behavior
5. Verify that emergency save notification appears
6. For full testing, allow one test to complete the reload process

Note: Some tests will trigger the actual crash recovery process including
auto-save and page reload. Test in a safe environment.
`);

export default CrashDetectionTester;