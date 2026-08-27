import { useRef, useCallback, useEffect } from "react";

const TABS = ["overview", "tickets", "analytics", "notes"];
const SWIPE_THRESHOLD = 50;

export function useSwipeNavigation(activeTab: string, onTabChange: (tab: string) => void) {
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swiping = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swiping.current = true;
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!swiping.current) return;
    swiping.current = false;

    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;

    // Only horizontal swipes (not vertical scrolling)
    if (Math.abs(deltaX) < SWIPE_THRESHOLD || Math.abs(deltaY) > Math.abs(deltaX)) return;

    const currentIndex = TABS.indexOf(activeTab);
    if (currentIndex === -1) return;

    if (deltaX < 0 && currentIndex < TABS.length - 1) {
      // Swipe left → next tab
      onTabChange(TABS[currentIndex + 1]);
    } else if (deltaX > 0 && currentIndex > 0) {
      // Swipe right → previous tab
      onTabChange(TABS[currentIndex - 1]);
    }
  }, [activeTab, onTabChange]);

  useEffect(() => {
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchEnd]);
}
