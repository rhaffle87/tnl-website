import { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/i18n";
import "./media-carousel.css";

export interface CarouselImage {
    url: string;
    alt?: string;
    caption?: string;
}

export function FadeCarousel({
    images,
    aspectRatio = "aspect-video",
    className,
    intervalMs = 3000,
    onImageClick,
    showControls = true,
}: {
    images: (string | CarouselImage)[];
    aspectRatio?: string;
    className?: string;
    intervalMs?: number;
    onImageClick?: (index: number) => void;
    showControls?: boolean;
}) {
    const { t } = useLocale();
    const normalized: CarouselImage[] = images.map((img) =>
        typeof img === "string" ? { url: img, alt: "Activity media" } : img
    );

    const [current, setCurrent] = useState(0);
    const [paused, setPaused] = useState(false);

    const count = normalized.length;

    const next = useCallback(() => {
        if (count <= 1) return;
        setCurrent((prev) => (prev + 1) % count);
    }, [count]);

    const prev = useCallback(() => {
        if (count <= 1) return;
        setCurrent((prev) => (prev - 1 + count) % count);
    }, [count]);

    useEffect(() => {
        if (paused || count <= 1) return;
        const timer = setInterval(next, intervalMs);
        return () => clearInterval(timer);
    }, [paused, count, intervalMs, next]);

    if (count === 0) return null;

    return (
        <div
            className={cn("group relative overflow-hidden rounded-2xl bg-[var(--gsm-obsidian)]", aspectRatio, className)}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            {normalized.map((img, i) => (
                <button
                    key={img.url + i}
                    type="button"
                    aria-label={`${t("carousel_slide")} ${i + 1}`}
                    className={cn(
                        "tnl-carousel-slide absolute inset-0 border-0 p-0 text-left transition-opacity duration-700 ease-in-out",
                        i === current ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
                    )}
                    onClick={() => onImageClick?.(i)}
                >
                    <img
                        src={img.url}
                        alt={img.alt || `${t("carousel_slide")} ${i + 1}`}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        loading={i === 0 ? "eager" : "lazy"}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" aria-hidden="true" />

                    {img.caption && (
                        <div className="absolute bottom-3 left-3 right-3 text-left">
                            <span className="inline-block rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur-md border border-white/20">
                                {img.caption}
                            </span>
                        </div>
                    )}
                </button>
            ))}

            {count > 1 && showControls && (
                <>
                    {/* Navigation Buttons */}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            prev();
                        }}
                        aria-label={t("carousel_previous")}
                        className="tnl-carousel-control absolute left-2.5 top-1/2 -translate-y-1/2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-md border border-white/15 transition-all duration-200 hover:bg-[var(--gsm-primary)] hover:text-[var(--gsm-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tnl-tan)]"
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            next();
                        }}
                        aria-label={t("carousel_next")}
                        className="tnl-carousel-control absolute right-2.5 top-1/2 -translate-y-1/2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-md border border-white/15 transition-all duration-200 hover:bg-[var(--gsm-primary)] hover:text-[var(--gsm-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tnl-tan)]"
                    >
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>

                    {/* Dot Indicators */}
                    <div className="absolute bottom-3 right-3 z-20 flex items-center gap-0.5">
                        {normalized.map((_, idx) => (
                            <button
                                key={idx}
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrent(idx);
                                }}
                                aria-label={`${t("carousel_slide")} ${idx + 1}`}
                                aria-current={idx === current ? "true" : undefined}
                                className="tnl-carousel-control group flex h-11 w-11 items-center justify-center rounded-full bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tnl-tan)]"
                            >
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        "block rounded-full transition-all duration-300",
                                        idx === current
                                            ? "h-1.5 w-5 bg-[var(--tnl-tan)]"
                                            : "h-1.5 w-1.5 bg-white/40 group-hover:bg-white/70"
                                    )}
                                />
                            </button>
                        ))}
                    </div>
                </>
            )}

            {/* Quick Zoom Indicator */}
            {onImageClick && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onImageClick(current);
                    }}
                    aria-label={t("carousel_zoom_in")}
                    className="tnl-carousel-control absolute top-3 right-3 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white/80 backdrop-blur-md border border-white/15 transition-colors hover:text-white hover:bg-[var(--gsm-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tnl-tan)]"
                >
                    <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
            )}
        </div>
    );
}

