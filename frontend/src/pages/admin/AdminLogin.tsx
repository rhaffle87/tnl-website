// TNL Studio sign-in: email + password, plus Emergent-managed Google sign-in
// restricted to the ITS domains. Invite acceptance lives at /admin/invite/:token.

import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { KeyRound, LogIn } from "lucide-react";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { useQuery } from "@tanstack/react-query";
import type { AuthUser, GoogleAuthConfig } from "@/lib/types";

function errorText(err: unknown, fallback: string): string {
    if (err instanceof ApiError) {
        const detail = (err.body as { detail?: unknown })?.detail;
        if (typeof detail === "string") return detail;
        if (Array.isArray(detail) && detail.length && typeof detail[0]?.msg === "string") return detail[0].msg;
    }
    return fallback;
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
    return (
        <div className="flex min-h-svh" style={{ background: "var(--tnl-surface)" }}>
            <div className="tnl-hero-gradient hidden w-[44%] flex-col justify-between p-12 lg:flex">
                <div>
                    <span className="text-xs font-bold uppercase tracking-[0.25em]" style={{ color: "var(--tnl-tan)" }}>
                        TNL Studio
                    </span>
                    <h1 className="tnl-h2 mt-4 text-[32px]" style={{ color: "#ffffff" }}>
                        Telecommunication Network Laboratory
                    </h1>
                    <p className="mt-4 max-w-md text-sm leading-relaxed" style={{ color: "#dfe2e5" }}>
                        The content manager for the laboratory website. Everything on the public site — news, members,
                        programmes, pages and colours — is edited here in plain language.
                    </p>
                </div>
                <p className="text-xs" style={{ color: "#7f715c" }}>
                    Department of Electrical Engineering, Institut Teknologi Sepuluh Nopember · Room B-301
                </p>
            </div>
            <div className="flex flex-1 items-center justify-center p-6">
                <div className="tnl-card w-full max-w-md p-8">
                    <h2 className="tnl-h4 text-[24px]">{title}</h2>
                    <p className="mt-1.5 text-sm text-[var(--tnl-body)]">{subtitle}</p>
                    <div className="mt-6">{children}</div>
                </div>
            </div>
        </div>
    );
}

export default function AdminLogin() {
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);
    const [needsCode, setNeedsCode] = useState(false);

    const { data: googleConfig } = useQuery({
        queryKey: ["auth", "google-config"],
        queryFn: () => apiGet<GoogleAuthConfig>("/auth/google/config"),
        retry: false,
    });

    const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
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
            if (message.toLowerCase().includes("two-factor")) setNeedsCode(true);
            toast.error(message);
        } finally {
            setBusy(false);
        }
    };

    const signInWithGoogle = () => {
        // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
        const redirectUrl = window.location.origin + "/admin";
        window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    };

    return (
        <Shell title="Sign in" subtitle="Use your TNL Studio account to manage the laboratory website.">
            <form onSubmit={onSubmit} className="space-y-4" data-testid="admin-login-form">
                <div>
                    <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium">
                        Email address
                    </label>
                    <input id="login-email" name="email" type="email" className="tnl-field" required autoComplete="email" data-testid="login-email-input" />
                </div>
                <div>
                    <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium">
                        Password
                    </label>
                    <input
                        id="login-password"
                        name="password"
                        type="password"
                        className="tnl-field"
                        required
                        autoComplete="current-password"
                        data-testid="login-password-input"
                    />
                </div>
                {needsCode ? (
                    <div>
                        <label htmlFor="login-code" className="mb-1.5 block text-sm font-medium">
                            Two-factor code
                        </label>
                        <input id="login-code" name="code" inputMode="numeric" className="tnl-field" data-testid="login-totp-input" />
                        <p className="mt-1 text-xs text-[var(--tnl-body)]">Open your authenticator app and enter the 6-digit code.</p>
                    </div>
                ) : null}
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

    const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const password = String(data.get("password") ?? "");
        if (password !== String(data.get("confirm") ?? "")) {
            toast.error("The two passwords do not match.");
            return;
        }
        setBusy(true);
        try {
            await apiPost<AuthUser>("/auth/accept-invite", { token, password });
            await beginSession();
            toast.success("Your password is set — welcome to TNL Studio.");
            navigate("/admin", { replace: true });
        } catch (err) {
            toast.error(errorText(err, "This invitation link is no longer valid."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Shell title="Set your password" subtitle="Choose a password for your TNL Studio account.">
            <form onSubmit={onSubmit} className="space-y-4" data-testid="invite-accept-form">
                <div>
                    <label htmlFor="invite-password" className="mb-1.5 block text-sm font-medium">
                        New password
                    </label>
                    <input id="invite-password" name="password" type="password" className="tnl-field" required minLength={8} data-testid="invite-password-input" />
                    <p className="mt-1 text-xs text-[var(--tnl-body)]">At least 8 characters.</p>
                </div>
                <div>
                    <label htmlFor="invite-confirm" className="mb-1.5 block text-sm font-medium">
                        Repeat password
                    </label>
                    <input id="invite-confirm" name="confirm" type="password" className="tnl-field" required minLength={8} data-testid="invite-confirm-input" />
                </div>
                <button type="submit" className="tnl-btn tnl-btn-primary w-full" disabled={busy} data-testid="invite-submit-button">
                    {busy ? "Saving…" : "Set password and sign in"}
                    {!busy ? <KeyRound className="h-4 w-4" aria-hidden="true" /> : null}
                </button>
            </form>
        </Shell>
    );
}
