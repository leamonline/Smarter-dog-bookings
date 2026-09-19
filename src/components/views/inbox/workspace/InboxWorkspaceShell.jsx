import { useCallback, useEffect } from "react";
import { FocusScope } from "react-aria";
import { useRailDocked } from "./dockedRail";

const MOBILE_BACK_CLASS =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3 text-sm font-semibold text-brand-purple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2";

export function InboxWorkspaceShell({
  rootRef,
  fillHeight,
  mobilePane,
  contextOpen,
  contextSection,
  conversationPane,
  threadPane,
  contextPane,
  onPaneBack,
  onDismissContext,
  returnFocusRef,
}) {
  // Docked, the context is the grid's third column rather than something
  // covering the thread — so the overlay behaviours stand down with it and
  // come back the moment the window narrows again. Tracked reactively because
  // the window can cross the breakpoint while the context is open.
  const railDocked = useRailDocked();
  const contextIsOverlay = contextOpen && !railDocked;

  const dismissContext = useCallback(() => {
    onDismissContext?.();
    returnFocusRef?.current?.focus();
  }, [onDismissContext, returnFocusRef]);

  useEffect(() => {
    if (!contextIsOverlay) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      dismissContext();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [contextIsOverlay, dismissContext]);

  const conversationVisibility = mobilePane === "list" ? "flex" : "hidden";
  const threadVisibility = mobilePane === "thread" ? "flex" : "hidden";
  const contextMobileVisibility = mobilePane === "context"
    ? "visible translate-x-0 pointer-events-auto"
    : "invisible translate-x-full pointer-events-none";
  const contextTabletVisibility = contextOpen
    ? "md:visible md:translate-x-0 md:pointer-events-auto"
    : "md:invisible md:translate-x-full md:pointer-events-none";
  const contextTitle = contextSection === "booking" ? "Booking" : "Customer";
  const minimumHeightClass = fillHeight != null && fillHeight < 360
    ? "min-h-0"
    : "min-h-[360px]";

  return (
    <div
      ref={rootRef}
      style={fillHeight != null ? { "--fill-visible-height": `${fillHeight}px` } : undefined}
      className={`h-[var(--fill-visible-height,calc(100dvh-var(--fill-top)-var(--fill-bottom-gap)))] ${minimumHeightClass} overflow-hidden bg-white`}
    >
      <div className="relative grid h-full min-h-0 grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)] wide:grid-cols-[300px_minmax(560px,1fr)_360px]">
        <section
          role="region"
          aria-label="Conversations"
          className={`${conversationVisibility} min-h-0 flex-col overflow-y-auto overscroll-contain bg-white md:flex md:border-r md:border-slate-200`}
        >
          {conversationPane}
        </section>

        <section
          role="region"
          aria-label="Message thread"
          className={`${threadVisibility} min-h-0 min-w-0 flex-col overflow-hidden overscroll-contain bg-white md:flex`}
        >
          {threadPane}
        </section>

        {contextOpen && (
          <button
            type="button"
            aria-label="Dismiss booking and customer context"
            className="absolute inset-0 z-20 hidden bg-slate-950/25 transition-opacity duration-200 md:block wide:hidden motion-reduce:transition-none motion-reduce:duration-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-purple"
            onClick={dismissContext}
          />
        )}

        {/* The context pane keeps its own section headers pinned and scrolls
            only the open body, so this frame must not become a second scroller. */}
        <section
          role="region"
          aria-label="Booking and customer context"
          className={`${contextMobileVisibility} ${contextTabletVisibility} absolute inset-y-0 right-0 z-30 flex w-full min-h-0 flex-col overflow-hidden overscroll-contain bg-white shadow-xl transition-transform duration-200 md:w-[min(520px,100%)] md:border-l md:border-slate-200 lg:w-[380px] wide:static wide:z-auto wide:visible wide:w-auto wide:translate-x-0 wide:pointer-events-auto wide:shadow-none motion-reduce:transition-none motion-reduce:duration-0`}
        >
          <FocusScope contain={contextIsOverlay}>
            <div className="sticky top-0 z-10 flex min-h-11 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2 md:hidden">
              <button type="button" className={MOBILE_BACK_CLASS} onClick={onPaneBack}>
                Back to message thread
              </button>
              <span className="truncate text-sm font-semibold text-slate-700">{contextTitle}</span>
            </div>
            {contextPane}
          </FocusScope>
        </section>
      </div>
    </div>
  );
}
