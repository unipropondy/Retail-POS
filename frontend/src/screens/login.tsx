// ==============================================================================
// Author: JAVITH, BAVANI 28-10-2026
// Project: Supermarket Retail POS
// File: src/screens/login.tsx
// Description: Single-page Cashier Login and Station Terminal UI with
//              tblmaTerminal ComputerName validation and warm luxury theme.
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
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

// Backend API URL - connects to our Express server
const API_URL = "http://localhost:5000";

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
  // State for cashier user input
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Terminal configuration states
  const [terminal, setTerminal] = useState<TerminalProfile | null>(null);
  const [isTerminalBlocked, setIsTerminalBlocked] = useState(false);
  const [terminalCheckLoading, setTerminalCheckLoading] = useState(true);

  // General loading & error states
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Authenticated cashier profile
  const [activeUser, setActiveUser] = useState<CashierProfile | null>(null);

  // ----------------------------------------------------------------------------
  // Check Terminal Configuration on Initial Load (tblmaTerminal query)
  // ----------------------------------------------------------------------------
  useEffect(() => {
    checkTerminalStatus();
  }, []);

  const checkTerminalStatus = async () => {
    setTerminalCheckLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${API_URL}/api/auth/terminal-info`);
      const data = await response.json();

      if (response.ok && data.success && data.configured) {
        setTerminal(data.terminal);
        setIsTerminalBlocked(false);
      } else {
        // Terminal is not configured in tblmaTerminal
        setIsTerminalBlocked(true);
        setErrorMessage(
          data.message ||
            "Terminal not configured. Please contact system administartor.",
        );
      }
    } catch (err) {
      // Backend not yet reachable
      setErrorMessage(
        'Unable to connect to backend server. Make sure "node server.js" is running.',
      );
    } finally {
      setTerminalCheckLoading(false);
    }
  };

  // ----------------------------------------------------------------------------
  // Handle Cashier Login
  // ----------------------------------------------------------------------------
  const handleLogin = async () => {
    // 1. Ensure username is entered
    if (!username.trim()) {
      setErrorMessage("Please enter your Staff Code or Username.");
      return;
    }

    // 2. Ensure password / PIN is entered
    if (!password.trim()) {
      setErrorMessage("Please enter your security PIN / Password.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      // 3. Make HTTP POST request to backend
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

      // 4. Check response status
      if (response.ok && data.success) {
        setActiveUser(data.user);
        const resolvedTerminal = data.terminal || terminal;
        if (data.terminal) {
          setTerminal(data.terminal);
        }
        // [JAVITH - 28-10-2026]: Hand over authenticated cashier & terminal session to App.tsx
        // App.tsx persists this session into AsyncStorage (@pos_active_session) so cashiers
        // stay signed into POS billing even when refreshing the browser page (F5).
        if (onLoginSuccess) {
          onLoginSuccess(data.user, resolvedTerminal);
        }
      } else {
        // If terminal check failed
        if (response.status === 403 || data.terminalConfigured === false) {
          setIsTerminalBlocked(true);
        }
        setErrorMessage(
          data.message || "Login failed. Please verify credentials.",
        );
      }
    } catch (err: any) {
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
          <View>
            <Text style={styles.brandTitle}>KALAISMR</Text>
            <Text style={styles.brandSubtitle}>SUPERMARKET POS</Text>
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
              <Text style={styles.lockButtonText}>Lock / Switch</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Welcome Dashboard Content - Single page with NO scrolling */}
        <View style={styles.welcomeBody}>
          <View style={styles.welcomeCard}>
            {/* Cashier Group Tag */}
            <View style={styles.groupBadge}>
              <Text style={styles.groupBadgeText}>
                {activeUser.isAdmin
                  ? "ADMINISTRATOR"
                  : activeUser.userGroup || "CASHIER"}
              </Text>
            </View>

            {/* Welcome Heading */}
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

            {/* Quick Metrics Bar */}
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

            {/* Quick Action Tiles */}
            <View style={styles.actionRow}>
              <View style={styles.actionTile}>
                <MaterialCommunityIcons
                  name="cart-outline"
                  size={26}
                  color="#c59f60"
                  style={{ marginBottom: 4 }}
                />
                <Text style={styles.actionHeading}>New Checkout</Text>
                <Text style={styles.actionDesc}>
                  Ready to scan barcode items & weigh products
                </Text>
              </View>

              <View style={styles.actionTile}>
                <MaterialCommunityIcons
                  name="tag-outline"
                  size={26}
                  color="#c59f60"
                  style={{ marginBottom: 4 }}
                />
                <Text style={styles.actionHeading}>Price & Stock Check</Text>
                <Text style={styles.actionDesc}>
                  Instant PLU search and stock availability
                </Text>
              </View>
            </View>

            {/* Developer: JAVITH 28-10-2026 */}
            <View style={styles.cardFooter}>
              <Text style={styles.creditText}>
                Kalaismr Supermarket • Point of Sale Station
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ----------------------------------------------------------------------------
  // VIEW: COMPACT SINGLE-PAGE CASHIER LOGIN (No scroll, warm luxury theme)
  // ----------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.pageContainer}>
      {/* Top Header Bar */}
      <View style={styles.topNav}>
        <View>
          <Text style={styles.brandTitle}>KALAISMR</Text>
          <Text style={styles.brandSubtitle}>SUPERMARKET POS</Text>
        </View>
        <View style={styles.statusPill}>
          <View
            style={[
              styles.statusDot,
              isTerminalBlocked && styles.statusDotBlocked,
            ]}
          />
          <Text style={styles.statusText}>
            {terminalCheckLoading
              ? "CHECKING TERMINAL..."
              : isTerminalBlocked
                ? "TERMINAL RESTRICTED"
                : `${terminal?.terminalCode || "HQPC1"} • ${terminal?.locationCode || "HQ"} READY`}
          </Text>
        </View>
      </View>

      {/* Main Single Page Centered Content Container */}
      <View style={styles.centerContainer}>
        <View style={styles.loginCard}>
          {/* Card Header */}
          <View style={styles.cardHeader}>
            <View
              style={[
                styles.pillLabel,
                isTerminalBlocked && styles.pillLabelBlocked,
              ]}
            >
              <Text
                style={[
                  styles.pillLabelText,
                  isTerminalBlocked && styles.pillLabelTextBlocked,
                ]}
              >
                {isTerminalBlocked ? "SECURITY RESTRICTION" : "TERMINAL ACCESS"}
              </Text>
            </View>
            <Text style={styles.loginTitle}>Cashier Sign In</Text>
            <Text style={styles.loginSubtitle}>
              {isTerminalBlocked
                ? "This computer is not authorized for billing"
                : "Enter your staff credentials to open this terminal"}
            </Text>
          </View>

          {/* Error Banner */}
          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Input 1: Staff / User Code */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Staff Code / Username</Text>
            <TextInput
              style={[
                styles.textInput,
                isTerminalBlocked && styles.inputDisabled,
              ]}
              value={username}
              onChangeText={(text) => {
                setUsername(text);
                setErrorMessage(null);
              }}
              placeholder="e.g. AMITH or MAYIL"
              placeholderTextColor="#9e988f"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isTerminalBlocked && !loading}
            />
          </View>

          {/* Input 2: Password / PIN */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Security PIN / Password</Text>
            <TextInput
              style={[
                styles.textInput,
                isTerminalBlocked && styles.inputDisabled,
              ]}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setErrorMessage(null);
              }}
              placeholder="••••••"
              placeholderTextColor="#9e988f"
              secureTextEntry
              keyboardType="numeric"
              onSubmitEditing={handleLogin}
              editable={!isTerminalBlocked && !loading}
            />
          </View>

          {/* Primary Action Button (Deep Forest Spruce color from theme) */}
          <TouchableOpacity
            style={[
              styles.primaryButton,
              (loading || isTerminalBlocked) && styles.buttonDisabled,
            ]}
            onPress={isTerminalBlocked ? checkTerminalStatus : handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isTerminalBlocked
                  ? "Retry Terminal Check"
                  : "Authorize & Open Terminal"}
              </Text>
            )}
          </TouchableOpacity>

          {/* Developer: JAVITH 28-10-2026 */}
          <View style={styles.signatureRow}>
            <Text style={styles.signatureText}>
              Retail POS • MS SQL Edition
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ==============================================================================
// STYLESHEET (Warm luxury organic palette inspired by reference design)
// Palette:
//   Background: #F7F5F0 (Warm Linen / Cream)
//   Card:       #FFFFFF (Crisp Porcelain White)
//   Border:     #E5DFD5 (Soft Warm Stone)
//   Primary:    #1E3129 (Deep Forest Spruce / Espresso Moss)
//   Accent:     #B88E5E (Warm Bronze / Caramel)
//   Text Dark:  #1A211C (Deep Obsidian Slate)
//   Text Muted: #6B655C (Warm Sandstone Gray)
// ==============================================================================

const styles = StyleSheet.create({
  // Root page wrapper - fills full screen with zero scroll
  pageContainer: {
    flex: 1,
    height: "100%",
    backgroundColor: "#F7F5F0",
  },

  // Top header bar
  topNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EBE5DB",
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1A211C",
    letterSpacing: 1.2,
  },
  brandSubtitle: {
    fontSize: 10,
    fontWeight: "600",
    color: "#B88E5E",
    letterSpacing: 1,
  },
  navRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3EFE8",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2DAD0",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#2D8A5E",
    marginRight: 7,
  },
  statusDotBlocked: {
    backgroundColor: "#DC2626",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4A453E",
    letterSpacing: 0.5,
  },
  lockButton: {
    backgroundColor: "#1E3129",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  lockButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },

  // Main centered container - keeps everything visible in one single view
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  // Login Card
  loginCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 30,
    borderWidth: 1,
    borderColor: "#E6E0D6",
    ...Platform.select({
      web: {
        boxShadow: "0 8px 30px rgba(50, 40, 30, 0.05)",
      },
      default: {
        shadowColor: "#30251A",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
        elevation: 3,
      },
    }),
  },
  cardHeader: {
    marginBottom: 20,
    alignItems: "center",
  },
  pillLabel: {
    backgroundColor: "#F4EFE6",
    borderWidth: 1,
    borderColor: "#DECFC0",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginBottom: 10,
  },
  pillLabelBlocked: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
  },
  pillLabelText: {
    color: "#9E7444",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  pillLabelTextBlocked: {
    color: "#991B1B",
  },
  loginTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1A211C",
    marginBottom: 4,
    textAlign: "center",
  },
  loginSubtitle: {
    fontSize: 12,
    color: "#756F66",
    textAlign: "center",
  },

  // Error Alert Banner
  errorBox: {
    backgroundColor: "#FDF2F2",
    borderWidth: 1,
    borderColor: "#F8B4B4",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#9B1C1C",
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },

  // Input styling
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#423D36",
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  textInput: {
    backgroundColor: "#FAFAF7",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DDD6CB",
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: "#1A211C",
  },
  inputDisabled: {
    backgroundColor: "#F3F4F6",
    color: "#9CA3AF",
  },

  // Primary Submit Button (Deep Forest Spruce)
  primaryButton: {
    backgroundColor: "#1E3129",
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    ...Platform.select({
      web: {
        cursor: "pointer",
      },
    }),
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.5,
  },

  // Signature row
  signatureRow: {
    marginTop: 22,
    alignItems: "center",
  },
  signatureText: {
    color: "#A8A196",
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.4,
  },

  // Welcome Screen Styling
  welcomeBody: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  welcomeCard: {
    width: "100%",
    maxWidth: 580,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 30,
    borderWidth: 1,
    borderColor: "#E6E0D6",
  },
  groupBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#F3EFE8",
    borderWidth: 1,
    borderColor: "#DECFC0",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 12,
  },
  groupBadgeText: {
    color: "#8A6237",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1A211C",
    marginBottom: 4,
  },
  welcomeSubtitle: {
    fontSize: 13,
    color: "#6B655C",
    marginBottom: 20,
  },
  boldText: {
    fontWeight: "700",
    color: "#1A211C",
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAF8F4",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#EAE4D9",
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
    backgroundColor: "#DECFC0",
  },
  metricLabel: {
    fontSize: 11,
    color: "#8C857B",
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1A211C",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  actionTile: {
    flex: 1,
    backgroundColor: "#FAFAF7",
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EAE4DA",
  },
  actionIcon: {
    fontSize: 20,
    marginBottom: 8,
  },
  actionHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1A211C",
    marginBottom: 4,
  },
  actionDesc: {
    fontSize: 11,
    color: "#756F66",
    lineHeight: 16,
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: "#F0EBE2",
    paddingTop: 12,
    alignItems: "center",
  },
  creditText: {
    color: "#9E978D",
    fontSize: 11,
  },
});
