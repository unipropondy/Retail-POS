// ==============================================================================
// Author: JAVITH, BAVANI 28-10-2026
// Project: Supermarket Retail POS
// File: src/screens/login.tsx
// Description: Cashier Login Screen themed to GreenMart Supermarket POS with
//              integrated high-density Touch Numpad and terminal validation.
// ==============================================================================

import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import ThemeModal from "../components/ThemeModal";
import {
  THEMES,
  FONTS,
  ThemeConfig,
  FontOption,
  getSavedTheme,
  getSavedFont,
  saveThemePreference,
  saveFontPreference,
} from "../utils/theme";

// Backend API URL - connects to our Express server
const API_URL = "http://localhost:5000";

// Enterprise POS Typography Stack
const FONT_FAMILY = Platform.select({
  web: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  default: undefined,
});

const FONT_MONO = Platform.select({
  web: '"JetBrains Mono", "SF Mono", Menlo, Consolas, Monaco, monospace',
  default: undefined,
});

// Interface representing the authenticated cashier / admin from tblMausermaster
export interface CashierProfile {
  unid: string;
  userCode: string;
  userName: string;
  userGroup: string;
  isAdmin: boolean;
  isCashier: boolean;
}

// Interface representing terminal configuration from tblmaTerminal
export interface TerminalProfile {
  terminalCode: string;
  terminalName: string;
  locationCode: string;
  computerName: string;
  printerName?: string;
  printerType?: string;
}

interface LoginScreenProps {
  onLoginSuccess?: (
    user: CashierProfile,
    terminal: TerminalProfile | null,
  ) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  // Cashier user input states
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Focus target for the touch Numpad ('username' or 'password')
  const [focusedField, setFocusedField] = useState<"username" | "password">(
    "username",
  );

  // Terminal configuration states
  const [terminal, setTerminal] = useState<TerminalProfile | null>(null);
  const [isTerminalBlocked, setIsTerminalBlocked] = useState(false);
  const [terminalCheckLoading, setTerminalCheckLoading] = useState(true);

  // General loading & error states
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [licenseWarning, setLicenseWarning] = useState<string | null>(null);

  // Authenticated cashier profile (for welcome screen fallback)
  const [activeUser, setActiveUser] = useState<CashierProfile | null>(null);

  // Theme & Font Settings State
  const [currentTheme, setCurrentTheme] = useState<ThemeConfig>(THEMES[0]);
  const [currentFont, setCurrentFont] = useState<FontOption>(FONTS[0]);
  const [showThemeModal, setShowThemeModal] = useState(false);

