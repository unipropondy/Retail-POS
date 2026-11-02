import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ThemeConfig } from "../utils/theme";

interface ClearAdminAuthModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (username: string, password: string) => Promise<boolean>;
  theme?: ThemeConfig;
  primaryColor?: string;
  actionTitle?: string;
  promptMessage?: string;
}

export default function ClearAdminAuthModal({
  visible,
  onClose,
  onSubmit,
  theme,
  primaryColor,
  actionTitle = "Admin Authorization Required",
  promptMessage = "Cashier does not have permission to clear items (F2). Enter Admin or Supervisor credentials:",
}: ClearAdminAuthModalProps) {
  const [adminUser, setAdminUser] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const handleSubmit = async () => {
    if (!adminUser.trim() || !adminPass.trim()) {
      setAuthError("Enter both admin username and password");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    try {
      const ok = await onSubmit(adminUser.trim(), adminPass.trim());
      if (ok) {
        setAdminUser("");
        setAdminPass("");
        onClose();
      } else {
        setAuthError("Invalid admin credentials or permission denied.");
      }
    } catch {
      setAuthError("Authorization failed. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleClose = () => {
    setAdminUser("");
    setAdminPass("");
    setAuthError("");
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.container,
            {
              backgroundColor: theme?.surface || "#ffffff",
              borderColor: theme?.borderColor || "#e2e8f0",
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.modalHeaderBar, { backgroundColor: "#dc2626" }]}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconBadge}>
                <MaterialCommunityIcons
                  name="shield-lock-outline"
                  size={20}
                  color="#ffffff"
                />
              </View>
              <Text style={styles.headerMainTitle}>{actionTitle}</Text>
            </View>
            <TouchableOpacity onPress={handleClose} disabled={authLoading}>
              <MaterialCommunityIcons name="close" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View style={styles.modalBody}>
            <Text style={styles.promptText}>{promptMessage}</Text>

            {authError ? (
              <View style={styles.errorAlert}>
                <MaterialCommunityIcons
                  name="alert-circle"
                  size={16}
                  color="#dc2626"
                />
                <Text style={styles.errorAlertText}>{authError}</Text>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Admin Username</Text>
              <View style={styles.inputWrapper}>
                <MaterialCommunityIcons
                  name="account-outline"
                  size={18}
                  color="#64748b"
                />
                <TextInput
                  style={styles.textInput}
                  value={adminUser}
                  onChangeText={(val) => {
                    setAdminUser(val);
                    setAuthError("");
                  }}
                  placeholder="e.g. UPS or ADMIN"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="characters"
                  editable={!authLoading}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Admin Password</Text>
              <View style={styles.inputWrapper}>
                <MaterialCommunityIcons
                  name="lock-outline"
                  size={18}
                  color="#64748b"
                />
                <TextInput
                  style={styles.textInput}
                  value={adminPass}
                  onChangeText={(val) => {
                    setAdminPass(val);
                    setAuthError("");
                  }}
                  placeholder="••••••••"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry
                  editable={!authLoading}
                  onSubmitEditing={handleSubmit}
                />
              </View>
            </View>

            {/* Actions */}
            <View style={styles.modalFooterActions}>
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={handleClose}
                disabled={authLoading}
              >
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.btnConfirm,
                  { backgroundColor: "#dc2626" },
                  authLoading && { opacity: 0.7 },
                ]}
                onPress={handleSubmit}
                disabled={authLoading}
              >
                {authLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name="check-circle-outline"
                      size={18}
                      color="#ffffff"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.btnConfirmText}>Authorize & Clear</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 9999,
  },
  container: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    elevation: 25,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
  },
  modalHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerMainTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  modalBody: {
    padding: 20,
  },
  promptText: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 16,
    lineHeight: 18,
  },
  errorAlert: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 14,
    gap: 8,
  },
  errorAlertText: {
    color: "#dc2626",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    backgroundColor: "#f8fafc",
    gap: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: "#0f172a",
    paddingVertical: 0,
  },
  modalFooterActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  btnCancel: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
  },
  btnCancelText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },
  btnConfirm: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  btnConfirmText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
});

