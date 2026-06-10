import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Evita la pantalla blanca: ante un error de render muestra una vista de recuperación. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Solo log local: no se envía a ningún servicio externo.
    console.error("Error de render:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center bg-bg px-4">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-agro-100 text-agro-700 dark:bg-agro-500/15 dark:text-agro-400">
            <RefreshCw className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-ink">Algo no salió como esperábamos</h1>
          <p className="mt-1 text-sm text-ink2">
            Ocurrió un error en la pantalla. Recargá la página para continuar; tus datos están a salvo.
          </p>
          <button
            onClick={() => location.reload()}
            className="mt-4 rounded-lg bg-agro-600 px-4 py-2 text-sm font-medium text-white hover:bg-agro-700"
          >
            Recargar
          </button>
        </div>
      </div>
    );
  }
}
