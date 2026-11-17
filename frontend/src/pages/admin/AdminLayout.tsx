// Admin shell: auth guard, black sidebar, role-aware navigation. The server is
// the source of truth — this only hides what the role cannot use anyway.

import { useEffect } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
    BookOpen,
    CalendarCheck,
    Camera,
    Cpu,
    Download,
    FileStack,
    FlaskConical,
    Image,
    Inbox,
    KeyRound,
    LayoutDashboard,
    LogOut,
    Newspaper,
    Palette,
    ScrollText,
    Settings,
    ShieldCheck,
    Users,
} from "lucide-react";
import { useMe } from "@/lib/hooks";
import { endSession } from "@/lib/session";
import { Spinner } from "@/components/site/Primitives";
import type { AuthUser } from "@/lib/types";

const ROLE_LABELS: Record<AuthUser["role"], string> = {
    super_admin: "Super Admin",
    editor: "Editor",
    contributor: "Contributor",
    registrar: "Registrar",
    viewer: "Viewer",
};

interface NavItem {
    to: string;
    label: string;
    icon: typeof LayoutDashboard;
    roles: AuthUser["role"][];
    end?: boolean;
}

const NAV: NavItem[] = [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard, roles: ["super_admin", "editor", "contributor", "registrar", "viewer"], end: true },
    { to: "/admin/pages", label: "Pages", icon: FileStack, roles: ["super_admin", "editor"] },
    { to: "/admin/content/posts", label: "News", icon: Newspaper, roles: ["super_admin", "editor", "contributor", "viewer"] },
    { to: "/admin/content/members", label: "Members", icon: Users, roles: ["super_admin", "editor", "contributor", "viewer"] },
    { to: "/admin/content/events", label: "Events & Programs", icon: CalendarCheck, roles: ["super_admin", "editor", "contributor", "viewer"] },
    { to: "/admin/content/activities", label: "Activities", icon: FlaskConical, roles: ["super_admin", "editor", "contributor", "viewer"] },
    { to: "/admin/content/projects", label: "Projects", icon: FlaskConical, roles: ["super_admin", "editor", "contributor", "viewer"] },
    { to: "/admin/content/publications", label: "Publications", icon: BookOpen, roles: ["super_admin", "editor", "contributor", "viewer"] },
    { to: "/admin/publications/import", label: "Import papers", icon: Download, roles: ["super_admin", "editor", "contributor"] },
    { to: "/admin/content/practicum", label: "Practicum", icon: BookOpen, roles: ["super_admin", "editor", "contributor", "viewer"] },
    { to: "/admin/content/equipment", label: "Lab equipment", icon: Cpu, roles: ["super_admin", "editor", "contributor", "viewer"] },
    { to: "/admin/content/partners", label: "Partners", icon: ShieldCheck, roles: ["super_admin", "editor", "contributor", "viewer"] },
    { to: "/admin/media", label: "Media library", icon: Image, roles: ["super_admin", "editor", "contributor"] },
    { to: "/admin/lab-photos", label: "Lab photos", icon: Camera, roles: ["super_admin", "editor"] },
    { to: "/admin/registrations", label: "Registrations", icon: CalendarCheck, roles: ["super_admin", "editor", "registrar", "viewer"] },
    { to: "/admin/inbox", label: "Contact inbox", icon: Inbox, roles: ["super_admin", "editor", "registrar"] },
    { to: "/admin/review", label: "Needs review", icon: ShieldCheck, roles: ["super_admin", "editor", "contributor", "viewer"] },
    { to: "/admin/theme", label: "Colours & theme", icon: Palette, roles: ["super_admin", "editor"] },
    { to: "/admin/settings", label: "Site settings", icon: Settings, roles: ["super_admin", "editor"] },
    { to: "/admin/users", label: "People & access", icon: Users, roles: ["super_admin"] },
    { to: "/admin/api-keys", label: "API keys", icon: KeyRound, roles: ["super_admin"] },
    { to: "/admin/audit", label: "Activity log", icon: ScrollText, roles: ["super_admin", "editor", "registrar", "viewer"] },
    { to: "/admin/guide", label: "Maintainer guide", icon: BookOpen, roles: ["super_admin", "editor", "contributor", "registrar", "viewer"] },
];

