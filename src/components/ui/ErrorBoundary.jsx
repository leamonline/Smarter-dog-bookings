import { Component } from "react";

/**
 * ErrorBoundary — wraps lazy-loaded views and modals.
 * Shows a friendly crash UI with a reset button instead of a blank screen.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Unhandled error:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="text-4xl mb-4">🐾</div>
          <div className="text-slate-800 font-extrabold text-lg mb-1">
            Something went wrong
          </div>
          <div className="text-slate-500 text-sm mb-5 max-w-xs">
            {this.state.error?.message
              ? `Error: ${this.state.error.message}`
              : "An unexpected error occurred loading this section."}
          </div>
          <button
            onClick={this.handleReset}
            className="py-2.5 px-5 rounded-lg bg-brand-teal text-white font-bold text-sm border-none cursor-pointer"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
