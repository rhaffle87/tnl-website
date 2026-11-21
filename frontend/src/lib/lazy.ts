import { lazy as reactLazy, type ComponentType } from "react";

const RELOAD_KEY = "tnl-chunk-reload-at";
const RELOAD_WINDOW_MS = 15_000;

/**
 * After a redeploy the hashed chunk names change, so a tab that is still open requests files
 * that no longer exist and the lazy import rejects. Reload once to pick up the new index.html;
 * if it fails again within the window, rethrow so the error boundary shows the fallback instead
 * of looping forever.
 */
async function retryImport<T>(factory: () => Promise<T>): Promise<T> {
  try {
    return await factory();
  } catch (error) {
    try {
      const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
      if (Date.now() - last > RELOAD_WINDOW_MS) {
        window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
        return await new Promise<T>(() => {}); // page is reloading; never resolve
      }
    } catch {
      // sessionStorage unavailable (private mode etc.) — fall through to the boundary
    }
    throw error;
  }
}

/** Drop-in replacement for React.lazy that survives stale chunks after a deploy. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return reactLazy(() => retryImport(factory));
}
