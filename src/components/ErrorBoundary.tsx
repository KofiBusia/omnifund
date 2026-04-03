import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    (this as any).state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    const { hasError, error } = (this as any).state;
    const { children } = (this as any).props;

    if (hasError) {
      let errorMessage = "An unexpected error occurred.";
      if (error) {
        try {
          // Check if it's our JSON error from Firestore
          const parsed = JSON.parse(error.message);
          if (parsed.error && parsed.operationType) {
            errorMessage = `Security Error: You do not have permission to ${parsed.operationType} data at ${parsed.path}. Please ensure you are logged in as an administrator.`;
          }
        } catch (e) {
          errorMessage = error.message || errorMessage;
        }
      }

      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl">
            <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 mx-auto mb-6">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">Something went wrong</h2>
            <p className="text-slate-400 mb-8 text-sm leading-relaxed">
              {errorMessage}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 px-6 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <RefreshCcw className="w-5 h-5" />
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}
