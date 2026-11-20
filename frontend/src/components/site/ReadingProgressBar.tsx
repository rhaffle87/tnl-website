import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export function ReadingProgressBar() {
    const location = useLocation();
    const [progress, setProgress] = useState(0);
    const [supportsCssScroll, setSupportsCssScroll] = useState(true);

    const isReadingPage =
        location.pathname === "/privacy" ||
        location.pathname === "/terms" ||
        (location.pathname.startsWith("/news/") && location.pathname !== "/news");

    useEffect(() => {
        if (!isReadingPage) return;

        const hasCssScroll =
            typeof CSS !== "undefined" &&
            typeof CSS.supports === "function" &&
            CSS.supports("animation-timeline: scroll()");

        setSupportsCssScroll(hasCssScroll);

        if (hasCssScroll) return;

        let ticking = false;
        const handleScroll = () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
                    const scrolled = window.scrollY;
                    setProgress(scrollable > 0 ? Math.min(1, Math.max(0, scrolled / scrollable)) : 0);
                    ticking = false;
                });
                ticking = true;
            }
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        handleScroll();
        return () => window.removeEventListener("scroll", handleScroll);
    }, [isReadingPage]);

    if (!isReadingPage) return null;

    return (
        <div
            aria-hidden="true"
            data-testid="reading-progress-bar"
            className="tnl-reading-progress print:hidden motion-reduce:hidden"
            style={!supportsCssScroll ? { transform: `scaleX(${progress})` } : undefined}
        />
    );
}

export default ReadingProgressBar;
