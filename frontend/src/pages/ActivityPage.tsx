// Activity page: tabs for R&D Projects, Practicum, Training/Events and Assistant
// Activity. Event cards carry an automatic Open/Upcoming/Past status computed
// server-side, a poster carousel, module list, WhatsApp contact chips and a
// registration button that disables itself after the close date.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    Calendar,
    ChevronLeft,
    ChevronRight,
    Clock,
    Cpu,
    Download,
    FileCode,
    FileText,
    FlaskConical,
    GraduationCap,
    HardDrive,
    Layers,
    MapPin,
    MessageCircle,
    Radio,
    Server,
    Sparkles,
    Users,
    Wrench,
} from "lucide-react";
import { useActivities, useEquipment, useEvents, usePage, usePracticum, useProjects } from "@/lib/hooks";
import { pick, useLocale } from "@/lib/i18n";
import { BlockRenderer } from "@/components/site/Blocks";
import { EmptyState, SectionHeading, Spinner, StatusBadge, TypeBadge, formatDate } from "@/components/site/Primitives";
import { RegistrationDialog } from "@/components/site/RegistrationDialog";
import type { Activity, Equipment, LabEvent, PracticumModule, Project } from "@/lib/types";

type TabKey = "rd" | "practicum" | "training" | "assistant";

const TABS: { key: TabKey; labelKey: "nav_rd" | "nav_practicum" | "nav_training" | "nav_assistant" }[] = [
    { key: "rd", labelKey: "nav_rd" },
    { key: "practicum", labelKey: "nav_practicum" },
    { key: "training", labelKey: "nav_training" },
    { key: "assistant", labelKey: "nav_assistant" },
];

const CATEGORY_CHIP: Record<string, { bg: string; fg: string }> = {
    social: { bg: "#a8977b", fg: "#111518" },
    internal: { bg: "#43594A", fg: "#ffffff" },
    academic: { bg: "#7f715c", fg: "#ffffff" },
};

function waLink(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    const normalized = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
    return `https://wa.me/${normalized}`;
}

