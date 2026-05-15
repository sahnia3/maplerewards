"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "@/lib/error-reporter";

interface Props {
  /** Friendly label shown to the user in the fallback ("optimizer", "wallet"). */
  surface?: string;
  children: ReactNode;
  /** Optional custom fallback. If omitted, the default editorial fallback renders. */
  fallback?: ReactNode;
}

interface State {
  err: Error | null;
}

/**
 * ErrorBoundary — catches uncaught React render/effect errors, ships them to
 * Sentry via the package-level reporter, and renders a calm "retry" surface
 * instead of a white screen. The default fallback is intentionally NOT alarming:
 * users on the optimizer page should still feel they can recover.
 *
 * Why a class component: React's error boundaries are only available via
 * componentDidCatch + getDerivedStateFromError, neither of which has a hook
 * equivalent. The rest of the codebase is functional; this is the one
 * exception.
 *
 * Wrap as high in the tree as makes sense for the failure mode. For the
 * optimizer the right scope is the form itself — wrap optimizer-form.tsx so
 * an API hiccup doesn't kill the whole /optimizer page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    reportError(err, {
      componentStack: info.componentStack,
      surface: this.props.surface,
    });
  }

  reset = () => {
    this.setState({ err: null });
  };

  render() {
    if (this.state.err) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          role="alert"
          style={{
            padding: "32px 28px",
            border: "1px solid var(--rule-strong)",
            borderRadius: 14,
            background: "var(--card-fill)",
            textAlign: "center",
            margin: "20px 0",
          }}
        >
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 12 }}>
            Something went sideways
          </div>
          <h3 className="display" style={{ fontSize: 22, lineHeight: 1.3, marginBottom: 10 }}>
            We couldn&rsquo;t render this {this.props.surface ?? "section"}.
          </h3>
          <p className="serif" style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5, marginBottom: 18, fontStyle: "italic" }}>
            The error has been reported automatically. Reloading usually fixes
            transient hiccups; if this keeps happening, email{" "}
            <a href="mailto:hello@maplerewards.ca" style={{ color: "var(--accent)" }}>
              hello@maplerewards.ca
            </a>
            .
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="mono"
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
