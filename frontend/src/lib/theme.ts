import { useEffect } from "react";
import { useSettings } from "@/lib/hooks";
import type { ThemeTokens } from "@/lib/types";

const STORAGE_KEY = "tnl-theme-tokens";

export function applyThemeTokens(t: Partial<ThemeTokens> | null | undefined, persist = true): void {
    if (!t || typeof document === "undefined") return;
    const root = document.documentElement;
    if (t.primary_color) root.style.setProperty("--gsm-primary", t.primary_color);
    if (t.emerald_color) root.style.setProperty("--gsm-emerald", t.emerald_color);
    if (t.obsidian_color) root.style.setProperty("--gsm-obsidian", t.obsidian_color);
    if (t.accent_color) root.style.setProperty("--gsm-accent", t.accent_color);
    if (t.accent_hover_color) root.style.setProperty("--gsm-accent-hover", t.accent_hover_color);
    if (t.color_tan_text) root.style.setProperty("--tnl-tan-text-light", t.color_tan_text);
    if (t.color_surface) root.style.setProperty("--tnl-surface-light", t.color_surface);
    if (t.color_border) root.style.setProperty("--tnl-border-light", t.color_border);
    if (t.color_body) root.style.setProperty("--tnl-body-light", t.color_body);
    if (t.color_green_hover) root.style.setProperty("--tnl-green-hover", t.color_green_hover);
    if (persist) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
        } catch {
            // ignore storage quota errors
        }
    }
}

export function useApplyThemeTokens(): void {
    const { data: settings } = useSettings();

    useEffect(() => {
        try {
            const cached = localStorage.getItem(STORAGE_KEY);
            if (cached) applyThemeTokens(JSON.parse(cached) as Partial<ThemeTokens>, false);
        } catch {
            // ignore malformed cache
        }
    }, []);

    useEffect(() => {
        if (settings?.theme_tokens) {
            applyThemeTokens(settings.theme_tokens, true);
        }
    }, [settings?.theme_tokens]);
}
