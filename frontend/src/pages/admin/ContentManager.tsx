// Generic content manager — LIST VIEW ONLY. One screen serves every content
// type. Fields are declared per resource so admins see plain-language labels,
// not raw JSON. The dedicated create/edit form lives in ContentEditor.tsx and
// is mounted on its own routes (/new and /:id).

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Download, Link2, Plus, Search } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/api";
import { useAdminT } from "@/lib/i18n/admin-i18n";
import { AdminErrorBanner, AdminHeader, AdminLoadMore, ConfirmButton, Panel, StatusPill, adminError } from "@/pages/admin/AdminUI";
import { Spinner } from "@/components/site/Primitives";
import { MEMBER_SOCIAL_PRESETS, type RepeaterFieldSpec, type PresetKeyConfig } from "@/components/admin/repeaters";
import type { ListResponse, QualityIssue } from "@/lib/types/types";

export type FieldType =
    | "text"
    | "textarea"
    | "html"
    | "number"
    | "select"
    | "checkbox"
    | "tags"
    | "date"
    | "json"
    | "key_value"
    | "repeater"
    | "form_fields"
    | "member_multiselect"
    | "media"
    | "media_list";

export interface FieldSpec {
    key: string;
    label: string;
    type: FieldType;
    help?: string;
    placeholder?: string;
    options?: string[];
    group?: string;
    folder?: string;
    aspect?: "square" | "video" | "auto";
    accept?: "image" | "document" | "all";
    presetKeys?: PresetKeyConfig[];
    repeaterFields?: RepeaterFieldSpec[];
    itemTitleField?: string;
    itemSubtitleField?: string;
    emptyMessage?: string;
    addButtonLabel?: string;
}

