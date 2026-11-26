// Shared admin UI helpers: page header, cards, quality-issue list, confirm dialog.

import { useId, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Info, TriangleAlert } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { cn } from "@/lib/utils";
import type { QualityIssue } from "@/lib/types";
import "@/components/admin/admin-editorial.css";

export function adminError(err: unknown, fallback: string): string {
    if (err instanceof ApiError) {
        const detail = (err.body as { detail?: unknown })?.detail;
        if (typeof detail === "string") return detail;
        if (detail && typeof detail === "object" && typeof (detail as { message?: string }).message === "string") {
            return (detail as { message: string }).message;
        }
        if (Array.isArray(detail) && detail.length && typeof detail[0]?.msg === "string") {
            return `${detail[0].loc?.slice(-1)[0] ?? "Field"}: ${detail[0].msg}`;
        }
    }
    return fallback;
}

export function issuesFromError(err: unknown): QualityIssue[] {
    if (err instanceof ApiError) {
        const detail = (err.body as { detail?: { issues?: QualityIssue[] } })?.detail;
        if (detail && typeof detail === "object" && Array.isArray(detail.issues)) return detail.issues;
    }
    return [];
}

// ---------------------------------------------------------------------------
// Design-system v2 primitives
// ---------------------------------------------------------------------------

/** The one card surface. Theme-aware, rounded-xl, hairline border, no glare. */
export function AdminCard({
    children,
    className = "",
    testId,
}: {
    children: ReactNode;
    className?: string;
    testId?: string;
}) {
    return (
        <div
            className={cn(
                "rounded-xl border border-[var(--tnl-border)] bg-[var(--tnl-surface)] p-5 sm:p-6",
                className,
            )}
            data-testid={testId}
        >
            {children}
        </div>
    );
}

/** Compact 13px section label with optional description / hint lines. */
export function AdminSectionHeader({
    title,
    description,
    hint,
    actions,
    className = "",
    testId,
}: {
    title: ReactNode;
    description?: ReactNode;
    hint?: string;
    actions?: ReactNode;
    className?: string;
    testId?: string;
}) {
    return (
        <div className={cn("flex flex-wrap items-start justify-between gap-3", className)} data-testid={testId}>
            <div className="min-w-0">
                <h2 className="text-[13px] font-semibold text-[var(--tnl-heading)]">{title}</h2>
                {description ? <p className="mt-1 text-xs text-[var(--tnl-body)]">{description}</p> : null}
                {hint ? <p className="mt-1 text-xs text-[var(--tnl-tan-text)]">{hint}</p> : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
    );
}

/** Top-of-page title with a description and a right-aligned action slot. */
export function AdminPageHeader({
    title,
    description,
    actions,
    testId,
    className = "",
}: {
    title: string;
    description?: string;
    actions?: ReactNode;
    testId?: string;
    className?: string;
}) {
    return (
        <div className={cn("mb-6 flex flex-wrap items-start justify-between gap-4", className)} data-testid={testId}>
            <div>
                <h1 className="tnl-h3 text-[26px]">{title}</h1>
                {description ? <p className="mt-1.5 max-w-2xl text-sm text-[var(--tnl-body)]">{description}</p> : null}
            </div>
            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
    );
}

/** Backwards-compatible page header — older screens import `AdminHeader`. */
export function AdminHeader({
    title,
    help,
    actions,
    testId,
}: {
    title: string;
    help?: string;
    actions?: ReactNode;
    testId?: string;
}) {
    return <AdminPageHeader title={title} description={help} actions={actions} testId={testId} />;
}

/** Backwards-compatible card surface — older screens import `Panel`. */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
    return <AdminCard className={className}>{children}</AdminCard>;
}

// The toggle and select primitives live in components/admin/controls.tsx so the
// media picker and the structured repeaters can share them; re-exported here so
// every existing `from "@/pages/admin/AdminUI"` import keeps working.
export { AdminSelect, AdminSwitch } from "@/components/admin/controls";

const SEVERITY: Record<string, { Icon: typeof Info; color: string; label: string }> = {
    error: { Icon: AlertTriangle, color: "var(--tnl-danger)", label: "Must fix before publishing" },
    warning: { Icon: TriangleAlert, color: "var(--tnl-warning)", label: "Worth checking" },
    info: { Icon: Info, color: "var(--tnl-info)", label: "Suggestion" },
};

