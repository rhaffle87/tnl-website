import { type HTMLAttributes, type PointerEvent, forwardRef, useEffect, useRef } from "react";
import { cn } from "@/lib/utils/utils";

const rectCache = new WeakMap<HTMLElement, DOMRect>();
const frameCache = new WeakMap<HTMLElement, number>();
const pendingCache = new WeakMap<HTMLElement, { x: number; y: number }>();

const paintSpotlight = (element: HTMLElement, { x, y }: { x: number; y: number }) => {
    element.style.setProperty("--spot-x", `${x}px`);
    element.style.setProperty("--spot-y", `${y}px`);
};

const prefersReducedMotion = () =>
    typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** Cache geometry once per pointer entry; pointermove must not force layout. */
export function handleSpotlightPointerEnter(e: PointerEvent<HTMLElement>) {
    if (prefersReducedMotion()) return;
    rectCache.set(e.currentTarget, e.currentTarget.getBoundingClientRect());
}

/** Cancel any queued paint so unmount cannot write to a detached node. */
export function cancelSpotlightFrame(element: HTMLElement) {
    const frame = frameCache.get(element);
    if (frame === undefined) return;
    frameCache.delete(element);
    pendingCache.delete(element);
    window.cancelAnimationFrame?.(frame);
}

/**
 * Updates CSS variables `--spot-x` and `--spot-y` directly on the DOM element.
 * Uses the cached rect and one rAF per frame: zero React re-renders,
 * 60/120 FPS compositor-assisted radial glow on card edges.
 */
export function handleSpotlightPointerMove(e: PointerEvent<HTMLElement>) {
    if (prefersReducedMotion()) return;
    const element = e.currentTarget;
    const rect = rectCache.get(element) ?? element.getBoundingClientRect();
    if (!rectCache.has(element)) rectCache.set(element, rect);

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (frameCache.has(element)) {
        pendingCache.set(element, { x, y });
        return;
    }

    paintSpotlight(element, { x, y });
    const frame = window.requestAnimationFrame(() => {
        frameCache.delete(element);
        const pending = pendingCache.get(element);
        if (pending) {
            pendingCache.delete(element);
            paintSpotlight(element, pending);
        }
    });
    frameCache.set(element, frame);
}

export interface SpotlightCardProps extends HTMLAttributes<HTMLDivElement> {
    as?: "div" | "article" | "section";
}

export const SpotlightCard = forwardRef<HTMLDivElement, SpotlightCardProps>(function SpotlightCard(
    { className, onPointerEnter, onPointerMove, children, as: Tag = "div", ...props },
    ref,
) {
    const lastNode = useRef<HTMLDivElement | null>(null);

    useEffect(() => () => {
        if (lastNode.current) cancelSpotlightFrame(lastNode.current);
    }, []);

    const setRefs = (node: HTMLDivElement | null) => {
        if (node) lastNode.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as { current?: HTMLDivElement | null }).current = node;
    };

    const handleEnter = (e: PointerEvent<HTMLDivElement>) => {
        handleSpotlightPointerEnter(e);
        onPointerEnter?.(e);
    };

    const handleMove = (e: PointerEvent<HTMLDivElement>) => {
        handleSpotlightPointerMove(e);
        onPointerMove?.(e);
    };

    return (
        <Tag
            ref={setRefs}
            className={cn("tnl-card tnl-card-hover tnl-card-spotlight tnl-scroll-reveal", className)}
            {...props}
            onPointerEnter={handleEnter}
            onPointerMove={handleMove}
        >
            {children}
        </Tag>
    );
});

export default SpotlightCard;
