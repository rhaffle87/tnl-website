import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/api";
import { useAdminT } from "@/lib/i18n/admin-i18n";
import { AdminErrorBanner, AdminSelect, ConfirmButton, Panel, adminError } from "@/pages/admin/AdminUI";
import type { Block, PageDoc } from "@/lib/types/types";

interface SavedBlock { id: string; name: string; block: Block }
export function ReusableBlocks({ pageId, blocks, onApplied }: { pageId: string; blocks: Block[]; onApplied: (page: PageDoc) => void }) {
    const t = useAdminT();
    const qc = useQueryClient();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [blockId, setBlockId] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const { data, error: loadError, refetch } = useQuery({ queryKey: ["admin", "saved-blocks"], queryFn: () => apiGet<{ items: SavedBlock[] }>("/admin/saved-blocks"), enabled: open, retry: false });
    const act = async (action: () => Promise<unknown>) => {
        if (busy) return;
        setBusy(true); setError("");
        try { await action(); await qc.invalidateQueries({ queryKey: ["admin", "saved-blocks"] }); }
        catch (err) { setError(adminError(err, t("adminReusableError"))); }
        finally { setBusy(false); }
    };
    return <div className="mb-5">
        <button type="button" className="tnl-btn tnl-btn-outline" aria-expanded={open} aria-controls="saved-block-library" onClick={() => setOpen(!open)}>{t("adminReusableBlocks")}</button>
        {open ? <Panel className="mt-3">
            <div id="saved-block-library" className="space-y-3">
                <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" aria-label={t("adminReusableSave")} onSubmit={(e) => { e.preventDefault(); const block = blocks.find((b) => b.id === blockId); if (block) void act(async () => { await apiPost("/admin/saved-blocks", { name, block: { type: block.type, props: block.props, hidden: block.hidden } }); setName(""); }); }}>
                    <input className="tnl-field" aria-label={t("adminReusableName")} name="name" value={name} onChange={(e) => setName(e.target.value)} required />
                    <AdminSelect value={blockId} onChange={(e) => setBlockId(e.target.value)} aria-label={t("adminPagesChooseWidget")} required>
                        <option value="">{t("adminPagesChooseWidget")}</option>{blocks.map((block, index) => <option key={block.id} value={block.id}>{index + 1}. {block.type}</option>)}
                    </AdminSelect>
                    <button type="submit" className="tnl-btn tnl-btn-outline" disabled={busy}>{t("adminReusableSave")}</button>
                </form>
                {loadError ? <AdminErrorBanner message={adminError(loadError, t("adminReusableError"))} onRetry={() => void refetch()} /> : null}
                {error ? <p role="alert" className="text-sm text-[var(--tnl-danger)]">{error}</p> : null}
                {(data?.items ?? []).map((saved) => <div key={saved.id} className="flex flex-wrap items-center gap-2 border-t border-[var(--tnl-border)] pt-3">
                    <input className="tnl-field min-w-0 flex-1" aria-label={`${t("adminReusableName")}: ${saved.name}`} defaultValue={saved.name} onBlur={(e) => { const next = e.target.value.trim(); if (next && next !== saved.name) void act(() => apiPatch(`/admin/saved-blocks/${saved.id}`, { name: next })); }} />
                    <button type="button" className="tnl-btn tnl-btn-outline" disabled={busy} onClick={() => void act(async () => onApplied(await apiPost<PageDoc>(`/admin/pages/${pageId}/saved-blocks/${saved.id}`, {})))}>{t("adminReusableInsert")}</button>
                    <ConfirmButton label={t("adminDelete")} confirmLabel={t("adminConfirm")} question={t("adminPagesRemoveQuestion")} onConfirm={() => void act(() => apiDelete(`/admin/saved-blocks/${saved.id}`))} testId={`saved-block-delete-${saved.id}`} />
                </div>)}
                {data?.items.length === 0 ? <p className="text-sm">{t("adminReusableEmpty")}</p> : null}
            </div>
        </Panel> : null}
    </div>;
}
