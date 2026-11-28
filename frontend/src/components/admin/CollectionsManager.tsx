import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/api";
import { useMe } from "@/lib/api/hooks";
import { useAdminT } from "@/lib/i18n/admin-i18n";
import { JsonValueField } from "@/components/admin/JsonValueField";
import { AdminErrorBanner, AdminPageHeader, AdminSelect, ConfirmButton, Panel, adminError } from "@/pages/admin/AdminUI";

interface CollectionField { key: string; label: string; type: string; required?: boolean; options?: string[] }
interface Collection { id: string; key: string; name: string; fields: CollectionField[]; template?: string }
interface CollectionItem { id: string; values: Record<string, unknown>; status: string; has_draft?: boolean; live_status?: string }

export function CollectionsManager() {
    const t = useAdminT();
    const qc = useQueryClient();
    const { data: me } = useMe();
    const canDefine = me?.role === "super_admin";
    const canPublish = me?.role === "super_admin" || me?.role === "editor";
    const canEdit = canPublish || me?.role === "contributor";
    const [selected, setSelected] = useState("");
    const [offset, setOffset] = useState(0);
    const [definitionId, setDefinitionId] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [key, setKey] = useState("");
    const [fields, setFields] = useState("[]");
    const [template, setTemplate] = useState("cards");
    const [editing, setEditing] = useState<CollectionItem | null>(null);
    const [showItem, setShowItem] = useState(false);
    const [values, setValues] = useState<Record<string, unknown>>({});
    const [invalidKeys, setInvalidKeys] = useState<string[]>([]);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const { data, error: listError, refetch } = useQuery({ queryKey: ["admin", "collections"], queryFn: () => apiGet<{ items: Collection[] }>("/admin/collections"), retry: false });
    const definition = data?.items.find((entry) => entry.key === selected);
    const { data: itemData, error: itemError, refetch: refetchItems } = useQuery({ queryKey: ["admin", "collection-items", selected, offset], queryFn: () => apiGet<{ items: CollectionItem[]; total: number }>(`/admin/collections/${encodeURIComponent(selected)}/items?limit=50&offset=${offset}`), enabled: Boolean(selected), retry: false });
    const act = async (fn: () => Promise<unknown>) => {
        if (busy) return;
        setBusy(true); setError("");
        try {
            await fn();
            await qc.invalidateQueries({ queryKey: ["admin", "collections"] });
            await qc.invalidateQueries({ queryKey: ["admin", "collection-items"] });
            void qc.invalidateQueries({ queryKey: ["public", "collections"] });
        } catch (err) { setError(adminError(err, t("adminCollectionError"))); }
        finally { setBusy(false); }
    };
    const editDefinition = (entry?: Collection) => {
        setDefinitionId(entry?.id ?? null); setName(entry?.name ?? ""); setKey(entry?.key ?? "");
        setFields(JSON.stringify(entry?.fields ?? [], null, 2)); setTemplate(entry?.template ?? "cards");
    };
    const editItem = (item?: CollectionItem) => {
        setEditing(item ?? null); setValues(item?.values ?? {}); setInvalidKeys([]); setShowItem(true);
    };
    return <div className="space-y-5" data-testid="collections-manager">
        <AdminPageHeader title={t("adminCollections")} />
        {listError ? <AdminErrorBanner message={adminError(listError, t("adminCollectionError"))} onRetry={() => void refetch()} /> : null}
        {error ? <p role="alert" className="text-sm text-[var(--tnl-danger)]">{error}</p> : null}
        <Panel><div className="space-y-3">
            <label htmlFor="collection-selector" className="block text-sm">{t("adminCollectionSelect")}</label>
            <AdminSelect id="collection-selector" value={selected} onChange={(e) => { setSelected(e.target.value); setOffset(0); setShowItem(false); }}>
                <option value="">{t("adminCollectionSelect")}</option>{data?.items.map((entry) => <option key={entry.id} value={entry.key}>{entry.name}</option>)}
            </AdminSelect>
            {data?.items.length === 0 ? <p className="text-sm">{t("adminCollectionEmpty")}</p> : null}
            {canDefine ? <div className="flex flex-wrap gap-2"><button type="button" className="tnl-btn tnl-btn-outline" onClick={() => editDefinition()}>{t("adminCreate")}</button>{definition ? <>
                <button type="button" className="tnl-btn tnl-btn-outline" onClick={() => editDefinition(definition)}>{t("adminEdit")}</button>
                <ConfirmButton label={t("adminDelete")} question={t("adminCollectionDeleteQuestion")} confirmLabel={t("adminConfirm")} onConfirm={() => void act(async () => { await apiDelete(`/admin/collections/${definition.id}`); setSelected(""); editDefinition(); })} testId="collection-delete" />
            </> : null}</div> : null}
        </div></Panel>
        {canDefine ? <Panel><form className="space-y-3" aria-label={t("adminCollections")} onSubmit={(e) => { e.preventDefault(); void act(async () => {
            const parsed: unknown = JSON.parse(fields);
            if (!Array.isArray(parsed)) throw new Error(t("adminCollectionFields"));
            const payload = { name, ...(definitionId ? {} : { key }), fields: parsed, template };
            const saved = definitionId ? await apiPatch<Collection>(`/admin/collections/${definitionId}`, payload) : await apiPost<Collection>("/admin/collections", payload);
            setSelected(saved.key); editDefinition(saved);
        }); }}>
            <label htmlFor="collection-name" className="block text-sm">{t("adminCollectionName")}</label>
            <input id="collection-name" name="name" className="tnl-field" value={name} onChange={(e) => setName(e.target.value)} required />
            <label htmlFor="collection-key" className="block text-sm">{t("adminCollectionSlug")}</label>
            <input id="collection-key" name="key" className="tnl-field" value={key} onChange={(e) => setKey(e.target.value)} required readOnly={Boolean(definitionId)} pattern="[a-z][a-z0-9_-]*" />
            <label htmlFor="collection-fields" className="block text-sm">{t("adminCollectionFields")}</label>
            <textarea id="collection-fields" name="fields" rows={6} className="tnl-field font-mono text-sm" value={fields} onChange={(e) => setFields(e.target.value)} required />
            <label htmlFor="collection-template" className="block text-sm">{t("adminCollectionTemplate")}</label>
            <AdminSelect id="collection-template" value={template} onChange={(e) => setTemplate(e.target.value)}>{["cards", "list", "table"].map((item) => <option key={item}>{item}</option>)}</AdminSelect>
            <button type="submit" className="tnl-btn tnl-btn-primary" disabled={busy}>{t(definitionId ? "adminSave" : "adminCreate")}</button>
        </form></Panel> : null}
        {definition ? <Panel>
            <h2 className="text-base font-semibold">{t("adminCollectionItems")}: {definition.name}</h2>
            {canEdit ? <button type="button" className="tnl-btn tnl-btn-outline mt-3" onClick={() => editItem()}>{t("adminCollectionNewItem")}</button> : null}
            {itemError ? <AdminErrorBanner message={adminError(itemError, t("adminCollectionError"))} onRetry={() => void refetchItems()} /> : null}
            <ul className="mt-3 space-y-3">{itemData?.items.map((item) => <li key={item.id} className="space-y-2 border-t border-[var(--tnl-border)] pt-3">
                <p className="text-sm">{typeof item.values[definition.fields[0]?.key] === "string" ? item.values[definition.fields[0]?.key] as string : item.id} · {item.status}{item.has_draft ? ` · ${t("adminDraft")}` : ""}</p>
                {canEdit ? <div className="flex flex-wrap gap-2">
                    <button type="button" className="tnl-btn tnl-btn-outline" onClick={() => editItem(item)}>{t("adminEdit")}</button>
                    {canPublish ? <>
                        <button type="button" className="tnl-btn tnl-btn-outline" disabled={busy} onClick={() => void act(() => apiPatch(`/admin/collections/${selected}/items/${item.id}`, { status: "published" }))}>{t("adminPublish")}</button>
                        {item.live_status === "published" || item.status === "published" ? <button type="button" className="tnl-btn tnl-btn-outline" disabled={busy} onClick={() => void act(() => apiPatch(`/admin/collections/${selected}/items/${item.id}`, { status: "draft" }))}>{t("adminUnpublish")}</button> : null}
                    </> : null}
                    <ConfirmButton label={t("adminDelete")} question={t("adminPagesRemoveQuestion")} confirmLabel={t("adminConfirm")} onConfirm={() => void act(() => apiDelete(`/admin/collections/${selected}/items/${item.id}`))} testId={`collection-item-delete-${item.id}`} />
                </div> : null}
            </li>)}</ul>
            {offset > 0 || (itemData?.total ?? 0) > 50 ? <div className="mt-3 flex items-center gap-3">
                <button type="button" className="tnl-btn tnl-btn-outline" disabled={offset === 0} onClick={() => { setOffset((old) => Math.max(0, old - 50)); setShowItem(false); }}>{t("adminPrevious")}</button>
                <span className="text-xs">{offset + 1}-{offset + (itemData?.items.length ?? 0)} / {itemData?.total}</span>
                <button type="button" className="tnl-btn tnl-btn-outline" disabled={offset + 50 >= (itemData?.total ?? 0)} onClick={() => { setOffset((old) => old + 50); setShowItem(false); }}>{t("adminNext")}</button>
            </div> : null}
            {showItem ? <form className="mt-4 space-y-3 border-t border-[var(--tnl-border)] pt-4" aria-label={t("adminCollectionData")} onSubmit={(e) => { e.preventDefault(); if (invalidKeys.length) return; void act(async () => {
                const payload = { values, ...(editing ? { save_as_draft: true } : { status: "draft" }) };
                if (editing) await apiPatch(`/admin/collections/${selected}/items/${editing.id}`, payload);
                else await apiPost(`/admin/collections/${selected}/items`, payload);
                setShowItem(false);
            }); }}>
                {definition.fields.map((field) => <div key={field.key} className="space-y-1">
                    <label htmlFor={`collection-value-${field.key}`} className="block text-sm">{field.label}{field.required ? " *" : ""}</label>
                    {field.type === "select" ? <AdminSelect id={`collection-value-${field.key}`} value={typeof values[field.key] === "string" ? values[field.key] as string : ""} required={field.required} onChange={(e) => setValues((old) => ({ ...old, [field.key]: e.target.value }))}><option value="" />{field.options?.map((option) => <option key={option}>{option}</option>)}</AdminSelect>
                        : field.type === "textarea" || field.type === "html" ? <textarea id={`collection-value-${field.key}`} className="tnl-field" required={field.required} value={typeof values[field.key] === "string" ? values[field.key] as string : ""} onChange={(e) => setValues((old) => ({ ...old, [field.key]: e.target.value }))} />
                        : <JsonValueField label={field.label} testId={`collection-value-${field.key}`} value={values[field.key] ?? (field.type === "number" ? 0 : field.type === "boolean" || field.type === "checkbox" ? false : field.type === "tags" ? [] : "")} onChange={(next) => setValues((old) => ({ ...old, [field.key]: next }))} onValidityChange={(valid) => setInvalidKeys((old) => valid ? old.filter((item) => item !== field.key) : [...new Set([...old, field.key])])} />}
                </div>)}
                <button type="submit" className="tnl-btn tnl-btn-primary" disabled={busy || invalidKeys.length > 0}>{t("adminDraftSave")}</button>
                <button type="button" className="tnl-btn tnl-btn-outline ml-2" onClick={() => setShowItem(false)}>{t("adminCancel")}</button>
            </form> : null}
        </Panel> : null}
    </div>;
}
