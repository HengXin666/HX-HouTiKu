/**
 * Simple pull-to-refresh hook for mobile.
 */

import { useRef, useEffect, useCallback, useState } from "react";

interface UsePullRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
}

export function usePullRefresh({ onRefresh, threshold = 80 }: UsePullRefreshOptions) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pullDistance = useRef(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (startY.current === 0) return;
      const currentY = e.touches[0].clientY;
      pullDistance.current = currentY - startY.current;
      if (pullDistance.current > 0) {
        setPulling(true);
      }
    },
    []
  );

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance.current > threshold) {
      setRefreshing(true);
      await onRefresh();
      setRefreshing(false);
    }
    setPulling(false);
    startY.current = 0;
    pullDistance.current = 0;
  }, [onRefresh, threshold]);

  useEffect(() => {
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { pulling, refreshing };
}
