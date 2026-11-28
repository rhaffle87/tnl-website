import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiPost } from "@/lib/api/api";
import { useAdminT } from "@/lib/i18n/admin-i18n";
import { adminError } from "@/pages/admin/AdminUI";

export function PasswordRecoveryForm({ token, onBack }: { token?: string | null; onBack?: () => void }) {
    const t = useAdminT();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const confirmRef = useRef<HTMLInputElement>(null);
    const isConfirm = token !== undefined;
    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (busy) return;
        const values = new FormData(event.currentTarget);
        setError("");
        if (isConfirm && values.get("password") !== values.get("confirm")) {
            setError(t("adminAuthPasswordMismatch"));
            confirmRef.current?.focus();
            return;
        }
        setBusy(true);
        try {
            if (isConfirm) await apiPost("/auth/password-reset/confirm", { token, password: values.get("password") });
            else await apiPost("/auth/password-reset/request", { email: values.get("email") });
            setMessage(t(isConfirm ? "adminRecoveryDone" : "adminRecoverySent"));
        } catch (err) { setError(adminError(err, t("adminRecoveryError"))); }
        finally { setBusy(false); }
    };
    return <div className="space-y-4">
        {isConfirm && !token ? <p role="alert">{t("adminRecoveryMissing")}</p> : message ? <p role="status" className="text-sm">{message}</p> : <form onSubmit={(e) => void submit(e)} className="space-y-4" aria-label={t("adminRecoveryTitle")} aria-busy={busy}>
            {isConfirm ? <>
                <label htmlFor="reset-password" className="block text-sm">{t("adminSecurityNewPassword")}</label>
                <input id="reset-password" name="password" type="password" required minLength={8} autoComplete="new-password" className="tnl-field" />
                <label htmlFor="reset-confirm" className="block text-sm">{t("adminAuthRepeatPassword")}</label>
                <input id="reset-confirm" ref={confirmRef} name="confirm" type="password" required minLength={8} autoComplete="new-password" className="tnl-field" />
            </> : <>
                <label htmlFor="reset-email" className="block text-sm">{t("adminAuthEmail")}</label>
                <input id="reset-email" name="email" type="email" required autoComplete="email" autoCapitalize="none" spellCheck={false} className="tnl-field" />
            </>}
            {error ? <p role="alert" className="text-sm text-[var(--tnl-danger)]">{error}</p> : null}
            <button type="submit" className="tnl-btn tnl-btn-primary w-full" disabled={busy}>{t(busy ? "adminWorking" : isConfirm ? "adminRecoveryConfirm" : "adminRecoveryRequest")}</button>
        </form>}
        {onBack ? <button type="button" className="text-sm text-[var(--tnl-link)] underline" onClick={onBack}>{t("adminRecoveryBack")}</button> : <Link to="/admin/login" className="text-sm text-[var(--tnl-link)] underline">{t("adminRecoveryBack")}</Link>}
    </div>;
}
