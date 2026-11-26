// TNL Studio sign-in: email + password, plus Emergent-managed Google sign-in
// restricted to the ITS domains. Invite acceptance lives at /admin/invite/:token.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, LogIn } from "lucide-react";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { useApplyThemeTokens } from "@/lib/theme";
import { useQuery } from "@tanstack/react-query";
import { TnlLogo } from "@/components/site/TnlLogo";
import type { AuthUser, GoogleAuthConfig } from "@/lib/types";

function errorText(err: unknown, fallback: string): string {
    if (err instanceof ApiError) {
        const detail = (err.body as { detail?: unknown })?.detail;
        if (typeof detail === "string") return detail;
        if (Array.isArray(detail) && detail.length && typeof detail[0]?.msg === "string") return detail[0].msg;
    }
    return fallback;
}

function requiresTwoFactor(err: unknown): boolean {
    if (!(err instanceof ApiError)) return false;
    const body = err.body as {
        code?: unknown;
        detail?: unknown;
        requires_code?: unknown;
        two_factor_required?: unknown;
    };
    if (body?.requires_code === true || body?.two_factor_required === true) return true;
    if (typeof body?.code === "string" && /^(two[-_]?factor|mfa|otp|verification)/i.test(body.code)) return true;
    const detail = body?.detail;
    if (typeof detail === "string") return /two[- ]?factor|verification code|\botp\b|\bmfa\b/i.test(detail);
    if (detail && typeof detail === "object") {
        const structured = detail as { code?: unknown; message?: unknown };
        if (typeof structured.code === "string" && /two[-_]?factor|mfa|otp|verification/i.test(structured.code)) return true;
        if (typeof structured.message === "string" && /two[- ]?factor|verification code|\botp\b|\bmfa\b/i.test(structured.message)) return true;
    }
    return false;
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
    useApplyThemeTokens();
    return (
        <div className="flex min-h-svh" style={{ background: "var(--tnl-surface)" }} data-testid="login-shell">
            <section
                className="tnl-hero-gradient hidden w-[44%] flex-col justify-between p-12 lg:flex"
                data-testid="login-brand-panel"
                aria-label="TNL Studio brand"
            >
                <div>
                    <div className="mb-10 flex items-start justify-between gap-6">
                        <TnlLogo variant="light" className="h-14 w-14" />
                        <div
                            className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em]"
                            style={{ color: "var(--tnl-tan)" }}
                            data-testid="login-signal-readout"
                        >
                            <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: "var(--gsm-emerald)" }}
                                aria-hidden="true"
                            />
                            SIGNAL / ONLINE
                        </div>
                    </div>
                    <span
                        className="text-xs font-bold uppercase tracking-[0.25em]"
                        style={{ color: "var(--tnl-tan)" }}
                        data-testid="login-eyebrow"
                    >
                        TNL STUDIO
                    </span>
                    <h1
                        className="tnl-h2 mt-4 text-[32px]"
                        style={{ color: "var(--tnl-inverse-foreground)" }}
                        data-testid="login-brand-title"
                    >
                        Telecommunication Network Laboratory
                    </h1>
                    <p
                        className="mt-4 max-w-md text-sm leading-relaxed"
                        style={{ color: "color-mix(in srgb, var(--tnl-inverse-foreground) 85%, transparent)" }}
                    >
                        The content manager for the laboratory website. Everything on the public site — news, members,
                        programmes, pages and colours — is edited here in plain language.
                    </p>
                    <div className="mt-10 flex items-end gap-1.5 opacity-70" aria-hidden="true" data-testid="login-signal">
                        <span className="tnl-amb-dot" data-testid="login-signal-dot" />
                        <span className="tnl-amb-dot" data-testid="login-signal-dot" />
                        <span className="tnl-amb-dot" data-testid="login-signal-dot" />
                        <span className="tnl-amb-dot" data-testid="login-signal-dot" />
                    </div>
                </div>
                <div
                    className="border-t pt-5"
                    style={{ borderColor: "color-mix(in srgb, var(--tnl-inverse-foreground) 18%, transparent)" }}
                    data-testid="login-meta"
                >
                    <div
                        className="grid grid-cols-3 gap-4 font-mono text-[10px] uppercase leading-relaxed tracking-[0.2em]"
                        style={{ color: "var(--gsm-accent)" }}
                    >
                        <span data-testid="login-meta-cell">Laboratory<br />TNL</span>
                        <span data-testid="login-meta-cell">Access<br />Staff CMS</span>
                        <span data-testid="login-meta-cell">Room<br />B-301</span>
                    </div>
                </div>
            </section>
            <section className="flex flex-1 items-center justify-center p-6" data-testid="login-form-panel">
                <div className="tnl-card w-full max-w-[430px] p-8 sm:p-10">
                    <div className="mb-6 flex items-center justify-between gap-3" data-testid="login-mobile-brand">
                        <div className="flex items-center gap-3">
                            <TnlLogo variant="auto" className="h-10 w-10" />
                            <div>
                                <span className="text-xs font-bold uppercase tracking-widest text-[var(--tnl-tan-text)]">
                                    TNL Studio
                                </span>
                                <h2 className="tnl-h4 text-[22px] leading-tight">{title}</h2>
                            </div>
                        </div>
                        <span
                            className="hidden font-mono text-[10px] uppercase tracking-[0.2em] sm:inline"
                            style={{ color: "var(--tnl-tan-text)" }}
                            data-testid="login-surface-kicker"
                        >
                            SECURE ACCESS
                        </span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--tnl-body)]">{subtitle}</p>
                    <div className="mt-6">{children}</div>
                </div>
            </section>
        </div>
    );
}

