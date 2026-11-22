// Page builder: list of pages, then a block workbench with add / reorder /
// duplicate / hide / delete, live preview link and revision restore.

import { useState } from "react";
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
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { AdminHeader, ConfirmButton, IssueList, Panel, StatusPill, adminError, issuesFromError } from "@/pages/admin/AdminUI";
import { Spinner } from "@/components/site/Primitives";
import { InlineMediaField, MultiMediaField } from "@/components/admin/media";
import { KeyValueMapEditor } from "@/components/admin/repeaters";
import type { Block, ListResponse, PageDoc, PageRevisionBrief, QualityIssue } from "@/lib/types";

const BLOCK_LIBRARY: { type: string; label: string; description: string }[] = [
    { type: "hero", label: "Hero", description: "Big opening panel with a badge, title and two buttons." },
    { type: "inner_hero", label: "Inner-page hero", description: "Gradient banner with a title and one-line description." },
    { type: "rich_text", label: "Rich text", description: "Headings, paragraphs and lists." },
    { type: "image", label: "Image", description: "A single picture with a caption." },
    { type: "gallery", label: "Gallery", description: "Several pictures with a lightbox." },
    { type: "video", label: "Video", description: "A YouTube video." },
    { type: "feature_tiles", label: "Feature tiles", description: "A grid of small icon tiles." },
    { type: "stats", label: "Stats counters", description: "Live numbers from the database." },
    { type: "numbered_cards", label: "Numbered cards", description: "Cards numbered 01, 02, 03 with an accent border." },
    { type: "about", label: "About section", description: "A paragraph beside a grid of focus tiles." },
    { type: "carousel", label: "Carousel", description: "Slides with arrows and dots." },
    { type: "quick_links", label: "Quick links", description: "Three linked cards." },
    { type: "member_sections", label: "Member sections", description: "The whole member directory with batch tabs." },
    { type: "news_feed", label: "News feed", description: "The latest articles." },
    { type: "partners", label: "Partner logos", description: "The partner strip." },
    { type: "cta_band", label: "Call-to-action band", description: "A dark panel with one button." },
    { type: "contact_panel", label: "Contact panel", description: "Address and email tiles from Settings." },
    { type: "contact_form", label: "Contact form", description: "The message form." },
    { type: "map", label: "Map", description: "A link to the laboratory on Google Maps." },
    { type: "timeline", label: "Timeline", description: "Numbered steps down a line." },
    { type: "accordion", label: "Accordion", description: "Questions that open and close." },
    { type: "download_list", label: "Download list", description: "A list of files to download." },
    { type: "html", label: "Custom HTML", description: "Advanced: raw HTML, cleaned automatically." },
];

