// Generic content manager: one screen serves every content type. Fields are
// declared per resource so admins see plain-language labels, not raw JSON.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Download, Link2, Plus, Save, X } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { AdminHeader, ConfirmButton, IssueList, Panel, StatusPill, adminError, issuesFromError } from "@/pages/admin/AdminUI";
import { Spinner } from "@/components/site/Primitives";
import type { ListResponse, Member, QualityIssue } from "@/lib/types";

type FieldType = "text" | "textarea" | "html" | "number" | "select" | "checkbox" | "tags" | "date" | "json" | "member_multiselect";

interface FieldSpec {
    key: string;
    label: string;
    type: FieldType;
    help?: string;
    options?: string[];
    group?: string;
}

interface ResourceSpec {
    label: string;
    help: string;
    titleField: string;
    publishField: "status" | "published";
    fields: FieldSpec[];
}

const BILINGUAL = (key: string, label: string, type: FieldType = "text", help?: string): FieldSpec[] => [
    { key, label: `${label} (English)`, type, help },
    { key: `${key}_id`, label: `${label} (Bahasa Indonesia)`, type },
];

export const RESOURCE_SPECS: Record<string, ResourceSpec> = {
    posts: {
        label: "News",
        help: "Announcements and activity reports. Fill in both languages so the language switch works.",
        titleField: "title",
        publishField: "status",
        fields: [
            ...BILINGUAL("title", "Title"),
            ...BILINGUAL("excerpt", "Short summary", "textarea", "One or two sentences shown on the news cards."),
            ...BILINGUAL("body", "Article body", "html", "Basic formatting is allowed; anything unsafe is removed automatically."),
            { key: "category", label: "Category", type: "select", options: ["Announcement", "Activity Report", "Research", "Achievement", "Training"] },
            { key: "tags", label: "Tags", type: "tags", help: "Separate with commas." },
            { key: "cover_url", label: "Cover image link", type: "text", help: "Copy a link from the Media library." },
            { key: "cover_alt", label: "Cover image description", type: "text", help: "Required whenever there is a cover image." },
            { key: "author", label: "Written by", type: "text" },
            { key: "status", label: "Status", type: "select", options: ["draft", "published"] },
        ],
    },
    members: {
        label: "Members",
        help: "Lecturers, researchers and the assistant team. Personal details stay private unless you allow them.",
        titleField: "name",
        publishField: "published",
        fields: [
            { key: "name", label: "Full name with titles", type: "text" },
            { key: "role", label: "Kind of member", type: "select", options: ["lecturer", "researcher", "assistant"] },
            { key: "position", label: "Position", type: "select", options: ["coordinator", "head", "vice", "staff", "member"] },
            { key: "position_label", label: "Position as written", type: "text", help: "For example “Head of Practicum”." },
            { key: "division", label: "Division", type: "select", options: ["BPH", "Academic", "Research", "Social", "Internal", "External"] },
            { key: "batch", label: "Batch", type: "text", help: "For example 2026/2027. Assistants only." },
            ...BILINGUAL("bio", "Short biography", "textarea"),
            ...BILINGUAL("quote", "Quote", "textarea", "Shown on the Head of Laboratory banner."),
            { key: "email_public", label: "Public email", type: "text" },
            { key: "photo_url", label: "Photo link", type: "text" },
            { key: "photo_alt", label: "Photo description", type: "text" },
            { key: "expertise", label: "Areas of expertise", type: "tags" },
            { key: "social", label: "Profile links", type: "json", help: 'For example: {"scholar": "https://scholar.google.com/...", "linkedin": "https://linkedin.com/in/...", "instagram": "https://instagram.com/..."}' },
            { key: "projects", label: "Research Projects", type: "json", help: 'List of research projects. Example: [{"title": "...", "year": "2024", "funding": "BOPTN ITS", "description": "..."}]' },
            { key: "is_head", label: "This person is the Head of Laboratory", type: "checkbox" },
            { key: "status", label: "Active or alumni", type: "select", options: ["active", "alumni"] },
            { key: "nim", label: "NIM / NRP (private)", type: "text" },
            { key: "show_nim", label: "Show NIM/NRP publicly", type: "checkbox" },
            { key: "email_personal", label: "Personal email (private)", type: "text" },
            { key: "show_personal_email", label: "Show personal email publicly", type: "checkbox" },
            { key: "order", label: "Display order", type: "number" },
            { key: "published", label: "Visible on the website", type: "checkbox" },
        ],
    },
    events: {
        label: "Events & Programs",
        help: "Training, recruitment and workshops. Set the dates, media carousel, spreadsheet webhook, and the registration form here.",
        titleField: "title",
        publishField: "status",
        fields: [
            ...BILINGUAL("title", "Title"),
            { key: "type", label: "Kind", type: "select", options: ["training", "recruitment", "workshop", "practicum", "social", "open_house"] },
            ...BILINGUAL("description", "Description", "textarea"),
            { key: "cover_image", label: "Cover image URL", type: "text", help: "Main banner or poster image." },
            { key: "poster_urls", label: "Poster links", type: "tags", help: "Separate with commas; several posters become a carousel." },
            { key: "gallery_images", label: "Gallery image links", type: "tags", help: "Separate with commas; carousel images for event & open house." },
            { key: "spreadsheet_webhook_url", label: "Google Spreadsheet Webhook URL", type: "text", help: "Google Apps Script Web App URL to auto-sync registrations." },
            { key: "whatsapp_group_url", label: "Link Grup WhatsApp Pasca-Registrasi", type: "text", help: "Tautan undangan grup WhatsApp resmi (https://chat.whatsapp.com/...) yang hanya muncul di layar sukses dan email setelah pendaftaran berhasil." },
            { key: "start_date", label: "Starts on", type: "date" },
            { key: "end_date", label: "Ends on", type: "date" },
            { key: "reg_open_date", label: "Registration opens", type: "date" },
            { key: "reg_close_date", label: "Registration closes", type: "date", help: "After this date the Register button closes itself. Kosongkan agar pendaftaran ditutup otomatis berdasarkan kuota saja." },
            { key: "capacity", label: "Capacity", type: "number", help: "0 means no limit. Once full, registration automatically locks." },
            { key: "price", label: "Fee in rupiah", type: "number", help: "0 means free." },
            ...BILINGUAL("location", "Location"),
            { key: "modules", label: "Modules", type: "json", help: 'For example: [{"title": "Introduction", "title_id": "Pengenalan", "detail": "…"}]' },
            { key: "contacts", label: "Contact people", type: "json", help: 'For example: [{"name": "Training Division", "phone": "+628…"}]' },
            { key: "form_fields", label: "Registration form", type: "json", help: 'For example: [{"type": "text", "label": "Full name", "required": true, "options": []}]' },
            { key: "documentation", label: "Documentation photos", type: "json", help: 'For example: [{"url": "…", "alt": "…"}]' },
            { key: "status", label: "Status", type: "select", options: ["draft", "published"] },
        ],
    },
    activities: {
        label: "Activities",
        help: "The assistant team's recurring activities, shown as alternating rows.",
        titleField: "title",
        publishField: "published",
        fields: [
            ...BILINGUAL("title", "Title"),
            { key: "category", label: "Category", type: "select", options: ["social", "internal", "academic"] },
            ...BILINGUAL("description", "Description", "textarea"),
            { key: "date", label: "Date", type: "date" },
            { key: "cover_image", label: "Cover image URL", type: "text", help: "Main banner image." },
            { key: "gallery_images", label: "Gallery image links", type: "tags", help: "Separate with commas; carousel images for this activity." },
            { key: "images", label: "Photos (JSON)", type: "json", help: 'For example: [{"url": "…", "alt": "…"}]' },
            { key: "order", label: "Display order", type: "number" },
            { key: "published", label: "Visible on the website", type: "checkbox" },
        ],
    },
    projects: {
        label: "Projects",
        help: "Research and community projects. Statistics and funding claims must be verified before publishing.",
        titleField: "title",
        publishField: "status",
        fields: [
            { key: "kind", label: "Kind", type: "select", options: ["rd", "social"] },
            ...BILINGUAL("title", "Title"),
            ...BILINGUAL("description", "Description", "textarea"),
            { key: "background", label: "Background", type: "textarea" },
            { key: "cluster", label: "Research cluster", type: "text" },
            { key: "focus", label: "Focus technology", type: "text" },
            { key: "year", label: "Year", type: "text" },
            { key: "location", label: "Location", type: "text" },
            { key: "participants", label: "Participants", type: "text" },
            { key: "tags", label: "Tags", type: "tags" },
            { key: "modules", label: "Modules", type: "json" },
            { key: "impact", label: "Impact", type: "json" },
            { key: "images", label: "Photos", type: "json" },
            { key: "is_testbed", label: "This is a testbed", type: "checkbox" },
            { key: "verified", label: "Details verified", type: "checkbox", help: "Tick only once someone has checked the facts." },
            { key: "verified_by", label: "Verified by (role)", type: "text" },
            { key: "verified_date", label: "Verified on", type: "date" },
            { key: "status", label: "Status", type: "select", options: ["draft", "published"] },
        ],
    },
    publications: {
        label: "Publications",
        help: "Journal articles and conference papers from the laboratory.",
        titleField: "title",
        publishField: "status",
        fields: [
            { key: "title", label: "Title", type: "text" },
            { key: "authors", label: "Authors", type: "text" },
            { key: "linked_member_ids", label: "Linked Lab Members (Co-Authors)", type: "member_multiselect", help: "Select TNL lecturers, researchers, or assistants who are co-authors." },
            { key: "venue", label: "Journal or conference", type: "text" },
            { key: "year", label: "Year", type: "number" },
            { key: "ptype", label: "Kind", type: "select", options: ["journal", "conference", "book", "other"] },
            { key: "doi", label: "DOI", type: "text" },
            { key: "url", label: "Link", type: "text" },
            { key: "abstract", label: "Abstract", type: "textarea" },
            { key: "tags", label: "Tags", type: "tags" },
            { key: "status", label: "Status", type: "select", options: ["draft", "published"] },
        ],
    },
    partners: {
        label: "Partners",
        help: "Organisations shown in the partner strip.",
        titleField: "name",
        publishField: "published",
        fields: [
            { key: "name", label: "Name", type: "text" },
            { key: "url", label: "Website", type: "text" },
            { key: "logo_url", label: "Logo link", type: "text" },
            { key: "order", label: "Display order", type: "number" },
            { key: "published", label: "Visible on the website", type: "checkbox" },
        ],
    },
    practicum: {
        label: "Practicum",
        help: "The laboratory practicum modules students follow, with downloadable resources and shift schedules.",
        titleField: "name",
        publishField: "published",
        fields: [
            { key: "code", label: "Module code", type: "text" },
            ...BILINGUAL("name", "Module name"),
            ...BILINGUAL("description", "Description", "textarea"),
            { key: "semester", label: "Semester", type: "text" },
            { key: "cover_image", label: "Cover image URL", type: "text", help: "Preview image for practicum card (e.g. /api/media-files/illustrative/...)." },
            { key: "gallery_images", label: "Gallery image links", type: "tags", help: "Separate with commas; carousel images for this practicum module." },
            {
                key: "resources",
                label: "Downloadable Resources (PDF/PKT/PY/ZIP)",
                type: "json",
                help: 'List of files. For example: [{"title": "Modul 01: Subnetting Guide (PDF)", "file_url": "/api/media-files/academic/modul-01.pdf", "file_type": "pdf"}]',
            },
            {
                key: "shifts",
                label: "Shift Schedules (B-301)",
                type: "json",
                help: 'Shift timeslots and PIC assistants. For example: [{"day": "Senin", "time_slot": "08:00 - 10:00 WIB", "coordinator_name": "Daffa & Fathur", "quota": 24, "room": "Ruang B-301", "notes": "Shift A"}]',
            },
            { key: "order", label: "Display order", type: "number" },
            { key: "published", label: "Visible on the website", type: "checkbox" },
        ],
    },
    equipment: {
        label: "Lab Equipment",
        help: "Hardware, server clusters, SDRs and testing equipment in Room B-301.",
        titleField: "name",
        publishField: "published",
        fields: [
            ...BILINGUAL("name", "Equipment name"),
            {
                key: "category",
                label: "Category",
                type: "select",
                options: ["server", "sdr", "networking", "optical", "test_tool", "other"],
            },
            ...BILINGUAL("specs", "Technical specifications", "textarea", "Detailed hardware specs, RF coverage, ports, software integrations."),
            { key: "photo_url", label: "Photo link", type: "text", help: "Upload or select from Media library." },
            { key: "photo_alt", label: "Photo description", type: "text" },
            { key: "gallery_images", label: "Gallery image links", type: "tags", help: "Separate with commas; carousel images for this equipment." },
            { key: "quantity", label: "Quantity", type: "number" },
            { key: "location", label: "Location", type: "text", help: "For example: Ruang B-301 (Server Rack 1)." },
            {
                key: "status",
                label: "Operating status",
                type: "select",
                options: ["available", "in_use", "maintenance"],
            },
            { key: "serial_number", label: "Serial number (Internal / Private)", type: "text", help: "Hidden from public view." },
            { key: "asset_code", label: "ITS Asset Code (Internal / Private)", type: "text", help: "Hidden from public view." },
            { key: "internal_notes", label: "Internal maintainer notes (Private)", type: "textarea", help: "Hidden from public view." },
            { key: "order", label: "Display order", type: "number" },
            { key: "published", label: "Visible on the website", type: "checkbox" },
        ],
    },
};

