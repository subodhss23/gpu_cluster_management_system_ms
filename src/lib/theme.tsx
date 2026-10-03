"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { track } from "./analytics";

export type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  toggle: () => void;
}

const ThemeCtx = createContext<ThemeState>({ theme: "dark", toggle: () => {} });
const LS_KEY = "helios-theme";

function applyClass(t: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("light", t === "light");
  document.documentElement.style.colorScheme = t === "light" ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  // restore saved preference (pre-hydration inline script in layout sets the
  // class early to avoid a flash; this reconciles React state with it)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY) as Theme | null;
      const t: Theme = saved === "light" ? "light" : "dark";
      setTheme(t);
      applyClass(t);
    } catch {
      /* private mode — stay dark */
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(LS_KEY, next);
      } catch {
        /* ignore */
      }
      applyClass(next);
      track("theme_changed", { theme: next });
      return next;
    });
  }, []);

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): ThemeState {
  return useContext(ThemeCtx);
}
