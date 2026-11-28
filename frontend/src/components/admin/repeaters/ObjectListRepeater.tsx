import { useState } from "react";
import {
    ChevronDown,
    ChevronUp,
    ChevronsDownUp,
    ChevronsUpDown,
    Copy,
    Plus,
    Trash2,
    Code,
    AlertCircle,
    FileText,
} from "lucide-react";
import { InlineMediaField } from "@/components/admin/media";
import { AdminSelect, AdminSwitch } from "@/components/admin/controls";
import { TagChipsField } from "./TagChipsField";
import { useAdminT, type AdminStringKey } from "@/lib/i18n/admin-i18n";
import { ADMIN_BUILDER_DEFAULT_KEYS } from "@/lib/i18n/admin-builders-strings";

export interface RepeaterFieldSpec {
    key: string;
    label: string;
    type: "text" | "textarea" | "number" | "select" | "checkbox" | "url" | "media" | "tags";
    options?: string[];
    placeholder?: string;
    help?: string;
    folder?: string;
    accept?: "image" | "document" | "all";
    aspect?: "square" | "video" | "auto";
    width?: "full" | "half";
    defaultValue?: unknown;
}

export interface ObjectListRepeaterProps {
    label?: string;
    value: Array<Record<string, unknown>> | string | null | undefined;
    onChange: (items: Array<Record<string, unknown>>) => void;
    fields: RepeaterFieldSpec[];
    itemTitleField?: string;
    itemSubtitleField?: string;
    help?: string;
    emptyMessage?: string;
    testId?: string;
    addButtonLabel?: string;
    defaultFolder?: string;
}