export default function AdminLogin() {
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);
    const [needsCode, setNeedsCode] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [inlineError, setInlineError] = useState("");
    const codeRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (needsCode) codeRef.current?.focus();
    }, [needsCode]);

    const { data: googleConfig } = useQuery({
        queryKey: ["auth", "google-config"],
        queryFn: () => apiGet<GoogleAuthConfig>("/auth/google/config"),
        retry: false,
    });

    const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setInlineError("");
        setBusy(true);
        try {
            await apiPost<AuthUser>("/auth/login", {
                email: String(data.get("email") ?? ""),
                password: String(data.get("password") ?? ""),
                code: String(data.get("code") ?? "") || null,
            });
            await beginSession();
            toast.success("Signed in.");
            navigate("/admin", { replace: true });
        } catch (err) {
            const message = errorText(err, "Could not sign in. Please try again.");
            if (requiresTwoFactor(err)) setNeedsCode(true);
            toast.error(message);
            setInlineError(message);
        } finally {
            setBusy(false);
        }
    };

    const signInWithGoogle = () => {
        if (!googleConfig?.auth_base) {
            toast.error("Google Sign-In is currently disabled. Please use email and password.");
            return;
        }
        const redirectUrl = window.location.origin + "/admin";
        window.location.href = `${googleConfig.auth_base}?redirect=${encodeURIComponent(redirectUrl)}`;
    };

    return (
        <Shell title="Sign in" subtitle="Use your TNL Studio account to manage the laboratory website.">
            <form onSubmit={onSubmit} className="space-y-4" data-testid="admin-login-form" aria-busy={busy}>
                <div>
                    <span
                        className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em]"
                        style={{ color: "var(--tnl-tan-text)" }}
                        data-testid="login-field-label-email"
                    >
                        EMAIL ADDRESS
                    </span>
                    <label className="sr-only" htmlFor="login-email">Email address</label>
                    <input id="login-email" name="email" type="email" className="tnl-field" required autoComplete="email" data-testid="login-email-input" />
                </div>
                <div>
                    <span
                        className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em]"
                        style={{ color: "var(--tnl-tan-text)" }}
                        data-testid="login-field-label-password"
                    >
                        PASSWORD
                    </span>
                    <label className="sr-only" htmlFor="login-password">Password</label>
                    <div className="relative">
                        <input
                            id="login-password"
                            name="password"
                            type={showPassword ? "text" : "password"}
                            className="tnl-field pr-11"
                            required
                            autoComplete="current-password"
                            data-testid="login-password-input"
                        />
                        <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                            style={{ color: "var(--tnl-tan-text)" }}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            data-testid="login-password-toggle"
                            onClick={() => setShowPassword((value) => !value)}
                        >
                            {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                        </button>
                    </div>
                </div>
                {needsCode ? (
                    <div>
                        <span
                            className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em]"
                            style={{ color: "var(--tnl-tan-text)" }}
                            data-testid="login-field-label-code"
                        >
                            TWO-FACTOR CODE
                        </span>
                        <label className="sr-only" htmlFor="login-code">Two-factor code</label>
                        <input id="login-code" ref={codeRef} name="code" inputMode="numeric" className="tnl-field" data-testid="login-totp-input" />
                        <p className="mt-1 text-xs text-[var(--tnl-body)]">Open your authenticator app and enter the 6-digit code.</p>
                    </div>
                ) : null}
                <div
                    className="min-h-5 text-xs leading-relaxed"
                    style={{ color: "var(--tnl-danger)" }}
                    role="alert"
                    aria-live="polite"
                    data-testid="login-error"
                >
                    {inlineError}
                </div>
                <button type="submit" className="tnl-btn tnl-btn-primary w-full" disabled={busy} data-testid="login-submit-button">
                    {busy ? "Signing in…" : "Sign in"}
                    {!busy ? <LogIn className="h-4 w-4" aria-hidden="true" /> : null}
                </button>
            </form>

            {googleConfig?.enabled ? (
                <>
                    <div className="my-5 flex items-center gap-3 text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                        <span className="h-px flex-1" style={{ background: "var(--tnl-border)" }} />
                        or
                        <span className="h-px flex-1" style={{ background: "var(--tnl-border)" }} />
                    </div>
                    <button type="button" onClick={signInWithGoogle} className="tnl-btn tnl-btn-outline w-full" data-testid="login-google-button">
                        Continue with Google
                    </button>
                    <p className="mt-3 text-xs text-[var(--tnl-body)]">
                        Only invited accounts on {googleConfig.allowed_domains.map((d) => `@${d}`).join(" or ")} can sign in with Google.
                    </p>
                </>
            ) : null}
        </Shell>
    );
}

