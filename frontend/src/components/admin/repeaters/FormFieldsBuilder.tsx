import { useState } from "react";
import {
    ChevronDown,
    ChevronUp,
    Copy,
    Plus,
    Trash2,
    Code,
    AlertCircle,
    Eye,
    EyeOff,
    Lock,
    Unlock,
    HelpCircle,
    ListFilter,
    CheckSquare,
    UploadCloud,
    AlignLeft,
    Type,
    Mail,
    Phone,
    GraduationCap,
} from "lucide-react";
import type { FormField } from "@/lib/types/types";
import { useAdminT, type AdminStringKey } from "@/lib/i18n/admin-i18n";
import { ADMIN_BUILDER_DEFAULT_KEYS } from "@/lib/i18n/admin-builders-strings";
import { AdminSelect, AdminSwitch } from "@/components/admin/controls";

export interface FormFieldsBuilderProps {
    label?: string;
    value: FormField[] | string | null | undefined;
    onChange: (fields: FormField[]) => void;
    help?: string;
    testId?: string;
}

const FIELD_TYPES: { value: string; labelKey: AdminStringKey; icon: typeof Type }[] = [
    { value: "text", labelKey: "adminBuilderTypeText", icon: Type },
    { value: "textarea", labelKey: "adminBuilderTypeTextarea", icon: AlignLeft },
    { value: "email", labelKey: "adminBuilderTypeEmail", icon: Mail },
    { value: "nim", labelKey: "adminBuilderTypeStudent", icon: GraduationCap },
    { value: "tel", labelKey: "adminBuilderPhone", icon: Phone },
    { value: "select", labelKey: "adminBuilderTypeSelect", icon: ListFilter },
    { value: "checkbox", labelKey: "adminBuilderTypeCheckbox", icon: CheckSquare },
    { value: "file", labelKey: "adminBuilderTypeFile", icon: UploadCloud },
];

function deriveKey(label: string): string {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `f_${slug || "field"}`;
}

