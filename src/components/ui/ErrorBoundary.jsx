import { Component } from "react";
import { captureException } from "../../lib/sentry.js";

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
    this.state = { hasError: false, error: null, errorId: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error, errorId: makeErrorId() };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Unhandled error:", error, info);
    captureException(error, {
      tags: { errorId: this.state.errorId },
      extra: { componentStack: info?.componentStack },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorId: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="text-4xl mb-4">🐾</div>
          <div className="text-slate-800 font-extrabold text-lg mb-1">
            Something went wrong
          </div>
          <div className="text-slate-500 text-sm mb-2 max-w-xs">
            {this.state.error?.message
              ? `Error: ${this.state.error.message}`
              : "An unexpected error occurred loading this section."}
          </div>
          {this.state.errorId ? (
            <div className="text-slate-400 text-[11px] font-mono mb-4">
              Reference: {this.state.errorId}
            </div>
          ) : null}
          <div className="flex gap-2">
            <button
              onClick={this.handleReset}
              className="py-2.5 px-5 rounded-lg bg-brand-teal text-white font-bold text-sm border-none cursor-pointer"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="py-2.5 px-5 rounded-lg bg-white text-slate-700 font-bold text-sm border border-slate-200 cursor-pointer"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
