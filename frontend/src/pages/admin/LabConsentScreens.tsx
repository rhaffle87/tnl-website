// Lab photos + publication import — the two admin screens that keep real content flowing in.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Camera, Check, Download, ImageOff, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAdminT } from "@/lib/i18n/admin-i18n";
import { apiDelete, apiGet, apiPost } from "@/lib/api/api";
import { AdminCard, AdminPageHeader, AdminStatusBadge, AdminSwitch, adminError } from "@/pages/admin/AdminUI";
import { Spinner } from "@/components/site/Primitives";
import type { CrossrefHit, CrossrefSearch, ImportResult, LabPhotoSlot, LabPhotoSlots } from "@/lib/types/types";

// Small local form primitives: AdminUI exports a value/onChange Field, these wrap arbitrary
// controls (file inputs, numeric boxes) so the labels stay consistent with the rest of the CMS.
function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--tnl-body)]">{label}</span>
            {children}
        </label>
    );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
    return (
        <tr>
            <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-[var(--tnl-body)]">
                {label}
            </td>
        </tr>
    );
}

// ---------------------------------------------------------------- lab photos
function SlotCard({ slot, onChanged }: { slot: LabPhotoSlot; onChanged: () => void }) {
    const t = useAdminT();
    const [file, setFile] = useState<File | null>(null);
    const [alt, setAlt] = useState("");
    const [busy, setBusy] = useState(false);

    const upload = async () => {
        if (!file) {
            toast.error(t("adminPagesChoosePhoto"));
            return;
        }
        if (!alt.trim()) {
            toast.error(t("adminPagesDescribePhoto"));
            return;
        }
        setBusy(true);
        const body = new FormData();
        body.append("file", file);
        body.append("alt", alt.trim());
        const res = await fetch(`/api/admin/lab-photos/${slot.id}`, { method: "POST", body });
        setBusy(false);
        if (!res.ok) {
            const err = (await res.json().catch(() => null)) as { detail?: string } | null;
            toast.error(err?.detail ?? t("adminPagesUploadPhotoError"));
            return;
        }
        setFile(null);
        setAlt("");
        onChanged();
        toast.success(`${slot.label} ${t("adminPagesPhotoUploadedSuffix")}`);
    };

    const clear = useMutation({
        mutationFn: () => apiDelete<{ ok: boolean }>(`/admin/lab-photos/${slot.id}`),
        onSuccess: () => {
            onChanged();
            toast.success(t("adminPagesPhotoRemoved"));
        },
        onError: (err) => toast.error(adminError(err, t("adminPagesClearSlotError"))),
    });

    return (
        <AdminCard className="p-4 sm:p-4" testId={`lab-photo-slot-${slot.id}`}>
            <div className="flex items-start gap-4">
                <div className="h-24 w-32 shrink-0 overflow-hidden rounded-xl bg-[var(--tnl-surface-2)]">
                    {slot.url ? (
                        <img src={slot.url} alt={slot.alt ?? slot.label} className="h-full w-full object-cover" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-[var(--tnl-body)]">
                            <ImageOff className="h-6 w-6" aria-hidden="true" />
                        </div>
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold" data-testid={`lab-photo-label-${slot.id}`}>{slot.label}</h3>
                        {slot.is_illustrative ? (
                            <AdminStatusBadge variant="warning" testId={`lab-photo-illustrative-${slot.id}`}>
                                {t("adminPagesStockPhoto")}
                            </AdminStatusBadge>
                        ) : slot.has_photo ? (
                            <AdminStatusBadge variant="published" testId={`lab-photo-real-${slot.id}`}>
                                <Check className="h-3 w-3" aria-hidden="true" /> {t("adminPagesYourPhoto")}
                            </AdminStatusBadge>
                        ) : (
                            <AdminStatusBadge variant="neutral">{t("adminPagesEmptyPhoto")}</AdminStatusBadge>
                        )}
                    </div>
                    <p className="mt-1 text-xs text-[var(--tnl-body)]">{slot.hint}</p>
                    {slot.alt ? <p className="mt-1 truncate text-xs italic text-[var(--tnl-body)]">{slot.alt}</p> : null}
                </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
                <Labelled label={t("adminPagesPhoto")}>
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        className="w-full text-sm"
                        data-testid={`lab-photo-file-${slot.id}`}
                    />
                </Labelled>
                <Labelled label={t("adminPagesPhotoDescriptionLabel")}>
                    <input
                        value={alt}
                        onChange={(e) => setAlt(e.target.value)}
                        placeholder={t("adminPagesPhotoPlaceholder")}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        data-testid={`lab-photo-alt-${slot.id}`}
                    />
                </Labelled>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => void upload()}
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-lg bg-[var(--tnl-green)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        data-testid={`lab-photo-upload-${slot.id}`}
                    >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
                        {t("adminReplace")}
                    </button>
                    {slot.has_photo ? (
                        <button
                            type="button"
                            onClick={() => clear.mutate()}
                            className="rounded-lg border px-3 py-2 text-sm text-[var(--tnl-body)] hover:bg-[var(--tnl-surface-2)]"
                            aria-label={`${t("adminClear")} ${slot.label}`}
                            data-testid={`lab-photo-clear-${slot.id}`}
                        >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                    ) : null}
                </div>
            </div>
        </AdminCard>
    );
}

export function LabPhotosPage() {
    const t = useAdminT();
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ["admin", "lab-photos"],
        queryFn: () => apiGet<LabPhotoSlots>("/admin/lab-photos"),
        retry: false,
    });
    const { data: storage, error: storageError } = useQuery({
        queryKey: ["admin", "lab-photos", "storage"],
        queryFn: () => apiGet<{ backend: string; media_dir: string }>("/admin/lab-photos/storage"),
        retry: false,
    });
    const refresh = () => {
        void qc.invalidateQueries({ queryKey: ["admin", "lab-photos"] });
        void qc.invalidateQueries({ queryKey: ["page", "home"] });
    };

    return (
        <div data-testid="lab-photos-page">
            <AdminPageHeader
                title={t("adminPagesLabPhotos")}
                description={t("adminPagesLabPhotosDescription")}
            />
            {storage ? (
                <AdminCard className="mb-4 p-3 sm:p-3 text-xs flex flex-wrap items-center gap-4" testId="lab-photos-storage-info">
                    <span className="font-semibold text-[var(--tnl-heading)]">{t("adminLabPhotosStorage")}:</span>
                    <span>
                        {t("adminLabPhotosStorageBackend")}: <code className="font-mono">{storage.backend}</code>
                    </span>
                    <span>
                        {t("adminLabPhotosStorageDir")}: <code className="font-mono break-all">{storage.media_dir}</code>
                    </span>
                </AdminCard>
            ) : storageError ? (
                <p role="alert" className="mb-4 text-xs text-[var(--tnl-danger)]" data-testid="lab-photos-storage-error">
                    {t("adminLabPhotosStorageError")}
                </p>
            ) : null}
            {data && data.illustrative_count > 0 ? (
                <div
                    className="mb-5 rounded-xl border border-[color-mix(in_srgb,var(--tnl-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--tnl-warning)_12%,transparent)] px-4 py-3 text-sm text-[var(--tnl-warning)]"
                    data-testid="lab-photos-stock-warning"
                >
                    <strong>{data.illustrative_count}</strong> {t(data.illustrative_count === 1 ? "adminPagesStockSlotSingular" : "adminPagesStockSlotPlural")} {t("adminPagesStockWarning")}
                </div>
            ) : null}
            {isLoading ? (
                <Spinner label={t("adminPagesLoadingPhotoSlots")} />
            ) : (
                <div className="grid gap-4">
                    {(data?.slots ?? []).map((slot: LabPhotoSlot) => (
                        <SlotCard key={slot.id} slot={slot} onChanged={refresh} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------- publication import
export function PublicationImportPage() {
    const t = useAdminT();
    const qc = useQueryClient();
    const [author, setAuthor] = useState("Achmad Affandi");
    const [q, setQ] = useState("");
    const [yearFrom, setYearFrom] = useState("2023");
    const [hits, setHits] = useState<CrossrefHit[] | null>(null);
    const [picked, setPicked] = useState<Record<string, boolean>>({});

    const search = useMutation({
        mutationFn: () => {
            const params = new URLSearchParams();
            if (q.trim()) params.set("q", q.trim());
            if (author.trim()) params.set("author", author.trim());
            if (yearFrom.trim()) params.set("year_from", yearFrom.trim());
            return apiGet<CrossrefSearch>(`/admin/publications/search?${params.toString()}`);
        },
        onSuccess: (data) => {
            setHits(data.items);
            setPicked({});
            if (!data.items.length) toast.info(t("adminPagesNoPapersToast"));
        },
        onError: (err) => toast.error(adminError(err, t("adminPagesSearchPapersError"))),
    });

    const doImport = useMutation({
        mutationFn: () =>
            apiPost<ImportResult>("/admin/publications/import", {
                dois: Object.keys(picked).filter((d) => picked[d]),
            }),
        onSuccess: (res) => {
            const summary = [`${res.imported.length} ${t("adminPagesImportedSummary")}`];
            if (res.duplicates.length) summary.push(`${res.duplicates.length} ${t("adminPagesDuplicateSummary")}`);
            if (res.failed.length) summary.push(`${res.failed.length} ${t("adminPagesFailedSummary")}`);
            toast.success(summary.join(", "));
            setPicked({});
            void search.mutateAsync().catch(() => undefined);
            void qc.invalidateQueries({ queryKey: ["admin", "content", "publications"] });
        },
        onError: (err) => toast.error(adminError(err, t("adminPagesImportPapersError"))),
    });

    const selectedCount = Object.values(picked).filter(Boolean).length;

    return (
        <div data-testid="publication-import-page">
            <AdminPageHeader
                title={t("adminPagesImportPublications")}
                description={t("adminPagesImportDescription")}
            />

            <AdminCard className="mb-4 p-4 sm:p-4 text-sm" testId="import-source-note">
                {t("adminPagesImportSourcePrefix")}<strong>Crossref</strong>{t("adminPagesImportSourceBody")}<strong>{t("adminPagesImportDrafts")}</strong>{t("adminPagesImportSourceSuffix")}
            </AdminCard>

            <AdminCard className="grid gap-3 p-4 sm:p-4 sm:grid-cols-[1.2fr_1.2fr_0.6fr_auto] sm:items-end">
                <Labelled label={t("adminPagesAuthorName")}>
                    <input
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        placeholder="Achmad Affandi"
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        data-testid="import-author-input"
                    />
                </Labelled>
                <Labelled label={t("adminPagesTitleKeyword")}>
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder={t("adminPagesKeywordPlaceholder")}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        data-testid="import-query-input"
                    />
                </Labelled>
                <Labelled label={t("adminPagesPublishedFrom")}>
                    <input
                        value={yearFrom}
                        onChange={(e) => setYearFrom(e.target.value)}
                        inputMode="numeric"
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        data-testid="import-year-input"
                    />
                </Labelled>
                <button
                    type="button"
                    onClick={() => search.mutate()}
                    disabled={search.isPending}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--tnl-green)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    data-testid="import-search-button"
                >
                    {search.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
                    {t("adminSearch")}
                </button>
            </AdminCard>

            {hits ? (
                <div className="mt-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-[var(--tnl-body)]" data-testid="import-result-count">
                            {hits.length} {t(hits.length === 1 ? "adminPagesPaperSingular" : "adminPagesPaperPlural")} {t("adminPagesFound")}
                        </p>
                        <button
                            type="button"
                            onClick={() => doImport.mutate()}
                            disabled={!selectedCount || doImport.isPending}
                            className="inline-flex items-center gap-2 rounded-lg bg-[var(--tnl-green)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            data-testid="import-selected-button"
                        >
                            {doImport.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                                <Download className="h-4 w-4" aria-hidden="true" />
                            )}
                            {t("adminImport")} {selectedCount || ""} {t("adminPagesAsDraft")}
                        </button>
                    </div>

                    <AdminCard className="overflow-hidden p-0 sm:p-0">
                        <table className="w-full text-sm">
                            <thead className="bg-[var(--tnl-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--tnl-body)]">
                                <tr>
                                    <th className="w-10 px-4 py-3" />
                                    <th className="px-4 py-3">{t("adminPagesPaperColumn")}</th>
                                    <th className="w-24 px-4 py-3">{t("adminPagesYearColumn")}</th>
                                    <th className="w-28 px-4 py-3">{t("adminPagesKindColumn")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {hits.length === 0 ? (
                                    <EmptyRow colSpan={4} label={t("adminPagesNoPapers")} />
                                ) : (
                                    hits.map((hit) => (
                                        <tr key={hit.doi} className="border-t" data-testid={`import-row-${hit.doi}`}>
                                            <td className="px-4 py-3 align-top">
                                                <AdminSwitch
                                                    label={`${t("adminPagesSelectPaper")} ${hit.title}`}
                                                    labelHidden
                                                    checked={Boolean(picked[hit.doi])}
                                                    disabled={hit.already_imported}
                                                    onCheckedChange={(next) => setPicked((p) => ({ ...p, [hit.doi]: next }))}
                                                    testId={`import-check-${hit.doi}`}
                                                />
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <p className="font-medium leading-snug">{hit.title}</p>
                                                <p className="mt-0.5 text-xs text-[var(--tnl-body)]">{hit.authors || t("adminPagesAuthorsMissing")}</p>
                                                <p className="text-xs text-[var(--tnl-body)]">{hit.venue}</p>
                                                <a
                                                    href={`https://doi.org/${hit.doi}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="mt-1 inline-block text-xs font-medium text-sky-700 underline"
                                                >
                                                    DOI {hit.doi}
                                                </a>
                                                {hit.already_imported ? (
                                                    <AdminStatusBadge variant="neutral" testId={`import-already-${hit.doi}`} className="ml-2">
                                                        {t("adminPagesAlreadyImported")}
                                                    </AdminStatusBadge>
                                                ) : null}
                                            </td>
                                            <td className="px-4 py-3 align-top">{hit.year ?? "—"}</td>
                                            <td className="px-4 py-3 align-top capitalize">{hit.ptype}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </AdminCard>
                </div>
            ) : (
                <AdminCard className="mt-6 flex items-center gap-3 px-5 py-8 text-sm">
                    <BookOpen className="h-5 w-5" aria-hidden="true" />
                    {t("adminPagesSearchPrompt")}
                </AdminCard>
            )}
        </div>
    );
}