export function FormFieldsBuilder({
    label,
    value,
    onChange,
    help,
    testId = "form-fields-builder",
}: FormFieldsBuilderProps) {
    const t = useAdminT();
    const resolveCopy = (text: string): string => {
        const key = Object.prototype.hasOwnProperty.call(ADMIN_BUILDER_DEFAULT_KEYS, text)
            ? ADMIN_BUILDER_DEFAULT_KEYS[text as keyof typeof ADMIN_BUILDER_DEFAULT_KEYS]
            : undefined;
        return key ? t(key) : text;
    };
    const resolvedHelp = help === undefined ? t("adminBuilderFormHelp") : resolveCopy(help);
    const [rawMode, setRawMode] = useState(false);
    const [previewMode, setPreviewMode] = useState(false);
    const [rawJsonText, setRawJsonText] = useState("");
    const [jsonError, setJsonError] = useState<AdminStringKey | null>(null);
    const [collapsedMap, setCollapsedMap] = useState<Record<number, boolean>>({});
    const [unlockedKeys, setUnlockedKeys] = useState<Record<number, boolean>>({});

    // Normalize value to FormField[]
    const fields: FormField[] = (() => {
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

    const updateField = (idx: number, patch: Partial<FormField>) => {
        const next = fields.map((f, i) => {
            if (i === idx) {
                return { ...f, ...patch };
            }
            return f;
        });
        onChange(next);
    };

    const addQuestion = () => {
        const count = fields.length + 1;
        const newField: FormField = {
            type: "text",
            label: t("adminBuilderNewQuestion").replace("{number}", String(count)),
            required: false,
            options: [],
            show_if_field: null,
            show_if_value: null,
        };
        onChange([...fields, newField]);
    };

    const duplicateQuestion = (idx: number) => {
        const orig = fields[idx];
        const clone: FormField = {
            ...orig,
            label: `${orig.label} ${t("adminBuilderCopySuffix")}`,
            options: [...(orig.options || [])],
        };
        const next = [...fields];
        next.splice(idx + 1, 0, clone);
        onChange(next);
    };

    const removeQuestion = (idx: number) => {
        const next = fields.filter((_, i) => i !== idx);
        onChange(next);
    };

    const moveQuestion = (idx: number, direction: "up" | "down") => {
        const target = direction === "up" ? idx - 1 : idx + 1;
        if (target < 0 || target >= fields.length) return;
        const next = [...fields];
        const [moved] = next.splice(idx, 1);
        next.splice(target, 0, moved);
        onChange(next);
    };

    const toggleCollapse = (idx: number) => {
        setCollapsedMap((prev) => ({ ...prev, [idx]: !prev[idx] }));
    };

    const toggleLockKey = (idx: number) => {
        setUnlockedKeys((prev) => ({ ...prev, [idx]: !prev[idx] }));
    };

    // Options sub-builder helpers for select fields
    const addOption = (idx: number) => {
        const f = fields[idx];
        const opts = [...(f.options || [])];
        // Option text becomes submitted schema data; retain the legacy default value.
        opts.push(`Pilihan ${opts.length + 1}`);
        updateField(idx, { options: opts });
    };

    const updateOption = (idx: number, optIdx: number, val: string) => {
        const f = fields[idx];
        const opts = [...(f.options || [])];
        opts[optIdx] = val;
        updateField(idx, { options: opts });
    };

    const removeOption = (idx: number, optIdx: number) => {
        const f = fields[idx];
        const opts = (f.options || []).filter((_, i) => i !== optIdx);
        updateField(idx, { options: opts });
    };

    // Raw mode toggling
    const toggleRawMode = () => {
        if (!rawMode) {
            setRawJsonText(JSON.stringify(fields, null, 2));
            setJsonError(null);
            setRawMode(true);
            setPreviewMode(false);
        } else {
            try {
                const parsed = rawJsonText.trim() ? JSON.parse(rawJsonText) : [];
                if (!Array.isArray(parsed)) {
                    setJsonError("adminBuilderFormArray");
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
                setJsonError("adminBuilderJsonQuestionsArray");
            }
        } catch {
            setJsonError("adminBuilderInvalidJson");
        }
    };

    return (
        <div className="space-y-3 rounded-xl border p-4 transition-colors" style={{ backgroundColor: "var(--card)", borderColor: "var(--tnl-border)" }} data-testid={testId}>
            {/* Header row */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5" style={{ borderColor: "var(--tnl-border)" }}>
                <div>
                    <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold tracking-tight">{label === undefined ? t("adminBuilderFormLabel") : resolveCopy(label)}</h4>
                        <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: "var(--tnl-surface-2)", color: "var(--tnl-tan-text)" }}>
                            {fields.length} {t(fields.length === 1 ? "adminBuilderQuestion" : "adminBuilderQuestions")}
                        </span>
                    </div>
                    {resolvedHelp && <p className="text-xs mt-0.5" style={{ color: "var(--tnl-tan-text)" }}>{resolvedHelp}</p>}
                </div>

                <div className="flex items-center gap-2">
                    {!rawMode && (
                        <button
                            type="button"
                            onClick={() => setPreviewMode(!previewMode)}
                            className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--tnl-surface-2)]"
                            style={{ color: previewMode ? "var(--tnl-tan-text)" : "var(--foreground)" }}
                            data-testid={`${testId}-preview-toggle`}
                        >
                            {previewMode ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                            <span>{t(previewMode ? "adminBuilderClosePreview" : "adminBuilderPreviewForm")}</span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={toggleRawMode}
                        className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-mono font-medium transition-colors hover:bg-[var(--tnl-surface-2)]"
                        style={{ color: rawMode ? "var(--tnl-tan-text)" : "var(--tnl-tan-text)" }}
                        data-testid={`${testId}-raw-toggle`}
                    >
                        <Code className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t(rawMode ? "adminBuilderVisualEditor" : "adminBuilderRawJson")}</span>
                    </button>
                </div>
            </div>

            {/* Mode 1: Live Interactive Preview */}
            {previewMode && (
                <div className="rounded-xl border p-4 space-y-4" style={{ backgroundColor: "var(--tnl-surface-2)", borderColor: "var(--tnl-border)" }} data-testid={`${testId}-preview-pane`}>
                    <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "var(--tnl-border)" }}>
                        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--tnl-tan-text)] dark:text-[var(--gsm-accent)]">
                            {t("adminBuilderPreviewHeading")}
                        </span>
                        <span className="text-xs opacity-60">{t("adminBuilderPreviewHint")}</span>
                    </div>

                    {fields.length === 0 ? (
                        <p className="text-xs italic py-4 text-center opacity-60">{t("adminBuilderNoQuestions")}</p>
                    ) : (
                        <div className="space-y-3.5 max-w-xl mx-auto py-2">
                            {fields.map((f, i) => (
                                <div key={i} className="space-y-1.5">
                                    <label className="block text-xs font-medium">
                                        <span>{f.label || t("adminBuilderPreviewQuestion").replace("{number}", String(i + 1))}</span>
                                        {f.required && <span className="text-[var(--tnl-danger)] ml-1">*</span>}
                                    </label>

                                    {/* Native controls on purpose: this pane previews what the
                                        public registration form renders, so it must not adopt the
                                        admin house style (AdminSelect / AdminSwitch). */}
                                    {f.type === "textarea" ? (
                                        <textarea rows={3} disabled placeholder={t("adminBuilderLongAnswer")} className="w-full rounded-lg border px-3 py-1.5 text-xs opacity-75 cursor-not-allowed" style={{ backgroundColor: "var(--card)", borderColor: "var(--tnl-border)" }} />
                                    ) : f.type === "select" ? (
                                        <select disabled className="w-full rounded-lg border px-3 py-1.5 text-xs opacity-75 cursor-not-allowed" style={{ backgroundColor: "var(--card)", borderColor: "var(--tnl-border)" }}>
                                            <option>{t("adminBuilderChooseOption")}</option>
                                            {(f.options || []).map((o, oi) => (
                                                <option key={oi}>{o}</option>
                                            ))}
                                        </select>
                                    ) : f.type === "checkbox" ? (
                                        <label className="flex items-center gap-2 text-xs py-1 cursor-not-allowed opacity-75">
                                            <input type="checkbox" disabled className="rounded border" />
                                            <span>{t("adminBuilderAgree")}</span>
                                        </label>
                                    ) : f.type === "file" ? (
                                        <div className="rounded-lg border border-dashed p-3 text-center text-xs opacity-75 cursor-not-allowed" style={{ borderColor: "var(--tnl-border)", backgroundColor: "var(--card)" }}>
                                            <UploadCloud className="mx-auto h-5 w-5 mb-1 opacity-50" aria-hidden="true" />
                                            <span>{t("adminBuilderFileHint")}</span>
                                        </div>
                                    ) : (
                                        <input type="text" disabled placeholder={t(f.type === "email" ? "adminBuilderPreviewEmail" : f.type === "nim" ? "adminBuilderPreviewStudent" : "adminBuilderAnswer")} className="w-full rounded-lg border px-3 py-1.5 text-xs opacity-75 cursor-not-allowed" style={{ backgroundColor: "var(--card)", borderColor: "var(--tnl-border)" }} />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Mode 2: Raw JSON Editor */}
            {rawMode && (
                <div className="space-y-2">
                    <textarea
                        id={`${testId}-raw-input`}
                        value={rawJsonText}
                        onChange={(e) => handleRawTextChange(e.target.value)}
                        rows={10}
                        aria-invalid={jsonError ? true : undefined}
                        aria-describedby={jsonError ? `${testId}-raw-error` : undefined}
                        className="w-full rounded-lg border p-2.5 font-mono text-xs outline-none focus:ring-2 focus:ring-[var(--gsm-emerald)]/30 focus:border-[var(--gsm-emerald)]"
                        style={{ backgroundColor: "var(--tnl-surface-2)", borderColor: jsonError ? "var(--tnl-danger)" : "var(--tnl-border)" }}
                        data-testid={`${testId}-raw-textarea`}
                    />
                    {jsonError && (
                        <div id={`${testId}-raw-error`} role="alert" className="flex items-center gap-1.5 text-xs text-[var(--tnl-danger)]">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>{t(jsonError)}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Mode 3: Visual Question Cards */}
            {!rawMode && !previewMode && (
                <div className="space-y-3">
                    {fields.length === 0 ? (
                        <div className="rounded-lg border border-dashed py-8 text-center text-xs" style={{ borderColor: "var(--tnl-border)", color: "var(--tnl-tan-text)" }}>
                            <HelpCircle className="mx-auto h-6 w-6 opacity-40 mb-2" aria-hidden="true" />
                            <p>{t("adminBuilderEmptyQuestions")}</p>
                        </div>
                    ) : (
                        fields.map((field, idx) => {
                            const isCollapsed = Boolean(collapsedMap[idx]);
                            const isKeyUnlocked = Boolean(unlockedKeys[idx]);
                            const derivedSlug = deriveKey(field.label);
                            const currentTypeObj = FIELD_TYPES.find((t) => t.value === field.type) || FIELD_TYPES[0];
                            const TypeIcon = currentTypeObj.icon;

                            return (
                                <div
                                    key={idx}
                                    className="rounded-lg border transition-all"
                                    style={{
                                        backgroundColor: "var(--tnl-surface-2)",
                                        borderColor: "var(--tnl-border)",
                                    }}
                                    data-testid={`${testId}-question-${idx}`}
                                >
                                    {/* Question Card Header */}
                                    <div className="flex items-center justify-between px-3.5 py-2.5 select-none bg-[var(--tnl-surface-2)] rounded-t-lg">
                                        <div
                                            className="flex flex-1 items-center gap-2.5 cursor-pointer"
                                            onClick={() => toggleCollapse(idx)}
                                        >
                                            <span className="font-mono text-xs font-bold text-[var(--tnl-tan-text)] dark:text-[var(--gsm-accent)]">
                                                {String(idx + 1).padStart(2, "0")}
                                            </span>
                                            <TypeIcon className="h-3.5 w-3.5 text-[var(--tnl-muted)] shrink-0" aria-hidden="true" />
                                            <span className="text-xs font-semibold truncate max-w-[240px] md:max-w-[380px]" data-testid={`${testId}-question-title-${idx}`}>
                                                {field.label || t("adminBuilderUntitledQuestion").replace("{number}", String(idx + 1))}
                                            </span>
                                            {field.required && (
                                                <span className="rounded bg-[var(--tnl-danger)]/10 px-1.5 py-0.5 text-xs font-semibold text-[var(--tnl-danger)]">
                                                    {t("adminRequired")}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => moveQuestion(idx, "up")}
                                                disabled={idx === 0}
                                                className="rounded p-1 text-[var(--tnl-muted)] hover:text-[var(--foreground)] disabled:opacity-20"
                                                title={t("adminBuilderMoveUp")}
                                                aria-label={t("adminBuilderMoveQuestionUp")}
                                                data-testid={`${testId}-question-up-${idx}`}
                                            >
                                                <ChevronUp className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveQuestion(idx, "down")}
                                                disabled={idx === fields.length - 1}
                                                className="rounded p-1 text-[var(--tnl-muted)] hover:text-[var(--foreground)] disabled:opacity-20"
                                                title={t("adminBuilderMoveDown")}
                                                aria-label={t("adminBuilderMoveQuestionDown")}
                                                data-testid={`${testId}-question-down-${idx}`}
                                            >
                                                <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => duplicateQuestion(idx)}
                                                className="rounded p-1 text-[var(--tnl-muted)] hover:text-[var(--gsm-primary)] hover:bg-[var(--gsm-primary-soft)] dark:hover:text-[var(--gsm-accent)]"
                                                title={t("adminBuilderDuplicateQuestion")}
                                                aria-label={t("adminBuilderDuplicateQuestion")}
                                                data-testid={`${testId}-question-dup-${idx}`}
                                            >
                                                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeQuestion(idx)}
                                                className="rounded p-1 text-[var(--tnl-muted)] hover:text-[var(--tnl-danger)] hover:bg-[var(--tnl-danger)]/10"
                                                title={t("adminBuilderDeleteQuestion")}
                                                aria-label={t("adminBuilderDeleteQuestion")}
                                                data-testid={`${testId}-question-remove-${idx}`}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleCollapse(idx)}
                                                className="rounded p-1 text-[var(--tnl-muted)] hover:text-[var(--foreground)] ml-1"
                                                title={t(isCollapsed ? "adminBuilderExpand" : "adminBuilderCollapse")}
                                                aria-label={t(isCollapsed ? "adminBuilderExpandQuestion" : "adminBuilderCollapseQuestion")}
                                            >
                                                {isCollapsed ? (
                                                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                                ) : (
                                                    <ChevronUp className="h-4 w-4" aria-hidden="true" />
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Question Card Body */}
                                    {!isCollapsed && (
                                        <div className="p-3.5 space-y-3.5 border-t" style={{ borderColor: "var(--tnl-border)" }}>
                                            {/* Row 1: Label & Field Key */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <div className="md:col-span-2 space-y-1">
                                                    <label className="block text-xs font-medium">
                                                        {t("adminBuilderQuestionLabel")}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={field.label}
                                                        onChange={(e) => updateField(idx, { label: e.target.value })}
                                                        placeholder={t("adminBuilderQuestionExample")}
                                                        className="w-full rounded-lg border px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[var(--gsm-emerald)]/30 focus:border-[var(--gsm-emerald)]"
                                                        style={{ backgroundColor: "var(--card)", borderColor: "var(--tnl-border)" }}
                                                        data-testid={`${testId}-label-${idx}`}
                                                    />
                                                </div>

                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <label className="block text-xs font-medium">
                                                            {t("adminBuilderFieldKey")}
                                                        </label>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleLockKey(idx)}
                                                            className="flex items-center gap-1 text-xs text-[var(--tnl-tan-text)] dark:text-[var(--gsm-accent)] hover:underline"
                                                            title={t(isKeyUnlocked ? "adminBuilderLockSlug" : "adminBuilderUnlockSlug")}
                                                        >
                                                            {isKeyUnlocked ? (
                                                                <>
                                                                    <Unlock className="h-3 w-3" aria-hidden="true" />
                                                                    <span>{t("adminBuilderUnlocked")}</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Lock className="h-3 w-3" aria-hidden="true" />
                                                                    <span>{t("adminBuilderLocked")}</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={derivedSlug}
                                                        readOnly={!isKeyUnlocked}
                                                        disabled={!isKeyUnlocked}
                                                        className="w-full rounded-lg border px-3 py-1.5 font-mono text-xs outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                                                        style={{ backgroundColor: "var(--card)", borderColor: "var(--tnl-border)" }}
                                                        data-testid={`${testId}-key-${idx}`}
                                                    />
                                                </div>
                                            </div>

                                            {/* Row 2: Type, Required, Options */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
                                                <div className="space-y-1 md:col-span-2">
                                                    <label className="block text-xs font-medium">
                                                        {t("adminBuilderInputType")}
                                                    </label>
                                                    <AdminSelect
                                                        value={field.type}
                                                        onChange={(e) => updateField(idx, { type: e.target.value })}
                                                        className="text-xs"
                                                        data-testid={`${testId}-type-${idx}`}
                                                    >
                                                        {FIELD_TYPES.map((fieldType) => (
                                                            <option key={fieldType.value} value={fieldType.value}>
                                                                {t(fieldType.labelKey)}
                                                            </option>
                                                        ))}
                                                    </AdminSelect>
                                                </div>

                                                <div className="pt-4">
                                                    <AdminSwitch
                                                        label={t("adminBuilderRequiredInput")}
                                                        description={t("adminBuilderRequiredHelp")}
                                                        checked={Boolean(field.required)}
                                                        onCheckedChange={(next) => updateField(idx, { required: next })}
                                                        testId={`${testId}-required-${idx}`}
                                                    />
                                                </div>
                                            </div>

                                            {/* Options Sub-Builder (Conditional for select type) */}
                                            {field.type === "select" && (
                                                <div className="rounded-lg border p-3 space-y-2.5" style={{ backgroundColor: "var(--card)", borderColor: "var(--tnl-border)" }} data-testid={`${testId}-options-pane-${idx}`}>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--tnl-tan-text)] dark:text-[var(--gsm-accent)]">
                                                            {t("adminBuilderDropdownOptions")}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => addOption(idx)}
                                                            className="inline-flex items-center gap-1 text-xs text-[var(--gsm-primary)] dark:text-[var(--gsm-emerald)] hover:underline"
                                                            data-testid={`${testId}-add-option-${idx}`}
                                                        >
                                                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                                            <span>{t("adminBuilderAddOption")}</span>
                                                        </button>
                                                    </div>

                                                    {(field.options || []).length === 0 ? (
                                                        <p className="text-xs italic opacity-60">{t("adminBuilderNoOptions")}</p>
                                                    ) : (
                                                        <div className="space-y-1.5">
                                                            {(field.options || []).map((opt, optIdx) => (
                                                                <div key={optIdx} className="flex items-center gap-2">
                                                                    <span className="text-xs font-mono opacity-50 w-4 text-right">
                                                                        {optIdx + 1}.
                                                                    </span>
                                                                    <input
                                                                        type="text"
                                                                        value={opt}
                                                                        onChange={(e) => updateOption(idx, optIdx, e.target.value)}
                                                                        placeholder={t("adminBuilderOptionPlaceholder").replace("{number}", String(optIdx + 1))}
                                                                        className="flex-1 rounded-md border px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-[var(--gsm-emerald)] focus:border-[var(--gsm-emerald)]"
                                                                        style={{ backgroundColor: "var(--tnl-surface-2)", borderColor: "var(--tnl-border)" }}
                                                                        data-testid={`${testId}-option-${idx}-${optIdx}`}
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeOption(idx, optIdx)}
                                                                        className="rounded p-1 text-[var(--tnl-muted)] hover:text-[var(--tnl-danger)] transition-colors"
                                                                        aria-label={t("adminBuilderRemoveOption").replace("{option}", opt)}
                                                                        data-testid={`${testId}-option-remove-${idx}-${optIdx}`}
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}

                    {/* Add Question Button */}
                    <button
                        type="button"
                        onClick={addQuestion}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs font-medium transition-colors hover:border-[var(--gsm-emerald)] hover:text-[var(--gsm-primary)] dark:hover:text-[var(--gsm-emerald)] w-full justify-center"
                        style={{ borderColor: "var(--tnl-border)", color: "var(--foreground)" }}
                        data-testid={`${testId}-add-question`}
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        <span>{t("adminBuilderAddQuestion")}</span>
                    </button>
                </div>
            )}
        </div>
    );
}
