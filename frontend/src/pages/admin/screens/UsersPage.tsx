import { useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/api";
import { useAdminT } from "@/lib/i18n/admin-i18n";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";
import { AdminErrorBanner, AdminLoadMore, AdminPageHeader, AdminSectionHeader, AdminSelect, ConfirmButton, Panel, adminError } from "@/pages/admin/AdminUI";
import { Spinner } from "@/components/site/Primitives";
import { DivisionSelector } from "@/components/admin/DivisionSelector";
import type { AuthUser, ListResponse } from "@/lib/types/types";

function UsersConfirmDialog({
    title,
    message,
    onAccept,
    onCancel,
}: {
    title: string;
    message: string;
    onAccept: () => void;
    onCancel: () => void;
}) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const acceptRef = useRef<HTMLButtonElement>(null);
    const descriptionId = useId();
    const t = useAdminT();

    useFocusTrap(true, dialogRef, { onEscape: onCancel, initialFocusRef: acceptRef });

    return (
        <div
            ref={dialogRef}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="users-confirm-title"
            aria-describedby={descriptionId}
            data-testid="confirm-dialog"
        >
            <div className="w-full max-w-md rounded-xl border p-5 shadow-xl" style={{ borderColor: "var(--tnl-border)", background: "var(--tnl-surface)" }}>
                <h2 id="users-confirm-title" className="text-base font-semibold text-[var(--tnl-heading)]">{title}</h2>
                <p id={descriptionId} className="mt-2 text-sm text-[var(--tnl-body)]">{message}</p>
                <div className="mt-5 flex justify-end gap-2">
                    <button
                        ref={acceptRef}
                        type="button"
                        onClick={onAccept}
                        className="tnl-btn tnl-btn-primary h-9 min-h-[36px] text-xs"
                        data-testid="confirm-accept"
                    >
                        {t("adminConfirm")}
                    </button>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="tnl-btn tnl-btn-outline h-9 min-h-[36px] text-xs"
                        data-testid="confirm-cancel"
                    >
                        {t("adminCancel")}
                    </button>
                </div>
            </div>
        </div>
    );
}

