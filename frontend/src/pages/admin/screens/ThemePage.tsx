import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPost, apiPut } from "@/lib/api/api";
import { useAdminT } from "@/lib/i18n/admin-i18n";
import { AdminCard, AdminPageHeader, AdminSectionHeader, Panel, adminError } from "@/pages/admin/AdminUI";
import { applyThemeTokens } from "@/lib/theme/theme";
import { Spinner } from "@/components/site/Primitives";
import type { ThemeResponse, ThemeTokens } from "@/lib/types/types";

export function ThemePage() {
    const t = useAdminT();
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ["admin", "theme"],
        queryFn: () => apiGet<ThemeResponse>("/admin/theme"),
        retry: false,
    });
    const [draft, setDraft] = useState<ThemeTokens | null>(null);
    const tokens = draft ?? data?.draft ?? null;
    const fingerprint = JSON.stringify(tokens);
    const localEdits = Boolean(draft && JSON.stringify(draft) !== JSON.stringify(data?.draft));
    const [contrastDraft, setContrastDraft] = useState<{ fingerprint: string; tokens: ThemeTokens } | null>(null);
    useEffect(() => {
        if (!tokens || !localEdits) return;
        const timer = window.setTimeout(() => setContrastDraft({ fingerprint, tokens }), 350);
        return () => window.clearTimeout(timer);
    }, [fingerprint, tokens, localEdits]);
    const { data: currentContrast, error: contrastError, isFetching: checkingContrast } = useQuery({
        queryKey: ["admin", "theme-contrast", contrastDraft?.fingerprint],
        queryFn: () => apiPost<Pick<ThemeResponse, "contrast">>("/admin/theme/contrast", contrastDraft!.tokens),
        enabled: localEdits && contrastDraft?.fingerprint === fingerprint,
        retry: false,
    });
    const checks = localEdits ? contrastDraft?.fingerprint === fingerprint ? currentContrast?.contrast ?? [] : [] : data?.contrast ?? [];

    const save = useMutation({
        mutationFn: (next: ThemeTokens) => apiPut<{ draft: ThemeTokens }>("/admin/theme/draft", next),
        onSuccess: (res, submitted) => {
            setDraft((current) => current && JSON.stringify(current) !== JSON.stringify(submitted) ? current : res.draft);
            void qc.invalidateQueries({ queryKey: ["admin", "theme"] });
            toast.success(t("adminThemeDraftSaved"));
        },
        onError: (err) => toast.error(adminError(err, t("adminThemeDraftError"))),
    });

    const publish = useMutation({
        mutationFn: (next: ThemeTokens) => apiPost<{ published: ThemeTokens }>("/admin/theme/publish", next),
        onSuccess: (res, submitted) => {
            setDraft((current) => current && JSON.stringify(current) !== JSON.stringify(submitted) ? current : res.published);
            applyThemeTokens(res.published);
            void qc.invalidateQueries({ queryKey: ["admin", "theme"] });
            void qc.invalidateQueries({ queryKey: ["public", "settings"] });
            toast.success(t("adminThemePublishedToast"));
        },
        onError: (err) => toast.error(adminError(err, t("adminThemePublishError"))),
    });

    const reset = useMutation({
        mutationFn: () => apiPost<{ draft: ThemeTokens }>("/admin/theme/reset"),
        onSuccess: (res) => {
            setDraft(res.draft);
            void qc.invalidateQueries({ queryKey: ["admin", "theme"] });
            toast.success(t("adminThemeResetToast"));
        },
    });

    if (isLoading || !tokens) return <Spinner label={t("adminLoading")} />;

    const colorKeys: (keyof ThemeTokens)[] = [
        "color_black", "color_tan", "color_tan_text", "color_green", "color_green_hover",
        "color_surface", "color_border", "color_body",
    ];
    const LABELS: Record<string, string> = {
        color_black: "Black (headers, footer, hero)",
        color_tan: "Tan (decoration, large numbers, on dark)",
        color_tan_text: "Darker tan (small text on light backgrounds)",
        color_green: "Dark green (buttons and links)",
        color_green_hover: "Dark green when hovered",
        color_surface: "Page background",
        color_border: "Lines and borders",
        color_body: "Body text",
    };

    const gsmKeys: { key: keyof ThemeTokens; label: string; desc: string; fallback: string }[] = [
        { key: "primary_color", label: "GSM Deep Forest (Primary)", desc: "Brand identity, hero gradient, navbar accent, dark borders", fallback: "#223027" },
        { key: "emerald_color", label: "GSM Emerald Glow", desc: "Digital pulse, active badges, status indicators, energy highlights", fallback: "#5D8A6B" },
        { key: "obsidian_color", label: "GSM Obsidian Dark", desc: "Dark mode background, hero background, maximum depth", fallback: "#0C100E" },
        { key: "accent_color", label: "GSM Warm Sand (Accent)", desc: "Golden-tan accent, call-to-action button, brand elegance", fallback: "#A8977B" },
        { key: "accent_hover_color", label: "GSM Accent Hover Tan", desc: "Interactive button hover, active states, luminous glow", fallback: "#C2B091" },
    ];

    const resetToGsmStandard = () => {
        setDraft({
            ...tokens,
            primary_color: "#5d3b1f",
            emerald_color: "#ffbb58",
            obsidian_color: "#0C100E",
            accent_color: "#A8977B",
            accent_hover_color: "#C2B091",
            gsm_edition_label: "GSM Kabinet Keberlanjutan 2026",
            color_black: "#0C100E",
            color_tan: "#A8977B",
            color_tan_text: "#7F715C",
            color_green: "#5d3b1f",
            color_green_hover: "#4A2E18",
            color_surface: "#FAF7F2",
            color_border: "rgba(93, 59, 31, 0.12)",
            color_body: "#141A16",
        });
        toast.info(t("adminThemeGsmPresetToast"));
    };

    const activePrimary = tokens.primary_color || "#5d3b1f";
    const activeEmerald = tokens.emerald_color || "#ffbb58";
    const activeObsidian = tokens.obsidian_color || "#0C100E";
    const activeAccent = tokens.accent_color || "#A8977B";

    return (
        <div data-testid="theme-page" className="space-y-6">
            <AdminPageHeader
                title={t("adminThemeTitle")}
                description={t("adminThemeDescription")}
                actions={
                    <>
                        <button type="button" onClick={resetToGsmStandard} className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-xs font-semibold" data-testid="theme-reset-gsm-button">
                            {t("adminThemeResetGsm")}
                        </button>
                        <button type="button" onClick={() => reset.mutate()} className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-xs" data-testid="theme-reset-button">
                            {t("adminThemeResetDb")}
                        </button>
                        <button type="button" onClick={() => save.mutate(tokens)} disabled={save.isPending || publish.isPending} className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-xs" data-testid="theme-save-draft-button">
                            {t("adminDraftSave")}
                        </button>
                        <button type="button" onClick={() => publish.mutate(tokens)} disabled={save.isPending || publish.isPending} className="tnl-btn tnl-btn-primary h-10 min-h-[40px] text-xs" data-testid="theme-publish-button">
                            {t("adminThemePublish")}
                        </button>
                    </>
                }
                testId="theme-header"
            />

            <Panel>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <AdminSectionHeader
                        title={t("adminThemeEditionTitle")}
                        description={t("adminThemeEditionDesc")}
                    />
                    <div className="w-full sm:w-80">
                        <input
                            type="text"
                            className="tnl-field text-sm"
                            value={tokens.gsm_edition_label ?? "GSM Kabinet Keberlanjutan 2026"}
                            onChange={(e) => setDraft({ ...tokens, gsm_edition_label: e.target.value })}
                            placeholder={t("adminThemeEditionPlaceholder")}
                            aria-label={t("adminThemeEditionLabel")}
                        />
                    </div>
                </div>
            </Panel>

            <div className="grid gap-6 lg:grid-cols-2">
                <Panel>
                    <AdminSectionHeader
                        className="mb-4 border-b border-[var(--tnl-border)] pb-3"
                        title={t("adminThemeCoreTitle")}
                        description={t("adminThemeCoreDesc")}
                    />
                    <div className="space-y-3.5">
                        {gsmKeys.map(({ key, label, desc, fallback }) => {
                            const val = String(tokens[key] || fallback);
                            return (
                                <AdminCard key={key} className="flex items-center gap-3 p-2.5 sm:p-2.5">
                                    <input
                                        type="color"
                                        value={val}
                                        onChange={(e) => setDraft({ ...tokens, [key]: e.target.value })}
                                        className="h-10 w-14 shrink-0 cursor-pointer rounded border border-gray-300 dark:border-white/20 bg-transparent"
                                        aria-label={label}
                                        data-testid={`theme-gsm-${key}`}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between">
                                            <label className="block text-sm font-semibold">{label}</label>
                                            <span className="font-mono text-xs uppercase px-1.5 py-0.5 rounded bg-[var(--tnl-surface-2)] text-[var(--tnl-body)]">{val}</span>
                                        </div>
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{desc}</p>
                                    </div>
                                </AdminCard>
                            );
                        })}
                    </div>

                    <div className="border-t pt-4 mt-6 border-gray-200 dark:border-white/10">
                        <AdminSectionHeader className="mb-3" title={t("adminThemeSupportingTitle")} />
                        <div className="space-y-2">
                            {colorKeys.map((key) => (
                                <div key={key} className="flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={String(tokens[key])}
                                        onChange={(e) => setDraft({ ...tokens, [key]: e.target.value })}
                                        className="h-8 w-12 shrink-0 cursor-pointer rounded border border-gray-200 dark:border-white/10"
                                        aria-label={LABELS[key]}
                                        data-testid={`theme-color-${key}`}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <span className="text-xs font-medium">{LABELS[key]}</span>
                                        <span className="ml-2 text-[11px] font-mono text-gray-400">{String(tokens[key])}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Panel>

                <div className="space-y-6">
                    <Panel>
                        <AdminSectionHeader
                            title={t("adminThemePreviewTitle")}
                            description={t("adminThemePreviewDesc")}
                        />

                        <div className="grid gap-3.5 mt-4 sm:grid-cols-2">
                            <div
                                className="rounded-xl p-4 border transition-colors shadow-sm"
                                style={{
                                    backgroundColor: tokens.color_surface || "#FAF7F2",
                                    color: tokens.color_body || "#1E2521",
                                    borderColor: "color-mix(in srgb, var(--gsm-primary) 15%, transparent)",
                                }}
                            >
                                <div className="flex items-center justify-between pb-2 border-b border-gray-300/60">
                                    <span className="text-[11px] font-bold tracking-wider uppercase text-gray-600">Light Mode</span>
                                    <span
                                        className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                                        style={{ backgroundColor: activeEmerald, color: "#FFFFFF" }}
                                    >
                                        Live Pulse
                                    </span>
                                </div>
                                <h3 className="text-sm font-extrabold mt-2.5" style={{ color: activePrimary }}>
                                    Laboratorium TNL ITS
                                </h3>
                                <p className="text-xs mt-1 text-gray-600 line-clamp-2">
                                    Pusat keunggulan riset jaringan telekomunikasi & transmisi data generasi masa depan.
                                </p>
                                <div className="mt-3.5 flex items-center gap-2">
                                    <button
                                        type="button"
                                        disabled
                                        aria-hidden="true"
                                        className="px-3 py-1.5 rounded-md text-xs font-bold shadow-sm opacity-70"
                                        style={{ backgroundColor: activePrimary, color: "#FFFFFF" }}
                                    >
                                        Eksplorasi Riset
                                    </button>
                                    <span
                                        className="text-[11px] font-semibold underline underline-offset-2"
                                        style={{ color: activeAccent }}
                                    >
                                        Lihat Silabus
                                    </span>
                                </div>
                            </div>

                            <div
                                className="rounded-xl p-4 border transition-colors shadow-sm"
                                style={{
                                    backgroundColor: activeObsidian,
                                    color: "var(--gsm-text-secondary)",
                                    borderColor: "color-mix(in srgb, var(--gsm-emerald) 25%, transparent)",
                                }}
                            >
                                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                                    <span className="text-[11px] font-bold tracking-wider uppercase text-gray-400">Dark Mode</span>
                                    <span
                                        className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                                        style={{ backgroundColor: "color-mix(in srgb, var(--gsm-emerald) 20%, transparent)", color: activeEmerald, border: `1px solid ${activeEmerald}40` }}
                                    >
                                        Active Node
                                    </span>
                                </div>
                                <h3 className="text-sm font-extrabold mt-2.5 text-white">
                                    Laboratorium TNL ITS
                                </h3>
                                <p className="text-xs mt-1 text-gray-400 line-clamp-2">
                                    Pusat keunggulan riset jaringan telekomunikasi & transmisi data generasi masa depan.
                                </p>
                                <div className="mt-3.5 flex items-center gap-2">
                                    <button
                                        type="button"
                                        disabled
                                        aria-hidden="true"
                                        className="px-3 py-1.5 rounded-md text-xs font-bold shadow-sm opacity-70"
                                        style={{ backgroundColor: activeAccent, color: activeObsidian }}
                                    >
                                        Daftar Pelatihan
                                    </button>
                                    <button
                                        type="button"
                                        disabled
                                        aria-hidden="true"
                                        className="px-2.5 py-1.5 rounded-md text-xs font-medium border opacity-70"
                                        style={{ borderColor: activeEmerald, color: activeEmerald }}
                                    >
                                        Silabus
                                    </button>
                                </div>
                            </div>
                        </div>
                    </Panel>

                    <Panel>
                        <AdminSectionHeader
                            title={t("adminThemeContrastTitle")}
                            description={t("adminThemeContrastDesc")}
                        />
                        <ul className="mt-4 space-y-2" data-testid="theme-contrast-list">
                            <li className="text-xs text-[var(--tnl-body)]" data-testid="theme-contrast-scope">{t(localEdits ? contrastDraft?.fingerprint !== fingerprint || checkingContrast ? "adminThemeChecking" : "adminThemeCurrentChecks" : "adminThemeSavedChecks")}</li>
                            {localEdits && contrastDraft?.fingerprint === fingerprint && contrastError ? <li role="alert" className="text-sm text-[var(--tnl-danger)]">{t("adminThemeCheckError")}</li> : null}
                            {checks.map((check) => (
                                <li
                                    key={check.label}
                                    className="flex items-center justify-between gap-3 rounded-[8px] border px-4 py-2.5 text-sm"
                                    style={{ borderColor: check.passes ? "var(--tnl-border)" : "var(--tnl-danger-border)" }}
                                    data-testid={`theme-contrast-${check.passes ? "pass" : "fail"}`}
                                >
                                    <span className="font-medium text-xs sm:text-sm">{check.label}</span>
                                    <span className="font-semibold text-xs shrink-0" style={{ color: check.passes ? "var(--gsm-emerald)" : "var(--tnl-danger)" }}>
                                        {check.ratio} {check.passes ? t("adminThemeContrastPass") : t("adminThemeContrastNeed").replace("{ratio}", String(check.required))}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </Panel>
                </div>
            </div>
        </div>
    );
}
