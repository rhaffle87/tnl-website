import { useRef, useState } from "react";
import {
    ArrowLeft,
    ArrowRight,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    ImageIcon,
    Loader2,
    Plus,
    Trash2,
    Upload,
} from "lucide-react";
import { toast } from "sonner";
import { MediaPickerModal } from "./MediaPickerModal";
import type { MediaAsset } from "@/lib/types";
import { useAdminT } from "@/lib/admin-i18n";

export interface MultiMediaFieldProps {
    label?: string;
    value?: string[] | string | null;
    onChange: (urls: any) => void;
    rawString?: boolean; // if true, converts array to comma-separated string
    defaultFolder?: string;
    attachedTo?: { resource: string; item_id?: string | null } | null;
    help?: string;
    testId?: string;
    disabled?: boolean;
}

export function MultiMediaField({
    label,
    value,
    onChange,
    rawString = false,
    defaultFolder = "general",
    attachedTo,
    help,
    testId = "multi-media-field",
    disabled = false,
}: MultiMediaFieldProps) {
    const t = useAdminT();
    const [pickerOpen, setPickerOpen] = useState(false);
    const [rawOpen, setRawOpen] = useState(false);
    const [isUploadingBatch, setIsUploadingBatch] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Normalize value to array of non-empty strings
    const urlList: string[] = Array.isArray(value)
        ? value.filter(Boolean)
        : typeof value === "string"
        ? value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
        : [];

    const emitChange = (newList: string[]) => {
        if (rawString) {
            onChange(newList.join(", "));
        } else {
            onChange(newList);
        }
    };

    const handleRemove = (index: number) => {
        const next = [...urlList];
        next.splice(index, 1);
        emitChange(next);
    };

    const handleMove = (index: number, direction: -1 | 1) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= urlList.length) return;
        const next = [...urlList];
        const [moved] = next.splice(index, 1);
        next.splice(targetIndex, 0, moved);
        emitChange(next);
    };

    const handleSelectFromPicker = (items: MediaAsset[]) => {
        if (items.length > 0) {
            const newUrls = items.map((it) => it.url);
            // Append newly chosen URLs avoiding duplicate consecutive items
            const merged = Array.from(new Set([...urlList, ...newUrls]));
            emitChange(merged);
            toast.success(`Added ${newUrls.length} media item(s).`);
        }
    };

    const handleUploadFiles = async (files: FileList | File[]) => {
        const fileArr = Array.from(files);
        if (fileArr.length === 0) return;

        setIsUploadingBatch(true);
        const uploadedUrls: string[] = [];

        for (const file of fileArr) {
            try {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("folder", defaultFolder || "general");
                formData.append("optimize", "true");
                formData.append("auto_alt", "true");

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

                if (res.ok) {
                    const asset = (await res.json()) as MediaAsset;
                    uploadedUrls.push(asset.url);
                }
            } catch {
                // Continue with other files
            }
        }

        setIsUploadingBatch(false);
        if (uploadedUrls.length > 0) {
            const merged = [...urlList, ...uploadedUrls];
            emitChange(merged);
            toast.success(`Uploaded ${uploadedUrls.length} photo(s).`);
        } else {
            toast.error("Failed to upload photos.");
        }
    };

    return (
        <div className="space-y-2" data-testid={testId}>
            <div className="flex items-center justify-between">
                {label && (
                    <label className="block text-sm font-medium text-[var(--tnl-heading)]">
                        {label} {urlList.length > 0 && <span className="text-xs text-[var(--tnl-body)]">({urlList.length})</span>}
                    </label>
                )}
                <button
                    type="button"
                    onClick={() => setRawOpen(!rawOpen)}
                    className="text-[11px] text-[var(--tnl-body)] hover:text-[var(--tnl-heading)] inline-flex items-center gap-1 underline transition-colors"
                    data-testid={`${testId}-raw-toggle`}
                >
                    <span>{rawOpen ? "Hide raw URLs" : "Edit raw URLs"}</span>
                    {rawOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
            </div>

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => {
                    if (e.target.files) void handleUploadFiles(e.target.files);
                }}
                className="hidden"
                disabled={disabled}
                data-testid={`${testId}-file-input`}
            />

            {/* Thumbnails Grid if items exist */}
            {urlList.length > 0 && (
                <div
                    className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 p-2 rounded-xl border border-[var(--tnl-border)] bg-black/[0.02] dark:bg-white/[0.02]"
                    data-testid={`${testId}-grid`}
                >
                    {urlList.map((url, idx) => (
                        <div
                            key={`${url}-${idx}`}
                            className="relative group rounded-lg overflow-hidden border border-[var(--tnl-border)] aspect-square bg-black/10 flex flex-col justify-between"
                            data-testid={`${testId}-item-${idx}`}
                        >
                            <img
                                src={url}
                                alt={`${t("adminGenericAlt")} ${idx + 1}`}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    (e.target as HTMLElement).style.display = "none";
                                }}
                            />

                            {/* Top badge with index */}
                            <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-black/70 text-white shadow-xs">
                                #{idx + 1}
                            </div>

                            {/* Floating control buttons */}
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-1.5 flex items-center justify-between text-white">
                                <div className="flex items-center gap-0.5">
                                    <button
                                        type="button"
                                        onClick={() => handleMove(idx, -1)}
                                        disabled={idx === 0 || disabled}
                                        className="h-6 w-6 rounded flex items-center justify-center hover:bg-white/20 disabled:opacity-30"
                                        title="Move left/up"
                                        data-testid={`${testId}-move-left-${idx}`}
                                    >
                                        <ArrowLeft className="h-3 w-3" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleMove(idx, 1)}
                                        disabled={idx === urlList.length - 1 || disabled}
                                        className="h-6 w-6 rounded flex items-center justify-center hover:bg-white/20 disabled:opacity-30"
                                        title="Move right/down"
                                        data-testid={`${testId}-move-right-${idx}`}
                                    >
                                        <ArrowRight className="h-3 w-3" />
                                    </button>
                                </div>

                                <div className="flex items-center gap-0.5">
                                    <a
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="h-6 w-6 rounded flex items-center justify-center hover:bg-white/20"
                                        title="View full size"
                                    >
                                        <ExternalLink className="h-3 w-3" />
                                    </a>
                                    <button
                                        type="button"
                                        onClick={() => handleRemove(idx)}
                                        disabled={disabled}
                                        className="h-6 w-6 rounded flex items-center justify-center text-rose-400 hover:bg-rose-900/50"
                                        title="Remove asset"
                                        data-testid={`${testId}-remove-${idx}`}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Dropzone & Action bar */}
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
                    if (e.dataTransfer.files) void handleUploadFiles(e.dataTransfer.files);
                }}
                className={`rounded-xl border-2 border-dashed p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 transition-colors ${
                    isDragging
                        ? "border-[var(--tnl-green)] bg-[var(--tnl-green)]/10"
                        : "border-[var(--tnl-border)] bg-black/[0.01] dark:bg-white/[0.01]"
                }`}
                data-testid={`${testId}-dropzone`}
            >
                <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-[var(--tnl-green)]/10 text-[var(--tnl-green)] flex items-center justify-center shrink-0">
                        {isUploadingBatch ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-[var(--tnl-heading)]">
                            {isUploadingBatch ? "Uploading photos..." : "Drop photos here or pick from Library"}
                        </p>
                        <p className="text-[11px] text-[var(--tnl-body)]">
                            Multi-select & reordering supported
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={disabled || isUploadingBatch}
                        className="tnl-btn tnl-btn-secondary text-xs py-1.5 px-3 h-auto"
                        data-testid={`${testId}-upload-btn`}
                    >
                        <Upload className="h-3 w-3 mr-1 inline" /> Upload Photos
                    </button>
                    <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        disabled={disabled || isUploadingBatch}
                        className="tnl-btn tnl-btn-primary text-xs py-1.5 px-3 h-auto"
                        data-testid={`${testId}-add-library-btn`}
                    >
                        <Plus className="h-3 w-3 mr-1 inline" /> Add from Library
                    </button>
                </div>
            </div>

            {/* Raw URLs fallback */}
            {rawOpen && (
                <div className="pt-1.5 space-y-1">
                    <textarea
                        rows={3}
                        value={urlList.join(", ")}
                        onChange={(e) => {
                            const raw = e.target.value;
                            const split = raw.split(",").map((s) => s.trim()).filter(Boolean);
                            emitChange(split);
                        }}
                        placeholder="https://..., https://..."
                        className="tnl-field font-mono text-xs py-1.5"
                        disabled={disabled}
                        data-testid={`${testId}-raw-textarea`}
                    />
                    <p className="text-[11px] text-[var(--tnl-body)]">
                        Separate URLs with commas.
                    </p>
                </div>
            )}

            {help && !rawOpen && (
                <p className="text-xs text-[var(--tnl-body)]" style={{ color: "var(--tnl-tan-text)" }}>
                    {help}
                </p>
            )}

            {/* Media Picker Modal */}
            <MediaPickerModal
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                mode="multiple"
                accept="image"
                defaultFolder={defaultFolder}
                attachedTo={attachedTo}
                selectedUrls={urlList}
                onSelect={handleSelectFromPicker}
            />
        </div>
    );
}
