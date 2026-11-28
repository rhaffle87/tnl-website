import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/api";
import { useAdminT } from "@/lib/i18n/admin-i18n";
import { AdminErrorBanner, AdminPageHeader, AdminSectionHeader, ConfirmButton, Panel, adminError } from "@/pages/admin/AdminUI";
import { Spinner } from "@/components/site/Primitives";
import type { MediaAsset } from "@/lib/types/types";

export function MediaLibrary() {
    const t = useAdminT();
    const qc = useQueryClient();
    const [alt, setAlt] = useState("");
    const [folder, setFolder] = useState("general");
    const [file, setFile] = useState<File | null>(null);
    const [videoUrl, setVideoUrl] = useState("");
    const [search, setSearch] = useState("");

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["admin", "media", search],
        queryFn: () => apiGet<{ items: MediaAsset[]; folders: string[] }>(`/admin/media${search ? `?q=${encodeURIComponent(search)}` : ""}`),
        retry: false,
    });

    const refresh = () => void qc.invalidateQueries({ queryKey: ["admin", "media"] });

    const upload = async () => {
        if (!file || !alt.trim()) {
            toast.error(t("adminMediaLibNeedFileAndAlt"));
            return;
        }
        const body = new FormData();
        body.append("file", file);
        body.append("alt", alt.trim());
        body.append("folder", folder || "general");
        const res = await fetch("/api/admin/media", { method: "POST", body });
        if (!res.ok) {
            const err = (await res.json().catch(() => null)) as { detail?: string } | null;
            toast.error(err?.detail ?? t("adminUploadFailed"));
            return;
        }
        setFile(null);
        setAlt("");
        refresh();
        toast.success(t("adminMediaLibUploaded"));
    };

    const addVideo = useMutation({
        mutationFn: () => apiPost<MediaAsset>("/admin/media/video", { url: videoUrl, alt: alt.trim() || t("adminVideo"), folder: "video" }),
        onSuccess: () => {
            setVideoUrl("");
            refresh();
            toast.success(t("adminMediaLibVideoAdded"));
        },
        onError: (err) => toast.error(adminError(err, t("adminMediaLibVideoError"))),
    });

    const remove = useMutation({
        mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/admin/media/${id}`),
        onSuccess: () => {
            refresh();
            toast.success(t("adminMediaLibDeleted"));
        },
        onError: (err) => toast.error(adminError(err, t("adminMediaLibDeleteError"))),
    });

    const items = data?.items ?? [];

    return (
        <div data-testid="media-library-page">
            <AdminPageHeader
                title={t("adminMediaLibTitle")}
                description={t("adminMediaLibDescription")}
                testId="media-header"
            />

            <Panel className="mb-6">
                <AdminSectionHeader title={t("adminMediaLibUploadHeading")} />
                <div className="mt-3 grid gap-3 lg:grid-cols-4">
                    <input type="file" className="tnl-field pt-3" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label={t("adminMediaLibChooseFile")} data-testid="media-file-input" />
                    <input className="tnl-field" placeholder={t("adminMediaLibWhatShows")} value={alt} onChange={(e) => setAlt(e.target.value)} aria-label={t("adminAltText")} data-testid="media-alt-input" />
                    <input className="tnl-field" placeholder={t("adminMediaLibFolderPlaceholder")} value={folder} onChange={(e) => setFolder(e.target.value)} aria-label={t("adminFolder")} data-testid="media-folder-input" />
                    <button type="button" onClick={upload} className="tnl-btn tnl-btn-primary" data-testid="media-upload-button">
                        <Upload className="h-4 w-4" aria-hidden="true" />
                        {t("adminUpload")}
                    </button>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                    <input className="tnl-field" placeholder={t("adminMediaLibYoutubePlaceholder")} value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} aria-label="YouTube link" data-testid="media-video-input" />
                    <button type="button" onClick={() => addVideo.mutate()} className="tnl-btn tnl-btn-outline" disabled={!videoUrl.trim()} data-testid="media-video-add-button">
                        {t("adminMediaLibAddVideo")}
                    </button>
                </div>
            </Panel>

            <input type="search" className="tnl-field mb-4 sm:max-w-sm" placeholder={t("adminMediaLibSearchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t("adminMediaLibSearchLabel")} data-testid="media-search-input" />

            {error ? (
                <AdminErrorBanner
                    message={adminError(error, t("adminMediaLibLoadError"))}
                    onRetry={() => void refetch()}
                />
            ) : isLoading ? (
                <Spinner label={t("adminLoading")} />
            ) : items.length === 0 ? (
                <Panel>
                    <p className="text-sm text-[var(--tnl-body)]" data-testid="media-empty">{t("adminMediaEmpty")}</p>
                </Panel>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {items.map((asset) => (
                        <Panel key={asset.id} className="p-4">
                            {asset.kind === "image" ? (
                                <img src={asset.url} alt={asset.alt} className="h-32 w-full rounded-[8px] object-cover" loading="lazy" />
                            ) : (
                                <div className="flex h-32 items-center justify-center rounded-[8px]" style={{ background: "var(--tnl-surface)" }}>
                                    <span className="text-xs font-semibold">{asset.kind}</span>
                                </div>
                            )}
                            <p className="mt-3 truncate text-sm font-medium" title={asset.filename}>{asset.filename}</p>
                            <p className="mt-1 text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                                {t("adminMediaLibUsedIn").replace("{count}", String(asset.used_in ?? 0))}
                            </p>
                            <input
                                className="tnl-field mt-2 h-10 text-sm"
                                defaultValue={asset.alt}
                                onBlur={(e) => {
                                    if (e.target.value !== asset.alt) {
                                        void apiPatch(`/admin/media/${asset.id}`, { alt: e.target.value })
                                            .then(() => {
                                                refresh();
                                                toast.success(t("adminMediaLibAltUpdated"));
                                            })
                                            .catch((err) => toast.error(adminError(err, t("adminMediaLibAltUpdateError"))));
                                    }
                                }}
                                aria-label={t("adminAltText")}
                                data-testid={`media-alt-${asset.id}`}
                            />
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={async () => {
                                        try {
                                            await navigator.clipboard.writeText(asset.url);
                                            toast.success(t("adminMediaLibLinkCopied"));
                                        } catch {
                                            toast.error(t("adminMediaLibLinkCopyError"));
                                        }
                                    }}
                                    aria-label={t("adminMediaLibCopyAria").replace("{name}", asset.filename)}
                                    className="rounded-[6px] border px-3 py-1.5 text-xs font-medium"
                                    style={{ borderColor: "var(--tnl-border)" }}
                                    data-testid={`media-copy-${asset.id}`}
                                >
                                    {t("adminMediaLibCopyLink")}
                                </button>
                                <ConfirmButton label={t("adminDelete")} confirmLabel={t("adminMediaLibDeleteConfirm")} question={t("adminMediaLibDeleteQuestion")} onConfirm={() => remove.mutate(asset.id)} testId={`media-delete-${asset.id}`} />
                            </div>
                        </Panel>
                    ))}
                </div>
            )}
        </div>
    );
}
