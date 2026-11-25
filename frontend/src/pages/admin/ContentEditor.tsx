// Dedicated CMS editor view — WordPress/Payload style two-column form.
//
// Left column  : grouped content cards (Basic Details, Bilingual Content with an
//                EN/ID tab switcher, rich text, tags, links, repeaters, galleries).
// Right column : sticky inspector (Publishing & Visibility, Featured Media,
//                Classification, Private / Internal fields).
//
// All API calls (paths, verbs, payloads) mirror the old inline editor exactly —
// this file is UI/routing only.

import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Eye, Monitor, RotateCcw, Save, Smartphone } from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { AdminSelect, AdminSwitch, IssueList, StatusPill, adminError, issuesFromError } from "@/pages/admin/AdminUI";
import { Spinner } from "@/components/site/Primitives";
import { InlineMediaField, MultiMediaField } from "@/components/admin/media";
import { RichTextField } from "@/components/admin/editor";
import { TagChipsField, KeyValueMapEditor, ObjectListRepeater, FormFieldsBuilder } from "@/components/admin/repeaters";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
    RESOURCE_SPECS,
    emptyDraft,
    toForm,
    toPayload,
    type FieldSpec,
    type ResourceSpec,
    type Row,
} from "@/pages/admin/ContentManager";
import type { FormField, ListResponse, Member, QualityIssue } from "@/lib/types";

/* ------------------------------------------------------------------ helpers */

type SetField = (key: string, value: unknown) => void;

interface Ctx {
    resource: string;
    itemId: string | null;
    members: Member[];
}

interface FieldGroup {
    primary: FieldSpec;
    secondary?: FieldSpec;
}

// Types whose input renders its own label (so the wrapper skips the outer <label>).
const SELF_LABELLED = new Set(["media", "media_list", "key_value", "repeater", "form_fields", "tags"]);

function stripLang(label: string): string {
    return label.replace(/\s*\((?:English|Bahasa Indonesia)\)\s*$/i, "").trim();
}

function hasContent(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "object") return Object.keys(value as object).length > 0;
    return Boolean(value);
}

// Pair every "key" field with its "key_id" Bahasa-Indonesia sibling.
function buildGroups(spec: ResourceSpec): FieldGroup[] {
    const byKey = new Map(spec.fields.map((f) => [f.key, f]));
    const groups: FieldGroup[] = [];
    const consumed = new Set<string>();
    for (const field of spec.fields) {
        if (consumed.has(field.key)) continue;
        if (field.key.endsWith("_id")) {
            groups.push({ primary: field });
            consumed.add(field.key);
            continue;
        }
        const sibling = byKey.get(`${field.key}_id`);
        if (sibling) {
            groups.push({ primary: field, secondary: sibling });
            consumed.add(field.key);
            consumed.add(sibling.key);
        } else {
            groups.push({ primary: field });
            consumed.add(field.key);
        }
    }
    return groups;
}

type Bucket =
    | "basic"
    | "bilingual"
    | "richtext"
    | "tags"
    | "links"
    | "repeater"
    | "galleries"
    | "publish"
    | "media"
    | "classification"
    | "private";

function bucketOf(group: FieldGroup, spec: ResourceSpec): Bucket {
    const field = group.primary;
    if (group.secondary) return "bilingual";
    if (/private|internal/i.test(field.label)) return "private";
    switch (field.type) {
        case "media":
            return "media";
        case "media_list":
            return "galleries";
        case "tags":
            return "tags";
        case "key_value":
            return "links";
        case "repeater":
        case "form_fields":
        case "member_multiselect":
            return "repeater";
        case "html":
            return "richtext";
        case "checkbox":
            return field.key === spec.publishField ? "publish" : field.key.startsWith("show_") ? "publish" : "classification";
        case "select":
            return field.key === spec.publishField ? "publish" : "classification";
        case "number":
            return field.key === "order" ? "publish" : "classification";
        default:
            return "basic";
    }
}

function bucketize(groups: FieldGroup[], spec: ResourceSpec): Record<Bucket, FieldGroup[]> {
    const out: Record<Bucket, FieldGroup[]> = {
        basic: [],
        bilingual: [],
        richtext: [],
        tags: [],
        links: [],
        repeater: [],
        galleries: [],
        publish: [],
        media: [],
        classification: [],
        private: [],
    };
    for (const group of groups) out[bucketOf(group, spec)].push(group);
    return out;
}

