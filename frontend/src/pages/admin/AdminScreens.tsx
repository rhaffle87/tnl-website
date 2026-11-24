// Media library, Registrar dashboard, Contact inbox (with Jev triage/scoring),
// Theme editor, Settings, People & access, API keys.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Award, Check, Copy, Download, FileJson, FileSpreadsheet, KeyRound, Sparkles, Upload } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import { AdminCard, AdminPageHeader, AdminSectionHeader, AdminSelect, AdminStatusBadge, AdminSwitch, ConfirmButton, Panel, adminError } from "@/pages/admin/AdminUI";
import { useMe } from "@/lib/hooks";
import { Spinner } from "@/components/site/Primitives";
import { InlineMediaField } from "@/components/admin/media";
import type {
    ApiKeyRecord,
    AuthUser,
    ContactMessage,
    FigmaImportTokensResult,
    FigmaSyncStatus,
    FigmaTokenResult,
    LabEvent,
    ListResponse,
    MediaAsset,
    Registration,
    SiteSettings,
    ThemeResponse,
    ThemeTokens,
} from "@/lib/types";

// ---------------------------------------------------------------- media
export function MediaLibrary() {
    const qc = useQueryClient();
    const [alt, setAlt] = useState("");
    const [folder, setFolder] = useState("general");
    const [file, setFile] = useState<File | null>(null);
    const [videoUrl, setVideoUrl] = useState("");
    const [search, setSearch] = useState("");

    const { data, isLoading } = useQuery({
        queryKey: ["admin", "media", search],
        queryFn: () => apiGet<{ items: MediaAsset[]; folders: string[] }>(`/admin/media${search ? `?q=${encodeURIComponent(search)}` : ""}`),
        retry: false,
    });

    const refresh = () => void qc.invalidateQueries({ queryKey: ["admin", "media"] });

    const upload = async () => {
        if (!file || !alt.trim()) {
            toast.error("Choose a file and describe what it shows.");
            return;
        }
        const body = new FormData();
        body.append("file", file);
        body.append("alt", alt.trim());
        body.append("folder", folder || "general");
        const res = await fetch("/api/admin/media", { method: "POST", body });
        if (!res.ok) {
            const err = (await res.json().catch(() => null)) as { detail?: string } | null;
            toast.error(err?.detail ?? "Upload failed.");
            return;
        }
        setFile(null);
        setAlt("");
        refresh();
        toast.success("File uploaded.");
    };

    const addVideo = useMutation({
        mutationFn: () => apiPost<MediaAsset>("/admin/media/video", { url: videoUrl, alt: alt.trim() || "Video", folder: "video" }),
        onSuccess: () => {
            setVideoUrl("");
            refresh();
            toast.success("Video added.");
        },
        onError: (err) => toast.error(adminError(err, "Could not add the video.")),
    });

    const remove = useMutation({
        mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/admin/media/${id}`),
        onSuccess: () => {
            refresh();
            toast.success("File deleted.");
        },
        onError: (err) => toast.error(adminError(err, "Could not delete this file.")),
    });

    const items = data?.items ?? [];

    return (
        <div data-testid="media-library-page">
            <AdminPageHeader
                title="Media library"
                description="Upload pictures and documents once, then paste their link wherever you need them. Every image needs a description."
                testId="media-header"
            />

            <Panel className="mb-6">
                <AdminSectionHeader title="Upload a file" />
                <div className="mt-3 grid gap-3 lg:grid-cols-4">
                    <input type="file" className="tnl-field pt-3" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Choose file" data-testid="media-file-input" />
                    <input className="tnl-field" placeholder="What does it show?" value={alt} onChange={(e) => setAlt(e.target.value)} aria-label="Description" data-testid="media-alt-input" />
                    <input className="tnl-field" placeholder="Folder" value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Folder" data-testid="media-folder-input" />
                    <button type="button" onClick={upload} className="tnl-btn tnl-btn-primary" data-testid="media-upload-button">
                        <Upload className="h-4 w-4" aria-hidden="true" />
                        Upload
                    </button>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                    <input className="tnl-field" placeholder="Or paste a YouTube link" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} aria-label="YouTube link" data-testid="media-video-input" />
                    <button type="button" onClick={() => addVideo.mutate()} className="tnl-btn tnl-btn-outline" disabled={!videoUrl.trim()} data-testid="media-video-add-button">
                        Add video
                    </button>
                </div>
            </Panel>

            <input type="search" className="tnl-field mb-4 sm:max-w-sm" placeholder="Search files…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search files" data-testid="media-search-input" />

            {isLoading ? (
                <Spinner label="Loading…" />
            ) : items.length === 0 ? (
                <Panel>
                    <p className="text-sm text-[var(--tnl-body)]" data-testid="media-empty">No files yet.</p>
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
                                Used in {asset.used_in ?? 0} place(s)
                            </p>
                            <input
                                className="tnl-field mt-2 h-10 text-sm"
                                defaultValue={asset.alt}
                                onBlur={(e) => {
                                    if (e.target.value !== asset.alt) {
                                        void apiPatch(`/admin/media/${asset.id}`, { alt: e.target.value })
                                            .then(() => {
                                                refresh();
                                                toast.success("Description updated.");
                                            })
                                            .catch((err) => toast.error(adminError(err, "Could not update.")));
                                    }
                                }}
                                aria-label="Description"
                                data-testid={`media-alt-${asset.id}`}
                            />
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        void navigator.clipboard?.writeText(asset.url);
                                        toast.success("Link copied.");
                                    }}
                                    className="rounded-[6px] border px-3 py-1.5 text-xs font-medium"
                                    style={{ borderColor: "var(--tnl-border)" }}
                                    data-testid={`media-copy-${asset.id}`}
                                >
                                    Copy link
                                </button>
                                <ConfirmButton label="Delete" confirmLabel="Delete it" question="Delete this file?" onConfirm={() => remove.mutate(asset.id)} testId={`media-delete-${asset.id}`} />
                            </div>
                        </Panel>
                    ))}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------- registrar
export function publishedEventQuota(events: LabEvent[] | undefined): number {
    return (events ?? [])
        .filter((ev) => ev.status === "published")
        .reduce((sum, ev) => sum + (ev.capacity || 0), 0);
}

export function RegistrarPage() {
    const qc = useQueryClient();
    const { data: me } = useMe();
    const canDelete = ["super_admin", "admin", "registrar"].includes(me?.role ?? "");
    const [eventId, setEventId] = useState("");
    const [status, setStatus] = useState("");
    const [checkinCode, setCheckinCode] = useState("");
    const [checkinResult, setCheckinResult] = useState<{ ok: boolean; text: string } | null>(null);

    const { data: events } = useQuery({
        queryKey: ["admin", "content", "events", "all"],
        queryFn: () => apiGet<ListResponse<LabEvent>>("/admin/content/events?limit=200"),
        retry: false,
    });

    useEffect(() => {
        if (!checkinResult) return;
        const timer = window.setTimeout(() => setCheckinResult(null), 8000);
        return () => window.clearTimeout(timer);
    }, [checkinResult]);

    const [isLive, setIsLive] = useState(true);
    const { data, isLoading, dataUpdatedAt } = useQuery({
        queryKey: ["admin", "registrations", eventId, status],
        queryFn: () =>
            apiGet<{ items: Registration[]; total: number; counts: Record<string, number> }>(
                `/admin/registrations?limit=200${eventId ? `&event_id=${eventId}` : ""}${status ? `&status=${status}` : ""}`,
            ),
        retry: false,
        // Check-in desk at the Open House watches this list: poll every 15s while the
        // tab is in the foreground, and stop completely when it is not (saves CT 103).
        refetchInterval: isLive ? 15_000 : false,
        refetchIntervalInBackground: false,
    });

    const refresh = () => {
        void qc.invalidateQueries({ queryKey: ["admin", "registrations"] });
        void qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    };

    const setRegStatus = useMutation({
        mutationFn: ({ id, next }: { id: string; next: string }) => apiPatch<Registration>(`/admin/registrations/${id}`, { status: next }),
        onSuccess: () => {
            refresh();
            toast.success("Updated.");
        },
        onError: (err) => toast.error(adminError(err, "Could not update.")),
    });

    const deleteReg = useMutation({
        mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/admin/registrations/${id}`),
        onSuccess: () => {
            refresh();
            toast.success("Registration deleted.");
        },
        onError: (err) => toast.error(adminError(err, "Could not delete registration.")),
    });

    const checkin = useMutation({
        mutationFn: () => apiPost<{ name: string; message: string; nim?: string; time?: string }>("/admin/registrations/checkin", { code: checkinCode }),
        onSuccess: (res) => {
            refresh();
            setCheckinCode("");
            const when = res.time || new Date().toLocaleTimeString();
            const who = res.nim ? `${res.name} · NRP ${res.nim}` : res.name;
            setCheckinResult({ ok: true, text: `${who} · ${when} · ${res.message}` });
            toast.success(`${res.name}: ${res.message}`);
        },
        onError: (err) => {
            const message = adminError(err, "No registration matches this code.");
            setCheckinResult({ ok: false, text: message });
            toast.error(message);
        },
    });

    const issueCerts = useMutation({
        mutationFn: () => apiPost<{ ok: boolean; issued: number }>("/admin/registrations/issue-certificates", { event_id: eventId }),
        onSuccess: (res) => {
            refresh();
            toast.success(`Issued ${res.issued} certificate(s).`);
        },
        onError: (err) => toast.error(adminError(err, "Could not issue certificates.")),
    });

    const items = data?.items ?? [];
    const counts = data?.counts ?? {};
    const registered = data?.total ?? items.length;
    const quota = eventId
        ? (events?.items.find((ev) => ev.id === eventId)?.capacity ?? 0)
        : publishedEventQuota(events?.items);
    const attended = counts.attended ?? items.filter((reg) => reg.status === "attended").length;
    const pending = counts.accepted ?? items.filter((reg) => reg.status === "accepted").length;
    const rejected = counts.rejected ?? items.filter((reg) => reg.status === "rejected").length;
    const attendedPct = registered ? Math.round((attended / registered) * 100) : 0;
    const exportCsvUrl = `/api/admin/registrations/export${eventId ? `?event_id=${eventId}` : ""}${status ? `${eventId ? "&" : "?"}status=${status}` : ""}`;
    const exportExcelUrl = `/api/admin/registrations/export-excel${eventId ? `?event_id=${eventId}` : ""}${status ? `${eventId ? "&" : "?"}status=${status}` : ""}`;

    return (
        <div data-testid="registrar-page">
            <AdminPageHeader
                title="Registrations"
                description="Everyone who signed up for a programme. All valid registrations are automatically accepted. Check participants in at the door, manage entries, issue certificates, or export to Excel/CSV."
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <div
                            className="flex h-10 items-center gap-2 rounded-full border px-3"
                            style={{ borderColor: "var(--tnl-border)" }}
                            data-testid="registrations-live-badge"
                        >
                            <span className={`tnl-admin-live-badge-dot${isLive ? "" : " is-paused"}`} aria-hidden="true" />
                            <span className="text-xs font-medium">{isLive ? "Live · 15s" : "Live paused"}</span>
                            <button
                                type="button"
                                onClick={() => setIsLive((v) => !v)}
                                className="text-xs underline"
                                style={{ color: "var(--tnl-link)" }}
                                data-testid="registrations-live-toggle"
                                aria-pressed={isLive}
                            >
                                {isLive ? "Pause" : "Resume"}
                            </button>
                            <span className="text-xs text-[var(--tnl-muted)]" data-testid="registrations-last-updated">
                                {dataUpdatedAt ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString()}` : "Waiting…"}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => issueCerts.mutate()}
                            className="tnl-btn tnl-btn-primary h-10 min-h-[40px] text-sm"
                            disabled={!eventId || issueCerts.isPending}
                            data-testid="issue-certificates-btn"
                            title={!eventId ? "Select an event to issue certificates" : "Issue certificate codes for attended participants"}
                        >
                            <Award className="h-4 w-4" aria-hidden="true" />
                            {issueCerts.isPending ? "Issuing…" : "Issue Certificates"}
                        </button>
                        <a href={exportExcelUrl} className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm" data-testid="registrations-export-excel-button">
                            <FileSpreadsheet className="h-4 w-4 mr-1.5" aria-hidden="true" />
                            Export Excel (.xlsx)
                        </a>
                        <a href={exportCsvUrl} className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm" data-testid="registrations-export-button">
                            <Download className="h-4 w-4 mr-1.5" aria-hidden="true" />
                            CSV
                        </a>
                    </div>
                }
                testId="registrar-header"
            />

            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="checkin-kpi-strip">
                <AdminCard className="!p-4" testId="checkin-kpi-registered">
                    <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>Registered / Quota</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{registered} <span className="text-base font-medium" style={{ color: "var(--tnl-tan-text)" }}>/ {quota || "—"}</span></p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--tnl-border)" }}>
                        <div className="h-full rounded-full bg-[var(--tnl-green)]" style={{ width: `${quota ? Math.min(100, Math.round((registered / quota) * 100)) : 0}%` }} />
                    </div>
                </AdminCard>
                <AdminCard className="!p-4" testId="checkin-kpi-attended">
                    <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>Checked In</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: "var(--tnl-green)" }}>{attended} <span className="text-base font-medium">· {attendedPct}%</span></p>
                    <p className="mt-2 text-xs" style={{ color: "var(--tnl-tan-text)" }}>hadir · presensi pintu</p>
                </AdminCard>
                <AdminCard className="!p-4" testId="checkin-kpi-pending">
                    <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>Not Yet Checked In</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{pending}</p>
                    <p className="mt-2 text-xs" style={{ color: "var(--tnl-tan-text)" }}>status accepted</p>
                </AdminCard>
                {rejected > 0 ? (
                    <AdminCard className="!p-4" testId="checkin-kpi-rejected">
                        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>Cancelled / Rejected</p>
                        <p className="mt-1 text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">{rejected}</p>
                    </AdminCard>
                ) : null}
            </div>

            <Panel className="mb-5">
                <div className="grid gap-3 lg:grid-cols-2">
                    <AdminSelect value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="Event" data-testid="registrations-event-filter">
                        <option value="">All events</option>
                        {(events?.items ?? []).map((ev) => (
                            <option key={ev.id} value={ev.id}>
                                {ev.title}
                            </option>
                        ))}
                    </AdminSelect>
                    <AdminSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" data-testid="registrations-status-filter">
                        <option value="">All statuses</option>
                        {["pending", "accepted", "rejected", "attended", "waitlisted"].map((s) => (
                            <option key={s} value={s}>
                                {s} {data?.counts?.[s] !== undefined ? `(${data.counts[s]})` : ""}
                            </option>
                        ))}
                    </AdminSelect>
                </div>
                <div className="mt-4 rounded-xl border border-[var(--tnl-green)]/40 bg-[var(--tnl-green)]/5 p-3">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--tnl-green)" }}>Door check-in</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                            className="tnl-field h-11 text-base"
                            placeholder="Scan or type a check-in code"
                            value={checkinCode}
                            onChange={(e) => setCheckinCode(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    if (checkinCode.trim()) checkin.mutate();
                                }
                            }}
                            aria-label="Check-in code"
                            data-testid="checkin-code-input"
                        />
                        <button
                            type="button"
                            onClick={() => checkin.mutate()}
                            className="tnl-btn tnl-btn-primary h-11 min-h-[44px] whitespace-nowrap shrink-0 px-5 text-sm"
                            disabled={!checkinCode.trim() || checkin.isPending}
                            data-testid="checkin-submit-button"
                        >
                            {checkin.isPending ? "Checking in…" : "Check in"}
                        </button>
                    </div>
                    {checkinResult ? (
                        <div
                            className={`mt-3 flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                                checkinResult.ok
                                    ? "border-[var(--tnl-green)] bg-[var(--tnl-green)]/10 text-[var(--tnl-green)]"
                                    : "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400"
                            }`}
                            role={checkinResult.ok ? "status" : "alert"}
                            data-testid="checkin-result-banner"
                        >
                            <span className="flex-1 font-medium">{checkinResult.text}</span>
                            <button
                                type="button"
                                onClick={() => setCheckinResult(null)}
                                aria-label="Dismiss check-in result"
                                className="rounded px-1.5 text-base leading-none"
                            >
                                ×
                            </button>
                        </div>
                    ) : null}
                </div>
            </Panel>

            {isLoading ? (
                <Spinner label="Loading…" />
            ) : items.length === 0 ? (
                <Panel>
                    <p className="text-sm text-[var(--tnl-body)]" data-testid="registrations-empty">No registrations yet.</p>
                </Panel>
            ) : (
            <>
            <div className="mb-5 space-y-3 md:hidden" data-testid="registrations-mobile-cards">
                {items.map((reg) => {
                    const name = reg.display_name && reg.display_name !== reg.email
                        ? reg.display_name
                        : ((reg.data && (reg.data["f_nama-lengkap"] || reg.data["f_full-name"] || reg.data["f_nama"])) as string) || reg.email;
                    return (
                        <AdminCard key={reg.id} className="!p-4" testId={`registration-mobile-card-${reg.id}`}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="truncate font-semibold">{name}</p>
                                    <p className="break-all text-xs" style={{ color: "var(--tnl-tan-text)" }}>{reg.email}</p>
                                    {reg.nim ? <p className="mt-0.5 font-mono text-xs">{reg.nim}</p> : null}
                                </div>
                                <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize" style={{ borderColor: "var(--tnl-border)", color: reg.status === "attended" ? "var(--tnl-green)" : "var(--tnl-tan-text)" }}>
                                    {reg.status}
                                </span>
                            </div>
                            <p className="mt-2 text-xs" style={{ color: "var(--tnl-tan-text)" }}>{reg.event_title}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => setRegStatus.mutate({ id: reg.id, next: "attended" })}
                                    className="tnl-btn tnl-btn-primary min-h-[40px] text-xs"
                                    data-testid={`registration-checkin-${reg.id}`}
                                >
                                    Check in
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRegStatus.mutate({ id: reg.id, next: "rejected" })}
                                    className="tnl-btn tnl-btn-outline min-h-[40px] text-xs text-red-600 dark:text-red-400"
                                    data-testid={`registration-reject-${reg.id}`}
                                >
                                    Reject
                                </button>
                                {canDelete ? (
                                    <ConfirmButton
                                        label="Delete"
                                        confirmLabel="Delete entry"
                                        question={`Delete registration for ${reg.email}?`}
                                        onConfirm={() => deleteReg.mutate(reg.id)}
                                        testId={`registration-delete-mobile-${reg.id}`}
                                    />
                                ) : null}
                            </div>
                        </AdminCard>
                    );
                })}
            </div>

                <Panel>
                    <div className="hidden overflow-x-auto md:block">
                        <table className="w-full text-sm" data-testid="registrations-table">
                        <thead>
                            <tr className="text-left" style={{ color: "var(--tnl-tan-text)" }}>
                                <th className="pb-2 pr-4 font-semibold">Name</th>
                                <th className="pb-2 pr-4 font-semibold">Event</th>
                                <th className="pb-2 pr-4 font-semibold">Status</th>
                                <th className="pb-2 pr-4 font-semibold">Certificate</th>
                                <th className="pb-2 font-semibold">Decide</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((reg) => (
                                <tr key={reg.id} className="border-t" style={{ borderColor: "var(--tnl-border)" }} data-testid={`registration-row-${reg.id}`}>
                                    <td className="py-3 pr-4">
                                        <span className="font-medium">
                                            {reg.display_name && reg.display_name !== reg.email
                                                ? reg.display_name
                                                : ((reg.data && (reg.data["f_nama-lengkap"] || reg.data["f_full-name"] || reg.data["f_nama"])) as string) || reg.email}
                                        </span>
                                        <span className="block text-xs" style={{ color: "var(--tnl-tan-text)" }}>{reg.email}</span>
                                    </td>
                                    <td className="py-3 pr-4">{reg.event_title}</td>
                                    <td className="py-3 pr-4 capitalize">{reg.status}</td>
                                    <td className="py-3 pr-4">
                                        {reg.certificate_code ? (
                                            <a
                                                href={`/api/certificates/${reg.certificate_code}/pdf`}
                                                download
                                                className="inline-flex items-center gap-1 rounded-[6px] border px-2 py-0.5 text-xs font-mono font-semibold transition-colors hover:border-[var(--tnl-green)]"
                                                style={{ borderColor: "var(--tnl-border)", color: "var(--tnl-green)" }}
                                                title="Download certificate PDF"
                                                data-testid={`download-cert-${reg.id}`}
                                            >
                                                <Download className="h-3 w-3" />
                                                {reg.certificate_code}
                                            </a>
                                        ) : (
                                            <span className="text-xs" style={{ color: "var(--tnl-tan-text)" }}>—</span>
                                        )}
                                    </td>
                                    <td className="py-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setRegStatus.mutate({ id: reg.id, next: "attended" })}
                                                className={`rounded-[6px] border px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                                                    reg.status === "attended"
                                                        ? "bg-[var(--tnl-green)] text-white border-[var(--tnl-green)]"
                                                        : "hover:border-[var(--tnl-green)] hover:text-[var(--tnl-green)]"
                                                }`}
                                                style={{ borderColor: reg.status === "attended" ? undefined : "var(--tnl-border)" }}
                                                data-testid={`registration-attended-${reg.id}`}
                                                title="Tandai peserta hadir (presensi hari-H)"
                                            >
                                                Attended
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setRegStatus.mutate({ id: reg.id, next: "rejected" })}
                                                className={`rounded-[6px] border px-2.5 py-1 text-xs font-medium transition-colors ${
                                                    reg.status === "rejected"
                                                        ? "bg-red-600 text-white border-red-600"
                                                        : "text-red-600 dark:text-red-400 hover:border-red-500 hover:bg-red-500/10"
                                                }`}
                                                style={{ borderColor: reg.status === "rejected" ? undefined : "var(--tnl-border)" }}
                                                data-testid={`registration-rejected-${reg.id}`}
                                                title="Batalkan pendaftaran dan kembalikan 1 kursi ke kuota"
                                            >
                                                Reject / Cancel
                                            </button>
                                            {canDelete && (
                                                <ConfirmButton
                                                    label="Delete"
                                                    confirmLabel="Delete entry"
                                                    question={`Delete registration for ${reg.email}?`}
                                                    onConfirm={() => deleteReg.mutate(reg.id)}
                                                    testId={`registration-delete-${reg.id}`}
                                                />
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        </table>
                    </div>
                </Panel>
            </>
            )}
        </div>
    );
}

// ---------------------------------------------------------------- inbox
export function InboxPage() {
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ["admin", "messages"],
        queryFn: () => apiGet<{ items: ContactMessage[]; counts: Record<string, number> }>("/admin/messages"),
        retry: false,
    });
    const [replyTo, setReplyTo] = useState<string | null>(null);
    const [replyBody, setReplyBody] = useState("");

    const refresh = () => {
        void qc.invalidateQueries({ queryKey: ["admin", "messages"] });
        void qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    };

    const triageAll = useMutation({
        mutationFn: () => apiPost<{ triaged: number; examined: number }>("/admin/messages/triage-all"),
        onSuccess: (res) => {
            refresh();
            toast.success(`Sorted ${res.triaged} of ${res.examined} message(s).`);
        },
        onError: (err) => toast.error(adminError(err, "Triage is busy. Try again shortly.")),
    });

    const reply = useMutation({
        mutationFn: (id: string) => apiPatch<ContactMessage>(`/admin/messages/${id}`, { reply_body: replyBody }),
        onSuccess: () => {
            refresh();
            setReplyTo(null);
            setReplyBody("");
            toast.success("Reply sent.");
        },
        onError: (err) => toast.error(adminError(err, "Could not send the reply.")),
    });

    const items = data?.items ?? [];

    return (
        <div data-testid="inbox-page">
            <AdminPageHeader
                title="Contact inbox"
                description="Messages sent through the contact form. Use “Sort messages” to group them by topic and urgency."
                actions={
                    <button type="button" onClick={() => triageAll.mutate()} className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm" disabled={triageAll.isPending} data-testid="inbox-triage-button">
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        {triageAll.isPending ? "Sorting…" : "Sort messages"}
                    </button>
                }
                testId="inbox-header"
            />
            {isLoading ? (
                <Spinner label="Loading…" />
            ) : items.length === 0 ? (
                <Panel>
                    <p className="text-sm text-[var(--tnl-body)]" data-testid="inbox-empty">No messages yet.</p>
                </Panel>
            ) : (
                <div className="space-y-4">
                    {items.map((msg) => (
                        <Panel key={msg.id}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-[17px] font-bold" data-testid={`message-subject-${msg.id}`}>{msg.subject}</h2>
                                    <p className="mt-0.5 text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                                        {msg.name} · {msg.email} · {new Date(msg.created_at).toLocaleString()}
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {msg.triage?.ai_ok ? (
                                        <>
                                            <span className="tnl-count-chip" data-testid={`message-category-${msg.id}`}>{msg.triage.category}</span>
                                            <span className="tnl-count-chip">{msg.triage.urgency_label}</span>
                                            {(msg.triage.spam_probability ?? 0) > 0.7 ? (
                                                <AdminStatusBadge variant="error">likely spam</AdminStatusBadge>
                                            ) : null}
                                        </>
                                    ) : null}
                                    <span className="text-xs capitalize" style={{ color: "var(--tnl-tan-text)" }}>{msg.status}</span>
                                </div>
                            </div>
                            <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--tnl-body)]">{msg.body}</p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <button type="button" onClick={() => setReplyTo(replyTo === msg.id ? null : msg.id)} className="rounded-[6px] border px-3 py-1.5 text-xs font-medium" style={{ borderColor: "var(--tnl-border)" }} data-testid={`message-reply-${msg.id}`}>
                                    Reply by email
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void apiPatch(`/admin/messages/${msg.id}`, { status: "archived" }).then(() => {
                                            refresh();
                                            toast.success("Archived.");
                                        });
                                    }}
                                    className="rounded-[6px] border px-3 py-1.5 text-xs font-medium"
                                    style={{ borderColor: "var(--tnl-border)" }}
                                    data-testid={`message-archive-${msg.id}`}
                                >
                                    Archive
                                </button>
                            </div>
                            {replyTo === msg.id ? (
                                <div className="mt-3">
                                    <textarea className="tnl-field" rows={4} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} aria-label="Reply" data-testid={`message-reply-body-${msg.id}`} />
                                    <button type="button" onClick={() => reply.mutate(msg.id)} className="tnl-btn tnl-btn-primary mt-2 h-10 min-h-[40px] text-sm" disabled={!replyBody.trim()} data-testid={`message-send-${msg.id}`}>
                                        Send reply
                                    </button>
                                </div>
                            ) : null}
                        </Panel>
                    ))}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------- theme
export function ThemePage() {
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ["admin", "theme"],
        queryFn: () => apiGet<ThemeResponse>("/admin/theme"),
        retry: false,
    });
    const [draft, setDraft] = useState<ThemeTokens | null>(null);
    const tokens = draft ?? data?.draft ?? null;

    const save = useMutation({
        mutationFn: () => apiPut<{ draft: ThemeTokens }>("/admin/theme/draft", tokens),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ["admin", "theme"] });
            toast.success("Draft saved.");
        },
        onError: (err) => toast.error(adminError(err, "Could not save the draft.")),
    });

    const publish = useMutation({
        mutationFn: () => apiPost<{ published: ThemeTokens }>("/admin/theme/publish"),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ["admin", "theme"] });
            toast.success("Theme published.");
        },
        onError: (err) => toast.error(adminError(err, "Some colour pairs are too low-contrast to publish.")),
    });

    const reset = useMutation({
        mutationFn: () => apiPost<{ draft: ThemeTokens }>("/admin/theme/reset"),
        onSuccess: (res) => {
            setDraft(res.draft);
            void qc.invalidateQueries({ queryKey: ["admin", "theme"] });
            toast.success("Reset to the TNL default colours.");
        },
    });

    if (isLoading || !tokens) return <Spinner label="Loading…" />;

    const colorKeys: (keyof ThemeTokens)[] = [
        "color_black", "color_tan", "color_tan_text", "color_green", "color_green_hover",
        "color_surface", "color_border", "color_body",
    ];
    const LABELS: Record<string, string> = {
        color_black: "Black (headers, footer, hero)",
        color_tan: "Tan (decoration, large numbers, on dark)",
        color_tan_text: "Darker tan (small text on light backgrounds)",
        color_green: "Dark green (buttons and links)",
        color_green_hover: "Dark green when hovered",
        color_surface: "Page background",
        color_border: "Lines and borders",
        color_body: "Body text",
    };

    const gsmKeys: { key: keyof ThemeTokens; label: string; desc: string; fallback: string }[] = [
        { key: "primary_color", label: "GSM Deep Forest (Primary)", desc: "Brand identity, hero gradient, navbar accent, dark borders", fallback: "#223027" },
        { key: "emerald_color", label: "GSM Emerald Glow", desc: "Digital pulse, active badges, status indicators, energy highlights", fallback: "#5D8A6B" },
        { key: "obsidian_color", label: "GSM Obsidian Dark", desc: "Dark mode background, hero background, maximum depth", fallback: "#0C100E" },
        { key: "accent_color", label: "GSM Warm Sand (Accent)", desc: "Golden-tan accent, call-to-action button, brand elegance", fallback: "#A8977B" },
        { key: "accent_hover_color", label: "GSM Accent Hover Tan", desc: "Interactive button hover, active states, luminous glow", fallback: "#C2B091" },
    ];

    const resetToGsmStandard = () => {
        setDraft({
            ...tokens,
            primary_color: "#5d3b1f",
            emerald_color: "#ffbb58",
            obsidian_color: "#0C100E",
            accent_color: "#A8977B",
            accent_hover_color: "#C2B091",
            gsm_edition_label: "GSM Kabinet Keberlanjutan 2026",
            color_black: "#0C100E",
            color_tan: "#A8977B",
            color_tan_text: "#7F715C",
            color_green: "#5d3b1f",
            color_green_hover: "#4A2E18",
            color_surface: "#FAF7F2",
            color_border: "rgba(93, 59, 31, 0.12)",
            color_body: "#141A16",
        });
        toast.info("Preset baku GSM Kabinet Keberlanjutan dimuat ke draf. Klik 'Save draft' lalu 'Publish theme' untuk menerapkan.");
    };

    const activePrimary = tokens.primary_color || "#5d3b1f";
    const activeEmerald = tokens.emerald_color || "#ffbb58";
    const activeObsidian = tokens.obsidian_color || "#0C100E";
    const activeAccent = tokens.accent_color || "#A8977B";

    return (
        <div data-testid="theme-page" className="space-y-6">
            <AdminPageHeader
                title="Colours & theme (GSM)"
                description="Standarisasi identitas visual GSM Laboratorium Jaringan Telekomunikasi. Pengaturan ini menjamin konsistensi lintas kepengurusan."
                actions={
                    <>
                        <button type="button" onClick={resetToGsmStandard} className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-xs font-semibold" data-testid="theme-reset-gsm-button">
                            Reset Baku GSM TNL
                        </button>
                        <button type="button" onClick={() => reset.mutate()} className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-xs" data-testid="theme-reset-button">
                            Reset ke Nilai DB
                        </button>
                        <button type="button" onClick={() => save.mutate()} className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-xs" data-testid="theme-save-draft-button">
                            Save draft
                        </button>
                        <button type="button" onClick={() => publish.mutate()} className="tnl-btn tnl-btn-primary h-10 min-h-[40px] text-xs" data-testid="theme-publish-button">
                            Publish theme
                        </button>
                    </>
                }
                testId="theme-header"
            />

            <Panel>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <AdminSectionHeader
                        title="Edisi Panduan Standar Grafis (GSM)"
                        description="Label kepengurusan atau manual identitas visual yang sedang aktif di website labtnl.site."
                    />
                    <div className="w-full sm:w-80">
                        <input
                            type="text"
                            className="tnl-field text-sm"
                            value={tokens.gsm_edition_label ?? "GSM Kabinet Keberlanjutan 2026"}
                            onChange={(e) => setDraft({ ...tokens, gsm_edition_label: e.target.value })}
                            placeholder="cth: GSM Kabinet Keberlanjutan 2026"
                            aria-label="GSM Edition Label"
                        />
                    </div>
                </div>
            </Panel>

            <div className="grid gap-6 lg:grid-cols-2">
                <Panel>
                    <AdminSectionHeader
                        className="mb-4 border-b border-[var(--tnl-border)] pb-3"
                        title="Token Inti GSM (Cross-Period)"
                        description="5 warna pokok yang mengontrol identitas hero, navbar, logo watermark, tombol CTA, dan aksen gelombang."
                    />
                    <div className="space-y-3.5">
                        {gsmKeys.map(({ key, label, desc, fallback }) => {
                            const val = String(tokens[key] || fallback);
                            return (
                                <AdminCard key={key} className="flex items-center gap-3 p-2.5 sm:p-2.5">
                                    <input
                                        type="color"
                                        value={val}
                                        onChange={(e) => setDraft({ ...tokens, [key]: e.target.value })}
                                        className="h-10 w-14 shrink-0 cursor-pointer rounded border border-gray-300 dark:border-white/20 bg-transparent"
                                        aria-label={label}
                                        data-testid={`theme-gsm-${key}`}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between">
                                            <label className="block text-sm font-semibold">{label}</label>
                                            <span className="font-mono text-xs uppercase px-1.5 py-0.5 rounded bg-[var(--tnl-surface-2)] text-[var(--tnl-body)]">{val}</span>
                                        </div>
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{desc}</p>
                                    </div>
                                </AdminCard>
                            );
                        })}
                    </div>

                    <div className="border-t pt-4 mt-6 border-gray-200 dark:border-white/10">
                        <AdminSectionHeader className="mb-3" title="Warna Pendukung & Kompatibilitas" />
                        <div className="space-y-2">
                            {colorKeys.map((key) => (
                                <div key={key} className="flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={String(tokens[key])}
                                        onChange={(e) => setDraft({ ...tokens, [key]: e.target.value })}
                                        className="h-8 w-12 shrink-0 cursor-pointer rounded border border-gray-200 dark:border-white/10"
                                        aria-label={LABELS[key]}
                                        data-testid={`theme-color-${key}`}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <span className="text-xs font-medium">{LABELS[key]}</span>
                                        <span className="ml-2 text-[11px] font-mono text-gray-400">{String(tokens[key])}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Panel>

                <div className="space-y-6">
                    <Panel>
                        <AdminSectionHeader
                            title="Pratinjau Langsung (Side-by-Side)"
                            description="Simulasi komponen publik di Light Mode dan Dark Mode dengan token yang dipilih."
                        />

                        <div className="grid gap-3.5 mt-4 sm:grid-cols-2">
                            <div
                                className="rounded-xl p-4 border transition-colors shadow-sm"
                                style={{
                                    backgroundColor: tokens.color_surface || "#FAF7F2",
                                    color: tokens.color_body || "#1E2521",
                                    borderColor: "color-mix(in srgb, var(--gsm-primary) 15%, transparent)",
                                }}
                            >
                                <div className="flex items-center justify-between pb-2 border-b border-gray-300/60">
                                    <span className="text-[11px] font-bold tracking-wider uppercase text-gray-600">Light Mode</span>
                                    <span
                                        className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                                        style={{ backgroundColor: activeEmerald, color: "#FFFFFF" }}
                                    >
                                        Live Pulse
                                    </span>
                                </div>
                                <h3 className="text-sm font-extrabold mt-2.5" style={{ color: activePrimary }}>
                                    Laboratorium TNL ITS
                                </h3>
                                <p className="text-xs mt-1 text-gray-600 line-clamp-2">
                                    Pusat keunggulan riset jaringan telekomunikasi & transmisi data generasi masa depan.
                                </p>
                                <div className="mt-3.5 flex items-center gap-2">
                                    <button
                                        type="button"
                                        className="px-3 py-1.5 rounded-md text-xs font-bold shadow-sm"
                                        style={{ backgroundColor: activePrimary, color: "#FFFFFF" }}
                                    >
                                        Eksplorasi Riset
                                    </button>
                                    <span
                                        className="text-[11px] font-semibold underline underline-offset-2"
                                        style={{ color: activeAccent }}
                                    >
                                        Lihat Silabus
                                    </span>
                                </div>
                            </div>

                            <div
                                className="rounded-xl p-4 border transition-colors shadow-sm"
                                style={{
                                    backgroundColor: activeObsidian,
                                    color: "var(--gsm-text-secondary)",
                                    borderColor: "color-mix(in srgb, var(--gsm-emerald) 25%, transparent)",
                                }}
                            >
                                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                                    <span className="text-[11px] font-bold tracking-wider uppercase text-gray-400">Dark Mode</span>
                                    <span
                                        className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                                        style={{ backgroundColor: "color-mix(in srgb, var(--gsm-emerald) 20%, transparent)", color: activeEmerald, border: `1px solid ${activeEmerald}40` }}
                                    >
                                        Active Node
                                    </span>
                                </div>
                                <h3 className="text-sm font-extrabold mt-2.5 text-white">
                                    Laboratorium TNL ITS
                                </h3>
                                <p className="text-xs mt-1 text-gray-400 line-clamp-2">
                                    Pusat keunggulan riset jaringan telekomunikasi & transmisi data generasi masa depan.
                                </p>
                                <div className="mt-3.5 flex items-center gap-2">
                                    <button
                                        type="button"
                                        className="px-3 py-1.5 rounded-md text-xs font-bold shadow-sm"
                                        style={{ backgroundColor: activeAccent, color: activeObsidian }}
                                    >
                                        Daftar Praktikum
                                    </button>
                                    <button
                                        type="button"
                                        className="px-2.5 py-1.5 rounded-md text-xs font-medium border"
                                        style={{ borderColor: activeEmerald, color: activeEmerald }}
                                    >
                                        Silabus
                                    </button>
                                </div>
                            </div>
                        </div>
                    </Panel>

                    <Panel>
                        <AdminSectionHeader
                            title="Uji Kontras & Aksesibilitas (WCAG 2.1 AA)"
                            description="Setiap pasangan warna wajib memenuhi rasio kontras minimum sebelum tema dapat dipublikasikan ke publik."
                        />
                        <ul className="mt-4 space-y-2" data-testid="theme-contrast-list">
                            {(data?.contrast ?? []).map((check) => (
                                <li
                                    key={check.label}
                                    className="flex items-center justify-between gap-3 rounded-[8px] border px-4 py-2.5 text-sm"
                                    style={{ borderColor: check.passes ? "var(--tnl-border)" : "#fecaca" }}
                                    data-testid={`theme-contrast-${check.passes ? "pass" : "fail"}`}
                                >
                                    <span className="font-medium text-xs sm:text-sm">{check.label}</span>
                                    <span className="font-semibold text-xs shrink-0" style={{ color: check.passes ? "#2e7d32" : "#b91c1c" }}>
                                        {check.ratio} {check.passes ? "✓ Lulus" : `✕ Butuh ${check.required}`}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </Panel>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------- settings
export function SettingsPage() {
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ["admin", "settings"],
        queryFn: () => apiGet<SiteSettings>("/admin/settings"),
        retry: false,
    });
    const [form, setForm] = useState<Partial<SiteSettings> | null>(null);
    const [figmaRawJson, setFigmaRawJson] = useState("");
    const [jsonImportPreview, setJsonImportPreview] = useState<any | null>(null);
    const [generatedToken, setGeneratedToken] = useState<string | null>(null);
    const [copiedToken, setCopiedToken] = useState(false);
    const current = { ...(data ?? {}), ...(form ?? {}) } as SiteSettings;

    const { data: figmaStatus, refetch: refetchFigmaStatus } = useQuery<FigmaSyncStatus>({
        queryKey: ["admin", "figma", "status"],
        queryFn: () => apiGet<FigmaSyncStatus>("/admin/figma/status"),
        retry: false,
    });

    const generateToken = useMutation({
        mutationFn: () => apiPost<FigmaTokenResult>("/admin/figma/token"),
        onSuccess: (res) => {
            setGeneratedToken(res.token);
            void refetchFigmaStatus();
            toast.success("Figma Sync Token berhasil dibuat! Salin sekarang.");
        },
        onError: (err) => toast.error(adminError(err, "Gagal membuat token.")),
    });

    const importTokensMutation = useMutation({
        mutationFn: (payload: any) => apiPost<FigmaImportTokensResult>("/admin/figma/import-tokens", payload),
        onSuccess: (res) => {
            void qc.invalidateQueries({ queryKey: ["admin", "settings"] });
            void qc.invalidateQueries({ queryKey: ["admin", "theme"] });
            void qc.invalidateQueries({ queryKey: ["public", "settings"] });
            setFigmaRawJson("");
            setJsonImportPreview(null);
            toast.success(`Token berhasil diimpor! WCAG AA: ${res.all_pass ? "Lulus" : "Periksa di /admin/theme"}`);
        },
        onError: (err) => toast.error(adminError(err, "Gagal mengimpor token.")),
    });

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsed = JSON.parse(event.target?.result as string);
                setFigmaRawJson(JSON.stringify(parsed, null, 2));
                setJsonImportPreview(parsed);
            } catch {
                toast.error("File JSON tidak valid.");
            }
        };
        reader.readAsText(file);
    };

    const handleJsonPaste = (text: string) => {
        setFigmaRawJson(text);
        if (!text.trim()) {
            setJsonImportPreview(null);
            return;
        }
        try {
            const parsed = JSON.parse(text);
            setJsonImportPreview(parsed);
        } catch {
            setJsonImportPreview(null);
        }
    };

    const save = useMutation({
        mutationFn: () =>
            apiPut<SiteSettings>("/admin/settings", {
                site_title: current.site_title,
                site_title_id: current.site_title_id,
                short_name: current.short_name,
                logo_url: current.logo_url,
                logo_url_dark: current.logo_url_dark,
                its_logo_url: current.its_logo_url,
                contact: current.contact,
                social: current.social,
                seo: current.seo,
                language_default: current.language_default,
                analytics_snippet: current.analytics_snippet,
                maintenance_mode: current.maintenance_mode,
                announcement: current.announcement,
                retention_days: current.retention_days,
            }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ["admin", "settings"] });
            void qc.invalidateQueries({ queryKey: ["public", "settings"] });
            toast.success("Settings saved.");
        },
        onError: (err) => toast.error(adminError(err, "Could not save the settings.")),
    });

    if (isLoading || !data) return <Spinner label="Loading…" />;

    const set = (patch: Partial<SiteSettings>) => setForm({ ...(form ?? {}), ...patch });

    return (
        <div data-testid="settings-page">
            <AdminPageHeader
                title="Site settings"
                description="The one place for the laboratory's name, contact details and social links. The footer and the contact page both read from here, so they can never disagree."
                actions={
                    <button type="button" onClick={() => save.mutate()} className="tnl-btn tnl-btn-primary h-10 min-h-[40px] text-sm" data-testid="settings-save-button">
                        Save settings
                    </button>
                }
                testId="settings-header"
            />

            <div className="grid gap-4 lg:grid-cols-2">
                <Panel>
                    <AdminSectionHeader title="Laboratory identity" />
                    <div className="mt-3 space-y-3">
                        <Field label="Name (English)" value={current.site_title} onChange={(v) => set({ site_title: v })} testId="settings-title-en" />
                        <Field label="Name (Bahasa Indonesia)" value={current.site_title_id} onChange={(v) => set({ site_title_id: v })} testId="settings-title-id" />
                        <Field label="Short name" value={current.short_name} onChange={(v) => set({ short_name: v })} testId="settings-short-name" />
                        <div>
                            <label className="block text-sm font-medium">
                                <span className="mb-1.5 block">Default language</span>
                                <AdminSelect
                                    value={current.language_default}
                                    onChange={(e) => set({ language_default: e.target.value })}
                                    data-testid="settings-language"
                                >
                                    <option value="id">Bahasa Indonesia</option>
                                    <option value="en">English</option>
                                </AdminSelect>
                            </label>
                        </div>
                    </div>
                </Panel>

                <Panel>
                    <AdminSectionHeader title="Logos & Brand Imagery" />
                    <div className="mt-3 space-y-4">
                        <InlineMediaField
                            label="Primary Logo (Light mode)"
                            value={current.logo_url}
                            onChange={(url) => set({ logo_url: url })}
                            defaultFolder="general"
                            aspect="square"
                            testId="settings-logo-url"
                        />
                        <InlineMediaField
                            label="Dark Mode Logo"
                            value={current.logo_url_dark}
                            onChange={(url) => set({ logo_url_dark: url })}
                            defaultFolder="general"
                            aspect="square"
                            testId="settings-logo-dark-url"
                        />
                        <InlineMediaField
                            label="ITS Institution Logo"
                            value={current.its_logo_url}
                            onChange={(url) => set({ its_logo_url: url })}
                            defaultFolder="general"
                            aspect="square"
                            testId="settings-its-logo-url"
                        />
                        <InlineMediaField
                            label="Social Share Banner (OpenGraph Image)"
                            value={current.seo?.og_image_url}
                            onChange={(url) => set({ seo: { ...current.seo, og_image_url: url } })}
                            defaultFolder="general"
                            aspect="video"
                            testId="settings-og-image-url"
                        />
                    </div>
                </Panel>

                <Panel>
                    <AdminSectionHeader title="Contact details" />
                    <div className="mt-3 space-y-3">
                        <Field label="Email" value={current.contact?.email ?? ""} onChange={(v) => set({ contact: { ...current.contact, email: v } })} testId="settings-contact-email" />
                        <Field label="Phone" value={current.contact?.phone ?? ""} onChange={(v) => set({ contact: { ...current.contact, phone: v } })} help="Use the +62 format." testId="settings-contact-phone" />
                        <Field label="Room" value={current.contact?.room ?? ""} onChange={(v) => set({ contact: { ...current.contact, room: v } })} testId="settings-contact-room" />
                        <Field label="Address (English)" value={current.contact?.address ?? ""} onChange={(v) => set({ contact: { ...current.contact, address: v } })} testId="settings-contact-address" />
                        <Field label="Address (Bahasa Indonesia)" value={current.contact?.address_id ?? ""} onChange={(v) => set({ contact: { ...current.contact, address_id: v } })} testId="settings-contact-address-id" />
                        <Field label="Instagram" value={current.social?.instagram ?? ""} onChange={(v) => set({ social: { ...current.social, instagram: v } })} testId="settings-instagram" />
                    </div>
                </Panel>

                <Panel>
                    <AdminSectionHeader title="Announcement popup" />
                    <div className="mt-3 space-y-3">
                        <AdminSwitch
                            label="Show the popup to visitors"
                            checked={Boolean(current.announcement?.enabled)}
                            onCheckedChange={(next) => set({ announcement: { ...current.announcement, enabled: next } })}
                            testId="settings-announcement-enabled"
                        />
                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-[var(--tnl-heading)]">Presentation</span>
                            <AdminSelect
                                value={current.announcement?.style ?? "modal"}
                                onChange={(e) =>
                                    set({
                                        announcement: {
                                            ...current.announcement,
                                            style: e.target.value === "card" ? "card" : "modal",
                                        },
                                    })
                                }
                                data-testid="settings-announcement-style"
                            >
                                <option value="modal">Blocking dialog — centre of the screen</option>
                                <option value="card">Floating card — corner, page stays usable</option>
                            </AdminSelect>
                            <span className="mt-1 block text-xs text-[var(--tnl-body)]">
                                A blocking dialog suits time-critical news. A floating card never covers the page and
                                leaves Escape and background clicks alone.
                            </span>
                        </label>
                        <Field label="Title (English)" value={current.announcement?.title ?? ""} onChange={(v) => set({ announcement: { ...current.announcement, title: v } })} testId="settings-announcement-title" />
                        <Field label="Title (Bahasa Indonesia)" value={current.announcement?.title_id ?? ""} onChange={(v) => set({ announcement: { ...current.announcement, title_id: v } })} testId="settings-announcement-title-id" />
                        <Field label="Message (English)" value={current.announcement?.body ?? ""} onChange={(v) => set({ announcement: { ...current.announcement, body: v } })} testId="settings-announcement-body" />
                        <Field label="Message (Bahasa Indonesia)" value={current.announcement?.body_id ?? ""} onChange={(v) => set({ announcement: { ...current.announcement, body_id: v } })} testId="settings-announcement-body-id" />
                    </div>
                </Panel>

                <Panel>
                    <AdminSectionHeader title="Search, privacy and maintenance" />
                    <div className="mt-3 space-y-3">
                        <Field label="Search description" value={current.seo?.default_description ?? ""} onChange={(v) => set({ seo: { ...current.seo, default_description: v } })} testId="settings-seo-description" />
                        <Field
                            label="Keep registrant data for (days)"
                            value={String(current.retention_days ?? 90)}
                            onChange={(v) => set({ retention_days: Number(v) || 90 })}
                            help="After this, registrant details are anonymised. Required by UU PDP."
                            testId="settings-retention"
                        />
                        <div>
                            <label className="mb-1.5 block text-sm font-medium">Analytics snippet</label>
                            <textarea className="tnl-field font-mono text-xs" rows={4} value={current.analytics_snippet ?? ""} onChange={(e) => set({ analytics_snippet: e.target.value })} data-testid="settings-analytics" />
                        </div>
                        <AdminSwitch
                            label="Maintenance mode — visitors see a notice instead of the site"
                            checked={Boolean(current.maintenance_mode)}
                            onCheckedChange={(next) => set({ maintenance_mode: next })}
                            testId="settings-maintenance"
                        />
                    </div>
                </Panel>

                <Panel>
                    <AdminSectionHeader title="Visual Identity & GSM Standards" />
                    <div className="mt-3 space-y-3">
                        <AdminCard className="p-3 sm:p-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Edisi GSM Aktif:</span>
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-[var(--gsm-emerald)] text-white">
                                    {current.theme_tokens?.gsm_edition_label || "GSM Kabinet Keberlanjutan 2026"}
                                </span>
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                                <span className="text-[11px] text-gray-500">Palet Baku:</span>
                                <div className="flex items-center gap-1.5">
                                    <span className="h-4 w-4 rounded-full border border-black/10 inline-block bg-[var(--gsm-primary)]" title="Primary (CMS)" />
                                    <span className="h-4 w-4 rounded-full border border-black/10 inline-block bg-[var(--gsm-emerald)]" title="Emerald Glow (CMS)" />
                                    <span className="h-4 w-4 rounded-full border border-black/10 inline-block bg-[#0C100E]" title="Obsidian Dark (#0C100E)" />
                                    <span className="h-4 w-4 rounded-full border border-black/10 inline-block bg-[#A8977B]" title="Accent Warm Sand (#A8977B)" />
                                </div>
                            </div>
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                Pengaturan token warna global, kontras aksesibilitas WCAG, dan pratinjau live mode terang/gelap dikelola secara terpusat di halaman Tema.
                            </p>
                        </AdminCard>
                        <Link
                            to="/admin/theme"
                            className="tnl-btn tnl-btn-outline inline-flex items-center justify-center w-full h-10 min-h-[40px] text-xs font-semibold"
                            data-testid="settings-goto-theme-button"
                        >
                            Kelola Tema & Token Warna GSM →
                        </Link>
                    </div>
                </Panel>

                {/* Import dari Figma Tokens (JSON) */}
                <Panel>
                    <div className="flex items-center gap-2">
                        <FileJson className="h-5 w-5 text-[var(--gsm-accent)]" />
                        <AdminSectionHeader title="Import dari Figma Tokens (JSON)" />
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Unggah file <code className="font-mono text-[11px]">.json</code> hasil ekspor plugin <strong>Tokens Studio for Figma</strong> atau W3C Design Tokens untuk sinkronisasi warna GSM secara instan.
                    </p>

                    <div className="mt-3 space-y-3">
                        <div>
                            <label className="block text-xs font-medium mb-1">Pilih File JSON (.json)</label>
                            <input
                                type="file"
                                accept=".json,application/json"
                                onChange={handleFileUpload}
                                className="block w-full text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[var(--gsm-primary)] file:text-white hover:file:opacity-90"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium mb-1">Atau Tempel JSON Tokens Studio / W3C</label>
                            <textarea
                                rows={4}
                                className="tnl-field font-mono text-[11px]"
                                placeholder='{"primary": {"value": "#223027"}, "emerald": {"value": "#5D8A6B"}, "accent": {"value": "#A8977B"}}'
                                value={figmaRawJson}
                                onChange={(e) => handleJsonPaste(e.target.value)}
                            />
                        </div>

                        {jsonImportPreview && (
                            <div className="rounded-lg border p-2.5 bg-[var(--gsm-bg-elevated)] border-[var(--gsm-emerald)] text-xs text-[var(--gsm-emerald)]">
                                <span className="font-semibold block mb-1">✓ JSON Terdeteksi Valid</span>
                                <span className="text-[11px]">Struktur token terbaca dan siap disuntikkan ke draf tema.</span>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => {
                                if (!jsonImportPreview) {
                                    toast.error("Masukkan atau unggah JSON terlebih dahulu.");
                                    return;
                                }
                                importTokensMutation.mutate(jsonImportPreview);
                            }}
                            disabled={!jsonImportPreview || importTokensMutation.isPending}
                            className="tnl-btn tnl-btn-primary w-full h-10 min-h-[40px] text-xs font-semibold flex items-center justify-center gap-1.5"
                            data-testid="settings-import-figma-tokens-button"
                        >
                            <Upload className="h-4 w-4" />
                            {importTokensMutation.isPending ? "Mengimpor..." : "Terapkan ke Draf Tema GSM"}
                        </button>
                    </div>
                </Panel>

                {/* Koneksi Plugin Figma (TNL CMS Sync) */}
                <Panel>
                    <div className="flex items-center gap-2">
                        <KeyRound className="h-5 w-5 text-[var(--gsm-emerald)]" />
                        <AdminSectionHeader title="Koneksi Plugin Figma (TNL CMS Sync)" />
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Gunakan plugin privat <strong>TNL Studio CMS Sync</strong> di Figma untuk mengirim seleksi frame langsung menjadi draf halaman di CMS.
                    </p>

                    <div className="mt-3 space-y-3">
                        <AdminCard className="p-3 sm:p-3 text-xs space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-gray-500">Status Token:</span>
                                <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${figmaStatus?.configured ? "bg-[var(--gsm-bg-elevated)] text-[var(--gsm-emerald)]" : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300"}`}>
                                    {figmaStatus?.configured ? `Aktif (${figmaStatus.prefix})` : "Belum Dikonfigurasi"}
                                </span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-gray-500">Endpoint Frame Sync:</span>
                                <code className="font-mono text-[10px] break-all p-1 bg-[var(--tnl-surface-2)] rounded">
                                    {figmaStatus?.endpoint_sync_frame || "https://labtnl.site/api/admin/figma/sync-frame"}
                                </code>
                            </div>
                        </AdminCard>

                        {generatedToken && (
                            <div className="rounded-lg border p-3 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/50">
                                <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block mb-1">
                                    Simpan Token Figma Ini Sekarang
                                </span>
                                <p className="text-[11px] text-amber-700 dark:text-amber-300 mb-2">
                                    Token lengkap hanya ditampilkan sekali ini untuk keamanan.
                                </p>
                                <div className="flex items-center gap-1.5">
                                    <input
                                        type="text"
                                        readOnly
                                        value={generatedToken}
                                        className="tnl-field font-mono text-xs flex-1"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            void navigator.clipboard.writeText(generatedToken);
                                            setCopiedToken(true);
                                            setTimeout(() => setCopiedToken(false), 2000);
                                            toast.success("Token disalin!");
                                        }}
                                        className="tnl-btn tnl-btn-outline shrink-0 h-[42px] px-3 text-xs"
                                    >
                                        {copiedToken ? <Check className="h-4 w-4 text-[var(--gsm-emerald)]" /> : <Copy className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => generateToken.mutate()}
                                disabled={generateToken.isPending}
                                className="tnl-btn tnl-btn-outline flex-1 h-10 min-h-[40px] text-xs font-semibold flex items-center justify-center gap-1.5"
                                data-testid="settings-generate-figma-token-button"
                            >
                                <KeyRound className="h-4 w-4" />
                                {generateToken.isPending ? "Memproses..." : figmaStatus?.configured ? "Rotasi Figma Token" : "Generate Figma Sync Token"}
                            </button>
                        </div>
                    </div>
                </Panel>
            </div>
        </div>
    );
}

