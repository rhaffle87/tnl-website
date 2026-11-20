import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import Lenis from "lenis";

interface ScrollToOptions {
    offset?: number;
    immediate?: boolean;
    duration?: number;
    easing?: (t: number) => number;
}

interface SmoothScrollContextValue {
    lenis: Lenis | null;
    scrollTo: (target: string | number | HTMLElement, options?: ScrollToOptions) => void;
}

const SmoothScrollContext = createContext<SmoothScrollContextValue>({
    lenis: null,
    scrollTo: () => {},
});

export function useSmoothScroll() {
    return useContext(SmoothScrollContext);
}

export function SmoothScrollProvider({ children }: { children: ReactNode }) {
    const location = useLocation();
    const lenisRef = useRef<Lenis | null>(null);
    const [lenisState, setLenisState] = useState<Lenis | null>(null);

    const isAdmin = location.pathname.startsWith("/admin");

    useEffect(() => {
        if (typeof window === "undefined") return;

        // Guard: disable in admin routes, reduced-motion, and coarse pointer (touch / mobile)
        const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        const isTouchDevice = window.matchMedia?.("(pointer: coarse)").matches ?? false;

        if (isAdmin || prefersReducedMotion || isTouchDevice) {
            if (lenisRef.current) {
                lenisRef.current.destroy();
                lenisRef.current = null;
                setLenisState(null);
            }
            return;
        }

        const lenis = new Lenis({
            duration: 0.95,
            easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true,
            wheelMultiplier: 0.95,
            touchMultiplier: 1,
            autoRaf: false,
        });

        lenisRef.current = lenis;
        setLenisState(lenis);

        let rafId: number;
        function raf(time: number) {
            lenis.raf(time);
            rafId = requestAnimationFrame(raf);
        }
        rafId = requestAnimationFrame(raf);

        // Body overflow observer: automatically pause Lenis when a modal / lightbox opens
        const bodyObserver = new MutationObserver(() => {
            const isLocked =
                document.body.classList.contains("overflow-hidden") ||
                document.body.style.overflow === "hidden" ||
                document.documentElement.classList.contains("overflow-hidden");

            if (isLocked) {
                lenis.stop();
            } else {
                lenis.start();
            }
        });

        bodyObserver.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });

        return () => {
            cancelAnimationFrame(rafId);
            bodyObserver.disconnect();
            lenis.destroy();
            lenisRef.current = null;
            setLenisState(null);
        };
    }, [isAdmin]);

    // Route change handling: reset to top if no hash, or smoothly scroll to anchor if hash present
    useEffect(() => {
        const lenis = lenisRef.current;
        if (!lenis) return;

        if (location.hash) {
            const targetEl = document.querySelector(location.hash) as HTMLElement | null;
            if (targetEl) {
                lenis.scrollTo(targetEl, { offset: -96, duration: 0.8 });
                return;
            }
        }

        lenis.scrollTo(0, { immediate: true });
    }, [location.pathname, location.hash]);

    const scrollTo = (target: string | number | HTMLElement, options?: ScrollToOptions) => {
        if (lenisRef.current) {
            lenisRef.current.scrollTo(target, { offset: -96, ...options });
        } else if (typeof window !== "undefined") {
            if (typeof target === "number") {
                window.scrollTo({ top: target, behavior: options?.immediate ? "instant" : "smooth" });
            } else if (typeof target === "string") {
                const el = document.querySelector(target);
                if (el) {
                    const top = el.getBoundingClientRect().top + window.scrollY + (options?.offset ?? -96);
                    window.scrollTo({ top, behavior: options?.immediate ? "instant" : "smooth" });
                }
            } else if (target instanceof HTMLElement) {
                const top = target.getBoundingClientRect().top + window.scrollY + (options?.offset ?? -96);
                window.scrollTo({ top, behavior: options?.immediate ? "instant" : "smooth" });
            }
        }
    };

    return (
        <SmoothScrollContext.Provider value={{ lenis: lenisState, scrollTo }}>
            {children}
        </SmoothScrollContext.Provider>
    );
}

export default SmoothScrollProvider;
