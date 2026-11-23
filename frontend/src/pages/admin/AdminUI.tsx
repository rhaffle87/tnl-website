// Shared admin UI helpers: page header, cards, quality-issue list, confirm dialog.

import { useState, type ReactNode, type SelectHTMLAttributes } from "react";
import { AlertTriangle, ChevronDown, Info, TriangleAlert } from "lucide-react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { QualityIssue } from "@/lib/types";

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

/**
 * Modern on/off toggle. Replaces `<input type="checkbox">` + floating “Yes/No”
 * labels. The accessible name is the label text (kept byte-identical to the old
 * control) so `getByLabelText` keeps resolving to the switch.
 */
export function AdminSwitch({
    label,
    description,
    checked,
    onCheckedChange,
    disabled = false,
    testId,
    className = "",
    labelHidden = false,
}: {
    label: string;
    description?: string;
    checked: boolean;
    onCheckedChange: (next: boolean) => void;
    disabled?: boolean;
    testId?: string;
    className?: string;
    labelHidden?: boolean;
}) {
    return (
        <div className={cn("flex items-start gap-3", disabled && "opacity-60", className)}>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                disabled={disabled}
                onClick={() => onCheckedChange(!checked)}
                data-testid={testId}
                className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tnl-green)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--tnl-surface)]",
                    "disabled:cursor-not-allowed",
                    checked
                        ? "border-[var(--tnl-green)] bg-[var(--tnl-green)]"
                        : "border-[var(--tnl-border)] bg-[var(--tnl-surface-2)]",
                )}
            >
                <span
                    aria-hidden="true"
                    className={cn(
                        "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                        checked ? "translate-x-[18px]" : "translate-x-0.5",
                    )}
                />
            </button>
            {labelHidden ? null : (
                <span className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--tnl-heading)]">{label}</span>
                    {description ? <span className="mt-0.5 block text-xs text-[var(--tnl-body)]">{description}</span> : null}
                </span>
            )}
        </div>
    );
}

type AdminSelectProps = SelectHTMLAttributes<HTMLSelectElement> & { [key: `data-${string}`]: string | number | undefined };

/** A native `<select>` in the house style: appearance-none + pinned chevron. */
export function AdminSelect({ className = "", children, ...props }: AdminSelectProps) {
    return (
        <div className="relative">
            <select
                {...props}
                className={cn(
                    "h-9 w-full appearance-none rounded-lg border border-[var(--tnl-border)] bg-[var(--tnl-surface-2)] pl-3 pr-8 text-sm text-[var(--tnl-heading)]",
                    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tnl-green)]",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    className,
                )}
            >
                {children}
            </select>
            <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--tnl-body)]"
            />
        </div>
    );
}

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
    if (!asking) {
        return (
            <button
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
        <span className="inline-flex flex-wrap items-center gap-2 rounded-[6px] border px-3 py-1.5" style={{ borderColor: "var(--tnl-danger-border)" }}>
            <span className="text-xs" style={{ color: "var(--tnl-danger)" }}>
                {question}
            </span>
            <button
                type="button"
                onClick={async () => {
                    setAsking(false);
                    await onConfirm();
                }}
                className="rounded-[6px] px-2.5 py-1 text-xs font-semibold text-white"
                style={{ background: "#b91c1c" }}
                data-testid={`${testId}-confirm`}
            >
                {confirmLabel}
            </button>
            <button
                type="button"
                onClick={() => setAsking(false)}
                className="text-xs underline"
                data-testid={`${testId}-cancel`}
            >
                Cancel
            </button>
        </span>
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
