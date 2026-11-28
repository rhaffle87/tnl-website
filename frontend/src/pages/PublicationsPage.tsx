// Publications: filter by year and type, link out to DOI / publisher.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, FileText, Copy, Users } from "lucide-react";
import { toast } from "sonner";
import { usePage, usePublications } from "@/lib/api/hooks";
import type { Publication } from "@/lib/types/types";
import { useLocale } from "@/lib/i18n/i18n";
import { EmptyState, SectionHeading } from "@/components/site/Primitives";

import { BlockRenderer } from "@/components/site/Blocks";
import "./editorial-content.css";

export default function PublicationsPage() {
    const { t, locale } = useLocale();
    const { data: page } = usePage("publications");
    const { data: publications, isLoading } = usePublications();
    const [year, setYear] = useState<string>("");
    const [ptype, setPtype] = useState<string>("");

    const list = useMemo(() => publications ?? [], [publications]);
    const years = useMemo(
        () => Array.from(new Set(list.map((p) => p.year).filter(Boolean))).sort((a, b) => Number(b) - Number(a)),
        [list],
    );
    const types = useMemo(() => Array.from(new Set(list.map((p) => p.ptype).filter(Boolean))), [list]);
    const filtered = list.filter(
        (p) => (!year || String(p.year) === year) && (!ptype || p.ptype === ptype),
    );

    const heroBlocks = (page?.blocks ?? []).filter((b) => b.type === "inner_hero");
    // Built as single strings: a multi-expression child inside <option> is invalid HTML.
    const yearAllLabel = `${t("year")}: ${t("all_categories")}`;
    const typeAllLabel = `${t("category")}: ${t("all_categories")}`;

    const copyCitation = async (pub: Publication) => {
        const authors = pub.authors?.trim() ? `${pub.authors.replace(/\.$/, "")}. ` : "";
        const year = pub.year ? `(${pub.year}). ` : "";
        const venue = pub.venue ? `${pub.venue.replace(/\.$/, "")}. ` : "";
        const link = pub.doi ? `https://doi.org/${pub.doi}` : pub.url || "";
        const citation = `${authors}${pub.title}. ${year}${venue}${link}`.replace(/\s+/g, " ").trim();
        try {
            await navigator.clipboard.writeText(citation);
            toast.success(locale === "id" ? "Sitasi disalin ke papan klip." : "Citation copied to clipboard.");
        } catch {
            toast.error(locale === "id" ? "Gagal menyalin sitasi." : "Failed to copy citation.");
        }
    };

    return (
        <div className="editorial-content editorial-publications" data-testid="publications-page">
            <BlockRenderer blocks={heroBlocks} />
            <section className="tnl-section" style={{ background: "var(--tnl-surface)" }}>
                <div className="tnl-container editorial-bibliography-layout">
                    <SectionHeading
                        title={t("nav_publications")}
                        count={filtered.length}
                        countLabel={t("nav_publications").toLowerCase()}
                        testId="publications-heading"
                    />

                    {list.length ? (
                        <div className="editorial-publication-filters" role="group" aria-label={locale === "id" ? "Filter publikasi" : "Publication filters"}>
                            <select
                                value={year}
                                onChange={(e) => setYear(e.target.value)}
                                className="tnl-field sm:max-w-[180px]"
                                aria-label={t("year")}
                                data-testid="publications-year-filter"
                            >
                                <option value="">{yearAllLabel}</option>
                                {years.map((y) => (
                                    <option key={y} value={String(y)}>
                                        {y}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={ptype}
                                onChange={(e) => setPtype(e.target.value)}
                                className="tnl-field sm:max-w-[200px]"
                                aria-label={t("category")}
                                data-testid="publications-type-filter"
                            >
                                <option value="">{typeAllLabel}</option>
                                {types.map((p) => (
                                    <option key={p} value={p}>
                                        {p}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : null}

                    {isLoading ? (
                        <div className="space-y-4 animate-pulse pt-2" data-testid="publications-skeleton">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="rounded-xl border border-[var(--tnl-border)] p-6 bg-black/[0.02] dark:bg-white/[0.02] space-y-3">
                                    <div className="flex gap-2">
                                        <div className="h-5 w-20 rounded bg-black/10 dark:bg-white/10" />
                                        <div className="h-5 w-12 rounded bg-black/10 dark:bg-white/10" />
                                    </div>
                                    <div className="h-6 w-3/4 rounded bg-black/10 dark:bg-white/10" />
                                    <div className="h-4 w-1/2 rounded bg-black/5 dark:bg-white/5" />
                                </div>
                            ))}
                        </div>
                    ) : filtered.length === 0 ? (
                        <EmptyState
                            title={t("coming_soon")}
                            body={t("empty_publications")}
                            testId="publications-empty-state"
                            icon={<FileText className="h-7 w-7" style={{ color: "var(--tnl-tan-text)" }} />}
                        />
                    ) : (
                        <ol className="editorial-bibliography" aria-label={t("nav_publications")}>
                            {filtered.map((pub) => (
                                <li key={pub.id}>
                                <article
                                    className="editorial-publication"
                                    data-testid={`publication-${pub.id}`}
                                >
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="tnl-count-chip">{pub.ptype}</span>
                                        {pub.year ? (
                                            <span className="text-sm" style={{ color: "var(--tnl-body)" }}>
                                                {pub.year}
                                            </span>
                                        ) : null}
                                    </div>
                                    <h3 className="mt-3 text-[19px] font-bold leading-snug">{pub.title}</h3>
                                    {pub.authors ? (
                                        <p className="mt-1.5 text-sm" style={{ color: "var(--tnl-body)" }}>
                                            {pub.authors}
                                        </p>
                                    ) : null}
                                    {pub.linked_members && pub.linked_members.length > 0 ? (
                                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5" data-testid={`publication-linked-members-${pub.id}`}>
                                            <span className="text-xs font-semibold" style={{ color: "var(--tnl-tan-text)" }}>
                                                {locale === "id" ? "Tim TNL:" : "TNL Team:"}
                                            </span>
                                            {pub.linked_members.map((m) => (
                                                <Link
                                                    key={m.id}
                                                    to={`/member?highlight=${m.id}`}
                                                    className="editorial-author-link"
                                                    data-testid={`pub-author-link-${pub.id}-${m.id}`}
                                                >
                                                    <Users className="h-3 w-3" />
                                                    {m.name}
                                                </Link>
                                            ))}
                                        </div>
                                    ) : null}
                                    {pub.venue ? (
                                        <p className="mt-0.5 text-sm italic" style={{ color: "var(--tnl-tan-text)" }}>
                                            {pub.venue}
                                        </p>
                                    ) : null}
                                    {pub.abstract ? (
                                        <p className="mt-3 text-sm leading-relaxed text-[var(--tnl-body)]">{pub.abstract}</p>
                                    ) : null}
                                    {pub.url || pub.doi ? (
                                        <a
                                            href={pub.url || `https://doi.org/${pub.doi}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold"
                                            style={{ color: "var(--tnl-link)" }}
                                            data-testid={`publication-link-${pub.id}`}
                                        >
                                            {pub.doi ? `DOI ${pub.doi}` : t("read_more")}
                                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                                        </a>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={() => copyCitation(pub)}
                                        className="mt-4 ml-3 inline-flex items-center gap-1.5 text-sm font-semibold"
                                        style={{ color: "var(--tnl-link)" }}
                                        data-testid={`publication-copy-citation-${pub.id}`}
                                    >
                                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                        {locale === "id" ? "Salin sitasi" : "Copy citation"}
                                    </button>
                                </article>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </section>
        </div>
    );
}
