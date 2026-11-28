// Visual rich-text editor for every CMS field whose schema type is "html".
//
// Output is plain HTML that matches the backend allowlist in `backend/lib/sanitize.py`
// (p, br, hr, strong, em, u, s, a, ul, ol, li, h3-h6, blockquote, code, pre, img, figure,
// figcaption, table...). The toolbar only offers what the sanitizer keeps, so nothing an
// editor applies can silently disappear when the article is saved. Legacy plain-text values
// ("line one\n\nline two") are wrapped in paragraphs on load, valid HTML is never rewritten.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
    Bold,
    Code2,
    Heading3,
    Heading4,
    ImagePlus,
    Italic,
    Link2,
    Link2Off,
    List,
    ListOrdered,
    Minus,
    Quote,
    Redo2,
    Undo2,
} from "lucide-react";
import { MediaPickerModal } from "@/components/admin/media";
import type { MediaAsset } from "@/lib/types/types";
import { useAdminT } from "@/lib/i18n/admin-i18n";

export interface RichTextFieldProps {
    id?: string;
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    /** Media library folder the image picker opens on. */
    defaultFolder?: string;
    /** Links the chosen asset back to the record being edited. */
    attachedTo?: { resource: string; item_id?: string | null } | null;
    testId?: string;
}

type Mode = "write" | "preview" | "html";

const BLOCK_TAG = /<\/?(?:p|h[1-6]|ul|ol|li|blockquote|figure|figcaption|table|thead|tbody|tr|td|th|pre|code|div|span|br|hr|strong|b|em|i|u|s|a|img)\b/i;

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** Plain text with blank-line paragraphs becomes safe HTML; real HTML is returned untouched. */
export function normalizeHtml(raw: string | null | undefined): string {
    const value = (raw ?? "").trim();
    if (!value) return "";
    if (BLOCK_TAG.test(value)) return value;
    return value
        .split(/\n{2,}/)
        .map((block) => `<p>${escapeHtml(block.trim()).replace(/\n/g, "<br>")}</p>`)
        .join("");
}

/** Only what the backend sanitizer keeps as a link target. */
export function isSafeHref(href: string): boolean {
    const value = (href || "").trim();
    if (!value) return false;
    if (value.startsWith("//")) return false;
    return /^(?:https?:\/\/|\/|mailto:)/i.test(value) && !/^\s*javascript:/i.test(value);
}

export function htmlToPlainText(html: string): string {
    return (html || "")
        .replace(/<(?:br|hr)\s*\/?>/gi, " ")
        .replace(/<\/(?:p|h[1-6]|li|blockquote|div)>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
}

export function countWords(html: string): number {
    const text = htmlToPlainText(html);
    return text ? text.split(" ").length : 0;
}

function readingMinutes(words: number): number {
    return words === 0 ? 0 : Math.max(1, Math.round(words / 200));
}

interface ToolButtonProps {
    label: string;
    testId: string;
    onClick: () => void;
    disabled?: boolean;
    active?: boolean;
    children: React.ReactNode;
}

function ToolButton({ label, testId, onClick, disabled, active, children }: ToolButtonProps) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active ? true : undefined}
            disabled={disabled}
            onClick={onClick}
            data-testid={testId}
            className="flex h-8 w-8 items-center justify-center rounded-md border text-[var(--tnl-body)] transition-colors disabled:opacity-40"
            style={{
                borderColor: active ? "var(--tnl-link)" : "var(--tnl-border)",
                color: active ? "var(--tnl-link)" : "var(--tnl-body)",
            }}
        >
            {children}
        </button>
    );
}

function useEditorState(editor: Editor | null) {
    const [, setTick] = useState(0);
    useEffect(() => {
        if (!editor) return;
        const rerender = () => setTick((n) => n + 1);
        editor.on("transaction", rerender);
        editor.on("selectionUpdate", rerender);
        return () => {
            editor.off("transaction", rerender);
            editor.off("selectionUpdate", rerender);
        };
    }, [editor]);
}

