import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorBanner } from "./ErrorBanner.tsx";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
          <ErrorBanner message={this.state.error?.message || "An unexpected error occurred"} />
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 12, padding: "10px 20px", borderRadius: 8,
              border: "none", background: "#2563EB", color: "#fff",
              fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
