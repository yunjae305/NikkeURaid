"use client";

import { useSyncExternalStore } from "react";

import { MoonIcon, SunIcon } from "./icons";

export function ThemeToggle() {
  const dark = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("nikke-theme-change", onStoreChange);
      return () => window.removeEventListener("nikke-theme-change", onStoreChange);
    },
    () => document.documentElement.dataset.theme === "dark",
    () => false,
  );

  function toggleTheme() {
    const next = !dark;
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("nikke-theme", next ? "dark" : "light");
    window.dispatchEvent(new Event("nikke-theme-change"));
  }

  return (
    <button
      className="icon-button theme-toggle"
      type="button"
      aria-label={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      aria-pressed={dark}
      onClick={toggleTheme}
    >
      <span className={dark ? "theme-icon is-visible" : "theme-icon"} aria-hidden="true">
        <SunIcon />
      </span>
      <span className={dark ? "theme-icon" : "theme-icon is-visible"} aria-hidden="true">
        <MoonIcon />
      </span>
    </button>
  );
}
