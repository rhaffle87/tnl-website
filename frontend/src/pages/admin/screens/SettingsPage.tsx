import { useId, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Check, Copy, FileJson, KeyRound, Upload } from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/lib/api/api";
import { useAdminT } from "@/lib/i18n/admin-i18n";
import { AdminCard, AdminErrorBanner, AdminPageHeader, AdminSectionHeader, AdminSelect, AdminSwitch, Panel, adminError } from "@/pages/admin/AdminUI";
import { Spinner } from "@/components/site/Primitives";
import { InlineMediaField } from "@/components/admin/media";
import type { FigmaImportTokensResult, FigmaSyncStatus, FigmaTokenResult, SiteSettings } from "@/lib/types/types";

function Field({ label, value, onChange, help, testId }: { label: string; value: string; onChange: (v: string) => void; help?: string; testId: string }) {
    const fieldId = useId();
    return (
        <div>
            <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium">{label}</label>
            <input id={fieldId} className="tnl-field" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} data-testid={testId} />
            {help ? <p className="mt-1 text-xs" style={{ color: "var(--tnl-tan-text)" }}>{help}</p> : null}
        </div>
    );
}

export function SettingsPage() {
    const t = useAdminT();
    const qc = useQueryClient();
    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: ["admin", "settings"],
        queryFn: () => apiGet<SiteSettings>("/admin/settings"),
        retry: false,
    });
    const [form, setForm] = useState<Partial<SiteSettings> | null>(null);
    const [figmaRawJson, setFigmaRawJson] = useState("");
    const [jsonImportPreview, setJsonImportPreview] = useState<Record<string, unknown> | null>(null);
    const [generatedToken, setGeneratedToken] = useState<string | null>(null);
    const [copiedToken, setCopiedToken] = useState(false);
    const current = { ...(data ?? {}), ...(form ?? {}) } as SiteSettings;

    const { data: figmaStatus, refetch: refetchFigmaStatus } = useQuery<FigmaSyncStatus>({
        queryKey: ["admin", "figma", "status"],
        queryFn: () => apiGet<FigmaSyncStatus>("/admin/figma/status"),
        retry: false,
    });

    const generateToken = useMutation({
        mutationFn: () => apiPost<FigmaTokenResult>("/admin/figma/token"),
        onSuccess: (res) => {
            setGeneratedToken(res.token);
            void refetchFigmaStatus();
            toast.success(t("adminSettingsFigmaTokenCreated"));
        },
        onError: (err) => toast.error(adminError(err, t("adminSettingsFigmaTokenError"))),
    });

    const importTokensMutation = useMutation({
        mutationFn: (payload: Record<string, unknown>) => apiPost<FigmaImportTokensResult>("/admin/figma/import-tokens", payload),
        onSuccess: (res) => {
            void qc.invalidateQueries({ queryKey: ["admin", "settings"] });
            void qc.invalidateQueries({ queryKey: ["admin", "theme"] });
            void qc.invalidateQueries({ queryKey: ["public", "settings"] });
            setFigmaRawJson("");
            setJsonImportPreview(null);
            toast.success(
                t("adminSettingsFigmaImported").replace(
                    "{status}",
                    t(res.all_pass ? "adminSettingsFigmaPass" : "adminSettingsFigmaCheckTheme"),
                ),
            );
        },
        onError: (err) => toast.error(adminError(err, t("adminSettingsFigmaImportError"))),
    });

    const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsed = JSON.parse(event.target?.result as string) as Record<string, unknown>;
                setFigmaRawJson(JSON.stringify(parsed, null, 2));
                setJsonImportPreview(parsed);
            } catch {
                toast.error(t("adminSettingsFigmaInvalidJson"));
            }
        };
        reader.readAsText(file);
    };

    const handleJsonPaste = (text: string) => {
        setFigmaRawJson(text);
        if (!text.trim()) {
            setJsonImportPreview(null);
            return;
        }
        try {
            const parsed = JSON.parse(text) as Record<string, unknown>;
            setJsonImportPreview(parsed);
        } catch {
            setJsonImportPreview(null);
        }
    };

    const save = useMutation({
        mutationFn: () =>
            apiPut<SiteSettings>("/admin/settings", {
                site_title: current.site_title,
                site_title_id: current.site_title_id,
                short_name: current.short_name,
                logo_url: current.logo_url,
                logo_url_dark: current.logo_url_dark,
                its_logo_url: current.its_logo_url,
                contact: current.contact,
                social: current.social,
                seo: current.seo,
                language_default: current.language_default,
                analytics_snippet: current.analytics_snippet,
                maintenance_mode: current.maintenance_mode,
                announcement: current.announcement,
                retention_days: current.retention_days,
            }),
    });

    const saveSettings = async () => {
        try {
            await save.mutateAsync();
            void qc.invalidateQueries({ queryKey: ["admin", "settings"] });
            void qc.invalidateQueries({ queryKey: ["public", "settings"] });
            toast.success(t("adminSettingsSaved"));
        } catch (err) {
            toast.error(adminError(err, t("adminSettingsSaveError")));
        }
    };

    if (isError || !data) {
        return (
            <AdminErrorBanner
                message={adminError(error, t("adminSettingsLoadError"))}
                onRetry={() => void refetch()}
            />
        );
    }
    if (isLoading) return <Spinner label={t("adminLoading")} />;

    const set = (patch: Partial<SiteSettings>) => setForm({ ...(form ?? {}), ...patch });

    return (
        <div data-testid="settings-page">
            <AdminPageHeader
                title={t("adminSettingsTitle")}
                description={t("adminSettingsDescription")}
                actions={
                    <button type="button" onClick={() => void saveSettings()} disabled={save.isPending} className="tnl-btn tnl-btn-primary h-10 min-h-[40px] text-sm" data-testid="settings-save-button">
                        {t("adminSettingsSave")}
                    </button>
                }
                testId="settings-header"
            />

            <div className="grid gap-4 lg:grid-cols-2">
                <Panel>
                    <AdminSectionHeader title={t("adminSettingsIdentity")} />
                    <div className="mt-3 space-y-3">
                        <Field label={t("adminSettingsNameEn")} value={current.site_title} onChange={(v) => set({ site_title: v })} testId="settings-title-en" />
                        <Field label={t("adminSettingsNameId")} value={current.site_title_id} onChange={(v) => set({ site_title_id: v })} testId="settings-title-id" />
                        <Field label={t("adminSettingsShortName")} value={current.short_name} onChange={(v) => set({ short_name: v })} testId="settings-short-name" />
                        <div>
                            <label className="block text-sm font-medium">
                                <span className="mb-1.5 block">{t("adminSettingsDefaultLang")}</span>
                                <AdminSelect
                                    value={current.language_default}
                                    onChange={(e) => set({ language_default: e.target.value })}
                                    data-testid="settings-language"
                                >
                                    <option value="id">Bahasa Indonesia</option>
                                    <option value="en">English</option>
                                </AdminSelect>
                            </label>
                        </div>
                    </div>
                </Panel>

                <Panel>
                    <AdminSectionHeader title={t("adminSettingsLogos")} />
                    <div className="mt-3 space-y-4">
                        <InlineMediaField
                            label={t("adminSettingsLogoLight")}
                            value={current.logo_url}
                            onChange={(url) => set({ logo_url: url })}
                            defaultFolder="general"
                            aspect="square"
                            testId="settings-logo-url"
                        />
                        <InlineMediaField
                            label={t("adminSettingsLogoDark")}
                            value={current.logo_url_dark}
                            onChange={(url) => set({ logo_url_dark: url })}
                            defaultFolder="general"
                            aspect="square"
                            testId="settings-logo-dark-url"
                        />
                        <InlineMediaField
                            label={t("adminSettingsLogoIts")}
                            value={current.its_logo_url}
                            onChange={(url) => set({ its_logo_url: url })}
                            defaultFolder="general"
                            aspect="square"
                            testId="settings-its-logo-url"
                        />
                        <InlineMediaField
                            label={t("adminSettingsOgImage")}
                            value={current.seo?.og_image_url}
                            onChange={(url) => set({ seo: { ...current.seo, og_image_url: url } })}
                            defaultFolder="general"
                            aspect="video"
                            testId="settings-og-image-url"
                        />
                    </div>
                </Panel>

                <Panel>
                    <AdminSectionHeader title={t("adminSettingsContact")} />
                    <div className="mt-3 space-y-3">
                        <Field label={t("adminSettingsEmail")} value={current.contact?.email ?? ""} onChange={(v) => set({ contact: { ...current.contact, email: v } })} testId="settings-contact-email" />
                        <Field label={t("adminSettingsPhone")} value={current.contact?.phone ?? ""} onChange={(v) => set({ contact: { ...current.contact, phone: v } })} help={t("adminSettingsPhoneHelp")} testId="settings-contact-phone" />
                        <Field label={t("adminSettingsRoom")} value={current.contact?.room ?? ""} onChange={(v) => set({ contact: { ...current.contact, room: v } })} testId="settings-contact-room" />
                        <Field label={t("adminSettingsAddressEn")} value={current.contact?.address ?? ""} onChange={(v) => set({ contact: { ...current.contact, address: v } })} testId="settings-contact-address" />
                        <Field label={t("adminSettingsAddressId")} value={current.contact?.address_id ?? ""} onChange={(v) => set({ contact: { ...current.contact, address_id: v } })} testId="settings-contact-address-id" />
                        <Field label="Instagram" value={current.social?.instagram ?? ""} onChange={(v) => set({ social: { ...current.social, instagram: v } })} testId="settings-instagram" />
                    </div>
                </Panel>

                <Panel>
                    <AdminSectionHeader title={t("adminSettingsAnnouncement")} />
                    <div className="mt-3 space-y-3">
                        <AdminSwitch
                            label={t("adminSettingsShowPopup")}
                            checked={Boolean(current.announcement?.enabled)}
                            onCheckedChange={(next) => set({ announcement: { ...current.announcement, enabled: next } })}
                            testId="settings-announcement-enabled"
                        />
                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-[var(--tnl-heading)]">{t("adminSettingsPresentation")}</span>
                            <AdminSelect
                                value={current.announcement?.style ?? "modal"}
                                onChange={(e) =>
                                    set({
                                        announcement: {
                                            ...current.announcement,
                                            style: e.target.value === "card" ? "card" : "modal",
                                        },
                                    })
                                }
                                data-testid="settings-announcement-style"
                            >
                                <option value="modal">{t("adminSettingsStyleModal")}</option>
                                <option value="card">{t("adminSettingsStyleCard")}</option>
                            </AdminSelect>
                            <span className="mt-1 block text-xs text-[var(--tnl-body)]">
                                {t("adminSettingsStyleHelp")}
                            </span>
                        </label>
                        <Field label={t("adminSettingsTitleEn")} value={current.announcement?.title ?? ""} onChange={(v) => set({ announcement: { ...current.announcement, title: v } })} testId="settings-announcement-title" />
                        <Field label={t("adminSettingsTitleId")} value={current.announcement?.title_id ?? ""} onChange={(v) => set({ announcement: { ...current.announcement, title_id: v } })} testId="settings-announcement-title-id" />
                        <Field label={t("adminSettingsMsgEn")} value={current.announcement?.body ?? ""} onChange={(v) => set({ announcement: { ...current.announcement, body: v } })} testId="settings-announcement-body" />
                        <Field label={t("adminSettingsMsgId")} value={current.announcement?.body_id ?? ""} onChange={(v) => set({ announcement: { ...current.announcement, body_id: v } })} testId="settings-announcement-body-id" />
                    </div>
                </Panel>

                <Panel>
                    <AdminSectionHeader title={t("adminSettingsPrivacySection")} />
                    <div className="mt-3 space-y-3">
                        <Field label={t("adminSettingsSearchDesc")} value={current.seo?.default_description ?? ""} onChange={(v) => set({ seo: { ...current.seo, default_description: v } })} testId="settings-seo-description" />
                        <Field
                            label={t("adminSettingsRetention")}
                            value={String(current.retention_days ?? 90)}
                            onChange={(v) => set({ retention_days: Number(v) || 90 })}
                            help={t("adminSettingsRetentionHelp")}
                            testId="settings-retention"
                        />
                        <div>
                            <label className="mb-1.5 block text-sm font-medium">{t("adminSettingsAnalytics")}</label>
                            <textarea className="tnl-field font-mono text-xs" rows={4} value={current.analytics_snippet ?? ""} onChange={(e) => set({ analytics_snippet: e.target.value })} data-testid="settings-analytics" />
                        </div>
                        <AdminSwitch
                            label={t("adminSettingsMaintenance")}
                            checked={Boolean(current.maintenance_mode)}
                            onCheckedChange={(next) => set({ maintenance_mode: next })}
                            testId="settings-maintenance"
                        />
                    </div>
                </Panel>

                <Panel>
                    <AdminSectionHeader title={t("adminSettingsGsmCardTitle")} />
                    <div className="mt-3 space-y-3">
                        <AdminCard className="p-3 sm:p-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t("adminSettingsGsmActive")}</span>
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-[var(--gsm-emerald)] text-white">
                                    {current.theme_tokens?.gsm_edition_label || "GSM Kabinet Keberlanjutan 2026"}
                                </span>
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                                <span className="text-[11px] text-gray-500">{t("adminSettingsGsmPalette")}</span>
                                <div className="flex items-center gap-1.5">
                                    <span className="h-4 w-4 rounded-full border border-black/10 inline-block bg-[var(--gsm-primary)]" title="Primary (CMS)" />
                                    <span className="h-4 w-4 rounded-full border border-black/10 inline-block bg-[var(--gsm-emerald)]" title="Emerald Glow (CMS)" />
                                    <span className="h-4 w-4 rounded-full border border-black/10 inline-block bg-[var(--gsm-obsidian)]" title="Obsidian Dark (CMS)" />
                                    <span className="h-4 w-4 rounded-full border border-black/10 inline-block bg-[var(--gsm-accent)]" title="Accent Warm Sand (CMS)" />
                                </div>
                            </div>
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                {t("adminSettingsGsmHelp")}
                            </p>
                        </AdminCard>
                        <Link
                            to="/admin/theme"
                            className="tnl-btn tnl-btn-outline inline-flex items-center justify-center w-full h-10 min-h-[40px] text-xs font-semibold"
                            data-testid="settings-goto-theme-button"
                        >
                            {t("adminSettingsManageTheme")}
                        </Link>
                    </div>
                </Panel>

                <Panel>
                    <div className="flex items-center gap-2">
                        <FileJson className="h-5 w-5 text-[var(--gsm-accent)]" />
                        <AdminSectionHeader title={t("adminSettingsFigmaImportTitle")} />
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t("adminSettingsFigmaImportDesc")}
                    </p>

                    <div className="mt-3 space-y-3">
                        <div>
                            <label htmlFor="settings-figma-json-file" className="block text-xs font-medium mb-1">{t("adminSettingsFigmaFileLabel")}</label>
                            <input
                                id="settings-figma-json-file"
                                type="file"
                                accept=".json,application/json"
                                onChange={handleFileUpload}
                                className="block w-full text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[var(--gsm-primary)] file:text-white hover:file:opacity-90"
                            />
                        </div>

                        <div>
                            <label htmlFor="settings-figma-json-paste" className="block text-xs font-medium mb-1">{t("adminSettingsFigmaPasteLabel")}</label>
                            <textarea
                                id="settings-figma-json-paste"
                                rows={4}
                                className="tnl-field font-mono text-[11px]"
                                placeholder='{"primary": {"value": "#223027"}, "emerald": {"value": "#5D8A6B"}, "accent": {"value": "#A8977B"}}'
                                value={figmaRawJson}
                                onChange={(e) => handleJsonPaste(e.target.value)}
                            />
                        </div>

                        {jsonImportPreview && (
                            <div className="rounded-lg border p-2.5 bg-[var(--gsm-bg-elevated)] border-[var(--gsm-emerald)] text-xs text-[var(--gsm-emerald)]">
                                <span className="font-semibold block mb-1">{t("adminSettingsFigmaValidJson")}</span>
                                <span className="text-[11px]">{t("adminSettingsFigmaValidJsonDesc")}</span>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => {
                                if (!jsonImportPreview) {
                                    toast.error(t("adminSettingsFigmaNeedJson"));
                                    return;
                                }
                                importTokensMutation.mutate(jsonImportPreview);
                            }}
                            disabled={!jsonImportPreview || importTokensMutation.isPending}
                            className="tnl-btn tnl-btn-primary w-full h-10 min-h-[40px] text-xs font-semibold flex items-center justify-center gap-1.5"
                            data-testid="settings-import-figma-tokens-button"
                        >
                            <Upload className="h-4 w-4" />
                            {t(importTokensMutation.isPending ? "adminSettingsFigmaApplying" : "adminSettingsFigmaApplyDraft")}
                        </button>
                    </div>
                </Panel>

                <Panel>
                    <div className="flex items-center gap-2">
                        <KeyRound className="h-5 w-5 text-[var(--gsm-emerald)]" />
                        <AdminSectionHeader title={t("adminSettingsFigmaPluginTitle")} />
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t("adminSettingsFigmaPluginDesc")}
                    </p>

                    <div className="mt-3 space-y-3">
                        <AdminCard className="p-3 sm:p-3 text-xs space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-gray-500">{t("adminSettingsFigmaTokenStatus")}</span>
                                <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${figmaStatus?.configured ? "bg-[var(--gsm-bg-elevated)] text-[var(--gsm-emerald)]" : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300"}`}>
                                    {figmaStatus?.configured ? t("adminSettingsFigmaConfigured").replace("{prefix}", figmaStatus.prefix ?? "") : t("adminSettingsFigmaUnconfigured")}
                                </span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-gray-500">{t("adminSettingsFigmaEndpoint")}</span>
                                <code className="font-mono text-[10px] break-all p-1 bg-[var(--tnl-surface-2)] rounded">
                                    {figmaStatus?.endpoint_sync_frame || "https://labtnl.site/api/admin/figma/sync-frame"}
                                </code>
                            </div>
                        </AdminCard>

                        {generatedToken && (
                            <div className="rounded-lg border p-3 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/50">
                                <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block mb-1">
                                    {t("adminSettingsFigmaSaveTokenNow")}
                                </span>
                                <p className="text-[11px] text-amber-700 dark:text-amber-300 mb-2">
                                    {t("adminSettingsFigmaTokenOnce")}
                                </p>
                                <div className="flex items-center gap-1.5">
                                    <input
                                        type="text"
                                        readOnly
                                        value={generatedToken}
                                        aria-label="Generated Figma token"
                                        className="tnl-field font-mono text-xs flex-1"
                                    />
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                await navigator.clipboard.writeText(generatedToken);
                                                setCopiedToken(true);
                                                setTimeout(() => setCopiedToken(false), 2000);
                                                toast.success(t("adminSettingsFigmaTokenCopied"));
                                            } catch {
                                                toast.error(t("adminSettingsFigmaTokenCopyError"));
                                            }
                                        }}
                                        aria-label={t("adminSettingsFigmaCopyTokenAria")}
                                        className="tnl-btn tnl-btn-outline shrink-0 h-[42px] px-3 text-xs"
                                    >
                                        {copiedToken ? <Check className="h-4 w-4 text-[var(--gsm-emerald)]" /> : <Copy className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => generateToken.mutate()}
                                disabled={generateToken.isPending}
                                className="tnl-btn tnl-btn-outline flex-1 h-10 min-h-[40px] text-xs font-semibold flex items-center justify-center gap-1.5"
                                data-testid="settings-generate-figma-token-button"
                            >
                                <KeyRound className="h-4 w-4" />
                                {generateToken.isPending ? t("adminSettingsFigmaProcessing") : figmaStatus?.configured ? t("adminSettingsFigmaRotateToken") : t("adminSettingsFigmaGenerateToken")}
                            </button>
                        </div>
                    </div>
                </Panel>
            </div>
        </div>
    );
}
