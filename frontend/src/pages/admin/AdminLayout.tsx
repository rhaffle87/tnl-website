// Admin shell: auth guard, categorized dual-scroll layout with viewport-locked shell.
// Independent scroll between sidebar navigation and main content canvas.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
    ArrowLeft,
    ArrowUpRight,
    CalendarCheck,
    CalendarDays,
    Camera,
    ChevronDown,
    ClipboardCheck,
    ClipboardList,
    Cpu,
    Download,
    FileStack,
    FolderKanban,
    GraduationCap,
    Handshake,
    Image,
    Inbox,
    KeyRound,
    LayoutDashboard,
    Library,
    LifeBuoy,
    LogOut,
    Menu,
    Newspaper,
    Palette,
    ScrollText,
    Search,
    Settings,
    UserCog,
    Users,
    X,
} from "lucide-react";
import { useMe } from "@/lib/hooks";
import { useAdminT } from "@/lib/admin-i18n";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useApplyThemeTokens } from "@/lib/theme";
import { endSession } from "@/lib/session";
import { Spinner } from "@/components/site/Primitives";
import { TnlLogo } from "@/components/site/TnlLogo";
import type { AuthUser } from "@/lib/types";

const ROLE_LABELS: Record<AuthUser["role"], string> = {
    super_admin: "Super Admin",
    editor: "Editor",
    contributor: "Contributor",
    registrar: "Registrar",
    viewer: "Viewer",
};

export interface NavItem {
    to: string;
    label: string;
    icon: typeof LayoutDashboard;
    roles: AuthUser["role"][];
    end?: boolean;
}

export interface NavGroup {
    id: string;
    label?: string; // undefined for pinned top (Dashboard)
    items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
    {
        id: "pinned",
        items: [
            { to: "/admin", label: "Dashboard", icon: LayoutDashboard, roles: ["super_admin", "editor", "contributor", "registrar", "viewer"], end: true },
        ],
    },
    {
        id: "content-editorial",
        label: "Content & Editorial",
        items: [
            { to: "/admin/pages", label: "Pages", icon: FileStack, roles: ["super_admin", "editor"] },
            { to: "/admin/content/posts", label: "News", icon: Newspaper, roles: ["super_admin", "editor", "contributor", "viewer"] },
            { to: "/admin/content/members", label: "Members", icon: Users, roles: ["super_admin", "editor", "contributor", "viewer"] },
            { to: "/admin/content/partners", label: "Partners", icon: Handshake, roles: ["super_admin", "editor", "contributor", "viewer"] },
            { to: "/admin/review", label: "Needs review", icon: ClipboardCheck, roles: ["super_admin", "editor", "contributor", "viewer"] },
        ],
    },
    {
        id: "academic-events",
        label: "Academic & Events",
        items: [
            { to: "/admin/content/events", label: "Events & Programs", icon: CalendarCheck, roles: ["super_admin", "editor", "contributor", "viewer"] },
            { to: "/admin/content/practicum", label: "Training", icon: GraduationCap, roles: ["super_admin", "editor", "contributor", "viewer"] },
            { to: "/admin/content/projects", label: "Projects", icon: FolderKanban, roles: ["super_admin", "editor", "contributor", "viewer"] },
            { to: "/admin/content/publications", label: "Publications", icon: Library, roles: ["super_admin", "editor", "contributor", "viewer"] },
            { to: "/admin/publications/import", label: "Import papers", icon: Download, roles: ["super_admin", "editor", "contributor"] },
            { to: "/admin/content/activities", label: "Activities", icon: CalendarDays, roles: ["super_admin", "editor", "contributor", "viewer"] },
        ],
    },
    {
        id: "operations",
        label: "Operations",
        items: [
            { to: "/admin/registrations", label: "Registrations", icon: ClipboardList, roles: ["super_admin", "editor", "registrar"] },
            { to: "/admin/inbox", label: "Contact inbox", icon: Inbox, roles: ["super_admin", "editor", "registrar"] },
        ],
    },
    {
        id: "media-assets",
        label: "Media & Assets",
        items: [
            { to: "/admin/media", label: "Media library", icon: Image, roles: ["super_admin", "editor", "contributor"] },
            { to: "/admin/lab-photos", label: "Lab photos", icon: Camera, roles: ["super_admin", "editor"] },
            { to: "/admin/content/equipment", label: "Lab equipment", icon: Cpu, roles: ["super_admin", "editor", "contributor", "viewer"] },
        ],
    },
    {
        id: "appearance-system",
        label: "Appearance & System",
        items: [
            { to: "/admin/theme", label: "Colours & theme", icon: Palette, roles: ["super_admin", "editor"] },
            { to: "/admin/settings", label: "Site settings", icon: Settings, roles: ["super_admin", "editor"] },
            { to: "/admin/users", label: "People & access", icon: UserCog, roles: ["super_admin"] },
            { to: "/admin/api-keys", label: "API keys", icon: KeyRound, roles: ["super_admin"] },
            { to: "/admin/audit", label: "Activity log", icon: ScrollText, roles: ["super_admin", "editor", "registrar", "viewer"] },
            { to: "/admin/guide", label: "Maintainer guide", icon: LifeBuoy, roles: ["super_admin", "editor", "contributor", "registrar", "viewer"] },
        ],
    },
];

