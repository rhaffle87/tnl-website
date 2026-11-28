import { useState } from "react";
import { useAdminT } from "@/lib/i18n/admin-i18n";

/** Keep JSON types intact; invalid edits never replace the last valid value. */
export function JsonValueField({ value, onChange, label, testId, onValidityChange }: {
    value: unknown;
    onChange: (value: unknown) => void;
    label: string;
    testId: string;
    onValidityChange?: (valid: boolean) => void;
}) {
    const [text, setText] = useState<string | null>(null);
    const [error, setError] = useState(false);
    const t = useAdminT();
    if (typeof value === "boolean") {
        return <input id={testId} type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} aria-label={label} data-testid={testId} />;
    }
    if (typeof value === "number") {
        return <><input id={testId} type="number" step="any" className="tnl-field text-sm" value={text ?? value} aria-label={label} aria-invalid={error || undefined} aria-describedby={error ? `${testId}-error` : undefined} data-testid={testId} onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const valid = next.trim() !== "" && Number.isFinite(Number(next));
            setError(!valid);
            onValidityChange?.(valid);
            if (valid) onChange(Number(next));
        }} />{error ? <p id={`${testId}-error`} role="alert" className="mt-1 text-xs text-[var(--tnl-danger)]">{t("adminInvalidNumberValue")}</p> : null}</>;
    }
    if (typeof value === "string" || value === undefined) {
        return <input id={testId} type="text" className="tnl-field text-sm" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} aria-label={label} data-testid={testId} />;
    }
    return <><textarea id={testId} rows={4} className="tnl-field font-mono text-xs" value={text ?? JSON.stringify(value, null, 2)} aria-label={label} aria-invalid={error || undefined} aria-describedby={error ? `${testId}-error` : undefined} data-testid={testId} onChange={(e) => {
        setText(e.target.value);
        try {
            const parsed: unknown = JSON.parse(e.target.value);
            setError(false);
            onValidityChange?.(true);
            onChange(parsed);
        } catch {
            setError(true);
            onValidityChange?.(false);
        }
    }} />{error ? <p id={`${testId}-error`} role="alert" className="mt-1 text-xs text-[var(--tnl-danger)]">{t("adminInvalidJsonValue")}</p> : null}</>;
}
