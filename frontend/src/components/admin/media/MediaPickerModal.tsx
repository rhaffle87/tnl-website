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
import { AdminSelect, AdminSwitch } from "@/components/admin/controls";

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
].filter((f) => f.value !== "test");

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
                size="media"
                showCloseButton={false}
                className="bg-[var(--tnl-surface)] border border-[var(--tnl-border)] text-[var(--tnl-heading)] shadow-2xl rounded-2xl"
                data-testid="media-picker-modal"
            >
                {/* Zone 1 — single-row chrome: identity | tab switcher | explicit close */}
                <DialogHeader className="shrink-0 h-14 px-5 border-b border-[var(--tnl-border)] flex flex-row items-center justify-between gap-4 space-y-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <DialogTitle className="text-base font-bold flex items-center gap-2 whitespace-nowrap">
                            <ImageIcon className="h-4 w-4 shrink-0 text-[var(--tnl-green)]" />
                            <span>Media Library</span>
                        </DialogTitle>
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap border border-[var(--tnl-border)] bg-[var(--tnl-surface-2)] text-[var(--tnl-body)]">
                            {mode === "single" ? "Single select" : "Multi select"}
                        </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        {/* Tab Navigation */}
                        <div className="flex items-center gap-1 bg-[var(--tnl-surface-2)] border border-[var(--tnl-border)] p-1 rounded-lg">
                            <button
                                type="button"
                                onClick={() => setActiveTab("library")}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors ${
                                    activeTab === "library"
                                        ? "bg-[var(--tnl-surface)] text-[var(--tnl-heading)] shadow-xs"
                                        : "text-[var(--tnl-body)] hover:text-[var(--tnl-heading)]"
                                }`}
                                data-testid="media-picker-tab-library"
                            >
                                Browse Library
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab("upload")}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors ${
                                    activeTab === "upload"
                                        ? "bg-[var(--tnl-surface)] text-[var(--tnl-heading)] shadow-xs"
                                        : "text-[var(--tnl-body)] hover:text-[var(--tnl-heading)]"
                                }`}
                                data-testid="media-picker-tab-upload"
                            >
                                Upload New
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => onOpenChange(false)}
                            aria-label="Close media picker"
                            title="Close"
                            className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg border border-[var(--tnl-border)] text-[var(--tnl-body)] hover:text-[var(--tnl-heading)] hover:bg-[var(--tnl-surface-2)] transition-colors"
                            data-testid="media-picker-close"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </DialogHeader>

                {/* Zone 2 — Tab 1: browse library, two independently scrolling columns */}
                {activeTab === "library" && (
                    <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
                        {/* Left column — asset browser */}
                        <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-b md:border-b-0 md:border-r border-[var(--tnl-border)]">
                            {/* Filter toolbar — one row, wraps instead of collapsing into a column */}
                            <div className="shrink-0 px-5 py-3 border-b border-[var(--tnl-border)] flex flex-wrap items-center gap-2.5">
                                {/* Search */}
                                <div className="relative flex-1 min-w-[200px]">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--tnl-body)] opacity-60" />
                                    <input
                                        type="text"
                                        placeholder="Search by filename or alt..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="tnl-field pl-8 h-9 text-sm w-full"
                                        data-testid="media-picker-search"
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchQuery("")}
                                            aria-label="Clear search"
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--tnl-body)] hover:text-[var(--tnl-heading)]"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>

                                {/* Folder Filter */}
                                <AdminSelect
                                    value={folder}
                                    onChange={(e) => setFolder(e.target.value)}
                                    aria-label="Filter by folder"
                                    className="text-sm"
                                    wrapperClassName="w-40 shrink-0"
                                    data-testid="media-picker-folder"
                                >
                                    {FOLDERS.map((f) => (
                                        <option key={f.value} value={f.value}>
                                            {f.label}
                                        </option>
                                    ))}
                                </AdminSelect>

                                {/* Kind Filter */}
                                <AdminSelect
                                    value={kind}
                                    onChange={(e) => setKind(e.target.value)}
                                    aria-label="Filter by kind"
                                    className="text-sm"
                                    wrapperClassName="w-32 shrink-0"
                                    data-testid="media-picker-kind"
                                >
                                    <option value="all">All kinds</option>
                                    <option value="image">Images</option>
                                    <option value="document">Docs</option>
                                </AdminSelect>

                                {/* Refresh Button */}
                                <button
                                    type="button"
                                    onClick={() => void refetch()}
                                    disabled={isRefetching}
                                    className="h-9 w-9 flex items-center justify-center rounded-lg border border-[var(--tnl-border)] text-[var(--tnl-body)] hover:text-[var(--tnl-heading)] hover:bg-[var(--tnl-surface-2)] transition-colors"
                                    title="Refresh library"
                                    aria-label="Refresh library"
                                    data-testid="media-picker-refresh"
                                >
                                    <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
                                </button>
                            </div>

                            {/* Assets Grid */}
                            <div
                                className="flex-1 min-h-0 overflow-y-auto p-5"
                                data-testid="media-picker-grid"
                            >
                                {isLoading ? (
                                    <div className="h-full flex items-center justify-center">
                                        <Loader2 className="h-6 w-6 animate-spin text-[var(--tnl-green)]" />
                                    </div>
                                ) : items.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[var(--tnl-body)]">
                                        <Folder className="h-10 w-10 stroke-1 mb-2 opacity-40" />
                                        <p className="text-sm font-semibold">No media assets found</p>
                                        <p className="text-xs opacity-70 mt-1">
                                            Try adjusting your search terms or upload new assets.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-[repeat(auto-fill,minmax(144px,1fr))] gap-3.5">
                                        {items.map((asset) => {
                                            const active = isSelected(asset.id);
                                            const isImg = asset.kind === "image";
                                            const ext = (asset.content_type?.split("/")[1] || asset.filename.split(".").pop() || "file").toUpperCase();
                                            return (
                                                <button
                                                    key={asset.id}
                                                    type="button"
                                                    onClick={() => handleSelectAsset(asset)}
                                                    className={`group relative flex flex-col rounded-xl overflow-hidden border text-left transition-all bg-[var(--tnl-surface-2)] focus:outline-hidden ${
                                                        active
                                                            ? "ring-2 ring-[var(--tnl-green)] border-[var(--tnl-green)] shadow-md"
                                                            : "border-[var(--tnl-border)] hover:border-[var(--tnl-green)]/60"
                                                    }`}
                                                    data-testid={`media-item-${asset.id}`}
                                                >
                                                    <span className="relative block aspect-square w-full overflow-hidden">
                                                        {isImg ? (
                                                            <img
                                                                src={asset.webp_url || asset.url}
                                                                alt={asset.alt || asset.filename}
                                                                loading="lazy"
                                                                className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                            />
                                                        ) : (
                                                            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 text-center">
                                                                {asset.filename.endsWith(".pdf") ? (
                                                                    <FileText className="h-8 w-8 text-rose-500" />
                                                                ) : asset.filename.endsWith(".pkt") || asset.filename.endsWith(".py") ? (
                                                                    <FileCode className="h-8 w-8 text-amber-500" />
                                                                ) : (
                                                                    <FileIcon className="h-8 w-8 text-sky-500" />
                                                                )}
                                                                <span className="text-[10px] font-mono line-clamp-2 break-all">
                                                                    {asset.original_name || asset.filename}
                                                                </span>
                                                            </span>
                                                        )}

                                                        {/* Extension badge */}
                                                        <span className="absolute top-1.5 left-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-white backdrop-blur-xs">
                                                            {ext}
                                                        </span>

                                                        {/* Selection indicator */}
                                                        {active && (
                                                            <span className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-[var(--tnl-green)] text-white flex items-center justify-center shadow-xs">
                                                                <Check className="h-3.5 w-3.5 stroke-[3]" />
                                                            </span>
                                                        )}
                                                    </span>

                                                    {/* Card caption — readable, one line, never crushed */}
                                                    <span className="block w-full px-2.5 py-2 border-t border-[var(--tnl-border)]">
                                                        <span
                                                            className="block truncate text-[11px] font-medium text-[var(--tnl-heading)]"
                                                            title={asset.original_name || asset.filename}
                                                        >
                                                            {asset.original_name || asset.filename}
                                                        </span>
                                                        <span className="block text-[10px] text-[var(--tnl-body)] opacity-70">
                                                            {formatBytes(asset.size_bytes || asset.bytes)}
                                                        </span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right column — asset inspector */}
                        <div className="hidden md:flex w-[320px] shrink-0 border-l border-[var(--tnl-border)] bg-[var(--tnl-surface-2)] flex-col overflow-hidden">
                            {focusedAsset ? (
                                <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
                                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--tnl-body)]">
                                        Asset Details
                                    </h3>

                                    {/* Preview container — object-contain so nothing is cropped */}
                                    <div className="w-full aspect-[4/3] rounded-lg overflow-hidden border border-[var(--tnl-border)] bg-[var(--tnl-surface)] flex items-center justify-center">
                                        {focusedAsset.kind === "image" ? (
                                            <img
                                                src={focusedAsset.webp_url || focusedAsset.url}
                                                alt={focusedAsset.alt}
                                                className="w-full h-full object-contain"
                                            />
                                        ) : (
                                            <FileText className="h-10 w-10 text-[var(--tnl-body)] opacity-50" />
                                        )}
                                    </div>

                                    {/* Structured metadata */}
                                    <div className="text-xs space-y-2 text-[var(--tnl-body)]">
                                        <div>
                                            <span className="block text-[10px] uppercase tracking-wider opacity-60">Filename</span>
                                            <span
                                                className="block font-semibold text-[var(--tnl-heading)] break-all"
                                                title={focusedAsset.original_name || focusedAsset.filename}
                                            >
                                                {focusedAsset.original_name || focusedAsset.filename}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <span className="block text-[10px] uppercase tracking-wider opacity-60">Folder</span>
                                                <span className="capitalize">{focusedAsset.folder}</span>
                                            </div>
                                            <div>
                                                <span className="block text-[10px] uppercase tracking-wider opacity-60">Size</span>
                                                <span>{formatBytes(focusedAsset.size_bytes || focusedAsset.bytes)}</span>
                                            </div>
                                            {focusedAsset.width && focusedAsset.height && (
                                                <div>
                                                    <span className="block text-[10px] uppercase tracking-wider opacity-60">Dimensions</span>
                                                    <span>{focusedAsset.width} × {focusedAsset.height} px</span>
                                                </div>
                                            )}
                                            {focusedAsset.used_in !== undefined && (
                                                <div>
                                                    <span className="block text-[10px] uppercase tracking-wider opacity-60">Used in</span>
                                                    <span>{focusedAsset.used_in} place(s)</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Accessibility: alt text */}
                                    <div className="space-y-2 pt-3 border-t border-[var(--tnl-border)]">
                                        <label
                                            htmlFor="media-picker-alt"
                                            className="text-[11px] font-semibold text-[var(--tnl-heading)] block"
                                        >
                                            Alt text (screen readers)
                                        </label>
                                        <textarea
                                            id="media-picker-alt"
                                            value={altDraft}
                                            onChange={(e) => setAltDraft(e.target.value)}
                                            rows={3}
                                            className="tnl-field font-sans text-sm w-full"
                                            placeholder="Describe this asset for screen readers..."
                                            data-testid="media-picker-alt-input"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleQuickSaveAlt}
                                            disabled={isSavingAlt || altDraft.trim() === focusedAsset.alt}
                                            className="tnl-btn tnl-btn-secondary text-xs py-2 w-full disabled:opacity-40"
                                            data-testid="media-picker-save-alt"
                                        >
                                            {isSavingAlt ? "Saving..." : "Save Alt Text"}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
                                    <ImageIcon className="h-8 w-8 text-[var(--tnl-body)] opacity-30" />
                                    <p className="text-xs text-[var(--tnl-body)]">
                                        Select an asset to view details
                                    </p>
                                </div>
                            )}
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
                                    : "border-[var(--tnl-border)] hover:border-[var(--tnl-green)]/60 bg-[var(--tnl-surface-2)]"
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
                                <AdminSelect
                                    value={uploadFolder}
                                    onChange={(e) => setUploadFolder(e.target.value)}
                                    className="text-xs"
                                    data-testid="media-picker-upload-folder"
                                >
                                    {FOLDERS.filter((f) => f.value !== "all").map((f) => (
                                        <option key={f.value} value={f.value}>
                                            {f.label}
                                        </option>
                                    ))}
                                </AdminSelect>
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

                        {/* Optimization toggle — house switch, not a raw checkbox */}
                        <AdminSwitch
                            label="Auto-optimize to WebP (recommended)"
                            description="Resizes camera photos to 1920px max and converts to light, crisp WebP."
                            checked={optimizeWebP}
                            onCheckedChange={setOptimizeWebP}
                            testId="media-picker-optimize-check"
                        />

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
                                                    aria-label={`Remove ${item.file.name} from queue`}
                                                    className="p-1 text-[var(--tnl-body)] hover:text-[var(--tnl-heading)]"
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>
                )}

                {/* Zone 3 — sticky modal footer: summary | Cancel | primary action */}
                <div className="shrink-0 px-5 py-3 border-t border-[var(--tnl-border)] bg-[var(--tnl-surface)] flex flex-wrap items-center justify-between gap-3">
                    <p
                        className="text-xs text-[var(--tnl-body)] min-w-0 truncate"
                        data-testid="media-picker-summary"
                    >
                        {activeTab === "library"
                            ? mode === "single"
                                ? selectedItems[0]
                                    ? `Selected: ${selectedItems[0].original_name || selectedItems[0].filename} · ${formatBytes(selectedItems[0].size_bytes || selectedItems[0].bytes)}`
                                    : "Nothing selected yet"
                                : `${selectedItems.length} asset(s) selected`
                            : `${uploadQueue.length} file(s) queued`}
                    </p>

                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => onOpenChange(false)}
                            className="tnl-btn tnl-btn-secondary text-xs py-2 px-4"
                            data-testid="media-picker-cancel"
                        >
                            Cancel
                        </button>

                        {activeTab === "library" ? (
                            <button
                                type="button"
                                onClick={handleConfirmSelection}
                                disabled={selectedItems.length === 0}
                                className="tnl-btn tnl-btn-primary text-xs py-2 px-5 disabled:opacity-40"
                                data-testid="media-picker-insert-button"
                            >
                                {mode === "single"
                                    ? "Use Selected Image"
                                    : `Insert ${selectedItems.length} Images`}
                            </button>
                        ) : (
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
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
