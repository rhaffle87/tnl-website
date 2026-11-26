/**
 * On-site WebP cropper — crop any image in the browser and emit an optimized WebP file.
 *
 * Flow: InlineMediaField (or the media picker) hands over a source image (a File the
 * user just picked, or an existing asset URL). The dialog renders it on a canvas,
 * the operator drags a crop rectangle (with 1:1 / 4:3 / 16:9 presets), and "Apply"
 * produces a `File` encoded as image/webp (quality 0.85) ready for the normal
 * /api/admin/media upload path — no external tools, no PNG round-trips.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Crop, Loader2, X } from "lucide-react";
import { useAdminT } from "@/lib/i18n/admin-i18n";

export type CropSource = { file?: File; url?: string; suggestedName?: string };

interface CropRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

const PRESETS = [
    { id: "free", label: "Free", ratio: null },
    { id: "1:1", label: "1:1", ratio: 1 },
    { id: "4:3", label: "4:3", ratio: 4 / 3 },
    { id: "16:9", label: "16:9", ratio: 16 / 9 },
    { id: "3:4", label: "3:4", ratio: 3 / 4 },
] as const;

const MAX_DISPLAY_W = 520;
const MAX_DISPLAY_H = 360;

export function ImageCropDialog({
    open,
    source,
    onOpenChange,
    onDone,
}: {
    open: boolean;
    source: CropSource | null;
    onOpenChange: (open: boolean) => void;
    /** Receives the cropped image as a WebP File, ready to upload. */
    onDone: (file: File) => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const t = useAdminT();
    const imageRef = useRef<HTMLImageElement | null>(null);
    const dragRef = useRef<{ startX: number; startY: number; base: CropRect } | null>(null);
    const [rect, setRect] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 });
    const [display, setDisplay] = useState({ w: 0, h: 0 });
    const [preset, setPreset] = useState<(typeof PRESETS)[number]["id"]>("free");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadImage = useCallback(async (src: CropSource | null) => {
        if (!src) return;
        setLoading(true);
        setError(null);
        try {
            const objectUrl = src.url ?? URL.createObjectURL(src.file!);
            const img = new Image();
            img.crossOrigin = "anonymous";
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error("Could not load the image."));
                img.src = objectUrl;
            });
            if (!src.url) URL.revokeObjectURL(objectUrl);
            imageRef.current = img;
            const scale = Math.min(MAX_DISPLAY_W / img.naturalWidth, MAX_DISPLAY_H / img.naturalHeight, 1);
            const w = Math.max(1, Math.round(img.naturalWidth * scale));
            const h = Math.max(1, Math.round(img.naturalHeight * scale));
            setDisplay({ w, h });
            // Start with the largest centered crop matching the default preset.
            const ratio = PRESETS.find((p) => p.id === "free")?.ratio;
            const cw = ratio ? Math.min(w, Math.round(h * ratio)) : w;
            const ch = ratio ? Math.round(cw / ratio) : h;
            setRect({ x: Math.round((w - cw) / 2), y: Math.round((h - ch) / 2), w: cw, h: ch });
            setPreset("free");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not load the image.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open && source) void loadImage(source);
        if (!open) {
            imageRef.current = null;
            setError(null);
        }
    }, [open, source, loadImage]);

    // Apply a preset ratio by shrinking the current rect around its centre.
    const applyPreset = (id: (typeof PRESETS)[number]["id"]) => {
        setPreset(id);
        const p = PRESETS.find((x) => x.id === id);
        if (!imageRef.current) return;
        const { w: dw, h: dh } = display;
        if (!p?.ratio) return;
        let cw = dw;
        let ch = Math.round(cw / p.ratio);
        if (ch > dh) {
            ch = dh;
            cw = Math.round(ch * p.ratio);
        }
        setRect((prev) => ({
            x: Math.max(0, Math.min(dw - cw, Math.round(prev.x + prev.w / 2 - cw / 2))),
            y: Math.max(0, Math.min(dh - ch, Math.round(prev.y + prev.h / 2 - ch / 2))),
            w: cw,
            h: ch,
        }));
    };

    const pointerPos = (e: React.PointerEvent) => {
        const box = canvasRef.current!.getBoundingClientRect();
        return { x: e.clientX - box.left, y: e.clientY - box.top };
    };

    // Paint image + crop overlay whenever the rect or display size changes.
    useEffect(() => {
        const canvas = canvasRef.current;
        const img = imageRef.current;
        if (!canvas || !img || !display.w) return;
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, display.w, display.h);
        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (rect.w > 0 && rect.h > 0) {
            ctx.drawImage(
                img,
                (rect.x * img.naturalWidth) / display.w,
                (rect.y * img.naturalHeight) / display.h,
                (rect.w * img.naturalWidth) / display.w,
                (rect.h * img.naturalHeight) / display.h,
                rect.x,
                rect.y,
                rect.w,
                rect.h,
            );
            const emerald =
                getComputedStyle(document.documentElement).getPropertyValue("--gsm-emerald").trim() || "#5D8A6B";
            ctx.strokeStyle = emerald;
            ctx.lineWidth = 2;
            ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        }
    }, [rect, display]);

    const onPointerDown = (e: React.PointerEvent) => {
        if (!imageRef.current) return;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        dragRef.current = { startX: pointerPos(e).x, startY: pointerPos(e).y, base: { ...rect } };
    };

    const onPointerMove = (e: React.PointerEvent) => {
        const drag = dragRef.current;
        if (!drag || !imageRef.current) return;
        const { x, y } = pointerPos(e);
        const nx = Math.max(0, Math.min(display.w, drag.base.x + (x - drag.startX)));
        const ny = Math.max(0, Math.min(display.h, drag.base.y + (y - drag.startY)));
        setRect({
            ...drag.base,
            x: Math.min(nx, display.w - drag.base.w),
            y: Math.min(ny, display.h - drag.base.h),
        });
    };

    const onPointerUp = () => {
        dragRef.current = null;
    };

    // Keyboard equivalent of dragging the crop frame: arrows move by 1 px,
    // Shift+arrows by 10 px. The position is exposed in the canvas label so
    // screen-reader users hear the result of each adjustment.
    const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
        const step = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowLeft") dx = -step;
        else if (e.key === "ArrowRight") dx = step;
        else if (e.key === "ArrowUp") dy = -step;
        else if (e.key === "ArrowDown") dy = step;
        else return;
        e.preventDefault();
        if (!imageRef.current) return;
        setRect((prev) => ({
            ...prev,
            x: Math.max(0, Math.min(display.w - prev.w, prev.x + dx)),
            y: Math.max(0, Math.min(display.h - prev.h, prev.y + dy)),
        }));
    };

    const applyCrop = () => {
        const img = imageRef.current;
        if (!img || rect.w < 4 || rect.h < 4) return;
        const scale = img.naturalWidth / display.w;
        const sx = Math.round(rect.x * scale);
        const sy = Math.round(rect.y * (img.naturalHeight / display.h));
        const sw = Math.max(1, Math.round(rect.w * scale));
        const sh = Math.max(1, Math.round(rect.h * (img.naturalHeight / display.h)));
        const out = document.createElement("canvas");
        out.width = sw;
        out.height = sh;
        out.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        out.toBlob(
            (blob) => {
                if (!blob) {
                    setError("Browser refused WebP encoding.");
                    return;
                }
                const base = (source?.suggestedName || source?.file?.name || "cropped")
                    .replace(/\.[a-z0-9]+$/i, "")
                    .slice(0, 64);
                const file = new File([blob], `${base}.webp`, { type: "image/webp" });
                onOpenChange(false);
                onDone(file);
            },
            "image/webp",
            0.85,
        );
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
            data-testid="image-crop-dialog"
        >
            <div className="w-full max-w-[600px] rounded-xl border border-[var(--tnl-border)] bg-[var(--card)] p-4 shadow-xl">
                <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-bold">
                        <Crop className="h-4 w-4" aria-hidden="true" />
                        Crop &amp; convert to WebP
                    </h3>
                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="rounded p-1 hover:bg-black/10 dark:hover:bg-white/10"
                        aria-label="Close crop dialog"
                        data-testid="image-crop-close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex h-64 items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                ) : error ? (
                    <p className="py-8 text-center text-sm text-rose-500">{error}</p>
                ) : (
                    <>
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            {PRESETS.map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => applyPreset(p.id)}
                                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                                        preset === p.id ? "border-[var(--tnl-green)] bg-[var(--tnl-green)]/10" : "border-[var(--tnl-border)]"
                                    }`}
                                    data-testid={`image-crop-preset-${p.id.replace(":", "")}`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        <div className="mt-3 overflow-auto rounded-lg border border-[var(--tnl-border)] bg-black/20 p-2">
                            <canvas
                                ref={canvasRef}
                                width={display.w}
                                height={display.h}
                                tabIndex={0}
                                role="application"
                                aria-label={`${t("adminCrop")} frame at x ${rect.x} y ${rect.y}. Arrow keys move; hold Shift for larger steps.`}
                                onKeyDown={onKeyDown}
                                onPointerDown={onPointerDown}
                                onPointerMove={onPointerMove}
                                onPointerUp={onPointerUp}
                                className="max-w-full cursor-move touch-none"
                                data-testid="image-crop-canvas"
                            />
                        </div>

                        <div className="mt-3 flex items-center justify-end gap-2">
                            <span className="mr-auto text-[11px] text-[var(--tnl-body)]">
                                Drag the frame, pick a ratio, then apply. Output: WebP (q85).
                            </span>
                            <button
                                type="button"
                                onClick={applyCrop}
                                disabled={rect.w < 4}
                                className="tnl-btn tnl-btn-primary text-xs"
                                data-testid="image-crop-apply"
                            >
                                Apply crop
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
