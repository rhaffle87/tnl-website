import { useId } from "react";
import { useAdminT } from "@/lib/i18n/admin-i18n";

export function DivisionSelector({ value, onChange, label, children }: { value: string[]; onChange: (value: string[]) => void; label?: string; children?: React.ReactNode }) {
    const t = useAdminT();
    const id = useId();
    const choices = [...new Set(["BPH", "Academic", "Research", "Social", "Internal", "External", ...value])];
    return <fieldset className="space-y-2" aria-describedby={`${id}-help`}>
        <legend className="text-sm font-medium">{label ?? t("adminDivisions")}</legend>
        <p id={`${id}-help`} className="text-xs text-[var(--tnl-body)]">{t("adminDivisionsHelp")}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">{choices.map((choice) => <label key={choice} className="inline-flex min-h-9 items-center gap-2 text-xs">
            <input type="checkbox" checked={value.includes(choice)} onChange={(e) => onChange(e.target.checked ? [...value, choice] : value.filter((v) => v !== choice))} />{choice}
        </label>)}</div>
        {children}
    </fieldset>;
}
