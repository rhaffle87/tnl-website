import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/api";
import { useAdminT } from "@/lib/i18n/admin-i18n";
import { AdminErrorBanner, Panel, adminError } from "@/pages/admin/AdminUI";

interface Delivery { id: string; to: string; subject: string; status: string; attempts: number; next_attempt_at?: string | null; error_code?: string | null }
export function MailOutbox() {
    const t = useAdminT();
    const qc = useQueryClient();
    const [open, setOpen] = useState(false);
    const { data, error, refetch } = useQuery({ queryKey: ["admin", "outbox"], queryFn: () => apiGet<{ items: Delivery[]; smtp_configured: boolean }>("/admin/outbox"), enabled: open, retry: false, refetchInterval: open ? 30_000 : false, refetchIntervalInBackground: false });
    const retry = useMutation({ mutationFn: (id: string) => apiPost(`/admin/outbox/${id}/retry`, {}), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin", "outbox"] }); } });
    return <Panel className="mt-5">
        <button type="button" className="text-sm font-semibold underline" aria-expanded={open} aria-controls="admin-outbox" onClick={() => setOpen(!open)}>{t("adminOutbox")}</button>
        {open ? <div id="admin-outbox" className="mt-3 space-y-3">
            {error || retry.error ? <AdminErrorBanner message={adminError(error ?? retry.error, t("adminOutboxError"))} onRetry={() => void refetch()} /> : null}
            {data?.smtp_configured === false ? <p role="status" className="text-sm">{t("adminOutboxUnavailable")}</p> : null}
            <ul className="space-y-3">{data?.items.map((delivery) => <li key={delivery.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--tnl-border)] pt-3 text-sm">
                <div className="min-w-0"><p className="break-words font-medium">{delivery.subject}</p><p className="break-all text-xs">{delivery.to}</p><p className="mt-1 text-xs">{delivery.status} · {delivery.attempts}{delivery.error_code ? ` · ${delivery.error_code}` : ""}{delivery.next_attempt_at ? ` · ${new Date(delivery.next_attempt_at).toLocaleString()}` : ""}</p></div>
                {delivery.status === "failed" ? <button type="button" className="tnl-btn tnl-btn-outline" disabled={retry.isPending} onClick={() => retry.mutate(delivery.id)}>{t("adminOutboxRetry")}</button> : null}
            </li>)}</ul>
            {data?.items.length === 0 ? <p className="text-sm">{t("adminOutboxEmpty")}</p> : null}
        </div> : null}
    </Panel>;
}
