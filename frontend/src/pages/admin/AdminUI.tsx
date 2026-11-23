// Shared admin UI helpers: page header, cards, quality-issue list, confirm dialog.

import { useState, type ReactNode } from "react";
import { AlertTriangle, Info, TriangleAlert } from "lucide-react";
import { ApiError } from "@/lib/api";
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
    return (
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4" data-testid={testId}>
            <div>
                <h1 className="tnl-h3 text-[26px]">{title}</h1>
                {help ? <p className="mt-1.5 max-w-2xl text-sm text-[var(--tnl-body)]">{help}</p> : null}
            </div>
            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
    );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
    return <div className={`tnl-card p-5 sm:p-6 ${className}`}>{children}</div>;
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

export function StatusPill({ published, testId }: { published: boolean; testId?: string }) {
    return (
        <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold"
            style={published ? { background: "#43594A", color: "#fff" } : { background: "#eaeaec", color: "#3f4245" }}
            data-testid={testId}
        >
            {published ? "Published" : "Draft"}
        </span>
    );
}