export function UsersPage() {
    const t = useAdminT();
    const qc = useQueryClient();
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["admin", "users"],
        queryFn: () => apiGet<ListResponse<AuthUser>>("/admin/users"),
        retry: false,
    });
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [role, setRole] = useState("contributor");
    const [divisions, setDivisions] = useState<string[]>([]);
    const [divisionEdits, setDivisionEdits] = useState<Record<string, string[]>>({});
    const [userLimit, setUserLimit] = useState(50);
    const [pendingChange, setPendingChange] = useState<{
        id: string;
        name: string;
        label: string;
        patch: Record<string, unknown>;
    } | null>(null);

    const refresh = () => void qc.invalidateQueries({ queryKey: ["admin", "users"] });

    const invite = useMutation({
        mutationFn: () => apiPost<AuthUser>("/admin/users", { name, email, role, divisions }),
        onSuccess: () => {
            setName("");
            setEmail("");
            setDivisions([]);
            refresh();
            toast.success(t("adminUsersInviteSent"));
        },
        onError: (err) => toast.error(adminError(err, t("adminUsersInviteError"))),
    });

    const update = useMutation({
        mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => apiPatch<AuthUser>(`/admin/users/${id}`, patch),
    });
    const invitation = useMutation({
        mutationFn: ({ id, revoke }: { id: string; revoke: boolean }) => revoke ? apiDelete(`/admin/users/${id}/invite`) : apiPost(`/admin/users/${id}/invite`, {}),
        onSuccess: () => { refresh(); toast.success(t("adminInviteUpdated")); },
        onError: (err) => toast.error(adminError(err, t("adminInviteError"))),
    });

    const users = data?.items ?? [];
    const shownUsers = users.slice(0, userLimit);

    const applyPendingChange = async () => {
        if (!pendingChange) return;
        const change = pendingChange;
        setPendingChange(null);
        try {
            await update.mutateAsync({ id: change.id, patch: change.patch });
            refresh();
            toast.success(t("adminUsersUpdateSuccess").replace("{name}", change.name));
        } catch (err) {
            toast.error(adminError(err, t("adminUsersUpdateError")));
        }
    };

    return (
        <div data-testid="users-page">
            <AdminPageHeader
                title={t("adminUsersTitle")}
                description={t("adminUsersDescription")}
                testId="users-header"
            />

            <Panel className="mb-6">
                <AdminSectionHeader title={t("adminUsersInviteHeading")} />
                <div className="mt-3 grid gap-3 lg:grid-cols-4">
                    <input className="tnl-field" placeholder={t("adminUsersNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} aria-label={t("adminUsersColName")} data-testid="invite-name-input" />
                    <input className="tnl-field" placeholder={t("adminUsersEmailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" data-testid="invite-email-input" />
                    <AdminSelect value={role} onChange={(e) => setRole(e.target.value)} aria-label={t("adminUsersColRole")} data-testid="invite-role-select">
                        {["super_admin", "editor", "contributor", "registrar", "viewer"].map((r) => (
                            <option key={r} value={r}>
                                {r.replace("_", " ")}
                            </option>
                        ))}
                    </AdminSelect>
                    <button type="button" onClick={() => invite.mutate()} className="tnl-btn tnl-btn-primary" disabled={!name.trim() || !email.trim()} data-testid="invite-submit">
                        {t("adminUsersSendInvite")}
                    </button>
                </div>
                <div className="mt-4"><DivisionSelector value={divisions} onChange={setDivisions} /></div>
            </Panel>

            {error ? (
                <AdminErrorBanner
                    testId="users-list-error"
                    message={adminError(error, t("adminUsersLoadError"))}
                    onRetry={() => void refetch()}
                />
            ) : isLoading ? (
                <Spinner label={t("adminLoading")} />
            ) : users.length === 0 ? (
                <Panel>
                    <p className="text-sm text-[var(--tnl-body)]">{t("adminAccountsEmpty")}</p>
                </Panel>
            ) : (
                <Panel className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="users-table">
                        <thead>
                            <tr className="text-left" style={{ color: "var(--tnl-tan-text)" }}>
                                <th className="pb-2 pr-4 font-semibold">{t("adminUsersColName")}</th>
                                <th className="pb-2 pr-4 font-semibold">{t("adminUsersColRole")}</th>
                                <th className="pb-2 pr-4 font-semibold">{t("adminUsersColActive")}</th>
                                <th className="pb-2 font-semibold">{t("adminUsersColChange")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shownUsers.map((user) => (
                                <tr key={user.id} className="border-t" style={{ borderColor: "var(--tnl-border)" }} data-testid={`user-row-${user.id}`}>
                                    <td className="py-3 pr-4">
                                        <span className="font-medium">{user.name}</span>
                                        <span className="block text-xs" style={{ color: "var(--tnl-tan-text)" }}>{user.email}</span>
                                        {user.invite_pending ? <span className="block text-xs">{t("adminInvitePending")}{user.invite_expires_at ? ` · ${new Date(user.invite_expires_at).toLocaleString()}` : ""}</span> : null}
                                    </td>
                                    <td className="py-3 pr-4 capitalize">{user.role.replace("_", " ")}</td>
                                    <td className="py-3 pr-4">{user.active ? t("adminYes") : t("adminNo")}</td>
                                    <td className="py-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <AdminSelect
                                                value={user.role}
                                                onChange={(e) => {
                                                    if (e.target.value === user.role) return;
                                                    setPendingChange({
                                                        id: user.id,
                                                        name: user.name,
                                                        label: t("adminUsersConfirmRole")
                                                            .replace("{name}", user.name)
                                                            .replace("{role}", e.target.value.replace("_", " ")),
                                                        patch: { role: e.target.value },
                                                    });
                                                }}
                                                aria-label={`${t("adminUsersColRole")}: ${user.name}`}
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
                                                onClick={() => setPendingChange({
                                                    id: user.id,
                                                    name: user.name,
                                                    label: t(user.active ? "adminUsersConfirmDeactivate" : "adminUsersConfirmReactivate").replace("{name}", user.name),
                                                    patch: { active: !user.active },
                                                })}
                                                className="rounded-[6px] border px-3 py-1.5 text-xs font-medium"
                                                style={{ borderColor: "var(--tnl-border)" }}
                                                data-testid={`user-toggle-${user.id}`}
                                            >
                                                {t(user.active ? "adminUsersDeactivate" : "adminUsersReactivate")}
                                            </button>
                                            {user.invite_pending ? <>
                                                <button type="button" className="tnl-btn tnl-btn-outline text-xs" disabled={invitation.isPending} onClick={() => invitation.mutate({ id: user.id, revoke: false })}>{t("adminInviteRotate")}</button>
                                                <ConfirmButton label={t("adminInviteRevoke")} question={t("adminInviteRevokeQuestion")} confirmLabel={t("adminConfirm")} onConfirm={() => invitation.mutate({ id: user.id, revoke: true })} testId={`invite-revoke-${user.id}`} />
                                            </> : null}
                                        </div>
                                        <div className="mt-3"><DivisionSelector label={`${t("adminDivisions")}: ${user.name}`} value={divisionEdits[user.id] ?? user.divisions ?? []} onChange={(next) => setDivisionEdits((current) => ({ ...current, [user.id]: next }))}>
                                            <button type="button" className="tnl-btn tnl-btn-outline text-xs" disabled={!divisionEdits[user.id] || update.isPending} onClick={() => setPendingChange({ id: user.id, name: user.name, label: `${t("adminDivisionsSave")}: ${user.name}?`, patch: { divisions: divisionEdits[user.id] } })}>{t("adminDivisionsSave")}</button>
                                        </DivisionSelector></div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Panel>
            )}
            {!error && !isLoading && users.length > 0 ? (
                <AdminLoadMore
                    shown={shownUsers.length}
                    total={users.length}
                    onMore={() => setUserLimit((current) => current + 50)}
                    testId="load-more-users"
                />
            ) : null}
            {pendingChange ? (
                <UsersConfirmDialog
                    title={t("adminUsersConfirmTitle")}
                    message={pendingChange.label}
                    onAccept={() => void applyPendingChange()}
                    onCancel={() => setPendingChange(null)}
                />
            ) : null}
        </div>
    );
}