export function ObjectListRepeater({
    label,
    value,
    onChange,
    fields,
    itemTitleField = "title",
    itemSubtitleField,
    help,
    emptyMessage,
    testId = "object-list-repeater",
    addButtonLabel,
    defaultFolder = "general",
}: ObjectListRepeaterProps) {
    const t = useAdminT();
    const resolveCopy = (text: string): string => {
        const key = Object.prototype.hasOwnProperty.call(ADMIN_BUILDER_DEFAULT_KEYS, text)
            ? ADMIN_BUILDER_DEFAULT_KEYS[text as keyof typeof ADMIN_BUILDER_DEFAULT_KEYS]
            : undefined;
        return key ? t(key) : text;
    };
    const [rawMode, setRawMode] = useState(false);
    const [rawJsonText, setRawJsonText] = useState("");
    const [jsonError, setJsonError] = useState<AdminStringKey | null>(null);
    const [collapsedMap, setCollapsedMap] = useState<Record<number, boolean>>({});

    // Normalize value to Array<Record<string, unknown>>
    const items: Array<Record<string, unknown>> = (() => {
        if (!value) return [];
        if (typeof value === "string") {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }
        if (Array.isArray(value)) return value;
        return [];
    })();

    const updateItemField = (itemIdx: number, fieldKey: string, val: unknown) => {
        const next = items.map((it, idx) => {
            if (idx === itemIdx) {
                return { ...it, [fieldKey]: val };
            }
            return it;
        });
        onChange(next);
    };

    const addItem = () => {
        const newItem: Record<string, unknown> = {};
        for (const f of fields) {
            if (f.defaultValue !== undefined) {
                newItem[f.key] = f.defaultValue;
            } else if (f.type === "checkbox") {
                newItem[f.key] = false;
            } else if (f.type === "number") {
                newItem[f.key] = 0;
            } else if (f.type === "tags") {
                newItem[f.key] = [];
            } else if (f.type === "select" && f.options?.length) {
                newItem[f.key] = f.options[0];
            } else {
                newItem[f.key] = "";
            }
        }
        onChange([...items, newItem]);
    };

    const duplicateItem = (itemIdx: number) => {
        const original = items[itemIdx];
        const clone = typeof structuredClone === "function" ? structuredClone(original) : JSON.parse(JSON.stringify(original));
        // Remove or generate new id if id exists
        if ("id" in clone) delete clone.id;
        const next = [...items];
        next.splice(itemIdx + 1, 0, clone);
        onChange(next);
    };

    const removeItem = (itemIdx: number) => {
        const next = items.filter((_, idx) => idx !== itemIdx);
        onChange(next);
    };

    const moveItem = (itemIdx: number, direction: "up" | "down") => {
        const targetIdx = direction === "up" ? itemIdx - 1 : itemIdx + 1;
        if (targetIdx < 0 || targetIdx >= items.length) return;
        const next = [...items];
        const [moved] = next.splice(itemIdx, 1);
        next.splice(targetIdx, 0, moved);
        onChange(next);
    };

    const toggleCollapse = (idx: number) => {
        setCollapsedMap((prev) => ({ ...prev, [idx]: !prev[idx] }));
    };

    const toggleAllCollapse = () => {
        const anyOpen = items.some((_, idx) => !collapsedMap[idx]);
        const next: Record<number, boolean> = {};
        items.forEach((_, idx) => {
            next[idx] = anyOpen;
        });
        setCollapsedMap(next);
    };

    const toggleRawMode = () => {
        if (!rawMode) {
            setRawJsonText(JSON.stringify(items, null, 2));
            setJsonError(null);
            setRawMode(true);
        } else {
            try {
                const parsed = rawJsonText.trim() ? JSON.parse(rawJsonText) : [];
                if (!Array.isArray(parsed)) {
                    setJsonError("adminBuilderJsonObjectsArray");
                    return;
                }
                onChange(parsed);
                setJsonError(null);
                setRawMode(false);
            } catch {
                setJsonError("adminBuilderInvalidJson");
            }
        }
    };

    const handleRawTextChange = (text: string) => {
        setRawJsonText(text);
        try {
            const parsed = text.trim() ? JSON.parse(text) : [];
            if (Array.isArray(parsed)) {
                setJsonError(null);
                onChange(parsed);
            } else {
                setJsonError("adminBuilderJsonItemsArray");
            }
        } catch {
            setJsonError("adminBuilderInvalidJson");
        }
    };

    return (
        <div className="space-y-3 rounded-xl border p-4 transition-colors" style={{ backgroundColor: "var(--tnl-card-bg)", borderColor: "var(--tnl-border)" }} data-testid={testId}>
            {/* Header row */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5" style={{ borderColor: "var(--tnl-border)" }}>
                <div>
                    <div className="flex items-center gap-2">
                        {label && <h4 className="text-sm font-semibold tracking-tight">{resolveCopy(label)}</h4>}
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: "var(--tnl-bg)", color: "var(--tnl-gold)" }}>
                            {items.length} {t(items.length === 1 ? "adminItem" : "adminBuilderItems")}
                        </span>
                    </div>
                    {help && <p className="text-xs mt-0.5" style={{ color: "var(--tnl-tan-text)" }}>{resolveCopy(help)}</p>}
                </div>
                <div className="flex items-center gap-2">
                    {items.length > 2 && !rawMode && (
                        <button
                            type="button"
                            onClick={toggleAllCollapse}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                            title={t("adminBuilderToggleCollapseAll")}
                        >
                            {items.some((_, idx) => !collapsedMap[idx]) ? (
                                <>
                                    <ChevronsDownUp className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>{t("adminBuilderCollapseAll")}</span>
                                </>
                            ) : (
                                <>
                                    <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>{t("adminBuilderExpandAll")}</span>
                                </>
                            )}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={toggleRawMode}
                        className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-mono font-medium transition-colors hover:bg-neutral-500/10"
                        style={{ color: rawMode ? "var(--tnl-gold)" : "var(--tnl-tan-text)" }}
                        data-testid={`${testId}-raw-toggle`}
                    >
                        <Code className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t(rawMode ? "adminBuilderVisualEditor" : "adminBuilderRawJson")}</span>
                    </button>
                </div>
            </div>

            {/* Raw JSON View */}
            {rawMode ? (
                <div className="space-y-2">
                    <textarea
                        id={`${testId}-raw-input`}
                        value={rawJsonText}
                        onChange={(e) => handleRawTextChange(e.target.value)}
                        rows={9}
                        aria-invalid={jsonError ? true : undefined}
                        aria-describedby={jsonError ? `${testId}-raw-error` : undefined}
                        className="w-full rounded-lg border p-2.5 font-mono text-xs outline-none focus:ring-2 focus:ring-[var(--gsm-emerald)]/30 focus:border-[var(--gsm-emerald)]"
                        style={{ backgroundColor: "var(--tnl-bg)", borderColor: jsonError ? "var(--tnl-red)" : "var(--tnl-border)" }}
                        data-testid={`${testId}-raw-textarea`}
                    />
                    {jsonError && (
                        <div id={`${testId}-raw-error`} role="alert" className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>{t(jsonError)}</span>
                        </div>
                    )}
                </div>
            ) : (
                /* Visual Items List */
                <div className="space-y-3">
                    {items.length === 0 ? (
                        <div className="rounded-lg border border-dashed py-8 text-center text-xs" style={{ borderColor: "var(--tnl-border)", color: "var(--tnl-tan-text)" }}>
                            <FileText className="mx-auto h-6 w-6 opacity-40 mb-2" aria-hidden="true" />
                            <p>{emptyMessage === undefined ? t("adminBuilderEmptyItems") : resolveCopy(emptyMessage)}</p>
                        </div>
                    ) : (
                        items.map((item, itemIdx) => {
                            const isCollapsed = Boolean(collapsedMap[itemIdx]);
                            const titleValue = String(item[itemTitleField] || item.name || item.title_id || t("adminBuilderItemTitle").replace("{number}", String(itemIdx + 1)));
                            const subtitleValue = itemSubtitleField ? String(item[itemSubtitleField] || "") : "";

                            return (
                                <div
                                    key={itemIdx}
                                    className="rounded-lg border transition-all"
                                    style={{
                                        backgroundColor: "var(--tnl-bg)",
                                        borderColor: "var(--tnl-border)",
                                    }}
                                    data-testid={`${testId}-card-${itemIdx}`}
                                >
                                    {/* Card Header */}
                                    <div className="flex items-center justify-between px-3.5 py-2.5 select-none bg-neutral-500/5 rounded-t-lg">
                                        <div
                                            className="flex flex-1 items-center gap-2.5 cursor-pointer"
                                            onClick={() => toggleCollapse(itemIdx)}
                                        >
                                            <span className="font-mono text-xs font-bold text-[var(--tnl-tan-text)] dark:text-[var(--gsm-accent)]">
                                                {String(itemIdx + 1).padStart(2, "0")}
                                            </span>
                                            <span className="text-xs font-semibold truncate max-w-[280px] md:max-w-[420px]" data-testid={`${testId}-card-title-${itemIdx}`}>
                                                {titleValue}
                                            </span>
                                            {subtitleValue && (
                                                <span className="text-[11px] truncate opacity-60 hidden sm:inline">
                                                    · {subtitleValue}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => moveItem(itemIdx, "up")}
                                                disabled={itemIdx === 0}
                                                className="rounded p-1 text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-20"
                                                title={t("adminBuilderMoveUp")}
                                                aria-label={t("adminBuilderMoveItemUp")}
                                                data-testid={`${testId}-card-up-${itemIdx}`}
                                            >
                                                <ChevronUp className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveItem(itemIdx, "down")}
                                                disabled={itemIdx === items.length - 1}
                                                className="rounded p-1 text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-20"
                                                title={t("adminBuilderMoveDown")}
                                                aria-label={t("adminBuilderMoveItemDown")}
                                                data-testid={`${testId}-card-down-${itemIdx}`}
                                            >
                                                <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => duplicateItem(itemIdx)}
                                                className="rounded p-1 text-neutral-400 hover:text-[var(--gsm-primary)] hover:bg-[var(--gsm-primary-soft)] dark:hover:text-[var(--gsm-accent)]"
                                                title={t("adminBuilderDuplicateItem")}
                                                aria-label={t("adminBuilderDuplicateItem")}
                                                data-testid={`${testId}-card-dup-${itemIdx}`}
                                            >
                                                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeItem(itemIdx)}
                                                className="rounded p-1 text-neutral-400 hover:text-rose-600 hover:bg-rose-500/10"
                                                title={t("adminBuilderDeleteItem")}
                                                aria-label={t("adminBuilderDeleteItem")}
                                                data-testid={`${testId}-card-remove-${itemIdx}`}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleCollapse(itemIdx)}
                                                className="rounded p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 ml-1"
                                                title={t(isCollapsed ? "adminBuilderExpand" : "adminBuilderCollapse")}
                                                aria-label={t(isCollapsed ? "adminBuilderExpandItem" : "adminBuilderCollapseItem")}
                                            >
                                                {isCollapsed ? (
                                                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                                ) : (
                                                    <ChevronUp className="h-4 w-4" aria-hidden="true" />
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Card Body */}
                                    {!isCollapsed && (
                                        <div className="p-3.5 grid grid-cols-1 md:grid-cols-2 gap-3 border-t" style={{ borderColor: "var(--tnl-border)" }}>
                                            {fields.map((f) => {
                                                const val = item[f.key];
                                                const isWide = f.width === "full" || f.type === "textarea" || f.type === "media" || f.type === "tags";

                                                return (
                                                    <div key={f.key} className={isWide ? "md:col-span-2 space-y-1" : "space-y-1"}>
                                                        <label className="block text-xs font-medium">
                                                            {resolveCopy(f.label)}
                                                        </label>

                                                        {f.type === "textarea" ? (
                                                            <textarea
                                                                rows={3}
                                                                value={String(val ?? "")}
                                                                onChange={(e) => updateItemField(itemIdx, f.key, e.target.value)}
                                                                placeholder={f.placeholder === undefined ? undefined : resolveCopy(f.placeholder)}
                                                                className="w-full rounded-lg border px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[var(--gsm-emerald)]/30 focus:border-[var(--gsm-emerald)]"
                                                                style={{ backgroundColor: "var(--tnl-card-bg)", borderColor: "var(--tnl-border)" }}
                                                                data-testid={`${testId}-item-${itemIdx}-${f.key}`}
                                                            />
                                                        ) : f.type === "select" ? (
                                                            <AdminSelect
                                                                value={String(val ?? "")}
                                                                onChange={(e) => updateItemField(itemIdx, f.key, e.target.value)}
                                                                className="text-xs"
                                                                data-testid={`${testId}-item-${itemIdx}-${f.key}`}
                                                            >
                                                                {(f.options || []).map((opt) => (
                                                                    <option key={opt} value={opt}>
                                                                        {opt}
                                                                    </option>
                                                                ))}
                                                            </AdminSelect>
                                                        ) : f.type === "checkbox" ? (
                                                            <AdminSwitch
                                                                label={resolveCopy(f.placeholder || f.label)}
                                                                checked={Boolean(val)}
                                                                onCheckedChange={(next) => updateItemField(itemIdx, f.key, next)}
                                                                testId={`${testId}-item-${itemIdx}-${f.key}`}
                                                            />
                                                        ) : f.type === "media" ? (
                                                            <InlineMediaField
                                                                value={String(val ?? "")}
                                                                onChange={(newUrl) => updateItemField(itemIdx, f.key, newUrl)}
                                                                defaultFolder={f.folder || defaultFolder}
                                                                accept={f.accept || "all"}
                                                                aspect={f.aspect || "video"}
                                                                testId={`${testId}-item-${itemIdx}-${f.key}`}
                                                            />
                                                        ) : f.type === "tags" ? (
                                                            <TagChipsField
                                                                value={Array.isArray(val) ? val as string[] : String(val ?? "")}
                                                                onChange={(newTags) => updateItemField(itemIdx, f.key, newTags)}
                                                                placeholder={f.placeholder === undefined ? undefined : resolveCopy(f.placeholder)}
                                                                testId={`${testId}-item-${itemIdx}-${f.key}`}
                                                            />
                                                        ) : (
                                                            <input
                                                                type={f.type === "number" ? "number" : "text"}
                                                                value={f.type === "number" ? (typeof val === "number" ? val : Number(val) || 0) : String(val ?? "")}
                                                                onChange={(e) =>
                                                                    updateItemField(
                                                                        itemIdx,
                                                                        f.key,
                                                                        f.type === "number" ? Number(e.target.value) : e.target.value
                                                                    )
                                                                }
                                                                placeholder={f.placeholder === undefined ? undefined : resolveCopy(f.placeholder)}
                                                                className="w-full rounded-lg border px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[var(--gsm-emerald)]/30 focus:border-[var(--gsm-emerald)]"
                                                                style={{ backgroundColor: "var(--tnl-card-bg)", borderColor: "var(--tnl-border)" }}
                                                                data-testid={`${testId}-item-${itemIdx}-${f.key}`}
                                                            />
                                                        )}

                                                        {f.help && (
                                                            <p className="text-[11px]" style={{ color: "var(--tnl-tan-text)" }}>
                                                                {resolveCopy(f.help)}
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}

                    {/* Add Item Button */}
                    <button
                        type="button"
                        onClick={addItem}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs font-medium transition-colors hover:border-[var(--gsm-emerald)] hover:text-[var(--gsm-primary)] dark:hover:text-[var(--gsm-emerald)] w-full justify-center"
                        style={{ borderColor: "var(--tnl-border)", color: "var(--tnl-text)" }}
                        data-testid={`${testId}-add`}
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        <span>{addButtonLabel === undefined ? t("adminBuilderAddItem") : resolveCopy(addButtonLabel)}</span>
                    </button>
                </div>
            )}
        </div>
    );
}
