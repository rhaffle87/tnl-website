// Activity collections selected by the approved header's URL links.
// Event cards carry an automatic Open/Upcoming/Past status computed
// server-side, a poster carousel, module list, WhatsApp contact chips and a
// registration button that disables itself after the close date.

import { useId, useMemo, useState } from "react";
import "@/pages/activity-editorial.css";
import { Link, useSearchParams } from "react-router-dom";

import { handleSpotlightPointerMove } from "@/components/site/SpotlightCard";
import {
    Calendar,
    Clock,
    Cpu,
    Download,
    ExternalLink,
    FileCode,
    FileText,
    FlaskConical,
    GraduationCap,
    Layers,
    Lock,
    MapPin,
    MessageCircle,
    Radio,
    Server,
    Sparkles,
    Users,
} from "lucide-react";
import { useActivities, useEquipment, useEvents, usePage, usePracticum, useProjects } from "@/lib/api/hooks";
import { pick, useLocale } from "@/lib/i18n/i18n";
import { BlockRenderer } from "@/components/site/Blocks";
import { EmptyState, SectionHeading, Spinner, formatDate } from "@/components/site/Primitives";
import { RegistrationDialog } from "@/components/site/RegistrationDialog";
import { FadeCarousel, ImageLightboxModal, type CarouselImage } from "@/components/site/MediaCarousel";
import type { Activity, Equipment, LabEvent, PracticumModule, Project } from "@/lib/types/types";

type TabKey = "rd" | "practicum" | "events" | "assistant";


function normalizeTab(raw: string | null): TabKey {
    if (raw === "training") return "events";
    if (raw && (raw === "rd" || raw === "practicum" || raw === "events" || raw === "assistant")) {
        return raw as TabKey;
    }
    return "rd";
}


function waLink(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    const normalized = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
    return `https://wa.me/${normalized}`;
}

