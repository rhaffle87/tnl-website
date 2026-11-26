// Dashboard + Needs-review queue + Activity log + Maintainer guide.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, Calendar, ClipboardList, Image, Plus } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useAdminT } from "@/lib/admin-i18n";
import { AdminErrorBanner, AdminLoadMore, AdminPageHeader, AdminSectionHeader, AdminSelect, IssueList, Panel, adminError } from "@/pages/admin/AdminUI";
import { Spinner } from "@/components/site/Primitives";
import type { AuditEntry, DashboardStats, ListResponse, ReviewQueueItem } from "@/lib/types";

export default function AdminDashboard() {
    const { data, isLoading } = useQuery({
        queryKey: ["admin", "dashboard"],
        queryFn: () => apiGet<DashboardStats>("/admin/dashboard"),
        retry: false,
    });

    const { data: auditData } = useQuery({
        queryKey: ["admin", "recent-audit"],
        queryFn: () => apiGet<{ items: AuditEntry[]; total: number }>("/admin/audit?limit=6"),
        retry: false,
    });

    const cards = [
        { label: "Published articles", value: data?.published_posts, total: data?.posts, to: "/admin/content/posts", key: "posts" },
        { label: "Members", value: data?.members, to: "/admin/content/members", key: "members" },
        { label: "Open registrations", value: data?.open_events, total: data?.events, to: "/admin/content/events", key: "events" },
        { label: "Registrations", value: data?.registrations, extra: data?.pending_registrations, to: "/admin/registrations", key: "registrations" },
        { label: "New messages", value: data?.new_messages, to: "/admin/inbox", key: "messages" },
        { label: "Needs review", value: data?.needs_review, to: "/admin/review", key: "review" },
    ];

    const quickActions = [
        { label: "New News", to: "/admin/content/posts/new", icon: Plus, primary: true },
        { label: "New Event", to: "/admin/content/events/new", icon: Calendar },
        { label: "Registrations Desk", to: "/admin/registrations", icon: ClipboardList },
        { label: "Upload Media", to: "/admin/media", icon: Image },
    ];

    return (
        <div data-testid="admin-dashboard" className="space-y-6">
            {/* Layer 1: Header + Quick Action Command Bar */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <AdminPageHeader
                    title="Dashboard"
                    description="TNL Studio command center. Click any metric to manage live resources."
                    testId="dashboard-header"
                    className="!mb-0"
                />
                <div className="flex flex-wrap items-center gap-2" data-testid="dashboard-quick-actions">
                    {quickActions.map((qa) => {
                        const Icon = qa.icon;
                        return (
                            <Link
                                key={qa.to}
                                to={qa.to}
                                className={qa.primary ? "tnl-btn tnl-btn-primary h-9 text-xs" : "tnl-btn tnl-btn-outline h-9 text-xs"}
                            >
                                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>{qa.label}</span>
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* Layer 2: Metric Cards Grid */}
            {isLoading ? (
                <Spinner label="Loading…" />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="dashboard-metrics-grid">
                    {cards.map((card) => (
                        <Link
                            key={card.key}
                            to={card.to}
                            className="tnl-card tnl-card-hover p-5 transition-all duration-200"
                            data-testid={`dashboard-card-${card.key}`}
                        >
                            <div className="text-[36px] font-bold leading-none" style={{ color: "var(--tnl-green)" }}>
                                {card.value ?? 0}
                                {typeof card.total === "number" ? (
                                    <span className="text-[16px] font-medium" style={{ color: "var(--tnl-tan-text)" }}>
                                        {" "}
                                        / {card.total}
                                    </span>
                                ) : null}
                            </div>
                            <div className="mt-2 text-sm font-medium text-[var(--tnl-heading)]">{card.label}</div>
                            {typeof card.extra === "number" && card.extra > 0 ? (
                                <div className="mt-1 text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                                    {card.extra} waiting for a decision
                                </div>
                            ) : null}
                        </Link>
                    ))}
                </div>
            )}

            {/* Layer 3: 2-Column Operational Grid */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Left: Recent Activity Feed */}
                <Panel>
                    <div className="flex items-center justify-between">
                        <AdminSectionHeader title="Recent Activity" />
                        <Link to="/admin/audit" className="text-xs font-medium text-[var(--tnl-green)] hover:underline inline-flex items-center gap-1">
                            <span>View all log</span>
                            <ArrowUpRight className="h-3 w-3" />
                        </Link>
                    </div>
                    <div className="mt-4 space-y-3" data-testid="dashboard-recent-activity">
                        {auditData?.items?.length ? (
                            auditData.items.slice(0, 5).map((entry) => (
                                <div key={entry.id} className="flex items-start justify-between gap-3 text-xs border-b border-[var(--tnl-border)] pb-2.5 last:border-0 last:pb-0">
                                    <div className="min-w-0">
                                        <p className="font-medium text-[var(--tnl-heading)] truncate">
                                            {entry.action} <span className="text-[var(--tnl-muted)] font-mono">[{entry.resource}]</span>
                                        </p>
                                        <p className="text-[11px] text-[var(--tnl-body)] truncate">{entry.actor_email}</p>
                                    </div>
                                    <span className="shrink-0 text-[11px] text-[var(--tnl-muted)] font-mono">
                                        {new Date(entry.created_at).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <p className="text-xs text-[var(--tnl-muted)]">No recent changes recorded.</p>
                        )}
                    </div>
                </Panel>

                {/* Right: Content Health & Quick Links */}
                <div className="space-y-6">
                    <Panel>
                        <AdminSectionHeader title="Content Health & Alerts" />
                        <div className="mt-3 space-y-2 text-sm">
                            <div className="flex items-center justify-between text-xs py-1">
                                <span className="text-[var(--tnl-body)]">Open House 2026:</span>
                                <span className="font-semibold text-[var(--gsm-emerald)]">30 / 30 Quota Filled</span>
                            </div>
                            <div className="flex items-center justify-between text-xs py-1">
                                <span className="text-[var(--tnl-body)]">Needs Review Queue:</span>
                                <span className="font-medium">
                                    {data?.needs_review ? (
                                        <Link to="/admin/review" className="text-amber-600 dark:text-amber-400 underline">
                                            {data.needs_review} item(s) pending
                                        </Link>
                                    ) : (
                                        <span className="text-[var(--tnl-muted)]">All items passed checks</span>
                                    )}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-xs py-1">
                                <span className="text-[var(--tnl-body)]">Contact Inbox:</span>
                                <span className="font-medium">
                                    {data?.new_messages ? (
                                        <Link to="/admin/inbox" className="text-[var(--tnl-green)] underline">
                                            {data.new_messages} unread message(s)
                                        </Link>
                                    ) : (
                                        <span className="text-[var(--tnl-muted)]">0 unread</span>
                                    )}
                                </span>
                            </div>
                        </div>
                    </Panel>

                    <Panel>
                        <AdminSectionHeader title="Common Tasks" />
                        <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            {[
                                { to: "/admin/content/posts", label: "Write a news article" },
                                { to: "/admin/content/members", label: "Add or update a member" },
                                { to: "/admin/content/events", label: "Open a registration" },
                                { to: "/admin/registrations", label: "Export registrations (.xlsx)" },
                                { to: "/admin/theme", label: "Change site colours" },
                                { to: "/admin/guide", label: "Read maintainer guide" },
                            ].map((item) => (
                                <li key={item.to}>
                                    <Link to={item.to} className="font-medium hover:underline text-[var(--tnl-green)] block truncate">
                                        • {item.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </Panel>
                </div>
            </div>
        </div>
    );
}

export function ReviewQueuePage() {
    const { data, isLoading } = useQuery({
        queryKey: ["admin", "review-queue"],
        queryFn: () => apiGet<ListResponse<ReviewQueueItem>>("/admin/review-queue"),
        retry: false,
    });
    const items = data?.items ?? [];

    return (
        <div data-testid="review-queue-page">
            <AdminPageHeader
                title="Needs review"
                description="These items cannot be published until the problems below are fixed. Open the item, correct it, then publish."
                testId="review-queue-header"
            />
            {isLoading ? (
                <Spinner label="Loading…" />
            ) : items.length === 0 ? (
                <Panel>
                    <p className="text-sm text-[var(--tnl-body)]" data-testid="review-queue-empty">
                        Nothing needs review. Everything saved so far passes the content checks.
                    </p>
                </Panel>
            ) : (
                <div className="space-y-4">
                    {items.map((item) => (
                        <Panel key={`${item.resource}-${item.id}`}>
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <span className="tnl-count-chip">{item.resource}</span>
                                    <h2 className="mt-2 text-[18px] font-bold" data-testid={`review-item-${item.id}`}>
                                        {item.title}
                                    </h2>
                                </div>
                                <Link
                                    to={`/admin/content/${item.resource}?edit=${item.id}`}
                                    className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm"
                                    data-testid={`review-open-${item.id}`}
                                >
                                    Open and fix
                                </Link>
                            </div>
                            <IssueList issues={item.issues} testId={`review-issues-${item.id}`} />
                        </Panel>
                    ))}
                </div>
            )}
        </div>
    );
}

export function AuditLogPage() {
    const t = useAdminT();
    const [period, setPeriod] = useState("");
    // Backend caps a page at 200; grow the page in smaller steps on demand.
    const [limit, setLimit] = useState(50);
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["admin", "audit", period, limit],
        queryFn: () => apiGet<{ items: AuditEntry[]; total: number }>(`/admin/audit?limit=${limit}${period ? `&period=${period}` : ""}`),
        retry: false,
    });
    useEffect(() => {
        setLimit(50);
    }, [period]);
    const items = data?.items ?? [];
    const total = Math.min(data?.total ?? items.length, 200);

    return (
        <div data-testid="audit-log-page">
            <AdminPageHeader
                title={t("adminActivityLog")}
                description="Every change made in TNL Studio, with who made it and when. Filter by time range; export the visible range as a spreadsheet. Useful when handing the site to the next batch."
                actions={
                    <a href={`/api/admin/audit/export?${period ? `period=${period}&` : ""}limit=${limit}`} className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm" data-testid="audit-export-button">
                        Export to spreadsheet
                    </a>
                }
                testId="audit-header"
            />
            <Panel className="mb-6">
                <div className="flex flex-wrap items-center gap-3">
                    <label htmlFor="audit-period-filter" className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>Time range</label>
                    <AdminSelect
                        id="audit-period-filter"
                        data-testid="audit-period-filter"
                        wrapperClassName="w-auto min-w-[150px]"
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                    >
                        <option value="">All time</option>
                        <option value="hour">Last hour</option>
                        <option value="day">Last 24 hours</option>
                        <option value="week">Last 7 days</option>
                        <option value="month">Last 30 days</option>
                        <option value="year">Last 12 months</option>
                    </AdminSelect>
                    <span className="text-xs" style={{ color: "var(--tnl-tan-text)" }} data-testid="audit-count">
                        {items.length} dari {total} {total === 1 ? "event" : "events"}
                    </span>
                </div>
            </Panel>
            {error ? (
                <AdminErrorBanner
                    message={adminError(error, "Could not load the activity log.")}
                    onRetry={() => void refetch()}
                />
            ) : isLoading ? (
                <Spinner label="Loading…" />
            ) : (
                <Panel className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="audit-table">
                        <thead>
                            <tr className="text-left" style={{ color: "var(--tnl-tan-text)" }}>
                                <th className="pb-2 pr-4 font-semibold">When</th>
                                <th className="pb-2 pr-4 font-semibold">Who</th>
                                <th className="pb-2 pr-4 font-semibold">Action</th>
                                <th className="pb-2 font-semibold">Item</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((entry) => (
                                <tr key={entry.id} className="border-t" style={{ borderColor: "var(--tnl-border)" }}>
                                    <td className="py-2.5 pr-4 whitespace-nowrap">{new Date(entry.created_at).toLocaleString()}</td>
                                    <td className="py-2.5 pr-4">{entry.actor_email}</td>
                                    <td className="py-2.5 pr-4 font-medium">{entry.action}</td>
                                    <td className="py-2.5">{entry.resource}</td>
                                </tr>
                            ))}
                            {items.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="py-6 text-center text-[var(--tnl-body)]">
                                        No activity recorded yet.
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </Panel>
            )}
            {!error && !isLoading && items.length > 0 ? (
                <AdminLoadMore
                    shown={items.length}
                    total={total}
                    onMore={() => setLimit((current) => Math.min(current + 50, 200))}
                />
            ) : null}
        </div>
    );
}

const GUIDE = [
    {
        title: "Add a news article",
        steps: [
            "Open News in the left menu and click “Add new”.",
            "Fill in the title and a one-line summary, then write the article body.",
            "Fill in both the English and Indonesian fields so the language switch works.",
            "Save as a draft first. When you are happy, set Status to Published and save again.",
            "If publishing is refused, read the list of problems shown and fix each one.",
        ],
    },
    {
        title: "Add a member",
        steps: [
            "Open Members and click “Add new”.",
            "Choose the role: lecturer, researcher or assistant.",
            "For assistants, set the batch (for example 2026/2027), the division and the position.",
            "Upload a photo in the Media library first, then paste its link into the photo field — always with a description.",
            "Personal details such as NIM and personal email stay hidden unless you tick the box to show them.",
        ],
    },
    {
        title: "Change the colours",
        steps: [
            "Open Colours & theme.",
            "Adjust any colour. The contrast check runs as you type.",
            "Click “Save draft” to keep working, or “Publish theme” to make it live.",
            "If a pair of colours is too hard to read, publishing is blocked until you fix it.",
            "“Reset to TNL default” puts the original black, tan and dark green back.",
        ],
    },
    {
        title: "Add a widget to a page",
        steps: [
            "Open Pages and click the page you want to change.",
            "Click “Add widget” and pick one from the list.",
            "Use the arrows to move it up or down, the copy icon to duplicate it, and the eye icon to hide it without deleting.",
            "Every change is saved as a version — see Revisions to go back.",
        ],
    },
    {
        title: "Open a registration",
        steps: [
            "Open Events & Programs and create or edit an event.",
            "Set the capacity, the registration open date and the close date.",
            "Build the form by adding fields — name, email, WhatsApp, NIM, and anything else you need.",
            "Publish the event. The public page shows a Register button automatically, and closes it after the close date.",
        ],
    },
    {
        title: "Export registrants",
        steps: [
            "Open Registrations.",
            "Choose the event, and optionally a status such as Accepted.",
            "Click “Export to spreadsheet”. The file opens in Excel or Google Sheets.",
            "Personal data must not be shared outside the laboratory — see the privacy policy.",
        ],
    },
    {
        title: "Add an admin",
        steps: [
            "Open People & access (Super Admin only).",
            "Click “Invite someone”, enter their name, email and role.",
            "They receive a link to set their own password. You never type their password.",
            "To remove access immediately, switch their account to inactive.",
        ],
    },
    {
        title: "Restore an earlier version",
        steps: [
            "Open Pages, then the page you want.",
            "Click “Revisions”.",
            "Find the version by date and who saved it, then click “Restore”.",
            "The current version is saved first, so restoring is always reversible.",
        ],
    },
    {
        title: "Back up the site",
        steps: [
            "Backups are a script on the server: scripts/backup.sh.",
            "It saves the database and the uploaded files, keeping the last 14 days.",
            "Ask the department IT staff to run it nightly with cron.",
            "Restore instructions are in the README under “Backup and restore”.",
        ],
    },
    {
        title: "Hand over Super Admin",
        steps: [
            "Invite the incoming person as a Super Admin and wait for them to set their password.",
            "Walk them through this guide together, and show them the Activity log.",
            "Only then switch your own account to Editor, or ask them to deactivate it.",
            "The system refuses to remove the last active Super Admin, so you cannot lock everyone out.",
        ],
    },
    {
        title: "Deploy an update",
        steps: [
            "The README covers two routes: a Node/Python server behind a reverse proxy, or a static export of the public pages.",
            "After any change to the .env file, the services must be restarted.",
            "The production address is set by PUBLIC_SITE_URL so links and the sitemap stay correct.",
        ],
    },
];

export function MaintainerGuidePage() {
    return (
        <div data-testid="maintainer-guide-page">
            <AdminPageHeader
                title="Maintainer guide"
                description="Everything an incoming assistant needs, in plain language. No coding knowledge required."
                testId="guide-header"
            />
            <div className="grid gap-4 lg:grid-cols-2">
                {GUIDE.map((section, i) => (
                    <Panel key={section.title}>
                        <AdminSectionHeader title={section.title} testId={`guide-section-${i}`} />
                        <ol className="mt-3 space-y-2 text-sm text-[var(--tnl-body)]">
                            {section.steps.map((step, j) => (
                                <li key={j} className="flex gap-3">
                                    <span className="font-bold" style={{ color: "var(--tnl-tan)" }}>
                                        {j + 1}
                                    </span>
                                    <span>{step}</span>
                                </li>
                            ))}
                        </ol>
                    </Panel>
                ))}
            </div>
        </div>
    );
}