// ---------------------------------------------------------------- event card
function EventCard({ event }: { event: LabEvent }) {
    const { locale, t } = useLocale();
    const [poster, setPoster] = useState(0);
    const [registerOpen, setRegisterOpen] = useState(false);
    const posters = event.poster_urls ?? [];
    const status = event.reg_status ?? "closed";
    const canRegister = status === "open" || status === "full";

    const statusLabel =
        status === "open"
            ? t("reg_open")
            : status === "upcoming"
                ? t("reg_upcoming")
                : status === "full"
                    ? t("reg_full")
                    : status === "past"
                        ? t("reg_past")
                        : t("reg_closed");

    const note =
        status === "closed"
            ? t("registration_closed_note")
            : status === "upcoming"
                ? t("registration_upcoming_note")
                : status === "full"
                    ? t("registration_full_note")
                    : status === "past"
                        ? t("reg_past")
                        : "";

    return (
        <article className="tnl-card overflow-hidden p-0" data-testid={`event-card-${event.slug}`}>
            <div className="tnl-hero-gradient flex flex-wrap items-center gap-3 px-6 py-4">
                <TypeBadge label={event.type} testId={`event-type-badge-${event.slug}`} />
                <StatusBadge status={status} label={statusLabel} testId={`event-status-badge-${event.slug}`} />
                {typeof event.seats_left === "number" ? (
                    <span className="ml-auto text-xs font-semibold" style={{ color: "var(--tnl-tan)" }} data-testid={`event-seats-${event.slug}`}>
                        {event.seats_left} {t("seats_left")}
                    </span>
                ) : null}
            </div>

            <div className="grid gap-0 lg:grid-cols-[0.36fr_0.64fr]">
                <div className="relative" style={{ background: "var(--tnl-surface)", minHeight: 220 }}>
                    {posters.length ? (
                        <>
                            <img
                                src={posters[poster]}
                                alt={`${pick(locale, event.title, event.title_id)} poster ${poster + 1}`}
                                className="h-full w-full object-cover"
                                loading="lazy"
                            />
                            {posters.length > 1 ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => setPoster((p) => (p - 1 + posters.length) % posters.length)}
                                        className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90"
                                        aria-label="Previous poster"
                                        data-testid={`event-poster-prev-${event.slug}`}
                                    >
                                        <ChevronLeft className="h-4 w-4" style={{ color: "#111518" }} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPoster((p) => (p + 1) % posters.length)}
                                        className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90"
                                        aria-label="Next poster"
                                        data-testid={`event-poster-next-${event.slug}`}
                                    >
                                        <ChevronRight className="h-4 w-4" style={{ color: "#111518" }} />
                                    </button>
                                    <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-bold text-white">
                                        {poster + 1}/{posters.length}
                                    </span>
                                </>
                            ) : null}
                        </>
                    ) : (
                        <div className="flex h-full items-center justify-center p-8" aria-hidden="true">
                            <GraduationCap className="h-12 w-12" style={{ color: "var(--tnl-tan)" }} />
                        </div>
                    )}
                </div>

                <div className="p-6 sm:p-8">
                    <h3 className="tnl-h4 text-[21px] sm:text-[25px]" data-testid={`event-title-${event.slug}`}>
                        {pick(locale, event.title, event.title_id)}
                    </h3>
                    <p
                        className="mt-3 border-l-2 pl-4 text-sm leading-relaxed text-[var(--tnl-body)]"
                        style={{ borderColor: "var(--tnl-tan)" }}
                    >
                        {pick(locale, event.description, event.description_id)}
                    </p>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[10px] border p-3" style={{ borderColor: "var(--tnl-border)" }}>
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>
                                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                                {t("date")}
                            </div>
                            <div className="mt-1 text-sm font-medium" data-testid={`event-date-${event.slug}`}>
                                {formatDate(event.start_date, locale)}
                                {event.end_date && event.end_date !== event.start_date ? ` – ${formatDate(event.end_date, locale)}` : ""}
                            </div>
                        </div>
                        <div className="rounded-[10px] border p-3" style={{ borderColor: "var(--tnl-border)" }}>
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>
                                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                                {t("location")}
                            </div>
                            <div className="mt-1 text-sm font-medium">{event.location ?? "—"}</div>
                        </div>
                    </div>

                    {event.modules?.length ? (
                        <div className="mt-5">
                            <h4 className="mb-2 text-sm font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>
                                {t("modules")}
                            </h4>
                            <ol className="space-y-2">
                                {event.modules.map((m, i) => (
                                    <li key={i} className="flex gap-3 text-sm" data-testid={`event-module-${event.slug}-${i}`}>
                                        <span className="font-bold" style={{ color: "var(--tnl-tan)" }}>
                                            {String(i + 1).padStart(2, "0")}
                                        </span>
                                        <span>
                                            <span className="font-semibold">{m.title}</span>
                                            {m.detail ? <span className="block text-[var(--tnl-body)]">{m.detail}</span> : null}
                                            {m.date ? (
                                                <span className="block text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                                                    {formatDate(m.date, locale)}
                                                </span>
                                            ) : null}
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    ) : null}

                    {event.contacts?.length ? (
                        <div className="mt-5 flex flex-wrap gap-2">
                            {event.contacts.map((c, i) =>
                                c.phone ? (
                                    <a
                                        key={i}
                                        href={waLink(c.phone)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:border-[var(--tnl-green)]"
                                        style={{ borderColor: "var(--tnl-border)" }}
                                        data-testid={`event-contact-${event.slug}-${i}`}
                                    >
                                        <MessageCircle className="h-3.5 w-3.5" style={{ color: "var(--tnl-green)" }} aria-hidden="true" />
                                        {c.name}
                                    </a>
                                ) : (
                                    <span
                                        key={i}
                                        className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium"
                                        style={{ borderColor: "var(--tnl-border)" }}
                                        data-testid={`event-contact-${event.slug}-${i}`}
                                    >
                                        {c.name}
                                        {c.email ? ` · ${c.email}` : ""}
                                    </span>
                                ),
                            )}
                        </div>
                    ) : null}

                    <div className="mt-6">
                        <button
                            type="button"
                            onClick={() => setRegisterOpen(true)}
                            disabled={!canRegister}
                            className="tnl-btn tnl-btn-primary w-full sm:w-auto"
                            data-testid={`event-register-button-${event.slug}`}
                        >
                            {status === "full" ? t("reg_full") : t("register_now")}
                        </button>
                        {note && !canRegister ? (
                            <p className="mt-2 text-sm" style={{ color: "var(--tnl-tan-text)" }} data-testid={`event-reg-note-${event.slug}`}>
                                {note}
                            </p>
                        ) : null}
                        {status === "full" ? (
                            <p className="mt-2 text-sm" style={{ color: "var(--tnl-tan-text)" }}>
                                {t("registration_full_note")}
                            </p>
                        ) : null}
                    </div>
                </div>
            </div>

            {event.documentation?.length ? (
                <div className="border-t px-6 py-6 sm:px-8" style={{ borderColor: "var(--tnl-border)" }}>
                    <h4 className="mb-3 text-sm font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>
                        {t("documentation")}
                    </h4>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {event.documentation.map((doc, i) => (
                            <img
                                key={i}
                                src={doc.url}
                                alt={doc.alt}
                                className="h-28 w-full rounded-[10px] object-cover"
                                loading="lazy"
                                data-testid={`event-doc-${event.slug}-${i}`}
                            />
                        ))}
                    </div>
                </div>
            ) : null}

            {registerOpen ? <RegistrationDialog event={event} onClose={() => setRegisterOpen(false)} /> : null}
        </article>
    );
}

// ---------------------------------------------------------------- assistant rows
function ActivityRow({ activity, index }: { activity: Activity; index: number }) {
    const { locale, t } = useLocale();
    const [slide, setSlide] = useState(0);
    const images = activity.images ?? [];
    const chip = CATEGORY_CHIP[activity.category] ?? CATEGORY_CHIP.internal;
    const flip = index % 2 === 1;

    return (
        <article
            className="relative grid items-center gap-8 py-10 lg:grid-cols-2"
            data-testid={`activity-row-${activity.id}`}
        >
            <span
                className="pointer-events-none absolute -top-2 select-none text-[120px] font-bold leading-none opacity-[0.07] lg:text-[160px]"
                style={{ color: "var(--tnl-tan)", [flip ? "right" : "left"]: 0 } as React.CSSProperties}
                aria-hidden="true"
            >
                {String(index + 1).padStart(2, "0")}
            </span>

            <div className={flip ? "lg:order-2" : ""}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span
                        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold capitalize"
                        style={{ background: chip.bg, color: chip.fg }}
                        data-testid={`activity-category-${activity.id}`}
                    >
                        {activity.category}
                    </span>
                    {activity.date ? (
                        <span className="tnl-count-chip" data-testid={`activity-date-${activity.id}`}>
                            {formatDate(activity.date, locale)}
                        </span>
                    ) : null}
                </div>
                <h3 className="tnl-h4 text-[21px] sm:text-[25px]">{pick(locale, activity.title, activity.title_id)}</h3>
                <p className="mt-3 text-base leading-relaxed text-[var(--tnl-body)]">
                    {pick(locale, activity.description, activity.description_id)}
                </p>
            </div>

            <div className={flip ? "lg:order-1" : ""}>
                <div className="tnl-card relative overflow-hidden p-0" style={{ minHeight: 240 }}>
                    {images.length ? (
                        <>
                            <img src={images[slide].url} alt={images[slide].alt} className="h-64 w-full object-cover" loading="lazy" />
                            {images.length > 1 ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => setSlide((s) => (s - 1 + images.length) % images.length)}
                                        className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90"
                                        aria-label="Previous image"
                                        data-testid={`activity-image-prev-${activity.id}`}
                                    >
                                        <ChevronLeft className="h-4 w-4" style={{ color: "#111518" }} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSlide((s) => (s + 1) % images.length)}
                                        className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90"
                                        aria-label="Next image"
                                        data-testid={`activity-image-next-${activity.id}`}
                                    >
                                        <ChevronRight className="h-4 w-4" style={{ color: "#111518" }} />
                                    </button>
                                    <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-bold text-white">
                                        {slide + 1}/{images.length}
                                    </span>
                                </>
                            ) : null}
                        </>
                    ) : (
                        <div className="tnl-hero-gradient flex h-64 items-center justify-center" aria-hidden="true">
                            <Sparkles className="h-10 w-10" style={{ color: "var(--tnl-tan)" }} />
                        </div>
                    )}
                </div>
            </div>
            <span className="sr-only">{t("documentation")}</span>
        </article>
    );
}

