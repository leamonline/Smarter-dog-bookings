/**
 * useKeyboardShortcuts — global keyboard shortcuts for the staff dashboard.
 *
 * Shortcuts:
 *   N — open new booking modal
 *   T — jump to today
 *   ← — previous week
 *   → — next week
 *
 * All shortcuts are disabled when an input, textarea, or select is focused.
 */
import { useEffect } from "react";

interface UseKeyboardShortcutsParams {
  /** Currently active view (shortcuts only fire on "dashboard") */
  activeView: string;
  /** Navigate to previous week */
  goToPrevWeek: () => void;
  /** Navigate to next week */
  goToNextWeek: () => void;
  /** Jump to today — called with new Date() */
  jumpToToday: () => void;
  /** Open new booking modal for current date */
  openNewBooking: () => void;
}

export function useKeyboardShortcuts({
  activeView,
  goToPrevWeek,
  goToNextWeek,
  jumpToToday,
  openNewBooking,
}: UseKeyboardShortcutsParams) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip when typing in form fields
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Skip when inside a contentEditable element
      if ((e.target as HTMLElement).isContentEditable) return;

      // Only fire on dashboard view
      if (activeView !== "dashboard") return;

      // Skip if modifier keys are held (allow browser/OS shortcuts)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "n":
        case "N":
          e.preventDefault();
          openNewBooking();
          break;
        case "t":
        case "T":
          e.preventDefault();
          jumpToToday();
          break;
        case "ArrowLeft":
          e.preventDefault();
          goToPrevWeek();
          break;
        case "ArrowRight":
          e.preventDefault();
          goToNextWeek();
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeView, goToPrevWeek, goToNextWeek, jumpToToday, openNewBooking]);
}
