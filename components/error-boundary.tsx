"use client";

import React, { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
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

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="my-4 rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-200">
          <div className="flex items-center justify-between">
            <span className="font-medium">Something went wrong in this component.</span>
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded bg-red-900/40 px-2.5 py-1 text-xs text-red-200 hover:bg-red-800/50"
            >
              Try Again
            </button>
          </div>
          {this.state.error ? (
            <p className="mt-2 font-mono text-xs text-red-300/80">{this.state.error.message}</p>
          ) : null}
        </div>
      );
    }
    return this.props.children;
  }
}
