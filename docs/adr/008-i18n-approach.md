# ADR-008: Runtime English and Indonesian Localization

## Status

Accepted. Records the implementation as of 2026-11-27.

## Context

The public site and CMS need English and Indonesian labels alongside localized
content. A language switch must update the current page in the browser.

## Decision

Use the `en` and `id` locale union, bundled string dictionaries and React locale
context. `LocaleProvider` restores a saved `tnl-locale` preference, uses the site
default when there is no stored preference, and updates the document language.
Language selection occurs at runtime; the build does not generate separate
localized sites.

Content models keep paired fields such as `title` and `title_id`. `pick` and
`pickProp` select the localized content; `pickProp` preserves an explicitly empty
Indonesian string. Administrative UI strings have their own shared dictionaries.

## Consequences

New UI labels and content properties need both language paths and appropriate
fallback behavior. Bundling dictionaries does not prove that every page,
validation message or assistive label is translated. Tests should verify visible
labels, accessible names and content fallback in both locales. Locale-sensitive
caches must include the relevant locale dimension or return both field variants.

## Evidence

- [Locale types, strings and field selectors](../../frontend/src/lib/i18n/i18n.ts)
- [Locale provider](../../frontend/src/components/site/SiteLayout.tsx)
- [Administrative dictionaries](../../frontend/src/lib/i18n/admin-i18n.ts)
- [Localized content models](../../backend/models/content.py)
