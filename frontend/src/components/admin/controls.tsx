// TNL Studio Design System v2 — the toggle and select primitives.
//
// They live under components/ (not pages/admin/) so every admin surface — the
// editor's two columns, the media picker, the structured repeaters — can share
// them without importing a page module. `pages/admin/AdminUI` re-exports both,
// so existing imports keep working unchanged.

import type { ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Modern on/off toggle. Replaces `<input type="checkbox">` + floating “Yes/No”
 * labels. The accessible name is the label text (kept byte-identical to the old
 * control) so `getByLabelText` keeps resolving to the switch.
 */
export function AdminSwitch({
    label,
    description,
    checked,
    onCheckedChange,
    disabled = false,
    testId,
    className = "",
    labelHidden = false,
    id,
}: {
    label: string;
    description?: ReactNode;
    checked: boolean;
    onCheckedChange: (next: boolean) => void;
    disabled?: boolean;
    testId?: string;
    className?: string;
    labelHidden?: boolean;
    /** Optional DOM id used to pair the visible label with the switch control. */
    id?: string;
}) {
    return (
        <div className={cn("flex items-start gap-3", disabled && "opacity-60", className)}>
            <button
                id={id}
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                disabled={disabled}
                onClick={() => onCheckedChange(!checked)}
                data-testid={testId}
                className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tnl-green)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--tnl-surface)]",
                    "disabled:cursor-not-allowed",
                    checked
                        ? "border-[var(--tnl-green)] bg-[var(--tnl-green)]"
                        : "border-[var(--tnl-border)] bg-[var(--tnl-surface-2)]",
                )}
            >
                <span
                    aria-hidden="true"
                    className={cn(
                        "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                        checked ? "translate-x-[18px]" : "translate-x-0.5",
                    )}
                />
            </button>
            {labelHidden ? null : id ? (
                <span className="min-w-0">
                    <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-[var(--tnl-heading)]">
                        {label}
                    </label>
                    {description ? <span className="mt-0.5 block text-xs text-[var(--tnl-body)]">{description}</span> : null}
                </span>
            ) : (
                <span className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--tnl-heading)]">{label}</span>
                    {description ? <span className="mt-0.5 block text-xs text-[var(--tnl-body)]">{description}</span> : null}
                </span>
            )}
        </div>
    );
}

type AdminSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
    [key: `data-${string}`]: string | number | undefined;
} & {
    /** Width/layout classes for the wrapper (the select itself is always w-full). */
    wrapperClassName?: string;
};

/**
 * A native `<select>` in the house style: appearance-none + pinned chevron,
 * h-9 / rounded-lg — identical in the editor, the media picker and settings.
 */
export function AdminSelect({ className = "", wrapperClassName = "", children, ...props }: AdminSelectProps) {
    return (
        <div className={cn("relative", wrapperClassName)}>
            <select
                {...props}
                className={cn(
                    "h-9 w-full appearance-none rounded-lg border border-[var(--tnl-border)] bg-[var(--tnl-surface-2)] pl-3 pr-8 text-sm text-[var(--tnl-heading)]",
                    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tnl-green)]",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    className,
                )}
            >
                {children}
            </select>
            <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--tnl-body)]"
            />
        </div>
    );
}
