// ==============================================================================
// Author: JAVITH, BAVANI 30-10-2026
// Project: Supermarket Retail POS
// Module: App Configuration Management Screen
// File: frontend/src/screens/AppConfigScreen.tsx
// Description: Responsive, professional configuration management interface.
//              Organizes all 89 active VB.NET App.config settings across 10 categories
//              with specialized controls (Switch, Number, Text, Masked Secrets).
// ==============================================================================

import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAppConfig } from "../config/ConfigContext";
import { ConfigCategory, AppConfig, ConfigItemMetadata } from "../config/configTypes";

interface AppConfigScreenProps {
  onClose: () => void;
}

const CATEGORIES: { id: ConfigCategory; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { id: "General Settings", label: "General", icon: "cog-outline" },
  { id: "Database Settings", label: "Database", icon: "database-outline" },
  { id: "Printer Settings", label: "Printer", icon: "printer-outline" },
  { id: "Receipt Settings", label: "Receipt", icon: "receipt" },
  { id: "Payment Settings", label: "Payment", icon: "credit-card-outline" },
  { id: "NETS Settings", label: "NETS", icon: "credit-card-check-outline" },
  { id: "YeahPay Settings", label: "YeahPay", icon: "qrcode-scan" },
  { id: "Data Sync Settings", label: "Data Sync", icon: "sync" },
  { id: "License Settings", label: "License", icon: "shield-key-outline" },
  { id: "Device Settings", label: "Device", icon: "scale" },
];

