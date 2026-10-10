import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Appearance } from "react-native";
import { Uniwind } from "uniwind";

type Theme = "light" | "dark";
const storageKey = "campuspool:theme";
function applyTheme(theme: Theme) {
  Appearance.setColorScheme(theme);
  Uniwind.setTheme(theme);
}
applyTheme("dark");
const ThemeContext = createContext<{
  theme: Theme;
  loading: boolean;
  setTheme: (theme: Theme) => void;
} | null>(null);

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<Theme>("dark");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(storageKey)
      .then((saved) => {
        if (active && (saved === "light" || saved === "dark")) {
          applyTheme(saved);
          updateTheme(saved);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  function setTheme(next: Theme) {
    applyTheme(next);
    updateTheme(next);
    void AsyncStorage.setItem(storageKey, next).catch(() => {});
  }
  return (
    <ThemeContext.Provider value={{ theme, loading, setTheme }}>{children}</ThemeContext.Provider>
  );
}
export function useThemePreference() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("ThemePreferenceProvider is required.");
  return context;
}