type Row = Record<string, unknown> & { id: string; issues?: QualityIssue[]; needs_review?: boolean };

function emptyDraft(spec: ResourceSpec): Record<string, unknown> {
    const draft: Record<string, unknown> = {};
    for (const field of spec.fields) {
        if (field.type === "checkbox") draft[field.key] = field.key === "published";
        else if (field.type === "number") draft[field.key] = 0;
        else if (field.type === "tags") draft[field.key] = "";
        else if (field.type === "json") draft[field.key] = "";
        else if (field.type === "select") draft[field.key] = field.options?.[0] ?? "";
        else draft[field.key] = "";
    }
    return draft;
}

function toForm(row: Row, spec: ResourceSpec): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of spec.fields) {
        const value = row[field.key];
        if (field.type === "tags") out[field.key] = Array.isArray(value) ? value.join(", ") : (value ?? "");
        else if (field.type === "json") out[field.key] = value ? JSON.stringify(value, null, 2) : "";
        else if (field.type === "checkbox") out[field.key] = Boolean(value);
        else if (field.type === "number") out[field.key] = typeof value === "number" ? value : 0;
        else out[field.key] = value ?? "";
    }
    return out;
}

function toPayload(form: Record<string, unknown>, spec: ResourceSpec): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of spec.fields) {
        const value = form[field.key];
        if (field.type === "tags") {
            const text = String(value ?? "").trim();
            out[field.key] = text ? text.split(",").map((s) => s.trim()).filter(Boolean) : [];
        } else if (field.type === "json") {
            const text = String(value ?? "").trim();
            if (!text) continue;
            try {
                out[field.key] = JSON.parse(text);
            } catch {
                throw new Error(`“${field.label}” is not valid. Check the brackets and commas.`);
            }
        } else if (field.type === "checkbox") {
            out[field.key] = Boolean(value);
        } else if (field.type === "number") {
            out[field.key] = Number(value) || 0;
        } else {
            out[field.key] = value ?? "";
        }
    }
    return out;
}