export default function AppConfigScreen({ onClose }: AppConfigScreenProps) {
  const { config, items, isLoading, updateConfig, resetToDefaults, refreshConfig } = useAppConfig();

  const [activeCategory, setActiveCategory] = useState<ConfigCategory>("General Settings");
  const [searchQuery, setSearchQuery] = useState("");
  const [editedValues, setEditedValues] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Group items by category
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCategory = item.category === activeCategory;
      const matchesSearch =
        !searchQuery.trim() ||
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.desc.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [items, activeCategory, searchQuery]);

  // Handle local change in input
  const handleChange = (key: string, value: any) => {
    setEditedValues((prev) => ({
      ...prev,
      [key]: value,
    }));
    setSaveStatus(null);
  };

  // Get current active value (either modified or original)
  const getValue = (item: ConfigItemMetadata) => {
    if (item.key in editedValues) {
      return editedValues[item.key];
    }
    return config[item.key];
  };

  // Save changes
  const handleSave = async () => {
    if (Object.keys(editedValues).length === 0) {
      setSaveStatus({ type: "success", msg: "No changes to save." });
      return;
    }

    setIsSaving(true);
    setSaveStatus(null);
    try {
      const ok = await updateConfig(editedValues);
      if (ok) {
        setEditedValues({});
        setSaveStatus({ type: "success", msg: "Configuration successfully saved and persisted!" });
      } else {
        setSaveStatus({ type: "error", msg: "Failed to save configuration." });
      }
    } catch (e: any) {
      setSaveStatus({ type: "error", msg: e.message || "An error occurred during save." });
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to original defaults
  const handleReset = async () => {
    const confirmReset = () => {
      setIsSaving(true);
      resetToDefaults()
        .then((ok) => {
          if (ok) {
            setEditedValues({});
            setSaveStatus({ type: "success", msg: "Reset to default settings!" });
          } else {
            setSaveStatus({ type: "error", msg: "Failed to reset configuration." });
          }
        })
        .finally(() => setIsSaving(false));
    };

    if (Platform.OS === "web") {
      if (window.confirm("Are you sure you want to restore all settings to default values?")) {
        confirmReset();
      }
    } else {
      Alert.alert(
        "Confirm Reset",
        "Restore all settings back to default values?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Reset", style: "destructive", onPress: confirmReset },
        ]
      );
    }
  };

  const hasUnsavedChanges = Object.keys(editedValues).length > 0;

  return (
    <View style={styles.container}>
      {/* Top Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <MaterialCommunityIcons name="tune" size={26} color="#3d6c46" />
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.headerTitle}>System Configuration</Text>
            <Text style={styles.headerSubtitle}>
              {items.length} Active System Settings
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary, { marginRight: 8 }]}
            onPress={() => refreshConfig()}
            disabled={isSaving}
          >
            <MaterialCommunityIcons name="refresh" size={16} color="#475569" />
            <Text style={styles.btnSecondaryText}>Reload</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnDanger, { marginRight: 8 }]}
            onPress={handleReset}
            disabled={isSaving}
          >
            <MaterialCommunityIcons name="restore" size={16} color="#dc2626" />
            <Text style={styles.btnDangerText}>Restore Defaults</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, { marginRight: 8 }]}
            onPress={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="content-save" size={16} color="#fff" />
                <Text style={styles.btnPrimaryText}>
                  Save Changes {hasUnsavedChanges ? `(${Object.keys(editedValues).length})` : ""}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <MaterialCommunityIcons name="close" size={22} color="#64748b" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Save status notification */}
      {saveStatus && (
        <View
          style={[
            styles.statusBanner,
            saveStatus.type === "success" ? styles.statusSuccess : styles.statusError,
          ]}
        >
          <MaterialCommunityIcons
            name={saveStatus.type === "success" ? "check-circle" : "alert-circle"}
            size={18}
            color={saveStatus.type === "success" ? "#166534" : "#991b1b"}
          />
          <Text
            style={[
              styles.statusText,
              saveStatus.type === "success" ? { color: "#166534" } : { color: "#991b1b" },
            ]}
          >
            {saveStatus.msg}
          </Text>
        </View>
      )}

      {/* Main Body */}
      <View style={styles.body}>
        {/* Left Category Navigation Sidebar */}
        <View style={styles.sidebar}>
          <Text style={styles.sidebarSectionTitle}>CATEGORIES</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {CATEGORIES.map((cat) => {
              const count = items.filter((i) => i.category === cat.id).length;
              const isSelected = activeCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.categoryTab, isSelected && styles.categoryTabActive]}
                  onPress={() => {
                    setActiveCategory(cat.id);
                    setSaveStatus(null);
                  }}
                >
                  <MaterialCommunityIcons
                    name={cat.icon}
                    size={20}
                    color={isSelected ? "#3d6c46" : "#64748b"}
                  />
                  <Text style={[styles.categoryTabText, isSelected && styles.categoryTabTextActive]}>
                    {cat.label}
                  </Text>
                  <View style={[styles.badge, isSelected && styles.badgeActive]}>
                    <Text style={[styles.badgeText, isSelected && styles.badgeTextActive]}>
                      {count}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Right Settings Content Area */}
        <View style={styles.content}>
          {/* Search bar inside category */}
          <View style={styles.searchRow}>
            <MaterialCommunityIcons name="magnify" size={20} color="#94a3b8" />
            <TextInput
              style={styles.searchInput}
              placeholder={`Search settings in ${activeCategory}...`}
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <MaterialCommunityIcons name="close-circle" size={18} color="#94a3b8" />
              </TouchableOpacity>
            ) : null}
          </View>

          {isLoading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color="#3d6c46" />
              <Text style={{ marginTop: 12, color: "#64748b" }}>Loading configuration from server...</Text>
            </View>
          ) : (
            <ScrollView style={styles.settingsScroll} showsVerticalScrollIndicator={true}>
              {filteredItems.map((item) => {
                const currentVal = getValue(item);
                const isModified = item.key in editedValues;

                return (
                  <View key={item.key} style={[styles.settingRow, isModified && styles.settingRowModified]}>
                    {/* Setting Title & Desc */}
                    <View style={styles.settingInfo}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text style={styles.settingLabel}>{item.label}</Text>
                        <Text style={styles.settingKeyBadge}>({item.key})</Text>
                        {item.isSecret && (
                          <View style={styles.secretTag}>
                            <MaterialCommunityIcons name="lock" size={11} color="#b45309" />
                            <Text style={styles.secretTagText}>Secret</Text>
                          </View>
                        )}
                        {isModified && <Text style={styles.modifiedIndicator}>* Unsaved</Text>}
                      </View>
                      <Text style={styles.settingDesc}>{item.desc}</Text>
                    </View>

                    {/* Setting Interactive Control */}
                    <View style={styles.settingControl}>
                      {item.type === "boolean" ? (
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text style={{ marginRight: 8, fontSize: 13, fontWeight: "600", color: currentVal == 1 ? "#166534" : "#64748b" }}>
                            {currentVal == 1 ? "Enabled (1)" : "Disabled (0)"}
                          </Text>
                          <Switch
                            value={currentVal == 1 || currentVal === true}
                            onValueChange={(val) => handleChange(item.key, val ? 1 : 0)}
                            trackColor={{ false: "#cbd5e1", true: "#86efac" }}
                            thumbColor={currentVal == 1 ? "#22c55e" : "#f8fafc"}
                          />
                        </View>
                      ) : item.type === "boolean_yn" ? (
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text style={{ marginRight: 8, fontSize: 13, fontWeight: "600", color: currentVal === "Y" ? "#166534" : "#64748b" }}>
                            {currentVal === "Y" ? "Yes (Y)" : "No (N)"}
                          </Text>
                          <Switch
                            value={currentVal === "Y"}
                            onValueChange={(val) => handleChange(item.key, val ? "Y" : "N")}
                            trackColor={{ false: "#cbd5e1", true: "#86efac" }}
                            thumbColor={currentVal === "Y" ? "#22c55e" : "#f8fafc"}
                          />
                        </View>
                      ) : item.type === "number" ? (
                        <TextInput
                          style={styles.numberInput}
                          keyboardType="numeric"
                          value={String(currentVal ?? "")}
                          onChangeText={(text) => handleChange(item.key, Number(text) || 0)}
                        />
                      ) : (
                        <TextInput
                          style={[styles.textInput, item.isSecret && styles.secretInput]}
                          secureTextEntry={item.isSecret && currentVal === "********"}
                          editable={!item.isSecret}
                          value={String(currentVal ?? "")}
                          onChangeText={(text) => handleChange(item.key, text)}
                        />
                      )}
                    </View>
                  </View>
                );
              })}
              {filteredItems.length === 0 && (
                <View style={styles.centerBox}>
                  <Text style={{ color: "#94a3b8" }}>No configuration settings match this query.</Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#64748b",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  btnPrimary: {
    backgroundColor: "#3d6c46",
  },
  btnPrimaryText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 13,
    marginLeft: 6,
  },
  btnSecondary: {
    backgroundColor: "#e2e8f0",
  },
  btnSecondaryText: {
    color: "#334155",
    fontWeight: "600",
    fontSize: 13,
    marginLeft: 6,
  },
  btnDanger: {
    backgroundColor: "#fee2e2",
  },
  btnDangerText: {
    color: "#b91c1c",
    fontWeight: "600",
    fontSize: 13,
    marginLeft: 6,
  },
  closeBtn: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: "#f1f5f9",
    marginLeft: 8,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  statusSuccess: {
    backgroundColor: "#dcfce7",
    borderBottomColor: "#bbf7d0",
  },
  statusError: {
    backgroundColor: "#fee2e2",
    borderBottomColor: "#fecaca",
  },
  statusText: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: "500",
  },
  body: {
    flex: 1,
    flexDirection: "row",
  },
  sidebar: {
    width: 240,
    backgroundColor: "#ffffff",
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
    paddingVertical: 12,
  },
  sidebarSectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94a3b8",
    paddingHorizontal: 16,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  categoryTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
  },
  categoryTabActive: {
    backgroundColor: "#f0fdf4",
    borderLeftColor: "#3d6c46",
  },
  categoryTabText: {
    flex: 1,
    fontSize: 13,
    color: "#475569",
    marginLeft: 10,
    fontWeight: "500",
  },
  categoryTabTextActive: {
    color: "#3d6c46",
    fontWeight: "700",
  },
  badge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeActive: {
    backgroundColor: "#dcfce7",
  },
  badgeText: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
  },
  badgeTextActive: {
    color: "#166534",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    color: "#1e293b",
  },
  settingsScroll: {
    flex: 1,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#ffffff",
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  settingRowModified: {
    borderColor: "#86efac",
    backgroundColor: "#fafdfb",
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e293b",
  },
  settingKeyBadge: {
    fontSize: 12,
    fontFamily: Platform.select({ web: "monospace", default: undefined }),
    color: "#64748b",
    marginLeft: 6,
  },
  secretTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef3c7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  secretTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#b45309",
    marginLeft: 2,
  },
  modifiedIndicator: {
    fontSize: 11,
    fontWeight: "700",
    color: "#16a34a",
    marginLeft: 8,
  },
  settingDesc: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 4,
  },
  settingControl: {
    minWidth: 180,
    alignItems: "flex-end",
  },
  numberInput: {
    width: 100,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
    textAlign: "right",
  },
  textInput: {
    width: 220,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: "#0f172a",
  },
  secretInput: {
    backgroundColor: "#f1f5f9",
    color: "#94a3b8",
  },
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
});
