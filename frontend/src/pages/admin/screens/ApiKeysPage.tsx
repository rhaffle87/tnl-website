import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPost } from "@/lib/api/api";
import { useAdminT } from "@/lib/i18n/admin-i18n";
import { AdminPageHeader, AdminSwitch, ConfirmButton, Panel, adminError } from "@/pages/admin/AdminUI";
import { Spinner } from "@/components/site/Primitives";
import type { ApiKeyRecord } from "@/lib/types/types";

export function ApiKeysPage() {
    const t = useAdminT();
    const qc = useQueryClient();
    const [status, setStatus] = useState("");
    const { data, isLoading } = useQuery({
        queryKey: ["admin", "api-keys", status],
        queryFn: () => apiGet<{ items: ApiKeyRecord[]; counts: { active: number; revoked: number } }>(`/admin/api-keys${status ? `?status=${status}` : ""}`),
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
            toast.success(t("adminApiKeysCreatedToast"));
        },
        onError: (err) => toast.error(adminError(err, t("adminApiKeysCreateError"))),
    });

    const revoke = useMutation({
        mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/admin/api-keys/${id}`),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ["admin", "api-keys"] });
            toast.success(t("adminApiKeysRevokedToast"));
        },
        onError: (err) => toast.error(adminError(err, t("adminApiKeysRevokeError"))),
    });

    const purge = useMutation({
        mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/admin/api-keys/${id}/purge`),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ["admin", "api-keys"] });
            toast.success(t("adminApiKeysPurgedToast"));
        },
        onError: (err) => toast.error(adminError(err, t("adminApiKeysPurgeError"))),
    });

    const keys = data?.items ?? [];

    return (
        <div data-testid="api-keys-page">
            <AdminPageHeader
                title={t("adminApiKeysTitle")}
                description={t("adminApiKeysDescription")}
                actions={
                    <a href="/api/v1-docs/openapi" target="_blank" rel="noopener noreferrer" className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm" data-testid="api-docs-link">
                        {t("adminApiKeysDocs")}
                    </a>
                }
                testId="api-keys-header"
            />

            <div className="mb-4 flex flex-wrap items-center gap-2">
                <label htmlFor="api-key-status-filter" className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>{t("adminStatus")}</label>
                <select
                    id="api-key-status-filter"
                    data-testid="api-key-status-filter"
                    className="tnl-field w-auto min-w-[160px]"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                >
                    <option value="">{t("adminApiKeysAll")} ({data?.counts ? data.counts.active + data.counts.revoked : "—"})</option>
                    <option value="active">{t("adminApiKeysActive")} ({data?.counts?.active ?? "—"})</option>
                    <option value="revoked">{t("adminApiKeysRevoked")} ({data?.counts?.revoked ?? "—"})</option>
                </select>
            </div>

            <Panel className="mb-6">
                <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                    <input className="tnl-field" placeholder={t("adminApiKeysNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} aria-label={t("adminApiKeysNameAria")} data-testid="api-key-name-input" />
                    <AdminSwitch
                        className="items-center"
                        label={t("adminApiKeysAllowWrite")}
                        checked={write}
                        onCheckedChange={setWrite}
                        testId="api-key-write-checkbox"
                    />
                    <button type="button" onClick={() => create.mutate()} className="tnl-btn tnl-btn-primary" disabled={!name.trim()} data-testid="api-key-create-button">
                        {t("adminApiKeysCreate")}
                    </button>
                </div>
                {fresh ? (
                    <div className="mt-4 rounded-[8px] border px-4 py-3" style={{ borderColor: "var(--tnl-green)" }} data-testid="api-key-fresh">
                        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>{t("adminApiKeysCopyNow")}</p>
                        <code className="mt-1 block break-all text-sm">{fresh}</code>
                    </div>
                ) : null}
            </Panel>

            {isLoading ? (
                <Spinner label={t("adminLoading")} />
            ) : keys.length === 0 ? (
                <Panel>
                    <p className="text-sm text-[var(--tnl-body)]" data-testid="api-keys-empty">
                        {status === "active" ? t("adminApiKeysEmptyActive") : status === "revoked" ? t("adminApiKeysEmptyRevoked") : t("adminApiKeysEmptyAll")}
                    </p>
                </Panel>
            ) : (
                <Panel className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="api-keys-table">
                        <thead>
                            <tr className="text-left" style={{ color: "var(--tnl-tan-text)" }}>
                                <th className="pb-2 pr-4 font-semibold">{t("adminApiKeysColName")}</th>
                                <th className="pb-2 pr-4 font-semibold">{t("adminApiKeysColAllows")}</th>
                                <th className="pb-2 pr-4 font-semibold">{t("adminApiKeysColCalls")}</th>
                                <th className="pb-2 pr-4 font-semibold">{t("adminStatus")}</th>
                                <th className="pb-2 font-semibold">{t("adminApiKeysColActions")}</th>
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
                                    <td className="py-3 pr-4">
                                        <span
                                            className="rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize"
                                            style={{ borderColor: key.active ? "var(--tnl-green)" : "var(--tnl-border)", color: key.active ? "var(--tnl-green)" : "var(--tnl-tan-text)" }}
                                            data-testid={`api-key-status-${key.id}`}
                                        >
                                            {t(key.active ? "adminApiKeysStatusActive" : "adminApiKeysStatusRevoked")}
                                        </span>
                                    </td>
                                    <td className="py-3">
                                        {key.active ? (
                                            <ConfirmButton label={t("adminApiKeysRevoke")} confirmLabel={t("adminApiKeysRevokeConfirm")} question={t("adminApiKeysRevokeQuestion")} onConfirm={() => revoke.mutate(key.id)} testId={`api-key-revoke-${key.id}`} />
                                        ) : (
                                            <ConfirmButton label={t("adminDelete")} confirmLabel={t("adminApiKeysPurgeConfirm")} question={t("adminApiKeysPurgeQuestion")} onConfirm={() => purge.mutate(key.id)} testId={`api-key-purge-${key.id}`} />
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
