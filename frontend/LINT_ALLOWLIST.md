# Lint allowlist — `react/only-export-components`

Global rule: `allowConstantExport: true` only. There is **no global `allowExportNames`**:
an export from any other `.tsx` component file is now reported instead of being
silently allowed. The 24 long-standing helper exports are whitelisted narrowly via
per-file `overrides` in `.oxlintrc.json` — one override per file that actually defines
the export. This keeps real component-only violations visible everywhere else.

If another shard or a future change adds a new non-component export, do **not** widen
the global allowlist. Fix it in that file (move the helper to a `.ts` module where
possible), or add a per-file override with only that exact symbol and a documented
reason. Re-run `npx oxlint .` after any change; it must stay at 0 warnings/errors.

Per-file exceptions (24 symbols across 14 files):

| File | Allowed export names |
| --- | --- |
| `src/components/admin/editor/RichTextField.tsx` | `countWords`, `escapeHtml`, `htmlToPlainText`, `isSafeHref`, `normalizeHtml` |
| `src/components/admin/repeaters/KeyValueMapEditor.tsx` | `MEMBER_SOCIAL_PRESETS` |
| `src/components/site/Blocks.tsx` | `useMembersForBlocks` |
| `src/components/site/Chrome.tsx` | `isRegistrationTarget` |
| `src/components/site/Primitives.tsx` | `formatDate` |
| `src/components/site/SmoothScrollProvider.tsx` | `useSmoothScroll` |
| `src/components/site/SpotlightCard.tsx` | `cancelSpotlightFrame`, `handleSpotlightPointerEnter`, `handleSpotlightPointerMove` |
| `src/components/ui/badge.tsx` | `badgeVariants` |
| `src/components/ui/button.tsx` | `buttonVariants` |
| `src/components/ui/tabs.tsx` | `tabsListVariants` |
| `src/pages/admin/AdminLayout.tsx` | `NAV_GROUPS` |
| `src/pages/admin/screens/RegistrarPage.tsx` | `publishedEventQuota` |
| `src/pages/admin/AdminUI.tsx` | `adminError`, `issuesFromError` |
| `src/pages/admin/ContentManager.tsx` | `RESOURCE_SPECS`, `emptyDraft`, `toForm`, `toPayload` |

Semua adalah fungsi/metadata deterministik tanpa state komponen, sehingga aman untuk HMR.
Aturan tetap aktif untuk export baru di luar daftar per-file ini.