export function IssueList({ issues, testId }: { issues: QualityIssue[]; testId?: string }) {
    if (!issues.length) return null;
    return (
        <ul className="space-y-2" data-testid={testId ?? "quality-issue-list"}>
            {issues.map((issue, i) => {
                const spec = SEVERITY[issue.severity] ?? SEVERITY.info;
                return (
                    <li
                        key={`${issue.code}-${i}`}
                        className="flex gap-3 rounded-[8px] border px-4 py-3 text-sm"
                        style={{ borderColor: "var(--tnl-border)" }}
                        data-testid={`quality-issue-${issue.code}`}
                    >
                        <spec.Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: spec.color }} aria-hidden="true" />
                        <div>
                            <p className="font-medium">{issue.message}</p>
                            <p className="mt-0.5 text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                                {spec.label}
                                {issue.field ? ` · ${issue.field}` : ""}
                                {issue.hint ? ` · ${issue.hint}` : ""}
                            </p>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

export function ConfirmButton({
    label,
    confirmLabel,
    question,
    onConfirm,
    testId,
    variant = "destructive",
}: {
    label: string;
    confirmLabel: string;
    question: string;
    onConfirm: () => void | Promise<void>;
    testId: string;
    variant?: "destructive" | "primary";
}) {
    const [asking, setAsking] = useState(false);
    const [pending, setPending] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const acceptRef = useRef<HTMLButtonElement>(null);
    const questionId = useId();

    const close = () => {
        setAsking(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
    };

    useFocusTrap(asking, dialogRef, { onEscape: close, initialFocusRef: acceptRef });

    const accept = async () => {
        if (pending) return; // guard against double submit
        setPending(true);
        try {
            await onConfirm();
        } finally {
            setPending(false);
            close();
        }
    };

    if (!asking) {
        return (
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setAsking(true)}
                className="rounded-[6px] border px-3 py-1.5 text-xs font-medium transition-colors"
                style={
                    variant === "destructive"
                        ? { borderColor: "var(--tnl-danger-border)", color: "var(--tnl-danger)" }
                        : { borderColor: "var(--tnl-border)" }
                }
                data-testid={testId}
            >
                {label}
            </button>
        );
    }
    return (
        <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={questionId}
            className="inline-flex flex-wrap items-center gap-2 rounded-[6px] border px-3 py-1.5"
            style={{ borderColor: "var(--tnl-danger-border)" }}
        >
            <span id={questionId} className="text-xs" style={{ color: "var(--tnl-danger)" }}>
                {question}
            </span>
            <button
                ref={acceptRef}
                type="button"
                disabled={pending}
                aria-busy={pending}
                onClick={() => void accept()}
                className="rounded-[6px] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--tnl-danger)" }}
                data-testid={`${testId}-confirm`}
            >
                {pending ? "Working..." : confirmLabel}
            </button>
            <button
                type="button"
                disabled={pending}
                onClick={close}
                className="text-xs underline disabled:opacity-50"
                data-testid={`${testId}-cancel`}
            >
                Cancel
            </button>
        </div>
    );
}

/** Shared error banner: always an alert, with a retry action when refetching is possible. */
export function AdminErrorBanner({
    message,
    onRetry,
    testId,
}: {
    message: string;
    onRetry?: () => void;
    testId?: string;
}) {
    return (
        <div
            role="alert"
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: "var(--tnl-danger-border)", color: "var(--tnl-danger)" }}
            data-testid={testId}
        >
            <span>{message}</span>
            {onRetry ? (
                <button type="button" onClick={onRetry} className="tnl-btn tnl-btn-outline h-9 min-h-[36px] text-xs">
                    Coba lagi
                </button>
            ) : null}
        </div>
    );
}

/** "X dari Y" count + a real load-more action; the button disappears at the end. */
export function AdminLoadMore({
    shown,
    total,
    onMore,
    testId,
    countTestId,
    loading = false,
}: {
    shown: number;
    total: number;
    onMore: () => void;
    testId?: string;
    countTestId?: string;
    loading?: boolean;
}) {
    return (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs" data-testid={countTestId} style={{ color: "var(--tnl-tan-text)" }}>
                {shown} dari {total}
            </span>
            {shown < total ? (
                <button
                    type="button"
                    onClick={onMore}
                    disabled={loading}
                    className="tnl-btn tnl-btn-outline h-9 min-h-[36px] text-sm disabled:opacity-50"
                    data-testid={testId}
                >
                    {loading ? "Memuat..." : "Muat lebih banyak"}
                </button>
            ) : null}
        </div>
    );
}

type StatusVariant = "published" | "draft" | "hidden" | "error" | "warning" | "neutral";

const STATUS_STYLES: Record<StatusVariant, { className: string; label: string }> = {
    published: { className: "border-[var(--tnl-green)] bg-[var(--tnl-green)] text-white", label: "Published" },
    draft: { className: "border-[var(--tnl-border)] bg-[var(--tnl-surface-2)] text-[var(--tnl-body)]", label: "Draft" },
    hidden: { className: "border-[var(--tnl-border)] bg-[var(--tnl-surface-2)] text-[var(--tnl-tan-text)]", label: "Hidden" },
    error: {
        className:
            "border-[color-mix(in_srgb,var(--tnl-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--tnl-danger)_14%,transparent)] text-[var(--tnl-danger)]",
        label: "Error",
    },
    warning: {
        className:
            "border-[color-mix(in_srgb,var(--tnl-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--tnl-warning)_14%,transparent)] text-[var(--tnl-warning)]",
        label: "Warning",
    },
    neutral: { className: "border-[var(--tnl-border)] bg-[var(--tnl-surface-2)] text-[var(--tnl-body)]", label: "" },
};

/** One uniform status pill for every admin surface. */
export function AdminStatusBadge({
    variant,
    children,
    label,
    testId,
    className = "",
}: {
    variant: StatusVariant;
    children?: ReactNode;
    label?: string;
    testId?: string;
    className?: string;
}) {
    const spec = STATUS_STYLES[variant];
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold",
                spec.className,
                className,
            )}
            data-testid={testId}
        >
            {children ?? label ?? spec.label ?? variant}
        </span>
    );
}

/** Backwards-compatible published/draft pill — older screens import `StatusPill`. */
export function StatusPill({ published, testId }: { published: boolean; testId?: string }) {
    return <AdminStatusBadge variant={published ? "published" : "draft"} testId={testId} />;
}
