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

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6"
             style={{ background: 'linear-gradient(135deg, #f5f5f7 0%, #e8e8ed 50%, #f0f0f5 100%)' }}>
          <div className="glass-strong rounded-2xl p-8 max-w-md w-full text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center mx-auto">
              <span className="text-white text-xl font-bold">!</span>
            </div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Something went wrong
            </h1>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-6 py-2.5 rounded-xl text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
