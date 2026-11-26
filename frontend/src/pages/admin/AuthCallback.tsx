// Google OAuth callback: exchanges the one-time session_id server-side, then
// lands the user in the admin. Detected synchronously during render in App.tsx.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { Spinner } from "@/components/site/Primitives";
import type { AuthUser } from "@/lib/types";

export default function AuthCallback() {
    const navigate = useNavigate();
    const processed = useRef(false);
    const backRef = useRef<HTMLButtonElement>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (processed.current) return;
        processed.current = true;

        const hash = window.location.hash || "";
        const sessionId = new URLSearchParams(hash.replace(/^#/, "")).get("session_id");
        if (!sessionId) {
            navigate("/admin/login", { replace: true });
            return;
        }

        apiPost<AuthUser>("/auth/google/session", { session_id: sessionId })
            .then(async (user) => {
                window.history.replaceState(null, "", window.location.pathname);
                await beginSession();
                navigate("/admin", { replace: true, state: { user } });
            })
            .catch((err) => {
                const detail = (err as { body?: { detail?: string } })?.body?.detail;
                setError(typeof detail === "string" ? detail : "Sign-in failed. Please try again.");
                window.history.replaceState(null, "", window.location.pathname);
            });
    }, [navigate]);

    useEffect(() => {
        if (error) backRef.current?.focus();
    }, [error]);

    if (error) {
        return (
            <div className="flex min-h-svh items-center justify-center p-6" style={{ background: "var(--tnl-surface)" }}>
                <div className="tnl-card max-w-md p-8 text-center" data-testid="auth-callback-error">
                    <h1 className="tnl-h5 text-[20px]">Could not sign you in</h1>
                    <p className="mt-3 text-sm text-[var(--tnl-body)]">{error}</p>
                    <button
                        ref={backRef}
                        type="button"
                        onClick={() => navigate("/admin/login", { replace: true })}
                        className="tnl-btn tnl-btn-primary mt-6"
                        data-testid="auth-callback-back-button"
                    >
                        Back to sign in
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-svh items-center justify-center" style={{ background: "var(--tnl-surface)" }}>
            <div role="status" aria-live="polite" data-testid="auth-callback-status">
                <Spinner label="Signing you in…" />
            </div>
        </div>
    );
}
