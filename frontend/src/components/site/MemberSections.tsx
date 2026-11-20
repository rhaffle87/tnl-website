// Member page sections: Head of Laboratory feature banner, lecturer grid,
// assistants under batch tabs grouped by division with colored role chips,
// and a detail modal. Private fields only render when the admin enabled them.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { m, AnimatePresence } from "motion/react";
import { handleSpotlightPointerMove } from "@/components/site/SpotlightCard";
import { BookOpen, Briefcase, ExternalLink, FileText, Github, Instagram, Linkedin, Mail, Users, X } from "lucide-react";
import { pick, useLocale } from "@/lib/i18n";
import { useMembers, usePublications } from "@/lib/hooks";
import { EmptyState, SectionHeading, Spinner } from "@/components/site/Primitives";
import type { Member } from "@/lib/types";

const ACTIVE_DIVISIONS = ["BPH", "Academic", "Research", "Social", "Internal", "External"];
const ALUMNI_DIVISIONS = ["Coordinator", "Academics", "Event", "Media", "Research"];

function getInitials(name: string): string {
    if (!name) return "TNL";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function roleChip(member: Member, t: (k: never) => string): { label: string; bg: string; fg: string } {
    const pos = (member.position || "").toLowerCase();
    const label = member.position_label || member.position || (member.role === "assistant" ? "Assistant" : "");
    const div = member.division || "";

    // BPH or Coordinator (board)
    if (
        pos.includes("coordinator") ||
        pos.includes("koordinator") ||
        div === "BPH" ||
        div === "Coordinator"
    ) {
        return { label, bg: "#3B5243", fg: "#ffffff" };
    }

    // Division heads, co-heads, leads, vices
    if (
        pos.includes("head") ||
        pos.includes("lead") ||
        pos.includes("vice") ||
        pos.includes("kepala") ||
        pos.includes("wakil")
    ) {
        return { label, bg: "#8C7A5B", fg: "#ffffff" };
    }

    // Default staff / member
    return { label, bg: "#F3F4F6", fg: "#374151" };
}

function formatInstagram(raw?: string | null): { handle: string; url: string } | null {
    if (!raw) return null;
    const clean = raw.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, "");
    if (!clean) return null;
    return {
        handle: `@${clean}`,
        url: `https://instagram.com/${clean}`,
    };
}

function LightPlaceholder({ member, isModal }: { member: Member; isModal?: boolean }) {
    const initials = getInitials(member.name);
    return (
        <div
            className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-[#F6F7F6] to-[#E9EDE9] text-[#2C3E35] select-none ${
                isModal ? "p-8 min-h-[260px]" : "p-4"
            }`}
            aria-label={`Photo pending for ${member.name}`}
        >
            <div
                className={`flex items-center justify-center rounded-full bg-[#2C3E35]/10 border border-[#2C3E35]/20 font-bold text-[#2C3E35] shadow-inner ${
                    isModal ? "h-24 w-24 text-2xl" : "h-16 w-16 text-lg"
                }`}
            >
                {initials}
            </div>
            <span className="mt-2.5 text-[11px] font-mono font-medium text-stone-500 tracking-wider uppercase">
                Batch {member.batch || "2024"}
            </span>
            <span className="text-[10px] text-stone-400">Photo Pending</span>
        </div>
    );
}

function SocialLinks({ member }: { member: Member }) {
    const links = [
        { url: member.social?.scholar, Icon: ExternalLink, label: "Google Scholar" },
        { url: member.social?.sinta, Icon: ExternalLink, label: "SINTA" },
        { url: member.social?.scopus, Icon: ExternalLink, label: "Scopus" },
        { url: member.social?.linkedin, Icon: Linkedin, label: "LinkedIn" },
        { url: member.social?.github, Icon: Github, label: "GitHub" },
    ].filter((l) => l.url);
    if (!links.length) return null;
    return (
        <div className="mt-4 flex flex-wrap gap-2">
            {links.map(({ url, Icon, label }) => (
                <a
                    key={label}
                    href={url as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:border-[var(--tnl-green)] hover:text-[var(--tnl-green)]"
                    style={{ borderColor: "var(--tnl-border)" }}
                    data-testid={`member-social-${label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {label}
                </a>
            ))}
        </div>
    );
}