function Field({ label, value, onChange, help, testId }: { label: string; value: string; onChange: (v: string) => void; help?: string; testId: string }) {
    return (
        <div>
            <label className="mb-1.5 block text-sm font-medium">{label}</label>
            <input className="tnl-field" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} data-testid={testId} />
            {help ? <p className="mt-1 text-xs" style={{ color: "var(--tnl-tan-text)" }}>{help}</p> : null}
        </div>
    );
}

// ---------------------------------------------------------------- users & keys
export function UsersPage() {
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ["admin", "users"],
        queryFn: () => apiGet<ListResponse<AuthUser>>("/admin/users"),
        retry: false,
    });
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [role, setRole] = useState("contributor");

    const refresh = () => void qc.invalidateQueries({ queryKey: ["admin", "users"] });

    const invite = useMutation({
        mutationFn: () => apiPost<AuthUser>("/admin/users", { name, email, role, divisions: [] }),
        onSuccess: () => {
            setName("");
            setEmail("");
            refresh();
            toast.success("Invitation sent. They set their own password from the link.");
        },
        onError: (err) => toast.error(adminError(err, "Could not invite this person.")),
    });

    const update = useMutation({
        mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => apiPatch<AuthUser>(`/admin/users/${id}`, patch),
        onSuccess: () => {
            refresh();
            toast.success("Updated.");
        },
        onError: (err) => toast.error(adminError(err, "Could not update this account.")),
    });

    const users = data?.items ?? [];

    return (
        <div data-testid="users-page">
            <AdminPageHeader
                title="People & access"
                description="Who can sign in to TNL Studio and what they may do. The last active Super Admin can never be removed, so nobody gets locked out."
                testId="users-header"
            />

            <Panel className="mb-6">
                <AdminSectionHeader title="Invite someone" />
                <div className="mt-3 grid gap-3 lg:grid-cols-4">
                    <input className="tnl-field" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" data-testid="invite-name-input" />
                    <input className="tnl-field" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" data-testid="invite-email-input" />
                    <AdminSelect value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" data-testid="invite-role-select">
                        {["super_admin", "editor", "contributor", "registrar", "viewer"].map((r) => (
                            <option key={r} value={r}>
                                {r.replace("_", " ")}
                            </option>
                        ))}
                    </AdminSelect>
                    <button type="button" onClick={() => invite.mutate()} className="tnl-btn tnl-btn-primary" disabled={!name.trim() || !email.trim()} data-testid="invite-submit">
                        Send invitation
                    </button>
                </div>
            </Panel>

            {isLoading ? (
                <Spinner label="Loading…" />
            ) : (
                <Panel className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="users-table">
                        <thead>
                            <tr className="text-left" style={{ color: "var(--tnl-tan-text)" }}>
                                <th className="pb-2 pr-4 font-semibold">Name</th>
                                <th className="pb-2 pr-4 font-semibold">Role</th>
                                <th className="pb-2 pr-4 font-semibold">Active</th>
                                <th className="pb-2 font-semibold">Change</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => (
                                <tr key={user.id} className="border-t" style={{ borderColor: "var(--tnl-border)" }} data-testid={`user-row-${user.id}`}>
                                    <td className="py-3 pr-4">
                                        <span className="font-medium">{user.name}</span>
                                        <span className="block text-xs" style={{ color: "var(--tnl-tan-text)" }}>{user.email}</span>
                                    </td>
                                    <td className="py-3 pr-4 capitalize">{user.role.replace("_", " ")}</td>
                                    <td className="py-3 pr-4">{user.active ? "Yes" : "No"}</td>
                                    <td className="py-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <AdminSelect
                                                value={user.role}
                                                onChange={(e) => update.mutate({ id: user.id, patch: { role: e.target.value } })}
                                                aria-label={`Role for ${user.name}`}
                                                data-testid={`user-role-${user.id}`}
                                            >
                                                {["super_admin", "editor", "contributor", "registrar", "viewer"].map((r) => (
                                                    <option key={r} value={r}>
                                                        {r.replace("_", " ")}
                                                    </option>
                                                ))}
                                            </AdminSelect>
                                            <button
                                                type="button"
                                                onClick={() => update.mutate({ id: user.id, patch: { active: !user.active } })}
                                                className="rounded-[6px] border px-3 py-1.5 text-xs font-medium"
                                                style={{ borderColor: "var(--tnl-border)" }}
                                                data-testid={`user-toggle-${user.id}`}
                                            >
                                                {user.active ? "Deactivate" : "Reactivate"}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Panel>
            )}
        </div>
    );
}

