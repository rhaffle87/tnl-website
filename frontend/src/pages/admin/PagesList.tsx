// Page builder: list of pages, then a block workbench with add / reorder /
// duplicate / hide / delete, live preview link and revision restore.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
    ArrowDown,
    ArrowUp,
    Copy,
    Eye,
    EyeOff,
    History,
    Plus,
    Save,
    Trash2,
} from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/api";
import { AdminErrorBanner, AdminPageHeader, AdminSectionHeader, AdminStatusBadge, ConfirmButton, IssueList, Panel, adminError, issuesFromError } from "@/pages/admin/AdminUI";
import { Spinner } from "@/components/site/Primitives";
import { InlineMediaField, MultiMediaField } from "@/components/admin/media";
import { KeyValueMapEditor } from "@/components/admin/repeaters";
import { useAdminT, type AdminStringKey } from "@/lib/i18n/admin-i18n";
import { ReusableBlocks } from "@/components/admin/ReusableBlocks";
import type { Block, ListResponse, PageDoc, PageRevisionBrief, QualityIssue } from "@/lib/types/types";

type WorkingPage = PageDoc & { has_draft?: boolean; live_status?: string; meta_description?: string | null; meta_description_id?: string | null };

const BLOCK_LIBRARY: { type: string; label: AdminStringKey; description: AdminStringKey }[] = [
    { type: "hero", label: "adminPagesWidgetHero", description: "adminPagesWidgetHeroDescription" },
    { type: "inner_hero", label: "adminPagesWidgetInnerHero", description: "adminPagesWidgetInnerHeroDescription" },
    { type: "rich_text", label: "adminPagesWidgetRichText", description: "adminPagesWidgetRichTextDescription" },
    { type: "image", label: "adminImage", description: "adminPagesWidgetImageDescription" },
    { type: "gallery", label: "adminPagesWidgetGallery", description: "adminPagesWidgetGalleryDescription" },
    { type: "video", label: "adminVideo", description: "adminPagesWidgetVideoDescription" },
    { type: "feature_tiles", label: "adminPagesWidgetFeatureTiles", description: "adminPagesWidgetFeatureTilesDescription" },
    { type: "stats", label: "adminPagesWidgetStats", description: "adminPagesWidgetStatsDescription" },
    { type: "numbered_cards", label: "adminPagesWidgetNumberedCards", description: "adminPagesWidgetNumberedCardsDescription" },
    { type: "about", label: "adminPagesWidgetAbout", description: "adminPagesWidgetAboutDescription" },
    { type: "carousel", label: "adminPagesWidgetCarousel", description: "adminPagesWidgetCarouselDescription" },
    { type: "quick_links", label: "adminPagesWidgetQuickLinks", description: "adminPagesWidgetQuickLinksDescription" },
    { type: "member_sections", label: "adminPagesWidgetMemberSections", description: "adminPagesWidgetMemberSectionsDescription" },
    { type: "news_feed", label: "adminPagesWidgetNewsFeed", description: "adminPagesWidgetNewsFeedDescription" },
    { type: "partners", label: "adminPagesWidgetPartners", description: "adminPagesWidgetPartnersDescription" },
    { type: "cta_band", label: "adminPagesWidgetCtaBand", description: "adminPagesWidgetCtaBandDescription" },
    { type: "contact_panel", label: "adminPagesWidgetContactPanel", description: "adminPagesWidgetContactPanelDescription" },
    { type: "contact_form", label: "adminPagesWidgetContactForm", description: "adminPagesWidgetContactFormDescription" },
    { type: "map", label: "adminPagesWidgetMap", description: "adminPagesWidgetMapDescription" },
    { type: "timeline", label: "adminPagesWidgetTimeline", description: "adminPagesWidgetTimelineDescription" },
    { type: "accordion", label: "adminPagesWidgetAccordion", description: "adminPagesWidgetAccordionDescription" },
    { type: "download_list", label: "adminPagesWidgetDownloadList", description: "adminPagesWidgetDownloadListDescription" },
    { type: "html", label: "adminPagesWidgetHtml", description: "adminPagesWidgetHtmlDescription" },
    { type: "collection_list", label: "adminCollectionWidget", description: "adminCollectionWidgetDescription" },
];