// ---------------------------------------------------------------- R&D
function ProjectCard({ project }: { project: Project }) {
    const { locale, t } = useLocale();
    return (
        <article className="tnl-card tnl-card-hover p-6" data-testid={`project-card-${project.id}`}>
            <div className="flex flex-wrap items-center gap-2">
                {project.cluster ? <span className="tnl-count-chip">{project.cluster}</span> : null}
                {project.year ? (
                    <span className="text-sm" style={{ color: "var(--tnl-body)" }}>
                        {project.year}
                    </span>
                ) : null}
            </div>
            <h3 className="mt-3 text-[19px] font-bold leading-snug">{pick(locale, project.title, project.title_id)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--tnl-body)]">
                {pick(locale, project.description, project.description_id)}
            </p>
            {project.tags?.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                    {project.tags.map((tag) => (
                        <span
                            key={tag}
                            className="rounded-full border px-2.5 py-1 text-xs"
                            style={{ borderColor: "var(--tnl-border)", color: "var(--tnl-tan-text)" }}
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            ) : null}
            {project.focus ? (
                <p className="mt-3 text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                    {t("focus_technology")}: {project.focus}
                </p>
            ) : null}
        </article>
    );
}

function formatBytes(bytes?: number | null): string {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ResourceIcon({ type }: { type?: string }) {
    const t = (type || "").toLowerCase();
    if (t === "pdf") return <FileText className="h-4 w-4 shrink-0" style={{ color: "#ef4444" }} />;
    if (t === "pkt") return <Layers className="h-4 w-4 shrink-0" style={{ color: "#0284c7" }} />;
    if (t === "py" || t === "txt" || t === "json") return <FileCode className="h-4 w-4 shrink-0" style={{ color: "#10b981" }} />;
    return <Download className="h-4 w-4 shrink-0" style={{ color: "#f59e0b" }} />;
}

const EQUIP_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
    available: { bg: "rgba(34, 197, 94, 0.15)", fg: "#16a34a" },
    in_use: { bg: "rgba(245, 158, 11, 0.15)", fg: "#d97706" },
    maintenance: { bg: "rgba(239, 68, 68, 0.15)", fg: "#dc2626" },
};

function EquipmentCard({ item }: { item: Equipment }) {
    const { locale, t } = useLocale();
    const stStyle = EQUIP_STATUS_STYLE[item.status] || EQUIP_STATUS_STYLE.available;
    const statusLabel =
        item.status === "available"
            ? t("status_available")
            : item.status === "in_use"
                ? t("status_in_use")
                : t("status_maintenance");

    const categoryLabel =
        item.category === "server"
            ? t("category_server")
            : item.category === "sdr"
                ? t("category_sdr")
                : item.category === "networking"
                    ? t("category_networking")
                    : item.category === "optical"
                        ? t("category_optical")
                        : item.category === "test_tool"
                            ? t("category_test_tool")
                            : item.category;

    return (
        <article
            className="tnl-card tnl-card-hover flex flex-col justify-between overflow-hidden p-6"
            data-testid={`equipment-card-${item.id}`}
        >
            <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <span className="tnl-count-chip text-xs uppercase tracking-wider">{categoryLabel}</span>
                    <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                        style={{ background: stStyle.bg, color: stStyle.fg }}
                        data-testid={`equipment-status-${item.id}`}
                    >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: stStyle.fg }} />
                        {statusLabel}
                    </span>
                </div>

                {item.photo_url ? (
                    <div className="mb-4 h-44 w-full overflow-hidden rounded-lg border" style={{ background: "var(--tnl-surface)", borderColor: "var(--tnl-border)" }}>
                        <img
                            src={item.photo_url}
                            alt={item.photo_alt || item.name}
                            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                            loading="lazy"
                        />
                    </div>
                ) : null}

                <h3 className="text-[18px] font-bold leading-snug">{pick(locale, item.name, item.name_id)}</h3>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                    <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {item.location}
                    </span>
                    {item.quantity ? (
                        <span>
                            {item.quantity} {locale === "id" ? "Unit" : "Units"}
                        </span>
                    ) : null}
                </div>

                <p className="mt-3 text-sm leading-relaxed text-[var(--tnl-body)]">
                    {pick(locale, item.specs, item.specs_id)}
                </p>
            </div>
        </article>
    );
}

