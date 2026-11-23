import { Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { LazyMotion, domAnimation } from "motion/react";
import { Toaster } from "@/components/ui/sonner";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";
import { lazyWithRetry as lazy } from "@/lib/lazy";
import SiteLayout, { LocaleProvider } from "@/components/site/SiteLayout";
import Home from "@/pages/Home";

// Public secondary routes — code-split to keep initial landing bundle light
const MemberPage = lazy(() => import("@/pages/MemberPage"));
const ActivityPage = lazy(() => import("@/pages/ActivityPage"));
const EventDetailPage = lazy(() => import("@/pages/EventDetailPage"));
const NewsPage = lazy(() => import("@/pages/NewsPage"));
const NewsArticlePage = lazy(() => import("@/pages/NewsPage").then((m) => ({ default: m.NewsArticlePage })));
const PublicationsPage = lazy(() => import("@/pages/PublicationsPage"));
const ContactPage = lazy(() => import("@/pages/ContactPage"));
const OpenHousePage = lazy(() => import("@/pages/OpenHousePage"));
const DynamicCmsPage = lazy(() => import("@/pages/UtilityPages").then((m) => ({ default: m.DynamicCmsPage })));
const NotFoundPage = lazy(() => import("@/pages/UtilityPages").then((m) => ({ default: m.NotFoundPage })));
const PrivacyPage = lazy(() => import("@/pages/UtilityPages").then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import("@/pages/UtilityPages").then((m) => ({ default: m.TermsPage })));
const VerifyPage = lazy(() => import("@/pages/UtilityPages").then((m) => ({ default: m.VerifyPage })));

// Admin routes — code-split so public visitors never download CMS logic
const AdminLogin = lazy(() => import("@/pages/admin/AdminLogin"));
const AdminInviteAccept = lazy(() => import("@/pages/admin/AdminLogin").then((m) => ({ default: m.AdminInviteAccept })));
const AdminLayout = lazy(() => import("@/pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AuditLogPage = lazy(() => import("@/pages/admin/AdminDashboard").then((m) => ({ default: m.AuditLogPage })));
const MaintainerGuidePage = lazy(() => import("@/pages/admin/AdminDashboard").then((m) => ({ default: m.MaintainerGuidePage })));
const ReviewQueuePage = lazy(() => import("@/pages/admin/AdminDashboard").then((m) => ({ default: m.ReviewQueuePage })));
const ContentManager = lazy(() => import("@/pages/admin/ContentManager"));
const ContentEditor = lazy(() => import("@/pages/admin/ContentEditor"));
const PagesList = lazy(() => import("@/pages/admin/PagesList"));
const AuthCallback = lazy(() => import("@/pages/admin/AuthCallback"));
const LabPhotosPage = lazy(() => import("@/pages/admin/LabConsentScreens").then((m) => ({ default: m.LabPhotosPage })));
const PublicationImportPage = lazy(() => import("@/pages/admin/LabConsentScreens").then((m) => ({ default: m.PublicationImportPage })));
const ApiKeysPage = lazy(() => import("@/pages/admin/AdminScreens").then((m) => ({ default: m.ApiKeysPage })));
const InboxPage = lazy(() => import("@/pages/admin/AdminScreens").then((m) => ({ default: m.InboxPage })));
const MediaLibrary = lazy(() => import("@/pages/admin/AdminScreens").then((m) => ({ default: m.MediaLibrary })));
const RegistrarPage = lazy(() => import("@/pages/admin/AdminScreens").then((m) => ({ default: m.RegistrarPage })));
const SettingsPage = lazy(() => import("@/pages/admin/AdminScreens").then((m) => ({ default: m.SettingsPage })));
const ThemePage = lazy(() => import("@/pages/admin/AdminScreens").then((m) => ({ default: m.ThemePage })));
const UsersPage = lazy(() => import("@/pages/admin/AdminScreens").then((m) => ({ default: m.UsersPage })));

function RouteFallback() {
    return (
        <div className="flex min-h-[50vh] items-center justify-center p-8" aria-live="polite" aria-busy="true">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1E4D2B] border-t-transparent" />
        </div>
    );
}

export default function App() {
    // Read the fragment from useLocation (reactive) — the OAuth return must be
    // handled before any auth guard runs.
    const location = useLocation();
    if (location.hash?.includes("session_id=")) {
        return (
            <LocaleProvider>
                <Suspense fallback={<RouteFallback />}>
                    <AuthCallback />
                </Suspense>
                <Toaster richColors />
            </LocaleProvider>
        );
    }

    return (
        <LocaleProvider>
            <LazyMotion features={domAnimation} strict>
                <RouteErrorBoundary>
                <Suspense fallback={<RouteFallback />}>
                    <Routes>
                    {/* Admin — TNL Studio */}
                    <Route path="/admin/login" element={<AdminLogin />} />
                    <Route path="/admin/invite/:token" element={<AdminInviteAccept />} />
                    <Route path="/admin" element={<AdminLayout />}>
                        <Route index element={<AdminDashboard />} />
                        <Route path="pages" element={<PagesList />} />
                        <Route path="content/:resource" element={<ContentManager />} />
                        <Route path="content/:resource/new" element={<ContentEditor />} />
                        <Route path="content/:resource/:id" element={<ContentEditor />} />
                        <Route path="publications/import" element={<PublicationImportPage />} />
                        <Route path="media" element={<MediaLibrary />} />
                        <Route path="lab-photos" element={<LabPhotosPage />} />
                        <Route path="registrations" element={<RegistrarPage />} />
                        <Route path="inbox" element={<InboxPage />} />
                        <Route path="review" element={<ReviewQueuePage />} />
                        <Route path="theme" element={<ThemePage />} />
                        <Route path="settings" element={<SettingsPage />} />
                        <Route path="users" element={<UsersPage />} />
                        <Route path="api-keys" element={<ApiKeysPage />} />
                        <Route path="audit" element={<AuditLogPage />} />
                        <Route path="guide" element={<MaintainerGuidePage />} />
                    </Route>

                    {/* Public site */}
                    <Route element={<SiteLayout />}>
                        <Route path="/" element={<Home />} />
                        <Route path="/member" element={<MemberPage />} />
                        <Route path="/activity" element={<ActivityPage />} />
                        <Route path="/activity/events/:slug" element={<EventDetailPage />} />
                        <Route path="/open-house" element={<OpenHousePage />} />
                        <Route path="/news" element={<NewsPage />} />
                        <Route path="/news/:slug" element={<NewsArticlePage />} />
                        <Route path="/publications" element={<PublicationsPage />} />
                        <Route path="/contact" element={<ContactPage />} />
                        <Route path="/terms" element={<TermsPage />} />
                        <Route path="/privacy" element={<PrivacyPage />} />
                        <Route path="/verify" element={<VerifyPage />} />
                        <Route path="/verify/:code" element={<VerifyPage />} />
                        <Route path="/p/:slug" element={<DynamicCmsPage />} />
                        <Route path="*" element={<NotFoundPage />} />
                    </Route>
                </Routes>
            </Suspense>
            </RouteErrorBoundary>
            </LazyMotion>
            <Toaster richColors />
        </LocaleProvider>
    );
}
