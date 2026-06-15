import React from 'react';
import { logError } from '../lib/errorLogger';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logError(error, 'react');
    console.error('ErrorBoundary caught:', error, info);
  }

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      const { error, showDetails } = this.state;
      return (
        <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-surface-200 max-w-lg w-full p-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-rose-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-surface-900">Something went wrong</h2>
            <p className="text-sm text-surface-500">{error?.message || 'An unexpected error occurred.'}</p>

            {/* Stack trace toggle */}
            {error?.stack && (
              <>
                <button
                  onClick={this.toggleDetails}
                  className="text-xs text-brand-600 hover:text-brand-700 underline cursor-pointer"
                >
                  {showDetails ? 'Hide details' : 'Show details'}
                </button>
                {showDetails && (
                  <pre className="bg-surface-100 p-3 rounded-lg text-left text-[10px] leading-relaxed text-surface-600 max-h-48 overflow-auto whitespace-pre-wrap break-all">
                    {error.stack}
                  </pre>
                )}
              </>
            )}

            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-surface-900 text-white rounded-xl font-semibold hover:bg-surface-800 transition-colors text-sm cursor-pointer"
            >
              Reload Application
            </button>

            <p className="text-[10px] text-surface-400">
              All errors are logged. Open DevTools console and type <code className="bg-surface-100 px-1 rounded text-[9px]">window.__hotelErrors</code> to inspect.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
