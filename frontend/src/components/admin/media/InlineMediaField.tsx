import { useRef, useState } from "react";
import {
    ChevronDown,
    ChevronUp,
    Crop,
    ExternalLink,
    FileIcon,
    ImageIcon,
    Loader2,
    RefreshCw,
    Trash2,
    Upload,
} from "lucide-react";
import { toast } from "sonner";
import { MediaPickerModal } from "./MediaPickerModal";
import { ImageCropDialog, type CropSource } from "./ImageCropDialog";
import type { MediaAsset } from "@/lib/types";
import { useAdminT } from "@/lib/admin-i18n";

export interface InlineMediaFieldProps {
    label?: string;
    value?: string | null;
    onChange: (url: string) => void;
    altValue?: string;
    onAltChange?: (alt: string) => void;
    defaultFolder?: string;
    attachedTo?: { resource: string; item_id?: string | null } | null;
    help?: string;
    aspect?: "square" | "video" | "auto";
    accept?: "image" | "document" | "all";
    testId?: string;
    disabled?: boolean;
}

export function InlineMediaField({
    label,
    value,
    onChange,
    altValue,
    onAltChange,
    defaultFolder = "general",
    attachedTo,
    help,
    aspect = "video",
    accept = "image",
    testId = "inline-media-field",
    disabled = false,
}: InlineMediaFieldProps) {
    const t = useAdminT();
    const [pickerOpen, setPickerOpen] = useState(false);
    const [manualOpen, setManualOpen] = useState(false);
    const [isUploadingDirect, setIsUploadingDirect] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [cropOpen, setCropOpen] = useState(false);
    const [cropSource, setCropSource] = useState<CropSource | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const hasValue = Boolean(value && value.trim());
    const isImageField = accept === "image" && !(value ?? "").match(/\.(pdf|doc|docx|pkt|zip)$/i);

    // Direct single file upload (cropped WebP blob or the original file)
    const uploadFile = async (file: File) => {
        setIsUploadingDirect(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("folder", defaultFolder || "general");
            formData.append("optimize", "true");
            formData.append("auto_alt", "true");

            if (altValue && altValue.trim()) {
                formData.append("alt", altValue.trim());
            }

            if (attachedTo?.resource) {
                formData.append("attached_resource", attachedTo.resource);
                if (attachedTo.item_id) {
                    formData.append("attached_item_id", attachedTo.item_id);
                }
            }

            const res = await fetch("/api/admin/media", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const err = (await res.json().catch(() => null)) as { detail?: string } | null;
                throw new Error(err?.detail || `Upload failed (HTTP ${res.status})`);
            }

            const asset = (await res.json()) as MediaAsset;
            onChange(asset.url);
            if (onAltChange && asset.alt) {
                onAltChange(asset.alt);
            }
            toast.success("Image uploaded & applied.");
        } catch (err: any) {
            toast.error(err.message || "Could not upload file.");
        } finally {
            setIsUploadingDirect(false);
        }
    };

    const handleSelectFromPicker = (items: MediaAsset[]) => {
        if (items.length > 0) {
            const chosen = items[0];
            onChange(chosen.url);
            if (onAltChange && chosen.alt) {
                onAltChange(chosen.alt);
            }
            toast.success("Media selected.");
        }
    };

    const aspectClass =
        aspect === "square"
            ? "aspect-square w-[140px] max-w-full"
            : aspect === "video"
            ? "aspect-video w-full max-w-[240px]"
            : "max-h-48 w-full max-w-full";

    return (
        <div className="space-y-1.5" data-testid={testId}>
            {label && (
                <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-[var(--tnl-heading)]">
                        {label}
                    </label>
                    <button
                        type="button"
                        onClick={() => setManualOpen(!manualOpen)}
                        className="text-[11px] text-[var(--tnl-body)] hover:text-[var(--tnl-heading)] inline-flex items-center gap-1 underline transition-colors"
                        data-testid={`${testId}-manual-toggle`}
                    >
                        <span>{manualOpen ? "Hide manual URL" : "Paste URL manually"}</span>
                        {manualOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                </div>
            )}

            {/* Hidden native input for direct file uploads */}
            <input
                ref={fileInputRef}
                type="file"
                accept={accept === "image" ? "image/*" : undefined}
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                        e.target.value = "";
                        if (isImageField) {
                            setCropSource({ file: f });
                            setCropOpen(true);
                        } else {
                            void uploadFile(f);
                        }
                    }
                }}
                className="hidden"
                disabled={disabled}
                data-testid={`${testId}-file-input`}
            />

            {/* If value exists, show thumbnail card */}
            {hasValue ? (
                <div
                    className="relative group min-w-0 rounded-xl border border-[var(--tnl-border)] p-2 bg-black/[0.02] dark:bg-white/[0.02] flex flex-row flex-wrap items-center gap-3"
                    data-testid={`${testId}-preview`}
                >
                    {/* Thumbnail preview */}
                    <div
                        className={`${aspectClass} shrink-0 rounded-lg overflow-hidden border border-black/10 bg-black/10 flex items-center justify-center relative`}
                    >
                        {isUploadingDirect ? (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white">
                                <Loader2 className="h-5 w-5 animate-spin" />
                            </div>
                        ) : value?.match(/\.(pdf|doc|docx|pkt|zip)$/i) ? (
                            <div className="flex flex-col items-center justify-center p-3 text-center">
                                <FileIcon className="h-8 w-8 text-rose-500 mb-1" />
                                <span className="text-[10px] font-mono truncate max-w-[120px]">{value.split("/").pop()}</span>
                            </div>
                        ) : (
                            <img
                                src={value ?? ""}
                                alt={altValue || label || t("adminGenericAlt")}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    // Fallback if image fails to load
                                    (e.target as HTMLElement).style.display = "none";
                                }}
                            />
                        )}
                    </div>

                    {/* Path summary & actions */}
                    <div className="flex-1 min-w-0 w-full basis-full space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-[var(--tnl-body)] truncate block flex-1 min-w-0" title={value ?? ""}>
                                {value}
                            </span>
                            <a
                                href={value ?? "#"}
                                target="_blank"
                                rel="noreferrer"
                                className="text-white/40 hover:text-white p-1"
                                title="Open in new tab"
                            >
                                <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                        </div>

                        {/* Button strip */}
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setPickerOpen(true)}
                                disabled={disabled}
                                className="tnl-btn tnl-btn-secondary text-xs py-1 px-2.5 h-auto inline-flex items-center gap-1.5"
                                data-testid={`${testId}-replace-btn`}
                            >
                                <RefreshCw className="h-3 w-3" />
                                <span>Replace</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={disabled || isUploadingDirect}
                                className="tnl-btn tnl-btn-secondary text-xs py-1 px-2.5 h-auto inline-flex items-center gap-1.5"
                                data-testid={`${testId}-upload-btn`}
                            >
                                <Upload className="h-3 w-3" />
                                <span>Upload</span>
                            </button>

                            {isImageField ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setCropSource({ url: value ?? undefined, suggestedName: value?.split("/").pop() });
                                        setCropOpen(true);
                                    }}
                                    disabled={disabled || isUploadingDirect}
                                    className="tnl-btn tnl-btn-secondary text-xs py-1 px-2.5 h-auto inline-flex items-center gap-1.5"
                                    data-testid={`${testId}-crop-btn`}
                                >
                                    <Crop className="h-3 w-3" />
                                    <span>Crop → WebP</span>
                                </button>
                            ) : null}

                            <button
                                type="button"
                                onClick={() => onChange("")}
                                disabled={disabled}
                                className="rounded-md border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs py-1 px-2.5 h-auto inline-flex items-center gap-1.5 transition-colors"
                                data-testid={`${testId}-remove-btn`}
                            >
                                <Trash2 className="h-3 w-3" />
                                <span>Remove</span>
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                /* Empty state: interactive dropzone */
                <div
                    onDragEnter={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                    }}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                    }}
                    onDragLeave={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                    }}
                    onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) {
                            if (isImageField) {
                                setCropSource({ file });
                                setCropOpen(true);
                            } else {
                                void uploadFile(file);
                            }
                        }
                    }}
                    className={`rounded-xl border-2 border-dashed p-4 flex flex-col sm:flex-row flex-wrap items-center justify-between gap-3 text-center sm:text-left transition-colors ${
                        isDragging
                            ? "border-[var(--tnl-green)] bg-[var(--tnl-green)]/10"
                            : "border-[var(--tnl-border)] bg-black/[0.01] dark:bg-white/[0.01]"
                    }`}
                    data-testid={`${testId}-dropzone`}
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-lg bg-[var(--tnl-green)]/10 text-[var(--tnl-green)] flex items-center justify-center shrink-0">
                            {isUploadingDirect ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                <ImageIcon className="h-5 w-5" />
                            )}
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-[var(--tnl-heading)]">
                                {isUploadingDirect ? "Optimizing & uploading..." : "Drag an image here, or upload"}
                            </p>
                            <p className="text-[11px] text-[var(--tnl-body)]">
                                Auto-compressed to WebP in folder{" "}
                                <span className="font-mono text-[var(--tnl-heading)]">/{defaultFolder}</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={disabled || isUploadingDirect}
                            className="tnl-btn tnl-btn-secondary text-xs py-1.5 px-3 h-auto"
                            data-testid={`${testId}-direct-upload-btn`}
                        >
                            <Upload className="h-3 w-3 mr-1 inline" /> Upload
                        </button>
                        <button
                            type="button"
                            onClick={() => setPickerOpen(true)}
                            disabled={disabled || isUploadingDirect}
                            className="tnl-btn tnl-btn-primary text-xs py-1.5 px-3 h-auto"
                            data-testid={`${testId}-choose-library-btn`}
                        >
                            Choose from Library
                        </button>
                    </div>
                </div>
            )}

            {/* Fallback manual URL input */}
            {manualOpen && (
                <div className="pt-1.5 space-y-1">
                    <input
                        type="text"
                        value={value ?? ""}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder="https://... or /api/media-files/..."
                        className="tnl-field font-mono text-xs py-1.5"
                        disabled={disabled}
                        data-testid={`${testId}-manual-input`}
                    />
                    <p className="text-[11px] text-[var(--tnl-body)]">
                        Supports external URLs or manual file paths.
                    </p>
                </div>
            )}

            {help && !manualOpen && (
                <p className="text-xs text-[var(--tnl-body)]" style={{ color: "var(--tnl-tan-text)" }}>
                    {help}
                </p>
            )}

            {/* On-site WebP cropper */}
            <ImageCropDialog
                open={cropOpen}
                source={cropSource}
                onOpenChange={setCropOpen}
                onDone={(file) => {
                    void uploadFile(file);
                }}
            />

            {/* Media Picker Modal */}
            <MediaPickerModal
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                mode="single"
                accept={accept}
                defaultFolder={defaultFolder}
                attachedTo={attachedTo}
                selectedUrls={value ? [value] : []}
                onSelect={handleSelectFromPicker}
            />
        </div>
    );
}