// ---------------------------------------------------------------- event card
export function EventCard({ event, detail = false }: { event: LabEvent; detail?: boolean }) {
    const eventKey = event.slug || event.id;
    const Heading = detail ? "h1" : "h3";
    const Subheading = detail ? "h2" : "h4";
    const sectionId = useId();
    const { locale, t } = useLocale();
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [registerOpen, setRegisterOpen] = useState(false);
    const status = event.reg_status ?? "closed";
    const isClosed = Boolean(
        event.registration_closed ||
        status === "closed" ||
        status === "past"
    );
    const canRegister = !isClosed && (status === "open" || status === "full");

    const eventImages: CarouselImage[] = useMemo(() => {
        const list: CarouselImage[] = [];
        if (event.cover_image) {
            list.push({ url: event.cover_image, alt: pick(locale, event.title, event.title_id) });
        }
        (event.poster_urls ?? []).forEach((u, i) => {
            if (!list.some((item) => item.url === u)) {
                list.push({ url: u, alt: `${pick(locale, event.title, event.title_id)} poster ${i + 1}` });
            }
        });
        (event.gallery_images ?? []).forEach((u, i) => {
            if (!list.some((item) => item.url === u)) {
                list.push({ url: u, alt: `${pick(locale, event.title, event.title_id)} gallery ${i + 1}` });
            }
        });
        return list;
    }, [event, locale]);

    const statusLabel =
        status === "open" && !isClosed
            ? t("reg_open")
            : status === "upcoming"
                ? t("reg_upcoming")
                : (status === "full" || event.is_full)
                    ? (locale === "id" ? "KUOTA PENUH" : "QUOTA FULL")
                    : status === "past"
                        ? t("reg_past")
                        : t("reg_closed");

    const note =
        (status === "full" || event.is_full)
            ? (locale === "id" ? "Kuota peserta telah terpenuhi." : t("registration_full_note"))
            : status === "closed" || isClosed
                ? t("registration_closed_note")
                : status === "upcoming"
                    ? t("registration_upcoming_note")
                    : status === "past"
                        ? t("reg_past")
                        : "";

    const registerBtnLabel =
        (status === "full" || event.is_full)
            ? (locale === "id" ? "Kuota Penuh" : "Quota Full")
            : (isClosed || status === "closed")
                ? (locale === "id" ? "Pendaftaran Ditutup" : "Registration Closed")
                : status === "upcoming"
                    ? (locale === "id" ? "Belum Dibuka" : "Upcoming")
                    : t("register_now");

    const eventTypeLabel = useMemo(() => {
        const raw = (event.type || "").toLowerCase();
        if (locale === "id") {
            if (raw === "training") return "PELATIHAN";
            if (raw === "recruitment") return "REKRUTMEN";
            if (raw === "open_house") return "OPEN HOUSE";
            if (raw === "workshop") return "WORKSHOP";
            return raw.toUpperCase();
        }
        return raw.toUpperCase();
    }, [event.type, locale]);

    return (
        <article
            className={`activity-record${detail ? " event-story" : ""}`}
            onPointerMove={handleSpotlightPointerMove}
            data-testid={`event-card-${eventKey}`}
        >
            <div className="activity-record-header">
                <span className="activity-category" data-testid={`event-type-badge-${eventKey}`}>{eventTypeLabel}</span>
                <span className="activity-category" data-status={status} data-testid={`event-status-badge-${eventKey}`}>{statusLabel}</span>
                {typeof event.seats_left === "number" ? (
                    <span className="ml-auto text-xs font-semibold" style={{ color: "var(--tnl-tan-text)" }} data-testid={`event-seats-${eventKey}`}>
                        {event.seats_left} {t("seats_left")}
                    </span>
                ) : null}
            </div>

            {detail ? (
                <header className="event-story-heading">
                    <Heading className="event-detail-title" data-testid={`event-title-${eventKey}`}>
                        {pick(locale, event.title, event.title_id)}
                    </Heading>
                    <p className="event-intro">{pick(locale, event.description, event.description_id)}</p>
                </header>
            ) : null}

            <div className={`event-record-layout${eventImages.length ? " has-media" : ""}`}>
                {eventImages.length ? <div className="event-record-media">
                        <>
                            <FadeCarousel
                                images={eventImages}
                                aspectRatio="aspect-[4/3]"
                                className="h-full w-full"
                                onImageClick={(idx) => setLightboxIndex(idx)}
                            />
                            {lightboxIndex !== null ? (
                                <ImageLightboxModal
                                    images={eventImages}
                                    initialIndex={lightboxIndex}
                                    onClose={() => setLightboxIndex(null)}
                                />
                            ) : null}
                        </>
                </div> : null}

                <div className="event-record-body">
                    {!detail ? <>
                    <Heading className="event-list-title" data-testid={`event-title-${eventKey}`}>
                        {pick(locale, event.title, event.title_id)}
                    </Heading>
                    <p className="event-intro">
                        {pick(locale, event.description, event.description_id)}
                    </p>
                    </> : null}

                    <dl className="event-metadata">
                        <div>
                            <dt>
                                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                                {t("date")}
                            </dt>
                            <dd data-testid={`event-date-${eventKey}`}>
                                {event.start_date ? <time dateTime={event.start_date}>{formatDate(event.start_date, locale)}</time> : "—"}
                                {event.end_date && event.end_date !== event.start_date ? <> – <time dateTime={event.end_date}>{formatDate(event.end_date, locale)}</time></> : null}
                            </dd>
                        </div>
                        <div>
                            <dt>
                                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                                {t("location")}
                            </dt>
                            <dd>{pick(locale, event.location, event.location_id) || "—"}</dd>
                        </div>
                    </dl>

                    <div className="event-actions">
                        {!detail ? <Link to={`/activity/events/${encodeURIComponent(eventKey)}`} className="activity-detail-link" data-testid={`event-detail-link-${eventKey}`}>
                            {locale === "id" ? "Detail acara" : "Event details"}<span className="sr-only">: {pick(locale, event.title, event.title_id)}</span><span aria-hidden="true">→</span>
                        </Link> : null}
                        {event.slug === "open-house-tnl" ? (
                            <Link to="/open-house" className="tnl-btn tnl-btn-tan inline-flex items-center gap-2" data-testid="open-house-portal-btn">
                                <span>{locale === "id" ? "Portal Open House" : "Open House Portal"}</span>
                                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                            </Link>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => setRegisterOpen(true)}
                            disabled={!canRegister}
                            className="tnl-btn tnl-btn-primary w-full sm:w-auto disabled:opacity-60 disabled:cursor-not-allowed"
                            data-testid={`event-register-button-${eventKey}`}
                        >
                            {registerBtnLabel}
                        </button>
                        {note && !canRegister ? <p className="event-registration-note" data-testid={`event-reg-note-${eventKey}`}>{note}</p> : null}
                    </div>

                    {event.modules?.length ? (
                        <section className="event-program" aria-labelledby={`${sectionId}-program`}>
                            <Subheading id={`${sectionId}-program`} className="event-section-title">
                                {t("modules")}
                            </Subheading>
                            <ol>
                                {event.modules.map((m, i) => (
                                    <li key={i} className="flex gap-3 text-sm" data-testid={`event-module-${eventKey}-${i}`}>
                                        <span className="font-bold" style={{ color: "var(--tnl-tan-text)" }}>
                                            {String(i + 1).padStart(2, "0")}
                                        </span>
                                        <span>
                                            <span className="font-semibold">{pick(locale, m.title, m.title_id)}</span>
                                            {(m.detail || m.detail_id) ? (
                                                <span className="block text-[var(--tnl-body)]">
                                                    {pick(locale, m.detail, m.detail_id)}
                                                </span>
                                            ) : null}
                                            {m.date ? (
                                                <span className="block text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                                                    {formatDate(m.date, locale)}
                                                </span>
                                            ) : null}
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </section>
                    ) : null}

                    {event.contacts?.length ? (
                        <div className="event-contacts">
                            {event.contacts.map((c, i) =>
                                c.phone ? (
                                    <a
                                        key={i}
                                        href={waLink(c.phone)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="event-contact-link"
                                        style={{ borderColor: "var(--tnl-border)" }}
                                        data-testid={`event-contact-${eventKey}-${i}`}
                                    >
                                        <MessageCircle className="h-3.5 w-3.5" style={{ color: "var(--tnl-link)" }} aria-hidden="true" />
                                        {c.name}
                                    </a>
                                ) : (
                                    <span
                                        key={i}
                                        className="event-contact-link"
                                        style={{ borderColor: "var(--tnl-border)" }}
                                        data-testid={`event-contact-${eventKey}-${i}`}
                                    >
                                        {c.name}
                                        {c.email ? <> · <a className="activity-detail-link" href={`mailto:${c.email}`}>{c.email}</a></> : null}
                                    </span>
                                ),
                            )}
                        </div>
                    ) : null}

                </div>
            </div>

            {event.documentation?.length ? (
                <section className="event-documentation" aria-labelledby={`${sectionId}-documentation`}>
                    <Subheading id={`${sectionId}-documentation`} className="event-section-title">
                        {t("documentation")}
                    </Subheading>
                    <div className="event-documentation-grid">
                        {event.documentation.map((doc, i) => (
                            <img
                                key={i}
                                src={doc.url}
                                alt={doc.alt}
                                className="event-documentation-image"
                                loading="lazy"
                                data-testid={`event-doc-${eventKey}-${i}`}
                            />
                        ))}
                    </div>
                </section>
            ) : null}

            {registerOpen ? <RegistrationDialog event={event} onClose={() => setRegisterOpen(false)} /> : null}
        </article>
    );
}

// ---------------------------------------------------------------- assistant rows
function ActivityRow({ activity, index }: { activity: Activity; index: number }) {
    const { locale, t } = useLocale();
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const flip = index % 2 === 1;

    const activityImages: CarouselImage[] = useMemo(() => {
        const list: CarouselImage[] = [];
        if (activity.cover_image) {
            list.push({ url: activity.cover_image, alt: pick(locale, activity.title, activity.title_id) });
        }
        (activity.gallery_images ?? []).forEach((u, i) => {
            if (!list.some((item) => item.url === u)) {
                list.push({ url: u, alt: `${pick(locale, activity.title, activity.title_id)} ${i + 1}` });
            }
        });
        (activity.images ?? []).forEach((img, i) => {
            if (!list.some((item) => item.url === img.url)) {
                list.push({ url: img.url, alt: img.alt || `${pick(locale, activity.title, activity.title_id)} ${i + 1}` });
            }
        });
        return list;
    }, [activity, locale]);

    return (
        <article
            className="assistant-story relative grid items-center gap-8 py-10 lg:grid-cols-2"
            data-testid={`activity-row-${activity.id}`}
        >
            <div className={flip ? "lg:order-2" : ""}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span
                        className="activity-category capitalize"
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
                <div className="assistant-story-media relative overflow-hidden" style={{ minHeight: 240 }}>
                    {activityImages.length ? (
                        <>
                            <FadeCarousel
                                images={activityImages}
                                aspectRatio="aspect-video"
                                className="h-64 w-full"
                                onImageClick={(idx) => setLightboxIndex(idx)}
                            />
                            {lightboxIndex !== null ? (
                                <ImageLightboxModal
                                    images={activityImages}
                                    initialIndex={lightboxIndex}
                                    onClose={() => setLightboxIndex(null)}
                                />
                            ) : null}
                        </>
                    ) : (
                        <div className="activity-placeholder flex h-64 items-center justify-center" aria-hidden="true">
                            <Sparkles className="h-10 w-10" style={{ color: "var(--tnl-tan-text)" }} />
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
        <article
            className="project-record"
            onPointerMove={handleSpotlightPointerMove}
            data-testid={`project-card-${project.id}`}
        >
            <div className="project-metadata flex flex-wrap items-center gap-2">
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
                <div className="project-tags mt-4 flex flex-wrap gap-2">
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
    if (t === "pdf") return <FileText className="h-4 w-4 shrink-0" style={{ color: "var(--tnl-link)" }} />;
    if (t === "pkt") return <Layers className="h-4 w-4 shrink-0" style={{ color: "var(--tnl-link)" }} />;
    if (t === "py" || t === "txt" || t === "json") return <FileCode className="h-4 w-4 shrink-0" style={{ color: "var(--tnl-link)" }} />;
    return <Download className="h-4 w-4 shrink-0" style={{ color: "var(--tnl-link)" }} />;
}


function EquipmentCard({ item }: { item: Equipment }) {
    const { locale, t } = useLocale();
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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

    const images: CarouselImage[] = useMemo(() => {
        const list: CarouselImage[] = [];
        if (item.photo_url) {
            list.push({ url: item.photo_url, alt: item.photo_alt || item.name, caption: pick(locale, item.name, item.name_id) });
        }
        (item.gallery_images ?? []).forEach((img, i) => {
            if (!list.some((existing) => existing.url === img)) {
                list.push({ url: img, alt: `${item.photo_alt || item.name} ${i + 1}`, caption: pick(locale, item.name, item.name_id) });
            }
        });
        return list;
    }, [item, locale]);

    return (
        <article
            className="equipment-record flex flex-col justify-between overflow-hidden"
            onPointerMove={handleSpotlightPointerMove}
            data-testid={`equipment-card-${item.id}`}
        >
            <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <span className="tnl-count-chip text-xs uppercase tracking-wider">{categoryLabel}</span>
                    <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                        style={{ background: "var(--muted)", color: "var(--foreground)" }}
                        data-testid={`equipment-status-${item.id}`}
                    >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
                        {statusLabel}
                    </span>
                </div>

                {images.length > 0 ? (
                    <div className="mb-4">
                        <FadeCarousel
                            images={images}
                            aspectRatio="aspect-[16/10]"
                            className="rounded-xl border border-[var(--tnl-border)] overflow-hidden"
                            onImageClick={(idx) => setLightboxIndex(idx)}
                        />
                        {lightboxIndex !== null ? (
                            <ImageLightboxModal
                                images={images}
                                initialIndex={lightboxIndex}
                                onClose={() => setLightboxIndex(null)}
                            />
                        ) : null}
                    </div>
                ) : (
                    <div className="mb-4 flex h-36 w-full items-center justify-center rounded-xl border border-dashed border-[var(--tnl-border)] bg-[var(--tnl-surface)]/50">
                        {item.category === "server" ? (
                            <Server className="h-10 w-10 text-[var(--tnl-tan)]/40" />
                        ) : item.category === "sdr" ? (
                            <Radio className="h-10 w-10 text-[var(--tnl-tan)]/40" />
                        ) : item.category === "optical" ? (
                            <FlaskConical className="h-10 w-10 text-[var(--tnl-tan)]/40" />
                        ) : (
                            <Cpu className="h-10 w-10 text-[var(--tnl-tan)]/40" />
                        )}
                    </div>
                )}

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
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const resources = mod.resources ?? [];
    const shifts = mod.shifts ?? [];
    // Backend redaction: anonymous / viewer / API-key sessions get metadata only.
    const locked = mod.resources_restricted === true;
    const resourceCount = mod.resources_count ?? resources.length;
    const shiftCount = mod.shifts_count ?? shifts.length;
    const fmt = (s: string, n: number) => s.replace("{{count}}", String(n));
    const contactHref = `/contact?topic=academic&ref=practicum-${mod.code || mod.id}`;

    const images: CarouselImage[] = useMemo(() => {
        const list: CarouselImage[] = [];
        if (mod.cover_image) {
            list.push({ url: mod.cover_image, alt: pick(locale, mod.name, mod.name_id), caption: pick(locale, mod.name, mod.name_id) });
        }
        (mod.gallery_images ?? []).forEach((img, i) => {
            if (!list.some((existing) => existing.url === img)) {
                list.push({ url: img, alt: `${pick(locale, mod.name, mod.name_id)} ${i + 1}`, caption: pick(locale, mod.name, mod.name_id) });
            }
        });
        return list;
    }, [mod, locale]);

    return (
        <article
            className="practicum-record flex flex-col justify-between"
            onPointerMove={handleSpotlightPointerMove}
            data-testid={`practicum-card-${mod.id}`}
        >
            <div>
                <div className="flex items-baseline justify-between gap-2">
                    <span className="practicum-index" aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                    </span>
                    {mod.code ? (
                        <span className="tnl-count-chip text-xs">
                            {mod.code}
                            {mod.semester ? ` · ${mod.semester}` : ""}
                        </span>
                    ) : null}
                </div>

                {images.length > 0 ? (
                    <div className="mt-4 mb-3">
                        <FadeCarousel
                            images={images}
                            aspectRatio="aspect-[16/9]"
                            className="rounded-xl border border-[var(--tnl-border)] overflow-hidden"
                            onImageClick={(idx) => setLightboxIndex(idx)}
                        />
                        {lightboxIndex !== null ? (
                            <ImageLightboxModal
                                images={images}
                                initialIndex={lightboxIndex}
                                onClose={() => setLightboxIndex(null)}
                            />
                        ) : null}
                    </div>
                ) : null}

                <h3 className="mt-3 text-[19px] font-bold leading-snug">{pick(locale, mod.name, mod.name_id)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--tnl-body)]">
                    {pick(locale, mod.description, mod.description_id)}
                </p>

                {resources.length || (locked && resourceCount) ? (
                    <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--tnl-border)" }}>
                        <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>
                            <Download className="h-3.5 w-3.5" />
                            {t("resources")} ({resourceCount})
                        </h4>
                        {locked ? (
                            <div data-testid={`practicum-locked-${mod.id}`} className="flex flex-col gap-2">
                                {resources.map((res, idx) => (
                                    <div
                                        key={res.id || idx}
                                        className="practicum-resource-link flex items-center justify-between gap-2 opacity-75"
                                        aria-disabled="true"
                                    >
                                        <div className="flex min-w-0 items-center gap-2">
                                            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                            <span className="min-w-0 truncate font-medium">{res.title}</span>
                                        </div>
                                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono border" style={{ borderColor: "var(--tnl-border)", color: "var(--tnl-body)" }}>
                                            {res.file_type?.toUpperCase() || "FILE"}
                                            {res.size_bytes ? ` · ${formatBytes(res.size_bytes)}` : ""}
                                        </span>
                                    </div>
                                ))}
                                {resourceCount > resources.length
                                    ? <p className="text-xs" style={{ color: "var(--tnl-body)" }}>{fmt(t("practicum_locked_resources"), resourceCount)}</p>
                                    : null}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {resources.map((res, idx) => (
                                    <a
                                        key={res.id || idx}
                                        href={res.file_url}
                                        download
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="practicum-resource-link group"
                                        data-testid={`practicum-resource-${mod.id}-${idx}`}
                                    >
                                        <div className="flex min-w-0 items-center gap-2">
                                            <ResourceIcon type={res.file_type} />
                                            <span className="font-medium group-hover:underline">{res.title}</span>
                                        </div>
                                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono border" style={{ borderColor: "var(--tnl-border)", color: "var(--tnl-body)" }}>
                                            {res.file_type?.toUpperCase() || "FILE"}
                                            {res.size_bytes ? ` · ${formatBytes(res.size_bytes)}` : ""}
                                        </span>
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                ) : null}

                {shifts.length ? (
                    <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--tnl-border)" }}>
                        <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>
                            <Clock className="h-3.5 w-3.5" />
                            {t("shift_schedule")}
                        </h4>
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left text-sm" aria-label={`${t("shift_schedule")} — ${pick(locale, mod.name, mod.name_id)}`}>
                                <thead>
                                    <tr className="border-b text-[11px] font-semibold" style={{ borderColor: "var(--tnl-border)", color: "var(--tnl-tan-text)" }}>
                                        <th scope="col" className="py-1.5 pr-2">{t("day")}</th>
                                        <th scope="col" className="py-1.5 px-2">{t("time_slot")}</th>
                                        <th scope="col" className="py-1.5 px-2">{t("coordinator")}</th>
                                        <th scope="col" className="py-1.5 pl-2">{t("room")}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y" style={{ borderColor: "var(--tnl-border)" }}>
                                    {shifts.map((sh, idx) => (
                                        <tr key={sh.id || idx}>
                                            <td className="py-2 pr-2 font-semibold" style={{ color: "var(--tnl-link)" }}>{sh.day}</td>
                                            <td className="py-2 px-2 whitespace-nowrap">{sh.time_slot}</td>
                                            <td className="py-2 px-2">{sh.coordinator_name}</td>
                                            <td className="py-2 pl-2 whitespace-nowrap" style={{ color: "var(--tnl-body)" }}>{sh.room || "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : locked && shiftCount ? (
                    <p className="mt-5 border-t pt-4 text-xs" style={{ borderColor: "var(--tnl-border)", color: "var(--tnl-body)" }}>
                        {fmt(t("practicum_locked_shifts"), shiftCount)}
                    </p>
                ) : null}

                {locked ? (
                    <div
                        className="mt-5 rounded-xl border p-4"
                        style={{ borderColor: "var(--tnl-border)" }}
                        data-testid={`practicum-assistant-lock-${mod.id}`}
                    >
                        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>
                            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                            {t("practicum_locked_title")}
                        </p>
                        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--tnl-body)" }}>
                            {t("practicum_locked_note")}
                        </p>
                        <Link
                            to={contactHref}
                            data-testid={`practicum-contact-cta-${mod.id}`}
                            className="mt-3 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors hover:opacity-80"
                            style={{ borderColor: "var(--tnl-border)", color: "var(--tnl-link)" }}
                        >
                            <MessageCircle className="h-4 w-4" aria-hidden="true" />
                            {t("contact_us")}
                        </Link>
                    </div>
                ) : null}
            </div>
        </article>
    );
}

export default function ActivityPage() {
    const { locale, t } = useLocale();
    const [params] = useSearchParams();
    // The approved header owns navigation; the URL is the single selection source.
    const tab = normalizeTab(params.get("tab"));
    const [equipCat, setEquipCat] = useState<string>("all");

    const { data: page } = usePage("activity");
    const pageBlocks = page?.blocks ?? [];

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
        <div className="activity-editorial" data-testid="activity-page">
            {pageBlocks.length ? <BlockRenderer blocks={pageBlocks} /> : (
                <header className="tnl-container activity-masthead">
                    <p className="activity-kicker">TNL / {t("nav_activity")}</p>
                    <h1>{t("nav_activity")}</h1>
                    <p>{t("events_subtitle")}</p>
                </header>
            )}


            <section className="tnl-section activity-collection">
                <div className="tnl-container">
                    {tab === "rd" ? (
                        <div role="region" id="activity-panel-rd" aria-label={t("nav_rd")} data-testid="activity-panel-rd">
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
                                <div className="research-collection">
                                    {clusters.map((p) => (
                                        <ProjectCard key={p.id} project={p} />
                                    ))}
                                </div>
                            )}

                            {testbeds.length ? (
                                <div className="mt-14">
                                    <SectionHeading title={t("testbeds")} count={testbeds.length} countLabel={t("testbeds").toLowerCase()} testId="testbeds-heading" />
                                    <div className="research-collection research-testbeds">
                                        {testbeds.map((p) => (
                                            <ProjectCard key={p.id} project={p} />
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            <div className="activity-equipment-section" id="equipment" data-testid="lab-equipment-section">
                                <SectionHeading
                                    title={t("lab_equipment")}
                                    count={filteredEquip.length}
                                    countLabel={locale === "id" ? "perangkat" : "items"}
                                    testId="equipment-heading"
                                />
                                <p className="mt-1 text-sm max-w-3xl" style={{ color: "var(--tnl-body)" }}>
                                    {t("equipment_subtitle")}
                                </p>

                                <div className="equipment-filters" role="group" aria-label={t("lab_equipment")}>
                                    {EQUIP_CATEGORIES.map((cat) => (
                                        <button
                                            key={cat.key}
                                            type="button"
                                            onClick={() => setEquipCat(cat.key)}
                                            aria-pressed={equipCat === cat.key}
                                            className="equipment-filter"
                                            style={
                                                equipCat === cat.key
                                                    ? { background: "var(--primary)", color: "var(--primary-foreground)", borderColor: "var(--primary)" }
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
                                    <div className="equipment-collection">
                                        {filteredEquip.map((item) => (
                                            <EquipmentCard key={item.id} item={item} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : null}

                    {tab === "practicum" ? (
                        <div role="region" id="activity-panel-practicum" aria-label={t("nav_practicum")} data-testid="activity-panel-practicum">
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
                                <div className="practicum-collection">
                                    {(practicum ?? []).map((mod, i) => (
                                        <PracticumCard key={mod.id} mod={mod} index={i} />
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : null}

                    {tab === "events" ? (
                        <div role="region" id="activity-panel-events" aria-label={t("nav_events")} data-testid="activity-panel-events">
                            <SectionHeading
                                title={t("events_heading")}
                                count={(events ?? []).length}
                                countLabel={locale === "id" ? "acara" : "events"}
                                testId="events-heading"
                            />
                            <p className="mt-1 text-sm max-w-3xl" style={{ color: "var(--tnl-body)" }}>
                                {t("events_subtitle")}
                            </p>
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
                                <div className="event-collection">
                                    {(events ?? []).map((ev) => (
                                        <EventCard key={ev.id} event={ev} />
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : null}

                    {tab === "assistant" ? (
                        <div role="region" id="activity-panel-assistant" aria-label={t("nav_assistant")} data-testid="activity-panel-assistant">
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
