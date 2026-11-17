// Publications: filter by year and type, link out to DOI / publisher.

import { useMemo, useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { usePublications } from "@/lib/hooks";
import { useLocale } from "@/lib/i18n";
import { EmptyState, SectionHeading, Spinner } from "@/components/site/Primitives";
import { usePage } from "@/lib/hooks";
import { BlockRenderer } from "@/components/site/Blocks";

export default function PublicationsPage() {
    const { t } = useLocale();
    const { data: page } = usePage("publications");
    const { data: publications, isLoading } = usePublications();
    const [year, setYear] = useState<string>("");
    const [ptype, setPtype] = useState<string>("");

    const list = publications ?? [];
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

    return (
        <div data-testid="publications-page">
            <BlockRenderer blocks={heroBlocks} />
            <section className="tnl-section" style={{ background: "var(--tnl-surface)" }}>
                <div className="tnl-container">
                    <SectionHeading
                        title={t("nav_publications")}
                        count={filtered.length}
                        countLabel={t("nav_publications").toLowerCase()}
                        testId="publications-heading"
                    />

                    {list.length ? (
                        <div className="mb-6 flex flex-wrap gap-3">
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
                        <Spinner label={t("loading")} />
                    ) : filtered.length === 0 ? (
                        <EmptyState
                            title={t("coming_soon")}
                            body={t("empty_publications")}
                            testId="publications-empty-state"
                            icon={<FileText className="h-7 w-7" style={{ color: "var(--tnl-tan-text)" }} />}
                        />
                    ) : (
                        <div className="space-y-4">
                            {filtered.map((pub) => (
                                <article key={pub.id} className="tnl-card tnl-card-hover p-6" data-testid={`publication-${pub.id}`}>
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
                                            href={pub.url ?? `https://doi.org/${pub.doi}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold"
                                            style={{ color: "var(--tnl-green)" }}
                                            data-testid={`publication-link-${pub.id}`}
                                        >
                                            {pub.doi ? `DOI ${pub.doi}` : t("read_more")}
                                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                                        </a>
                                    ) : null}
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
