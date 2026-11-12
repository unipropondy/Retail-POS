// ==============================================================================
// Project: Supermarket Retail POS
// Module: Total Sales Screen / Modal (VB.NET frmTotalSales.vb)
// File: frontend/src/components/TotalSalesModal.tsx
// Description: Direct React / Expo conversion of VB.NET frmTotalSales.vb:
//              - Auto-loads sales data on open (frmTotalSales_Load -> subLoadTotalSales).
//              - Displays Terminal Code, Paymode, and Amount in a clean POS data grid (dgvsales).
//              - Computes and displays Computer Total (nComputerTotal -> lblComputerTotal).
//              - Formats all amounts to 2 decimal places ($0.00).
//              - Refresh button (subLoadTotalSales) and Exit button (cmdExit_Click).
//              - Provides loading spinner, empty-data banner, and error state handling.
// ==============================================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ThemeConfig } from "../utils/theme";

export interface TotalSalesItem {
  TerminalCode: string;
  Paymode: string;
  Amount: number;
}

export interface TotalSalesModalProps {
  visible: boolean;
  onClose: () => void;
  apiUrl: string;
  terminalCode?: string;
  theme?: ThemeConfig;
  primaryColor?: string;
}

export default function TotalSalesModal({
  visible,
  onClose,
  apiUrl,
  terminalCode,
  theme,
  primaryColor = "#7A1C30",
}: TotalSalesModalProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [salesItems, setSalesItems] = useState<TotalSalesItem[]>([]);
  const [computerTotal, setComputerTotal] = useState<number>(0);

  // Replicates VB.NET subLoadTotalSales()
  const loadTotalSales = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Query parameters: terminalCode can optionally filter or fetch all active
      const url = `${apiUrl}/api/total-sales`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const json = await response.json();
      if (response.ok && json.success) {
        const items: TotalSalesItem[] = Array.isArray(json.data) ? json.data : [];
        setSalesItems(items);

        // Sum of all amount values (nComputerTotal)
        const total = typeof json.computerTotal === "number"
          ? json.computerTotal
          : items.reduce((sum, item) => sum + (Number(item.Amount) || 0), 0);

        setComputerTotal(total);
      } else {
        const err = json?.message || "Failed to load total sales.";
        setErrorMsg(err);
        setSalesItems([]);
        setComputerTotal(0);
      }
    } catch (err: any) {
      console.error("Error loading total sales:", err);
      setErrorMsg(err?.message || "Network error. Please check backend connection.");
      setSalesItems([]);
      setComputerTotal(0);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  // VB.NET frmTotalSales_Load: runs automatically when opened
  useEffect(() => {
    if (visible) {
      loadTotalSales();
    } else {
      setErrorMsg(null);
    }
  }, [visible, loadTotalSales]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Header Bar */}
          <View style={[styles.headerBar, { backgroundColor: primaryColor }]}>
            <View style={styles.headerTitleRow}>
              <MaterialCommunityIcons name="calculator-variant" size={24} color="#ffffff" />
              <Text style={styles.headerTitleText}>TOTAL SALES</Text>
            </View>
            <TouchableOpacity
              style={styles.headerCloseBtn}
              onPress={onClose}
              activeOpacity={0.7}
              accessibilityLabel="Close Total Sales"
            >
              <MaterialCommunityIcons name="close" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Subheader / Status Info */}
          <View style={styles.subHeader}>
            <View style={styles.subHeaderInfo}>
              <Text style={styles.subHeaderLabel}>Terminal:</Text>
              <Text style={styles.subHeaderValue}>{terminalCode ? terminalCode.trim() : "All Terminals"}</Text>
            </View>
            <View style={styles.subHeaderInfo}>
              <Text style={styles.subHeaderLabel}>Records:</Text>
              <Text style={styles.subHeaderValue}>{salesItems.length}</Text>
            </View>
          </View>

          {/* Grid / Table Container (dgvsales) */}
          <View style={styles.tableContainer}>
            {/* Table Header */}
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, styles.colTerminal]}>TERMINAL</Text>
              <Text style={[styles.tableHeaderCell, styles.colPaymode]}>PAYMODE</Text>
              <Text style={[styles.tableHeaderCell, styles.colAmount]}>AMOUNT</Text>
            </View>

            {/* Table Body */}
            {loading ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={primaryColor} />
                <Text style={styles.statusText}>Loading total sales data...</Text>
              </View>
            ) : errorMsg ? (
              <View style={styles.centerContainer}>
                <MaterialCommunityIcons name="alert-circle-outline" size={36} color="#ef4444" />
                <Text style={styles.errorText}>{errorMsg}</Text>
                <TouchableOpacity
                  style={[styles.retryBtn, { backgroundColor: primaryColor }]}
                  onPress={loadTotalSales}
                  activeOpacity={0.8}
                >
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : salesItems.length === 0 ? (
              <View style={styles.centerContainer}>
                <MaterialCommunityIcons name="information-outline" size={36} color="#94a3b8" />
                <Text style={styles.emptyText}>No sales records found for current shift.</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.tableScrollView}
                contentContainerStyle={styles.tableScrollContent}
              >
                {salesItems.map((item, index) => {
                  const isEven = index % 2 === 0;
                  return (
                    <View
                      key={`${item.TerminalCode}-${item.Paymode}-${index}`}
                      style={[
                        styles.tableDataRow,
                        isEven ? styles.rowEven : styles.rowOdd,
                      ]}
                    >
                      <Text style={[styles.tableDataCell, styles.colTerminal]}>
                        {item.TerminalCode}
                      </Text>
                      <Text style={[styles.tableDataCell, styles.colPaymode]}>
                        {item.Paymode}
                      </Text>
                      <Text style={[styles.tableDataCell, styles.colAmount, styles.amountText]}>
                        ${(Number(item.Amount) || 0).toFixed(2)}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Computer Total Display (lblComputerTotal) */}
          <View style={styles.totalSummaryContainer}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Computer Total :</Text>
              <Text style={[styles.totalValue, { color: primaryColor }]}>
                ${computerTotal.toFixed(2)}
              </Text>
            </View>
          </View>

          {/* Action Buttons: Refresh & Exit (cmdExit_Click) */}
          <View style={styles.actionsBar}>
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={loadTotalSales}
              disabled={loading}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="refresh" size={18} color="#0f172a" />
              <Text style={styles.refreshBtnText}>Refresh</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.exitBtn, { backgroundColor: primaryColor }]}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="close-circle-outline" size={18} color="#ffffff" />
              <Text style={styles.exitBtnText}>Exit</Text>
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
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 580,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitleText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.6,
  },
  headerCloseBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  subHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  subHeaderInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  subHeaderLabel: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#64748b",
  },
  subHeaderValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1e293b",
  },
  tableContainer: {
    minHeight: 220,
    maxHeight: 340,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
  },
  tableHeaderCell: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#334155",
    letterSpacing: 0.5,
  },
  tableScrollView: {
    flex: 1,
  },
  tableScrollContent: {
    flexGrow: 1,
  },
  tableDataRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  rowEven: {
    backgroundColor: "#ffffff",
  },
  rowOdd: {
    backgroundColor: "#f8fafc",
  },
  tableDataCell: {
    fontSize: 13.5,
    color: "#1e293b",
    fontWeight: "600",
  },
  colTerminal: {
    flex: 2,
    textAlign: "left",
  },
  colPaymode: {
    flex: 2.5,
    textAlign: "left",
  },
  colAmount: {
    flex: 2,
    textAlign: "right",
  },
  amountText: {
    fontWeight: "800",
    color: "#0f172a",
    fontVariant: ["tabular-nums"],
  },
  centerContainer: {
    flex: 1,
    minHeight: 200,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  statusText: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "600",
    color: "#dc2626",
    textAlign: "center",
    maxWidth: "90%",
  },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 12.5,
  },
  emptyText: {
    marginTop: 8,
    fontSize: 13.5,
    fontWeight: "600",
    color: "#64748b",
  },
  totalSummaryContainer: {
    backgroundColor: "#f8fafc",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: "#334155",
    letterSpacing: 0.3,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  actionsBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    gap: 12,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  refreshBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  exitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
    justifyContent: "center",
  },
  exitBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
});