export interface ResourceSpec {
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

const EVENT_MODULE_FIELDS: RepeaterFieldSpec[] = [
    { key: "title", label: "Title (English)", type: "text", placeholder: "e.g. Introduction to Packet Tracer" },
    { key: "title_id", label: "Title (Bahasa Indonesia)", type: "text", placeholder: "e.g. Pengenalan Cisco Packet Tracer" },
    { key: "detail", label: "Detail (English)", type: "textarea", placeholder: "Syllabus topic details..." },
    { key: "detail_id", label: "Detail (Bahasa Indonesia)", type: "textarea", placeholder: "Rincian silabus..." },
    { key: "date", label: "Date (YYYY-MM-DD)", type: "text", placeholder: "e.g. 2026-11-28", width: "half" },
];

const EVENT_CONTACT_FIELDS: RepeaterFieldSpec[] = [
    { key: "name", label: "Name / Division", type: "text", placeholder: "e.g. Training Division, TNL" },
    { key: "email", label: "Email", type: "text", placeholder: "e.g. telconnetlab@gmail.com", width: "half" },
    { key: "phone", label: "Phone / WhatsApp", type: "text", placeholder: "e.g. +628****7890", width: "half" },
];

const MEDIA_ITEM_FIELDS: RepeaterFieldSpec[] = [
    { key: "url", label: "Photo / Asset", type: "media", folder: "events", aspect: "video" },
    { key: "alt", label: "Description / Alt text", type: "text", placeholder: "Short description of photo" },
];

const MEMBER_PROJECT_FIELDS: RepeaterFieldSpec[] = [
    { key: "title", label: "Project Title (English)", type: "text" },
    { key: "title_id", label: "Project Title (Bahasa Indonesia)", type: "text" },
    { key: "year", label: "Year", type: "text", placeholder: "e.g. 2025", width: "half" },
    { key: "role", label: "Role (English)", type: "text", placeholder: "e.g. Principal Investigator", width: "half" },
    { key: "role_id", label: "Role (Bahasa Indonesia)", type: "text", placeholder: "e.g. Ketua Peneliti", width: "half" },
    { key: "description", label: "Description (English)", type: "textarea" },
    { key: "description_id", label: "Description (Bahasa Indonesia)", type: "textarea" },
];

const PRACTICUM_RESOURCE_FIELDS: RepeaterFieldSpec[] = [
    { key: "title", label: "Resource Title", type: "text", placeholder: "e.g. Modul 01: Subnetting Guide (PDF)" },
    { key: "file_url", label: "File Attachment", type: "media", folder: "academic", accept: "all" },
    { key: "file_type", label: "File Format", type: "select", options: ["pdf", "pkt", "py", "zip", "docx", "other"], width: "half" },
];

const PRACTICUM_SHIFT_FIELDS: RepeaterFieldSpec[] = [
    { key: "day", label: "Day", type: "select", options: ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"], width: "half" },
    { key: "time_slot", label: "Time Slot", type: "text", placeholder: "e.g. 08:00 - 10:00 WIB", width: "half" },
    { key: "coordinator_name", label: "PIC / Assistant in Charge", type: "text", placeholder: "e.g. Daffa & Fathur" },
    { key: "quota", label: "Quota", type: "number", width: "half", defaultValue: 20 },
    { key: "room", label: "Room", type: "text", placeholder: "Ruang B-301", width: "half", defaultValue: "Ruang B-301" },
    { key: "notes", label: "Notes", type: "text", placeholder: "e.g. Shift A / B" },
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
            { key: "cover_url", label: "Cover image", type: "media", folder: "posts", aspect: "video", help: "Upload or pick cover photo for news article." },
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
            { key: "photo_url", label: "Photo", type: "media", folder: "members", aspect: "square", help: "Profile photo of member or assistant." },
            { key: "photo_alt", label: "Photo description", type: "text" },
            { key: "expertise", label: "Areas of expertise", type: "tags", help: "Type and press Enter or comma." },
            { key: "social", label: "Profile links & Socials", type: "key_value", presetKeys: MEMBER_SOCIAL_PRESETS, help: "Add LinkedIn, Google Scholar, Scopus, SINTA, Instagram, GitHub, Website, etc." },
            { key: "projects", label: "Research Projects", type: "repeater", repeaterFields: MEMBER_PROJECT_FIELDS, itemTitleField: "title", itemSubtitleField: "year", addButtonLabel: "+ Add Research Project", emptyMessage: "No research projects listed." },
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
        help: "Training, recruitment and workshops. Set the dates, media carousel, and the registration form here.",
        titleField: "title",
        publishField: "status",
        fields: [
            ...BILINGUAL("title", "Title"),
            { key: "type", label: "Kind", type: "select", options: ["training", "recruitment", "workshop", "practicum", "social", "open_house"] },
            ...BILINGUAL("description", "Description", "textarea"),
            { key: "cover_image", label: "Cover image", type: "media", folder: "events", aspect: "video", help: "Main banner or poster image." },
            { key: "poster_urls", label: "Poster links", type: "media_list", folder: "events", help: "Several posters become a carousel." },
            { key: "gallery_images", label: "Gallery image links", type: "media_list", folder: "events", help: "Carousel images for event & open house." },
            { key: "whatsapp_group_url", label: "Link Grup WhatsApp Pasca-Registrasi", type: "text", help: "Tautan undangan grup WhatsApp resmi (https://chat.whatsapp.com/...) yang hanya muncul di layar sukses dan email setelah pendaftaran berhasil." },
            { key: "start_date", label: "Starts on", type: "date" },
            { key: "end_date", label: "Ends on", type: "date" },
            { key: "reg_open_date", label: "Registration opens", type: "date" },
            { key: "reg_close_date", label: "Registration closes", type: "date", help: "After this date the Register button closes itself. Kosongkan agar pendaftaran ditutup otomatis berdasarkan kuota saja." },
            { key: "capacity", label: "Capacity", type: "number", help: "0 means no limit. Once full, registration automatically locks." },
            { key: "price", label: "Fee in rupiah", type: "number", help: "0 means free." },
            ...BILINGUAL("location", "Location"),
            { key: "modules", label: "Agenda & Modules", type: "repeater", repeaterFields: EVENT_MODULE_FIELDS, itemTitleField: "title", itemSubtitleField: "date", addButtonLabel: "+ Add Agenda / Module", emptyMessage: "No agenda or module items yet." },
            { key: "contacts", label: "Contact People", type: "repeater", repeaterFields: EVENT_CONTACT_FIELDS, itemTitleField: "name", itemSubtitleField: "phone", addButtonLabel: "+ Add Contact Person", emptyMessage: "No contact people listed." },
            { key: "form_fields", label: "Registration Form", type: "form_fields", help: "Visual builder for registration questions. Real-time preview available." },
            { key: "documentation", label: "Documentation Photos", type: "repeater", repeaterFields: MEDIA_ITEM_FIELDS, itemTitleField: "alt", addButtonLabel: "+ Add Photo", folder: "events", emptyMessage: "No documentation photos added." },
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
            { key: "cover_image", label: "Cover image", type: "media", folder: "events", aspect: "video", help: "Main banner image." },
            { key: "gallery_images", label: "Gallery image links", type: "media_list", folder: "events", help: "Carousel images for this activity." },
            { key: "images", label: "Activity Photos", type: "repeater", repeaterFields: MEDIA_ITEM_FIELDS, itemTitleField: "alt", addButtonLabel: "+ Add Photo", folder: "events", emptyMessage: "No photos added." },
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
            { key: "tags", label: "Tags", type: "tags", help: "Type and press Enter or comma." },
            { key: "modules", label: "Modules", type: "repeater", repeaterFields: EVENT_MODULE_FIELDS, itemTitleField: "title", addButtonLabel: "+ Add Module", emptyMessage: "No project modules." },
            { key: "impact", label: "Impact & Milestones", type: "repeater", repeaterFields: EVENT_MODULE_FIELDS, itemTitleField: "title", addButtonLabel: "+ Add Milestone", emptyMessage: "No impact milestones." },
            { key: "images", label: "Project Photos", type: "repeater", repeaterFields: MEDIA_ITEM_FIELDS, itemTitleField: "alt", addButtonLabel: "+ Add Photo", folder: "general", emptyMessage: "No project photos." },
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
            { key: "tags", label: "Tags", type: "tags", help: "Type with commas." },
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
            { key: "logo_url", label: "Logo", type: "media", folder: "partners", aspect: "square", help: "Partner or institution logo." },
            { key: "order", label: "Display order", type: "number" },
            { key: "published", label: "Visible on the website", type: "checkbox" },
        ],
    },
    practicum: {
        label: "Training",
        help: "The laboratory training modules students follow, with downloadable resources and shift schedules.",
        titleField: "name",
        publishField: "published",
        fields: [
            { key: "code", label: "Module code", type: "text" },
            ...BILINGUAL("name", "Module name"),
            ...BILINGUAL("description", "Description", "textarea"),
            { key: "semester", label: "Semester", type: "text" },
            { key: "cover_image", label: "Cover image", type: "media", folder: "practicum", aspect: "video", help: "Preview image for practicum card." },
            { key: "gallery_images", label: "Gallery image links", type: "media_list", folder: "practicum", help: "Carousel images for this practicum module." },
            {
                key: "resources",
                label: "Downloadable Resources (PDF/PKT/PY/ZIP)",
                type: "repeater",
                repeaterFields: PRACTICUM_RESOURCE_FIELDS,
                itemTitleField: "title",
                itemSubtitleField: "file_type",
                addButtonLabel: "+ Add Resource File",
                folder: "academic",
                emptyMessage: "No downloadable resources added.",
            },
            {
                key: "shifts",
                label: "Shift Schedules (B-301)",
                type: "repeater",
                repeaterFields: PRACTICUM_SHIFT_FIELDS,
                itemTitleField: "day",
                itemSubtitleField: "time_slot",
                addButtonLabel: "+ Add Shift Schedule",
                emptyMessage: "No shift schedules configured.",
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
            { key: "photo_url", label: "Photo", type: "media", folder: "equipment", aspect: "video", help: "Photo of equipment in room B-301." },
            { key: "photo_alt", label: "Photo description", type: "text" },
            { key: "gallery_images", label: "Gallery image links", type: "media_list", folder: "equipment", help: "Carousel images for this equipment." },
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

export type Row = Record<string, unknown> & { id: string; issues?: QualityIssue[]; needs_review?: boolean };

export function emptyDraft(spec: ResourceSpec): Record<string, unknown> {
    const draft: Record<string, unknown> = {};
    for (const field of spec.fields) {
        if (field.type === "checkbox") draft[field.key] = field.key === "published";
        else if (field.type === "number") draft[field.key] = 0;
        else if (field.type === "tags") draft[field.key] = [];
        else if (field.type === "media_list") draft[field.key] = [];
        else if (field.type === "media") draft[field.key] = "";
        else if (field.type === "key_value") draft[field.key] = {};
        else if (field.type === "repeater" || field.type === "form_fields") draft[field.key] = [];
        else if (field.type === "json") draft[field.key] = "";
        else if (field.type === "select") draft[field.key] = field.options?.[0] ?? "";
        else draft[field.key] = "";
    }
    return draft;
}

export function toForm(row: Row, spec: ResourceSpec): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of spec.fields) {
        const value = row[field.key];
        if (field.type === "tags") {
            out[field.key] = Array.isArray(value) ? value : (typeof value === "string" ? value.split(",").map((s) => s.trim()).filter(Boolean) : []);
        } else if (field.type === "media_list") {
            out[field.key] = Array.isArray(value) ? value : (typeof value === "string" ? value.split(",").map((s) => s.trim()).filter(Boolean) : []);
        } else if (field.type === "media") {
            out[field.key] = String(value ?? "");
        } else if (field.type === "key_value") {
            out[field.key] = typeof value === "object" && value !== null ? value : {};
        } else if (field.type === "repeater" || field.type === "form_fields") {
            out[field.key] = Array.isArray(value) ? value : [];
        } else if (field.type === "json") {
            out[field.key] = value ? JSON.stringify(value, null, 2) : "";
        } else if (field.type === "checkbox") {
            out[field.key] = Boolean(value);
        } else if (field.type === "number") {
            out[field.key] = typeof value === "number" ? value : 0;
        } else {
            out[field.key] = value ?? "";
        }
    }
    return out;
}

export function toPayload(form: Record<string, unknown>, spec: ResourceSpec): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of spec.fields) {
        const value = form[field.key];
        if (field.type === "tags") {
            const list = Array.isArray(value)
                ? value
                : String(value ?? "")
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
            out[field.key] = list;
        } else if (field.type === "media_list") {
            const list = Array.isArray(value)
                ? value
                : typeof value === "string"
                ? value.split(",").map((s) => s.trim()).filter(Boolean)
                : [];
            out[field.key] = list;
        } else if (field.type === "media") {
            out[field.key] = String(value ?? "").trim();
        } else if (field.type === "key_value") {
            if (typeof value === "string") {
                const text = value.trim();
                out[field.key] = text ? JSON.parse(text) : {};
            } else if (typeof value === "object" && value !== null) {
                out[field.key] = value;
            } else {
                out[field.key] = {};
            }
        } else if (field.type === "repeater" || field.type === "form_fields") {
            if (typeof value === "string") {
                const text = value.trim();
                out[field.key] = text ? JSON.parse(text) : [];
            } else if (Array.isArray(value)) {
                out[field.key] = value;
            } else {
                out[field.key] = [];
            }
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

// Collections that carry a cover/photo for the 36×36 thumbnail column.
const PHOTO_KEYS = ["photo_url", "cover_url", "cover_image", "logo_url"];

type StatusTab = "all" | "published" | "draft";

// Backend caps a single content page at 200 rows; request smaller pages so the
// list can grow as the admin asks for more instead of silently truncating.
const CONTENT_PAGE_SIZE = 50;

export default function ContentManager() {
    const { resource = "posts" } = useParams<{ resource: string }>();
    const spec = RESOURCE_SPECS[resource];
    const t = useAdminT();
    const qc = useQueryClient();
    const [params] = useSearchParams();
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [tab, setTab] = useState<StatusTab>("all");
    const [selected, setSelected] = useState<string[]>([]);
    const [offset, setOffset] = useState(0);
    const [accumulated, setAccumulated] = useState<Row[]>([]);

    const relinkMutation = useMutation({
        mutationFn: () => apiPost<{ ok: boolean; updated: number; total_with_links: number; total: number }>("/admin/publications/relink-authors"),
        onSuccess: (res) => {
            invalidate();
            toast.success(`Matched & updated ${res.updated} publication(s). Total with links: ${res.total_with_links}`);
        },
        onError: (err) => toast.error(adminError(err, "Could not relink authors.")),
    });

    const { data, isLoading, error, isFetching, refetch } = useQuery({
        queryKey: ["admin", "content", resource, search, offset],
        queryFn: () => apiGet<ListResponse<Row>>(
            `/admin/content/${resource}?limit=${CONTENT_PAGE_SIZE}&offset=${offset}${search ? `&q=${encodeURIComponent(search)}` : ""}`
        ),
        retry: false,
        enabled: Boolean(spec),
    });

    // Debounce the search input: typing must not fire one request per keystroke.
    useEffect(() => {
        const timer = setTimeout(() => setSearch(searchInput.trim()), 250);
        return () => clearTimeout(timer);
    }, [searchInput]);

    // Any filter switch invalidates the bulk selection and restarts pagination.
    useEffect(() => {
        setSelected([]);
        setOffset(0);
    }, [search, resource]);

    useEffect(() => {
        const page = data?.items ?? [];
        setAccumulated((prev) => {
            if (offset === 0) return page;
            const merged = new Map(prev.map((row) => [row.id, row]));
            for (const row of page) merged.set(row.id, row);
            return Array.from(merged.values());
        });
    }, [data, offset]);

    const rows = accumulated;
    const totalRows = data?.total ?? rows.length;

    const invalidate = () => {
        void qc.invalidateQueries({ queryKey: ["admin", "content", resource] });
        void qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
        void qc.invalidateQueries({ queryKey: ["admin", "review-queue"] });
        void qc.invalidateQueries({ queryKey: ["public"] });
    };

    const resetContentPages = () => {
        setAccumulated([]);
        setOffset(0);
    };

    const deleteMutation = useMutation({
        mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/admin/content/${resource}/${id}`),
        onSuccess: (_res, id) => {
            // Restart pagination so deletions and records that shift across pages
            // are reconciled from the API rather than stale accumulated rows.
            resetContentPages();
            setSelected((prev) => prev.filter((selectedId) => selectedId !== id));
            invalidate();
            toast.success("Deleted.", {
                action: {
                    label: "Undo",
                    onClick: () => {
                        void apiPost(`/admin/content/${resource}/${id}/undo-delete`)
                            .then(() => {
                                resetContentPages();
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

    const togglePublishMutation = useMutation({
        mutationFn: async ({ id, willPublish }: { id: string; willPublish: boolean }) => {
            const patch = spec!.publishField === "published"
                ? { published: willPublish }
                : { status: willPublish ? "published" : "draft" };
            return apiPut<Row>(`/admin/content/${resource}/${id}`, patch);
        },
        onSuccess: (_res, variables) => {
            resetContentPages();
            invalidate();
            toast.success(variables.willPublish ? "Published." : "Moved to draft / Hidden.");
        },
        onError: (err) => toast.error(adminError(err, "Could not update status.")),
    });

    const bulkMutation = useMutation({
        mutationFn: (action: string) => apiPost<{ updated: number; skipped: { title: string; reason: string }[] }>(`/admin/content/${resource}/bulk`, { ids: selected, action }),
        onSuccess: (res) => {
            resetContentPages();
            invalidate();
            setSelected([]);
            toast.success(`${res.updated} item(s) updated.`);
            for (const skip of res.skipped ?? []) toast.error(`${skip.title}: ${skip.reason}`);
        },
        onError: (err) => toast.error(adminError(err, "Could not complete that action.")),
    });

    // Backwards compatibility: the dashboard still deep-links to
    // /admin/content/:resource?edit=<id>. Forward it to the editor route.
    const legacyEditId = params.get("edit");
    if (spec && legacyEditId) {
        return <Navigate to={`/admin/content/${resource}/${legacyEditId}`} replace />;
    }

    if (!spec) {
        return (
            <div data-testid="content-unknown">
                <AdminHeader title="Unknown content type" help="Pick a content type from the menu on the left." />
            </div>
        );
    }

    const isPublished = (row: Row) =>
        spec.publishField === "published" ? Boolean(row.published) : row.status === "published";

    const publishedCount = rows.filter(isPublished).length;
    const draftCount = rows.length - publishedCount;

    const visibleRows = rows.filter((row) => {
        if (tab === "all") return true;
        if (tab === "published") return isPublished(row);
        return !isPublished(row);
    });

    const photoKey = PHOTO_KEYS.find((k) => spec.fields.some((f) => f.key === k));

    const metaFor = (row: Row): string => {
        const candidates = ["authors", "venue", "year", "position_label", "role", "division", "category", "type", "kind", "start_date", "date", "location", "code", "semester"];
        const parts = candidates
            .map((k) => row[k])
            .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
            .map((v) => String(v));
        return parts.slice(0, 3).join(" · ");
    };

    const tabs: { id: StatusTab; label: string; count: number }[] = [
        { id: "all", label: t("adminAll"), count: rows.length },
        { id: "published", label: t("adminPublished"), count: publishedCount },
        { id: "draft", label: t("adminDraft"), count: draftCount },
    ];

    const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((r) => selected.includes(r.id));

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
                                    {relinkMutation.isPending ? "Matching..." : "Re-link Authors"}
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
                        <Link
                            to={`/admin/content/${resource}/new`}
                            className="tnl-btn tnl-btn-primary h-10 min-h-[40px] text-sm"
                            data-testid="content-add-button"
                        >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Add new
                        </Link>
                    </>
                }
                testId={`content-header-${resource}`}
            />

            {/* One-row filter bar: status tabs + search + bulk actions */}
            <div className="mb-4 flex flex-wrap items-center gap-3" data-testid="content-filter-bar">
                <div
                    className="inline-flex items-center gap-1 rounded-[10px] border p-1"
                    style={{ borderColor: "var(--tnl-border)", background: "var(--tnl-surface)" }}
                >
                    {tabs.map((t) => {
                        const active = tab === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                    setTab(t.id);
                                    setSelected([]); // a hidden row must never survive a filter switch
                                }}
                                aria-pressed={active}
                                className="rounded-[8px] px-3 py-1.5 text-sm font-medium transition-colors"
                                style={active ? { background: "var(--tnl-green)", color: "#fff" } : { color: "var(--tnl-body)" }}
                                data-testid={`content-tab-${t.id}`}
                            >
                                {t.label} ({t.count})
                            </button>
                        );
                    })}
                </div>

                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--tnl-body)]" aria-hidden="true" />
                    <input
                        type="search"
                        value={searchInput}
                        onChange={(e) => {
                            setSearchInput(e.target.value);
                            setSelected([]);
                        }}
                        placeholder={`${t("adminSearch")} ${resource.toLowerCase()}...`}
                        className="tnl-field pl-9 sm:w-72"
                        aria-label={t("adminSearch")}
                        data-testid="content-search-input"
                    />
                    {tab !== "all" || searchInput.trim() ? (
                        <button
                            type="button"
                            className="tnl-btn tnl-btn-outline h-10 min-h-[40px] text-sm"
                            data-testid="content-clear-filters"
                            onClick={() => {
                                setTab("all");
                                setSearchInput("");
                                setSelected([]);
                                setOffset(0);
                            }}
                        >
                            {t("adminClearFilters") ?? "Clear filters"}
                        </button>
                    ) : null}
                </div>

                {selected.length ? (
                    <div
                        className="flex flex-wrap items-center gap-2 rounded-[10px] border px-3 py-1.5"
                        style={{ borderColor: "var(--tnl-border)", background: "var(--tnl-surface)" }}
                        data-testid="content-bulk-bar"
                    >
                        <span className="text-sm" style={{ color: "var(--tnl-tan-text)" }}>
                            {selected.length} {t("adminSelected")}
                        </span>
                        <button type="button" onClick={() => bulkMutation.mutate("publish")} className="tnl-btn tnl-btn-outline h-9 min-h-[36px] text-sm" data-testid="bulk-publish-button">
                            {t("adminPublish")}
                        </button>
                        <button type="button" onClick={() => bulkMutation.mutate("unpublish")} className="tnl-btn tnl-btn-outline h-9 min-h-[36px] text-sm" data-testid="bulk-unpublish-button">
                            {t("adminUnpublish")}
                        </button>
                        <ConfirmButton
                            label={t("adminDelete")}
                            confirmLabel={t("adminDeleteThem")}
                            question={`${t("adminDelete")} ${selected.length} ${t("adminItems")}?`}
                            onConfirm={() => bulkMutation.mutate("delete")}
                            testId="bulk-delete-button"
                        />
                    </div>
                ) : null}
            </div>

            {error ? (
                <AdminErrorBanner
                    testId="content-list-error"
                    message={adminError(error, "Could not load this content. Please try again.")}
                    onRetry={() => void refetch()}
                />
            ) : isLoading ? (
                <Spinner label="Loading..." />
            ) : visibleRows.length === 0 ? (
                <Panel>
                    <p className="text-sm text-[var(--tnl-body)]" data-testid="content-empty">
                        {rows.length === 0
                            ? "Nothing here yet. Click “Add new” to create the first one."
                            : "No items match this filter."}
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
                                        checked={allVisibleSelected}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelected((s) => Array.from(new Set([...s, ...visibleRows.map((r) => r.id)])));
                                            } else {
                                                const visibleIds = new Set(visibleRows.map((r) => r.id));
                                                setSelected((s) => s.filter((id) => !visibleIds.has(id)));
                                            }
                                        }}
                                        data-testid="content-select-all"
                                    />
                                </th>
                                {photoKey ? <th className="pb-2 pr-4 font-semibold">Preview</th> : null}
                                <th className="pb-2 pr-4 font-semibold">Title</th>
                                <th className="pb-2 pr-4 font-semibold">Status</th>
                                <th className="pb-2 font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleRows.map((row) => {
                                const published = isPublished(row);
                                const title = String(row[spec.titleField] ?? "(untitled)");
                                const meta = metaFor(row);
                                const thumb = photoKey ? String(row[photoKey] ?? "") : "";
                                return (
                                    <tr key={row.id} className="border-t align-top" style={{ borderColor: "var(--tnl-border)" }} data-testid={`content-row-${row.id}`}>
                                        <td className="py-3 pr-3">
                                            <input
                                                type="checkbox"
                                                aria-label={`Select ${title}`}
                                                checked={selected.includes(row.id)}
                                                onChange={(e) =>
                                                    setSelected((s) => (e.target.checked ? [...s, row.id] : s.filter((x) => x !== row.id)))
                                                }
                                                data-testid={`content-select-${row.id}`}
                                            />
                                        </td>
                                        {photoKey ? (
                                            <td className="py-3 pr-4">
                                                <Link
                                                    to={`/admin/content/${resource}/${row.id}`}
                                                    className="block h-9 w-9 shrink-0 overflow-hidden rounded-lg border"
                                                    style={{ borderColor: "var(--tnl-border)", background: "var(--tnl-surface)" }}
                                                    data-testid={`content-thumb-${row.id}`}
                                                >
                                                    {thumb ? (
                                                        <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                                                    ) : (
                                                        <span className="flex h-full w-full items-center justify-center text-[10px] text-[var(--tnl-body)]">—</span>
                                                    )}
                                                </Link>
                                            </td>
                                        ) : null}
                                        <td className="py-3 pr-4">
                                            <Link
                                                to={`/admin/content/${resource}/${row.id}`}
                                                className="font-medium text-[var(--tnl-heading)] underline-offset-2 hover:underline"
                                                data-testid={`content-open-${row.id}`}
                                            >
                                                {title}
                                            </Link>
                                            {row.needs_review ? (
                                                <span
                                                    className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold"
                                                    style={{
                                                        background: "color-mix(in srgb, var(--gsm-accent) 22%, transparent)",
                                                        color: "var(--tnl-tan-text)",
                                                    }}
                                                >
                                                    Needs review
                                                </span>
                                            ) : null}
                                            {meta ? <p className="mt-0.5 text-xs text-[var(--tnl-body)]">{meta}</p> : null}
                                        </td>
                                        <td className="py-3 pr-4">
                                            <StatusPill published={published} testId={`content-status-${row.id}`} />
                                        </td>
                                        <td className="py-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => togglePublishMutation.mutate({ id: row.id, willPublish: !published })}
                                                    disabled={togglePublishMutation.isPending}
                                                    className="rounded-[6px] border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--tnl-surface)]"
                                                    style={{ borderColor: "var(--tnl-border)" }}
                                                    data-testid={`content-toggle-publish-${row.id}`}
                                                    title={published ? "Hide from website (set to draft)" : "Publish to website"}
                                                >
                                                    {published ? "Hide" : t("adminPublish")}
                                                </button>
                                                <Link
                                                    to={`/admin/content/${resource}/${row.id}`}
                                                    className="rounded-[6px] border px-3 py-1.5 text-xs font-medium"
                                                    style={{ borderColor: "var(--tnl-border)" }}
                                                    data-testid={`content-edit-${row.id}`}
                                                >
                                                    {t("adminEdit")}
                                                </Link>
                                                <ConfirmButton
                                                    label={t("adminDelete")}
                                                    confirmLabel={t("adminDeleteItems")}
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
            {!error && !isLoading && (rows.length > 0 || rows.length < totalRows) ? (
                <AdminLoadMore
                    shown={rows.length}
                    total={totalRows}
                    loading={isFetching}
                    onMore={() => {
                        setSelected([]); // page change is a filter change too
                        setOffset((current) => current + CONTENT_PAGE_SIZE);
                    }}
                    testId="load-more-content"
                    countTestId="content-count"
                />
            ) : null}
        </div>
    );
}
