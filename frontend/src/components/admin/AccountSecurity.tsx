import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiPost } from "@/lib/api/api";
import { useMe } from "@/lib/api/hooks";
import { endSession } from "@/lib/api/session";
import { useAdminT } from "@/lib/i18n/admin-i18n";
import { AdminCard, AdminSectionHeader, ConfirmButton, adminError } from "@/pages/admin/AdminUI";

interface Setup { secret: string; email: string; otpauth_uri: string; expires_at: string }
interface SecurityResult { ok: boolean; totp_enabled?: boolean; recovery_codes?: string[] }

export function AccountSecurity() {
    const { data: me } = useMe();
    const t = useAdminT();
    const qc = useQueryClient();
    const navigate = useNavigate();
    const [setup, setSetup] = useState<Setup | null>(null);
    const [codes, setCodes] = useState<string[]>([]);
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [enabled, setEnabled] = useState<boolean | null>(null);
    const isEnabled = enabled ?? me?.totp_enabled ?? false;
    const act = async (action: "totp-setup" | "totp-confirm" | "totp-recovery-codes" | "totp-disable") => {
        if (!me || busy) return;
        setBusy(true);
        setError("");
        setMessage("");
        try {
            if (action === "totp-setup") {
                setSetup(await apiPost<Setup>(`/admin/users/${me.id}/${action}`, { ...(password ? { password } : {}), ...(code ? { code } : {}) }));
            } else {
                const result = await apiPost<SecurityResult>(`/admin/users/${me.id}/${action}`, action === "totp-confirm" ? { code } : { password, code });
                setCodes(result.recovery_codes ?? []);
                if (action === "totp-confirm") { setSetup(null); setEnabled(true); }
                if (action === "totp-disable") { setSetup(null); setEnabled(false); }
                setMessage(t("adminSecurityUpdated"));
                void qc.invalidateQueries({ queryKey: ["auth", "me"] });
            }
            setPassword("");
            setCode("");
        } catch (err) { setError(adminError(err, t("adminSecurityError"))); }
        finally { setBusy(false); }
    };
    const changePassword = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (busy) return;
        const values = new FormData(event.currentTarget);
        setBusy(true);
        setError("");
        try {
            await apiPost("/auth/password/change", {
                current_password: values.get("current_password"), password: values.get("password"),
                ...(isEnabled ? { code: values.get("code") } : {}),
            });
            await endSession().catch(() => undefined);
            navigate("/admin/login", { replace: true });
        } catch (err) { setError(adminError(err, t("adminSecurityError"))); }
        finally { setBusy(false); }
    };
    if (!me?.id) return null;
    return <AdminCard testId="account-security">
        <AdminSectionHeader title={t("adminSecurityTitle")} description={t("adminSecurityDescription")} />
        <p className="mt-3 text-sm">{t(isEnabled ? "adminSecurityEnabled" : "adminSecurityDisabled")}</p>
        {isEnabled && me.recovery_codes_remaining !== undefined ? <p className="mt-1 text-xs text-[var(--tnl-body)]">{t("adminSecurityRemaining").replace("{count}", String(me.recovery_codes_remaining))}</p> : null}
        <form className="mt-4 space-y-3" aria-label={t("adminSecurityTitle")} aria-busy={busy} onSubmit={(e) => { e.preventDefault(); void act(setup ? "totp-confirm" : isEnabled ? "totp-recovery-codes" : "totp-setup"); }}>
            {!setup ? <div>
                <label htmlFor="security-password" className="mb-1 block text-sm">{t("adminSecurityPassword")}</label>
                <input id="security-password" name="password" type="password" autoComplete="current-password" className="tnl-field" value={password} onChange={(e) => setPassword(e.target.value)} required={isEnabled} />
            </div> : <div className="space-y-2 rounded-lg border border-[var(--tnl-border)] p-3">
                <p className="text-xs">{t("adminSecuritySetupHelp").replace("{time}", new Date(setup.expires_at).toLocaleString())}</p>
                <label htmlFor="security-secret" className="block text-sm">{t("adminSecuritySecret")}</label>
                <input id="security-secret" className="tnl-field font-mono" value={setup.secret} readOnly autoComplete="off" />
                <a href={setup.otpauth_uri} className="text-sm text-[var(--tnl-link)] underline">{t("adminSecurityOpenAuthenticator")}</a>
            </div>}
            {setup || isEnabled ? <div>
                <label htmlFor="security-code" className="mb-1 block text-sm">{t("adminSecurityCode")}</label>
                <input id="security-code" name="code" type="text" autoComplete="one-time-code" inputMode={setup ? "numeric" : "text"} pattern={setup ? "[0-9]{6}" : undefined} required value={code} onChange={(e) => setCode(e.target.value)} className="tnl-field" autoCapitalize="none" spellCheck={false} />
            </div> : null}
            <div className="flex flex-wrap gap-2">
                <button type="submit" className="tnl-btn tnl-btn-outline" disabled={busy}>{t(setup ? "adminSecurityConfirm" : isEnabled ? "adminSecurityRegenerate" : "adminSecuritySetup")}</button>
                {isEnabled ? <ConfirmButton label={t("adminSecurityDisable")} question={t("adminSecurityDisableQuestion")} confirmLabel={t("adminConfirm")} onConfirm={() => {
                    if (!password || !code) { setError(t("adminSecurityProofRequired")); return; }
                    return act("totp-disable");
                }} testId="security-disable" /> : null}
            </div>
        </form>
        {codes.length ? <div className="mt-4 space-y-3 rounded-lg border border-[var(--tnl-border)] p-3" data-testid="security-recovery-codes">
            <h3 className="font-semibold">{t("adminSecurityCodes")}</h3>
            <p className="text-sm">{t("adminSecurityCodesHelp")}</p>
            <ul className="grid gap-2 font-mono text-sm sm:grid-cols-2">{codes.map((item) => <li key={item}>{item}</li>)}</ul>
            <button type="button" className="tnl-btn tnl-btn-outline" onClick={() => setCodes([])}>{t("adminSecurityCodesDismiss")}</button>
        </div> : null}
        <form onSubmit={(e) => void changePassword(e)} className="mt-6 space-y-3 border-t border-[var(--tnl-border)] pt-4" aria-label={t("adminSecurityChangePassword")}>
            <label htmlFor="change-current-password" className="block text-sm">{t("adminSecurityPassword")}</label>
            <input id="change-current-password" name="current_password" type="password" className="tnl-field" autoComplete="current-password" required />
            <label htmlFor="change-new-password" className="block text-sm">{t("adminSecurityNewPassword")}</label>
            <input id="change-new-password" name="password" type="password" className="tnl-field" autoComplete="new-password" minLength={8} required />
            {isEnabled ? <><label htmlFor="change-password-code" className="block text-sm">{t("adminSecurityCode")}</label><input id="change-password-code" name="code" className="tnl-field" autoComplete="one-time-code" required /></> : null}
            <button type="submit" className="tnl-btn tnl-btn-outline" disabled={busy}>{t("adminSecurityChangePassword")}</button>
        </form>
        {error ? <p className="mt-3 text-sm text-[var(--tnl-danger)]" role="alert">{error}</p> : null}
        {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}
    </AdminCard>;
}
