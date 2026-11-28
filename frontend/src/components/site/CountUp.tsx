// Scroll-triggered number count-up for stat tiles.
// The final value is always in the DOM for screen readers; the ticking digits are aria-hidden.
// Users who prefer reduced motion, and browsers without IntersectionObserver, see the final value at once.

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 1100;

export function CountUp({ value }: { value: string }) {
    const target = /^\d+$/.test(value) ? Number(value) : null;
    const ref = useRef<HTMLSpanElement>(null);
    const [shown, setShown] = useState(value);

    useEffect(() => {
        setShown(value);
        if (target === null || target === 0) return;
        if (typeof IntersectionObserver === "undefined") return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const node = ref.current;
        if (!node) return;

        let frame = 0;
        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;
                observer.disconnect();
                const start = performance.now();
                const tick = (now: number) => {
                    const progress = Math.min(1, (now - start) / DURATION_MS);
                    const eased = 1 - Math.pow(1 - progress, 3);
                    setShown(String(Math.round(target * eased)));
                    if (progress < 1) frame = requestAnimationFrame(tick);
                };
                frame = requestAnimationFrame(tick);
            },
            { threshold: 0.4 },
        );
        observer.observe(node);
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [value, target]);

    return (
        <>
            <span ref={ref} aria-hidden="true">{shown}</span>
            <span className="sr-only">{value}</span>
        </>
    );
}
