import { useEffect, useState, useRef } from "react";

/**
 * Hook to detect a secret key sequence (Ctrl+2 three times in quick succession)
 * Returns a handler that should be attached to an element's onKeyDown event
 * @param {Function} onSequenceDetected - Callback when the sequence is detected
 * @param {number} timeLimit - Time window in milliseconds for the sequence (default 2000ms)
 */
export const useDevModeSequence = (onSequenceDetected, timeLimit = 2000) => {
  const keyPressesRef = useRef([]);

  const handleKeyDown = (event) => {
    // Check for Ctrl+2 (or Cmd+2 on Mac)
    if ((event.ctrlKey || event.metaKey) && event.key === "2") {
      event.preventDefault();

      const now = Date.now();
      keyPressesRef.current.push(now);

      // Remove any key presses outside the time limit
      keyPressesRef.current = keyPressesRef.current.filter(
        (time) => now - time < timeLimit,
      );

      // Check if we have 3 presses within the time limit
      if (keyPressesRef.current.length === 3) {
        onSequenceDetected?.();
        keyPressesRef.current = [];
      }
    }
  };

  return handleKeyDown;
};
