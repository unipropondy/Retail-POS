// ==============================================================================
// Author: JAVITH, BAVANI 29-10-2026
// Project: Supermarket Retail POS
// File: src/utils/theme.ts
// Description: Global Theme & Typography Settings for Login & POS Station
// ==============================================================================

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface ThemeConfig {
  id: string;
  name: string;
  primary: string;
  primaryHover: string;
  accent: string;
  bg: string;
  surface: string;
  cardBg: string;
  borderColor: string;
  textDark: string;
  textMuted: string;
  tableHeaderBg: string;
  tableHeaderColor: string;
  isDark?: boolean;
}

export interface FontOption {
  id: string;
  name: string;
  fontFamily: string;
  monoFontFamily: string;
}

export const THEME_STORAGE_KEY = "@pos_theme_setting";
export const FONT_STORAGE_KEY = "@pos_font_setting";

export const THEMES: ThemeConfig[] = [
  {
    id: "greenmart",
    name: "GreenMart POS (Default)",
    primary: "#1b5e20",
    primaryHover: "#2e7d32",
    accent: "#f59e0b",
    bg: "#f4f6f8",
    surface: "#ffffff",
    cardBg: "#ffffff",
    borderColor: "#e2e8f0",
    textDark: "#0f172a",
    textMuted: "#64748b",
    tableHeaderBg: "#1b5e20",
    tableHeaderColor: "#ffffff",
  },
  {
    id: "luxury_warm",
    name: "Warm Luxury",
    primary: "#1E3129",
    primaryHover: "#2d473b",
    accent: "#B88E5E",
    bg: "#F7F5F0",
    surface: "#FFFFFF",
    cardBg: "#FFFFFF",
    borderColor: "#E6E0D6",
    textDark: "#1A211C",
    textMuted: "#6B655C",
    tableHeaderBg: "#1E3129",
    tableHeaderColor: "#FFFFFF",
  },
  {
    id: "ocean_navy",
    name: "Ocean Navy",
    primary: "#0F2942",
    primaryHover: "#183e63",
    accent: "#0284C7",
    bg: "#EFF6FF",
    surface: "#FFFFFF",
    cardBg: "#FFFFFF",
    borderColor: "#BFDBFE",
    textDark: "#0F172A",
    textMuted: "#475569",
    tableHeaderBg: "#0F2942",
    tableHeaderColor: "#FFFFFF",
  },
  {
    id: "midnight_dark",
    name: "Midnight Dark",
    primary: "#2563EB",
    primaryHover: "#3b82f6",
    accent: "#38BDF8",
    bg: "#0B1120",
    surface: "#111827",
    cardBg: "#1E293B",
    borderColor: "#334155",
    textDark: "#F8FAFC",
    textMuted: "#94A3B8",
    tableHeaderBg: "#1E293B",
    tableHeaderColor: "#38BDF8",
    isDark: true,
  },
  {
    id: "royal_crimson",
    name: "Royal Crimson",
    primary: "#881337",
    primaryHover: "#9f1239",
    accent: "#F43F5E",
    bg: "#FFF1F2",
    surface: "#FFFFFF",
    cardBg: "#FFFFFF",
    borderColor: "#FECDD3",
    textDark: "#4C0519",
    textMuted: "#9F1239",
    tableHeaderBg: "#881337",
    tableHeaderColor: "#FFFFFF",
  },
  {
    id: "classic_amber",
    name: "Amber Corporate",
    primary: "#B45309",
    primaryHover: "#D97706",
    accent: "#F59E0B",
    bg: "#FFFBEB",
    surface: "#FFFFFF",
    cardBg: "#FFFFFF",
    borderColor: "#FDE68A",
    textDark: "#451A03",
    textMuted: "#78350F",
    tableHeaderBg: "#B45309",
    tableHeaderColor: "#FFFFFF",
  },
];

export const FONTS: FontOption[] = [
  {
    id: "inter",
    name: "Inter / Modern Sans",
    fontFamily: Platform.select({
      web: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      default: "normal",
    }) || "normal",
    monoFontFamily: Platform.select({
      web: '"JetBrains Mono", Consolas, monospace',
      default: "monospace",
    }) || "monospace",
  },
  {
    id: "roboto",
    name: "Roboto Clean",
    fontFamily: Platform.select({
      web: 'Roboto, -apple-system, sans-serif',
      default: "normal",
    }) || "normal",
    monoFontFamily: Platform.select({
      web: '"Roboto Mono", Menlo, monospace',
      default: "monospace",
    }) || "monospace",
  },
  {
    id: "poppins",
    name: "Poppins / Geometric",
    fontFamily: Platform.select({
      web: 'Poppins, -apple-system, sans-serif',
      default: "normal",
    }) || "normal",
    monoFontFamily: Platform.select({
      web: 'monospace',
      default: "monospace",
    }) || "monospace",
  },
  {
    id: "system",
    name: "System Default",
    fontFamily: Platform.select({
      web: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      default: "normal",
    }) || "normal",
    monoFontFamily: Platform.select({
      web: 'monospace',
      default: "monospace",
    }) || "monospace",
  },
  {
    id: "pos_mono",
    name: "POS Terminal Monospace",
    fontFamily: Platform.select({
      web: '"Courier New", Courier, monospace',
      default: "monospace",
    }) || "monospace",
    monoFontFamily: Platform.select({
      web: '"Courier New", Courier, monospace',
      default: "monospace",
    }) || "monospace",
  },
];

// Helper to load theme preferences from AsyncStorage
export async function getSavedTheme(): Promise<ThemeConfig> {
  try {
    const id = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    if (id) {
      const found = THEMES.find((t) => t.id === id);
      if (found) return found;
    }
  } catch (e) {
    console.warn("Could not read saved theme:", e);
  }
  return THEMES[0];
}

// Helper to load font preferences from AsyncStorage
export async function getSavedFont(): Promise<FontOption> {
  try {
    const id = await AsyncStorage.getItem(FONT_STORAGE_KEY);
    if (id) {
      const found = FONTS.find((f) => f.id === id);
      if (found) return found;
    }
  } catch (e) {
    console.warn("Could not read saved font:", e);
  }
  return FONTS[0];
}

// Helper to save theme
export async function saveThemePreference(themeId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, themeId);
  } catch (e) {
    console.warn("Could not save theme preference:", e);
  }
}

// Helper to save font
export async function saveFontPreference(fontId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(FONT_STORAGE_KEY, fontId);
  } catch (e) {
    console.warn("Could not save font preference:", e);
  }
}
