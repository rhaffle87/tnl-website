// Member page sections: Head of Laboratory feature banner, lecturer grid,
// assistants under batch tabs grouped by division with colored role chips,
// and a detail modal. Private fields only render when the admin enabled them.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, ExternalLink, FileText, Github, Instagram, Linkedin, Mail, Users, X } from "lucide-react";
import { pick, useLocale } from "@/lib/i18n";
import { useMembers, usePublications } from "@/lib/hooks";
import { EmptyState, SectionHeading, Spinner } from "@/components/site/Primitives";
import type { Member } from "@/lib/types";

const ROLE_CHIP: Record<string, { bg: string; fg: string; key: string }> = {
    coordinator: { bg: "#43594A", fg: "#ffffff", key: "role_coordinator" },
    head: { bg: "#7f715c", fg: "#ffffff", key: "role_head" },
    vice: { bg: "#a8977b", fg: "#111518", key: "role_vice" },
    staff: { bg: "#eaeaec", fg: "#3f4245", key: "role_staff" },
};

function roleChip(member: Member, t: (k: never) => string): { label: string; bg: string; fg: string } {
    const spec = ROLE_CHIP[member.position ?? ""] ?? ROLE_CHIP.staff;
    const label = member.position_label || (spec.key ? t(spec.key as never) : member.position || "");
    return { label, bg: spec.bg, fg: spec.fg };
}