export function ApiKeysPage() {
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ["admin", "api-keys"],
        queryFn: () => apiGet<ListResponse<ApiKeyRecord>>("/admin/api-keys"),
        retry: false,
    });
    const [name, setName] = useState("");
    const [write, setWrite] = useState(false);
    const [fresh, setFresh] = useState<string | null>(null);

    const create = useMutation({
        mutationFn: () => apiPost<ApiKeyRecord>("/admin/api-keys", { name, scopes: write ? ["read", "write"] : ["read"] }),
        onSuccess: (res) => {
            setFresh(res.key ?? null);
            setName("");
            void qc.invalidateQueries({ queryKey: ["admin", "api-keys"] });
            toast.success("Key created — copy it now, it is shown only once.");
        },
        onError: (err) => toast.error(adminError(err, "Could not create the key.")),
    });

    const revoke = useMutation({
        mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/admin/api-keys/${id}`),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ["admin", "api-keys"] });
            toast.success("Key revoked.");
        },
    });

    const keys = data?.items ?? [];

    return (
        <div data-testid="api-keys-page">
            <AdminPageHeader
                title="API keys"
                description="Keys let other programs read the website's content, or publish news and members automatically."
                actions={
                    <a href="/api/v1-docs/openapi" target="_blank" rel="noopener noreferrer" className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm" data-testid="api-docs-link">
                        API documentation
                    </a>
                }
                testId="api-keys-header"
            />

            <Panel className="mb-6">
                <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                    <input className="tnl-field" placeholder="What is this key for?" value={name} onChange={(e) => setName(e.target.value)} aria-label="Key name" data-testid="api-key-name-input" />
                    <AdminSwitch
                        className="items-center"
                        label="Allow publishing"
                        checked={write}
                        onCheckedChange={setWrite}
                        testId="api-key-write-checkbox"
                    />
                    <button type="button" onClick={() => create.mutate()} className="tnl-btn tnl-btn-primary" disabled={!name.trim()} data-testid="api-key-create-button">
                        Create key
                    </button>
                </div>
                {fresh ? (
                    <div className="mt-4 rounded-[8px] border px-4 py-3" style={{ borderColor: "var(--tnl-green)" }} data-testid="api-key-fresh">
                        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>Copy this now</p>
                        <code className="mt-1 block break-all text-sm">{fresh}</code>
                    </div>
                ) : null}
            </Panel>

            {isLoading ? (
                <Spinner label="Loading…" />
            ) : keys.length === 0 ? (
                <Panel>
                    <p className="text-sm text-[var(--tnl-body)]" data-testid="api-keys-empty">No keys yet.</p>
                </Panel>
            ) : (
                <Panel className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="api-keys-table">
                        <thead>
                            <tr className="text-left" style={{ color: "var(--tnl-tan-text)" }}>
                                <th className="pb-2 pr-4 font-semibold">Name</th>
                                <th className="pb-2 pr-4 font-semibold">Allows</th>
                                <th className="pb-2 pr-4 font-semibold">Calls</th>
                                <th className="pb-2 font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {keys.map((key) => (
                                <tr key={key.id} className="border-t" style={{ borderColor: "var(--tnl-border)" }} data-testid={`api-key-row-${key.id}`}>
                                    <td className="py-3 pr-4">
                                        <span className="font-medium">{key.name}</span>
                                        <span className="block text-xs font-mono" style={{ color: "var(--tnl-tan-text)" }}>{key.prefix}…</span>
                                    </td>
                                    <td className="py-3 pr-4">{key.scopes.join(", ")}</td>
                                    <td className="py-3 pr-4">{key.calls}</td>
                                    <td className="py-3">
                                        {key.active ? (
                                            <ConfirmButton label="Revoke" confirmLabel="Revoke it" question="Revoke this key?" onConfirm={() => revoke.mutate(key.id)} testId={`api-key-revoke-${key.id}`} />
                                        ) : (
                                            <span className="text-xs" style={{ color: "var(--tnl-tan-text)" }}>revoked</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Panel>
            )}
        </div>
    );
}