export default function ContentManager() {
    const { resource = "posts" } = useParams<{ resource: string }>();
    const spec = RESOURCE_SPECS[resource];
    const qc = useQueryClient();
    const [params, setParams] = useSearchParams();
    const [search, setSearch] = useState("");
    const [editing, setEditing] = useState<Row | "new" | null>(null);
    const [form, setForm] = useState<Record<string, unknown>>({});
    const [issues, setIssues] = useState<QualityIssue[]>([]);
    const [selected, setSelected] = useState<string[]>([]);

    const { data: membersList } = useQuery({
        queryKey: ["admin", "members-lookup"],
        queryFn: () => apiGet<Member[]>("/public/members"),
        retry: false,
    });

    const relinkMutation = useMutation({
        mutationFn: () => apiPost<{ ok: boolean; updated: number; total_with_links: number; total: number }>("/admin/publications/relink-authors"),
        onSuccess: (res) => {
            invalidate();
            toast.success(`Matched & updated ${res.updated} publication(s). Total with links: ${res.total_with_links}`);
        },
        onError: (err) => toast.error(adminError(err, "Could not relink authors.")),
    });

    const { data, isLoading } = useQuery({
        queryKey: ["admin", "content", resource, search],
        queryFn: () => apiGet<ListResponse<Row>>(`/admin/content/${resource}?limit=200${search ? `&q=${encodeURIComponent(search)}` : ""}`),
        retry: false,
        enabled: Boolean(spec),
    });

    const rows = useMemo(() => data?.items ?? [], [data]);
    const editId = params.get("edit");

    useEffect(() => {
        if (editId && rows.length) {
            const row = rows.find((r) => r.id === editId);
            if (row && spec) {
                setEditing(row);
                setForm(toForm(row, spec));
                setIssues((row.issues as QualityIssue[]) ?? []);
            }
        }
    }, [editId, rows, spec]);

    const invalidate = () => {
        void qc.invalidateQueries({ queryKey: ["admin", "content", resource] });
        void qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
        void qc.invalidateQueries({ queryKey: ["admin", "review-queue"] });
        void qc.invalidateQueries({ queryKey: ["public"] });
    };

    const saveMutation = useMutation({
        mutationFn: async (payload: Record<string, unknown>) => {
            if (editing && editing !== "new") return apiPut<Row>(`/admin/content/${resource}/${editing.id}`, payload);
            return apiPost<Row>(`/admin/content/${resource}`, payload);
        },
        onSuccess: (row) => {
            toast.success("Saved.");
            setIssues((row.issues as QualityIssue[]) ?? []);
            setEditing(row);
            setForm(toForm(row, spec!));
            invalidate();
        },
        onError: (err) => {
            const found = issuesFromError(err);
            if (found.length) setIssues(found);
            toast.error(adminError(err, "Could not save. Please check the fields."));
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/admin/content/${resource}/${id}`),
        onSuccess: (_res, id) => {
            invalidate();
            toast.success("Deleted.", {
                action: {
                    label: "Undo",
                    onClick: () => {
                        void apiPost(`/admin/content/${resource}/${id}/undo-delete`)
                            .then(() => {
                                invalidate();
                                toast.success("Restored.");
                            })
                            .catch((e) => toast.error(adminError(e, "Could not restore the item.")));
                    },
                },
            });
        },
        onError: (err) => toast.error(adminError(err, "Could not delete this item.")),
    });

    const bulkMutation = useMutation({
        mutationFn: (action: string) => apiPost<{ updated: number; skipped: { title: string; reason: string }[] }>(`/admin/content/${resource}/bulk`, { ids: selected, action }),
        onSuccess: (res) => {
            invalidate();
            setSelected([]);
            toast.success(`${res.updated} item(s) updated.`);
            for (const skip of res.skipped ?? []) toast.error(`${skip.title}: ${skip.reason}`);
        },
        onError: (err) => toast.error(adminError(err, "Could not complete that action.")),
    });

    if (!spec) {
        return (
            <div data-testid="content-unknown">
                <AdminHeader title="Unknown content type" help="Pick a content type from the menu on the left." />
            </div>
        );
    }

    const startNew = () => {
        setEditing("new");
        setForm(emptyDraft(spec));
        setIssues([]);
        setParams({}, { replace: true });
    };

    const closeEditor = () => {
        setEditing(null);
        setIssues([]);
        setParams({}, { replace: true });
    };

    const submit = () => {
        try {
            saveMutation.mutate(toPayload(form, spec));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Please check the fields.");
        }
    };

    const grouped = spec.fields;

    return (
        <div data-testid={`content-manager-${resource}`}>
            <AdminHeader
                title={spec.label}
                help={spec.help}
                actions={
                    <>
                        {resource === "publications" ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => relinkMutation.mutate()}
                                    disabled={relinkMutation.isPending}
                                    className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm"
                                    data-testid="publications-relink-button"
                                    title="Auto-match author names in papers with TNL members"
                                >
                                    <Link2 className="h-4 w-4" aria-hidden="true" />
                                    {relinkMutation.isPending ? "Matching…" : "Re-link Authors"}
                                </button>
                                <Link
                                    to="/admin/publications/import"
                                    className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm"
                                    data-testid="publications-import-link"
                                >
                                    <Download className="h-4 w-4" aria-hidden="true" />
                                    Import from Crossref
                                </Link>
                            </>
                        ) : null}
                        <a
                            href={`/api/admin/content/${resource}/export/csv`}
                            className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm"
                            data-testid="content-export-button"
                        >
                            Export
                        </a>
                        <button type="button" onClick={startNew} className="tnl-btn tnl-btn-primary h-10 min-h-[40px] text-sm" data-testid="content-add-button">
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Add new
                        </button>
                    </>
                }
                testId={`content-header-${resource}`}
            />

            {editing ? (
                <Panel className="mb-6">
                    <div className="mb-4 flex items-center justify-between gap-4">
                        <h2 className="tnl-h5 text-[19px]">{editing === "new" ? `New ${spec.label.toLowerCase()}` : "Edit item"}</h2>
                        <button type="button" onClick={closeEditor} className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: "var(--tnl-border)" }} aria-label="Close editor" data-testid="content-editor-close">
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {issues.length ? (
                        <div className="mb-5">
                            <p className="mb-2 text-sm font-semibold">Content checks</p>
                            <IssueList issues={issues} testId="content-editor-issues" />
                        </div>
                    ) : null}

                    <div className="grid gap-4 lg:grid-cols-2">
                        {grouped.map((field) => {
                            const id = `field-${field.key}`;
                            const value = form[field.key];
                            const wide = field.type === "textarea" || field.type === "html" || field.type === "json" || field.type === "member_multiselect";
                            return (
                                <div key={field.key} className={wide ? "lg:col-span-2" : ""}>
                                    <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
                                        {field.label}
                                    </label>
                                    {field.type === "textarea" || field.type === "html" || field.type === "json" ? (
                                        <textarea
                                            id={id}
                                            className="tnl-field font-mono text-sm"
                                            rows={field.type === "json" ? 6 : 5}
                                            value={String(value ?? "")}
                                            onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                                            data-testid={`content-field-${field.key}`}
                                        />
                                    ) : field.type === "select" ? (
                                        <select
                                            id={id}
                                            className="tnl-field"
                                            value={String(value ?? "")}
                                            onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                                            data-testid={`content-field-${field.key}`}
                                        >
                                            {field.options?.map((opt) => (
                                                <option key={opt} value={opt}>
                                                    {opt}
                                                </option>
                                            ))}
                                        </select>
                                    ) : field.type === "checkbox" ? (
                                        <label className="flex h-[50px] items-center gap-3 text-sm">
                                            <input
                                                id={id}
                                                type="checkbox"
                                                className="h-5 w-5"
                                                checked={Boolean(value)}
                                                onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.checked }))}
                                                data-testid={`content-field-${field.key}`}
                                            />
                                            <span>{Boolean(value) ? "Yes" : "No"}</span>
                                        </label>
                                    ) : field.type === "member_multiselect" ? (
                                        <div id={id} className="rounded-lg border p-3" style={{ borderColor: "var(--tnl-border)" }} data-testid={`content-field-${field.key}`}>
                                            <p className="mb-2 text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                                                Select laboratory members who co-authored this publication:
                                            </p>
                                            <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                                                {(membersList ?? []).map((m) => {
                                                    const selectedIds = Array.isArray(value) ? (value as string[]) : [];
                                                    const checked = selectedIds.includes(m.id);
                                                    return (
                                                        <label key={m.id} className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1 text-xs hover:bg-[var(--tnl-surface)]">
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                onChange={(e) => {
                                                                    const next = e.target.checked
                                                                        ? [...selectedIds, m.id]
                                                                        : selectedIds.filter((x) => x !== m.id);
                                                                    setForm((f) => ({ ...f, [field.key]: next }));
                                                                }}
                                                                className="h-3.5 w-3.5 rounded"
                                                            />
                                                            <span className="font-medium">{m.name}</span>
                                                            <span className="rounded bg-[rgba(67,89,74,0.1)] px-1.5 py-0.5 text-[10px] text-[var(--tnl-green)]">
                                                                {m.role}{m.division ? ` · ${m.division}` : ""}
                                                            </span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        <input
                                            id={id}
                                            type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                                            className="tnl-field"
                                            value={String(value ?? "")}
                                            onChange={(e) =>
                                                setForm((f) => ({ ...f, [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value }))
                                            }
                                            data-testid={`content-field-${field.key}`}
                                        />
                                    )}
                                    {field.help ? (
                                        <p className="mt-1 text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                                            {field.help}
                                        </p>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                        <button type="button" onClick={submit} className="tnl-btn tnl-btn-primary" disabled={saveMutation.isPending} data-testid="content-save-button">
                            <Save className="h-4 w-4" aria-hidden="true" />
                            {saveMutation.isPending ? "Saving…" : "Save"}
                        </button>
                        <button type="button" onClick={closeEditor} className="tnl-btn tnl-btn-outline" data-testid="content-cancel-button">
                            Cancel
                        </button>
                    </div>
                </Panel>
            ) : null}

            <div className="mb-4 flex flex-wrap items-center gap-3">
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={`Search ${spec.label.toLowerCase()}…`}
                    className="tnl-field sm:max-w-sm"
                    aria-label="Search"
                    data-testid="content-search-input"
                />
                {selected.length ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm" style={{ color: "var(--tnl-tan-text)" }}>
                            {selected.length} selected
                        </span>
                        <button type="button" onClick={() => bulkMutation.mutate("publish")} className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm" data-testid="bulk-publish-button">
                            Publish
                        </button>
                        <button type="button" onClick={() => bulkMutation.mutate("unpublish")} className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm" data-testid="bulk-unpublish-button">
                            Unpublish
                        </button>
                        <ConfirmButton
                            label="Delete"
                            confirmLabel="Delete them"
                            question={`Delete ${selected.length} item(s)?`}
                            onConfirm={() => bulkMutation.mutate("delete")}
                            testId="bulk-delete-button"
                        />
                    </div>
                ) : null}
            </div>

            {isLoading ? (
                <Spinner label="Loading…" />
            ) : rows.length === 0 ? (
                <Panel>
                    <p className="text-sm text-[var(--tnl-body)]" data-testid="content-empty">
                        Nothing here yet. Click “Add new” to create the first one.
                    </p>
                </Panel>
            ) : (
                <Panel className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="content-table">
                        <thead>
                            <tr className="text-left" style={{ color: "var(--tnl-tan-text)" }}>
                                <th className="pb-2 pr-3 font-semibold">
                                    <input
                                        type="checkbox"
                                        aria-label="Select all"
                                        checked={selected.length === rows.length && rows.length > 0}
                                        onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])}
                                        data-testid="content-select-all"
                                    />
                                </th>
                                <th className="pb-2 pr-4 font-semibold">Title</th>
                                <th className="pb-2 pr-4 font-semibold">Status</th>
                                <th className="pb-2 font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => {
                                const published =
                                    spec.publishField === "published" ? Boolean(row.published) : row.status === "published";
                                return (
                                    <tr key={row.id} className="border-t" style={{ borderColor: "var(--tnl-border)" }} data-testid={`content-row-${row.id}`}>
                                        <td className="py-3 pr-3">
                                            <input
                                                type="checkbox"
                                                aria-label={`Select ${String(row[spec.titleField] ?? "")}`}
                                                checked={selected.includes(row.id)}
                                                onChange={(e) =>
                                                    setSelected((s) => (e.target.checked ? [...s, row.id] : s.filter((x) => x !== row.id)))
                                                }
                                                data-testid={`content-select-${row.id}`}
                                            />
                                        </td>
                                        <td className="py-3 pr-4">
                                            <span className="font-medium">{String(row[spec.titleField] ?? "(untitled)")}</span>
                                            {row.needs_review ? (
                                                <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "#fef3c7", color: "#92400e" }}>
                                                    Needs review
                                                </span>
                                            ) : null}
                                        </td>
                                        <td className="py-3 pr-4">
                                            <StatusPill published={published} testId={`content-status-${row.id}`} />
                                        </td>
                                        <td className="py-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditing(row);
                                                        setForm(toForm(row, spec));
                                                        setIssues((row.issues as QualityIssue[]) ?? []);
                                                        window.scrollTo({ top: 0, behavior: "smooth" });
                                                    }}
                                                    className="rounded-[6px] border px-3 py-1.5 text-xs font-medium"
                                                    style={{ borderColor: "var(--tnl-border)" }}
                                                    data-testid={`content-edit-${row.id}`}
                                                >
                                                    Edit
                                                </button>
                                                <ConfirmButton
                                                    label="Delete"
                                                    confirmLabel="Delete it"
                                                    question="Delete this item?"
                                                    onConfirm={() => deleteMutation.mutate(row.id)}
                                                    testId={`content-delete-${row.id}`}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </Panel>
            )}
        </div>
    );
}
