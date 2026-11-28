import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Award, Download, FileSpreadsheet, Mail, QrCode } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/api";
import { useAdminT } from "@/lib/i18n/admin-i18n";
import { FEATURES } from "@/lib/utils/features";
import { AdminCard, AdminPageHeader, AdminSelect, AdminStatusBadge, ConfirmButton, Panel, adminError } from "@/pages/admin/AdminUI";
import { useMe } from "@/lib/api/hooks";
import { Spinner } from "@/components/site/Primitives";
import { PrivacyJobs } from "@/components/admin/PrivacyJobs";
import type { LabEvent, ListResponse, Registration } from "@/lib/types/types";

export function publishedEventQuota(events: LabEvent[] | undefined): number {
    return (events ?? [])
        .filter((ev) => ev.status === "published")
        .reduce((sum, ev) => sum + (ev.capacity || 0), 0);
}

export function RegistrarPage() {
    const t = useAdminT();
    const qc = useQueryClient();
    const { data: me } = useMe();
    const canManage = ["super_admin", "admin", "registrar"].includes(me?.role ?? "");
    const [eventId, setEventId] = useState("");
    const [status, setStatus] = useState("");
    const [checkinCode, setCheckinCode] = useState("");
    const [checkinResult, setCheckinResult] = useState<{ ok: boolean; text: string } | null>(null);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulkEventId, setBulkEventId] = useState("");
    const [bulkStatus, setBulkStatus] = useState("");
    const [bulkSubject, setBulkSubject] = useState("");
    const [bulkBody, setBulkBody] = useState("");
    const [bulkResult, setBulkResult] = useState<string | null>(null);

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
        void qc.invalidateQueries({ queryKey: ["admin", "privacy-jobs"] });
    };

    const setRegStatus = useMutation({
        mutationFn: ({ id, next }: { id: string; next: string }) => apiPatch<Registration>(`/admin/registrations/${id}`, { status: next }),
        onSuccess: () => {
            refresh();
            toast.success(t("adminRegistrarUpdated"));
        },
        onError: (err) => toast.error(adminError(err, t("adminRegistrarUpdateError"))),
    });

    const withdrawReg = useMutation({
        mutationFn: (id: string) => apiPost<{ ok: boolean; status: string }>(`/admin/registrations/${id}/withdraw`, {}),
        onSuccess: () => {
            refresh();
            toast.success(t("adminRegistrarWithdrawn"));
        },
        onError: (err) => toast.error(adminError(err, t("adminRegistrarWithdrawError"))),
    });

    const anonymizeReg = useMutation({
        mutationFn: (id: string) => apiPost<{ ok: boolean; privacy_status?: string; message?: string }>(`/admin/registrations/${id}/anonymize`, {}),
        onSuccess: (res) => {
            refresh();
            toast.success(t(res.privacy_status === "pending" ? "adminPrivacyStillPending" : "adminPrivacyCompleted"));
        },
        onError: (err) => toast.error(adminError(err, t("adminRegistrarAnonymizeError"))),
    });

    const retentionSweep = useMutation({
        mutationFn: () => apiPost<{ ok: boolean; anonymized?: number; queued?: number }>("/admin/registrations/retention-sweep", {}),
        onSuccess: (res) => {
            refresh();
            const count = res.anonymized ?? res.queued ?? 0;
            toast.success(t("adminRegistrarRetentionSweepDone").replace("{count}", String(count)));
        },
        onError: (err) => toast.error(adminError(err, t("adminRegistrarRetentionSweepError"))),
    });

    const bulkEmail = useMutation({
        mutationFn: () => {
            const targetEvent = bulkEventId || eventId;
            if (!targetEvent) {
                return Promise.reject(new Error(t("adminRegistrarBulkEmailNeedEvent")));
            }
            return apiPost<{ ok: boolean; queued: number; failed: number; skipped: number }>("/admin/registrations/bulk-email", {
                event_id: targetEvent,
                status_filter: bulkStatus || null,
                subject: bulkSubject,
                body: bulkBody,
            });
        },
        onSuccess: (res) => {
            const msg = t("adminRegistrarBulkEmailResult")
                .replace("{queued}", String(res.queued))
                .replace("{skipped}", String(res.skipped))
                .replace("{failed}", String(res.failed));
            setBulkResult(msg);
            setBulkSubject("");
            setBulkBody("");
            void qc.invalidateQueries({ queryKey: ["admin", "outbox"] });
            toast.success(msg);
        },
        onError: (err) => toast.error(err instanceof Error && !("body" in err) ? err.message : adminError(err, t("adminRegistrarBulkEmailError"))),
    });

    const deleteReg = useMutation({
        mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/admin/registrations/${id}`),
        onSuccess: () => {
            refresh();
            toast.success(t("adminRegistrarDeleted"));
        },
        onError: (err) => toast.error(adminError(err, t("adminRegistrarDeleteError"))),
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
            const message = adminError(err, t("adminRegistrarCheckinNotFound"));
            setCheckinResult({ ok: false, text: message });
            toast.error(message);
        },
    });

    const issueCerts = useMutation({
        mutationFn: () => apiPost<{ ok: boolean; issued: number }>("/admin/registrations/issue-certificates", { event_id: eventId }),
        onSuccess: (res) => {
            refresh();
            toast.success(t("adminRegistrarIssuedToast").replace("{count}", String(res.issued)));
        },
        onError: (err) => toast.error(adminError(err, t("adminRegistrarIssuedError"))),
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
                title={t("adminRegistrarTitle")}
                description={t(FEATURES.doorCheckIn || FEATURES.certificates ? "adminRegistrarDescEnabled" : "adminRegistrarDescLimited")}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <div
                            className="flex h-10 items-center gap-2 rounded-full border px-3"
                            style={{ borderColor: "var(--tnl-border)" }}
                            data-testid="registrations-live-badge"
                        >
                            <span className={`tnl-admin-live-badge-dot${isLive ? "" : " is-paused"}`} aria-hidden="true" />
                            <span className="text-xs font-medium">{t(isLive ? "adminRegistrarLive" : "adminRegistrarPaused")}</span>
                            <button
                                type="button"
                                onClick={() => setIsLive((v) => !v)}
                                className="text-xs underline"
                                style={{ color: "var(--tnl-link)" }}
                                data-testid="registrations-live-toggle"
                                aria-pressed={isLive}
                            >
                                {t(isLive ? "adminRegistrarPause" : "adminRegistrarResume")}
                            </button>
                            <span className="text-xs text-[var(--tnl-muted)]" data-testid="registrations-last-updated">
                                {dataUpdatedAt ? t("adminRegistrarUpdatedAt").replace("{time}", new Date(dataUpdatedAt).toLocaleTimeString()) : t("adminRegistrarWaiting")}
                            </span>
                        </div>
                        {FEATURES.certificates ? (
                            <button
                                type="button"
                                onClick={() => issueCerts.mutate()}
                                className="tnl-btn tnl-btn-primary h-10 min-h-[40px] text-sm"
                                disabled={!eventId || issueCerts.isPending}
                                data-testid="issue-certificates-btn"
                                title={t(!eventId ? "adminRegistrarIssueCertsDisabledTip" : "adminRegistrarIssueCertsTip")}
                            >
                                <Award className="h-4 w-4" aria-hidden="true" />
                                {t(issueCerts.isPending ? "adminRegistrarIssuingCerts" : "adminRegistrarIssueCerts")}
                            </button>
                        ) : null}
                        {canManage ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!bulkOpen && !bulkEventId && eventId) setBulkEventId(eventId);
                                        setBulkOpen((v) => !v);
                                    }}
                                    aria-expanded={bulkOpen}
                                    className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm"
                                    data-testid="registrar-bulk-email-open"
                                >
                                    <Mail className="h-4 w-4 mr-1.5" aria-hidden="true" />
                                    {t("adminRegistrarBulkEmail")}
                                </button>
                                <ConfirmButton
                                    label={t("adminRegistrarRetentionSweep")}
                                    confirmLabel={t("adminConfirm")}
                                    question={t("adminRegistrarRetentionSweepQuestion")}
                                    onConfirm={() => retentionSweep.mutate()}
                                    testId="registrar-retention-sweep"
                                />
                            </>
                        ) : null}
                        <a href={exportExcelUrl} className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm" data-testid="registrations-export-excel-button">
                            <FileSpreadsheet className="h-4 w-4 mr-1.5" aria-hidden="true" />
                            {t("adminRegistrarExportExcel")}
                        </a>
                        <a href={exportCsvUrl} className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm" data-testid="registrations-export-button">
                            <Download className="h-4 w-4 mr-1.5" aria-hidden="true" />
                            {t("adminRegistrarExportCsv")}
                        </a>
                    </div>
                }
                testId="registrar-header"
            />

            {bulkOpen && canManage ? (
                <Panel className="mb-5" data-testid="registrar-bulk-email-panel">
                    <div className="space-y-3">
                        <div className="grid gap-3 lg:grid-cols-2">
                            <AdminSelect
                                value={bulkEventId || eventId}
                                onChange={(e) => setBulkEventId(e.target.value)}
                                aria-label={t("adminRegistrarEventLabel")}
                                data-testid="bulk-email-event"
                            >
                                <option value="">{t("adminRegistrarAllEvents")}</option>
                                {(events?.items ?? []).map((ev) => (
                                    <option key={ev.id} value={ev.id}>{ev.title}</option>
                                ))}
                            </AdminSelect>
                            <AdminSelect
                                value={bulkStatus}
                                onChange={(e) => setBulkStatus(e.target.value)}
                                aria-label={t("adminRegistrarStatusLabel")}
                                data-testid="bulk-email-status"
                            >
                                <option value="">{t("adminRegistrarAllStatuses")}</option>
                                {["accepted", "attended", "waitlisted", "pending"].map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </AdminSelect>
                        </div>
                        <input
                            className="tnl-field"
                            placeholder={t("adminRegistrarBulkEmailSubject")}
                            value={bulkSubject}
                            onChange={(e) => setBulkSubject(e.target.value)}
                            aria-label={t("adminRegistrarBulkEmailSubject")}
                            data-testid="bulk-email-subject"
                        />
                        <textarea
                            className="tnl-field"
                            rows={4}
                            placeholder={t("adminRegistrarBulkEmailBody")}
                            value={bulkBody}
                            onChange={(e) => setBulkBody(e.target.value)}
                            aria-label={t("adminRegistrarBulkEmailBody")}
                            data-testid="bulk-email-body"
                        />
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={() => bulkEmail.mutate()}
                                disabled={!(bulkEventId || eventId) || !bulkSubject.trim() || !bulkBody.trim() || bulkEmail.isPending}
                                className="tnl-btn tnl-btn-primary h-10 min-h-[40px] text-sm"
                                data-testid="bulk-email-submit"
                            >
                                {t(bulkEmail.isPending ? "adminRegistrarBulkEmailSending" : "adminRegistrarBulkEmailSend")}
                            </button>
                            {bulkResult ? <span role="status" className="text-xs font-medium text-[var(--tnl-body)]" data-testid="bulk-email-result">{bulkResult}</span> : null}
                        </div>
                    </div>
                </Panel>
            ) : null}

            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="checkin-kpi-strip">
                <AdminCard className="!p-4" testId="checkin-kpi-registered">
                    <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>{t("adminRegistrarKpiRegistered")}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{registered} <span className="text-base font-medium" style={{ color: "var(--tnl-tan-text)" }}>/ {quota || "—"}</span></p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--tnl-border)" }}>
                        <div className="h-full rounded-full bg-[var(--tnl-green)]" style={{ width: `${quota ? Math.min(100, Math.round((registered / quota) * 100)) : 0}%` }} />
                    </div>
                </AdminCard>
                <AdminCard className="!p-4" testId="checkin-kpi-attended">
                    <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>{t("adminRegistrarKpiAttended")}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: "var(--tnl-green)" }}>{attended} <span className="text-base font-medium">· {attendedPct}%</span></p>
                    <p className="mt-2 text-xs" style={{ color: "var(--tnl-tan-text)" }}>{t("adminRegistrarKpiAttendedSub")}</p>
                </AdminCard>
                <AdminCard className="!p-4" testId="checkin-kpi-pending">
                    <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>{t("adminRegistrarKpiPending")}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{pending}</p>
                    <p className="mt-2 text-xs" style={{ color: "var(--tnl-tan-text)" }}>{t("adminRegistrarKpiPendingSub")}</p>
                </AdminCard>
                {rejected > 0 ? (
                    <AdminCard className="!p-4" testId="checkin-kpi-rejected">
                        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>{t("adminRegistrarKpiRejected")}</p>
                        <p className="mt-1 text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">{rejected}</p>
                    </AdminCard>
                ) : null}
            </div>

            <Panel className="mb-5">
                <div className="grid gap-3 lg:grid-cols-2">
                    <AdminSelect value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label={t("adminRegistrarEventLabel")} data-testid="registrations-event-filter">
                        <option value="">{t("adminRegistrarAllEvents")}</option>
                        {(events?.items ?? []).map((ev) => (
                            <option key={ev.id} value={ev.id}>
                                {ev.title}
                            </option>
                        ))}
                    </AdminSelect>
                    <AdminSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t("adminRegistrarStatusLabel")} data-testid="registrations-status-filter">
                        <option value="">{t("adminRegistrarAllStatuses")}</option>
                        {["pending", "accepted", "rejected", "attended", "waitlisted"].map((s) => (
                            <option key={s} value={s}>
                                {s} {data?.counts?.[s] !== undefined ? `(${data.counts[s]})` : ""}
                            </option>
                        ))}
                    </AdminSelect>
                </div>
                {FEATURES.doorCheckIn ? (
                <div className="mt-4 rounded-xl border border-[var(--tnl-green)]/40 bg-[var(--tnl-green)]/5 p-3">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--tnl-green)" }}>{t("adminDoorCheckIn")}</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                            className="tnl-field h-11 text-base"
                            placeholder={t("adminRegistrarCheckinPlaceholder")}
                            value={checkinCode}
                            onChange={(e) => setCheckinCode(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    if (checkinCode.trim()) checkin.mutate();
                                }
                            }}
                            aria-label={t("adminRegistrarCheckinLabel")}
                            data-testid="checkin-code-input"
                        />
                        <button
                            type="button"
                            onClick={() => checkin.mutate()}
                            className="tnl-btn tnl-btn-primary h-11 min-h-[44px] whitespace-nowrap shrink-0 px-5 text-sm"
                            disabled={!checkinCode.trim() || checkin.isPending}
                            data-testid="checkin-submit-button"
                        >
                            {t(checkin.isPending ? "adminRegistrarCheckingIn" : "adminRegistrarCheckinAction")}
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
                                aria-label={t("adminRegistrarCheckinDismiss")}
                                className="rounded px-1.5 text-base leading-none"
                            >
                                ×
                            </button>
                        </div>
                    ) : null}
                </div>
                ) : null}
            </Panel>

            {isLoading ? (
                <Spinner label={t("adminLoading")} />
            ) : items.length === 0 ? (
                <Panel>
                    <p className="text-sm text-[var(--tnl-body)]" data-testid="registrations-empty">{t("adminRegistrationsEmpty")}</p>
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
                                <div className="flex flex-col items-end gap-1">
                                    <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize" style={{ borderColor: "var(--tnl-border)", color: reg.status === "attended" ? "var(--tnl-green)" : "var(--tnl-tan-text)" }}>
                                        {reg.status}
                                    </span>
                                    {reg.anonymized ? <AdminStatusBadge variant="neutral">{t("adminRegistrarAnonymizedBadge")}</AdminStatusBadge> : null}
                                </div>
                            </div>
                            <p className="mt-2 text-xs" style={{ color: "var(--tnl-tan-text)" }}>{reg.event_title}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {FEATURES.doorCheckIn ? (
                                    <button
                                        type="button"
                                        onClick={() => setRegStatus.mutate({ id: reg.id, next: "attended" })}
                                        className="tnl-btn tnl-btn-primary min-h-[40px] text-xs"
                                        data-testid={`registration-checkin-${reg.id}`}
                                    >
                                        {t("adminRegistrarCheckinAction")}
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => setRegStatus.mutate({ id: reg.id, next: "rejected" })}
                                    className="tnl-btn tnl-btn-outline min-h-[40px] text-xs text-red-600 dark:text-red-400"
                                    data-testid={`registration-reject-${reg.id}`}
                                >
                                    {t("adminRegistrarRejectMobile")}
                                </button>
                                {canManage && !reg.anonymized ? (
                                    <a
                                        href={`/api/admin/registrations/${encodeURIComponent(reg.id)}/qr`}
                                        download={`qr-${reg.id}.png`}
                                        className="tnl-btn tnl-btn-outline min-h-[40px] text-xs"
                                        title={t("adminRegistrarQrTitle")}
                                        data-testid={`registration-qr-mobile-${reg.id}`}
                                    >
                                        <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                                        {t("adminRegistrarQrLink")}
                                    </a>
                                ) : null}
                                {canManage && !reg.anonymized && reg.status !== "rejected" ? (
                                    <ConfirmButton
                                        label={t("adminRegistrarWithdraw")}
                                        confirmLabel={t("adminConfirm")}
                                        question={t("adminRegistrarWithdrawQuestion").replace("{email}", reg.email)}
                                        onConfirm={() => withdrawReg.mutate(reg.id)}
                                        testId={`registration-withdraw-mobile-${reg.id}`}
                                    />
                                ) : null}
                                {canManage && !reg.anonymized ? (
                                    <ConfirmButton
                                        label={t("adminRegistrarAnonymize")}
                                        confirmLabel={t("adminConfirm")}
                                        question={t("adminRegistrarAnonymizeQuestion").replace("{email}", reg.email)}
                                        onConfirm={() => anonymizeReg.mutate(reg.id)}
                                        testId={`registration-anonymize-mobile-${reg.id}`}
                                    />
                                ) : null}
                                {canManage ? (
                                    <ConfirmButton
                                        label={t("adminDelete")}
                                        confirmLabel={t("adminRegistrarDeleteEntry")}
                                        question={t("adminRegistrarDeleteQuestion").replace("{email}", reg.email)}
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
                                <th className="pb-2 pr-4 font-semibold">{t("adminRegistrarColName")}</th>
                                <th className="pb-2 pr-4 font-semibold">{t("adminRegistrarColEvent")}</th>
                                <th className="pb-2 pr-4 font-semibold">{t("adminRegistrarColStatus")}</th>
                                {FEATURES.certificates ? <th className="pb-2 pr-4 font-semibold">{t("adminRegistrarColCert")}</th> : null}
                                <th className="pb-2 font-semibold">{t("adminRegistrarColDecide")}</th>
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
                                    <td className="py-3 pr-4 capitalize">
                                        {reg.status}
                                        {reg.anonymized ? <span className="ml-2"><AdminStatusBadge variant="neutral">{t("adminRegistrarAnonymizedBadge")}</AdminStatusBadge></span> : null}
                                    </td>
                                    {FEATURES.certificates ? (
                                        <td className="py-3 pr-4">
                                            {reg.certificate_code ? (
                                                <a
                                                    href={`/api/certificates/${reg.certificate_code}/pdf`}
                                                    download
                                                    className="inline-flex items-center gap-1 rounded-[6px] border px-2 py-0.5 text-xs font-mono font-semibold transition-colors hover:border-[var(--tnl-green)]"
                                                    style={{ borderColor: "var(--tnl-border)", color: "var(--tnl-green)" }}
                                                    title={t("adminRegistrarDownloadCert")}
                                                    data-testid={`download-cert-${reg.id}`}
                                                >
                                                    <Download className="h-3 w-3" />
                                                    {reg.certificate_code}
                                                </a>
                                            ) : (
                                                <span className="text-xs" style={{ color: "var(--tnl-tan-text)" }}>—</span>
                                            )}
                                        </td>
                                    ) : null}
                                    <td className="py-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {FEATURES.doorCheckIn ? (
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
                                                    title={t("adminRegistrarAttendedTip")}
                                                >
                                                    {t("adminRegistrarAttended")}
                                                </button>
                                            ) : null}
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
                                                title={t("adminRegistrarRejectTip")}
                                            >
                                                {t("adminRegistrarReject")}
                                            </button>
                                            {canManage && !reg.anonymized ? (
                                                <a
                                                    href={`/api/admin/registrations/${encodeURIComponent(reg.id)}/qr`}
                                                    download={`qr-${reg.id}.png`}
                                                    className="inline-flex items-center gap-1 rounded-[6px] border px-2.5 py-1 text-xs font-medium"
                                                    style={{ borderColor: "var(--tnl-border)" }}
                                                    title={t("adminRegistrarQrTitle")}
                                                    data-testid={`registration-qr-${reg.id}`}
                                                >
                                                    <QrCode className="h-3 w-3" aria-hidden="true" />
                                                    {t("adminRegistrarQrLink")}
                                                </a>
                                            ) : null}
                                            {canManage && !reg.anonymized && reg.status !== "rejected" ? (
                                                <ConfirmButton
                                                    label={t("adminRegistrarWithdraw")}
                                                    confirmLabel={t("adminConfirm")}
                                                    question={t("adminRegistrarWithdrawQuestion").replace("{email}", reg.email)}
                                                    onConfirm={() => withdrawReg.mutate(reg.id)}
                                                    testId={`registration-withdraw-${reg.id}`}
                                                />
                                            ) : null}
                                            {canManage && !reg.anonymized ? (
                                                <ConfirmButton
                                                    label={t("adminRegistrarAnonymize")}
                                                    confirmLabel={t("adminConfirm")}
                                                    question={t("adminRegistrarAnonymizeQuestion").replace("{email}", reg.email)}
                                                    onConfirm={() => anonymizeReg.mutate(reg.id)}
                                                    testId={`registration-anonymize-${reg.id}`}
                                                />
                                            ) : null}
                                            {canManage && (
                                                <ConfirmButton
                                                    label={t("adminDelete")}
                                                    confirmLabel={t("adminRegistrarDeleteEntry")}
                                                    question={t("adminRegistrarDeleteQuestion").replace("{email}", reg.email)}
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
            <PrivacyJobs />
        </div>
    );
}