function PracticumCard({ mod, index }: { mod: PracticumModule; index: number }) {
    const { locale, t } = useLocale();
    const resources = mod.resources ?? [];
    const shifts = mod.shifts ?? [];

    return (
        <article
            className="tnl-card border-l-4 p-6 flex flex-col justify-between"
            style={{ borderLeftColor: "var(--tnl-tan)" }}
            data-testid={`practicum-card-${mod.id}`}
        >
            <div>
                <div className="flex items-baseline justify-between gap-2">
                    <span className="block text-[32px] font-bold leading-none" style={{ color: "var(--tnl-tan)" }}>
                        {String(index + 1).padStart(2, "0")}
                    </span>
                    {mod.code ? (
                        <span className="tnl-count-chip text-xs">
                            {mod.code}
                            {mod.semester ? ` · ${mod.semester}` : ""}
                        </span>
                    ) : null}
                </div>

                <h3 className="mt-3 text-[19px] font-bold leading-snug">{pick(locale, mod.name, mod.name_id)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--tnl-body)]">
                    {pick(locale, mod.description, mod.description_id)}
                </p>

                {resources.length ? (
                    <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--tnl-border)" }}>
                        <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>
                            <Download className="h-3.5 w-3.5" />
                            {t("resources")} ({resources.length})
                        </h4>
                        <div className="flex flex-col gap-2">
                            {resources.map((res, idx) => (
                                <a
                                    key={res.id || idx}
                                    href={res.file_url}
                                    download
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group flex items-center justify-between gap-2 rounded-lg border p-2 text-xs transition-colors hover:border-[var(--tnl-tan)]"
                                    style={{ background: "var(--background)", borderColor: "var(--tnl-border)" }}
                                    data-testid={`practicum-resource-${mod.id}-${idx}`}
                                >
                                    <div className="flex min-w-0 items-center gap-2">
                                        <ResourceIcon type={res.file_type} />
                                        <span className="truncate font-medium group-hover:underline">{res.title}</span>
                                    </div>
                                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono border" style={{ borderColor: "var(--tnl-border)", color: "var(--tnl-body)" }}>
                                        {res.file_type?.toUpperCase() || "FILE"}
                                        {res.size_bytes ? ` · ${formatBytes(res.size_bytes)}` : ""}
                                    </span>
                                </a>
                            ))}
                        </div>
                    </div>
                ) : null}

                {shifts.length ? (
                    <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--tnl-border)" }}>
                        <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>
                            <Clock className="h-3.5 w-3.5" />
                            {t("shift_schedule")}
                        </h4>
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left text-xs">
                                <thead>
                                    <tr className="border-b text-[11px] font-semibold" style={{ borderColor: "var(--tnl-border)", color: "var(--tnl-tan-text)" }}>
                                        <th className="py-1.5 pr-2">{t("day")}</th>
                                        <th className="py-1.5 px-2">{t("time_slot")}</th>
                                        <th className="py-1.5 px-2">{t("coordinator")}</th>
                                        <th className="py-1.5 pl-2">{t("room")}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y" style={{ borderColor: "var(--tnl-border)" }}>
                                    {shifts.map((sh, idx) => (
                                        <tr key={sh.id || idx}>
                                            <td className="py-2 pr-2 font-semibold" style={{ color: "var(--tnl-green)" }}>{sh.day}</td>
                                            <td className="py-2 px-2 whitespace-nowrap">{sh.time_slot}</td>
                                            <td className="py-2 px-2">{sh.coordinator_name}</td>
                                            <td className="py-2 pl-2 whitespace-nowrap" style={{ color: "var(--tnl-body)" }}>{sh.room || "B-301"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : null}
            </div>
        </article>
    );
}

export default function ActivityPage() {
    const { locale, t } = useLocale();
    const [params, setParams] = useSearchParams();
    const requested = params.get("tab") as TabKey | null;
    const [tab, setTab] = useState<TabKey>(requested && TABS.some((x) => x.key === requested) ? requested : "rd");
    const [equipCat, setEquipCat] = useState<string>("all");

    useEffect(() => {
        if (requested && TABS.some((x) => x.key === requested)) setTab(requested);
    }, [requested]);

    const selectTab = (key: TabKey) => {
        setTab(key);
        setParams({ tab: key }, { replace: true });
    };

    const { data: page } = usePage("activity");
    const heroBlocks = (page?.blocks ?? []).filter((b) => b.type === "inner_hero");

    const { data: projects, isLoading: projectsLoading } = useProjects();
    const { data: practicum, isLoading: practicumLoading } = usePracticum();
    const { data: equipment, isLoading: equipLoading } = useEquipment();
    const { data: events, isLoading: eventsLoading } = useEvents();
    const { data: activities, isLoading: activitiesLoading } = useActivities();

    const clusters = useMemo(() => (projects ?? []).filter((p) => p.kind === "rd" && !p.is_testbed), [projects]);
    const testbeds = useMemo(() => (projects ?? []).filter((p) => p.is_testbed), [projects]);

    const EQUIP_CATEGORIES = [
        { key: "all", labelKey: "all_equipment" as const },
        { key: "server", labelKey: "category_server" as const },
        { key: "sdr", labelKey: "category_sdr" as const },
        { key: "networking", labelKey: "category_networking" as const },
        { key: "optical", labelKey: "category_optical" as const },
        { key: "test_tool", labelKey: "category_test_tool" as const },
    ];

    const filteredEquip = useMemo(() => {
        if (!equipment) return [];
        if (equipCat === "all") return equipment;
        return equipment.filter((eq) => eq.category === equipCat);
    }, [equipment, equipCat]);

    return (
        <div data-testid="activity-page">
            <BlockRenderer blocks={heroBlocks} />

            <div className="border-b" style={{ background: "var(--background)", borderColor: "var(--tnl-border)" }}>
                <div className="tnl-container flex gap-1 overflow-x-auto tnl-scroll-x" role="tablist" aria-label={t("nav_activity")}>
                    {TABS.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            role="tab"
                            aria-selected={tab === item.key}
                            onClick={() => selectTab(item.key)}
                            className="relative shrink-0 px-5 py-4 text-sm font-medium transition-colors"
                            style={tab === item.key ? { color: "var(--tnl-green)" } : undefined}
                            data-testid={`activity-tab-${item.key}`}
                        >
                            {t(item.labelKey)}
                            {tab === item.key ? (
                                <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full" style={{ background: "var(--tnl-green)" }} />
                            ) : null}
                        </button>
                    ))}
                </div>
            </div>

            <section className="tnl-section" style={{ background: "var(--tnl-surface)" }}>
                <div className="tnl-container">
                    {tab === "rd" ? (
                        <div data-testid="activity-panel-rd">
                            <SectionHeading
                                title={t("research_clusters")}
                                count={clusters.length}
                                countLabel={locale === "id" ? "klaster" : "clusters"}
                                testId="rd-clusters-heading"
                            />
                            {projectsLoading ? (
                                <Spinner label={t("loading")} />
                            ) : clusters.length === 0 ? (
                                <EmptyState
                                    title={t("coming_soon")}
                                    body={t("empty_projects")}
                                    testId="rd-empty-state"
                                    icon={<FlaskConical className="h-7 w-7" style={{ color: "var(--tnl-tan-text)" }} />}
                                />
                            ) : (
                                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                                    {clusters.map((p) => (
                                        <ProjectCard key={p.id} project={p} />
                                    ))}
                                </div>
                            )}

                            {testbeds.length ? (
                                <div className="mt-14">
                                    <SectionHeading title={t("testbeds")} count={testbeds.length} countLabel={t("testbeds").toLowerCase()} testId="testbeds-heading" />
                                    <div className="grid gap-5 md:grid-cols-2">
                                        {testbeds.map((p) => (
                                            <ProjectCard key={p.id} project={p} />
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            <div className="mt-16" data-testid="lab-equipment-section">
                                <SectionHeading
                                    title={t("lab_equipment")}
                                    count={filteredEquip.length}
                                    countLabel={locale === "id" ? "perangkat" : "items"}
                                    testId="equipment-heading"
                                />
                                <p className="mt-1 text-sm max-w-3xl" style={{ color: "var(--tnl-body)" }}>
                                    {t("equipment_subtitle")}
                                </p>

                                <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label={t("lab_equipment")}>
                                    {EQUIP_CATEGORIES.map((cat) => (
                                        <button
                                            key={cat.key}
                                            type="button"
                                            onClick={() => setEquipCat(cat.key)}
                                            className="rounded-full px-4 py-1.5 text-xs font-semibold transition-all border"
                                            style={
                                                equipCat === cat.key
                                                    ? { background: "var(--tnl-green)", color: "#ffffff", borderColor: "var(--tnl-green)" }
                                                    : { background: "var(--background)", color: "var(--tnl-body)", borderColor: "var(--tnl-border)" }
                                            }
                                            data-testid={`equipment-cat-filter-${cat.key}`}
                                        >
                                            {t(cat.labelKey)}
                                        </button>
                                    ))}
                                </div>

                                {equipLoading ? (
                                    <div className="mt-8">
                                        <Spinner label={t("loading")} />
                                    </div>
                                ) : filteredEquip.length === 0 ? (
                                    <div className="mt-8">
                                        <EmptyState
                                            title={t("coming_soon")}
                                            body={t("coming_soon_body")}
                                            testId="equipment-empty-state"
                                            icon={<Cpu className="h-7 w-7" style={{ color: "var(--tnl-tan-text)" }} />}
                                        />
                                    </div>
                                ) : (
                                    <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                                        {filteredEquip.map((item) => (
                                            <EquipmentCard key={item.id} item={item} />
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="tnl-hero-gradient tnl-card mt-16 p-10 text-center">
                                <h3 className="tnl-h4 text-[22px]" style={{ color: "#ffffff" }}>
                                    {t("collaborate_title")}
                                </h3>
                                <p className="mx-auto mt-3 max-w-2xl text-sm" style={{ color: "#dfe2e5" }}>
                                    {t("collaborate_body")}
                                </p>
                                <a href="/contact" className="tnl-btn tnl-btn-tan mt-6" data-testid="rd-collaborate-button">
                                    {t("contact_us")}
                                </a>
                            </div>
                        </div>
                    ) : null}

                    {tab === "practicum" ? (
                        <div data-testid="activity-panel-practicum">
                            <SectionHeading
                                title={t("practicum_modules")}
                                count={(practicum ?? []).length}
                                countLabel={locale === "id" ? "modul" : "modules"}
                                testId="practicum-heading"
                            />
                            {practicumLoading ? (
                                <Spinner label={t("loading")} />
                            ) : (practicum ?? []).length === 0 ? (
                                <EmptyState title={t("coming_soon")} body={t("coming_soon_body")} testId="practicum-empty-state" />
                            ) : (
                                <div className="grid gap-6 md:grid-cols-2">
                                    {(practicum ?? []).map((mod, i) => (
                                        <PracticumCard key={mod.id} mod={mod} index={i} />
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : null}

                    {tab === "training" ? (
                        <div data-testid="activity-panel-training">
                            <SectionHeading
                                title={t("nav_training")}
                                count={(events ?? []).length}
                                countLabel={locale === "id" ? "program" : "programmes"}
                                testId="training-heading"
                            />
                            {eventsLoading ? (
                                <Spinner label={t("loading")} />
                            ) : (events ?? []).length === 0 ? (
                                <EmptyState
                                    title={t("coming_soon")}
                                    body={t("empty_events")}
                                    testId="events-empty-state"
                                    icon={<GraduationCap className="h-7 w-7" style={{ color: "var(--tnl-tan-text)" }} />}
                                />
                            ) : (
                                <div className="space-y-8">
                                    {(events ?? []).map((ev) => (
                                        <EventCard key={ev.id} event={ev} />
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : null}

                    {tab === "assistant" ? (
                        <div data-testid="activity-panel-assistant">
                            <SectionHeading
                                title={t("nav_assistant")}
                                count={(activities ?? []).length}
                                countLabel={locale === "id" ? "kegiatan" : "activities"}
                                testId="assistant-activity-heading"
                            />
                            {activitiesLoading ? (
                                <Spinner label={t("loading")} />
                            ) : (activities ?? []).length === 0 ? (
                                <EmptyState
                                    title={t("coming_soon")}
                                    body={t("empty_activities")}
                                    testId="activities-empty-state"
                                    icon={<Users className="h-7 w-7" style={{ color: "var(--tnl-tan-text)" }} />}
                                />
                            ) : (
                                <div className="divide-y" style={{ borderColor: "var(--tnl-border)" }}>
                                    {(activities ?? []).map((a, i) => (
                                        <ActivityRow key={a.id} activity={a} index={i} />
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            </section>
        </div>
    );
}
