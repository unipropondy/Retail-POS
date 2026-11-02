import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ThemeConfig } from "../utils/theme";

export type AlertType = "success" | "warning" | "error" | "info" | "confirm";

export interface CustomAlertState {
  visible: boolean;
  type: AlertType;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface CustomAlertModalProps {
  alertState: CustomAlertState;
  onClose: () => void;
  theme?: ThemeConfig;
  primaryColor?: string;
}

export default function CustomAlertModal({
  alertState,
  onClose,
  theme,
  primaryColor,
}: CustomAlertModalProps) {
  if (!alertState.visible) return null;

  // Derive theme colors with safe fallbacks
  const themePrimary = theme?.primary || primaryColor || "#881337";
  const isDark = theme?.isDark || false;

  const getTypeStyle = () => {
    switch (alertState.type) {
      case "success":
        return {
          icon: "check-circle",
          iconColor: "#16a34a",
          badgeBg: "#dcfce7",
        };
      case "warning":
        return {
          icon: "alert",
          iconColor: "#d97706",
          badgeBg: "#fef3c7",
        };
      case "error":
        return {
          icon: "close-circle",
          iconColor: "#dc2626",
          badgeBg: "#fee2e2",
        };
      case "confirm":
        return {
          icon: "help-circle-outline",
          iconColor: themePrimary,
          badgeBg: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)",
        };
      case "info":
      default:
        return {
          icon: "information-outline",
          iconColor: "#2563eb",
          badgeBg: "#dbeafe",
        };
    }
  };

  const typeConfig = getTypeStyle();

  const handleConfirm = () => {
    onClose();
    if (alertState.onConfirm) {
      alertState.onConfirm();
    }
  };

  const handleCancel = () => {
    onClose();
    if (alertState.onCancel) {
      alertState.onCancel();
    }
  };

  return (
    <Modal
      visible={alertState.visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.dialogCard,
            {
              backgroundColor: theme?.surface || "#ffffff",
              borderColor: theme?.borderColor || "#e2e8f0",
            },
          ]}
        >
          {/* Top Banner Header: Filled with active Theme Primary color */}
          <View style={[styles.dialogHeader, { backgroundColor: themePrimary }]}>
            <View style={[styles.iconCircle, { backgroundColor: typeConfig.badgeBg }]}>
              <MaterialCommunityIcons
                name={typeConfig.icon as any}
                size={34}
                color={typeConfig.iconColor}
              />
            </View>
            <Text style={styles.dialogTitle}>{alertState.title}</Text>
          </View>

          {/* Dialog Body Content */}
          <View style={styles.dialogBody}>
            <Text
              style={[
                styles.dialogMessage,
                { color: theme?.textDark || "#0f172a" },
              ]}
            >
              {alertState.message}
            </Text>
          </View>

          {/* Dialog Action Buttons */}
          <View style={styles.dialogActions}>
            {alertState.type === "confirm" || alertState.onCancel ? (
              <TouchableOpacity
                style={[
                  styles.cancelBtn,
                  {
                    backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
                    borderColor: theme?.borderColor || "#cbd5e1",
                  },
                ]}
                onPress={handleCancel}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.cancelBtnText,
                    { color: theme?.textMuted || "#64748b" },
                  ]}
                >
                  {alertState.cancelText || "Cancel"}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[
                styles.confirmBtn,
                { backgroundColor: themePrimary },
                alertState.type !== "confirm" && !alertState.onCancel
                  ? { flex: 1 }
                  : {},
              ]}
              onPress={handleConfirm}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmBtnText}>
                {alertState.confirmText || "OK"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.68)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 99999,
  },
  dialogCard: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  dialogHeader: {
    paddingTop: 22,
    paddingBottom: 18,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#ffffff",
    textAlign: "center",
    letterSpacing: 0.3,
    fontFamily: Platform.select({
      web: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      default: undefined,
    }),
  },
  dialogBody: {
    paddingHorizontal: 24,
    paddingVertical: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  dialogMessage: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    fontWeight: "500",
    fontFamily: Platform.select({
      web: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      default: undefined,
    }),
  },
  dialogActions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 4,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  confirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.3,
  },
});
