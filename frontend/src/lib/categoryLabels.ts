// Canonical news categories: stable keys for testids and bilingual display labels.
// CMS data remains authoritative: filtering always uses the raw category value.

import type { Locale } from "@/lib/i18n";

type Category = { key: string; en: string; id: string };

const CATEGORIES: Category[] = [
    { key: "research", en: "Research", id: "Riset" },
    { key: "community-service", en: "Community Service", id: "Pengabdian Masyarakat" },
    { key: "training", en: "Training", id: "Pelatihan" },
    { key: "announcement", en: "Announcement", id: "Pengumuman" },
];

function normalize(value: string): string {
    return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function canonical(category: string): Category | undefined {
    const needle = normalize(category);
    return CATEGORIES.find((entry) => normalize(entry.en) === needle || normalize(entry.id) === needle);
}

/** Display the Indonesian label for canonical categories; unknown labels stay untouched. */
export function localizeCategory(category: string, locale: Locale): string {
    const entry = canonical(category);
    if (!entry) return category;
    return locale === "id" ? entry.id : entry.en;
}

/** Stable testid slug; known categories keep their canonical key in both locales. */
export function categoryKey(category: string): string {
    const entry = canonical(category);
    const raw = entry?.key ?? category;
    return raw
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
