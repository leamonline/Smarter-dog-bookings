import { Component } from "react";
import { logger } from "../../lib/logger";
import {
  handleStaleChunkError,
  isChunkReloadPending,
  isStaleChunkError,
} from "../../lib/chunkReload.js";

function makeErrorId() {
  return `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * ErrorBoundary — wraps lazy-loaded views and modals.
 * Shows a friendly crash UI with a reset button instead of a blank screen.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorId: null };
  }

  static getDerivedStateFromError(_error) {
    return { hasError: true, errorId: makeErrorId() };
  }

  componentDidCatch(error, info) {
    // A stale-chunk reload already in flight keeps rendering for a moment and
    // throws the lazy() mapping's "undefined is not an object" into this
    // boundary. That is not a second error, so do not report it.
    if (isChunkReloadPending()) return;
    // A lazy() import that rejected inside React never reaches the window
    // error listeners, so the stale-chunk auto-reload has to be offered here.
    // If the loop guard refuses, fall through and show the recovery UI.
    if (isStaleChunkError(error) && handleStaleChunkError("error-boundary", error)) {
      return;
    }
    logger.error("[ErrorBoundary] Unhandled error:", error, {
      tags: { errorId: this.state.errorId },
      extra: { componentStack: info?.componentStack },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, errorId: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="text-4xl mb-4">🐾</div>
          <div className="text-slate-800 font-extrabold text-lg mb-1">
            That didn't quite work
          </div>
          <div className="text-slate-500 text-sm mb-2 max-w-xs">
            We couldn&apos;t load this part of the dashboard. Try again, or reload the page if the problem continues.
          </div>
          {this.state.errorId ? (
            <div className="text-slate-500 text-[11px] font-mono mb-4">
              Reference: {this.state.errorId}
            </div>
          ) : null}
          <div className="flex gap-2">
            <button
              onClick={this.handleReset}
              className="py-2.5 px-5 rounded-lg bg-brand-teal text-white font-bold text-sm border-none cursor-pointer"
            >
              Give it another go
            </button>
            <button
              onClick={() => window.location.reload()}
              className="py-2.5 px-5 rounded-lg bg-white text-slate-700 font-bold text-sm border border-slate-200 cursor-pointer"
            >
              Reload the page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
