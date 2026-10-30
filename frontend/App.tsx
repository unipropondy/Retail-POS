// ==============================================================================
// Author: JAVITH, BAVANI 28-10-2026
// Project: Supermarket Retail POS
// File: App.tsx
// Description: Main application root with persistent POS session restore.
//
// Developer Notes:
//   - Problem: Browser page refreshes (F5) reload the JavaScript bundle and wipe
//     in-memory React state (useState), forcing cashiers back to the login screen.
//   - Solution: Use @react-native-async-storage/async-storage to persist the active
//     session (@pos_active_session) across browser reloads and native restarts.
//   - Security: F10 Exit (handleLogout) explicitly deletes the stored session key,
//     ensuring unauthorized users cannot access POS billing after cashier sign-out.
// ==============================================================================

import React, { useState, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View, ActivityIndicator } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LoginScreen, {
  CashierProfile,
  TerminalProfile,
} from "./src/screens/login";
import PosBillingScreen from "./src/screens/pos_billing";
import { ConfigProvider } from "./src/config/ConfigProvider";

// Storage key used to store the serialized cashier and terminal session
// Author: JAVITH, BAVANI 28-10-2026: Unique storage key for persistent cashier authentication
const SESSION_STORAGE_KEY = "@pos_active_session";

export default function App() {
  // Cashier state (null = not authenticated, CashierProfile = logged in)
  const [currentUser, setCurrentUser] = useState<CashierProfile | null>(null);

  // Terminal state matching tblmaTerminal (HQPC1, etc.)
  const [currentTerminal, setCurrentTerminal] =
    useState<TerminalProfile | null>(null);

  // Loading state while restoring session from AsyncStorage on cold boot or refresh
  const [isRestoring, setIsRestoring] = useState(true);

  // ---------------------------------------------------------------------------
  // Session Restore on Startup / F5 Page Refresh
  // Author: JAVITH, BAVANI 28-10-2026: Automatically restores cashier and terminal state
  // from storage so the POS billing screen remains open after browser reload.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const restoreSession = async () => {
      try {
        // Read persisted session JSON from device/browser storage
        const stored = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
        if (stored) {
          const session = JSON.parse(stored);
          if (session && session.user) {
            // Restore cashier profile and terminal info
            setCurrentUser(session.user);
            setCurrentTerminal(session.terminal || null);
          }
        }
      } catch (e) {
        // Fallback gracefully to login screen if storage is corrupt or inaccessible
        console.warn("⚠️ Could not restore cashier session from storage.");
      } finally {
        // Finished checking storage, allow UI to render
        setIsRestoring(false);
      }
    };

    restoreSession();
  }, []);

  // ---------------------------------------------------------------------------
  // Cashier Login Success Handler
  // Author: JAVITH, BAVANI 28-10-2026: Saves authenticated user & terminal to AsyncStorage
  // ---------------------------------------------------------------------------
  const handleLoginSuccess = async (
    user: CashierProfile,
    terminal: TerminalProfile | null,
  ) => {
    setCurrentUser(user);
    setCurrentTerminal(terminal);
    try {
      // Serialize session object and persist across browser reloads
      await AsyncStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          user,
          terminal,
          savedAt: new Date().toISOString(),
        }),
      );
    } catch (e) {
      console.warn("⚠️ Could not save session to storage.");
    }
  };

  // ---------------------------------------------------------------------------
  // Cashier Logout Handler (F10 Exit)
  // Author: JAVITH, BAVANI 28-10-2026: Deletes session from AsyncStorage to enforce security
  // ---------------------------------------------------------------------------
  const handleLogout = async () => {
    setCurrentUser(null);
    setCurrentTerminal(null);
    try {
      // Remove stored session key so next page refresh prompts for login credentials
      await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {
      console.warn("⚠️ Could not remove session from storage.");
    }
  };

  // Brief initial load while checking storage
  if (isRestoring) {
    return (
      <View style={[styles.container, styles.centerLoader]}>
        <ActivityIndicator size="large" color="#3d6c46" />
      </View>
    );
  }

  return (
    <ConfigProvider>
      <View style={styles.container}>
        {!currentUser ? (
          <LoginScreen onLoginSuccess={handleLoginSuccess} />
        ) : (
          <PosBillingScreen
            onLogout={handleLogout}
            cashierName={currentUser.userName}
            terminalCode={currentTerminal?.terminalCode}
          />
        )}
        <StatusBar style="dark" />
      </View>
    </ConfigProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f4f6f8",
  },
  centerLoader: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f4f6f8",
  },
});
