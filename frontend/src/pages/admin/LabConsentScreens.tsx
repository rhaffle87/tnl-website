// Lab photos + publication import — the two admin screens that keep real content flowing in.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Camera, Check, Download, ImageOff, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { AdminHeader, adminError } from "@/pages/admin/AdminUI";
import { Spinner } from "@/components/site/Primitives";
import type { CrossrefHit, CrossrefSearch, ImportResult, LabPhotoSlot, LabPhotoSlots } from "@/lib/types";

// Small local form primitives: AdminUI exports a value/onChange Field, these wrap arbitrary
// controls (file inputs, numeric boxes) so the labels stay consistent with the rest of the CMS.
function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
            {children}
        </label>
    );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
    return (
        <tr>
            <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-slate-500">
                {label}
            </td>
        </tr>
    );
}

// ---------------------------------------------------------------- lab photos
function SlotCard({ slot, onChanged }: { slot: LabPhotoSlot; onChanged: () => void }) {
    const [file, setFile] = useState<File | null>(null);
    const [alt, setAlt] = useState("");
    const [busy, setBusy] = useState(false);

    const upload = async () => {
        if (!file) {
            toast.error("Choose a photo first.");
            return;
        }
        if (!alt.trim()) {
            toast.error("Describe what the photo shows — it is read aloud to visitors using a screen reader.");
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
            toast.error(err?.detail ?? "Could not upload that photo.");
            return;
        }
        setFile(null);
        setAlt("");
        onChanged();
        toast.success(`${slot.label} now shows your photo.`);
    };

    const clear = useMutation({
        mutationFn: () => apiDelete<{ ok: boolean }>(`/admin/lab-photos/${slot.id}`),
        onSuccess: () => {
            onChanged();
            toast.success("Photo removed from this slot.");
        },
        onError: (err) => toast.error(adminError(err, "Could not clear this slot.")),
    });

    return (
        <div className="rounded-2xl border bg-white p-4" data-testid={`lab-photo-slot-${slot.id}`}>
            <div className="flex items-start gap-4">
                <div className="h-24 w-32 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                    {slot.url ? (
                        <img src={slot.url} alt={slot.alt ?? slot.label} className="h-full w-full object-cover" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                            <ImageOff className="h-6 w-6" aria-hidden="true" />
                        </div>
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold" data-testid={`lab-photo-label-${slot.id}`}>{slot.label}</h3>
                        {slot.is_illustrative ? (
                            <span
                                className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800"
                                data-testid={`lab-photo-illustrative-${slot.id}`}
                            >
                                Stock photo
                            </span>
                        ) : slot.has_photo ? (
                            <span
                                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800"
                                data-testid={`lab-photo-real-${slot.id}`}
                            >
                                <Check className="h-3 w-3" aria-hidden="true" /> Your photo
                            </span>
                        ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">Empty</span>
                        )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{slot.hint}</p>
                    {slot.alt ? <p className="mt-1 truncate text-xs italic text-slate-400">{slot.alt}</p> : null}
                </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
                <Labelled label="Photo">
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        className="w-full text-sm"
                        data-testid={`lab-photo-file-${slot.id}`}
                    />
                </Labelled>
                <Labelled label="What does it show?">
                    <input
                        value={alt}
                        onChange={(e) => setAlt(e.target.value)}
                        placeholder="Students configuring routers in Room B-301"
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        data-testid={`lab-photo-alt-${slot.id}`}
                    />
                </Labelled>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => void upload()}
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        data-testid={`lab-photo-upload-${slot.id}`}
                    >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
                        Replace
                    </button>
                    {slot.has_photo ? (
                        <button
                            type="button"
                            onClick={() => clear.mutate()}
                            className="rounded-lg border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                            aria-label={`Clear ${slot.label}`}
                            data-testid={`lab-photo-clear-${slot.id}`}
                        >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

export function LabPhotosPage() {
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ["admin", "lab-photos"],
        queryFn: () => apiGet<LabPhotoSlots>("/admin/lab-photos"),
        retry: false,
    });
    const refresh = () => {
        void qc.invalidateQueries({ queryKey: ["admin", "lab-photos"] });
        void qc.invalidateQueries({ queryKey: ["page", "home"] });
    };

    return (
        <div data-testid="lab-photos-page">
            <AdminHeader
                title="Lab photos"
                help="Replace the stock networking imagery with your own photographs of Room B-301."
            />
            {data && data.illustrative_count > 0 ? (
                <div
                    className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                    data-testid="lab-photos-stock-warning"
                >
                    <strong>{data.illustrative_count}</strong> {data.illustrative_count === 1 ? "slot still shows" : "slots still show"} a stock
                    photo, captioned on the site as “not a photo of Room B-301”. Upload a real photo and that caption disappears
                    automatically.
                </div>
            ) : null}
            {isLoading ? (
                <Spinner label="Loading photo slots…" />
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
            if (!data.items.length) toast.info("No papers matched. Try a different name or keyword.");
        },
        onError: (err) => toast.error(adminError(err, "Could not search for papers.")),
    });

    const doImport = useMutation({
        mutationFn: () =>
            apiPost<ImportResult>("/admin/publications/import", {
                dois: Object.keys(picked).filter((d) => picked[d]),
            }),
        onSuccess: (res) => {
            toast.success(res.message);
            setPicked({});
            void search.mutateAsync().catch(() => undefined);
            void qc.invalidateQueries({ queryKey: ["admin", "content", "publications"] });
        },
        onError: (err) => toast.error(adminError(err, "Could not import those papers.")),
    });

    const selectedCount = Object.values(picked).filter(Boolean).length;

    return (
        <div data-testid="publication-import-page">
            <AdminHeader
                title="Import publications"
                help="Search Crossref by author or title and bring papers in with their confirmed DOI — no typing."
            />

            <div className="mb-4 rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-600" data-testid="import-source-note">
                Papers are read from <strong>Crossref</strong>, the registry that issues DOIs. SINTA blocks automated access and Google
                Scholar has no public API, so neither can be read directly — but almost everything indexed there (IEEE, Elsevier,
                Springer, Sewagati, Jurnal RESTI) is registered with Crossref. Imports arrive as <strong>drafts</strong> for you to check
                before they appear on the site.
            </div>

            <div className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-[1.2fr_1.2fr_0.6fr_auto] sm:items-end">
                <Labelled label="Author name">
                    <input
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        placeholder="Achmad Affandi"
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        data-testid="import-author-input"
                    />
                </Labelled>
                <Labelled label="Title or keyword (optional)">
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="underwater acoustic network"
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        data-testid="import-query-input"
                    />
                </Labelled>
                <Labelled label="Published from">
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
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    data-testid="import-search-button"
                >
                    {search.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
                    Search
                </button>
            </div>

            {hits ? (
                <div className="mt-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-slate-600" data-testid="import-result-count">
                            {hits.length} {hits.length === 1 ? "paper" : "papers"} found
                        </p>
                        <button
                            type="button"
                            onClick={() => doImport.mutate()}
                            disabled={!selectedCount || doImport.isPending}
                            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            data-testid="import-selected-button"
                        >
                            {doImport.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                                <Download className="h-4 w-4" aria-hidden="true" />
                            )}
                            Import {selectedCount || ""} as draft
                        </button>
                    </div>

                    <div className="overflow-hidden rounded-2xl border bg-white">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="w-10 px-4 py-3" />
                                    <th className="px-4 py-3">Paper</th>
                                    <th className="w-24 px-4 py-3">Year</th>
                                    <th className="w-28 px-4 py-3">Kind</th>
                                </tr>
                            </thead>
                            <tbody>
                                {hits.length === 0 ? (
                                    <EmptyRow colSpan={4} label="No papers matched that search." />
                                ) : (
                                    hits.map((hit) => (
                                        <tr key={hit.doi} className="border-t" data-testid={`import-row-${hit.doi}`}>
                                            <td className="px-4 py-3 align-top">
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(picked[hit.doi])}
                                                    disabled={hit.already_imported}
                                                    onChange={(e) => setPicked((p) => ({ ...p, [hit.doi]: e.target.checked }))}
                                                    aria-label={`Select ${hit.title}`}
                                                    data-testid={`import-check-${hit.doi}`}
                                                />
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <p className="font-medium leading-snug">{hit.title}</p>
                                                <p className="mt-0.5 text-xs text-slate-500">{hit.authors || "Authors not listed"}</p>
                                                <p className="text-xs text-slate-500">{hit.venue}</p>
                                                <a
                                                    href={`https://doi.org/${hit.doi}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="mt-1 inline-block text-xs font-medium text-sky-700 underline"
                                                >
                                                    DOI {hit.doi}
                                                </a>
                                                {hit.already_imported ? (
                                                    <span
                                                        className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600"
                                                        data-testid={`import-already-${hit.doi}`}
                                                    >
                                                        Already in library
                                                    </span>
                                                ) : null}
                                            </td>
                                            <td className="px-4 py-3 align-top">{hit.year ?? "—"}</td>
                                            <td className="px-4 py-3 align-top capitalize">{hit.ptype}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="mt-6 flex items-center gap-3 rounded-2xl border bg-white px-5 py-8 text-sm text-slate-500">
                    <BookOpen className="h-5 w-5" aria-hidden="true" />
                    Search for an author to see their registered papers.
                </div>
            )}
        </div>
    );
}
