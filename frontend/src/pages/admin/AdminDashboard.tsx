// Dashboard + Needs-review queue + Activity log + Maintainer guide.

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet } from "@/lib/api";
import { AdminPageHeader, AdminSectionHeader, IssueList, Panel } from "@/pages/admin/AdminUI";
import { Spinner } from "@/components/site/Primitives";
import type { AuditEntry, DashboardStats, ListResponse, ReviewQueueItem } from "@/lib/types";

export default function AdminDashboard() {
    const { data, isLoading } = useQuery({
        queryKey: ["admin", "dashboard"],
        queryFn: () => apiGet<DashboardStats>("/admin/dashboard"),
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

    return (
        <div data-testid="admin-dashboard">
            <AdminPageHeader
                title="Dashboard"
                description="A quick look at the website. Click any number to go straight to that part of the site."
                testId="dashboard-header"
            />
            {isLoading ? (
                <Spinner label="Loading…" />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {cards.map((card) => (
                        <Link
                            key={card.key}
                            to={card.to}
                            className="tnl-card tnl-card-hover p-6"
                            data-testid={`dashboard-card-${card.key}`}
                        >
                            <div className="text-[40px] font-bold leading-none" style={{ color: "var(--tnl-green)" }}>
                                {card.value ?? 0}
                                {typeof card.total === "number" ? (
                                    <span className="text-[18px] font-medium" style={{ color: "var(--tnl-tan-text)" }}>
                                        {" "}
                                        / {card.total}
                                    </span>
                                ) : null}
                            </div>
                            <div className="mt-2 text-sm font-medium">{card.label}</div>
                            {typeof card.extra === "number" && card.extra > 0 ? (
                                <div className="mt-1 text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                                    {card.extra} waiting for a decision
                                </div>
                            ) : null}
                        </Link>
                    ))}
                </div>
            )}

            <div className="mt-8 grid gap-4 lg:grid-cols-2">
                <Panel>
                    <AdminSectionHeader title="Common jobs" />
                    <ul className="mt-3 space-y-2 text-sm">
                        {[
                            { to: "/admin/content/posts", label: "Write a news article" },
                            { to: "/admin/content/members", label: "Add or update a member" },
                            { to: "/admin/content/events", label: "Open a registration" },
                            { to: "/admin/registrations", label: "Export registrants to a spreadsheet" },
                            { to: "/admin/theme", label: "Change the site colours" },
                            { to: "/admin/guide", label: "Read the maintainer guide" },
                        ].map((item) => (
                            <li key={item.to}>
                                <Link to={item.to} className="font-medium hover:underline" style={{ color: "var(--tnl-green)" }}>
                                    {item.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </Panel>
                <Panel>
                    <AdminSectionHeader title="Before you publish" />
                    <p className="mt-2 text-sm text-[var(--tnl-body)]">
                        TNL Studio checks every item before it goes live: placeholder text, empty links, images without a
                        description, phone numbers that are not in +62 format, social links that do not match their platform,
                        and statistics that nobody has verified yet. Anything that fails is listed under{" "}
                        <Link to="/admin/review" className="font-medium underline" style={{ color: "var(--tnl-green)" }}>
                            Needs review
                        </Link>
                        .
                    </p>
                </Panel>
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
    const { data, isLoading } = useQuery({
        queryKey: ["admin", "audit"],
        queryFn: () => apiGet<{ items: AuditEntry[]; total: number }>("/admin/audit?limit=200"),
        retry: false,
    });
    const items = data?.items ?? [];

    return (
        <div data-testid="audit-log-page">
            <AdminPageHeader
                title="Activity log"
                description="Every change made in TNL Studio, with who made it and when. Useful when handing the site to the next batch."
                actions={
                    <a href="/api/admin/audit/export" className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm" data-testid="audit-export-button">
                        Export to spreadsheet
                    </a>
                }
                testId="audit-header"
            />
            {isLoading ? (
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
