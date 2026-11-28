import { useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/api";
import { useMe } from "@/lib/api/hooks";
import { useAdminT } from "@/lib/i18n/admin-i18n";
import { useLocale } from "@/lib/i18n/i18n";
import { AdminErrorBanner, Panel } from "@/pages/admin/AdminUI";

interface PrivacyJob {
    id: string;
    delete: boolean;
    status: "pending";
    attempts: number;
    error_code?: string | null;
    next_attempt_at?: string | null;
    created_at?: string | null;
}
interface RetryResult { ok: true; privacy_status: "completed" | "pending" }

export function PrivacyJobs() {
    const { data: me } = useMe();
    const canManage = me?.role === "super_admin" || me?.role === "registrar";
    const t = useAdminT();
    const { locale } = useLocale();
    const qc = useQueryClient();
    const panelId = useId();
    const [open, setOpen] = useState(false);
    const [result, setResult] = useState<RetryResult["privacy_status"] | null>(null);
    const retryInFlight = useRef(false);
    const enabled = open && canManage;
    const queryKey = ["admin", "privacy-jobs", me?.id];
    const { data, error, isLoading, isFetching, refetch } = useQuery({
        queryKey,
        queryFn: () => apiGet<{ items: PrivacyJob[]; pending: number }>("/admin/privacy-jobs"),
        enabled,
        retry: false,
        refetchInterval: enabled ? 30_000 : false,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: false,
    });
    const retry = useMutation({
        mutationFn: (id: string) => apiPost<RetryResult>(`/admin/privacy-jobs/${encodeURIComponent(id)}/retry`, {}),
        onSuccess: (response) => {
            setResult(response.privacy_status);
            void qc.invalidateQueries({ queryKey });
        },
        onSettled: () => { retryInFlight.current = false; },
    });
    const retryJob = (id: string) => {
        if (!canManage || retryInFlight.current || !data?.items.some((job) => job.id === id && job.status === "pending")) return;
        retryInFlight.current = true;
        setResult(null);
        retry.mutate(id);
    };
    const formatDate = (value: string) => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toLocaleString(locale === "id" ? "id-ID" : "en-US", { dateStyle: "medium", timeStyle: "short" });
    };
    if (!canManage) return null;
    return <Panel className="mt-5">
        <button type="button" className="text-sm font-semibold underline" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>{t("adminPrivacyJobs")}</button>
        {open ? <div id={panelId} className="mt-3 space-y-3" aria-busy={isFetching || retry.isPending}>
            <p className="text-xs text-[var(--tnl-body)]">{t("adminPrivacyJobsHelp")}</p>
            {isLoading ? <p role="status" className="text-sm">{t("adminLoading")}</p> : null}
            {error ? <AdminErrorBanner message={t("adminPrivacyLoadError")} onRetry={() => void refetch()} /> : null}
            {retry.error ? <p role="alert" className="text-sm text-[var(--tnl-danger)]">{t("adminPrivacyRetryError")}</p> : null}
            {result ? <p role="status" className="text-sm">{t(result === "completed" ? "adminPrivacyCompleted" : "adminPrivacyStillPending")}</p> : null}
            {data ? <p className="text-sm">{t("adminPrivacyPendingCount").replace("{count}", String(data.pending))}</p> : null}
            <ul className="space-y-3">{data?.items.map((job) => <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--tnl-border)] pt-3 text-sm">
                <div className="min-w-0 space-y-1">
                    <p className="break-all font-medium">{t("adminPrivacyJob").replace("{id}", job.id)}</p>
                    <p className="text-xs">{t(job.delete ? "adminPrivacyDelete" : "adminPrivacyAnonymize")} · {t("adminPrivacyPending")} · {t("adminPrivacyAttempts").replace("{count}", String(job.attempts))}</p>
                    {job.error_code ? <p className="break-words text-xs">{t("adminPrivacyErrorCode")}: {job.error_code}</p> : null}
                    {job.created_at && formatDate(job.created_at) ? <p className="text-xs">{t("adminPrivacyCreated")}: <time dateTime={job.created_at}>{formatDate(job.created_at)}</time></p> : null}
                    {job.next_attempt_at && formatDate(job.next_attempt_at) ? <p className="text-xs">{t("adminPrivacyNextAttempt")}: <time dateTime={job.next_attempt_at}>{formatDate(job.next_attempt_at)}</time></p> : null}
                </div>
                <button type="button" className="tnl-btn tnl-btn-outline" disabled={retry.isPending} onClick={() => retryJob(job.id)}>{t(retry.isPending && retry.variables === job.id ? "adminPrivacyRetrying" : "adminPrivacyRetry")}</button>
            </li>)}</ul>
            {data?.items.length === 0 && !error ? <p className="text-sm">{t("adminPrivacyEmpty")}</p> : null}
        </div> : null}
    </Panel>;
}
