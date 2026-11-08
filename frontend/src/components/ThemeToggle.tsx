"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import s from "./ThemeToggle.module.css";

export type Theme = "dark" | "light";
export type ThemeMode = Theme | "system";

const STORAGE_KEY = "restore-theme";
const LEGACY_STORAGE_KEY = "restore-auth-theme";
const THEME_MODE_STORAGE_KEY = "restore-theme-mode";
export const THEME_EVENT = "restore-theme-change";
let currentMode: ThemeMode | undefined;

const isThemeMode = (value: string | null): value is ThemeMode =>
  value === "light" || value === "dark" || value === "system";

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  const current = document.documentElement.dataset.theme;
  return current === "light" ? "light" : "dark";
}

export function readThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  if (currentMode !== undefined) return currentMode;
  try {
    const stored = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    if (isThemeMode(stored)) return stored;
    const legacy = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy === "light" || legacy === "dark") return legacy;
  } catch { /* Storage may be unavailable; the current tab still supports themes. */ }
  return "system";
}

export function applyThemeMode(mode: ThemeMode, persist = true) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  currentMode = mode;
  const theme: Theme = mode === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : mode;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.authTheme = theme;
  if (persist) {
    try {
      window.localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
      window.localStorage.setItem(STORAGE_KEY, theme);
      window.localStorage.setItem(LEGACY_STORAGE_KEY, theme);
    } catch { /* Keep the explicit choice in this tab when persistence is blocked. */ }
  }
  window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_EVENT, { detail: mode }));
}

// One subscription for every route, including pages where Settings is unmounted.
export function ThemeController() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystem = () => { if (readThemeMode() === "system") applyThemeMode("system", false); };
    const syncStorage = (event: StorageEvent) => {
      if (event.key === null || [THEME_MODE_STORAGE_KEY, STORAGE_KEY, LEGACY_STORAGE_KEY].includes(event.key)) {
        currentMode = undefined;
        applyThemeMode(readThemeMode(), false);
      }
    };
    applyThemeMode(readThemeMode(), false);
    media.addEventListener("change", syncSystem);
    window.addEventListener("storage", syncStorage);
    return () => {
      media.removeEventListener("change", syncSystem);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);
  return null;
}

export function ThemeToggle({
  appearance = "auth",
  className = "",
}: {
  appearance?: "auth" | "sidebar";
  className?: string;
}) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const sync = () => setTheme(readTheme());
    const timer = window.setTimeout(sync, 0);
    window.addEventListener(THEME_EVENT, sync);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(THEME_EVENT, sync);
    };
  }, []);

  const nextTheme = theme === "dark" ? "light" : "dark";
  const label = nextTheme === "light" ? "Включить светлую тему" : "Включить тёмную тему";

  return (
    <button
      className={`${s.themeToggle} ${s[`themeToggle--${appearance}`]} ${className}`.trim()}
      type="button"
      onClick={() => {
        applyThemeMode(nextTheme);
        setTheme(nextTheme);
      }}
      aria-label={label}
      title={label}
      role="switch"
      aria-checked={theme === "light"}
    >
      {theme === "dark" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
      {appearance === "sidebar" && (
        <>
          <span className={s.themeToggle__label}>Тема</span>
          <span className={s.themeToggle__switch} aria-hidden="true">
            <span />
          </span>
        </>
      )}
    </button>
  );
}