export default function PagesList() {
    const { data, isLoading } = useQuery({
        queryKey: ["admin", "pages"],
        queryFn: () => apiGet<ListResponse<PageDoc>>("/admin/pages"),
        retry: false,
    });
    const qc = useQueryClient();
    const [selected, setSelected] = useState<string | null>(null);
    const [newSlug, setNewSlug] = useState("");
    const [newTitle, setNewTitle] = useState("");

    const createPage = useMutation({
        mutationFn: () => apiPost<PageDoc>("/admin/pages", { slug: newSlug || newTitle, title: newTitle }),
        onSuccess: (page) => {
            void qc.invalidateQueries({ queryKey: ["admin", "pages"] });
            setNewSlug("");
            setNewTitle("");
            setSelected(page.id);
            toast.success("Page created.");
        },
        onError: (err) => toast.error(adminError(err, "Could not create the page.")),
    });

    if (selected) {
        return <PageBuilder pageId={selected} onBack={() => setSelected(null)} />;
    }

    const pages = data?.items ?? [];

    return (
        <div data-testid="pages-list-page">
            <AdminHeader
                title="Pages"
                help="Every page on the public site is built from widgets. Click a page to change what is on it."
                testId="pages-header"
            />

            <Panel className="mb-6">
                <h2 className="tnl-h5 text-[18px]">Create a new page</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <input
                        className="tnl-field"
                        placeholder="Page title"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        aria-label="New page title"
                        data-testid="new-page-title-input"
                    />
                    <input
                        className="tnl-field"
                        placeholder="Web address (optional)"
                        value={newSlug}
                        onChange={(e) => setNewSlug(e.target.value)}
                        aria-label="New page web address"
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
                        Create
                    </button>
                </div>
            </Panel>

            {isLoading ? (
                <Spinner label="Loading…" />
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
                                <StatusPill published={page.status === "published"} />
                            </div>
                            <p className="mt-1 text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                                /{page.slug === "home" ? "" : page.slug}
                            </p>
                            <p className="mt-3 text-sm text-[var(--tnl-body)]">{(page.blocks ?? []).length} widget(s)</p>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function PageBuilder({ pageId, onBack }: { pageId: string; onBack: () => void }) {
    const qc = useQueryClient();
    const [showLibrary, setShowLibrary] = useState(false);
    const [showRevisions, setShowRevisions] = useState(false);
    const [editingBlock, setEditingBlock] = useState<string | null>(null);
    const [propsText, setPropsText] = useState("");
    const [issues, setIssues] = useState<QualityIssue[]>([]);

    const { data: page, isLoading } = useQuery({
        queryKey: ["admin", "page", pageId],
        queryFn: () => apiGet<PageDoc>(`/admin/pages/${pageId}`),
        retry: false,
    });

    const { data: revisions } = useQuery({
        queryKey: ["admin", "page-revisions", pageId],
        queryFn: () => apiGet<ListResponse<PageRevisionBrief>>(`/admin/pages/${pageId}/revisions`),
        retry: false,
        enabled: showRevisions,
    });

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
                toast.error(adminError(err, "Could not save that change."));
            });
    };

    if (isLoading || !page) {
        return <Spinner label="Loading page…" />;
    }

    const blocks = page.blocks ?? [];

    const move = (index: number, delta: number) => {
        const next = [...blocks];
        const target = index + delta;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        mutate(() => apiPost<PageDoc>(`/admin/pages/${pageId}/reorder`, { order: next.map((b) => b.id) }), "Order updated.");
    };

    const addBlock = (type: string) => {
        setShowLibrary(false);
        mutate(() => apiPost<PageDoc>(`/admin/pages/${pageId}/blocks`, { type, props: {} }), "Widget added.");
    };

    const saveProps = (block: Block) => {
        let parsed: Record<string, unknown>;
        try {
            parsed = propsText.trim() ? JSON.parse(propsText) : {};
        } catch {
            toast.error("The settings are not valid. Check the brackets and commas.");
            return;
        }
        setEditingBlock(null);
        mutate(() => apiPatch<PageDoc>(`/admin/pages/${pageId}/blocks/${block.id}`, { props: parsed }), "Widget updated.");
    };

    const publish = (status: string) => {
        setIssues([]);
        mutate(() => apiPatch<PageDoc>(`/admin/pages/${pageId}`, { status }), status === "published" ? "Page published." : "Page unpublished.");
    };

    return (
        <div data-testid={`page-builder-${page.slug}`}>
            <AdminHeader
                title={page.title}
                help={`Widgets on /${page.slug === "home" ? "" : page.slug}. Changes are saved as you go, and every save keeps a version you can restore.`}
                actions={
                    <>
                        <button type="button" onClick={onBack} className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm" data-testid="page-back-button">
                            All pages
                        </button>
                        <a
                            href={`/${page.slug === "home" ? "" : page.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm"
                            data-testid="page-preview-link"
                        >
                            Preview
                        </a>
                        <button
                            type="button"
                            onClick={() => setShowRevisions((v) => !v)}
                            className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm"
                            data-testid="page-revisions-button"
                        >
                            <History className="h-4 w-4" aria-hidden="true" />
                            Revisions
                        </button>
                        {page.status === "published" ? (
                            <button type="button" onClick={() => publish("draft")} className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm" data-testid="page-unpublish-button">
                                Unpublish
                            </button>
                        ) : (
                            <button type="button" onClick={() => publish("published")} className="tnl-btn tnl-btn-primary h-10 min-h-[40px] text-sm" data-testid="page-publish-button">
                                Publish
                            </button>
                        )}
                    </>
                }
                testId="page-builder-header"
            />

            {issues.length ? (
                <Panel className="mb-5">
                    <p className="mb-2 text-sm font-semibold">This page cannot be published yet</p>
                    <IssueList issues={issues} testId="page-builder-issues" />
                </Panel>
            ) : null}

            {showRevisions ? (
                <Panel className="mb-5">
                    <h2 className="tnl-h5 text-[18px]">Revisions</h2>
                    <ul className="mt-3 space-y-2 text-sm">
                        {(revisions?.items ?? []).map((rev) => (
                            <li
                                key={rev.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border px-4 py-3"
                                style={{ borderColor: "var(--tnl-border)" }}
                                data-testid={`revision-${rev.id}`}
                            >
                                <span>
                                    {new Date(rev.saved_at).toLocaleString()} · {rev.saved_by || "unknown"} · {rev.block_count} widget(s)
                                </span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        mutate(() => apiPost<PageDoc>(`/admin/pages/${pageId}/revisions/${rev.id}/restore`), "Version restored.")
                                    }
                                    className="rounded-[6px] border px-3 py-1.5 text-xs font-medium"
                                    style={{ borderColor: "var(--tnl-border)" }}
                                    data-testid={`revision-restore-${rev.id}`}
                                >
                                    Restore
                                </button>
                            </li>
                        ))}
                        {!(revisions?.items ?? []).length ? (
                            <li className="text-[var(--tnl-body)]">No earlier versions yet.</li>
                        ) : null}
                    </ul>
                </Panel>
            ) : null}

            <div className="mb-5">
                <button type="button" onClick={() => setShowLibrary((v) => !v)} className="tnl-btn tnl-btn-primary" data-testid="add-widget-button">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add widget
                </button>
            </div>

            {showLibrary ? (
                <Panel className="mb-5">
                    <h2 className="tnl-h5 text-[18px]">Choose a widget</h2>
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
                                <span className="block text-sm font-bold">{item.label}</span>
                                <span className="mt-1 block text-xs" style={{ color: "var(--tnl-body)" }}>
                                    {item.description}
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
                                        {meta?.label ?? block.type}
                                        {block.hidden ? " · hidden" : ""}
                                    </h3>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="flex h-9 w-9 items-center justify-center rounded-[6px] border disabled:opacity-40" style={{ borderColor: "var(--tnl-border)" }} aria-label="Move up" data-testid={`block-up-${block.id}`}>
                                        <ArrowUp className="h-4 w-4" />
                                    </button>
                                    <button type="button" onClick={() => move(index, 1)} disabled={index === blocks.length - 1} className="flex h-9 w-9 items-center justify-center rounded-[6px] border disabled:opacity-40" style={{ borderColor: "var(--tnl-border)" }} aria-label="Move down" data-testid={`block-down-${block.id}`}>
                                        <ArrowDown className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => mutate(() => apiPatch<PageDoc>(`/admin/pages/${pageId}/blocks/${block.id}`, { hidden: !block.hidden }), block.hidden ? "Widget shown." : "Widget hidden.")}
                                        className="flex h-9 w-9 items-center justify-center rounded-[6px] border"
                                        style={{ borderColor: "var(--tnl-border)" }}
                                        aria-label={block.hidden ? "Show widget" : "Hide widget"}
                                        data-testid={`block-toggle-${block.id}`}
                                    >
                                        {block.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => mutate(() => apiPost<PageDoc>(`/admin/pages/${pageId}/blocks/${block.id}/duplicate`), "Widget duplicated.")}
                                        className="flex h-9 w-9 items-center justify-center rounded-[6px] border"
                                        style={{ borderColor: "var(--tnl-border)" }}
                                        aria-label="Duplicate widget"
                                        data-testid={`block-duplicate-${block.id}`}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditingBlock(editingBlock === block.id ? null : block.id);
                                            setPropsText(JSON.stringify(block.props ?? {}, null, 2));
                                        }}
                                        className="rounded-[6px] border px-3 py-1.5 text-xs font-medium"
                                        style={{ borderColor: "var(--tnl-border)" }}
                                        data-testid={`block-edit-${block.id}`}
                                    >
                                        Settings
                                    </button>
                                    <ConfirmButton
                                        label="Remove"
                                        confirmLabel="Remove it"
                                        question="Remove this widget?"
                                        onConfirm={() =>
                                            mutate(() => apiDelete<PageDoc>(`/admin/pages/${pageId}/blocks/${block.id}`), "Widget removed.")
                                        }
                                        testId={`block-delete-${block.id}`}
                                    />
                                </div>
                            </div>

                            {editingBlock === block.id ? (
                                <div className="mt-4 space-y-3">
                                    {block.type === "image" && (
                                        <InlineMediaField
                                            label="Block Image"
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
                                                    // ignore parse error
                                                }
                                            }}
                                            defaultFolder="pages"
                                            aspect="video"
                                            testId={`block-image-picker-${block.id}`}
                                        />
                                    )}

                                    {block.type === "gallery" && (
                                        <MultiMediaField
                                            label="Gallery Images"
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
                                                    p.images = newUrls.map((u) => ({ url: u, alt: "" }));
                                                    setPropsText(JSON.stringify(p, null, 2));
                                                } catch {
                                                    // ignore parse error
                                                }
                                            }}
                                            defaultFolder="pages"
                                            testId={`block-gallery-picker-${block.id}`}
                                        />
                                    )}

                                    <div className="pt-1">
                                        <KeyValueMapEditor
                                            label="Widget Settings & Properties"
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
                                            help="Text properties ending in _id hold the Indonesian version. Use </> Raw JSON for nested structures or raw view."
                                            testId={`block-props-${block.id}`}
                                        />
                                    </div>
                                    <button type="button" onClick={() => saveProps(block)} className="tnl-btn tnl-btn-primary mt-3 h-10 min-h-[40px] text-sm" data-testid={`block-props-save-${block.id}`}>
                                        <Save className="h-4 w-4" aria-hidden="true" />
                                        Save settings
                                    </button>
                                </div>
                            ) : null}
                        </Panel>
                    );
                })}
                {blocks.length === 0 ? (
                    <Panel>
                        <p className="text-sm text-[var(--tnl-body)]" data-testid="page-builder-empty">
                            This page has no widgets yet. Click “Add widget” to start.
                        </p>
                    </Panel>
                ) : null}
            </div>
        </div>
    );
}

export { Trash2 };