  // ----------------------------------------------------------------------------
  // Check Terminal Configuration & Load Preferences on Initial Load
  // ----------------------------------------------------------------------------
  useEffect(() => {
    checkTerminalStatus();
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    const theme = await getSavedTheme();
    const font = await getSavedFont();
    setCurrentTheme(theme);
    setCurrentFont(font);
  };

  const handleSelectTheme = async (theme: ThemeConfig) => {
    setCurrentTheme(theme);
    await saveThemePreference(theme.id);
  };

  const handleSelectFont = async (font: FontOption) => {
    setCurrentFont(font);
    await saveFontPreference(font.id);
  };

  const checkTerminalStatus = async () => {
    setTerminalCheckLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${API_URL}/api/auth/terminal-info`);
      const data = await response.json();

      if (response.ok && data.success && data.configured) {
        setTerminal(data.terminal);
        setIsTerminalBlocked(false);
        if (data.license && data.license.warning) {
          setLicenseWarning(data.license.warning);
        } else {
          setLicenseWarning(null);
        }
      } else {
        setIsTerminalBlocked(true);
        setErrorMessage(
          data.message ||
            "Terminal not configured. Please contact system administrator.",
        );
      }
    } catch {
      setErrorMessage(
        'Unable to connect to backend server. Make sure "node server.js" is running.',
      );
    } finally {
      setTerminalCheckLoading(false);
    }
  };

  // ----------------------------------------------------------------------------
  // Handle Touch Numpad Key Press
  // ----------------------------------------------------------------------------
  const handleNumpadKey = (key: string) => {
    setErrorMessage(null);

    if (key === "CLEAR") {
      if (focusedField === "username") {
        setUsername("");
      } else {
        setPassword("");
      }
      return;
    }

    if (key === "BACKSPACE") {
      if (focusedField === "username") {
        setUsername((prev) => prev.slice(0, -1));
      } else {
        setPassword((prev) => prev.slice(0, -1));
      }
      return;
    }

    if (key === "ENTER") {
      if (focusedField === "username" && username.trim().length > 0) {
        setFocusedField("password");
      } else {
        handleLogin();
      }
      return;
    }

    // Append digit to currently active focused field
    if (focusedField === "username") {
      setUsername((prev) => prev + key);
    } else {
      setPassword((prev) => prev + key);
    }
  };

  // ----------------------------------------------------------------------------
  // Handle Cashier Login
  // ----------------------------------------------------------------------------
  const handleLogin = async () => {
    if (!username.trim()) {
      setErrorMessage("Please enter your Staff Code or Username.");
      setFocusedField("username");
      return;
    }

    if (!password.trim()) {
      setErrorMessage("Please enter your security PIN / Password.");
      setFocusedField("password");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setActiveUser(data.user);
        const resolvedTerminal = data.terminal || terminal;
        if (data.terminal) {
          setTerminal(data.terminal);
        }
        if (onLoginSuccess) {
          onLoginSuccess(data.user, resolvedTerminal);
        }
      } else {
        if (
          data.terminalConfigured === false ||
          data.companyAuthorized === false ||
          data.licenseExpired === true
        ) {
          setIsTerminalBlocked(true);
        }
        setErrorMessage(
          data.message || "Login failed. Please verify credentials.",
        );
      }
    } catch {
      setErrorMessage(
        'Unable to connect to backend server. Please make sure "node server.js" is running.',
      );
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------------------------------
  // VIEW: WELCOME / ACTIVE SHIFT SCREEN (After successful login)
  // ----------------------------------------------------------------------------
  if (activeUser) {
    return (
      <SafeAreaView style={styles.pageContainer}>
        {/* Top Header Bar */}
        <View style={styles.topNav}>
          <View style={styles.brandRow}>
            <View style={styles.brandIconBox}>
              <MaterialCommunityIcons
                name="storefront-outline"
                size={22}
                color="#ffffff"
              />
            </View>
            <View>
              <Text style={styles.brandTitle}>KALAISMR</Text>
              <Text style={styles.brandSubtitle}>SUPERMARKET POS</Text>
            </View>
          </View>

          <View style={styles.navRight}>
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>
                {terminal?.terminalCode || "HQPC1"} •{" "}
                {terminal?.locationCode || "HQ"} • READY
              </Text>
            </View>
            <TouchableOpacity
              style={styles.lockButton}
              onPress={() => setActiveUser(null)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="lock-reset"
                size={16}
                color="#ffffff"
              />
              <Text style={styles.lockButtonText}>Lock / Switch</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Welcome Dashboard Content */}
        <View style={styles.welcomeBody}>
          <View style={styles.welcomeCard}>
            <View style={styles.groupBadge}>
              <Text style={styles.groupBadgeText}>
                {activeUser.isAdmin
                  ? "ADMINISTRATOR"
                  : activeUser.userGroup || "CASHIER"}
              </Text>
            </View>

            <Text style={styles.welcomeTitle}>
              Welcome, {activeUser.userName}
            </Text>
            <Text style={styles.welcomeSubtitle}>
              Logged in as{" "}
              <Text style={styles.boldText}>{activeUser.userCode}</Text> •
              Terminal:{" "}
              <Text style={styles.boldText}>
                {terminal?.terminalCode || "HQPC1"}
              </Text>{" "}
              ({terminal?.computerName || "PC"})
            </Text>

            <View style={styles.metricsRow}>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Terminal Code</Text>
                <Text style={styles.metricValue}>
                  {terminal?.terminalCode || "HQPC1"}
                </Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Location Branch</Text>
                <Text style={styles.metricValue}>
                  {terminal?.locationCode || "HQ"}
                </Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Shift Started</Text>
                <Text style={styles.metricValue}>Just Now</Text>
              </View>
            </View>

            <View style={styles.cardFooter}>
              <Text style={styles.creditText}>
                © 2026 Unipro Softwares SG Pte Ltd
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ----------------------------------------------------------------------------
  // VIEW: GREENMART MODERN CASHIER LOGIN WITH TOUCH NUMPAD (Dynamic Theme & Font)
  // ----------------------------------------------------------------------------
  const activeFontFamily = currentFont.fontFamily;

  return (
    <SafeAreaView
      style={[
        styles.pageContainer,
        { backgroundColor: currentTheme.bg },
      ]}
    >
      {/* Top Header Bar */}
      <View
        style={[
          styles.topNav,
          {
            backgroundColor: currentTheme.surface,
            borderBottomColor: currentTheme.borderColor,
          },
        ]}
      >
        <View style={styles.brandRow}>
          <View
            style={[
              styles.brandIconBox,
              { backgroundColor: currentTheme.primary },
            ]}
          >
            <MaterialCommunityIcons
              name="storefront-outline"
              size={22}
              color="#ffffff"
            />
          </View>
          <View>
            <Text
              style={[
                styles.brandTitle,
                { color: currentTheme.textDark, fontFamily: activeFontFamily },
              ]}
            >
              KALAISMR
            </Text>
            <Text
              style={[
                styles.brandSubtitle,
                { color: currentTheme.accent, fontFamily: activeFontFamily },
              ]}
            >
              SUPERMARKET POS
            </Text>
          </View>
        </View>

        <View style={styles.topNavRight}>
          {/* Status Pill */}
          <View
            style={[
              styles.statusPill,
              {
                backgroundColor: currentTheme.isDark ? "#1e293b" : "#f1f5f9",
                borderColor: currentTheme.borderColor,
              },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                isTerminalBlocked && styles.statusDotBlocked,
              ]}
            />
            <Text
              style={[
                styles.statusText,
                {
                  color: currentTheme.isDark ? "#cbd5e1" : "#475569",
                  fontFamily: activeFontFamily,
                },
              ]}
            >
              {terminalCheckLoading
                ? "CHECKING TERMINAL..."
                : isTerminalBlocked
                  ? "TERMINAL RESTRICTED"
                  : `${terminal?.terminalCode || "HQPC1"} • ${terminal?.locationCode || "HQ"} READY`}
            </Text>
          </View>

          {/* Theme & Font Customizer Trigger Button */}
          <TouchableOpacity
            style={[
              styles.themeToggleBtn,
              {
                backgroundColor: currentTheme.isDark ? "#334155" : "#f1f5f9",
                borderColor: currentTheme.borderColor,
              },
            ]}
            onPress={() => setShowThemeModal(true)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="palette-outline"
              size={18}
              color={currentTheme.primary}
            />
            <Text
              style={[
                styles.themeToggleBtnText,
                { color: currentTheme.textDark, fontFamily: activeFontFamily },
              ]}
            >
              Theme & Font
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Container: Dual Column Login Card + Touch Numpad */}
      <View style={styles.centerContainer}>
        <View style={styles.loginCardDual}>
          {/* ================================================================= */}
          {/* LEFT COLUMN: Cashier Credentials Form                             */}
          {/* ================================================================= */}
          <View style={styles.credentialsCol}>
            {/* Header Badge */}
            <View style={styles.badgeRow}>
              <View
                style={[
                  styles.pillLabel,
                  isTerminalBlocked
                    ? styles.pillLabelBlocked
                    : {
                        backgroundColor: currentTheme.primary + "18",
                        borderColor: currentTheme.primary + "55",
                      },
                ]}
              >
                <MaterialCommunityIcons
                  name={isTerminalBlocked ? "shield-alert" : "shield-check"}
                  size={14}
                  color={isTerminalBlocked ? "#dc2626" : currentTheme.primary}
                />
                <Text
                  style={[
                    styles.pillLabelText,
                    { fontFamily: activeFontFamily },
                    isTerminalBlocked
                      ? styles.pillLabelTextBlocked
                      : { color: currentTheme.primary },
                  ]}
                >
                  {isTerminalBlocked
                    ? "SECURITY RESTRICTION"
                    : "TERMINAL ACCESS"}
                </Text>
              </View>
            </View>

            <Text
              style={[
                styles.loginTitle,
                { color: currentTheme.textDark, fontFamily: activeFontFamily },
              ]}
            >
              Cashier Sign In
            </Text>
            <Text
              style={[
                styles.loginSubtitle,
                { color: currentTheme.textMuted, fontFamily: activeFontFamily },
              ]}
            >
              {isTerminalBlocked
                ? "This computer is not authorized for billing"
                : "Select input & tap the touch numpad to sign in"}
            </Text>

            {/* 30-Day Advance License Expiry Warning Banner */}
            {licenseWarning ? (
              <View style={styles.warningBox}>
                <MaterialCommunityIcons
                  name="bell-ring-outline"
                  size={18}
                  color="#b45309"
                  style={{ marginRight: 6, marginTop: 2 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.warningText}>
                    {licenseWarning.includes("https://uniprosg.com")
                      ? licenseWarning.split("https://uniprosg.com")[0]
                      : licenseWarning}
                  </Text>
                  {licenseWarning.includes("https://uniprosg.com") && (
                    <TouchableOpacity
                      onPress={() => Linking.openURL("https://uniprosg.com")}
                      style={{ marginTop: 4 }}
                    >
                      <Text style={styles.warningLinkText}>
                        https://uniprosg.com
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : null}

            {/* Error Banner */}
            {errorMessage ? (
              <View style={styles.errorBox}>
                <MaterialCommunityIcons
                  name="alert-circle-outline"
                  size={18}
                  color="#b91c1c"
                  style={{ marginRight: 6, marginTop: 2 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.errorText}>
                    {errorMessage.includes("https://uniprosg.com")
                      ? errorMessage.split("https://uniprosg.com")[0]
                      : errorMessage}
                  </Text>
                  {errorMessage.includes("https://uniprosg.com") && (
                    <TouchableOpacity
                      onPress={() => Linking.openURL("https://uniprosg.com")}
                      style={{ marginTop: 4 }}
                    >
                      <Text style={styles.errorLinkText}>
                        https://uniprosg.com
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : null}

            {/* Input 1: Staff Code / Username */}
            <View style={styles.inputGroup}>
              <View style={styles.inputLabelRow}>
                <Text
                  style={[
                    styles.inputLabel,
                    { color: currentTheme.textDark, fontFamily: activeFontFamily },
                  ]}
                >
                  Staff Code / Username
                </Text>
                {focusedField === "username" && (
                  <View
                    style={[
                      styles.activeFieldTag,
                      {
                        backgroundColor: currentTheme.primary + "18",
                        borderColor: currentTheme.primary + "55",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.activeFieldTagText,
                        { color: currentTheme.primary, fontFamily: activeFontFamily },
                      ]}
                    >
                      ● NUMPAD TARGET
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                activeOpacity={1}
                onPress={() => setFocusedField("username")}
                style={[
                  styles.textInputBox,
                  focusedField === "username" && [
                    styles.textInputBoxActive,
                    { borderColor: currentTheme.primary },
                  ],
                  isTerminalBlocked && styles.inputDisabled,
                ]}
              >
                <MaterialCommunityIcons
                  name="account-tie-outline"
                  size={20}
                  color={focusedField === "username" ? currentTheme.primary : "#64748b"}
                  style={styles.fieldIcon}
                />
                <TextInput
                  style={[
                    styles.textInput,
                    { fontFamily: activeFontFamily },
                  ]}
                  value={username}
                  onChangeText={(text) => {
                    setUsername(text);
                    setErrorMessage(null);
                  }}
                  onFocus={() => setFocusedField("username")}
                  placeholder="e.g. JAVITH"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!isTerminalBlocked && !loading}
                />
                {username ? (
                  <TouchableOpacity
                    onPress={() => setUsername("")}
                    style={styles.fieldActionBtn}
                  >
                    <MaterialCommunityIcons
                      name="close-circle"
                      size={16}
                      color="#94a3b8"
                    />
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
            </View>

            {/* Input 2: Password / PIN */}
            <View style={styles.inputGroup}>
              <View style={styles.inputLabelRow}>
                <Text
                  style={[
                    styles.inputLabel,
                    { color: currentTheme.textDark, fontFamily: activeFontFamily },
                  ]}
                >
                  Security PIN / Password
                </Text>
                {focusedField === "password" && (
                  <View
                    style={[
                      styles.activeFieldTag,
                      {
                        backgroundColor: currentTheme.primary + "18",
                        borderColor: currentTheme.primary + "55",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.activeFieldTagText,
                        { color: currentTheme.primary, fontFamily: activeFontFamily },
                      ]}
                    >
                      ● NUMPAD TARGET
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                activeOpacity={1}
                onPress={() => setFocusedField("password")}
                style={[
                  styles.textInputBox,
                  focusedField === "password" && [
                    styles.textInputBoxActive,
                    { borderColor: currentTheme.primary },
                  ],
                  isTerminalBlocked && styles.inputDisabled,
                ]}
              >
                <MaterialCommunityIcons
                  name="lock-outline"
                  size={20}
                  color={focusedField === "password" ? currentTheme.primary : "#64748b"}
                  style={styles.fieldIcon}
                />
                <TextInput
                  style={[
                    styles.textInput,
                    { fontFamily: activeFontFamily },
                  ]}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    setErrorMessage(null);
                  }}
                  onFocus={() => setFocusedField("password")}
                  placeholder="Enter PIN / Password"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPassword}
                  keyboardType="numeric"
                  onSubmitEditing={handleLogin}
                  editable={!isTerminalBlocked && !loading}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.fieldActionBtn}
                >
                  <MaterialCommunityIcons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color="#64748b"
                  />
                </TouchableOpacity>
              </TouchableOpacity>
            </View>

            {/* Quick Staff Presets */}
            <View style={styles.presetSection}>
              <Text
                style={[
                  styles.presetTitle,
                  { color: currentTheme.textMuted, fontFamily: activeFontFamily },
                ]}
              >
                Quick Staff Presets:
              </Text>
              <View style={styles.presetRow}>
                {["AMITH", "MAYIL", "ADMIN"].map((staff) => (
                  <TouchableOpacity
                    key={staff}
                    style={[
                      styles.presetChip,
                      {
                        backgroundColor: currentTheme.primary + "12",
                        borderColor: currentTheme.primary + "35",
                      },
                    ]}
                    onPress={() => {
                      setUsername(staff);
                      setFocusedField("password");
                      setErrorMessage(null);
                    }}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons
                      name="account"
                      size={12}
                      color={currentTheme.primary}
                    />
                    <Text
                      style={[
                        styles.presetChipText,
                        { color: currentTheme.primary, fontFamily: activeFontFamily },
                      ]}
                    >
                      {staff}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Primary Action Button */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: currentTheme.primary },
                (loading || isTerminalBlocked) && styles.buttonDisabled,
              ]}
              onPress={isTerminalBlocked ? checkTerminalStatus : handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <View style={styles.primaryButtonContent}>
                  <Text
                    style={[
                      styles.primaryButtonText,
                      { fontFamily: activeFontFamily },
                    ]}
                  >
                    {isTerminalBlocked
                      ? "Retry Terminal Check"
                      : "Authorize & Open Terminal"}
                  </Text>
                  <MaterialCommunityIcons
                    name="arrow-right-circle"
                    size={20}
                    color="#ffffff"
                    style={{ marginLeft: 8 }}
                  />
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.signatureRow}>
              <Text style={styles.signatureText}>
                © 2026 Unipro Softwares SG Pte Ltd
              </Text>
            </View>
          </View>

          {/* ================================================================= */}
          {/* RIGHT COLUMN: Dedicated High-Density Touch Numpad                */}
          {/* ================================================================= */}
          <View style={styles.numpadCol}>
            {/* Numpad Header */}
            <View style={styles.numpadHeader}>
              <View style={styles.numpadTitleRow}>
                <MaterialCommunityIcons
                  name="dialpad"
                  size={18}
                  color={currentTheme.primary}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.numpadHeading,
                    { color: currentTheme.textDark, fontFamily: activeFontFamily },
                  ]}
                >
                  TOUCH NUMPAD
                </Text>
              </View>

              <View
                style={[
                  styles.targetIndicatorBadge,
                  {
                    backgroundColor: currentTheme.primary + "18",
                    borderColor: currentTheme.primary + "55",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.targetIndicatorText,
                    { color: currentTheme.primary, fontFamily: activeFontFamily },
                  ]}
                >
                  Target: {focusedField === "username" ? "Staff Code" : "PIN"}
                </Text>
              </View>
            </View>

            {/* 4x3 Numpad Keypad */}
            <View style={styles.keypadGrid}>
              {/* Row 1 */}
              <TouchableOpacity
                style={styles.keypadBtn}
                onPress={() => handleNumpadKey("1")}
                activeOpacity={0.7}
              >
                <Text style={styles.keypadNum}>1</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.keypadBtn}
                onPress={() => handleNumpadKey("2")}
                activeOpacity={0.7}
              >
                <Text style={styles.keypadNum}>2</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.keypadBtn}
                onPress={() => handleNumpadKey("3")}
                activeOpacity={0.7}
              >
                <Text style={styles.keypadNum}>3</Text>
              </TouchableOpacity>

              {/* Row 2 */}
              <TouchableOpacity
                style={styles.keypadBtn}
                onPress={() => handleNumpadKey("4")}
                activeOpacity={0.7}
              >
                <Text style={styles.keypadNum}>4</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.keypadBtn}
                onPress={() => handleNumpadKey("5")}
                activeOpacity={0.7}
              >
                <Text style={styles.keypadNum}>5</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.keypadBtn}
                onPress={() => handleNumpadKey("6")}
                activeOpacity={0.7}
              >
                <Text style={styles.keypadNum}>6</Text>
              </TouchableOpacity>

              {/* Row 3 */}
              <TouchableOpacity
                style={styles.keypadBtn}
                onPress={() => handleNumpadKey("7")}
                activeOpacity={0.7}
              >
                <Text style={styles.keypadNum}>7</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.keypadBtn}
                onPress={() => handleNumpadKey("8")}
                activeOpacity={0.7}
              >
                <Text style={styles.keypadNum}>8</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.keypadBtn}
                onPress={() => handleNumpadKey("9")}
                activeOpacity={0.7}
              >
                <Text style={styles.keypadNum}>9</Text>
              </TouchableOpacity>

              {/* Row 4 */}
              <TouchableOpacity
                style={[styles.keypadBtn, styles.keypadBtnClear]}
                onPress={() => handleNumpadKey("CLEAR")}
                activeOpacity={0.7}
              >
                <Text style={styles.keypadClearText}>C</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.keypadBtn}
                onPress={() => handleNumpadKey("0")}
                activeOpacity={0.7}
              >
                <Text style={styles.keypadNum}>0</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.keypadBtn, styles.keypadBtnBackspace]}
                onPress={() => handleNumpadKey("BACKSPACE")}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name="backspace-outline"
                  size={20}
                  color="#475569"
                />
              </TouchableOpacity>
            </View>

            {/* Enter / Next Action Key */}
            <TouchableOpacity
              style={[
                styles.keypadEnterBtn,
                { backgroundColor: currentTheme.primary },
              ]}
              onPress={() => handleNumpadKey("ENTER")}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons
                name="keyboard-return"
                size={20}
                color="#ffffff"
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.keypadEnterText,
                  { fontFamily: activeFontFamily },
                ]}
              >
                {focusedField === "username" ? "NEXT (PIN) ➔" : "SIGN IN ↵"}
              </Text>
            </TouchableOpacity>

            {/* Switch target toggle */}
            <View style={styles.targetSwitcherRow}>
              <TouchableOpacity
                style={[
                  styles.targetSwitchBtn,
                  focusedField === "username" && [
                    styles.targetSwitchBtnActive,
                    {
                      backgroundColor: currentTheme.primary + "18",
                      borderColor: currentTheme.primary,
                    },
                  ],
                ]}
                onPress={() => setFocusedField("username")}
              >
                <Text
                  style={[
                    styles.targetSwitchText,
                    { fontFamily: activeFontFamily },
                    focusedField === "username" && [
                      styles.targetSwitchTextActive,
                      { color: currentTheme.primary },
                    ],
                  ]}
                >
                  Type Staff Code
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.targetSwitchBtn,
                  focusedField === "password" && [
                    styles.targetSwitchBtnActive,
                    {
                      backgroundColor: currentTheme.primary + "18",
                      borderColor: currentTheme.primary,
                    },
                  ],
                ]}
                onPress={() => setFocusedField("password")}
              >
                <Text
                  style={[
                    styles.targetSwitchText,
                    { fontFamily: activeFontFamily },
                    focusedField === "password" && [
                      styles.targetSwitchTextActive,
                      { color: currentTheme.primary },
                    ],
                  ]}
                >
                  Type PIN
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Theme & Font Customizer Modal */}
      <ThemeModal
        visible={showThemeModal}
        onClose={() => setShowThemeModal(false)}
        currentTheme={currentTheme}
        currentFont={currentFont}
        onSelectTheme={handleSelectTheme}
        onSelectFont={handleSelectFont}
      />
    </SafeAreaView>
  );
}

// ==============================================================================
// STYLESHEET (GreenMart Supermarket POS Theme with Integrated Touch Numpad)
// ==============================================================================
const styles = StyleSheet.create({
  topNavRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  themeToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  themeToggleBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  // Root page wrapper - fills full screen with zero scroll
  pageContainer: {
    flex: 1,
    height: "100%",
    backgroundColor: "#f1f5f9", // Cool modern POS slate background
  },

  // Top header bar matching POS billing screen
  topNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandIconBox: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: "#155d36", // Rich GreenMart forest green
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#155d36",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: 1,
    fontFamily: FONT_FAMILY,
  },
  brandSubtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "#155d36",
    letterSpacing: 0.8,
    fontFamily: FONT_FAMILY,
  },
  navRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#16a34a",
    marginRight: 8,
  },
  statusDotBlocked: {
    backgroundColor: "#dc2626",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#155d36",
    letterSpacing: 0.5,
    fontFamily: FONT_MONO,
  },
  lockButton: {
    backgroundColor: "#155d36",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  lockButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
    fontFamily: FONT_FAMILY,
  },

  // Main centered container
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  // Dual-Column Login Card (Form + Touch Numpad)
  loginCardDual: {
    width: "100%",
    maxWidth: 780,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },

  // Left Column: Credentials Form
  credentialsCol: {
    flex: 1.2,
    padding: 24,
    borderRightWidth: 1,
    borderRightColor: "#f1f5f9",
    justifyContent: "space-between",
  },
  badgeRow: {
    marginBottom: 8,
  },
  pillLabel: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  pillLabelBlocked: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  pillLabelText: {
    color: "#155d36",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    fontFamily: FONT_FAMILY,
  },
  pillLabelTextBlocked: {
    color: "#b91c1c",
  },
  loginTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 4,
    fontFamily: FONT_FAMILY,
  },
  loginSubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginBottom: 16,
    fontFamily: FONT_FAMILY,
  },

  // Error Alert Banner
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fca5a5",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 11.5,
    fontWeight: "600",
    fontFamily: FONT_FAMILY,
    lineHeight: 16,
  },
  errorLinkText: {
    color: "#1d4ed8",
    fontSize: 11.5,
    fontWeight: "700",
    textDecorationLine: "underline",
    fontFamily: FONT_FAMILY,
  },

  // Advance License Warning Banner
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fefce8",
    borderWidth: 1,
    borderColor: "#fde047",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  warningText: {
    color: "#854d0e",
    fontSize: 11.5,
    fontWeight: "600",
    fontFamily: FONT_FAMILY,
    lineHeight: 16,
  },
  warningLinkText: {
    color: "#1d4ed8",
    fontSize: 11.5,
    fontWeight: "700",
    textDecorationLine: "underline",
    fontFamily: FONT_FAMILY,
  },

  // Inputs
  inputGroup: {
    marginBottom: 12,
  },
  inputLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5,
  },
  inputLabel: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#334155",
    fontFamily: FONT_FAMILY,
  },
  activeFieldTag: {
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#86efac",
  },
  activeFieldTagText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#155d36",
    fontFamily: FONT_FAMILY,
  },
  textInputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    paddingHorizontal: 10,
    height: 44,
  },
  textInputBoxActive: {
    borderColor: "#155d36",
    backgroundColor: "#ffffff",
    shadowColor: "#155d36",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  fieldIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    height: 42,
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    fontFamily: FONT_FAMILY,
    outlineStyle: "none" as any,
  },
  fieldActionBtn: {
    padding: 6,
  },
  inputDisabled: {
    backgroundColor: "#f1f5f9",
    borderColor: "#e2e8f0",
  },

  // Presets
  presetSection: {
    marginVertical: 6,
  },
  presetTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 6,
    fontFamily: FONT_FAMILY,
  },
  presetRow: {
    flexDirection: "row",
    gap: 6,
  },
  presetChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#155d36",
    fontFamily: FONT_FAMILY,
  },

  // Primary Button
  primaryButton: {
    backgroundColor: "#155d36",
    borderRadius: 8,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    shadowColor: "#155d36",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  primaryButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
    fontFamily: FONT_FAMILY,
  },

  // Signature
  signatureRow: {
    marginTop: 10,
    alignItems: "center",
  },
  signatureText: {
    color: "#94a3b8",
    fontSize: 10.5,
    fontWeight: "600",
    fontFamily: FONT_FAMILY,
  },

  // ===========================================================================
  // Right Column: Dedicated High-Density Touch Numpad
  // ===========================================================================
  numpadCol: {
    flex: 1,
    backgroundColor: "#f8fafc",
    padding: 20,
    justifyContent: "space-between",
  },
  numpadHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  numpadTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  numpadHeading: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0f172a",
    fontFamily: FONT_FAMILY,
    letterSpacing: 0.8,
  },
  targetIndicatorBadge: {
    backgroundColor: "#f0fdf4",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#86efac",
  },
  targetIndicatorText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#155d36",
    fontFamily: FONT_FAMILY,
  },

  // 4x3 Grid
  keypadGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
  },
  keypadBtn: {
    width: "31.5%",
    height: 48,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  keypadNum: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    fontFamily: FONT_MONO,
  },
  keypadBtnClear: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  keypadClearText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#dc2626",
    fontFamily: FONT_FAMILY,
  },
  keypadBtnBackspace: {
    backgroundColor: "#f1f5f9",
  },

  // Enter Key
  keypadEnterBtn: {
    height: 44,
    backgroundColor: "#155d36",
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    shadowColor: "#155d36",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  keypadEnterText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
    fontFamily: FONT_FAMILY,
  },

  // Target Switcher Row
  targetSwitcherRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  targetSwitchBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  targetSwitchBtnActive: {
    backgroundColor: "#f0fdf4",
    borderColor: "#155d36",
  },
  targetSwitchText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#64748b",
    fontFamily: FONT_FAMILY,
  },
  targetSwitchTextActive: {
    color: "#155d36",
    fontWeight: "800",
  },

  // Welcome Screen Styling (GreenMart theme)
  welcomeBody: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  welcomeCard: {
    width: "100%",
    maxWidth: 580,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 30,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  groupBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 12,
  },
  groupBadgeText: {
    color: "#155d36",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    fontFamily: FONT_FAMILY,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 4,
    fontFamily: FONT_FAMILY,
  },
  welcomeSubtitle: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 20,
    fontFamily: FONT_FAMILY,
  },
  boldText: {
    fontWeight: "800",
    color: "#0f172a",
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  metricItem: {
    flex: 1,
    alignItems: "center",
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#e2e8f0",
  },
  metricLabel: {
    fontSize: 11,
    color: "#64748b",
    marginBottom: 2,
    fontFamily: FONT_FAMILY,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
    fontFamily: FONT_MONO,
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 12,
    alignItems: "center",
  },
  creditText: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "600",
    fontFamily: FONT_FAMILY,
  },
});