/* --------------------------------------------------------------- primitives */

function SectionCard({
    title,
    description,
    children,
    testId,
}: {
    title: string;
    description?: string;
    children: ReactNode;
    testId?: string;
}) {
    return (
        <section className="tnl-card p-5 sm:p-6" data-testid={testId}>
            <header className="mb-4 border-b pb-3" style={{ borderColor: "var(--tnl-border)" }}>
                <h2 className="text-base font-semibold text-[var(--tnl-heading)]">{title}</h2>
                {description ? <p className="mt-1 text-xs text-[var(--tnl-body)]">{description}</p> : null}
            </header>
            <div className="space-y-4">{children}</div>
        </section>
    );
}

/* ------------------------------------------------------------- field render */

function renderControl(field: FieldSpec, form: Record<string, unknown>, setField: SetField, ctx: Ctx): ReactNode {
    const id = `field-${field.key}`;
    const value = form[field.key];
    const testId = `content-field-${field.key}`;

    switch (field.type) {
        case "html":
            return (
                <RichTextField
                    id={id}
                    value={String(value ?? "")}
                    onChange={(html) => setField(field.key, html)}
                    placeholder={field.placeholder || "Write the article..."}
                    defaultFolder={ctx.resource}
                    attachedTo={{ resource: ctx.resource, item_id: ctx.itemId }}
                    testId={testId}
                />
            );

        case "textarea":
            return (
                <textarea
                    id={id}
                    className="tnl-field font-sans text-sm"
                    rows={5}
                    value={String(value ?? "")}
                    onChange={(e) => setField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    data-testid={testId}
                />
            );

        case "json":
            return (
                <textarea
                    id={id}
                    className="tnl-field font-mono text-sm"
                    rows={6}
                    value={String(value ?? "")}
                    onChange={(e) => setField(field.key, e.target.value)}
                    data-testid={testId}
                />
            );

        case "tags":
            return (
                <TagChipsField
                    label={field.label}
                    value={value as string[]}
                    onChange={(tags) => setField(field.key, tags)}
                    help={field.help}
                    testId={testId}
                />
            );

        case "key_value":
            return (
                <KeyValueMapEditor
                    label={field.label}
                    value={value as Record<string, string>}
                    onChange={(val) => setField(field.key, val)}
                    presetKeys={field.presetKeys}
                    help={field.help}
                    testId={testId}
                />
            );

        case "repeater":
            return (
                <ObjectListRepeater
                    label={field.label}
                    value={value as Array<Record<string, unknown>>}
                    onChange={(items) => setField(field.key, items)}
                    fields={field.repeaterFields || []}
                    itemTitleField={field.itemTitleField}
                    itemSubtitleField={field.itemSubtitleField}
                    help={field.help}
                    emptyMessage={field.emptyMessage}
                    addButtonLabel={field.addButtonLabel}
                    defaultFolder={field.folder || ctx.resource}
                    testId={testId}
                />
            );

        case "form_fields":
            return (
                <FormFieldsBuilder
                    label={field.label}
                    value={value as FormField[]}
                    onChange={(fields) => setField(field.key, fields)}
                    help={field.help}
                    testId={testId}
                />
            );

        case "select":
            // House select: h-9, pinned chevron — never the 46px browser arrow
            // that `tnl-field` leaves behind in the editor's dense columns.
            return (
                <AdminSelect
                    id={id}
                    className="font-sans text-sm"
                    value={String(value ?? "")}
                    onChange={(e) => setField(field.key, e.target.value)}
                    data-testid={testId}
                >
                    {field.options?.map((opt) => (
                        <option key={opt} value={opt}>
                            {opt}
                        </option>
                    ))}
                </AdminSelect>
            );

        case "checkbox":
            // Shared design-system switch: no raw "Yes"/"No" pill, no native checkbox.
            return (
                <AdminSwitch
                    label={field.label}
                    checked={Boolean(value)}
                    onCheckedChange={(next) => setField(field.key, next)}
                    testId={testId}
                    labelHidden
                />
            );

        case "member_multiselect": {
            const selectedIds = Array.isArray(value) ? (value as string[]) : [];
            return (
                <div id={id} className="rounded-lg border p-3" style={{ borderColor: "var(--tnl-border)" }} data-testid={testId}>
                    <p className="mb-2 text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                        Select laboratory members who co-authored this publication:
                    </p>
                    <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                        {ctx.members.map((m) => {
                            const checked = selectedIds.includes(m.id);
                            return (
                                <label key={m.id} className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1 text-xs hover:bg-[var(--tnl-surface)]">
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) => {
                                            const next = e.target.checked ? [...selectedIds, m.id] : selectedIds.filter((x) => x !== m.id);
                                            setField(field.key, next);
                                        }}
                                        className="h-3.5 w-3.5 rounded"
                                    />
                                    <span className="font-medium">{m.name}</span>
                                    <span className="rounded bg-[rgba(67,89,74,0.1)] px-1.5 py-0.5 text-[10px] text-[var(--tnl-green)]">
                                        {m.role}
                                        {m.division ? ` · ${m.division}` : ""}
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            );
        }

        case "media":
            return (
                <InlineMediaField
                    label={field.label}
                    value={String(value ?? "")}
                    onChange={(url) => setField(field.key, url)}
                    defaultFolder={field.folder || ctx.resource}
                    attachedTo={{ resource: ctx.resource, item_id: ctx.itemId }}
                    aspect={field.aspect || "video"}
                    accept={field.accept || "image"}
                    help={field.help}
                    testId={testId}
                />
            );

        case "media_list":
            return (
                <MultiMediaField
                    label={field.label}
                    value={value as string[]}
                    onChange={(urls) => setField(field.key, urls)}
                    defaultFolder={field.folder || ctx.resource}
                    attachedTo={{ resource: ctx.resource, item_id: ctx.itemId }}
                    help={field.help}
                    testId={testId}
                />
            );

        default:
            return (
                <input
                    id={id}
                    type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                    className={`tnl-field text-sm ${field.key === "code" || field.key === "slug" ? "font-mono" : "font-sans"}`}
                    value={String(value ?? "")}
                    onChange={(e) => setField(field.key, field.type === "number" ? Number(e.target.value) : e.target.value)}
                    placeholder={field.placeholder}
                    data-testid={testId}
                />
            );
    }
}

function FieldBlock({ field, form, setField, ctx }: { field: FieldSpec; form: Record<string, unknown>; setField: SetField; ctx: Ctx }) {
    const showLabel = !SELF_LABELLED.has(field.type);
    return (
        <div className="space-y-1.5">
            {showLabel ? (
                <label htmlFor={`field-${field.key}`} className="block text-sm font-medium text-[var(--tnl-heading)]">
                    {stripLang(field.label)}
                </label>
            ) : null}
            {renderControl(field, form, setField, ctx)}
            {field.help && showLabel ? (
                <p className="text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                    {field.help}
                </p>
            ) : null}
        </div>
    );
}

function BilingualCard({
    groups,
    form,
    setField,
    ctx,
}: {
    groups: FieldGroup[];
    form: Record<string, unknown>;
    setField: SetField;
    ctx: Ctx;
}) {
    const [lang, setLang] = useState<"en" | "id">("en");
    const enHas = groups.some((g) => hasContent(form[g.primary.key]));
    const idHas = groups.some((g) => g.secondary && hasContent(form[g.secondary.key]));

    return (
        <SectionCard
            title="Bilingual Content"
            description="Both languages are kept while you type — switch tabs to edit English or Bahasa Indonesia."
            testId="content-section-bilingual"
        >
            <div className="inline-flex items-center gap-1 rounded-[10px] border p-1" style={{ borderColor: "var(--tnl-border)" }}>
                {(["en", "id"] as const).map((code) => {
                    const active = lang === code;
                    const otherHasContent = code === "en" ? idHas : enHas;
                    return (
                        <button
                            key={code}
                            type="button"
                            onClick={() => setLang(code)}
                            aria-pressed={active}
                            className="inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-sm font-medium transition-colors"
                            style={active ? { background: "var(--tnl-green)", color: "#fff" } : { color: "var(--tnl-body)" }}
                            data-testid={`content-lang-${code}`}
                        >
                            {code === "en" ? "English" : "Bahasa Indonesia"}
                            {!active && otherHasContent ? (
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--tnl-green)" }} data-testid={`content-lang-dot-${code}`} />
                            ) : null}
                        </button>
                    );
                })}
            </div>

            <div className="space-y-4" data-testid="content-bilingual-fields">
                {groups.map((group) => {
                    const field = lang === "en" ? group.primary : group.secondary ?? group.primary;
                    return <FieldBlock key={group.primary.key} field={field} form={form} setField={setField} ctx={ctx} />;
                })}
            </div>
        </SectionCard>
    );
}

/* ------------------------------------------------------------------- editor */

const SINGULARS: Record<string, string> = {
    posts: "News article",
    members: "Member",
    events: "Event",
    activities: "Activity",
    projects: "Project",
    publications: "Publication",
    partners: "Partner",
    practicum: "Module",
    equipment: "Equipment",
};

export default function ContentEditor() {
    const params = useParams<{ resource: string; id?: string }>();
    const resource = params.resource ?? "posts";
    const routeId = params.id;
    const isNew = !routeId;
    const navigate = useNavigate();
    const qc = useQueryClient();

    const spec = RESOURCE_SPECS[resource];
    const listUrl = `/admin/content/${resource}`;

    const [form, setForm] = useState<Record<string, unknown>>({});
    const [issues, setIssues] = useState<QualityIssue[]>([]);
    const [snapshot, setSnapshot] = useState<string | null>(null);
    const [loadedKey, setLoadedKey] = useState<string | null>(null);

    // Autosave & Recovery states
    const draftKey = useMemo(() => `tnl-draft:${resource}:${routeId ?? "new"}`, [resource, routeId]);
    const [localDraftInfo, setLocalDraftInfo] = useState<{ timestamp: string; form: Record<string, unknown> } | null>(null);
    const [lastAutosaved, setLastAutosaved] = useState<string | null>(null);

    // Live preview states
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
    const [previewLang, setPreviewLang] = useState<"en" | "id">("en");

    const needsMembers = Boolean(spec?.fields.some((f) => f.type === "member_multiselect"));
    const { data: membersList } = useQuery({
        queryKey: ["admin", "members-lookup"],
        queryFn: () => apiGet<Member[]>("/public/members"),
        retry: false,
        enabled: needsMembers,
    });

    const { data, isLoading } = useQuery({
        queryKey: ["admin", "content", resource],
        queryFn: () => apiGet<ListResponse<Row>>(`/admin/content/${resource}?limit=200`),
        retry: false,
        enabled: Boolean(spec) && !isNew,
    });

    const row = useMemo(
        () => (!isNew && data?.items ? data.items.find((r) => r.id === routeId) : undefined),
        [data, isNew, routeId]
    );

    // Hydrate the form exactly once per item (or once for a new item).
    useEffect(() => {
        if (!spec) return;
        const key = isNew ? "__new__" : routeId ?? null;
        if (!key || loadedKey === key) return;
        if (isNew) {
            const draft = emptyDraft(spec);
            setForm(draft);
            setSnapshot(JSON.stringify(draft));
            setLoadedKey(key);
            setIssues([]);
            return;
        }
        if (row) {
            const next = toForm(row, spec);
            setForm(next);
            setSnapshot(JSON.stringify(next));
            setLoadedKey(key);
            setIssues((row.issues as QualityIssue[]) ?? []);
        }
    }, [spec, isNew, routeId, row, loadedKey]);

    // Check for existing local autosave on hydration
    useEffect(() => {
        if (!loadedKey) return;
        try {
            const raw = localStorage.getItem(draftKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed?.form && snapshot && JSON.stringify(parsed.form) !== snapshot) {
                    setLocalDraftInfo({
                        timestamp: parsed.timestamp || new Date().toISOString(),
                        form: parsed.form,
                    });
                }
            }
        } catch {
            /* ignore localStorage errors */
        }
    }, [loadedKey, draftKey, snapshot]);

    const dirty = snapshot !== null && JSON.stringify(form) !== snapshot;

    // Debounced autosave effect (5s after last keystroke when dirty)
    useEffect(() => {
        if (!dirty || !loadedKey) return;
        const timer = setTimeout(() => {
            try {
                const now = new Date().toISOString();
                localStorage.setItem(draftKey, JSON.stringify({ timestamp: now, form }));
                const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                setLastAutosaved(timeStr);
            } catch {
                /* ignore quota */
            }
        }, 5000);
        return () => clearTimeout(timer);
    }, [form, dirty, loadedKey, draftKey]);

    const setField: SetField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

    const invalidate = () => {
        void qc.invalidateQueries({ queryKey: ["admin", "content", resource] });
        void qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
        void qc.invalidateQueries({ queryKey: ["admin", "review-queue"] });
        void qc.invalidateQueries({ queryKey: ["public"] });
    };

    const saveMutation = useMutation({
        mutationFn: async (payload: Record<string, unknown>) => {
            if (!isNew && routeId) return apiPut<Row>(`/admin/content/${resource}/${routeId}`, payload);
            return apiPost<Row>(`/admin/content/${resource}`, payload);
        },
        onSuccess: (saved) => {
            try {
                localStorage.removeItem(draftKey);
            } catch {
                /* ignore */
            }
            setLastAutosaved(null);
            setLocalDraftInfo(null);
            toast.success("Saved.");
            invalidate();
            setIssues((saved?.issues as QualityIssue[]) ?? []);
            if (isNew) {
                if (saved?.id) {
                    if (spec) {
                        const next = toForm(saved, spec);
                        setForm(next);
                        setSnapshot(JSON.stringify(next));
                        setLoadedKey(saved.id);
                    }
                    navigate(`/admin/content/${resource}/${saved.id}`, { replace: true });
                } else {
                    navigate(listUrl, { replace: true });
                }
                return;
            }
            if (spec) {
                const next = toForm(saved, spec);
                setForm(next);
                setSnapshot(JSON.stringify(next));
            }
        },
        onError: (err) => {
            const found = issuesFromError(err);
            if (found.length) setIssues(found);
            toast.error(adminError(err, "Could not save. Please check the fields."));
        },
    });

    // Dirty-state confirmation — beforeunload for reload/close, plus an explicit
    // guard on the in-app Back / Cancel controls.
    useEffect(() => {
        if (!dirty) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [dirty]);

    const confirmLeave = () => !dirty || window.confirm("You have unsaved changes. Leave without saving?");
    const onBack = (e: MouseEvent<HTMLAnchorElement>) => {
        if (!confirmLeave()) e.preventDefault();
    };
    const onCancel = () => {
        if (confirmLeave()) navigate(listUrl);
    };

    const submit = () => {
        if (!spec) return;
        try {
            saveMutation.mutate(toPayload(form, spec));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Please check the fields.");
        }
    };

    if (!spec) {
        return (
            <div data-testid="content-editor-unknown" className="tnl-card p-6">
                <h1 className="text-lg font-semibold text-[var(--tnl-heading)]">Unknown content type</h1>
                <p className="mt-1 text-sm text-[var(--tnl-body)]">Pick a content type from the menu on the left.</p>
            </div>
        );
    }

    if (!isNew && !row) {
        return (
            <div data-testid="content-editor-loading" className="p-6">
                {isLoading ? (
                    <Spinner label="Loading item..." />
                ) : (
                    <p className="text-sm text-[var(--tnl-body)]">We could not find this item. It may have been deleted.</p>
                )}
            </div>
        );
    }

    const groups = buildGroups(spec);
    const buckets = bucketize(groups, spec);
    const ctx: Ctx = { resource, itemId: isNew ? null : routeId ?? null, members: membersList ?? [] };

    const publishedNow = spec.publishField === "published" ? Boolean(form.published) : form.status === "published";
    const title = isNew ? `New ${SINGULARS[resource] ?? spec.label}` : String(form[spec.titleField] ?? "") || "Untitled";

    return (
        <div data-testid={`content-editor-${resource}`}>
            {/* Sticky action bar — Save is always reachable without scrolling. */}
            <div
                className="sticky top-0 z-20 -mx-4 -mt-4 mb-6 border-b px-4 py-3 sm:-mx-6 sm:-mt-6 sm:px-6 lg:-mx-8 lg:-mt-8 lg:px-8"
                style={{
                    borderColor: "var(--tnl-border)",
                    background: "var(--card)",
                    boxShadow: "0 12px 24px -24px color-mix(in srgb, var(--tnl-heading) 60%, transparent)",
                }}
                data-testid="content-editor-bar"
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <Link
                            to={listUrl}
                            onClick={onBack}
                            className="inline-flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-sm font-medium"
                            style={{ borderColor: "var(--tnl-border)", color: "var(--tnl-body)" }}
                            data-testid="content-editor-back"
                        >
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            Back to {spec.label}
                        </Link>
                        <div className="min-w-0">
                            <h1 className="truncate text-lg font-semibold text-[var(--tnl-heading)]" data-testid="content-editor-title">
                                {title}
                            </h1>
                            <div className="mt-1 flex items-center gap-2">
                                <StatusPill published={publishedNow} testId="content-editor-status" />
                                {dirty ? (
                                    <span
                                        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                                        style={{ background: "color-mix(in srgb, var(--tnl-tan) 22%, transparent)", color: "var(--tnl-tan-text)" }}
                                        data-testid="content-dirty-badge"
                                    >
                                        Unsaved changes
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {lastAutosaved ? (
                            <span className="hidden sm:inline text-xs text-[var(--tnl-body)] mr-1" data-testid="content-autosave-indicator">
                                Autosaved locally {lastAutosaved}
                            </span>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => setPreviewOpen(true)}
                            className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm"
                            data-testid="content-preview-button"
                        >
                            <Eye className="h-4 w-4" aria-hidden="true" />
                            Preview
                        </button>
                        <button
                            type="button"
                            onClick={onCancel}
                            className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm"
                            data-testid="content-cancel-button"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={submit}
                            disabled={saveMutation.isPending}
                            className="tnl-btn tnl-btn-primary h-10 min-h-[40px] text-sm"
                            data-testid="content-save-button"
                        >
                            <Save className="h-4 w-4" aria-hidden="true" />
                            {saveMutation.isPending ? "Saving..." : isNew ? "Create & Publish" : "Save changes"}
                        </button>
                    </div>
                </div>
            </div>

            {localDraftInfo ? (
                <div
                    className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--gsm-accent)]/40 bg-[var(--gsm-accent)]/10 px-4 py-3 text-sm text-[var(--tnl-heading)]"
                    data-testid="content-draft-banner"
                >
                    <div className="flex items-center gap-2.5 min-w-0">
                        <span className="h-2 w-2 rounded-full bg-[var(--gsm-accent)] shrink-0" />
                        <span className="truncate">
                            Draf lokal tersimpan pada {new Date(localDraftInfo.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                setForm(localDraftInfo.form);
                                setLocalDraftInfo(null);
                                toast.success("Draf lokal dipulihkan.");
                            }}
                            className="font-medium underline hover:text-[var(--gsm-primary)] text-sm"
                            data-testid="content-restore-draft-btn"
                        >
                            Pulihkan draf
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                try {
                                    localStorage.removeItem(draftKey);
                                } catch {
                                    /* ignore */
                                }
                                setLocalDraftInfo(null);
                            }}
                            className="text-xs text-[var(--tnl-body)] hover:underline"
                            data-testid="content-discard-draft-btn"
                        >
                            Abaikan
                        </button>
                    </div>
                </div>
            ) : null}

            {issues.length ? (
                <div className="mb-6">
                    <p className="mb-2 text-sm font-semibold text-[var(--tnl-heading)]">Content checks</p>
                    <IssueList issues={issues} testId="content-editor-issues" />
                </div>
            ) : null}

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
                {/* Left: grouped content cards */}
                <div className="space-y-6">
                    {buckets.basic.length ? (
                        <SectionCard
                            title="Basic Details"
                            description="The headline details that identify this item."
                            testId="content-section-basic"
                        >
                            {buckets.basic.map((group) => (
                                <FieldBlock key={group.primary.key} field={group.primary} form={form} setField={setField} ctx={ctx} />
                            ))}
                        </SectionCard>
                    ) : null}

                    {buckets.bilingual.length ? (
                        <BilingualCard groups={buckets.bilingual} form={form} setField={setField} ctx={ctx} />
                    ) : null}

                    {buckets.richtext.length ? (
                        <SectionCard title="Rich Text" description="Long-form formatted content." testId="content-section-richtext">
                            {buckets.richtext.map((group) => (
                                <FieldBlock key={group.primary.key} field={group.primary} form={form} setField={setField} ctx={ctx} />
                            ))}
                        </SectionCard>
                    ) : null}

                    {buckets.repeater.map((group) => (
                        <SectionCard
                            key={group.primary.key}
                            title={group.primary.label}
                            description={group.primary.help}
                            testId={`content-section-${group.primary.key}`}
                        >
                            <FieldBlock field={group.primary} form={form} setField={setField} ctx={ctx} />
                        </SectionCard>
                    ))}

                    {buckets.tags.length ? (
                        <SectionCard title="Tags" description="Keywords used for filtering and search." testId="content-section-tags">
                            {buckets.tags.map((group) => (
                                <FieldBlock key={group.primary.key} field={group.primary} form={form} setField={setField} ctx={ctx} />
                            ))}
                        </SectionCard>
                    ) : null}

                    {buckets.links.length ? (
                        <SectionCard title="Links" description="External profiles and social links." testId="content-section-links">
                            {buckets.links.map((group) => (
                                <FieldBlock key={group.primary.key} field={group.primary} form={form} setField={setField} ctx={ctx} />
                            ))}
                        </SectionCard>
                    ) : null}

                    {buckets.galleries.length ? (
                        <SectionCard title="Galleries" description="Extra image sets shown as a carousel." testId="content-section-galleries">
                            {buckets.galleries.map((group) => (
                                <FieldBlock key={group.primary.key} field={group.primary} form={form} setField={setField} ctx={ctx} />
                            ))}
                        </SectionCard>
                    ) : null}
                </div>

                {/* Right: sticky inspector */}
                <div className="space-y-4 xl:sticky xl:top-20" data-testid="content-inspector">
                    {buckets.publish.length ? (
                        <SectionCard title="Publishing & Visibility" testId="content-section-publish">
                            {buckets.publish.map((group) => (
                                <FieldBlock key={group.primary.key} field={group.primary} form={form} setField={setField} ctx={ctx} />
                            ))}
                        </SectionCard>
                    ) : null}

                    {buckets.media.length ? (
                        <SectionCard title="Featured Media / Portrait" testId="content-section-media">
                            {buckets.media.map((group) => (
                                <FieldBlock key={group.primary.key} field={group.primary} form={form} setField={setField} ctx={ctx} />
                            ))}
                        </SectionCard>
                    ) : null}

                    {buckets.classification.length ? (
                        <SectionCard title="Classification" testId="content-section-classification">
                            {buckets.classification.map((group) => (
                                <FieldBlock key={group.primary.key} field={group.primary} form={form} setField={setField} ctx={ctx} />
                            ))}
                        </SectionCard>
                    ) : null}

                    {buckets.private.length ? (
                        <SectionCard
                            title="Private / Internal"
                            description="Hidden from the public site."
                            testId="content-section-private"
                        >
                            {buckets.private.map((group) => (
                                <FieldBlock key={group.primary.key} field={group.primary} form={form} setField={setField} ctx={ctx} />
                            ))}
                        </SectionCard>
                    ) : null}
                </div>
            </div>

            {/* Modal: Preview as Visitor */}
            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                <DialogContent size="xl" className="max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0" data-testid="content-preview-modal">
                    <div className="flex flex-wrap items-center justify-between border-b px-6 py-4 bg-[var(--tnl-surface)]" style={{ borderColor: "var(--tnl-border)" }}>
                        <div className="flex items-center gap-3">
                            <DialogTitle className="text-base font-semibold text-[var(--tnl-heading)]">Preview as Visitor</DialogTitle>
                            <span className="rounded bg-[var(--muted)] px-2 py-0.5 text-xs text-[var(--tnl-body)] font-mono">
                                /{resource}/{String(form.slug || routeId || "preview")}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="inline-flex items-center rounded-lg border p-1" style={{ borderColor: "var(--tnl-border)" }}>
                                <button
                                    type="button"
                                    onClick={() => setPreviewDevice("desktop")}
                                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                        previewDevice === "desktop" ? "bg-[var(--tnl-green)] text-white" : "text-[var(--tnl-body)] hover:text-[var(--tnl-heading)]"
                                    }`}
                                    data-testid="content-preview-device-desktop"
                                >
                                    <Monitor className="h-3.5 w-3.5" /> Desktop
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPreviewDevice("mobile")}
                                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                        previewDevice === "mobile" ? "bg-[var(--tnl-green)] text-white" : "text-[var(--tnl-body)] hover:text-[var(--tnl-heading)]"
                                    }`}
                                    data-testid="content-preview-device-mobile"
                                >
                                    <Smartphone className="h-3.5 w-3.5" /> Mobile (390px)
                                </button>
                            </div>
                            <div className="inline-flex items-center rounded-lg border p-1" style={{ borderColor: "var(--tnl-border)" }}>
                                <button
                                    type="button"
                                    onClick={() => setPreviewLang("en")}
                                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                        previewLang === "en" ? "bg-[var(--tnl-green)] text-white" : "text-[var(--tnl-body)] hover:text-[var(--tnl-heading)]"
                                    }`}
                                    data-testid="content-preview-lang-en"
                                >
                                    EN
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPreviewLang("id")}
                                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                        previewLang === "id" ? "bg-[var(--tnl-green)] text-white" : "text-[var(--tnl-body)] hover:text-[var(--tnl-heading)]"
                                    }`}
                                    data-testid="content-preview-lang-id"
                                >
                                    ID
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 bg-black/[0.02] dark:bg-white/[0.02]" data-testid="content-preview-body">
                        <div className={previewDevice === "mobile" ? "w-[390px] mx-auto rounded-2xl border shadow-xl bg-[var(--card)] p-5 overflow-hidden transition-all" : "max-w-3xl mx-auto bg-[var(--card)] rounded-xl border p-8 shadow-sm"}>
                            {resource === "posts" ? (
                                <article className="space-y-4">
                                    <h1 className="tnl-h2 text-2xl sm:text-3xl font-bold">
                                        {String(previewLang === "id" && form.title_id ? form.title_id : form.title || "Untitled Article")}
                                    </h1>
                                    {form.image_url ? (
                                        <div className="aspect-video w-full rounded-xl overflow-hidden border">
                                            <img src={String(form.image_url)} alt="Cover" className="h-full w-full object-cover" />
                                        </div>
                                    ) : null}
                                    <div
                                        className="tnl-prose editorial-prose max-w-none pt-4"
                                        dangerouslySetInnerHTML={{
                                            __html: String(
                                                previewLang === "id" && form.body_id ? form.body_id : form.body || "<p>No content written yet.</p>"
                                            ),
                                        }}
                                    />
                                </article>
                            ) : resource === "events" ? (
                                <div className="space-y-4">
                                    <div className="text-xs uppercase font-mono tracking-wider text-[var(--tnl-muted)]">Event Preview</div>
                                    <h1 className="tnl-h2 text-2xl font-bold">
                                        {String(previewLang === "id" && form.title_id ? form.title_id : form.title || "Untitled Event")}
                                    </h1>
                                    {form.cover_image ? (
                                        <div className="aspect-video w-full rounded-xl overflow-hidden border">
                                            <img src={String(form.cover_image)} alt="Event Cover" className="h-full w-full object-cover" />
                                        </div>
                                    ) : null}
                                    <p className="text-sm leading-relaxed text-[var(--tnl-body)]">
                                        {String(previewLang === "id" && form.description_id ? form.description_id : form.description || "")}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="text-xs uppercase font-mono tracking-wider text-[var(--tnl-muted)]">{spec.label} Preview</div>
                                    <h1 className="tnl-h2 text-2xl font-bold">{title}</h1>
                                    <p className="text-sm leading-relaxed text-[var(--tnl-body)]">
                                        {String(previewLang === "id" && form.description_id ? form.description_id : form.description || "Previewing content.")}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