export default function PagesList() {
    const t = useAdminT();
    const { data, isLoading } = useQuery({
        queryKey: ["admin", "pages"],
        queryFn: () => apiGet<ListResponse<PageDoc>>("/admin/pages"),
        retry: false,
    });
    const qc = useQueryClient();
    const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(window.location.search).get("selected"));
    const [newSlug, setNewSlug] = useState("");
    const [newTitle, setNewTitle] = useState("");

    const createPage = useMutation({
        mutationFn: () => apiPost<PageDoc>("/admin/pages", { slug: newSlug || newTitle, title: newTitle }),
        onSuccess: (page) => {
            void qc.invalidateQueries({ queryKey: ["admin", "pages"] });
            setNewSlug("");
            setNewTitle("");
            setSelected(page.id);
            toast.success(t("adminPagesCreated"));
        },
        onError: (err) => toast.error(adminError(err, t("adminPagesCreateError"))),
    });

    if (selected) {
        return <PageBuilder pageId={selected} onBack={() => setSelected(null)} />;
    }

    const pages = data?.items ?? [];

    return (
        <div data-testid="pages-list-page">
            <AdminPageHeader
                title={t("adminPagesTitle")}
                description={t("adminPagesDescription")}
                actions={<a href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/admin/content/collections`} className="tnl-btn tnl-btn-outline">{t("adminCollections")}</a>}
                testId="pages-header"
            />

            <Panel className="mb-6">
                <AdminSectionHeader title={t("adminPagesCreateHeading")} />
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <input
                        className="tnl-field"
                        placeholder={t("adminPagesTitlePlaceholder")}
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        aria-label={t("adminPagesNewTitle")}
                        data-testid="new-page-title-input"
                    />
                    <input
                        className="tnl-field"
                        placeholder={t("adminPagesSlugPlaceholder")}
                        value={newSlug}
                        onChange={(e) => setNewSlug(e.target.value)}
                        aria-label={t("adminPagesNewSlug")}
                        data-testid="new-page-slug-input"
                    />
                    <button
                        type="button"
                        onClick={() => createPage.mutate()}
                        className="tnl-btn tnl-btn-primary"
                        disabled={!newTitle.trim() || createPage.isPending}
                        data-testid="new-page-create-button"
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        {t("adminCreate")}
                    </button>
                </div>
            </Panel>

            {isLoading ? (
                <Spinner label={t("adminPagesLoading")} />
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {pages.map((page) => (
                        <button
                            key={page.id}
                            type="button"
                            onClick={() => setSelected(page.id)}
                            className="tnl-card tnl-card-hover p-6 text-left"
                            data-testid={`page-card-${page.slug}`}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <h3 className="text-[18px] font-bold">{page.title}</h3>
                                <AdminStatusBadge variant={page.status === "published" ? "published" : "draft"} />
                            </div>
                            <p className="mt-1 text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                                /{page.slug === "home" ? "" : page.slug}
                            </p>
                            <p className="mt-3 text-sm text-[var(--tnl-body)]">{(page.blocks ?? []).length} {t("adminPagesWidgetCount")}</p>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function PageBuilder({ pageId, onBack }: { pageId: string; onBack: () => void }) {
    const t = useAdminT();
    const invalidJson = t("adminPagesInvalidJson");
    const qc = useQueryClient();
    const [showLibrary, setShowLibrary] = useState(false);
    const [showRevisions, setShowRevisions] = useState(false);
    const [editingBlock, setEditingBlock] = useState<string | null>(null);
    const [propsText, setPropsText] = useState("");
    const [propsError, setPropsError] = useState<string | null>(null);
    const [visualPropsValid, setVisualPropsValid] = useState(true);
    const [issues, setIssues] = useState<QualityIssue[]>([]);

    const { data: page, isLoading, isError, error, refetch } = useQuery({
        queryKey: ["admin", "page", pageId],
        queryFn: () => apiGet<WorkingPage>(`/admin/pages/${pageId}`),
        retry: false,
    });

    const { data: revisions } = useQuery({
        queryKey: ["admin", "page-revisions", pageId],
        queryFn: () => apiGet<ListResponse<PageRevisionBrief>>(`/admin/pages/${pageId}/revisions`),
        retry: false,
        enabled: showRevisions,
    });

    // Invalid JSON must be reported inline instead of silently discarded.
    useEffect(() => {
        if (!propsText.trim()) {
            setPropsError(null);
            return;
        }
        try {
            const parsed: unknown = JSON.parse(propsText);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object required");
            setPropsError(null);
        } catch {
            setPropsError(invalidJson);
        }
    }, [propsText, invalidJson]);

    const refresh = (updated?: PageDoc) => {
        if (updated) qc.setQueryData(["admin", "page", pageId], updated);
        void qc.invalidateQueries({ queryKey: ["admin", "pages"] });
        void qc.invalidateQueries({ queryKey: ["public"] });
    };

    const mutate = <T,>(fn: () => Promise<T>, success: string) => {
        fn()
            .then((res) => {
                refresh(res as unknown as PageDoc);
                toast.success(success);
            })
            .catch((err) => {
                const found = issuesFromError(err);
                if (found.length) setIssues(found);
                toast.error(adminError(err, t("adminPagesSaveError")));
            });
    };

    if (isError) {
        return (
            <AdminErrorBanner
                message={adminError(error, t("adminPagesLoadError"))}
                onRetry={() => void refetch()}
            />
        );
    }
    if (isLoading || !page) {
        return <Spinner label={t("adminPagesLoadingPage")} />;
    }

    const blocks = page.blocks ?? [];

    const move = (index: number, delta: number) => {
        const next = [...blocks];
        const target = index + delta;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        mutate(() => apiPost<PageDoc>(`/admin/pages/${pageId}/reorder`, { order: next.map((b) => b.id) }), t("adminPagesOrderUpdated"));
    };

    const addBlock = (type: string) => {
        setShowLibrary(false);
        mutate(() => apiPost<PageDoc>(`/admin/pages/${pageId}/blocks`, { type, props: type === "collection_list" ? { collection_key: "" } : {} }), t("adminPagesWidgetAdded"));
    };

    const saveProps = (block: Block) => {
        let parsed: Record<string, unknown>;
        try {
            parsed = propsText.trim() ? JSON.parse(propsText) : {};
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object required");
        } catch {
            setPropsError(invalidJson);
            return;
        }
        mutate(() => apiPatch<PageDoc>(`/admin/pages/${pageId}/blocks/${block.id}`, { props: parsed }), t("adminPagesWidgetUpdated"));
    };

    const publish = (status: string) => {
        setIssues([]);
        mutate(() => apiPatch<PageDoc>(`/admin/pages/${pageId}`, { status }), status === "published" ? t("adminPagesPublished") : t("adminPagesUnpublished"));
    };

    return (
        <div data-testid={`page-builder-${page.slug}`}>
            {/* Sticky Action Bar */}
            <div
                className="sticky top-0 z-20 -mx-4 -mt-4 mb-6 border-b px-4 py-3 backdrop-blur-md sm:-mx-6 sm:-mt-6 sm:px-6 lg:-mx-8 lg:-mt-8 lg:px-8"
                style={{ borderColor: "var(--tnl-border)", background: "color-mix(in srgb, var(--tnl-surface) 88%, transparent)" }}
                data-testid="page-builder-sticky-bar"
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="truncate text-lg font-semibold text-[var(--tnl-heading)]" data-testid="page-builder-title">
                            {page.title}
                        </h1>
                        <p className="text-xs text-[var(--tnl-body)] truncate">
                            /{page.slug === "home" ? "" : page.slug} · {t("adminStatus")}: <span className="font-semibold capitalize">{page.status === "published" ? t("adminPublished").toLowerCase() : page.status === "draft" ? t("adminDraft").toLowerCase() : page.status}</span>
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={onBack} className="tnl-btn tnl-btn-outline h-9 min-h-[36px] text-xs" data-testid="page-back-button">
                            {t("adminPagesAllPages")}
                        </button>
                        <a
                            href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/p/${encodeURIComponent(page.slug)}?preview=${encodeURIComponent(page.id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="tnl-btn tnl-btn-outline h-9 min-h-[36px] text-xs"
                            data-testid="page-preview-link"
                        >
                            {t("adminPagesPreview")}
                        </a>
                        <button
                            type="button"
                            onClick={() => setShowRevisions((v) => !v)}
                            className="tnl-btn tnl-btn-outline h-9 min-h-[36px] text-xs"
                            data-testid="page-revisions-button"
                        >
                            <History className="h-3.5 w-3.5" aria-hidden="true" />
                            {t("adminPagesRevisions")}
                        </button>
                        {page.status === "published" ? (
                            <>
                            {page.has_draft ? <button type="button" onClick={() => publish("published")} className="tnl-btn tnl-btn-primary h-9 min-h-[36px] text-xs" data-testid="page-publish-button">{t("adminDraftPublish")}</button> : null}
                            <button type="button" onClick={() => publish("draft")} className="tnl-btn tnl-btn-outline h-9 min-h-[36px] text-xs" data-testid="page-unpublish-button">
                                {t("adminUnpublish")}
                            </button>
                            </>
                        ) : (
                            <button type="button" onClick={() => publish("published")} className="tnl-btn tnl-btn-primary h-9 min-h-[36px] text-xs" data-testid="page-publish-button">
                                {t("adminPublish")}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {page.has_draft ? <p className="mb-4 text-sm" role="status">{t("adminDraftStaged")}</p> : null}
            <PageDetails key={`${page.id}:${page.updated_at}`} page={page} onSave={(values) => mutate(() => apiPatch<PageDoc>(`/admin/pages/${pageId}`, values), t("adminPagesWidgetUpdated"))} onDelete={() => apiDelete(`/admin/pages/${pageId}`).then(() => { void qc.invalidateQueries({ queryKey: ["admin", "pages"] }); onBack(); }).catch((err) => toast.error(adminError(err, t("adminPagesSaveError"))))} />

            {issues.length ? (
                <Panel className="mb-5">
                    <p className="mb-2 text-sm font-semibold">{t("adminPagesCannotPublish")}</p>
                    <IssueList issues={issues} testId="page-builder-issues" />
                </Panel>
            ) : null}

            <ReusableBlocks pageId={pageId} blocks={blocks} onApplied={refresh} />

            {showRevisions ? (
                <Panel className="mb-5">
                    <AdminSectionHeader title={t("adminPagesRevisions")} />
                    <ul className="mt-3 space-y-2 text-sm">
                        {(revisions?.items ?? []).map((rev) => (
                            <li
                                key={rev.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border px-4 py-3"
                                style={{ borderColor: "var(--tnl-border)" }}
                                data-testid={`revision-${rev.id}`}
                            >
                                <span>
                                    {new Date(rev.saved_at).toLocaleString()} · {rev.saved_by || t("adminPagesUnknownAuthor")} · {rev.block_count} {t("adminPagesWidgetCount")}
                                </span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        mutate(() => apiPost<PageDoc>(`/admin/pages/${pageId}/revisions/${rev.id}/restore`), t("adminPagesRestored"))
                                    }
                                    className="rounded-[6px] border px-3 py-1.5 text-xs font-medium"
                                    style={{ borderColor: "var(--tnl-border)" }}
                                    data-testid={`revision-restore-${rev.id}`}
                                >
                                    {t("adminPagesRestore")}
                                </button>
                            </li>
                        ))}
                        {!(revisions?.items ?? []).length ? (
                            <li className="text-[var(--tnl-body)]">{t("adminPagesNoRevisions")}</li>
                        ) : null}
                    </ul>
                </Panel>
            ) : null}

            <div className="mb-5">
                <button type="button" onClick={() => setShowLibrary((v) => !v)} className="tnl-btn tnl-btn-primary" data-testid="add-widget-button">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    {t("adminPagesAddWidget")}
                </button>
            </div>

            {showLibrary ? (
                <Panel className="mb-5">
                    <AdminSectionHeader title={t("adminPagesChooseWidget")} />
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {BLOCK_LIBRARY.map((item) => (
                            <button
                                key={item.type}
                                type="button"
                                onClick={() => addBlock(item.type)}
                                className="rounded-[10px] border p-4 text-left transition-colors hover:border-[var(--tnl-green)]"
                                style={{ borderColor: "var(--tnl-border)" }}
                                data-testid={`widget-option-${item.type}`}
                            >
                                <span className="block text-sm font-bold">{t(item.label)}</span>
                                <span className="mt-1 block text-xs" style={{ color: "var(--tnl-body)" }}>
                                    {t(item.description)}
                                </span>
                            </button>
                        ))}
                    </div>
                </Panel>
            ) : null}

            <div className="space-y-3">
                {blocks.map((block, index) => {
                    const meta = BLOCK_LIBRARY.find((b) => b.type === block.type);
                    return (
                        <Panel key={block.id} className={block.hidden ? "opacity-60" : ""}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>
                                        {String(index + 1).padStart(2, "0")}
                                    </span>
                                    <h3 className="text-[17px] font-bold" data-testid={`block-title-${block.id}`}>
                                        {meta ? t(meta.label) : block.type}
                                        {block.hidden ? t("adminPagesHiddenSuffix") : ""}
                                    </h3>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="flex h-9 w-9 items-center justify-center rounded-[6px] border disabled:opacity-40" style={{ borderColor: "var(--tnl-border)" }} aria-label={t("adminPagesMoveUp")} data-testid={`block-up-${block.id}`}>
                                        <ArrowUp className="h-4 w-4" />
                                    </button>
                                    <button type="button" onClick={() => move(index, 1)} disabled={index === blocks.length - 1} className="flex h-9 w-9 items-center justify-center rounded-[6px] border disabled:opacity-40" style={{ borderColor: "var(--tnl-border)" }} aria-label={t("adminPagesMoveDown")} data-testid={`block-down-${block.id}`}>
                                        <ArrowDown className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => mutate(() => apiPatch<PageDoc>(`/admin/pages/${pageId}/blocks/${block.id}`, { hidden: !block.hidden }), block.hidden ? t("adminPagesWidgetShown") : t("adminPagesWidgetHidden"))}
                                        className="flex h-9 w-9 items-center justify-center rounded-[6px] border"
                                        style={{ borderColor: "var(--tnl-border)" }}
                                        aria-label={block.hidden ? t("adminPagesShowWidget") : t("adminPagesHideWidget")}
                                        data-testid={`block-toggle-${block.id}`}
                                    >
                                        {block.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => mutate(() => apiPost<PageDoc>(`/admin/pages/${pageId}/blocks/${block.id}/duplicate`), t("adminPagesWidgetDuplicated"))}
                                        className="flex h-9 w-9 items-center justify-center rounded-[6px] border"
                                        style={{ borderColor: "var(--tnl-border)" }}
                                        aria-label={t("adminPagesDuplicateWidget")}
                                        data-testid={`block-duplicate-${block.id}`}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                             setEditingBlock(editingBlock === block.id ? null : block.id);
                                             setVisualPropsValid(true);
                                            setPropsText(JSON.stringify(block.props ?? {}, null, 2));
                                        }}
                                        className="rounded-[6px] border px-3 py-1.5 text-xs font-medium"
                                        style={{ borderColor: "var(--tnl-border)" }}
                                        data-testid={`block-edit-${block.id}`}
                                    >
                                        {t("adminSettings")}
                                    </button>
                                    <ConfirmButton
                                        label={t("adminRemove")}
                                        confirmLabel={t("adminPagesRemoveConfirm")}
                                        question={t("adminPagesRemoveQuestion")}
                                        onConfirm={() =>
                                            mutate(() => apiDelete<PageDoc>(`/admin/pages/${pageId}/blocks/${block.id}`), t("adminPagesWidgetRemoved"))
                                        }
                                        testId={`block-delete-${block.id}`}
                                    />
                                </div>
                            </div>

                            {editingBlock === block.id ? (
                                <div className="mt-4 space-y-3">
                                    {block.type === "image" && (
                                        <InlineMediaField
                                            label={t("adminPagesBlockImage")}
                                            value={(() => {
                                                try {
                                                    const p = JSON.parse(propsText);
                                                    return p.url || "";
                                                } catch {
                                                    return "";
                                                }
                                            })()}
                                            onChange={(newUrl) => {
                                                try {
                                                    const p = JSON.parse(propsText);
                                                    p.url = newUrl;
                                                    setPropsText(JSON.stringify(p, null, 2));
                                                } catch {
                                                    setPropsError(invalidJson);
                                                }
                                            }}
                                            defaultFolder="pages"
                                            aspect="video"
                                            testId={`block-image-picker-${block.id}`}
                                        />
                                    )}

                                    {block.type === "gallery" && (
                                        <MultiMediaField
                                            label={t("adminPagesGalleryImages")}
                                            value={(() => {
                                                try {
                                                    const p = JSON.parse(propsText);
                                                    if (Array.isArray(p.images)) {
                                                        return p.images.map((im: any) => (typeof im === "string" ? im : im.url)).filter(Boolean);
                                                    }
                                                    return [];
                                                } catch {
                                                    return [];
                                                }
                                            })()}
                                            onChange={(newUrls: string[]) => {
                                                try {
                                                    const p = JSON.parse(propsText);
                                                    const remaining: unknown[] = Array.isArray(p.images) ? [...p.images] : [];
                                                    p.images = newUrls.map((url) => {
                                                        const existing = remaining.findIndex((item) => typeof item === "string" ? item === url : item !== null && typeof item === "object" && "url" in item && item.url === url);
                                                        return existing < 0 ? { url, alt: "" } : remaining.splice(existing, 1)[0];
                                                    });
                                                    setPropsText(JSON.stringify(p, null, 2));
                                                } catch {
                                                    setPropsError(invalidJson);
                                                }
                                            }}
                                            defaultFolder="pages"
                                            testId={`block-gallery-picker-${block.id}`}
                                        />
                                    )}

                                    <div className="pt-1">
                                        <label htmlFor={`props-raw-${block.id}`} className="mb-1 block text-xs font-medium">
                                            {t("adminPagesPropsJson")}
                                        </label>
                                        <textarea
                                            id={`props-raw-${block.id}`}
                                            aria-label={t("adminPagesPropsJson")}
                                            rows={4}
                                            value={propsText}
                                            aria-invalid={Boolean(propsError)}
                                            onChange={(e) => setPropsText(e.target.value)}
                                            className="w-full rounded-lg border p-2.5 font-mono text-xs outline-none"
                                            style={{ borderColor: propsError ? "var(--tnl-danger)" : "var(--tnl-border)" }}
                                        />
                                    </div>
                                    <div className="pt-1">
                                        {!propsError ? <KeyValueMapEditor
                                            label={t("adminPagesWidgetSettings")}
                                            value={(() => {
                                                try {
                                                    return JSON.parse(propsText);
                                                } catch {
                                                    return {};
                                                }
                                            })()}
                                            onChange={(newObj) => {
                                                setPropsText(JSON.stringify(newObj, null, 2));
                                            }}
                                            onValidityChange={setVisualPropsValid}
                                            help={t("adminPagesPropsHelp")}
                                            testId={`block-props-${block.id}`}
                                        /> : null}
                                    </div>
                                    {propsError ? (
                                        <p role="alert" data-testid="pages-json-error" className="mt-2 text-xs" style={{ color: "var(--tnl-danger)" }}>
                                            {propsError}
                                        </p>
                                    ) : null}
                                    <button type="button" onClick={() => saveProps(block)} disabled={Boolean(propsError) || !visualPropsValid} className="tnl-btn tnl-btn-primary mt-3 h-10 min-h-[40px] text-sm disabled:opacity-50" data-testid={`block-props-save-${block.id}`}>
                                        <Save className="h-4 w-4" aria-hidden="true" />
                                        {t("adminPagesSaveSettings")}
                                    </button>
                                </div>
                            ) : null}
                        </Panel>
                    );
                })}
                {blocks.length === 0 ? (
                    <Panel>
                        <p className="text-sm text-[var(--tnl-body)]" data-testid="page-builder-empty">
                            {t("adminPagesEmptyBuilder")}
                        </p>
                    </Panel>
                ) : null}
            </div>
        </div>
    );
}

export { Trash2 };

function PageDetails({ page, onSave, onDelete }: { page: WorkingPage; onSave: (values: { title: string; title_id: string; meta_description: string; meta_description_id: string }) => void; onDelete: () => void }) {
    const t = useAdminT();
    const [title, setTitle] = useState(page.title);
    const [titleId, setTitleId] = useState(page.title_id ?? "");
    const [description, setDescription] = useState(page.meta_description ?? "");
    const [descriptionId, setDescriptionId] = useState(page.meta_description_id ?? "");
    return <details className="mb-5 rounded-xl border border-[var(--tnl-border)] p-4">
        <summary className="cursor-pointer text-sm font-semibold">{t("adminPageMetadata")}</summary>
        <form className="mt-3 space-y-3" aria-label={t("adminPageMetadata")} onSubmit={(event) => { event.preventDefault(); onSave({ title, title_id: titleId, meta_description: description, meta_description_id: descriptionId }); }}>
            <label htmlFor="page-title-en" className="block text-sm">{t("adminTitle")} (English)</label>
            <input id="page-title-en" name="title" className="tnl-field" value={title} onChange={(event) => setTitle(event.target.value)} required />
            <label htmlFor="page-title-id" className="block text-sm">{t("adminTitle")} (Bahasa Indonesia)</label>
            <input id="page-title-id" name="title_id" className="tnl-field" value={titleId} onChange={(event) => setTitleId(event.target.value)} />
            <label htmlFor="page-description-en" className="block text-sm">{t("adminPageDescriptionEn")}</label>
            <textarea id="page-description-en" name="meta_description" className="tnl-field" value={description} onChange={(event) => setDescription(event.target.value)} />
            <label htmlFor="page-description-id" className="block text-sm">{t("adminPageDescriptionId")}</label>
            <textarea id="page-description-id" name="meta_description_id" className="tnl-field" value={descriptionId} onChange={(event) => setDescriptionId(event.target.value)} />
            <button type="submit" className="tnl-btn tnl-btn-outline">{t("adminSave")}</button>
            {!page.is_system ? <ConfirmButton label={t("adminDelete")} question={t("adminPageDeleteQuestion")} confirmLabel={t("adminConfirm")} onConfirm={onDelete} testId="page-delete" /> : null}
        </form>
    </details>;
}
