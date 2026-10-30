// ==============================================================================
// Author: JAVITH, BAVANI 29-10-2026
// Project: Supermarket Retail POS
// File: src/components/ThemeModal.tsx
// Description: Interactive Theme Color Chooser and Font Family Selector Modal
// ==============================================================================

import React from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  THEMES,
  FONTS,
  ThemeConfig,
  FontOption,
} from "../utils/theme";

interface ThemeModalProps {
  visible: boolean;
  onClose: () => void;
  currentTheme: ThemeConfig;
  currentFont: FontOption;
  onSelectTheme: (theme: ThemeConfig) => void;
  onSelectFont: (font: FontOption) => void;
}

export default function ThemeModal({
  visible,
  onClose,
  currentTheme,
  currentFont,
  onSelectTheme,
  onSelectFont,
}: ThemeModalProps) {
  const activeFontFamily = currentFont.fontFamily;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Backdrop click to dismiss */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />

        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: currentTheme.cardBg,
              borderColor: currentTheme.borderColor,
            },
          ]}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Header */}
            <View
              style={[
                styles.header,
                { borderBottomColor: currentTheme.borderColor },
              ]}
            >
              <View style={styles.headerTitleRow}>
                <View
                  style={[
                    styles.iconBox,
                    { backgroundColor: currentTheme.primary + "18" },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="palette-outline"
                    size={22}
                    color={currentTheme.primary}
                  />
                </View>
                <View>
                  <Text
                    style={[
                      styles.title,
                      {
                        color: currentTheme.textDark,
                        fontFamily: activeFontFamily,
                      },
                    ]}
                  >
                    Theme & Typography
                  </Text>
                  <Text
                    style={[
                      styles.subtitle,
                      {
                        color: currentTheme.textMuted,
                        fontFamily: activeFontFamily,
                      },
                    ]}
                  >
                    Personalize your POS station colors and fonts
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={onClose}
                style={[
                  styles.closeBtn,
                  {
                    backgroundColor: currentTheme.isDark
                      ? "#334155"
                      : "#f1f5f9",
                  },
                ]}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={18}
                  color={currentTheme.textDark}
                />
              </TouchableOpacity>
            </View>

            {/* Section 1: Themes Color Palette */}
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons
                name="format-paint"
                size={16}
                color={currentTheme.primary}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.sectionTitle,
                  {
                    color: currentTheme.textDark,
                    fontFamily: activeFontFamily,
                  },
                ]}
              >
                THEME COLOR PALETTE
              </Text>
            </View>

            <View style={styles.themesGrid}>
              {THEMES.map((th) => {
                const isSelected = th.id === currentTheme.id;
                return (
                  <TouchableOpacity
                    key={th.id}
                    style={[
                      styles.themeCard,
                      {
                        backgroundColor: th.bg,
                        borderColor: isSelected ? th.primary : th.borderColor,
                        borderWidth: isSelected ? 2 : 1,
                      },
                    ]}
                    onPress={() => onSelectTheme(th)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.colorDotsRow}>
                      <View
                        style={[
                          styles.colorDot,
                          { backgroundColor: th.primary },
                        ]}
                      />
                      <View
                        style={[styles.colorDot, { backgroundColor: th.accent }]}
                      />
                      <View
                        style={[
                          styles.colorDot,
                          {
                            backgroundColor: th.cardBg,
                            borderWidth: 1,
                            borderColor: "#94a3b8",
                          },
                        ]}
                      />
                    </View>

                    <Text
                      style={[
                        styles.themeName,
                        {
                          color: th.textDark,
                          fontWeight: isSelected ? "700" : "500",
                          fontFamily: activeFontFamily,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {th.name}
                    </Text>

                    {isSelected && (
                      <View
                        style={[
                          styles.activeBadge,
                          { backgroundColor: th.primary },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name="check"
                          size={11}
                          color="#ffffff"
                        />
                        <Text style={styles.activeBadgeText}>ACTIVE</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Section 2: Font Typography Stack */}
            <View style={[styles.sectionHeader, { marginTop: 18 }]}>
              <MaterialCommunityIcons
                name="format-font"
                size={16}
                color={currentTheme.primary}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.sectionTitle,
                  {
                    color: currentTheme.textDark,
                    fontFamily: activeFontFamily,
                  },
                ]}
              >
                TYPOGRAPHY / FONT STYLE
              </Text>
            </View>

            <View style={styles.fontList}>
              {FONTS.map((fn) => {
                const isSelected = fn.id === currentFont.id;
                return (
                  <TouchableOpacity
                    key={fn.id}
                    style={[
                      styles.fontItemBtn,
                      {
                        backgroundColor: isSelected
                          ? currentTheme.isDark
                            ? "#334155"
                            : "#f1f5f9"
                          : "transparent",
                        borderColor: isSelected
                          ? currentTheme.primary
                          : currentTheme.borderColor,
                      },
                    ]}
                    onPress={() => onSelectFont(fn)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.fontName,
                          {
                            fontFamily: fn.fontFamily,
                            color: currentTheme.textDark,
                            fontWeight: isSelected ? "700" : "500",
                          },
                        ]}
                      >
                        {fn.name}
                      </Text>
                      <Text
                        style={[
                          styles.fontPreview,
                          {
                            fontFamily: fn.fontFamily,
                            color: currentTheme.textMuted,
                          },
                        ]}
                      >
                        KALAISMR SUPERMARKET POS • $12.50
                      </Text>
                    </View>

                    {isSelected && (
                      <View
                        style={[
                          styles.fontCheckCircle,
                          { backgroundColor: currentTheme.primary },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name="check"
                          size={14}
                          color="#ffffff"
                        />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Apply & Close Button */}
            <TouchableOpacity
              style={[
                styles.applyBtn,
                { backgroundColor: currentTheme.primary },
              ]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons
                name="check-circle-outline"
                size={18}
                color="#ffffff"
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.applyBtnText,
                  { fontFamily: activeFontFamily },
                ]}
              >
                Apply & Save Preferences
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "90%",
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
      },
      default: {
        elevation: 10,
      },
    }),
  },
  scrollContent: {
    padding: 22,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 14,
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  themesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  themeCard: {
    width: "48.5%",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "space-between",
    minHeight: 88,
  },
  colorDotsRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  colorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  themeName: {
    fontSize: 12,
    marginBottom: 4,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
    marginTop: 2,
  },
  activeBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  fontList: {
    gap: 8,
    marginBottom: 18,
  },
  fontItemBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  fontName: {
    fontSize: 13,
    marginBottom: 2,
  },
  fontPreview: {
    fontSize: 10,
  },
  fontCheckCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  applyBtn: {
    flexDirection: "row",
    height: 44,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  applyBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
});