function SocialLinks({ member }: { member: Member }) {
    const links = [
        { url: member.social?.scholar, Icon: ExternalLink, label: "Google Scholar" },
        { url: member.social?.sinta, Icon: ExternalLink, label: "SINTA" },
        { url: member.social?.scopus, Icon: ExternalLink, label: "Scopus" },
        { url: member.social?.instagram, Icon: Instagram, label: "Instagram" },
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

function HeadBanner({ member }: { member: Member }) {
    const { locale, t } = useLocale();
    return (
        <section className="tnl-section" data-testid="head-of-lab-banner">
            <div className="tnl-container">
                <div className="tnl-hero-gradient tnl-card grid overflow-hidden p-0 lg:grid-cols-[0.38fr_0.62fr]">
                    <div className="relative flex items-end justify-center overflow-hidden" style={{ minHeight: 280 }}>
                        {member.photo_url ? (
                            <img
                                src={member.photo_url}
                                alt={member.photo_alt || `Portrait of ${member.name}`}
                                className="h-full w-full object-cover"
                                loading="lazy"
                            />
                        ) : null}
                        <div
                            className="pointer-events-none absolute inset-0"
                            style={{ background: "linear-gradient(90deg, transparent 40%, #1c2720 100%)" }}
                            aria-hidden="true"
                        />
                    </div>
                    <div className="p-8 sm:p-10">
                        <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: "var(--tnl-tan)" }}>
                            {t("head_of_lab")}
                        </p>
                        <h2 className="tnl-h3 mt-2 text-[24px] sm:text-[30px]" style={{ color: "#ffffff" }} data-testid="head-of-lab-name">
                            {member.name}
                        </h2>
                        <p className="mt-4 text-sm leading-relaxed" style={{ color: "#dfe2e5" }}>
                            {pick(locale, member.bio, member.bio_id)}
                        </p>
                        {member.quote || member.quote_id ? (
                            <blockquote
                                className="tnl-quote mt-5 border-l-4 pl-4 text-[17px] leading-relaxed"
                                style={{ borderColor: "var(--tnl-tan)", color: "#ffffff" }}
                                data-testid="head-of-lab-quote"
                            >
                                “{pick(locale, member.quote, member.quote_id)}”
                            </blockquote>
                        ) : null}
                        {member.email_public ? (
                            <a
                                href={`mailto:${member.email_public}`}
                                className="mt-5 inline-flex items-center gap-2 text-sm font-medium"
                                style={{ color: "var(--tnl-tan)" }}
                                data-testid="head-of-lab-email-link"
                            >
                                <Mail className="h-4 w-4" aria-hidden="true" />
                                {member.email_public}
                            </a>
                        ) : null}
                        <SocialLinks member={member} />
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
            className="tnl-card tnl-card-hover flex flex-col overflow-hidden p-0 text-left"
            data-testid={testId}
        >
            <div className="relative" style={{ aspectRatio: "1 / 1", background: "var(--tnl-surface)" }}>
                {member.photo_url ? (
                    <img
                        src={member.photo_url}
                        alt={member.photo_alt || `Portrait of ${member.name}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                    />
                ) : null}
            </div>
            <div className="flex flex-1 flex-col p-4">
                <span
                    className="mb-2 inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                    style={{ background: chip.bg, color: chip.fg }}
                >
                    {chip.label}
                </span>
                <h3 className="text-[15px] font-bold leading-snug">{member.name}</h3>
                {member.division ? (
                    <p className="mt-1 text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                        {member.division}
                    </p>
                ) : null}
                <span className="mt-3 text-xs font-semibold" style={{ color: "var(--tnl-green)" }}>
                    {t("view_profile")}
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
    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-modal-name"
            data-testid="member-detail-modal"
        >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} aria-hidden="true" />
            <div className="tnl-card relative z-10 max-h-[88vh] w-full max-w-2xl overflow-y-auto p-0 animate-pop">
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 transition-colors hover:bg-white"
                    aria-label={t("close")}
                    data-testid="member-modal-close-button"
                >
                    <X className="h-4 w-4" style={{ color: "#111518" }} />
                </button>
                <div className="grid sm:grid-cols-[0.4fr_0.6fr]">
                    <div style={{ background: "var(--tnl-surface)", minHeight: 220 }}>
                        {member.photo_url ? (
                            <img
                                src={member.photo_url}
                                alt={member.photo_alt || `Portrait of ${member.name}`}
                                className="h-full w-full object-cover"
                            />
                        ) : null}
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
                            <p className="mt-1 text-sm" style={{ color: "var(--tnl-tan-text)" }}>
                                {t("division")}: {member.division}
                            </p>
                        ) : null}
                        {member.batch ? (
                            <p className="text-sm" style={{ color: "var(--tnl-tan-text)" }}>
                                {t("batch")}: {member.batch}
                            </p>
                        ) : null}
                        <p className="mt-4 text-sm leading-relaxed text-[var(--tnl-body)]">{pick(locale, member.bio, member.bio_id)}</p>
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
                        {member.email_public ? (
                            <a
                                href={`mailto:${member.email_public}`}
                                className="mt-4 inline-flex items-center gap-2 text-sm font-medium"
                                style={{ color: "var(--tnl-green)" }}
                                data-testid="member-modal-email-link"
                            >
                                <Mail className="h-4 w-4" aria-hidden="true" />
                                {member.email_public}
                            </a>
                        ) : null}
                        {/* Private fields render only when the admin enabled them for this person. */}
                        {member.show_personal_email && member.email_personal ? (
                            <p className="mt-2 text-sm text-[var(--tnl-body)]">{member.email_personal}</p>
                        ) : null}
                        {member.show_nim && member.nim ? (
                            <p className="mt-1 text-sm text-[var(--tnl-body)]">NIM/NRP: {member.nim}</p>
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
                        <SocialLinks member={member} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export function MemberSections() {
    const { locale, t } = useLocale();
    const [statusFilter, setStatusFilter] = useState<"active" | "alumni">("active");
    const { data: members, isLoading } = useMembers({ status: statusFilter });
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
    const head = list.find((m) => m.is_head);
    const lecturers = list.filter((m) => !m.is_head && (m.role === "lecturer" || m.role === "researcher"));
    const assistants = list.filter((m) => m.role === "assistant");
    const batches = useMemo(
        () => Array.from(new Set(assistants.map((a) => a.batch).filter(Boolean))).sort() as string[],
        [assistants],
    );
    const [batch, setBatch] = useState<string | null>(null);
    const activeBatch = batch && batches.includes(batch) ? batch : batches[0] ?? null;
    const batchMembers = assistants.filter((a) => a.batch === activeBatch);

    // Coordinator first, then one group per division.
    const groups = useMemo(() => {
        const coordinators = batchMembers.filter((m) => m.position === "coordinator");
        const divisions = Array.from(new Set(batchMembers.filter((m) => m.division).map((m) => m.division as string)));
        const out: { label: string; members: Member[] }[] = [];
        if (coordinators.length) out.push({ label: t("role_coordinator"), members: coordinators });
        for (const d of divisions) {
            const order = { head: 0, vice: 1, staff: 2, member: 3 } as Record<string, number>;
            const inDivision = batchMembers
                .filter((m) => m.division === d && m.position !== "coordinator")
                .sort((a, b) => (order[a.position ?? "staff"] ?? 9) - (order[b.position ?? "staff"] ?? 9));
            if (inDivision.length) out.push({ label: d, members: inDivision });
        }
        return out;
    }, [batchMembers, t]);

    return (
        <>
            {head ? <HeadBanner member={head} /> : null}

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
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
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
                        count={batchMembers.length}
                        countLabel={t("members_count")}
                        testId="assistants-heading"
                    />

                    <div className="mb-6 flex flex-wrap items-center gap-2">
                        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("batch")}>
                            {batches.map((b) => (
                                <button
                                    key={b}
                                    type="button"
                                    role="tab"
                                    aria-selected={activeBatch === b}
                                    onClick={() => setBatch(b)}
                                    className="rounded-full border px-4 py-2 text-sm font-medium transition-colors"
                                    style={
                                        activeBatch === b
                                            ? { background: "var(--tnl-green)", color: "#fff", borderColor: "var(--tnl-green)" }
                                            : { borderColor: "var(--tnl-border)", background: "var(--card)" }
                                    }
                                    data-testid={`member-batch-${b.replace("/", "-")}-tab`}
                                >
                                    {b}
                                </button>
                            ))}
                        </div>
                        <div className="ml-auto flex gap-2">
                            {(["active", "alumni"] as const).map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setStatusFilter(s)}
                                    className="rounded-full border px-4 py-2 text-sm font-medium transition-colors"
                                    style={
                                        statusFilter === s
                                            ? { background: "var(--tnl-tan)", color: "#111518", borderColor: "var(--tnl-tan)" }
                                            : { borderColor: "var(--tnl-border)", background: "var(--card)" }
                                    }
                                    data-testid={`member-status-${s}-filter`}
                                >
                                    {s === "active" ? t("active") : t("alumni")}
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
                        <div className="space-y-10">
                            {groups.map((group) => (
                                <div key={group.label} data-testid={`division-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`}>
                                    <div className="mb-4 flex items-center gap-3">
                                        <h3 className="text-[19px] font-bold">{group.label}</h3>
                                        <span className="tnl-count-chip">
                                            {group.members.length} {t("members_count")}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
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

            {selected ? <MemberModal member={selected} onClose={() => setSelected(null)} /> : null}
            <span className="sr-only">{locale}</span>
        </>
    );
}

export function MemberSectionsPlaceholder() {
    return null;
}
