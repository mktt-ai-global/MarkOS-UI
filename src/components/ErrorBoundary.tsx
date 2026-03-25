import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen flex items-center justify-center p-6"
          style={{
            background: 'linear-gradient(135deg, var(--color-bg-start) 0%, var(--color-bg-mid) 50%, var(--color-bg-end) 100%)',
          }}
        >
          <div className="glass-strong rounded-2xl p-8 max-w-lg w-full text-center space-y-5 animate-fade-in">
            {/* Error icon */}
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center mx-auto shadow-lg">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            {/* Title */}
            <h1 className="text-xl font-semibold text-text-primary">
              Something went wrong
            </h1>

            {/* Description */}
            <p className="text-sm text-text-secondary leading-relaxed">
              The application encountered an unexpected error. You can try
              again or reload the page to start fresh.
            </p>

            {/* Error message detail */}
            {this.state.error?.message && (
              <div className="glass-subtle rounded-xl px-4 py-3 text-left">
                <p className="text-[11px] font-medium text-text-tertiary mb-1">Error details</p>
                <p className="text-xs text-danger break-words leading-relaxed">
                  {this.state.error.message}
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-center gap-3 pt-1">
              <button
                onClick={this.handleReset}
                className="px-5 py-2.5 rounded-xl text-sm font-medium glass-subtle text-text-primary hover:bg-glass-hover transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-accent hover:bg-accent-light transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
