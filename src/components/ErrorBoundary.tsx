import React from "react";
import { AlertTriangle } from "lucide-react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-red-600" />
            <h2 className="mb-2 text-xl font-bold text-gray-900">Something went wrong</h2>
            <p className="mb-4 text-gray-500">{this.state.error?.message}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded-lg bg-gold-500 px-6 py-3 font-semibold text-white hover:bg-gold-600"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="ml-3 rounded-lg border border-navy-700 px-6 py-3 font-semibold text-gray-600 hover:bg-navy-800/30"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
