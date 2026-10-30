// ==============================================================================
// Author: JAVITH, BAVANI 30-10-2026
// Project: Supermarket Retail POS
// Module: Configuration Provider
// File: frontend/src/config/ConfigProvider.tsx
// Description: Global React Context Provider that fetches all 89 configuration settings
//              from Node.js on startup, caches in AsyncStorage, and propagates updates.
// ==============================================================================

import React, { useState, useEffect, useCallback, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ConfigContext, ConfigContextValue } from "./ConfigContext";
import { AppConfig, ConfigApiResponse, ConfigItemMetadata } from "./configTypes";
import { DEFAULT_APP_CONFIG, BACKEND_URL, isEnabled as checkIsEnabled, getNum as checkGetNum } from "./appConfig";

const CONFIG_CACHE_KEY = "@retail_pos_app_config_cache";

interface ConfigProviderProps {
  children: React.ReactNode;
}

export const ConfigProvider: React.FC<ConfigProviderProps> = ({ children }) => {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [items, setItems] = useState<ConfigItemMetadata[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch configuration from Node.js backend with local storage caching fallback
   */
  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Try reading cached config first for instantaneous boot
      const cached = await AsyncStorage.getItem(CONFIG_CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.config) {
            setConfig(parsed.config);
            if (parsed.items) setItems(parsed.items);
          }
        } catch (e) {
          // ignore cache parse failure
        }
      }

      // 2. Fetch fresh live config from Node.js backend
      const res = await fetch(`${BACKEND_URL}/api/config`);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data: ConfigApiResponse = await res.json();
      if (data && data.success && data.config) {
        setConfig(data.config);
        if (data.items) {
          setItems(data.items);
        }
        // Cache to storage for offline/standalone resilience
        await AsyncStorage.setItem(
          CONFIG_CACHE_KEY,
          JSON.stringify({ config: data.config, items: data.items, savedAt: new Date().toISOString() })
        );
      }
    } catch (err: any) {
      console.warn("⚠️ [CONFIG] Could not load configuration from server, using cached/defaults:", err.message);
      setError(err.message || "Failed to load configuration from backend");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  /**
   * Send updates to backend and re-synchronize state
   */
  const updateConfig = useCallback(async (updates: Partial<AppConfig>): Promise<boolean> => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await fetchConfig();
        return true;
      } else {
        throw new Error(data.message || "Failed to update configuration");
      }
    } catch (err: any) {
      console.error("❌ [CONFIG] Update failed:", err.message);
      setError(err.message);
      return false;
    }
  }, [fetchConfig]);

  /**
   * Reset configuration back to original VB.NET App.config defaults
   */
  const resetToDefaults = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/config/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchConfig();
        return true;
      } else {
        throw new Error(data.message || "Failed to reset configuration");
      }
    } catch (err: any) {
      console.error("❌ [CONFIG] Reset failed:", err.message);
      setError(err.message);
      return false;
    }
  }, [fetchConfig]);

  const isEnabledHelper = useCallback((key: keyof AppConfig) => {
    return checkIsEnabled(config, key);
  }, [config]);

  const getNumHelper = useCallback((key: keyof AppConfig, fallback: number = 0) => {
    return checkGetNum(config, key, fallback);
  }, [config]);

  const value: ConfigContextValue = useMemo(() => ({
    config,
    items,
    isLoading,
    error,
    refreshConfig: fetchConfig,
    updateConfig,
    resetToDefaults,
    isEnabled: isEnabledHelper,
    getNum: getNumHelper,
  }), [config, items, isLoading, error, fetchConfig, updateConfig, resetToDefaults, isEnabledHelper, getNumHelper]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
};
