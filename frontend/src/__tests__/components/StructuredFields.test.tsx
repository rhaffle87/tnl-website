import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
    TagChipsField,
    KeyValueMapEditor,
    MEMBER_SOCIAL_PRESETS,
    ObjectListRepeater,
    FormFieldsBuilder,
    type RepeaterFieldSpec,
} from "@/components/admin/repeaters";
import type { FormField } from "@/lib/types/types";

describe("Visual Repeater & Structured Field Builder Tests", () => {
    describe("TagChipsField", () => {
        it("renders existing tags and adds new tag on Enter or comma", () => {
            const onChange = vi.fn();
            const { rerender } = render(
                <TagChipsField
                    label="Research Topics"
                    value={["Network Security", "SDR"]}
                    onChange={onChange}
                    testId="tags-field"
                />
            );

            expect(screen.getByText("Network Security")).toBeInTheDocument();
            expect(screen.getByText("SDR")).toBeInTheDocument();

            const input = screen.getByTestId("tags-field-input");
            fireEvent.change(input, { target: { value: "Optical Switching" } });
            fireEvent.keyDown(input, { key: "Enter" });

            expect(onChange).toHaveBeenCalledWith(["Network Security", "SDR", "Optical Switching"]);

            // Re-render with new tags and test comma separation
            rerender(
                <TagChipsField
                    label="Research Topics"
                    value={["Network Security", "SDR", "Optical Switching"]}
                    onChange={onChange}
                    testId="tags-field"
                />
            );

            fireEvent.change(input, { target: { value: "5G Core," } });
            fireEvent.keyDown(input, { key: "," });

            expect(onChange).toHaveBeenCalledWith([
                "Network Security",
                "SDR",
                "Optical Switching",
                "5G Core",
            ]);
        });

        it("handles pasting comma-separated tokens and ignores duplicates", () => {
            const onChange = vi.fn();
            render(
                <TagChipsField
                    value={["SDN"]}
                    onChange={onChange}
                    testId="tags-field"
                />
            );

            const input = screen.getByTestId("tags-field-input");
            fireEvent.paste(input, {
                clipboardData: {
                    getData: () => "sdn, NFV, Cloud Core",
                },
            });

            // "sdn" is duplicate of "SDN" (case-insensitive), so only NFV and Cloud Core are added
            expect(onChange).toHaveBeenCalledWith(["SDN", "NFV", "Cloud Core"]);
        });

        it("removes tag on click X and on Backspace when input is empty", () => {
            const onChange = vi.fn();
            render(
                <TagChipsField
                    value={["Tag1", "Tag2"]}
                    onChange={onChange}
                    testId="tags-field"
                />
            );

            const removeBtn = screen.getByTestId("tag-chip-remove-0");
            fireEvent.click(removeBtn);
            expect(onChange).toHaveBeenCalledWith(["Tag2"]);

            const input = screen.getByTestId("tags-field-input");
            fireEvent.keyDown(input, { key: "Backspace" });
            expect(onChange).toHaveBeenCalledWith(["Tag1"]);
        });
    });

    describe("KeyValueMapEditor", () => {
        it("renders preset keys for member socials and updates value", () => {
            const onChange = vi.fn();
            render(
                <KeyValueMapEditor
                    label="Profile Links"
                    value={{ linkedin: "https://linkedin.com/in/tnl", github: "https://github.com/tnl" }}
                    presetKeys={MEMBER_SOCIAL_PRESETS}
                    onChange={onChange}
                    testId="member-links"
                />
            );

            const linkedinInput = screen.getByTestId("member-links-preset-linkedin");
            expect(linkedinInput).toHaveValue("https://linkedin.com/in/tnl");

            fireEvent.change(linkedinInput, { target: { value: "https://linkedin.com/in/updated" } });
            expect(onChange).toHaveBeenCalledWith({
                linkedin: "https://linkedin.com/in/updated",
                github: "https://github.com/tnl",
            });
        });

        it("allows adding custom keys and preserves existing non-preset entries", () => {
            const onChange = vi.fn();
            render(
                <KeyValueMapEditor
                    value={{ custom_portfolio: "https://myportfolio.site" }}
                    presetKeys={MEMBER_SOCIAL_PRESETS}
                    onChange={onChange}
                    testId="member-links"
                />
            );

            expect(screen.getByTestId("member-links-val-custom_portfolio")).toHaveValue(
                "https://myportfolio.site"
            );

            const addCustomBtn = screen.getByTestId("member-links-add-custom");
            fireEvent.click(addCustomBtn);

            expect(onChange).toHaveBeenCalledWith({
                custom_portfolio: "https://myportfolio.site",
                custom_field: "",
            });
        });

        it("synchronizes bi-directionally with Raw JSON mode", () => {
            const onChange = vi.fn();
            render(
                <KeyValueMapEditor
                    value={{ key1: "val1" }}
                    onChange={onChange}
                    testId="kv-editor"
                />
            );

            const toggleBtn = screen.getByTestId("kv-editor-raw-toggle");
            fireEvent.click(toggleBtn);

            const textarea = screen.getByTestId("kv-editor-raw-textarea");
            expect(textarea).toBeInTheDocument();
            expect(textarea).toHaveValue(JSON.stringify({ key1: "val1" }, null, 2));

            fireEvent.change(textarea, { target: { value: JSON.stringify({ key1: "newVal", key2: "val2" }) } });
            expect(onChange).toHaveBeenCalledWith({ key1: "newVal", key2: "val2" });
        });
    });

    describe("ObjectListRepeater", () => {
        const testFields: RepeaterFieldSpec[] = [
            { key: "title", label: "Title", type: "text" },
            { key: "detail", label: "Detail", type: "textarea" },
            { key: "date", label: "Date", type: "text" },
        ];

        it("renders items, moves order, duplicates, and deletes item", () => {
            const onChange = vi.fn();
            const initialItems = [
                { title: "Module 1", detail: "Detail 1", date: "2026-11-28" },
                { title: "Module 2", detail: "Detail 2", date: "2026-11-29" },
            ];

            render(
                <ObjectListRepeater
                    label="Event Modules"
                    value={initialItems}
                    fields={testFields}
                    onChange={onChange}
                    testId="modules-repeater"
                />
            );

            expect(screen.getByTestId("modules-repeater-card-title-0")).toHaveTextContent("Module 1");
            expect(screen.getByTestId("modules-repeater-card-title-1")).toHaveTextContent("Module 2");

            // Move item 1 down
            const moveDownBtn = screen.getByTestId("modules-repeater-card-down-0");
            fireEvent.click(moveDownBtn);
            expect(onChange).toHaveBeenCalledWith([initialItems[1], initialItems[0]]);

            // Duplicate item 0
            const dupBtn = screen.getByTestId("modules-repeater-card-dup-0");
            fireEvent.click(dupBtn);
            expect(onChange).toHaveBeenCalledWith([
                initialItems[0],
                initialItems[0],
                initialItems[1],
            ]);

            // Remove item 0
            const removeBtn = screen.getByTestId("modules-repeater-card-remove-0");
            fireEvent.click(removeBtn);
            expect(onChange).toHaveBeenCalledWith([initialItems[1]]);
        });

        it("adds new item with default fields", () => {
            const onChange = vi.fn();
            render(
                <ObjectListRepeater
                    fields={testFields}
                    value={[]}
                    onChange={onChange}
                    testId="modules-repeater"
                />
            );

            const addBtn = screen.getByTestId("modules-repeater-add");
            fireEvent.click(addBtn);

            expect(onChange).toHaveBeenCalledWith([{ title: "", detail: "", date: "" }]);
        });
    });

    describe("FormFieldsBuilder", () => {
        const initialFormFields: FormField[] = [
            { type: "text", label: "Nama Lengkap", required: true, options: [] },
            { type: "select", label: "Angkatan", required: true, options: ["2024", "2025", "2026"] },
        ];

        it("renders form fields, allows adding options for select, and derives slug keys", () => {
            const onChange = vi.fn();
            render(
                <FormFieldsBuilder
                    value={initialFormFields}
                    onChange={onChange}
                    testId="form-builder"
                />
            );

            expect(screen.getByTestId("form-builder-question-title-0")).toHaveTextContent("Nama Lengkap");
            expect(screen.getByTestId("form-builder-key-0")).toHaveValue("f_nama-lengkap");

            // Select field has options pane
            expect(screen.getByTestId("form-builder-options-pane-1")).toBeInTheDocument();
            expect(screen.getByTestId("form-builder-option-1-0")).toHaveValue("2024");

            // Add option
            const addOptBtn = screen.getByTestId("form-builder-add-option-1");
            fireEvent.click(addOptBtn);

            expect(onChange).toHaveBeenCalledWith([
                initialFormFields[0],
                {
                    ...initialFormFields[1],
                    options: ["2024", "2025", "2026", "Pilihan 4"],
                },
            ]);
        });

        it("toggles read-only preview mode", () => {
            render(
                <FormFieldsBuilder
                    value={initialFormFields}
                    onChange={vi.fn()}
                    testId="form-builder"
                />
            );

            const previewToggle = screen.getByTestId("form-builder-preview-toggle");
            fireEvent.click(previewToggle);

            expect(screen.getByTestId("form-builder-preview-pane")).toBeInTheDocument();
            expect(screen.getByText("Pratinjau Formulir Pendaftar (Read-Only)")).toBeInTheDocument();
        });
    });
});
