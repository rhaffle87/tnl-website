import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/lib/api/api";
import { useAdminT } from "@/lib/i18n/admin-i18n";
import { AdminPageHeader, AdminStatusBadge, Panel, adminError } from "@/pages/admin/AdminUI";
import { Spinner } from "@/components/site/Primitives";
import { MailOutbox } from "@/components/admin/MailOutbox";
import type { ContactMessage } from "@/lib/types/types";

export function InboxPage() {
    const t = useAdminT();
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ["admin", "messages"],
        queryFn: () => apiGet<{ items: (ContactMessage & { reply_delivery?: string })[]; counts: Record<string, number> }>("/admin/messages"),
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
            toast.success(
                t("adminInboxSortedToast")
                    .replace("{triaged}", String(res.triaged))
                    .replace("{examined}", String(res.examined)),
            );
        },
        onError: (err) => toast.error(adminError(err, t("adminInboxSortError"))),
    });

    const reply = useMutation({
        mutationFn: (id: string) => apiPatch<ContactMessage>(`/admin/messages/${id}`, { reply_body: replyBody }),
        onSuccess: () => {
            refresh();
            setReplyTo(null);
            setReplyBody("");
            toast.success(t("adminOutboxQueued"));
        },
        onError: (err) => toast.error(adminError(err, t("adminInboxReplyError"))),
    });

    const items = data?.items ?? [];

    return (
        <div data-testid="inbox-page">
            <AdminPageHeader
                title={t("adminInboxTitle")}
                description={t("adminInboxDescription")}
                actions={
                    <button type="button" onClick={() => triageAll.mutate()} className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm" disabled={triageAll.isPending} data-testid="inbox-triage-button">
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        {t(triageAll.isPending ? "adminInboxSorting" : "adminInboxSort")}
                    </button>
                }
                testId="inbox-header"
            />
            {isLoading ? (
                <Spinner label={t("adminLoading")} />
            ) : items.length === 0 ? (
                <Panel>
                    <p className="text-sm text-[var(--tnl-body)]" data-testid="inbox-empty">{t("adminInboxEmpty")}</p>
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
                                                <AdminStatusBadge variant="error">{t("adminInboxLikelySpam")}</AdminStatusBadge>
                                            ) : null}
                                        </>
                                    ) : null}
                                    <span className="text-xs capitalize" style={{ color: "var(--tnl-tan-text)" }}>{msg.status}</span>
                                </div>
                            </div>
                            <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--tnl-body)]">{msg.body}</p>
                            {msg.reply_delivery ? <p className="mt-2 text-xs" role="status">{t("adminOutbox")}: {msg.reply_delivery}</p> : null}
                            <div className="mt-4 flex flex-wrap gap-2">
                                <button type="button" onClick={() => setReplyTo(replyTo === msg.id ? null : msg.id)} className="rounded-[6px] border px-3 py-1.5 text-xs font-medium" style={{ borderColor: "var(--tnl-border)" }} data-testid={`message-reply-${msg.id}`}>
                                    {t("adminInboxReplyByEmail")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void apiPatch(`/admin/messages/${msg.id}`, { status: "archived" }).then(() => {
                                            refresh();
                                            toast.success(t("adminInboxArchivedToast"));
                                        });
                                    }}
                                    className="rounded-[6px] border px-3 py-1.5 text-xs font-medium"
                                    style={{ borderColor: "var(--tnl-border)" }}
                                    data-testid={`message-archive-${msg.id}`}
                                >
                                    {t("adminInboxArchive")}
                                </button>
                            </div>
                            {replyTo === msg.id ? (
                                <div className="mt-3">
                                    <textarea className="tnl-field" rows={4} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} aria-label={t("adminInboxReplyLabel")} data-testid={`message-reply-body-${msg.id}`} />
                                    <button type="button" onClick={() => reply.mutate(msg.id)} className="tnl-btn tnl-btn-primary mt-2 h-10 min-h-[40px] text-sm" disabled={!replyBody.trim()} data-testid={`message-send-${msg.id}`}>
                                        {t("adminInboxSendReply")}
                                    </button>
                                </div>
                            ) : null}
                        </Panel>
                    ))}
                </div>
            )}
            <MailOutbox />
        </div>
    );
}
