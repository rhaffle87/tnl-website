import { useState, type KeyboardEvent, type ClipboardEvent } from "react";
import { X, Tag } from "lucide-react";

export interface TagChipsFieldProps {
    label?: string;
    value: string[] | string;
    onChange: (tags: string[]) => void;
    placeholder?: string;
    help?: string;
    testId?: string;
}

export function TagChipsField({
    label,
    value,
    onChange,
    placeholder = "Type and press Enter or comma...",
    help,
    testId,
}: TagChipsFieldProps) {
    const [inputValue, setInputValue] = useState("");

    // Normalize value to string[]
    const tags: string[] = Array.isArray(value)
        ? value
        : typeof value === "string"
        ? value.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

    const addTag = (rawText: string) => {
        const trimmed = rawText.trim();
        if (!trimmed) return;

        // Support pasting or typing comma-separated tokens
        const tokens = trimmed
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);

        const newTags = [...tags];
        for (const token of tokens) {
            // Prevent duplicate tags (case-insensitive check)
            if (!newTags.some((existing) => existing.toLowerCase() === token.toLowerCase())) {
                newTags.push(token);
            }
        }

        if (newTags.length !== tags.length) {
            onChange(newTags);
        }
        setInputValue("");
    };

    const removeTag = (indexToRemove: number) => {
        const next = tags.filter((_, idx) => idx !== indexToRemove);
        onChange(next);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag(inputValue);
        } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
            // Remove last tag when backspacing on empty input
            removeTag(tags.length - 1);
        }
    };

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        const text = e.clipboardData.getData("text");
        if (text && text.includes(",")) {
            e.preventDefault();
            addTag(text);
        }
    };

    return (
        <div className="space-y-1.5" data-testid={testId}>
            {label && (
                <label className="flex items-center gap-1.5 text-sm font-medium">
                    <Tag className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
                    <span>{label}</span>
                </label>
            )}

            <div
                className="flex min-h-[46px] flex-wrap items-center gap-1.5 rounded-lg border p-1.5 transition-colors focus-within:ring-2 focus-within:ring-amber-500/30"
                style={{
                    backgroundColor: "var(--tnl-bg)",
                    borderColor: "var(--tnl-border)",
                }}
            >
                {tags.map((tag, idx) => (
                    <span
                        key={`${tag}-${idx}`}
                        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                        style={{
                            backgroundColor: "var(--tnl-card-bg)",
                            color: "var(--tnl-text)",
                            border: "1px solid var(--tnl-border)",
                        }}
                        data-testid={`tag-chip-${idx}`}
                    >
                        <span>{tag}</span>
                        <button
                            type="button"
                            onClick={() => removeTag(idx)}
                            className="rounded p-0.5 opacity-60 hover:opacity-100 hover:bg-rose-500/10 hover:text-rose-600 transition-colors"
                            aria-label={`Remove tag ${tag}`}
                            data-testid={`tag-chip-remove-${idx}`}
                        >
                            <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                    </span>
                ))}

                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onBlur={() => {
                        if (inputValue.trim()) {
                            addTag(inputValue);
                        }
                    }}
                    placeholder={tags.length === 0 ? placeholder : "Add more..."}
                    className="flex-1 min-w-[140px] bg-transparent px-2 py-1 text-sm outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                    data-testid={testId ? `${testId}-input` : "tag-chips-input"}
                />
            </div>

            {help && (
                <p className="text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                    {help}
                </p>
            )}
        </div>
    );
}
