import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Check,
    CheckCircle2,
    FileCode,
    FileIcon,
    FileText,
    Folder,
    ImageIcon,
    Loader2,
    RefreshCw,
    Search,
    UploadCloud,
    X,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPatch } from "@/lib/api";
import type { MediaAsset } from "@/lib/types";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export interface MediaPickerModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode?: "single" | "multiple";
    accept?: "image" | "document" | "all";
    defaultFolder?: string;
    attachedTo?: { resource: string; item_id?: string | null } | null;
    selectedUrls?: string[];
    onSelect: (items: MediaAsset[]) => void;
}

const FOLDERS = [
    { value: "all", label: "All folders" },
    { value: "events", label: "Events & Programs" },
    { value: "members", label: "Members" },
    { value: "posts", label: "News & Posts" },
    { value: "partners", label: "Partners" },
    { value: "practicum", label: "Practicum" },
    { value: "equipment", label: "Lab Equipment" },
    { value: "pages", label: "Pages" },
    { value: "general", label: "General" },
];

function formatBytes(bytes?: number): string {
    if (!bytes || bytes <= 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

interface UploadQueueItem {
    id: string;
    file: File;
    status: "ready" | "uploading" | "done" | "error";
    errorMsg?: string;
    resultAsset?: MediaAsset;
    previewUrl: string;
}

export function MediaPickerModal({
    open,
    onOpenChange,
    mode = "single",
    accept = "image",
    defaultFolder = "general",
    attachedTo,
    selectedUrls = [],
    onSelect,
}: MediaPickerModalProps) {
    const qc = useQueryClient();
    const [activeTab, setActiveTab] = useState<"library" | "upload">("library");

    // Search and filter states
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [folder, setFolder] = useState<string>(defaultFolder || "all");
    const [kind, setKind] = useState<string>(accept === "all" ? "all" : accept);
    const [limit] = useState<number>(48);

    // Selected items state
    const [selectedItems, setSelectedItems] = useState<MediaAsset[]>([]);
    const [focusedAsset, setFocusedAsset] = useState<MediaAsset | null>(null);

    // Quick edit alt text state
    const [altDraft, setAltDraft] = useState("");
    const [isSavingAlt, setIsSavingAlt] = useState(false);

    // Upload tab states
    const [uploadFolder, setUploadFolder] = useState<string>(defaultFolder === "all" ? "general" : (defaultFolder || "general"));
    const [uploadAlt, setUploadAlt] = useState("");
    const [optimizeWebP, setOptimizeWebP] = useState(true);
    const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploadingBatch, setIsUploadingBatch] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Debounce search query
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery), 250);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Keep active folder synced when modal opens
    useEffect(() => {
        if (open) {
            if (defaultFolder && defaultFolder !== "all") {
                setFolder(defaultFolder);
                setUploadFolder(defaultFolder);
            }
        }
    }, [open, defaultFolder]);

    // Fetch media from backend
    const { data, isLoading, refetch, isRefetching } = useQuery<{
        items: MediaAsset[];
        folders: string[];
        total: number;
        limit: number;
        offset: number;
    }>({
        queryKey: ["admin", "media", "picker", folder, debouncedSearch, kind, limit],
        queryFn: () => {
            const params = new URLSearchParams();
            if (folder && folder !== "all") params.set("folder", folder);
            if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
            if (kind && kind !== "all") params.set("kind", kind);
            params.set("limit", String(limit));
            return apiGet<{ items: MediaAsset[]; folders: string[]; total: number; limit: number; offset: number }>(
                `/admin/media?${params.toString()}`
            );
        },
        enabled: open,
    });

    const items = data?.items ?? [];

    // Pre-select assets matching selectedUrls if items are loaded
    useEffect(() => {
        if (open && items.length > 0 && selectedUrls.length > 0) {
            const matching = items.filter((it) => selectedUrls.includes(it.url));
            if (matching.length > 0) {
                setSelectedItems(matching);
                setFocusedAsset(matching[0]);
                setAltDraft(matching[0].alt || "");
            }
        }
    }, [open, items, selectedUrls]);

    // Update altDraft when focusedAsset changes
    useEffect(() => {
        if (focusedAsset) {
            setAltDraft(focusedAsset.alt || "");
        }
    }, [focusedAsset]);

    const handleSelectAsset = (asset: MediaAsset) => {
        setFocusedAsset(asset);
        if (mode === "single") {
            setSelectedItems([asset]);
        } else {
            const exists = selectedItems.some((it) => it.id === asset.id);
            if (exists) {
                setSelectedItems(selectedItems.filter((it) => it.id !== asset.id));
            } else {
                setSelectedItems([...selectedItems, asset]);
            }
        }
    };

    const isSelected = (assetId: string) => selectedItems.some((it) => it.id === assetId);

    const handleConfirmSelection = () => {
        if (selectedItems.length === 0) {
            toast.error("Please select at least one asset.");
            return;
        }
        onSelect(selectedItems);
        onOpenChange(false);
    };

    const handleQuickSaveAlt = async () => {
        if (!focusedAsset) return;
        if (!altDraft.trim()) {
            toast.error("Alt text cannot be empty.");
            return;
        }
        setIsSavingAlt(true);
        try {
            const updated = await apiPatch<MediaAsset>(`/admin/media/${focusedAsset.id}`, {
                alt: altDraft.trim(),
            });
            setFocusedAsset(updated);
            setSelectedItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
            void qc.invalidateQueries({ queryKey: ["admin", "media"] });
            toast.success("Alt text updated.");
        } catch (err) {
            toast.error("Failed to update alt text.");
        } finally {
            setIsSavingAlt(false);
        }
    };

    // Upload logic
    const handleFilesEnqueued = (files: FileList | File[]) => {
        const fileArr = Array.from(files);
        if (fileArr.length === 0) return;

        const newItems: UploadQueueItem[] = fileArr.map((f) => ({
            id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            file: f,
            status: "ready",
            previewUrl: URL.createObjectURL(f),
        }));

        if (mode === "single") {
            setUploadQueue([newItems[0]]);
        } else {
            setUploadQueue((prev) => [...prev, ...newItems]);
        }
    };

    const handleRemoveFromQueue = (id: string) => {
        setUploadQueue((prev) => {
            const target = prev.find((item) => item.id === id);
            if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
            return prev.filter((item) => item.id !== id);
        });
    };

    const handleBatchUpload = async () => {
        if (uploadQueue.length === 0) {
            toast.error("No files selected to upload.");
            return;
        }

        setIsUploadingBatch(true);
        const uploadedAssets: MediaAsset[] = [];

        for (let i = 0; i < uploadQueue.length; i++) {
            const qItem = uploadQueue[i];
            if (qItem.status === "done" && qItem.resultAsset) {
                uploadedAssets.push(qItem.resultAsset);
                continue;
            }

            setUploadQueue((prev) =>
                prev.map((item, idx) => (idx === i ? { ...item, status: "uploading" } : item))
            );

            try {
                const formData = new FormData();
                formData.append("file", qItem.file);
                formData.append("folder", uploadFolder || "general");
                formData.append("optimize", optimizeWebP ? "true" : "false");
                formData.append("auto_alt", "true");

                // If explicit alt text entered for single file, use it
                if (uploadAlt.trim()) {
                    formData.append("alt", uploadAlt.trim());
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
                uploadedAssets.push(asset);

                setUploadQueue((prev) =>
                    prev.map((item, idx) =>
                        idx === i ? { ...item, status: "done", resultAsset: asset } : item
                    )
                );
            } catch (err: any) {
                const msg = err.message || "Upload error";
                setUploadQueue((prev) =>
                    prev.map((item, idx) =>
                        idx === i ? { ...item, status: "error", errorMsg: msg } : item
                    )
                );
                toast.error(`Failed to upload ${qItem.file.name}: ${msg}`);
            }
        }

        setIsUploadingBatch(false);
        void qc.invalidateQueries({ queryKey: ["admin", "media"] });

        if (uploadedAssets.length > 0) {
            toast.success(`Successfully uploaded ${uploadedAssets.length} asset(s).`);
            // Automatically insert newly uploaded items
            onSelect(uploadedAssets);
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-4xl w-[94vw] h-[88vh] max-h-[850px] p-0 flex flex-col overflow-hidden bg-[var(--tnl-surface)] border border-[var(--tnl-border)] text-[var(--tnl-heading)] shadow-2xl rounded-2xl"
                data-testid="media-picker-modal"
            >
                {/* Header */}
                <DialogHeader className="px-5 py-4 border-b border-[var(--tnl-border)] flex flex-row items-center justify-between gap-4 shrink-0">
                    <div>
                        <DialogTitle className="text-base font-bold flex items-center gap-2">
                            <ImageIcon className="h-4 w-4 text-[var(--tnl-green)]" />
                            <span>Media Picker</span>
                            <span className="text-xs px-2 py-0.5 rounded-full font-normal bg-black/5 dark:bg-white/10 text-[var(--tnl-body)]">
                                {mode === "single" ? "Single select" : "Multi select"}
                            </span>
                        </DialogTitle>
                    </div>

                    {/* Tab Navigation */}
                    <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-1 rounded-lg">
                        <button
                            type="button"
                            onClick={() => setActiveTab("library")}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                                activeTab === "library"
                                    ? "bg-[var(--tnl-surface)] text-[var(--tnl-heading)] shadow-xs"
                                    : "text-[var(--tnl-body)] hover:text-[var(--tnl-heading)]"
                            }`}
                            data-testid="media-picker-tab-library"
                        >
                            Media Library
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab("upload")}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                                activeTab === "upload"
                                    ? "bg-[var(--tnl-surface)] text-[var(--tnl-heading)] shadow-xs"
                                    : "text-[var(--tnl-body)] hover:text-[var(--tnl-heading)]"
                            }`}
                            data-testid="media-picker-tab-upload"
                        >
                            Upload New
                        </button>
                    </div>
                </DialogHeader>

                {/* Tab 1: Media Library */}
                {activeTab === "library" && (
                    <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
                        {/* Main Grid View */}
                        <div className="flex-1 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-[var(--tnl-border)]">
                            {/* Toolbar */}
                            <div className="p-3 border-b border-[var(--tnl-border)] flex flex-wrap items-center gap-2 bg-black/[0.02] dark:bg-white/[0.02] shrink-0">
                                {/* Search */}
                                <div className="relative flex-1 min-w-[180px]">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
                                    <input
                                        type="text"
                                        placeholder="Search by filename or alt..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="tnl-field pl-8 h-8 text-xs py-1"
                                        data-testid="media-picker-search"
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchQuery("")}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>

                                {/* Folder Filter */}
                                <select
                                    value={folder}
                                    onChange={(e) => setFolder(e.target.value)}
                                    className="tnl-field h-8 text-xs py-1 w-36"
                                    data-testid="media-picker-folder"
                                >
                                    {FOLDERS.map((f) => (
                                        <option key={f.value} value={f.value}>
                                            {f.label}
                                        </option>
                                    ))}
                                </select>

                                {/* Kind Filter */}
                                <select
                                    value={kind}
                                    onChange={(e) => setKind(e.target.value)}
                                    className="tnl-field h-8 text-xs py-1 w-28"
                                    data-testid="media-picker-kind"
                                >
                                    <option value="all">All kinds</option>
                                    <option value="image">Images</option>
                                    <option value="document">Docs</option>
                                </select>

                                {/* Refresh Button */}
                                <button
                                    type="button"
                                    onClick={() => void refetch()}
                                    disabled={isRefetching}
                                    className="h-8 w-8 flex items-center justify-center rounded-md border border-[var(--tnl-border)] hover:bg-white/[0.05] transition-colors"
                                    title="Refresh library"
                                    data-testid="media-picker-refresh"
                                >
                                    <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
                                </button>
                            </div>

                            {/* Assets Grid */}
                            <div
                                className="flex-1 min-h-0 overflow-y-auto p-3"
                                data-testid="media-picker-grid"
                            >
                                {isLoading ? (
                                    <div className="h-full flex items-center justify-center">
                                        <Loader2 className="h-6 w-6 animate-spin text-[var(--tnl-green)]" />
                                    </div>
                                ) : items.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[var(--tnl-body)]">
                                        <Folder className="h-10 w-10 stroke-1 mb-2 text-white/30" />
                                        <p className="text-sm font-semibold">No media assets found</p>
                                        <p className="text-xs text-white/50 mt-1">
                                            Try adjusting your search terms or upload new assets.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                                        {items.map((asset) => {
                                            const active = isSelected(asset.id);
                                            const isImg = asset.kind === "image";
                                            return (
                                                <button
                                                    key={asset.id}
                                                    type="button"
                                                    onClick={() => handleSelectAsset(asset)}
                                                    className={`group relative flex flex-col rounded-xl overflow-hidden border text-left transition-all aspect-square bg-black/[0.04] dark:bg-white/[0.02] focus:outline-hidden ${
                                                        active
                                                            ? "ring-2 ring-[var(--tnl-green)] border-[var(--tnl-green)] shadow-md"
                                                            : "border-[var(--tnl-border)] hover:border-white/30"
                                                    }`}
                                                    data-testid={`media-item-${asset.id}`}
                                                >
                                                    {isImg ? (
                                                        <img
                                                            src={asset.webp_url || asset.url}
                                                            alt={asset.alt || asset.filename}
                                                            loading="lazy"
                                                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center">
                                                            {asset.filename.endsWith(".pdf") ? (
                                                                <FileText className="h-8 w-8 text-rose-500 mb-1" />
                                                            ) : asset.filename.endsWith(".pkt") || asset.filename.endsWith(".py") ? (
                                                                <FileCode className="h-8 w-8 text-amber-500 mb-1" />
                                                            ) : (
                                                                <FileIcon className="h-8 w-8 text-sky-500 mb-1" />
                                                            )}
                                                            <span className="text-[10px] font-mono truncate max-w-full px-1">
                                                                {asset.original_name || asset.filename}
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* Selection indicator checkmark */}
                                                    {active && (
                                                        <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-[var(--tnl-green)] text-white flex items-center justify-center shadow-xs">
                                                            <Check className="h-3.5 w-3.5 stroke-[3]" />
                                                        </div>
                                                    )}

                                                    {/* Bottom badge */}
                                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5 pt-4 text-white text-[9px] truncate">
                                                        <span className="font-semibold block truncate">
                                                            {asset.original_name || asset.filename}
                                                        </span>
                                                        <span className="text-white/70">
                                                            {asset.content_type?.split("/")[1]?.toUpperCase() || "FILE"} · {formatBytes(asset.size_bytes || asset.bytes)}
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Side Detail Pane */}
                        <div className="w-full lg:w-72 shrink-0 p-4 flex flex-col justify-between overflow-y-auto bg-black/[0.01] dark:bg-white/[0.01]">
                            {focusedAsset ? (
                                <div className="space-y-3">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--tnl-body)]">
                                        Asset Details
                                    </h3>

                                    {/* Preview container */}
                                    <div className="w-full aspect-video rounded-lg overflow-hidden border border-[var(--tnl-border)] bg-black/20 flex items-center justify-center">
                                        {focusedAsset.kind === "image" ? (
                                            <img
                                                src={focusedAsset.webp_url || focusedAsset.url}
                                                alt={focusedAsset.alt}
                                                className="w-full h-full object-contain"
                                            />
                                        ) : (
                                            <FileText className="h-10 w-10 text-white/50" />
                                        )}
                                    </div>

                                    {/* Metadata text */}
                                    <div className="text-xs space-y-1 text-[var(--tnl-body)]">
                                        <p className="font-semibold text-[var(--tnl-heading)] truncate" title={focusedAsset.original_name || focusedAsset.filename}>
                                            {focusedAsset.original_name || focusedAsset.filename}
                                        </p>
                                        <p>
                                            <strong>Folder:</strong> <span className="capitalize">{focusedAsset.folder}</span>
                                        </p>
                                        <p>
                                            <strong>Size:</strong> {formatBytes(focusedAsset.size_bytes || focusedAsset.bytes)}
                                        </p>
                                        {focusedAsset.width && focusedAsset.height && (
                                            <p>
                                                <strong>Dimensions:</strong> {focusedAsset.width} × {focusedAsset.height} px
                                            </p>
                                        )}
                                        {focusedAsset.used_in !== undefined && (
                                            <p>
                                                <strong>Used in:</strong> {focusedAsset.used_in} place(s)
                                            </p>
                                        )}
                                    </div>

                                    {/* Quick edit alt text */}
                                    <div className="space-y-1.5 pt-2 border-t border-[var(--tnl-border)]">
                                        <label className="text-[11px] font-semibold text-[var(--tnl-heading)] block">
                                            Alt text (screen readers):
                                        </label>
                                        <textarea
                                            value={altDraft}
                                            onChange={(e) => setAltDraft(e.target.value)}
                                            rows={2}
                                            className="tnl-field text-xs py-1.5"
                                            placeholder="Describe image..."
                                            data-testid="media-picker-alt-input"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleQuickSaveAlt}
                                            disabled={isSavingAlt || altDraft.trim() === focusedAsset.alt}
                                            className="tnl-btn tnl-btn-secondary text-[11px] py-1 px-2.5 h-auto w-full disabled:opacity-40"
                                            data-testid="media-picker-save-alt"
                                        >
                                            {isSavingAlt ? "Saving..." : "Update Alt Text"}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-40 flex items-center justify-center text-center text-xs text-[var(--tnl-body)]">
                                    Click an asset to view details and select it.
                                </div>
                            )}

                            {/* Insertion action footer */}
                            <div className="pt-4 border-t border-[var(--tnl-border)] mt-4">
                                <button
                                    type="button"
                                    onClick={handleConfirmSelection}
                                    disabled={selectedItems.length === 0}
                                    className="tnl-btn tnl-btn-primary w-full text-xs py-2 disabled:opacity-40"
                                    data-testid="media-picker-insert-button"
                                >
                                    {mode === "single"
                                        ? "Use Selected Image"
                                        : `Insert ${selectedItems.length} Selected`}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab 2: Upload New */}
                {activeTab === "upload" && (
                    <div className="flex-1 min-h-0 flex flex-col p-5 overflow-y-auto space-y-4">
                        {/* Drag and Drop Zone */}
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
                                if (e.dataTransfer.files) {
                                    handleFilesEnqueued(e.dataTransfer.files);
                                }
                            }}
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                                isDragging
                                    ? "border-[var(--tnl-green)] bg-[var(--tnl-green)]/10"
                                    : "border-[var(--tnl-border)] hover:border-white/40 bg-black/[0.01] dark:bg-white/[0.01]"
                            }`}
                            data-testid="media-picker-dropzone"
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple={mode === "multiple"}
                                accept={accept === "image" ? "image/*" : undefined}
                                onChange={(e) => {
                                    if (e.target.files) handleFilesEnqueued(e.target.files);
                                }}
                                className="hidden"
                                data-testid="media-picker-file-input"
                            />
                            <div className="h-12 w-12 rounded-full bg-[var(--tnl-green)]/10 flex items-center justify-center text-[var(--tnl-green)] mb-3">
                                <UploadCloud className="h-6 w-6" />
                            </div>
                            <p className="text-sm font-semibold text-[var(--tnl-heading)]">
                                Drop files here, or <span className="text-[var(--tnl-green)] underline">browse</span>
                            </p>
                            <p className="text-xs text-[var(--tnl-body)] mt-1">
                                JPG, PNG, WebP, GIF, or academic docs up to 10 MB.
                            </p>
                        </div>

                        {/* Upload Options */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-semibold block mb-1">Destination Folder</label>
                                <select
                                    value={uploadFolder}
                                    onChange={(e) => setUploadFolder(e.target.value)}
                                    className="tnl-field text-xs h-9"
                                    data-testid="media-picker-upload-folder"
                                >
                                    {FOLDERS.filter((f) => f.value !== "all").map((f) => (
                                        <option key={f.value} value={f.value}>
                                            {f.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-semibold block mb-1">Alt text (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="Leave blank to use clean filename"
                                    value={uploadAlt}
                                    onChange={(e) => setUploadAlt(e.target.value)}
                                    className="tnl-field text-xs h-9"
                                    data-testid="media-picker-upload-alt"
                                />
                            </div>
                        </div>

                        {/* Optimization checkbox */}
                        <label className="flex items-center gap-2.5 text-xs cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={optimizeWebP}
                                onChange={(e) => setOptimizeWebP(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-[var(--tnl-green)] focus:ring-[var(--tnl-green)]"
                                data-testid="media-picker-optimize-check"
                            />
                            <span>
                                <strong>Auto-optimize to WebP (recommended):</strong> Resizes camera photos to 1920px max and converts to light, crisp WebP.
                            </span>
                        </label>

                        {/* Queue list */}
                        {uploadQueue.length > 0 && (
                            <div className="space-y-2 pt-2 border-t border-[var(--tnl-border)]">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--tnl-body)]">
                                    Files to upload ({uploadQueue.length})
                                </h4>
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                    {uploadQueue.map((item) => (
                                        <div
                                            key={item.id}
                                            className="flex items-center justify-between p-2 rounded-lg border border-[var(--tnl-border)] text-xs bg-black/[0.02] dark:bg-white/[0.02]"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <img
                                                    src={item.previewUrl}
                                                    alt={item.file.name}
                                                    className="h-8 w-8 rounded object-cover border border-black/10 shrink-0"
                                                />
                                                <div className="min-w-0">
                                                    <p className="truncate font-medium">{item.file.name}</p>
                                                    <p className="text-[10px] text-[var(--tnl-body)]">
                                                        {formatBytes(item.file.size)}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {item.status === "uploading" && (
                                                    <span className="flex items-center gap-1 text-amber-500 text-[11px]">
                                                        <Loader2 className="h-3 w-3 animate-spin" /> Uploading...
                                                    </span>
                                                )}
                                                {item.status === "done" && (
                                                    <span className="flex items-center gap-1 text-[var(--tnl-green)] text-[11px] font-semibold">
                                                        <CheckCircle2 className="h-3.5 w-3.5" /> Ready
                                                    </span>
                                                )}
                                                {item.status === "error" && (
                                                    <span className="text-rose-500 text-[11px] truncate max-w-[150px]">
                                                        {item.errorMsg}
                                                    </span>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveFromQueue(item.id)}
                                                    className="text-white/40 hover:text-white p-1"
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Submit button */}
                        <div className="pt-3 flex justify-end">
                            <button
                                type="button"
                                onClick={handleBatchUpload}
                                disabled={isUploadingBatch || uploadQueue.length === 0}
                                className="tnl-btn tnl-btn-primary text-xs py-2 px-5 disabled:opacity-40"
                                data-testid="media-picker-upload-submit"
                            >
                                {isUploadingBatch ? (
                                    <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Uploading...
                                    </>
                                ) : (
                                    "Upload & Insert"
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