export function AdminInviteAccept() {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [inlineError, setInlineError] = useState("");
    const confirmRef = useRef<HTMLInputElement>(null);

    const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const password = String(data.get("password") ?? "");
        if (password !== String(data.get("confirm") ?? "")) {
            setInlineError("The two passwords do not match.");
            confirmRef.current?.focus();
            return;
        }
        setInlineError("");
        setBusy(true);
        try {
            await apiPost<AuthUser>("/auth/accept-invite", { token, password });
            await beginSession();
            toast.success("Your password is set — welcome to TNL Studio.");
            navigate("/admin", { replace: true });
        } catch (err) {
            const message = errorText(err, "This invitation link is no longer valid.");
            setInlineError(message);
            toast.error(message);
        } finally {
            setBusy(false);
        }
    };

    const labelClass = "mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em]";
    const labelStyle = { color: "var(--tnl-tan-text)" };

    return (
        <Shell title="Set your password" subtitle="Choose a password for your TNL Studio account.">
            <form onSubmit={onSubmit} className="space-y-4" data-testid="invite-accept-form" aria-busy={busy}>
                <div>
                    <span className={labelClass} style={labelStyle} data-testid="invite-field-label-password">
                        NEW PASSWORD
                    </span>
                    <label className="sr-only" htmlFor="invite-password">New password</label>
                    <div className="relative">
                        <input id="invite-password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" className="tnl-field pr-12" required minLength={8} disabled={busy} data-testid="invite-password-input" />
                        <button
                            type="button"
                            onClick={() => setShowPassword((value) => !value)}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-[var(--tnl-body)]"
                            data-testid="invite-password-toggle"
                        >
                            {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                        </button>
                    </div>
                    <p className="mt-1 text-xs text-[var(--tnl-body)]">At least 8 characters.</p>
                </div>
                <div>
                    <span className={labelClass} style={labelStyle} data-testid="invite-field-label-confirm">
                        REPEAT PASSWORD
                    </span>
                    <label className="sr-only" htmlFor="invite-confirm">Repeat password</label>
                    <div className="relative">
                        <input id="invite-confirm" ref={confirmRef} name="confirm" type={showConfirm ? "text" : "password"} autoComplete="new-password" className="tnl-field pr-12" required minLength={8} disabled={busy} data-testid="invite-confirm-input" />
                        <button
                            type="button"
                            onClick={() => setShowConfirm((value) => !value)}
                            aria-label={showConfirm ? "Hide password" : "Show password"}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-[var(--tnl-body)]"
                            data-testid="invite-confirm-toggle"
                        >
                            {showConfirm ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                        </button>
                    </div>
                </div>
                <div role="alert" aria-live="polite" className="min-h-5 text-sm" style={{ color: "var(--tnl-danger)" }} data-testid="invite-error">
                    {inlineError}
                </div>
                <button type="submit" className="tnl-btn tnl-btn-primary w-full" disabled={busy} data-testid="invite-submit-button">
                    {busy ? "Saving…" : "Set password and sign in"}
                    {!busy ? <KeyRound className="h-4 w-4" aria-hidden="true" /> : null}
                </button>
            </form>
        </Shell>
    );
}
