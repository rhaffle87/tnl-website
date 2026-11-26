import { useEffect, useRef } from "react";

const TABBABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function tabbablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)).filter(
    (el) =>
      !el.hasAttribute("hidden") &&
      el.getAttribute("aria-hidden") !== "true" &&
      !el.closest("[inert]"),
  );
}

/**
 * Shared modal focus trap. Works with links, inputs, buttons and any other
 * tabbable element (not just buttons), restores focus to the opener and routes
 * Escape to the caller.
 */
export function useFocusTrap(
  active: boolean,
  ref: React.RefObject<HTMLElement | null>,
  options?: {
    onEscape?: () => void;
    initialFocusRef?: React.RefObject<HTMLElement | null>;
  },
): void {
  const onEscapeRef = useRef(options?.onEscape);
  const initialFocusRef = useRef(options?.initialFocusRef);
  onEscapeRef.current = options?.onEscape;
  initialFocusRef.current = options?.initialFocusRef;

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const opener = document.activeElement as HTMLElement | null;
    const items = tabbablesIn(container);
    const initial = initialFocusRef.current?.current ?? items[0] ?? container;
    initial.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onEscapeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;

      const root = ref.current ?? container;
      const currentTabbables = tabbablesIn(root);
      const current = document.activeElement as HTMLElement | null;
      if (currentTabbables.length === 0) {
        event.preventDefault();
        root.focus({ preventScroll: true });
        return;
      }
      const first = currentTabbables[0];
      const last = currentTabbables[currentTabbables.length - 1];
      const index = current ? currentTabbables.indexOf(current) : -1;
      event.preventDefault();
      if (event.shiftKey) {
        (index <= 0 ? last : currentTabbables[index - 1]).focus({ preventScroll: true });
      } else {
        (index < 0 || index === currentTabbables.length - 1
          ? first
          : currentTabbables[index + 1]
        ).focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      if (opener && opener.isConnected && typeof opener.focus === "function") {
        opener.focus({ preventScroll: true });
      }
    };
  }, [active, ref]);
}
