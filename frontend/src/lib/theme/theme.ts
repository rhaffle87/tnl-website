import { useCallback, useEffect, useState } from "react";
import { useSettings } from "@/lib/api/hooks";
import type { ThemeTokens } from "@/lib/types/types";

const STORAGE_KEY = "tnl-theme-tokens";
const THEME_STORAGE_KEY = "tnl-theme";
const THEME_EVENT = "tnl-theme-change";
export type ThemeMode = "light" | "dark";

function getSystemTheme(): ThemeMode {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

export function readThemeMode(): ThemeMode {
    if (typeof window === "undefined") return "light";
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : getSystemTheme();
}

export function applyThemeMode(mode: ThemeMode) {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", mode === "dark");
    document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", mode);
}

export function persistThemeMode(mode: ThemeMode) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    applyThemeMode(mode);
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: mode }));
}

export function useThemeMode() {
    const [mode, setMode] = useState<ThemeMode>(readThemeMode);

    useEffect(() => {
        applyThemeMode(mode);
    }, [mode]);

    useEffect(() => {
        const handleThemeChange = (event: Event) => {
            if (event.type === "storage") {
                const storageEvent = event as StorageEvent;
                if (storageEvent.key !== THEME_STORAGE_KEY) return;
                if (storageEvent.newValue === "dark" || storageEvent.newValue === "light") {
                    setMode(storageEvent.newValue);
                    return;
                }
            }
            const nextMode = (event as CustomEvent<ThemeMode>).detail;
            setMode(nextMode === "dark" || nextMode === "light" ? nextMode : readThemeMode());
        };

        window.addEventListener(THEME_EVENT, handleThemeChange);
        window.addEventListener("storage", handleThemeChange);
        return () => {
            window.removeEventListener(THEME_EVENT, handleThemeChange);
            window.removeEventListener("storage", handleThemeChange);
        };
    }, []);

    const setThemeMode = useCallback((nextMode: ThemeMode) => {
        setMode(nextMode);
        persistThemeMode(nextMode);
    }, []);

    const toggleTheme = useCallback(() => {
        setThemeMode(mode === "dark" ? "light" : "dark");
    }, [mode, setThemeMode]);

    return { mode, isDark: mode === "dark", setThemeMode, toggleTheme };
}

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
