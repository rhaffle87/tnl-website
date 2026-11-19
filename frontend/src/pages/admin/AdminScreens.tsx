// Media library, Registrar dashboard, Contact inbox (with Jev triage/scoring),
// Theme editor, Settings, People & access, API keys.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Award, Download, FileSpreadsheet, RefreshCw, Sparkles, Upload } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import { AdminHeader, ConfirmButton, Panel, adminError } from "@/pages/admin/AdminUI";
import { Spinner } from "@/components/site/Primitives";
import type {
    ApiKeyRecord,
    AuthUser,
    ContactMessage,
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
            <AdminHeader
                title="Media library"
                help="Upload pictures and documents once, then paste their link wherever you need them. Every image needs a description."
                testId="media-header"
            />

            <Panel className="mb-6">
                <h2 className="tnl-h5 text-[18px]">Upload a file</h2>
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
export function RegistrarPage() {
    const qc = useQueryClient();
    const [eventId, setEventId] = useState("");
    const [status, setStatus] = useState("");
    const [checkinCode, setCheckinCode] = useState("");

    const { data: events } = useQuery({
        queryKey: ["admin", "content", "events", "all"],
        queryFn: () => apiGet<ListResponse<LabEvent>>("/admin/content/events?limit=200"),
        retry: false,
    });

    const { data, isLoading } = useQuery({
        queryKey: ["admin", "registrations", eventId, status],
        queryFn: () =>
            apiGet<{ items: Registration[]; total: number; counts: Record<string, number> }>(
                `/admin/registrations?limit=200${eventId ? `&event_id=${eventId}` : ""}${status ? `&status=${status}` : ""}`,
            ),
        retry: false,
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

    const scoreAll = useMutation({
        mutationFn: () => apiPost<{ scored: number; examined: number }>("/admin/registrations/score-all", { event_id: eventId }),
        onSuccess: (res) => {
            refresh();
            toast.success(`Scored ${res.scored} of ${res.examined} registration(s).`);
        },
        onError: (err) => toast.error(adminError(err, "Scoring is busy. Try again shortly.")),
    });

    const checkin = useMutation({
        mutationFn: () => apiPost<{ name: string; message: string }>("/admin/registrations/checkin", { code: checkinCode }),
        onSuccess: (res) => {
            refresh();
            setCheckinCode("");
            toast.success(`${res.name}: ${res.message}`);
        },
        onError: (err) => toast.error(adminError(err, "No registration matches this code.")),
    });

    const issueCerts = useMutation({
        mutationFn: () => apiPost<{ ok: boolean; issued: number }>("/admin/registrations/issue-certificates", { event_id: eventId }),
        onSuccess: (res) => {
            refresh();
            toast.success(`Issued ${res.issued} certificate(s).`);
        },
        onError: (err) => toast.error(adminError(err, "Could not issue certificates.")),
    });

    const syncSheet = useMutation({
        mutationFn: () => apiPost<{ synced: number; failed: number; total: number }>("/admin/registrations/sync-sheet", { event_id: eventId || undefined, force: true }),
        onSuccess: (res) => {
            refresh();
            toast.success(`Synced ${res.synced} registration(s) to Google Sheets.`);
        },
        onError: (err) => toast.error(adminError(err, "Spreadsheet sync failed. Verify webhook URL.")),
    });

    const items = data?.items ?? [];
    const exportCsvUrl = `/api/admin/registrations/export${eventId ? `?event_id=${eventId}` : ""}${status ? `${eventId ? "&" : "?"}status=${status}` : ""}`;
    const exportExcelUrl = `/api/admin/registrations/export-excel${eventId ? `?event_id=${eventId}` : ""}${status ? `${eventId ? "&" : "?"}status=${status}` : ""}`;

    return (
        <div data-testid="registrar-page">
            <AdminHeader
                title="Registrations"
                help="Everyone who signed up for a programme. Accept or reject them, check people in at the door, sync to Google Sheets, and export the list."
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => syncSheet.mutate()}
                            className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm"
                            disabled={syncSheet.isPending}
                            data-testid="sync-sheet-btn"
                            title="Force sync unsynced or all registrations to configured Google Spreadsheet Webhook"
                        >
                            <RefreshCw className={`h-4 w-4 ${syncSheet.isPending ? "animate-spin" : ""}`} aria-hidden="true" />
                            {syncSheet.isPending ? "Syncing…" : "Sync Sheets"}
                        </button>
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

            <Panel className="mb-5">
                <div className="grid gap-3 lg:grid-cols-3">
                    <select className="tnl-field" value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="Event" data-testid="registrations-event-filter">
                        <option value="">All events</option>
                        {(events?.items ?? []).map((ev) => (
                            <option key={ev.id} value={ev.id}>
                                {ev.title}
                            </option>
                        ))}
                    </select>
                    <select className="tnl-field" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" data-testid="registrations-status-filter">
                        <option value="">All statuses</option>
                        {["pending", "accepted", "rejected", "attended", "waitlisted"].map((s) => (
                            <option key={s} value={s}>
                                {s} {data?.counts?.[s] !== undefined ? `(${data.counts[s]})` : ""}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() => scoreAll.mutate()}
                        className="tnl-btn tnl-btn-outline"
                        disabled={!eventId || scoreAll.isPending}
                        data-testid="registrations-score-button"
                    >
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        {scoreAll.isPending ? "Scoring…" : "Score registrations"}
                    </button>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
                    <input className="tnl-field" placeholder="Scan or type a check-in code" value={checkinCode} onChange={(e) => setCheckinCode(e.target.value)} aria-label="Check-in code" data-testid="checkin-code-input" />
                    <button type="button" onClick={() => checkin.mutate()} className="tnl-btn tnl-btn-primary" disabled={!checkinCode.trim()} data-testid="checkin-submit-button">
                        Check in
                    </button>
                </div>
            </Panel>

            {isLoading ? (
                <Spinner label="Loading…" />
            ) : items.length === 0 ? (
                <Panel>
                    <p className="text-sm text-[var(--tnl-body)]" data-testid="registrations-empty">No registrations yet.</p>
                </Panel>
            ) : (
                <Panel className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="registrations-table">
                        <thead>
                            <tr className="text-left" style={{ color: "var(--tnl-tan-text)" }}>
                                <th className="pb-2 pr-4 font-semibold">Name</th>
                                <th className="pb-2 pr-4 font-semibold">Event</th>
                                <th className="pb-2 pr-4 font-semibold">Status</th>
                                <th className="pb-2 pr-4 font-semibold">Certificate</th>
                                <th className="pb-2 pr-4 font-semibold">Quality</th>
                                <th className="pb-2 font-semibold">Decide</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((reg) => (
                                <tr key={reg.id} className="border-t" style={{ borderColor: "var(--tnl-border)" }} data-testid={`registration-row-${reg.id}`}>
                                    <td className="py-3 pr-4">
                                        <span className="font-medium">{reg.display_name ?? reg.email}</span>
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
                                    <td className="py-3 pr-4 text-xs">
                                        {reg.ai_score?.ai_ok ? (
                                            <span data-testid={`registration-score-${reg.id}`}>
                                                {reg.ai_score.fit_label}
                                                {(reg.ai_score.junk_probability ?? 0) > 0.6 ? (
                                                    <span className="ml-1 font-bold" style={{ color: "#b91c1c" }}>· looks like junk</span>
                                                ) : null}
                                            </span>
                                        ) : (
                                            <span style={{ color: "var(--tnl-tan-text)" }}>not scored</span>
                                        )}
                                    </td>
                                    <td className="py-3">
                                        <div className="flex flex-wrap gap-2">
                                            {["accepted", "rejected", "attended"].map((next) => (
                                                <button
                                                    key={next}
                                                    type="button"
                                                    onClick={() => setRegStatus.mutate({ id: reg.id, next })}
                                                    className="rounded-[6px] border px-2.5 py-1 text-xs font-medium capitalize"
                                                    style={{ borderColor: "var(--tnl-border)" }}
                                                    data-testid={`registration-${next}-${reg.id}`}
                                                >
                                                    {next}
                                                </button>
                                            ))}
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
            <AdminHeader
                title="Contact inbox"
                help="Messages sent through the contact form. Use “Sort messages” to group them by topic and urgency."
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
                                                <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: "#fee2e2", color: "#b91c1c" }}>
                                                    likely spam
                                                </span>
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

    return (
        <div data-testid="theme-page">
            <AdminHeader
                title="Colours & theme"
                help="Change the look of the whole site. Nothing goes live until you click “Publish theme”."
                actions={
                    <>
                        <button type="button" onClick={() => reset.mutate()} className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm" data-testid="theme-reset-button">
                            Reset to TNL default
                        </button>
                        <button type="button" onClick={() => save.mutate()} className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm" data-testid="theme-save-draft-button">
                            Save draft
                        </button>
                        <button type="button" onClick={() => publish.mutate()} className="tnl-btn tnl-btn-primary h-10 min-h-[40px] text-sm" data-testid="theme-publish-button">
                            Publish theme
                        </button>
                    </>
                }
                testId="theme-header"
            />

            <div className="grid gap-4 lg:grid-cols-2">
                <Panel>
                    <h2 className="tnl-h5 text-[18px]">Colours</h2>
                    <div className="mt-4 space-y-3">
                        {colorKeys.map((key) => (
                            <div key={key} className="flex items-center gap-3">
                                <input
                                    type="color"
                                    value={String(tokens[key])}
                                    onChange={(e) => setDraft({ ...tokens, [key]: e.target.value })}
                                    className="h-10 w-14 shrink-0 cursor-pointer rounded border"
                                    style={{ borderColor: "var(--tnl-border)" }}
                                    aria-label={LABELS[key]}
                                    data-testid={`theme-color-${key}`}
                                />
                                <div className="min-w-0 flex-1">
                                    <label className="block text-sm font-medium">{LABELS[key]}</label>
                                    <span className="text-xs font-mono" style={{ color: "var(--tnl-tan-text)" }}>{String(tokens[key])}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </Panel>

                <Panel>
                    <h2 className="tnl-h5 text-[18px]">Readability check</h2>
                    <p className="mt-1 text-sm text-[var(--tnl-body)]">
                        Every pair below must pass before the theme can go live. Save the draft to refresh these numbers.
                    </p>
                    <ul className="mt-4 space-y-2" data-testid="theme-contrast-list">
                        {(data?.contrast ?? []).map((check) => (
                            <li
                                key={check.label}
                                className="flex items-center justify-between gap-3 rounded-[8px] border px-4 py-2.5 text-sm"
                                style={{ borderColor: check.passes ? "var(--tnl-border)" : "#fecaca" }}
                                data-testid={`theme-contrast-${check.passes ? "pass" : "fail"}`}
                            >
                                <span>{check.label}</span>
                                <span className="font-semibold" style={{ color: check.passes ? "#2e7d32" : "#b91c1c" }}>
                                    {check.ratio} {check.passes ? "OK" : `needs ${check.required}`}
                                </span>
                            </li>
                        ))}
                    </ul>
                </Panel>
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
    const current = { ...(data ?? {}), ...(form ?? {}) } as SiteSettings;

    const save = useMutation({
        mutationFn: () =>
            apiPut<SiteSettings>("/admin/settings", {
                site_title: current.site_title,
                site_title_id: current.site_title_id,
                short_name: current.short_name,
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
            <AdminHeader
                title="Site settings"
                help="The one place for the laboratory's name, contact details and social links. The footer and the contact page both read from here, so they can never disagree."
                actions={
                    <button type="button" onClick={() => save.mutate()} className="tnl-btn tnl-btn-primary h-10 min-h-[40px] text-sm" data-testid="settings-save-button">
                        Save settings
                    </button>
                }
                testId="settings-header"
            />

            <div className="grid gap-4 lg:grid-cols-2">
                <Panel>
                    <h2 className="tnl-h5 text-[18px]">Laboratory identity</h2>
                    <div className="mt-3 space-y-3">
                        <Field label="Name (English)" value={current.site_title} onChange={(v) => set({ site_title: v })} testId="settings-title-en" />
                        <Field label="Name (Bahasa Indonesia)" value={current.site_title_id} onChange={(v) => set({ site_title_id: v })} testId="settings-title-id" />
                        <Field label="Short name" value={current.short_name} onChange={(v) => set({ short_name: v })} testId="settings-short-name" />
                        <div>
                            <label className="mb-1.5 block text-sm font-medium">Default language</label>
                            <select className="tnl-field" value={current.language_default} onChange={(e) => set({ language_default: e.target.value })} data-testid="settings-language">
                                <option value="id">Bahasa Indonesia</option>
                                <option value="en">English</option>
                            </select>
                        </div>
                    </div>
                </Panel>

                <Panel>
                    <h2 className="tnl-h5 text-[18px]">Contact details</h2>
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
                    <h2 className="tnl-h5 text-[18px]">Announcement popup</h2>
                    <div className="mt-3 space-y-3">
                        <label className="flex items-center gap-3 text-sm">
                            <input
                                type="checkbox"
                                className="h-5 w-5"
                                checked={Boolean(current.announcement?.enabled)}
                                onChange={(e) => set({ announcement: { ...current.announcement, enabled: e.target.checked } })}
                                data-testid="settings-announcement-enabled"
                            />
                            Show the popup to visitors
                        </label>
                        <Field label="Title (English)" value={current.announcement?.title ?? ""} onChange={(v) => set({ announcement: { ...current.announcement, title: v } })} testId="settings-announcement-title" />
                        <Field label="Title (Bahasa Indonesia)" value={current.announcement?.title_id ?? ""} onChange={(v) => set({ announcement: { ...current.announcement, title_id: v } })} testId="settings-announcement-title-id" />
                        <Field label="Message (English)" value={current.announcement?.body ?? ""} onChange={(v) => set({ announcement: { ...current.announcement, body: v } })} testId="settings-announcement-body" />
                        <Field label="Message (Bahasa Indonesia)" value={current.announcement?.body_id ?? ""} onChange={(v) => set({ announcement: { ...current.announcement, body_id: v } })} testId="settings-announcement-body-id" />
                    </div>
                </Panel>

                <Panel>
                    <h2 className="tnl-h5 text-[18px]">Search, privacy and maintenance</h2>
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
                        <label className="flex items-center gap-3 text-sm">
                            <input type="checkbox" className="h-5 w-5" checked={Boolean(current.maintenance_mode)} onChange={(e) => set({ maintenance_mode: e.target.checked })} data-testid="settings-maintenance" />
                            Maintenance mode — visitors see a notice instead of the site
                        </label>
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
            <AdminHeader
                title="People & access"
                help="Who can sign in to TNL Studio and what they may do. The last active Super Admin can never be removed, so nobody gets locked out."
                testId="users-header"
            />

            <Panel className="mb-6">
                <h2 className="tnl-h5 text-[18px]">Invite someone</h2>
                <div className="mt-3 grid gap-3 lg:grid-cols-4">
                    <input className="tnl-field" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" data-testid="invite-name-input" />
                    <input className="tnl-field" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" data-testid="invite-email-input" />
                    <select className="tnl-field" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" data-testid="invite-role-select">
                        {["super_admin", "editor", "contributor", "registrar", "viewer"].map((r) => (
                            <option key={r} value={r}>
                                {r.replace("_", " ")}
                            </option>
                        ))}
                    </select>
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
                                            <select
                                                className="rounded-[6px] border px-2 py-1.5 text-xs"
                                                style={{ borderColor: "var(--tnl-border)" }}
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
                                            </select>
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
            <AdminHeader
                title="API keys"
                help="Keys let other programs read the website's content, or publish news and members automatically."
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
                    <label className="flex h-[50px] items-center gap-2 text-sm">
                        <input type="checkbox" className="h-5 w-5" checked={write} onChange={(e) => setWrite(e.target.checked)} data-testid="api-key-write-checkbox" />
                        Allow publishing
                    </label>
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
