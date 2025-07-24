import { useState, useEffect, useCallback } from "react";

/**
 * Custom hook that provides throttled window resize events
 * to prevent excessive re-renders during window resizing
 */
function useThrottledResize(throttleDelay = 100) {
  const [windowSize, setWindowSize] = useState({
    width: undefined,
    height: undefined,
  });

  const [throttledSize, setThrottledSize] = useState({
    width: undefined,
    height: undefined,
  });

  // Immediate resize handler for smooth UI updates
  const handleResize = useCallback(() => {
    setWindowSize({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }, []);

  // Throttled resize for expensive operations
  useEffect(() => {
    const handler = setTimeout(() => {
      setThrottledSize(windowSize);
    }, throttleDelay);

    return () => {
      clearTimeout(handler);
    };
  }, [windowSize, throttleDelay]);

  useEffect(() => {
    window.addEventListener("resize", handleResize);
    // Call handler right away so state gets updated with initial window size
    handleResize();
    
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  return { windowSize, throttledSize };
}

export default useThrottledResize;