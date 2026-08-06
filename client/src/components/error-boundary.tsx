import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * App-wide crash guard.
 *
 * Added Aug 5, 2026 after a single bad property read in the address autocomplete
 * (`pred.structured_formatting.main_text` on an object that no longer had that
 * field) threw during render. React's default behavior is to unmount the ENTIRE
 * tree when nothing catches the error — which is why the page went completely
 * white with no message. Now the worst case is this screen: the error is named,
 * the rest of the app is one click away, and no data is lost silently.
 *
 * Must be a class component — React has no hook equivalent for componentDidCatch.
 */

interface Props {
  children: ReactNode;
  /** Optional label so the message can name the area that failed. */
  area?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the full stack in the browser console for debugging.
    console.error("[ErrorBoundary] Caught a render error:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { area } = this.props;

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>

          <h2 className="mb-1.5 text-lg font-semibold">
            {area ? `Something went wrong in ${area}` : "Something went wrong"}
          </h2>

          <p className="mb-4 text-sm text-muted-foreground">
            This part of the app hit an error. Your saved data is fine — nothing
            was lost. Try again, or head back to the dashboard.
          </p>

          <pre className="mb-4 max-h-32 overflow-auto rounded border bg-muted/50 p-2 text-left text-xs text-muted-foreground">
            {error.message || String(error)}
          </pre>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={this.handleReset} data-testid="button-error-retry">
              <RotateCcw className="mr-2 h-4 w-4" />
              Try again
            </Button>
            <Button
              variant="outline"
              onClick={this.handleGoHome}
              data-testid="button-error-home"
            >
              <Home className="mr-2 h-4 w-4" />
              Go to dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
