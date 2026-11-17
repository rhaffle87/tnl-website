import { Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import SiteLayout, { LocaleProvider } from "@/components/site/SiteLayout";
import Home from "@/pages/Home";
import MemberPage from "@/pages/MemberPage";
import ActivityPage from "@/pages/ActivityPage";
import NewsPage, { NewsArticlePage } from "@/pages/NewsPage";
import PublicationsPage from "@/pages/PublicationsPage";
import ContactPage from "@/pages/ContactPage";
import { DynamicCmsPage, NotFoundPage, PrivacyPage, TermsPage, VerifyPage } from "@/pages/UtilityPages";
import AdminLogin, { AdminInviteAccept } from "@/pages/admin/AdminLogin";
import AdminLayout from "@/pages/admin/AdminLayout";
import AdminDashboard, { AuditLogPage, MaintainerGuidePage, ReviewQueuePage } from "@/pages/admin/AdminDashboard";
import ContentManager from "@/pages/admin/ContentManager";
import PagesList from "@/pages/admin/PagesList";
import AuthCallback from "@/pages/admin/AuthCallback";
import { LabPhotosPage, PublicationImportPage } from "@/pages/admin/LabConsentScreens";
import {
    ApiKeysPage,
    InboxPage,
    MediaLibrary,
    RegistrarPage,
    SettingsPage,
    ThemePage,
    UsersPage,
} from "@/pages/admin/AdminScreens";

export default function App() {
    // Read the fragment from useLocation (reactive) — the OAuth return must be
    // handled before any auth guard runs.
    const location = useLocation();
    if (location.hash?.includes("session_id=")) {
        return (
            <LocaleProvider>
                <AuthCallback />
                <Toaster richColors />
            </LocaleProvider>
        );
    }

    return (
        <LocaleProvider>
            <Routes>
                {/* Admin — TNL Studio */}
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin/invite/:token" element={<AdminInviteAccept />} />
                <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<AdminDashboard />} />
                    <Route path="pages" element={<PagesList />} />
                    <Route path="content/:resource" element={<ContentManager />} />
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
                    <Route path="/news" element={<NewsPage />} />
                    <Route path="/news/:slug" element={<NewsArticlePage />} />
                    <Route path="/publications" element={<PublicationsPage />} />
                    <Route path="/contact" element={<ContactPage />} />
                    <Route path="/terms" element={<TermsPage />} />
                    <Route path="/privacy" element={<PrivacyPage />} />
                    <Route path="/verify/:code" element={<VerifyPage />} />
                    <Route path="/p/:slug" element={<DynamicCmsPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                </Route>
            </Routes>
            <Toaster richColors />
        </LocaleProvider>
    );
}
