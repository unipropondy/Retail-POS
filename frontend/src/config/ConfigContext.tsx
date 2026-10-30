// ==============================================================================
// Author: JAVITH, BAVANI 30-10-2026
// Project: Supermarket Retail POS
// Module: Configuration Context Definition
// File: frontend/src/config/ConfigContext.tsx
// Description: React Context providing global access to all 89 active settings
// ==============================================================================

import { createContext, useContext } from "react";
import { AppConfig, ConfigItemMetadata } from "./configTypes";
import { DEFAULT_APP_CONFIG } from "./appConfig";

export interface ConfigContextValue {
  config: AppConfig;
  items: ConfigItemMetadata[];
  isLoading: boolean;
  error: string | null;
  refreshConfig: () => Promise<void>;
  updateConfig: (updates: Partial<AppConfig>) => Promise<boolean>;
  resetToDefaults: () => Promise<boolean>;
  isEnabled: (key: keyof AppConfig) => boolean;
  getNum: (key: keyof AppConfig, fallback?: number) => number;
}

export const ConfigContext = createContext<ConfigContextValue>({
  config: DEFAULT_APP_CONFIG,
  items: [],
  isLoading: false,
  error: null,
  refreshConfig: async () => {},
  updateConfig: async () => false,
  resetToDefaults: async () => false,
  isEnabled: () => false,
  getNum: () => 0,
});

export function useAppConfig(): ConfigContextValue {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error("useAppConfig must be used within a ConfigProvider");
  }
  return context;
}
