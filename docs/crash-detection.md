# Worker Crash Detection and Recovery System

## Overview

The Worker Crash Detection and Recovery System automatically detects when the CAD worker becomes unresponsive or crashes, saves the current project state, and reloads the page to restore functionality.

## Features

### Detection Mechanisms

1. **Direct Worker Error Monitoring**
   - Listens for worker error events
   - Detects when the worker thread encounters fatal errors

2. **Unhandled Promise Rejection Detection**
   - Monitors for unhandled promise rejections from worker operations
   - Filters for worker-related rejections

3. **Heartbeat System**
   - Sends periodic health checks to the worker (every 30 seconds)
   - Detects unresponsive workers with 10-second timeout

4. **Operation Timeout Monitoring**
   - Tracks individual worker operations with timeout limits
   - Display operations: 2-minute timeout
   - Reset operations: 1-minute timeout

### Recovery Process

When a crash is detected:

1. **Emergency Save**
   - Automatically saves the current project state
   - Uses existing GitHub save functionality
   - Includes emergency save marker in commit message

2. **User Notification**
   - Shows visual notification about system recovery
   - Informs user that work is being saved

3. **Page Reload**
   - Reloads the page after successful save
   - Restores application to clean state

## Implementation Details

### Files Modified

- `src/App.jsx` - Integration point, worker initialization with crash detection
- `src/components/main-routes/CreateMode.jsx` - Save function registration
- `src/js/workerCrashDetection.js` - Core crash detection service

### Key Components

```javascript
// Initialize crash detection in App.jsx
const crashDetection = new WorkerCrashDetection(
  cadWorker,
  emergencySaveCallback,
  pageReloadCallback
);

// Register save function in CreateMode.jsx
useEffect(() => {
  if (setSaveProjectRef && authorizedUserOcto) {
    setSaveProjectRef(() => saveProject);
  }
}, [setSaveProjectRef, authorizedUserOcto]);
```

### Configuration

- **Heartbeat Interval**: 30 seconds
- **Heartbeat Timeout**: 10 seconds
- **Display Operation Timeout**: 2 minutes
- **Reset Operation Timeout**: 1 minute
- **Recovery Delay**: 2 seconds after save

## Testing

### Development Testing

In development mode, the crash detection instance is available at `window.crashDetection`:

```javascript
// Test worker error detection
window.crashDetection.initiateRecovery('Test crash');

// Test operation timeout
window.crashDetection.addOperationTimeout('test_op', 5000);
```

### Manual Testing Scenarios

1. **Network Interruption**: Disconnect network during heavy operation
2. **Memory Exhaustion**: Load extremely complex geometry
3. **Worker Thread Termination**: Force terminate worker in browser dev tools
4. **Infinite Loop**: Execute code that causes worker to hang

### Using the Test Utility

```javascript
// Import the tester (development only)
import CrashDetectionTester from './js/crashDetectionTester.js';

// Run specific tests
CrashDetectionTester.testWorkerError();
CrashDetectionTester.testHeartbeatTimeout();
CrashDetectionTester.testOperationTimeout();
```

## Safety Features

### Prevents Infinite Loops
- Recovery process can only run once at a time
- `isRecovering` flag prevents multiple simultaneous recoveries

### Graceful Degradation
- Works even if save function is unavailable
- Continues with reload if emergency save fails
- Validates required dependencies before attempting save

### Memory Management
- Properly cleans up intervals and timeouts
- Removes event listeners on component unmount
- Clears operation timeouts when operations complete

## Monitoring and Logging

The system provides comprehensive logging:

```
Worker crash detection initialized
Heartbeat successful
Operation timeout added: display_abc123_1640995200000
Emergency save progress: 50%
Project saved successfully
Reloading page after crash recovery...
```

## Requirements

- Authenticated user (for save functionality)
- Active project with GitHub repository
- CreateMode component (where saveProject is available)

## Limitations

- Emergency save requires GitHub authentication
- Only works in CreateMode (where projects can be saved)
- Page reload loses unsaved local state (by design)
- Cannot recover from browser crashes or page navigation

## Future Enhancements

- Configurable timeout values
- Recovery without page reload for minor issues
- Local backup before GitHub save
- Crash analytics and reporting
- Progressive recovery (attempt fixes before full restart)