export function ImageLightboxModal({
    images,
    initialIndex = 0,
    isOpen = true,
    onClose,
}: {
    images: (string | CarouselImage)[];
    initialIndex?: number;
    isOpen?: boolean;
    onClose: () => void;
}) {
    const normalized: CarouselImage[] = images.map((img) =>
        typeof img === "string" ? { url: img, alt: "Activity full preview" } : img
    );

    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [zoomed, setZoomed] = useState(false);
    const { t } = useLocale();

    useEffect(() => {
        setCurrentIndex(initialIndex);
        setZoomed(false);
    }, [initialIndex, isOpen]);

    // Handle ESC and arrows
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            } else if (e.key === "ArrowLeft") {
                setCurrentIndex((prev) => (prev > 0 ? prev - 1 : normalized.length - 1));
                setZoomed(false);
            } else if (e.key === "ArrowRight") {
                setCurrentIndex((prev) => (prev < normalized.length - 1 ? prev + 1 : 0));
                setZoomed(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "hidden";

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = "unset";
        };
    }, [isOpen, onClose, normalized.length]);

    if (!isOpen || normalized.length === 0) return null;

    const currentImg = normalized[currentIndex];

    return (
        <div
            className="fixed inset-0 z-[200] flex flex-col items-center justify-between bg-black/90 p-4 backdrop-blur-xl animate-fade-in select-none"
            role="dialog"
            aria-modal="true"
            aria-label={t("carousel_lightbox")}
            data-lenis-prevent
            onClick={onClose}
        >
            {/* Top Bar */}
            <div
                className="flex w-full max-w-7xl items-center justify-between py-2 text-white/80"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3">
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wider text-[var(--tnl-tan)]">
                        {currentIndex + 1} / {normalized.length}
                    </span>
                    {currentImg.caption && (
                        <p className="text-sm font-medium text-white/90 line-clamp-1">
                            {currentImg.caption}
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setZoomed(!zoomed)}
                        aria-label={zoomed ? t("carousel_zoom_out") : t("carousel_zoom_in")}
                        className="tnl-carousel-control flex h-11 w-11 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tnl-tan)]"
                    >
                        {zoomed ? <ZoomOut className="h-4 w-4" aria-hidden="true" /> : <ZoomIn className="h-4 w-4" aria-hidden="true" />}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t("carousel_close")}
                        className="tnl-carousel-control flex h-11 w-11 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition-colors hover:bg-[var(--tnl-danger)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tnl-tan)]"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            </div>

            {/* Main Stage */}
            <div
                className="relative flex flex-1 w-full max-w-7xl items-center justify-center overflow-hidden py-2"
                onClick={(e) => e.stopPropagation()}
            >
                {normalized.length > 1 && (
                    <button
                        type="button"
                        onClick={() => {
                            setCurrentIndex((prev) => (prev > 0 ? prev - 1 : normalized.length - 1));
                            setZoomed(false);
                        }}
                        aria-label={t("carousel_previous")}
                        className="tnl-carousel-control absolute left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur-md transition-all hover:bg-[var(--gsm-primary)] hover:text-[var(--gsm-accent)] hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tnl-tan)]"
                    >
                        <ChevronLeft className="h-6 w-6" aria-hidden="true" />
                    </button>
                )}

                <div
                    className={cn(
                        "flex items-center justify-center transition-transform duration-300",
                        zoomed ? "scale-150 cursor-zoom-out overflow-auto" : "scale-100 cursor-zoom-in"
                    )}
                    onClick={() => setZoomed(!zoomed)}
                >
                    <img
                        src={currentImg.url}
                        alt={currentImg.alt || "Enlarged activity photo"}
                        className="max-h-[72vh] max-w-full rounded-xl object-contain shadow-2xl"
                    />
                </div>

                {normalized.length > 1 && (
                    <button
                        type="button"
                        onClick={() => {
                            setCurrentIndex((prev) => (prev < normalized.length - 1 ? prev + 1 : 0));
                            setZoomed(false);
                        }}
                        aria-label={t("carousel_next")}
                        className="tnl-carousel-control absolute right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur-md transition-all hover:bg-[var(--gsm-primary)] hover:text-[var(--gsm-accent)] hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tnl-tan)]"
                    >
                        <ChevronRight className="h-6 w-6" aria-hidden="true" />
                    </button>
                )}
            </div>

            {/* Thumbnail Strip */}
            {normalized.length > 1 && (
                <div
                    className="flex max-w-full items-center gap-2 overflow-x-auto py-3 px-4"
                    onClick={(e) => e.stopPropagation()}
                >
                    {normalized.map((img, idx) => (
                        <button
                            key={img.url + idx}
                            type="button"
                            onClick={() => {
                                setCurrentIndex(idx);
                                setZoomed(false);
                            }}
                            aria-label={`${t("carousel_slide")} ${idx + 1}`}
                            aria-current={idx === currentIndex ? "true" : undefined}
                            className={cn(
                                "tnl-carousel-control h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tnl-tan)]",
                                idx === currentIndex
                                    ? "border-[var(--tnl-tan)] scale-105 shadow-md"
                                    : "border-transparent opacity-50 hover:opacity-100"
                            )}
                        >
                            <img src={img.url} alt={img.alt || `${t("carousel_slide")} ${idx + 1}`} className="h-full w-full object-cover" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
