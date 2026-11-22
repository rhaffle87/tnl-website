import { useState, useId } from "react";
import {
    Linkedin,
    Instagram,
    Github,
    Globe,
    FileText,
    GraduationCap,
    Award,
    BookOpen,
    Fingerprint,
    Plus,
    Trash2,
    Code,
    AlertCircle,
    Check,
} from "lucide-react";

export interface PresetKeyConfig {
    key: string;
    label: string;
    placeholder?: string;
    icon?: "linkedin" | "instagram" | "scholar" | "scopus" | "sinta" | "orcid" | "github" | "website" | "cv";
    validateUrl?: boolean;
}

export const MEMBER_SOCIAL_PRESETS: PresetKeyConfig[] = [
    { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/username", icon: "linkedin", validateUrl: true },
    { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/username or @handle", icon: "instagram" },
    { key: "scholar", label: "Google Scholar", placeholder: "https://scholar.google.com/citations?user=...", icon: "scholar", validateUrl: true },
    { key: "scopus", label: "Scopus Author ID", placeholder: "https://scopus.com/authid/detail.uri?authorId=...", icon: "scopus", validateUrl: true },
    { key: "sinta", label: "SINTA ID", placeholder: "https://sinta.kemdikbud.go.id/authors/profile/...", icon: "sinta", validateUrl: true },
    { key: "orcid", label: "ORCID iD", placeholder: "https://orcid.org/0000-0000-0000-0000", icon: "orcid", validateUrl: true },
    { key: "github", label: "GitHub", placeholder: "https://github.com/username", icon: "github", validateUrl: true },
    { key: "website", label: "Personal Website", placeholder: "https://yourwebsite.com", icon: "website", validateUrl: true },
    { key: "cv_url", label: "Curriculum Vitae (PDF)", placeholder: "https://... or /api/media-files/...", icon: "cv" },
];

export interface KeyValueMapEditorProps {
    label?: string;
    value: Record<string, unknown> | string | null | undefined;
    onChange: (val: Record<string, string>) => void;
    presetKeys?: PresetKeyConfig[];
    help?: string;
    testId?: string;
    keyPlaceholder?: string;
    valuePlaceholder?: string;
}

function renderPresetIcon(icon?: string) {
    switch (icon) {
        case "linkedin":
            return <Linkedin className="h-4 w-4 text-[#0077B5]" aria-hidden="true" />;
        case "instagram":
            return <Instagram className="h-4 w-4 text-[#E4405F]" aria-hidden="true" />;
        case "github":
            return <Github className="h-4 w-4 text-neutral-800 dark:text-neutral-200" aria-hidden="true" />;
        case "scholar":
            return <GraduationCap className="h-4 w-4 text-[#4285F4]" aria-hidden="true" />;
        case "scopus":
            return <BookOpen className="h-4 w-4 text-[#FF8C00]" aria-hidden="true" />;
        case "sinta":
            return <Award className="h-4 w-4 text-[#10B981]" aria-hidden="true" />;
        case "orcid":
            return <Fingerprint className="h-4 w-4 text-[#A6CE39]" aria-hidden="true" />;
        case "cv":
            return <FileText className="h-4 w-4 text-amber-600" aria-hidden="true" />;
        case "website":
        default:
            return <Globe className="h-4 w-4 text-neutral-500" aria-hidden="true" />;
    }
}

export function KeyValueMapEditor({
    label,
    value,
    onChange,
    presetKeys,
    help,
    testId = "key-value-editor",
    keyPlaceholder = "Property key",
    valuePlaceholder = "Property value",
}: KeyValueMapEditorProps) {
    const componentId = useId();
    const [rawMode, setRawMode] = useState(false);
    const [rawJsonText, setRawJsonText] = useState("");
    const [jsonError, setJsonError] = useState<string | null>(null);

    // Normalize value into a clean Record<string, string>
    const normalizedMap: Record<string, string> = (() => {
        if (!value) return {};
        if (typeof value === "string") {
            try {
                const parsed = JSON.parse(value);
                if (typeof parsed === "object" && parsed !== null) {
                    const res: Record<string, string> = {};
                    for (const [k, v] of Object.entries(parsed)) {
                        if (v !== null && v !== undefined) res[k] = String(v);
                    }
                    return res;
                }
            } catch {
                return {};
            }
        }
        if (typeof value === "object") {
            const res: Record<string, string> = {};
            for (const [k, v] of Object.entries(value)) {
                if (v !== null && v !== undefined) res[k] = String(v);
            }
            return res;
        }
        return {};
    })();

    // Custom non-preset keys
    const customKeys = presetKeys
        ? Object.keys(normalizedMap).filter((k) => !presetKeys.some((p) => p.key === k))
        : Object.keys(normalizedMap);

    const updateKey = (key: string, val: string) => {
        const next = { ...normalizedMap };
        const trimmed = val.trim();
        if (!trimmed) {
            delete next[key];
        } else {
            next[key] = trimmed;
        }
        onChange(next);
    };

    const removeCustomKey = (key: string) => {
        const next = { ...normalizedMap };
        delete next[key];
        onChange(next);
    };

    const addCustomEntry = () => {
        let candidate = "custom_field";
        let count = 1;
        while (candidate in normalizedMap) {
            candidate = `custom_field_${count++}`;
        }
        const next = { ...normalizedMap, [candidate]: "" };
        onChange(next);
    };

    const renameCustomKey = (oldKey: string, newKeyRaw: string) => {
        const newKey = newKeyRaw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
        if (!newKey || newKey === oldKey) return;
        const next: Record<string, string> = {};
        for (const [k, v] of Object.entries(normalizedMap)) {
            if (k === oldKey) {
                next[newKey] = v;
            } else {
                next[k] = v;
            }
        }
        onChange(next);
    };

    const toggleRawMode = () => {
        if (!rawMode) {
            setRawJsonText(JSON.stringify(normalizedMap, null, 2));
            setJsonError(null);
            setRawMode(true);
        } else {
            // Validate before leaving raw mode
            try {
                const parsed = rawJsonText.trim() ? JSON.parse(rawJsonText) : {};
                if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                    setJsonError("Raw JSON must be an object (e.g. { ... })");
                    return;
                }
                const clean: Record<string, string> = {};
                for (const [k, v] of Object.entries(parsed)) {
                    if (v !== null && v !== undefined && String(v).trim()) {
                        clean[k] = String(v).trim();
                    }
                }
                onChange(clean);
                setJsonError(null);
                setRawMode(false);
            } catch (err: unknown) {
                setJsonError((err as Error).message || "Invalid JSON syntax");
            }
        }
    };

    const handleRawTextChange = (text: string) => {
        setRawJsonText(text);
        try {
            const parsed = text.trim() ? JSON.parse(text) : {};
            if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
                setJsonError(null);
                const clean: Record<string, string> = {};
                for (const [k, v] of Object.entries(parsed)) {
                    if (v !== null && v !== undefined && String(v).trim()) {
                        clean[k] = String(v).trim();
                    }
                }
                onChange(clean);
            } else {
                setJsonError("Must be a JSON object");
            }
        } catch (err: unknown) {
            setJsonError((err as Error).message);
        }
    };

    return (
        <div className="space-y-3 rounded-xl border p-4 transition-colors" style={{ backgroundColor: "var(--tnl-card-bg)", borderColor: "var(--tnl-border)" }} data-testid={testId}>
            {/* Header row */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5" style={{ borderColor: "var(--tnl-border)" }}>
                <div>
                    {label && <h4 className="text-sm font-semibold tracking-tight">{label}</h4>}
                    {help && <p className="text-xs mt-0.5" style={{ color: "var(--tnl-tan-text)" }}>{help}</p>}
                </div>
                <button
                    type="button"
                    onClick={toggleRawMode}
                    className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-mono font-medium transition-colors hover:bg-neutral-500/10"
                    style={{ color: rawMode ? "var(--tnl-gold)" : "var(--tnl-tan-text)" }}
                    data-testid={`${testId}-raw-toggle`}
                >
                    <Code className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{rawMode ? "Visual Editor" : "</> Raw JSON"}</span>
                </button>
            </div>

            {/* Raw JSON View */}
            {rawMode ? (
                <div className="space-y-2">
                    <textarea
                        value={rawJsonText}
                        onChange={(e) => handleRawTextChange(e.target.value)}
                        rows={7}
                        className="w-full rounded-lg border p-2.5 font-mono text-xs outline-none focus:ring-2 focus:ring-amber-500/30"
                        style={{ backgroundColor: "var(--tnl-bg)", borderColor: jsonError ? "var(--tnl-red)" : "var(--tnl-border)" }}
                        data-testid={`${testId}-raw-textarea`}
                    />
                    {jsonError && (
                        <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>{jsonError}</span>
                        </div>
                    )}
                </div>
            ) : (
                /* Visual Form View */
                <div className="space-y-4">
                    {/* Preset Keys Grid */}
                    {presetKeys && presetKeys.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {presetKeys.map((item) => {
                                const currentVal = normalizedMap[item.key] || "";
                                const hasValue = Boolean(currentVal.trim());
                                const isInvalidUrl =
                                    item.validateUrl &&
                                    hasValue &&
                                    !currentVal.startsWith("http://") &&
                                    !currentVal.startsWith("https://") &&
                                    !currentVal.startsWith("/api/");

                                return (
                                    <div key={item.key} className="space-y-1">
                                        <div className="flex items-center justify-between text-xs font-medium">
                                            <span className="flex items-center gap-1.5">
                                                {renderPresetIcon(item.icon)}
                                                <span>{item.label}</span>
                                            </span>
                                            {hasValue && !isInvalidUrl && (
                                                <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                                            )}
                                        </div>
                                        <input
                                            type="text"
                                            value={currentVal}
                                            onChange={(e) => updateKey(item.key, e.target.value)}
                                            placeholder={item.placeholder || `Enter ${item.label}`}
                                            className="w-full rounded-lg border px-3 py-1.5 text-xs outline-none transition-colors focus:ring-2 focus:ring-amber-500/30"
                                            style={{
                                                backgroundColor: "var(--tnl-bg)",
                                                borderColor: isInvalidUrl ? "var(--tnl-red)" : "var(--tnl-border)",
                                            }}
                                            data-testid={`${testId}-preset-${item.key}`}
                                        />
                                        {isInvalidUrl && (
                                            <p className="text-[11px] text-amber-600 dark:text-amber-400">
                                                Tip: URL sebaiknya diawali https://
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Custom Keys Section */}
                    {customKeys.length > 0 && (
                        <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--tnl-border)" }}>
                            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>
                                {presetKeys ? "Custom Links / Additional Properties" : "Properties"}
                            </div>
                            <div className="space-y-2">
                                {customKeys.map((keyName) => (
                                    <div key={keyName} className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            defaultValue={keyName}
                                            onBlur={(e) => renameCustomKey(keyName, e.target.value)}
                                            placeholder={keyPlaceholder}
                                            className="w-1/3 rounded-lg border px-2.5 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-amber-500/30"
                                            style={{ backgroundColor: "var(--tnl-bg)", borderColor: "var(--tnl-border)" }}
                                            data-testid={`${testId}-key-${keyName}`}
                                        />
                                        <input
                                            type="text"
                                            value={normalizedMap[keyName] || ""}
                                            onChange={(e) => updateKey(keyName, e.target.value)}
                                            placeholder={valuePlaceholder}
                                            className="flex-1 rounded-lg border px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-amber-500/30"
                                            style={{ backgroundColor: "var(--tnl-bg)", borderColor: "var(--tnl-border)" }}
                                            data-testid={`${testId}-val-${keyName}`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeCustomKey(keyName)}
                                            className="rounded p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-500/10 transition-colors"
                                            aria-label={`Remove property ${keyName}`}
                                            data-testid={`${testId}-remove-${keyName}`}
                                        >
                                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Add Custom Button */}
                    <button
                        type="button"
                        onClick={addCustomEntry}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-xs font-medium transition-colors hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400"
                        style={{ borderColor: "var(--tnl-border)", color: "var(--tnl-text)" }}
                        data-testid={`${testId}-add-custom`}
                    >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{presetKeys ? "+ Add Custom Link" : "+ Add Property"}</span>
                    </button>
                </div>
            )}
        </div>
    );
}
