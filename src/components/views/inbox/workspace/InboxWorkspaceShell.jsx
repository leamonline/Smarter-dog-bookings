import { useCallback, useEffect } from "react";
import { FocusScope } from "react-aria";

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
  const dismissContext = useCallback(() => {
    onDismissContext?.();
    returnFocusRef?.current?.focus();
  }, [onDismissContext, returnFocusRef]);

  useEffect(() => {
    if (!contextOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      dismissContext();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [contextOpen, dismissContext]);

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
      style={fillHeight != null ? { "--inbox-visible-height": `${fillHeight}px` } : undefined}
      className={`h-[var(--inbox-visible-height,calc(100dvh-var(--inbox-shell-top)-var(--inbox-bottom-gap)))] ${minimumHeightClass} overflow-hidden bg-white`}
    >
      <div className="relative grid h-full min-h-0 grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)] min-[1440px]:grid-cols-[300px_minmax(560px,1fr)_360px]">
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
          className={`${threadVisibility} min-h-0 flex-col overflow-y-auto overscroll-contain bg-white md:flex`}
        >
          <div className="sticky top-0 z-10 flex min-h-11 shrink-0 items-center border-b border-slate-200 bg-white px-2 md:hidden">
            <button type="button" className={MOBILE_BACK_CLASS} onClick={onPaneBack}>
              Back to conversations
            </button>
          </div>
          {threadPane}
        </section>

        {contextOpen && (
          <button
            type="button"
            aria-label="Dismiss booking and customer context"
            className="absolute inset-0 z-20 hidden bg-slate-950/25 transition-opacity duration-200 md:block min-[1440px]:hidden motion-reduce:transition-none motion-reduce:duration-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-purple"
            onClick={dismissContext}
          />
        )}

        <section
          role="region"
          aria-label="Booking and customer context"
          className={`${contextMobileVisibility} ${contextTabletVisibility} absolute inset-y-0 right-0 z-30 flex w-full min-h-0 flex-col overflow-y-auto overscroll-contain bg-white shadow-xl transition-transform duration-200 md:w-[min(520px,100%)] md:border-l md:border-slate-200 lg:w-[380px] min-[1440px]:static min-[1440px]:z-auto min-[1440px]:visible min-[1440px]:w-auto min-[1440px]:translate-x-0 min-[1440px]:pointer-events-auto min-[1440px]:shadow-none motion-reduce:transition-none motion-reduce:duration-0`}
        >
          <FocusScope contain={contextOpen}>
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