export default function AdminLayout() {
    const { data: user, isLoading, isError } = useMe();
    const location = useLocation();
    const navigate = useNavigate();

    // Skip the guard while the Google callback is still exchanging its session id.
    const isAuthCallback = window.location.hash?.includes("session_id=");

    useEffect(() => {
        document.title = "TNL Studio";
    }, []);

    if (isAuthCallback) return <Outlet />;

    if (isLoading) {
        return (
            <div className="flex min-h-svh items-center justify-center" style={{ background: "var(--tnl-surface)" }}>
                <Spinner label="Checking your sign-in…" />
            </div>
        );
    }

    if (isError || !user) {
        return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
    }

    const visible = NAV.filter((item) => item.roles.includes(user.role));

    const signOut = async () => {
        await endSession();
        navigate("/admin/login", { replace: true });
    };

    return (
        <div className="flex min-h-svh" style={{ background: "var(--tnl-surface)" }}>
            <aside
                className="hidden w-64 shrink-0 flex-col lg:flex"
                style={{ background: "#111518", color: "#ffffff" }}
                data-testid="admin-sidebar"
            >
                <div className="border-b px-5 py-5" style={{ borderColor: "#262c33" }}>
                    <Link to="/admin" className="block" data-testid="admin-logo-link">
                        <span className="text-xs font-bold uppercase tracking-[0.25em]" style={{ color: "var(--tnl-tan)" }}>
                            TNL Studio
                        </span>
                        <span className="mt-1 block text-sm font-semibold">Content manager</span>
                    </Link>
                </div>
                <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Admin navigation">
                    {visible.map(({ to, label, icon: Icon, end }) => {
                        const active = end ? location.pathname === to : location.pathname.startsWith(to);
                        return (
                            <Link
                                key={to}
                                to={to}
                                className="mb-1 flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-sm font-medium transition-colors"
                                style={active ? { background: "#43594A", color: "#ffffff" } : { color: "#c8ccd0" }}
                                data-testid={`admin-nav-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                            >
                                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                {label}
                            </Link>
                        );
                    })}
                </nav>
                <div className="border-t px-5 py-4" style={{ borderColor: "#262c33" }}>
                    <p className="text-sm font-semibold" data-testid="admin-current-user">
                        {user.name}
                    </p>
                    <p className="text-xs" style={{ color: "var(--tnl-tan)" }}>
                        {ROLE_LABELS[user.role]}
                        {user.divisions.length ? ` · ${user.divisions.join(", ")}` : ""}
                    </p>
                    <div className="mt-3 flex flex-col gap-2">
                        <Link
                            to="/"
                            className="text-xs underline-offset-2 hover:underline"
                            style={{ color: "#c8ccd0" }}
                            data-testid="admin-view-site-link"
                        >
                            View public site
                        </Link>
                        <button
                            type="button"
                            onClick={signOut}
                            className="flex items-center gap-2 text-xs"
                            style={{ color: "#c8ccd0" }}
                            data-testid="admin-sign-out-button"
                        >
                            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                            Sign out
                        </button>
                    </div>
                </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <header
                    className="flex items-center justify-between gap-4 border-b px-5 py-3 lg:hidden"
                    style={{ background: "#111518", borderColor: "#262c33" }}
                >
                    <Link to="/admin" className="text-sm font-bold text-white">
                        TNL Studio
                    </Link>
                    <button type="button" onClick={signOut} className="text-xs" style={{ color: "#c8ccd0" }} data-testid="admin-mobile-sign-out">
                        Sign out
                    </button>
                </header>
                <nav className="flex gap-1 overflow-x-auto border-b px-3 py-2 tnl-scroll-x lg:hidden" style={{ background: "#1c2228" }}>
                    {visible.map(({ to, label, end }) => {
                        const active = end ? location.pathname === to : location.pathname.startsWith(to);
                        return (
                            <Link
                                key={to}
                                to={to}
                                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium"
                                style={active ? { background: "#43594A", color: "#fff" } : { color: "#c8ccd0" }}
                            >
                                {label}
                            </Link>
                        );
                    })}
                </nav>
                <main className="flex-1 overflow-x-hidden p-5 lg:p-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
