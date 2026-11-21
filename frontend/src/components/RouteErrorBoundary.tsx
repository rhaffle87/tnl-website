import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  failed: boolean;
}

export default class RouteErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Route render failed:", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold">Halaman gagal dimuat / This page failed to load</h1>
        <p className="max-w-md text-sm text-neutral-600">
          Situs mungkin baru diperbarui atau koneksi terputus. Muat ulang untuk mencoba lagi.
          <br />
          The site may have just been updated or your connection dropped. Reload to try again.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-[#1E4D2B] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Muat ulang / Reload
        </button>
      </div>
    );
  }
}
