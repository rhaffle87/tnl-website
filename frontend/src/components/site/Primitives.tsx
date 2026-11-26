// Small presentational primitives shared by the public site.

import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils/utils";

export function SectionHeading({
    title,
    count,
    countLabel,
    description,
    testId,
    light = false,
}: {
    title: string;
    count?: number;
    countLabel?: string;
    description?: string;
    testId?: string;
    light?: boolean;
}) {
    return (
        <div className="mb-8 sm:mb-10" data-testid={testId}>
            <div className="flex items-stretch gap-3">
                <span className={cn("tnl-accent-bar", light && "bg-[var(--tnl-tan)]")} aria-hidden="true" />
                <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
                    <h2
                        className={cn("tnl-h2 font-bold tracking-tight", light && "text-[var(--tnl-inverse-foreground)]")}
                    >
                        {title}
                    </h2>
                    {typeof count === "number" && countLabel ? (
                        <span className="tnl-count-chip" data-testid={testId ? `${testId}-count` : undefined}>
                            {count} {countLabel}
                        </span>
                    ) : null}
                </div>
            </div>
            {description ? (
                <p
                    className={cn("mt-3 max-w-3xl text-base", light ? "text-[var(--tnl-inverse-muted)]" : "text-[var(--tnl-body)]")}
                >
                    {description}
                </p>
            ) : null}
        </div>
    );
}

export function EmptyState({
    title,
    body,
    testId,
    icon,
    as = "h3",
}: {
    title: string;
    body: string;
    testId?: string;
    icon?: ReactNode;
    as?: "h1" | "h2" | "h3";
}) {
    const Heading = as;
    return (
        <div
            className="tnl-card flex flex-col items-center justify-center px-6 py-14 text-center"
            data-testid={testId ?? "empty-state"}
        >
            <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                style={{ background: "color-mix(in srgb, var(--tnl-tan) 18%, transparent)" }}
                aria-hidden="true"
            >
                {icon ?? <Inbox className="h-7 w-7" style={{ color: "var(--tnl-tan-text)" }} />}
            </div>
            <Heading className={as === "h1" ? "tnl-h2" : as === "h2" ? "tnl-h3" : "tnl-h4"}>{title}</Heading>
            <p className="mt-2 max-w-md text-sm text-[var(--tnl-body)]">{body}</p>
        </div>
    );
}

export function Spinner({ label }: { label?: string }) {
    return (
        <div className="flex items-center justify-center gap-3 py-12" role="status" data-testid="loading-spinner">
            <span
                className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--tnl-border)]"
                style={{ borderTopColor: "var(--tnl-green)" }}
                aria-hidden="true"
            />
            {label ? <span className="text-sm text-[var(--tnl-body)]">{label}</span> : null}
        </div>
    );
}

const STATUS_STYLES: Record<string, { bg: string; fg: string }> = {
    open: { bg: "var(--tnl-status-open-bg)", fg: "var(--tnl-status-open-fg)" },
    upcoming: { bg: "var(--tnl-status-upcoming-bg)", fg: "var(--tnl-status-upcoming-fg)" },
    closed: { bg: "var(--tnl-status-neutral-bg)", fg: "var(--tnl-status-neutral-fg)" },
    past: { bg: "var(--tnl-status-neutral-bg)", fg: "var(--tnl-status-neutral-fg)" },
    full: { bg: "var(--tnl-status-full-bg)", fg: "var(--tnl-status-full-fg)" },
};

export function StatusBadge({ status, label, testId }: { status: string; label: string; testId?: string }) {
    const style = STATUS_STYLES[status] ?? STATUS_STYLES.closed;
    return (
        <span
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase"
            style={{ background: style.bg, color: style.fg }}
            data-testid={testId}
        >
            {label}
        </span>
    );
}

export function TypeBadge({ label, testId }: { label: string; testId?: string }) {
    return (
        <span
            className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide uppercase"
            style={{ borderColor: "color-mix(in srgb, var(--tnl-inverse-foreground) 40%, transparent)", color: "var(--tnl-inverse-foreground)" }}
            data-testid={testId}
        >
            {label}
        </span>
    );
}

export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
    return (
        <nav aria-label="Breadcrumb" className="mb-4" data-testid="breadcrumb">
            <ol className="flex flex-wrap items-center gap-2 text-sm text-[var(--tnl-inverse-muted)]">
                {items.map((item, i) => (
                    <li key={`${item.label}-${i}`} className="flex items-center gap-2">
                        {item.to ? (
                            <a href={item.to} className="transition-colors hover:text-[var(--tnl-tan)]">
                                {item.label}
                            </a>
                        ) : (
                            <span style={{ color: "var(--tnl-tan)" }}>{item.label}</span>
                        )}
                        {i < items.length - 1 ? <span aria-hidden="true">/</span> : null}
                    </li>
                ))}
            </ol>
        </nav>
    );
}

export function formatDate(value: string | null | undefined, locale: "en" | "id"): string {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString(locale === "id" ? "id-ID" : "en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}