const STORAGE_COLLAPSED_KEY = "tnl-admin-nav-collapsed";

function loadCollapsedState(): Record<string, boolean> {
    try {
        const stored = localStorage.getItem(STORAGE_COLLAPSED_KEY);
        return stored ? (JSON.parse(stored) as Record<string, boolean>) : {};
    } catch {
        return {};
    }
}

export default function AdminLayout() {
    useApplyThemeTokens();
    const t = useAdminT();
    const { data: user, isLoading, isError } = useMe();
    const location = useLocation();
    const navigate = useNavigate();

    const [searchQuery, setSearchQuery] = useState("");
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(loadCollapsedState);
    const [mobileOpen, setMobileOpen] = useState(false);

    const mainScrollRef = useRef<HTMLElement>(null);
    const sidebarScrollRef = useRef<HTMLElement>(null);

    // Mobile drawer a11y: focus the panel on open, hand focus back to the toggle on close.
    // Without this, keyboard and screen-reader users are stranded behind the overlay.
    const drawerRef = useRef<HTMLDivElement>(null);
    const menuToggleRef = useRef<HTMLButtonElement>(null);
    const drawerWasOpen = useRef(false);

    // Shared modal trap: keeps Tab inside the drawer, handles Escape and
    // restores focus to whatever opened it. Declared before the focus effect
    // below so the opener is captured before the panel takes focus.
    useFocusTrap(mobileOpen, drawerRef, { onEscape: () => setMobileOpen(false) });

    useEffect(() => {
        if (mobileOpen) {
            drawerRef.current?.focus();
        } else if (drawerWasOpen.current) {
            menuToggleRef.current?.focus();
        }
        drawerWasOpen.current = mobileOpen;
    }, [mobileOpen]);

    // Skip the guard while the Google callback is still exchanging its session id.
    const isAuthCallback = window.location.hash?.includes("session_id=");

    useEffect(() => {
        document.title = "TNL Studio";
    }, []);

    // Auto-reset main page scroll to top on navigation
    useEffect(() => {
        if (mainScrollRef.current) {
            if (typeof mainScrollRef.current.scrollTo === "function") {
                mainScrollRef.current.scrollTo({ top: 0, behavior: "instant" });
            }
            mainScrollRef.current.scrollTop = 0;
        }
        setMobileOpen(false);
    }, [location.pathname]);

    // Save collapsed states
    const toggleGroup = (groupId: string) => {
        setCollapsedGroups((prev) => {
            const next = { ...prev, [groupId]: !prev[groupId] };
            try {
                localStorage.setItem(STORAGE_COLLAPSED_KEY, JSON.stringify(next));
            } catch {
                // ignore storage quota issues
            }
            return next;
        });
    };

    const signOut = async () => {
        await endSession();
        navigate("/admin/login", { replace: true });
    };

    // Filter groups by user permissions and search query
    const filteredGroups = useMemo(() => {
        if (!user) return [];
        const query = searchQuery.trim().toLowerCase();

        return NAV_GROUPS.map((group) => {
            // First check RBAC per item
            const allowedItems = group.items.filter((item) => item.roles.includes(user.role));
            // Then search filter
            const matchedItems = query
                ? allowedItems.filter((item) => item.label.toLowerCase().includes(query))
                : allowedItems;

            return {
                ...group,
                items: matchedItems,
                hasAllowedItems: allowedItems.length > 0,
            };
        }).filter((group) => group.items.length > 0);
    }, [user, searchQuery]);

    // Auto-scroll active item in sidebar into view
    useEffect(() => {
        if (!sidebarScrollRef.current) return;
        const activeLink = sidebarScrollRef.current.querySelector<HTMLElement>('[data-active="true"]');
        if (activeLink && typeof activeLink.scrollIntoView === "function") {
            activeLink.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }, [location.pathname]);

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

    // Determine current active page label for topbar breadcrumb
    const activeItemLabel = (() => {
        for (const group of NAV_GROUPS) {
            for (const item of group.items) {
                const isActive = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
                if (isActive) return item.label;
            }
        }
        return "Content manager";
    })();

    // Sidebar Inner Component (Used in both Desktop and Mobile Drawer)
    const renderSidebarContent = (isMobile = false) => (
        <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--gsm-obsidian)] text-white">
            {/* Zone 1: Pinned Brand Header */}
            <div className="shrink-0 border-b border-white/10 px-4 py-3.5 bg-[var(--gsm-obsidian)]">
                <div className="flex items-center justify-between">
                    <Link to="/admin" className="flex items-center gap-2.5" data-testid="admin-logo-link" onClick={() => setMobileOpen(false)}>
                        <TnlLogo variant="light" className="h-8 w-8 shrink-0" />
                        <div>
                            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--gsm-accent)]">
                                TNL Studio
                            </span>
                            <span className="block text-xs font-semibold text-white/90">
                                Content Manager
                            </span>
                        </div>
                    </Link>
                    {isMobile && (
                        <button
                            type="button"
                            onClick={() => setMobileOpen(false)}
                            className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
                            aria-label="Close navigation"
                            data-testid="admin-mobile-drawer-close"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Quick Menu Search */}
                <div className="relative mt-3">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" aria-hidden="true" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search menu…"
                        className="h-8 w-full rounded-md border border-white/10 bg-white/[0.04] pl-8 pr-7 text-xs text-white placeholder-white/40 transition-colors focus:border-[var(--gsm-emerald)] focus:bg-white/[0.08] focus:outline-none"
                        aria-label="Search navigation menu"
                        data-testid="admin-nav-search"
                    />
                    {searchQuery ? (
                        <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                            aria-label="Clear search"
                            data-testid="admin-nav-search-clear"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    ) : null}
                </div>
            </div>

            {/* Zone 2: Independent Scrollable Navigation */}
            <nav
                ref={sidebarScrollRef}
                data-testid="admin-sidebar-scroll"
                data-lenis-prevent
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 space-y-4 tnl-admin-sidebar-scroll"
                aria-label="Admin navigation"
            >
                {filteredGroups.length === 0 ? (
                    <div className="px-2 py-4 text-center text-xs text-white/40" data-testid="admin-nav-no-results">
                        No menu items found.
                    </div>
                ) : (
                    filteredGroups.map((group) => {
                        // Check if group contains current active path
                        const hasActiveRoute = group.items.some((item) =>
                            item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
                        );
                        // Group is forced open if searching or contains active route
                        const isCollapsed = Boolean(searchQuery.trim() ? false : (!hasActiveRoute && collapsedGroups[group.id]));

                        return (
                            <div key={group.id} className="space-y-1" data-testid={`admin-nav-group-${group.id}`}>
                                {group.label ? (
                                    <button
                                        type="button"
                                        onClick={() => toggleGroup(group.id)}
                                        className="group flex w-full items-center justify-between rounded px-2 py-1 text-left transition-colors hover:bg-white/[0.04]"
                                        aria-expanded={!isCollapsed}
                                        data-testid={`admin-nav-group-toggle-${group.id}`}
                                    >
                                        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40 group-hover:text-white/70">
                                            {group.label}
                                        </span>
                                        <ChevronDown
                                            className={`h-3 w-3 text-white/40 transition-transform duration-200 group-hover:text-white/70 ${
                                                isCollapsed ? "-rotate-90" : "rotate-0"
                                            }`}
                                            aria-hidden="true"
                                        />
                                    </button>
                                ) : null}

                                {!isCollapsed && (
                                    <div className="space-y-0.5">
                                        {group.items.map(({ to, label, icon: Icon, end }) => {
                                            const active = end ? location.pathname === to : location.pathname.startsWith(to);
                                            const testId = `admin-nav-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
                                            return (
                                                <Link
                                                    key={to}
                                                    to={to}
                                                    onClick={() => setMobileOpen(false)}
                                                    data-active={active}
                                                    aria-current={active ? "page" : undefined}
                                                    className={`flex items-center gap-2.5 rounded-[7px] px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                                        active
                                                            ? "bg-[var(--gsm-primary)] text-white shadow-sm font-semibold border-l-2 border-[var(--gsm-emerald)]"
                                                            : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                                                    }`}
                                                    data-testid={testId}
                                                >
                                                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[var(--gsm-emerald)]" : "text-white/50"}`} aria-hidden="true" />
                                                    <span className="truncate">{label}</span>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </nav>

            {/* Zone 3: Pinned Account Footer */}
            <div className="shrink-0 border-t border-white/10 px-3.5 py-3 bg-[var(--gsm-obsidian)]" data-testid="admin-sidebar-footer">
                <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-white/90" data-testid="admin-current-user">
                            {user.name}
                        </p>
                        <p className="truncate text-[10px] text-[var(--gsm-accent)]">
                            {ROLE_LABELS[user.role]}
                            {user.divisions.length ? ` · ${user.divisions.join(", ")}` : ""}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={signOut}
                        className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                        title={t("adminSignOut")}
                        aria-label={t("adminSignOut")}
                        data-testid="admin-sign-out-button"
                    >
                        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                </div>
                <div className="mt-2.5 pt-2 border-t border-white/[0.06]">
                    <Link
                        to="/"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between text-[11px] text-white/60 hover:text-white transition-colors"
                        data-testid="admin-view-site-link"
                    >
                        <span>{t("adminViewSite")}</span>
                        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                    </Link>
                </div>
            </div>
        </div>
    );

    return (
        <div
            className="h-screen supports-[height:100dvh]:h-dvh w-full overflow-hidden flex bg-[var(--tnl-surface)] text-[var(--tnl-body)]"
            data-testid="admin-root-shell"
        >
            {/* Desktop Viewport-Locked Sidebar */}
            <aside
                className="hidden lg:flex w-64 shrink-0 h-full flex-col overflow-hidden border-r border-white/10"
                data-testid="admin-sidebar"
            >
                {renderSidebarContent(false)}
            </aside>

            {/* Mobile Responsive Off-Canvas Drawer */}
            {mobileOpen && (
                <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation" data-testid="admin-mobile-drawer">
                    {/* Dark Backdrop */}
                    <div
                        className="fixed inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity"
                        onClick={() => setMobileOpen(false)}
                        aria-hidden="true"
                        data-testid="admin-mobile-backdrop"
                    />
                    {/* Drawer Content */}
                    <div
                        ref={drawerRef}
                        tabIndex={-1}
                        className="relative z-10 w-72 max-w-[85vw] h-full shadow-2xl flex flex-col focus:outline-none"
                    >
                        {renderSidebarContent(true)}
                    </div>
                </div>
            )}

            {/* Main Content Column: 2 Zones (Sticky Top Header + Independent Scrollable Canvas) */}
            <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
                {/* Zone 1: Sticky Top Header Bar */}
                <header
                    className="h-14 shrink-0 flex items-center justify-between border-b px-4 lg:px-6 bg-[var(--card)] border-[var(--tnl-border)] shadow-xs"
                    data-testid="admin-topbar"
                >
                    <div className="flex items-center gap-3">
                        <button
                            ref={menuToggleRef}
                            type="button"
                            onClick={() => setMobileOpen(true)}
                            className="rounded-md p-1.5 text-[var(--tnl-body)] hover:bg-[var(--tnl-surface)] hover:text-[var(--tnl-heading)] lg:hidden border border-[var(--tnl-border)]"
                            aria-label="Open sidebar navigation"
                            data-testid="admin-mobile-menu-toggle"
                        >
                            <Menu className="h-4 w-4" />
                        </button>

                        <div className="flex items-center gap-2">
                            {location.pathname !== "/admin" && (
                                <button
                                    type="button"
                                    onClick={() => (location.key === "default" ? navigate("/admin") : navigate(-1))}
                                    className="-ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--tnl-border)] text-[var(--tnl-body)] transition-colors hover:border-[var(--tnl-green)] hover:bg-[var(--tnl-surface)] hover:text-[var(--tnl-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tnl-green)]"
                                    aria-label="Back to previous page"
                                    title="Back"
                                    data-testid="admin-back"
                                >
                                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                                </button>
                            )}
                            <span className="hidden sm:inline-block text-xs font-medium text-[var(--tnl-tan-text)]">
                                TNL Studio
                            </span>
                            <span className="hidden sm:inline-block text-xs text-[var(--tnl-border)]">/</span>
                            <span className="text-sm font-semibold text-[var(--tnl-heading)]" data-testid="admin-header-title">
                                {activeItemLabel}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <Link
                            to="/"
                            target="_blank"
                            rel="noreferrer"
                            className="hidden sm:inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--tnl-border)] bg-[var(--card)] px-2.5 py-1 text-xs font-medium text-[var(--tnl-heading)] hover:border-[var(--tnl-green)] hover:text-[var(--tnl-green)] transition-colors shadow-2xs"
                        >
                            <span>Live site</span>
                            <ArrowUpRight className="h-3 w-3" />
                        </Link>
                        <button
                            type="button"
                            onClick={signOut}
                            className="inline-flex sm:hidden rounded p-1.5 text-[var(--tnl-body)] hover:text-red-600 transition-colors"
                            aria-label="Sign out"
                            data-testid="admin-mobile-sign-out"
                        >
                            <LogOut className="h-4 w-4" />
                        </button>
                    </div>
                </header>

                {/* Zone 2: Independent Scrollable Content Canvas */}
                <main
                    ref={mainScrollRef}
                    data-testid="admin-main-scroll"
                    data-lenis-prevent
                    className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
                >
                    <div className="p-4 sm:p-6 lg:p-8">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