export function RichTextField({
    id,
    value,
    onChange,
    placeholder,
    defaultFolder,
    attachedTo,
    testId = "rich-text",
}: RichTextFieldProps) {
    const t = useAdminT();
    const resolvedPlaceholder = placeholder ?? t("adminBuilderArticlePlaceholder");
    const placeholderRef = useRef(resolvedPlaceholder);
    const [mode, setMode] = useState<Mode>("write");
    const [pickerOpen, setPickerOpen] = useState(false);
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkDraft, setLinkDraft] = useState("");
    const [linkError, setLinkError] = useState(false);
    const lastEmitted = useRef<string>(normalizeHtml(value));

    const editor = useEditor({
        extensions: [
            // h1/h2 are not in the backend allowlist, so headings start at h3.
            StarterKit.configure({
                heading: { levels: [3, 4] },
                link: { openOnClick: false, autolink: false },
            }),
            Image.configure({ inline: false }),
            Placeholder.configure({ placeholder: () => placeholderRef.current }),
        ],
        content: normalizeHtml(value),
        onUpdate: ({ editor: instance }) => {
            const html = instance.getHTML();
            lastEmitted.current = html;
            onChange(html === "<p></p>" ? "" : html);
        },
    });

    useEditorState(editor);

    // Refresh decorations without recreating the editor or rewriting authored HTML.
    useEffect(() => {
        placeholderRef.current = resolvedPlaceholder;
        if (editor) editor.view.dispatch(editor.state.tr);
    }, [editor, resolvedPlaceholder]);

    // Keep the editor in sync when the parent replaces the value (switching records).
    useEffect(() => {
        if (!editor) return;
        const next = normalizeHtml(value);
        if (next === lastEmitted.current) return;
        if (next === editor.getHTML()) return;
        editor.commands.setContent(next || "", { emitUpdate: false });
        lastEmitted.current = next;
    }, [editor, value]);

    const html = editor ? editor.getHTML() : normalizeHtml(value);
    const words = useMemo(() => countWords(html === "<p></p>" ? "" : html), [html]);

    const applyLink = useCallback(() => {
        if (!editor) return;
        const href = linkDraft.trim();
        if (!isSafeHref(href)) {
            setLinkError(true);
            return;
        }
        editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
        setLinkError(false);
        setLinkOpen(false);
        setLinkDraft("");
    }, [editor, linkDraft]);

    const insertImage = useCallback(
        (items: MediaAsset[]) => {
            const asset = items[0];
            setPickerOpen(false);
            if (!editor || !asset) return;
            editor
                .chain()
                .focus()
                .setImage({ src: asset.webp_url || asset.url, alt: asset.alt || asset.original_name || "" })
                .run();
        },
        [editor],
    );

    return (
        <div data-testid={testId}>
            <div
                className="flex flex-wrap items-center gap-1.5 rounded-t-[var(--tnl-radius-button)] border border-b-0 p-1.5"
                style={{ borderColor: "var(--tnl-border)", background: "var(--tnl-surface)" }}
                role="toolbar"
                aria-label={t("adminBuilderFormatting")}
            >
                <ToolButton label={t("adminBuilderParagraph")} testId={`${testId}-paragraph`} onClick={() => editor?.chain().focus().setParagraph().run()} active={editor?.isActive("paragraph")} disabled={!editor}>
                    <span className="text-xs font-semibold">¶</span>
                </ToolButton>
                <ToolButton label={t("adminBuilderHeading3")} testId={`${testId}-h3`} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} active={editor?.isActive("heading", { level: 3 })} disabled={!editor}>
                    <Heading3 className="h-4 w-4" />
                </ToolButton>
                <ToolButton label={t("adminBuilderHeading4")} testId={`${testId}-h4`} onClick={() => editor?.chain().focus().toggleHeading({ level: 4 }).run()} active={editor?.isActive("heading", { level: 4 })} disabled={!editor}>
                    <Heading4 className="h-4 w-4" />
                </ToolButton>
                <ToolButton label={t("adminBuilderBold")} testId={`${testId}-bold`} onClick={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive("bold")} disabled={!editor}>
                    <Bold className="h-4 w-4" />
                </ToolButton>
                <ToolButton label={t("adminBuilderItalic")} testId={`${testId}-italic`} onClick={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive("italic")} disabled={!editor}>
                    <Italic className="h-4 w-4" />
                </ToolButton>
                <ToolButton label={t("adminBuilderBulletList")} testId={`${testId}-bullet-list`} onClick={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive("bulletList")} disabled={!editor}>
                    <List className="h-4 w-4" />
                </ToolButton>
                <ToolButton label={t("adminBuilderNumberedList")} testId={`${testId}-ordered-list`} onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive("orderedList")} disabled={!editor}>
                    <ListOrdered className="h-4 w-4" />
                </ToolButton>
                <ToolButton label={t("adminBuilderQuote")} testId={`${testId}-blockquote`} onClick={() => editor?.chain().focus().toggleBlockquote().run()} active={editor?.isActive("blockquote")} disabled={!editor}>
                    <Quote className="h-4 w-4" />
                </ToolButton>
                <ToolButton label={t("adminBuilderInlineCode")} testId={`${testId}-code`} onClick={() => editor?.chain().focus().toggleCode().run()} active={editor?.isActive("code")} disabled={!editor}>
                    <Code2 className="h-4 w-4" />
                </ToolButton>
                <ToolButton label={t("adminBuilderDivider")} testId={`${testId}-horizontal-rule`} onClick={() => editor?.chain().focus().setHorizontalRule().run()} disabled={!editor}>
                    <Minus className="h-4 w-4" />
                </ToolButton>
                <ToolButton label={t("adminBuilderInsertLink")} testId={`${testId}-link`} onClick={() => { setLinkError(false); setLinkDraft(editor?.getAttributes("link").href || ""); setLinkOpen((v) => !v); }} active={editor?.isActive("link")} disabled={!editor}>
                    <Link2 className="h-4 w-4" />
                </ToolButton>
                <ToolButton label={t("adminBuilderRemoveLink")} testId={`${testId}-unlink`} onClick={() => editor?.chain().focus().extendMarkRange("link").unsetLink().run()} disabled={!editor || !editor.isActive("link")}>
                    <Link2Off className="h-4 w-4" />
                </ToolButton>
                <ToolButton label={t("adminBuilderInsertImage")} testId={`${testId}-insert-image`} onClick={() => setPickerOpen(true)} disabled={!editor}>
                    <ImagePlus className="h-4 w-4" />
                </ToolButton>
                <ToolButton label={t("adminBuilderUndo")} testId={`${testId}-undo`} onClick={() => editor?.chain().focus().undo().run()} disabled={!editor || !editor.can().undo()}>
                    <Undo2 className="h-4 w-4" />
                </ToolButton>
                <ToolButton label={t("adminBuilderRedo")} testId={`${testId}-redo`} onClick={() => editor?.chain().focus().redo().run()} disabled={!editor || !editor.can().redo()}>
                    <Redo2 className="h-4 w-4" />
                </ToolButton>

                <div className="ml-auto flex items-center gap-1" role="group" aria-label={t("adminBuilderEditorMode")}>
                    {(["write", "preview", "html"] as Mode[]).map((option) => (
                        <button
                            key={option}
                            type="button"
                            onClick={() => setMode(option)}
                            data-testid={`${testId}-mode-${option}`}
                            aria-pressed={mode === option}
                            className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                            style={
                                mode === option
                                    ? { background: "var(--tnl-green)", color: "var(--tnl-surface)" }
                                    : { color: "var(--tnl-body)", border: "1px solid var(--tnl-border)" }
                            }
                        >
                            {option === "write" ? t("adminBuilderWrite") : option === "preview" ? t("adminBuilderPreview") : "</> HTML"}
                        </button>
                    ))}
                </div>
            </div>

            {linkOpen && mode === "write" ? (
                <div className="flex flex-wrap items-center gap-2 border border-t-0 px-2 py-2" style={{ borderColor: "var(--tnl-border)", background: "var(--tnl-surface)" }}>
                    <input
                        id={`${testId}-link-input`}
                        className="tnl-field h-9 flex-1 text-sm"
                        value={linkDraft}
                        placeholder={t("adminBuilderLinkPlaceholder")}
                        aria-label={t("adminBuilderLinkUrl")}
                        aria-invalid={linkError ? true : undefined}
                        aria-describedby={linkError ? `${testId}-link-error` : undefined}
                        data-testid={`${testId}-link-input`}
                        onChange={(e) => setLinkDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } }}
                    />
                    <button type="button" className="tnl-btn tnl-btn-primary h-9 text-sm" data-testid={`${testId}-link-apply`} onClick={applyLink}>
                        {t("adminApply")}
                    </button>
                    {linkError ? (
                        <p id={`${testId}-link-error`} role="alert" className="w-full text-xs text-[var(--tnl-danger)]" data-testid={`${testId}-link-error`}>
                            {t("adminBuilderLinkError")}
                        </p>
                    ) : null}
                </div>
            ) : null}

            {mode === "write" ? (
                <div
                    id={id}
                    className="tnl-rich-text rounded-b-[var(--tnl-radius-button)] border"
                    style={{ borderColor: "var(--tnl-border)", background: "var(--tnl-surface)" }}
                    data-testid={`${testId}-editor`}
                >
                    <EditorContent editor={editor} />
                </div>
            ) : mode === "preview" ? (
                <div
                    className="tnl-prose min-h-[220px] rounded-b-[var(--tnl-radius-button)] border px-4 py-3"
                    style={{ borderColor: "var(--tnl-border)", background: "var(--tnl-surface)" }}
                    data-testid={`${testId}-preview`}
                    // Biome-free legacy preview: value comes from the sanitizing backend on save.
                    dangerouslySetInnerHTML={{ __html: html === "<p></p>" ? "" : html }}
                />
            ) : (
                <textarea
                    id={id}
                    className="tnl-field min-h-[220px] rounded-b-[var(--tnl-radius-button)] font-mono text-xs"
                    value={html === "<p></p>" ? "" : html}
                    aria-label={t("adminBuilderRawHtml")}
                    data-testid={`${testId}-html-source`}
                    onChange={(e) => {
                        lastEmitted.current = e.target.value;
                        onChange(e.target.value);
                        editor?.commands.setContent(e.target.value || "", { emitUpdate: false });
                    }}
                />
            )}

            <p className="mt-1.5 text-xs text-[var(--tnl-muted)]" data-testid={`${testId}-word-count`}>
                {t("adminBuilderReadingSummary").replace("{words}", String(words)).replace("{unit}", t(words === 1 ? "adminBuilderWord" : "adminBuilderWords")).replace("{minutes}", String(readingMinutes(words)))}
            </p>

            <MediaPickerModal
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                mode="single"
                accept="image"
                defaultFolder={defaultFolder}
                attachedTo={attachedTo ?? null}
                onSelect={insertImage}
            />
        </div>
    );
}

export default RichTextField;
