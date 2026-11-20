import { type HTMLAttributes, type PointerEvent, forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Updates CSS variables `--spot-x` and `--spot-y` directly on the DOM element.
 * Zero React re-renders, 60/120 FPS compositor-assisted radial glow on card edges.
 */
export function handleSpotlightPointerMove(e: PointerEvent<HTMLElement>) {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.style.setProperty("--spot-x", `${x}px`);
    e.currentTarget.style.setProperty("--spot-y", `${y}px`);
}

export interface SpotlightCardProps extends HTMLAttributes<HTMLDivElement> {
    as?: "div" | "article" | "section";
}

export const SpotlightCard = forwardRef<HTMLDivElement, SpotlightCardProps>(function SpotlightCard(
    { className, onPointerMove, children, as: Tag = "div", ...props },
    ref,
) {
    const handleMove = (e: PointerEvent<HTMLDivElement>) => {
        handleSpotlightPointerMove(e);
        onPointerMove?.(e);
    };

    return (
        <Tag
            ref={ref}
            onPointerMove={handleMove}
            className={cn("tnl-card tnl-card-hover tnl-card-spotlight tnl-scroll-reveal", className)}
            {...props}
        >
            {children}
        </Tag>
    );
});

export default SpotlightCard;