function HeadBanner({ member, onOpen }: { member: Member; onOpen: () => void }) {
    const { locale, t } = useLocale();
    return (
        <section className="tnl-section" data-testid="head-of-lab-banner">
            <div className="tnl-container">
                <div className="tnl-hero-gradient tnl-card rounded-2xl overflow-hidden p-6 md:p-8 shadow-xl border border-white/10">
                    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-8 items-center">
                        <div className="w-full max-w-[260px] mx-auto md:mx-0 aspect-[3/4] rounded-xl overflow-hidden shadow-lg border border-white/15 bg-[#17221C]">
                            {member.photo_url ? (
                                <img
                                    src={member.photo_url}
                                    alt={member.photo_alt || `Portrait of ${member.name}`}
                                    className="h-full w-full object-cover object-top"
                                    loading="lazy"
                                />
                            ) : (
                                <LightPlaceholder member={member} isModal />
                            )}
                        </div>
                        <div className="flex flex-col justify-center text-[#F5F2EB]">
                            <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: "var(--tnl-tan)" }}>
                                {t("head_of_lab")}
                            </p>
                            <h2 className="tnl-h3 mt-1.5 text-[24px] sm:text-[30px]" style={{ color: "#ffffff" }} data-testid="head-of-lab-name">
                                {member.name}
                            </h2>
                            <p className="mt-3 text-sm leading-relaxed" style={{ color: "#dfe2e5" }}>
                                {pick(locale, member.bio, member.bio_id)}
                            </p>
                            {member.quote || member.quote_id ? (
                                <blockquote
                                    className="tnl-quote mt-4 border-l-4 pl-4 text-[15px] sm:text-[16px] leading-relaxed italic"
                                    style={{ borderColor: "var(--tnl-tan)", color: "#ffffff" }}
                                    data-testid="head-of-lab-quote"
                                >
                                    “{pick(locale, member.quote, member.quote_id)}”
                                </blockquote>
                            ) : null}
                            <div className="mt-5 flex flex-wrap items-center gap-4 pt-3 border-t border-white/10">
                                {member.email_public ? (
                                    <a
                                        href={`mailto:${member.email_public}`}
                                        className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
                                        style={{ color: "var(--tnl-tan)" }}
                                        data-testid="head-of-lab-email-link"
                                    >
                                        <Mail className="h-4 w-4" aria-hidden="true" />
                                        {member.email_public}
                                    </a>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={onOpen}
                                    className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-[var(--tnl-tan)] text-[#111518] hover:bg-white transition-colors shadow-sm"
                                >
                                    View full profile & publications →
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

function MemberCard({ member, onOpen, testId }: { member: Member; onOpen: () => void; testId: string }) {
    const { locale, t } = useLocale();
    const chip = roleChip(member, t as never);
    return (
        <button
            type="button"
            onClick={onOpen}
            onPointerMove={handleSpotlightPointerMove}
            className="tnl-card tnl-card-hover tnl-card-spotlight tnl-scroll-reveal flex flex-col overflow-hidden p-0 text-left transition-all duration-300 hover:shadow-md"
            data-testid={testId}
        >
            <div className="tnl-parallax-media relative aspect-[3/4] w-full overflow-hidden bg-[#E5E7EB]">
                {member.photo_url ? (
                    <img
                        src={member.photo_url}
                        alt={member.photo_alt || `Portrait of ${member.name}`}
                        className="h-full w-full object-cover object-top transition-transform duration-300 hover:scale-105"
                        loading="lazy"
                    />
                ) : (
                    <LightPlaceholder member={member} />
                )}
            </div>
            <div className="flex flex-1 flex-col p-4">
                <span
                    className="mb-2 inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                    style={{ background: chip.bg, color: chip.fg }}
                >
                    {chip.label}
                </span>
                <h3 className="text-[15px] font-bold leading-snug">{member.name}</h3>
                {member.batch ? (
                    <p className="mt-1 text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                        Batch {member.batch}
                    </p>
                ) : member.division ? (
                    <p className="mt-1 text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                        {member.division}
                    </p>
                ) : null}
                {member.projects && member.projects.length > 0 ? (
                    <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: "var(--tnl-tan-text)" }}>
                        <Briefcase className="h-3 w-3" aria-hidden="true" />
                        {member.projects.length} {locale === "id" ? "Proyek Riset" : "Projects"}
                    </span>
                ) : null}
                {member.social?.linkedin ? (
                    <div className="mt-2">
                        <a
                            href={member.social.linkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#0A66C2] hover:underline"
                            aria-label={`${member.name} LinkedIn`}
                            data-testid={`member-card-linkedin-${member.id}`}
                        >
                            <Linkedin className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span>LinkedIn</span>
                        </a>
                    </div>
                ) : null}
                <span className="mt-3 text-xs font-semibold" style={{ color: "var(--tnl-green)" }}>
                    {t("view_profile")} →
                </span>
            </div>
            <span className="sr-only">{pick(locale, member.bio, member.bio_id)}</span>
        </button>
    );
}

function MemberModal({ member, onClose }: { member: Member; onClose: () => void }) {
    const { locale, t } = useLocale();
    const chip = roleChip(member, t as never);
    const { data: memberPubs } = usePublications({ member_id: member.id });
    const ig = formatInstagram(member.social?.instagram);

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-modal-name"
            data-testid="member-detail-modal"
        >
            <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
                aria-hidden="true"
            />
            <m.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                data-lenis-prevent
                className="tnl-card relative z-10 max-h-[88vh] w-full max-w-2xl overflow-y-auto p-0"
            >
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 transition-colors hover:bg-white shadow"
                    aria-label={t("close")}
                    data-testid="member-modal-close-button"
                >
                    <X className="h-4 w-4" style={{ color: "#111518" }} />
                </button>
                <div className="grid sm:grid-cols-[0.4fr_0.6fr]">
                    <div className="aspect-[3/4] sm:aspect-auto w-full bg-[#E5E7EB] overflow-hidden" style={{ minHeight: 240 }}>
                        {member.photo_url ? (
                            <img
                                src={member.photo_url}
                                alt={member.photo_alt || `Portrait of ${member.name}`}
                                className="h-full w-full object-cover object-top"
                            />
                        ) : (
                            <LightPlaceholder member={member} isModal />
                        )}
                    </div>
                    <div className="p-6 sm:p-8">
                        <span
                            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold"
                            style={{ background: chip.bg, color: chip.fg }}
                        >
                            {chip.label}
                        </span>
                        <h2 id="member-modal-name" className="tnl-h4 mt-3 text-[22px]">
                            {member.name}
                        </h2>
                        {member.division ? (
                            <p className="mt-1 text-sm font-medium" style={{ color: "var(--tnl-tan-text)" }}>
                                {t("division")}: {member.division}
                            </p>
                        ) : null}
                        {member.batch ? (
                            <p className="text-sm" style={{ color: "var(--tnl-tan-text)" }}>
                                {t("batch")}: {member.batch}
                            </p>
                        ) : null}
                        {member.show_nim && member.nim ? (
                            <p className="mt-1 text-sm font-mono text-[var(--tnl-body)]">
                                {member.role === "lecturer" ? "NIP" : "NRP"}: {member.nim}
                            </p>
                        ) : null}
                        <p className="mt-4 text-sm leading-relaxed text-[var(--tnl-body)]">
                            {pick(locale, member.bio, member.bio_id)}
                        </p>
                        {member.expertise?.length ? (
                            <div className="mt-4">
                                <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>
                                    {t("expertise")}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {member.expertise.map((e) => (
                                        <span key={e} className="tnl-count-chip">
                                            {e}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        <div className="mt-4 flex flex-col gap-2">
                            {member.email_public ? (
                                <a
                                    href={`mailto:${member.email_public}`}
                                    className="inline-flex items-center gap-2 text-sm font-medium"
                                    style={{ color: "var(--tnl-green)" }}
                                    data-testid="member-modal-email-link"
                                >
                                    <Mail className="h-4 w-4" aria-hidden="true" />
                                    {member.email_public}
                                </a>
                            ) : null}
                            {member.social?.linkedin ? (
                                <a
                                    href={member.social.linkedin}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 text-sm font-medium text-[#0A66C2] hover:underline"
                                    data-testid="member-modal-linkedin-link"
                                >
                                    <Linkedin className="h-4 w-4" aria-hidden="true" />
                                    LinkedIn Profile
                                </a>
                            ) : null}
                            {ig ? (
                                <a
                                    href={ig.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 text-sm font-medium text-pink-700 hover:underline"
                                >
                                    <Instagram className="h-4 w-4" aria-hidden="true" />
                                    {ig.handle}
                                </a>
                            ) : null}
                        </div>
                        {member.show_personal_email && member.email_personal ? (
                            <p className="mt-2 text-sm text-[var(--tnl-body)]">{member.email_personal}</p>
                        ) : null}
                        {member.social?.cv_url ? (
                            <a
                                href={member.social.cv_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="tnl-btn tnl-btn-outline mt-5 h-10 min-h-[40px] text-sm"
                                data-testid="member-modal-cv-link"
                            >
                                <FileText className="h-4 w-4" aria-hidden="true" />
                                {t("cv")}
                            </a>
                        ) : null}
                        {memberPubs && memberPubs.length > 0 ? (
                            <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--tnl-border)" }} data-testid={`member-publications-${member.id}`}>
                                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>
                                    <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                                    Selected Publications at TNL ({memberPubs.length})
                                </div>
                                <div className="mt-2.5 space-y-2">
                                    {memberPubs.map((pub) => (
                                        <div key={pub.id} className="rounded-lg border p-2.5 text-xs transition-colors hover:border-[var(--tnl-green)]" style={{ borderColor: "var(--tnl-border)" }}>
                                            <p className="font-semibold text-[var(--tnl-body)]">{pub.title}</p>
                                            <div className="mt-1 flex flex-wrap items-center gap-2" style={{ color: "var(--tnl-tan-text)" }}>
                                                <span>{pub.year}</span>
                                                {pub.venue && <span>· {pub.venue}</span>}
                                                {pub.doi && (
                                                    <a
                                                        href={`https://doi.org/${pub.doi}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 font-semibold text-[var(--tnl-green)] hover:underline"
                                                    >
                                                        DOI <ExternalLink className="h-3 w-3" />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        {member.projects && member.projects.length > 0 ? (
                            <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--tnl-border)" }} data-testid={`member-projects-${member.id}`}>
                                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>
                                    <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
                                    {locale === "id" ? "Proyek Penelitian & Hibah" : "Research Projects & Grants"} ({member.projects.length})
                                </div>
                                <div className="mt-2.5 space-y-2.5">
                                    {member.projects.map((proj, idx) => (
                                        <div
                                            key={idx}
                                            className="rounded-lg border p-3 text-xs transition-colors hover:border-[var(--tnl-green)]"
                                            style={{ borderColor: "var(--tnl-border)" }}
                                            data-testid={`member-project-item-${idx}`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="font-semibold text-[var(--tnl-body)]">{proj.title}</p>
                                                {proj.year ? (
                                                    <span className="shrink-0 font-mono text-[10px] text-[var(--tnl-tan-text)]">{proj.year}</span>
                                                ) : null}
                                            </div>
                                            {proj.funding ? (
                                                <span
                                                    className="mt-1.5 inline-block rounded px-2 py-0.5 text-[10px] font-semibold"
                                                    style={{
                                                        background: "color-mix(in srgb, var(--tnl-tan) 18%, transparent)",
                                                        color: "var(--tnl-tan-text)",
                                                    }}
                                                >
                                                    {proj.funding}
                                                </span>
                                            ) : null}
                                            {proj.description ? (
                                                <p className="mt-2 text-xs text-[var(--tnl-body)] opacity-90 leading-relaxed">
                                                    {proj.description}
                                                </p>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        <SocialLinks member={member} />
                    </div>
                </div>
            </m.div>
        </div>
    );
}

export function MemberSections() {
    const { locale, t } = useLocale();
    const [statusFilter, setStatusFilter] = useState<"active" | "alumni">("active");
    // Fetch all members so switching to alumni never removes lecturers or Head of Lab
    const { data: members, isLoading } = useMembers();
    const [selected, setSelected] = useState<Member | null>(null);
    const [searchParams] = useSearchParams();
    const highlightId = searchParams.get("highlight");

    const list = useMemo(() => members ?? [], [members]);

    useEffect(() => {
        if (highlightId && list.length) {
            const found = list.find((m) => m.id === highlightId);
            if (found) setSelected(found);
        }
    }, [highlightId, list]);

    // Head of Lab and Lecturers are always active
    const head = list.find((m) => m.is_head && m.status === "active") || list.find((m) => m.is_head);
    const lecturers = list.filter((m) => !m.is_head && (m.role === "lecturer" || m.role === "researcher") && m.status === "active");

    // Assistants filtered strictly by statusFilter
    const assistants = useMemo(() => {
        return list.filter((m) => (m.role === "assistant" || m.role === "alumni") && m.status === statusFilter);
    }, [list, statusFilter]);

    // Available batches for alumni
    const alumniBatches = useMemo(
        () => Array.from(new Set(list.filter((m) => m.status === "alumni").map((a) => a.batch).filter(Boolean))).sort() as string[],
        [list],
    );
    const [alumniBatch, setAlumniBatch] = useState<string | null>(null);
    const activeAlumniBatch = alumniBatch && alumniBatches.includes(alumniBatch) ? alumniBatch : alumniBatches[0] ?? null;

    // Filtered assistants based on active vs alumni batch selection
    const currentAssistants = useMemo(() => {
        if (statusFilter === "active") {
            return assistants;
        }
        if (activeAlumniBatch) {
            return assistants.filter((a) => a.batch === activeAlumniBatch);
        }
        return assistants;
    }, [assistants, statusFilter, activeAlumniBatch]);

    // Group assistants by division with consistent 5-column grid
    const groups = useMemo(() => {
        const out: { label: string; members: Member[] }[] = [];
        const orderMap: Record<string, number> = { coordinator: 0, head: 1, vice: 2, staff: 3, member: 4 };
        const divisions = statusFilter === "active" ? ACTIVE_DIVISIONS : ALUMNI_DIVISIONS;

        for (const div of divisions) {
            const inDiv = currentAssistants
                .filter((m) => (m.division || "").toLowerCase() === div.toLowerCase())
                .sort((a, b) => {
                    const roleA = orderMap[(a.position || "").toLowerCase()] ?? 99;
                    const roleB = orderMap[(b.position || "").toLowerCase()] ?? 99;
                    if (roleA !== roleB) return roleA - roleB;
                    // Batch 2023 before Batch 2024
                    if (a.batch !== b.batch) return (a.batch || "").localeCompare(b.batch || "");
                    return a.order - b.order;
                });

            if (inDiv.length > 0) {
                out.push({ label: div, members: inDiv });
            }
        }

        // Remaining members if any
        const remaining = currentAssistants.filter(
            (m) => !divisions.some((d) => d.toLowerCase() === (m.division || "").toLowerCase())
        );
        if (remaining.length > 0) {
            out.push({ label: "Other Members", members: remaining });
        }

        return out;
    }, [currentAssistants, statusFilter]);

    return (
        <>
            {head ? <HeadBanner member={head} onOpen={() => setSelected(head)} /> : null}

            <section className="tnl-section pt-0" data-testid="lecturers-section">
                <div className="tnl-container">
                    <SectionHeading
                        title={t("lecturers")}
                        count={lecturers.length}
                        countLabel={t("members_count")}
                        testId="lecturers-heading"
                    />
                    {isLoading ? (
                        <Spinner label={t("loading")} />
                    ) : lecturers.length === 0 ? (
                        <EmptyState title={t("coming_soon")} body={t("empty_members")} testId="lecturers-empty-state" />
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl">
                            {lecturers.map((m) => (
                                <MemberCard key={m.id} member={m} onOpen={() => setSelected(m)} testId={`lecturer-card-${m.id}`} />
                            ))}
                        </div>
                    )}
                </div>
            </section>

            <section className="tnl-section pt-0" style={{ background: "var(--tnl-surface)" }} data-testid="assistants-section">
                <div className="tnl-container pt-[50px] md:pt-[60px]">
                    <SectionHeading
                        title={t("assistants")}
                        count={currentAssistants.length}
                        countLabel={t("members_count")}
                        testId="assistants-heading"
                    />

                    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                        {/* Left: Clean batch badge / tab */}
                        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("batch")}>
                            {statusFilter === "active" ? (
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={true}
                                    className="rounded-full border px-4 py-2 text-sm font-medium transition-colors"
                                    style={{ background: "var(--tnl-green)", color: "#fff", borderColor: "var(--tnl-green)" }}
                                    data-testid="member-batch-2023-2024-tab"
                                >
                                    Batch 2023 / 2024
                                </button>
                            ) : (
                                alumniBatches.map((b) => (
                                    <button
                                        key={b}
                                        type="button"
                                        role="tab"
                                        aria-selected={activeAlumniBatch === b}
                                        onClick={() => setAlumniBatch(b)}
                                        className="relative rounded-full border px-4 py-2 text-sm font-medium transition-colors"
                                        style={{
                                            borderColor: activeAlumniBatch === b ? "var(--tnl-green)" : "var(--tnl-border)",
                                        }}
                                        data-testid={`member-batch-${b.replace("/", "-")}-tab`}
                                    >
                                        {activeAlumniBatch === b ? (
                                            <m.span
                                                layoutId="member-alumni-batch-pill"
                                                className="absolute inset-0 rounded-full"
                                                style={{ background: "var(--tnl-green)" }}
                                                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                                            />
                                        ) : null}
                                        <span
                                            className="relative z-10"
                                            style={{ color: activeAlumniBatch === b ? "#fff" : "inherit" }}
                                        >
                                            Batch {b}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>

                        {/* Right: Active vs Alumni toggle */}
                        <div className="flex gap-2">
                            {(["active", "alumni"] as const).map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setStatusFilter(s)}
                                    className="relative rounded-full border px-4 py-2 text-sm font-medium transition-colors"
                                    style={{
                                        borderColor: statusFilter === s ? "var(--tnl-tan)" : "var(--tnl-border)",
                                    }}
                                    data-testid={`member-status-${s}-filter`}
                                >
                                    {statusFilter === s ? (
                                        <m.span
                                            layoutId="member-status-pill"
                                            className="absolute inset-0 rounded-full"
                                            style={{ background: "var(--tnl-tan)" }}
                                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                                        />
                                    ) : null}
                                    <span
                                        className="relative z-10"
                                        style={{ color: statusFilter === s ? "#111518" : "inherit" }}
                                    >
                                        {s === "active" ? t("active") : t("alumni")}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {isLoading ? (
                        <Spinner label={t("loading")} />
                    ) : groups.length === 0 ? (
                        <EmptyState
                            title={t("coming_soon")}
                            body={t("empty_members")}
                            testId="assistants-empty-state"
                            icon={<Users className="h-7 w-7" style={{ color: "var(--tnl-tan-text)" }} />}
                        />
                    ) : (
                        <div className="space-y-12">
                            {groups.map((group) => (
                                <div key={group.label} data-testid={`division-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`}>
                                    <div className="mb-4 flex items-center gap-3">
                                        <h3 className="text-[19px] font-bold">{group.label}</h3>
                                        <span className="tnl-count-chip">
                                            {group.members.length} {t("members_count")}
                                        </span>
                                    </div>
                                    {/* Consistent 5-column grid for ALL divisions */}
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                        {group.members.map((m) => (
                                            <MemberCard key={m.id} member={m} onOpen={() => setSelected(m)} testId={`assistant-card-${m.id}`} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            <AnimatePresence>
                {selected ? <MemberModal member={selected} onClose={() => setSelected(null)} /> : null}
            </AnimatePresence>
            <span className="sr-only">{locale}</span>
        </>
    );
}

export function MemberSectionsPlaceholder() {
    return null;
}
