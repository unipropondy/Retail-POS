// ==============================================================================
// Author: JAVITH, BAVANI 13-11-2026
// Project: Supermarket Retail POS
// Module: Paymode Change / Paymode Modification Modal
// File: frontend/src/components/PaymodeModificationModal.tsx
// Description: Implements exact VB.NET logic from frmPos1.btn_PaymodeChange_Click
//              and frmPaymodeModification:
//              - Checks gbAutoNETS: If "1", triggers NETS ECR3 Reset Sequence and alerts.
//              - Otherwise checks cashier permission for "Shft + PgDn" (tblPosPermission).
//              - If not permitted, shows Admin Password prompt.
//              - Displays active invoices for the terminal (tblPosSalesHeaderCur) with current paymode.
//              - On selecting invoice, loads paymodes with existing amount/slip (tblInvPayMode & vwPayModeDetail).
//              - CASH slip number is disabled / read-only.
//              - Real-time calculation of Paid and Balance.
//              - Allows save only when Paid equals Total.
//              - Executes atomic transaction (Sp_POS_PayModeModification & sp_POS_PayModeDetail).
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Platform,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";

interface PaymodeModificationModalProps {
  visible: boolean;
  onClose: () => void;
  terminalCode: string;
  cashierGroupCode?: string;
  loggedInUserId?: string;
  backendUrl: string;
  gbAutoNETS?: string; // "1" if Auto NETS enabled
  showAlert: (
    title: string,
    message: string,
    type?: "success" | "warning" | "error" | "info"
  ) => void;
}

interface InvoiceItem {
  InvoiceNo: string;
  CustomerCode: string;
  ModifyDate: string;
  NetTotal: number;
  TotalLines: number;
  TenderAmount: number;
  Balance: number;
  CashierID: string;
  PayMode?: string;
}

interface PayModeRow {
  PayMode: string;
  OldAmount: number;
  OldSlipNo: string;
  NewAmount: string;
  NewSlipNo: string;
  Position?: number;
}

export const PaymodeModificationModal: React.FC<PaymodeModificationModalProps> = ({
  visible,
  onClose,
  terminalCode,
  cashierGroupCode = "CASHIER",
  loggedInUserId = "ADMIN",
  backendUrl,
  gbAutoNETS = "0",
  showAlert,
}) => {
  // Permission & Auth state
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);
  const [showAdminPasswordPrompt, setShowAdminPasswordPrompt] = useState<boolean>(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");

  // Invoices & Paymodes state
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState<boolean>(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceItem | null>(null);

  const [paymodeRows, setPaymodeRows] = useState<PayModeRow[]>([]);
  const [loadingPaymodes, setLoadingPaymodes] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  const adminPassInputRef = useRef<any>(null);

  // Initialize and check permission / gbAutoNETS when modal opens
  useEffect(() => {
    if (!visible) {
      resetState();
      return;
    }

    if (gbAutoNETS === "1") {
      handleAutoNetsReset();
      return;
    }

    checkCashierPermission();
  }, [visible]);

  const resetState = () => {
    setIsAuthorized(false);
    setCheckingAuth(true);
    setShowAdminPasswordPrompt(false);
    setAdminPasswordInput("");
    setAuthError("");
    setInvoices([]);
    setSelectedInvoice(null);
    setPaymodeRows([]);
    setSaving(false);
  };

  // 1. gbAutoNETS = "1" -> Reset sequence flow
  const handleAutoNetsReset = async () => {
    try {
      setCheckingAuth(true);
      const res = await fetch(`${backendUrl}/api/paymode-change/reset-nets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequenceNumber: "123456789" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showAlert("NETS Device", "Reset Successfully", "success");
      } else {
        showAlert("NETS Device", "Reset Failed", "error");
      }
    } catch (err: any) {
      showAlert("NETS Device", "Reset Failed: " + err.message, "error");
    } finally {
      setCheckingAuth(false);
      onClose();
    }
  };

  // 2. Permission check for Cashier (Shft + PgDn)
  const checkCashierPermission = async () => {
    try {
      setCheckingAuth(true);
      setAuthError("");
      const res = await fetch(`${backendUrl}/api/paymode-change/permission-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cashierGroupCode: cashierGroupCode }),
      });
      const data = await res.json();

      if (res.ok && data.authorized) {
        setIsAuthorized(true);
        loadInvoices();
      } else {
        // Cashier does not have permission -> Show Admin Password prompt
        setShowAdminPasswordPrompt(true);
        setTimeout(() => adminPassInputRef.current?.focus(), 150);
      }
    } catch (err: any) {
      setAuthError(err.message || "Failed to check permission");
      setShowAdminPasswordPrompt(true);
    } finally {
      setCheckingAuth(false);
    }
  };

  // 3. Verify Admin Password
  const handleVerifyAdminPassword = async () => {
    if (!adminPasswordInput.trim()) {
      setAuthError("Please enter Admin Password.");
      return;
    }
    try {
      setCheckingAuth(true);
      setAuthError("");
      const res = await fetch(`${backendUrl}/api/paymode-change/permission-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminPassword: adminPasswordInput.trim() }),
      });
      const data = await res.json();

      if (res.ok && data.authorized) {
        setShowAdminPasswordPrompt(false);
        setIsAuthorized(true);
        loadInvoices();
      } else {
        setAuthError(data.message || "Invalid Admin Password. Access Denied.");
      }
    } catch (err: any) {
      setAuthError(err.message || "Admin verification failed");
    } finally {
      setCheckingAuth(false);
    }
  };

  // 4. Load Invoices for Terminal
  const loadInvoices = async () => {
    try {
      setLoadingInvoices(true);
      const res = await fetch(
        `${backendUrl}/api/paymode-change/invoices?terminalCode=${encodeURIComponent(terminalCode)}`
      );
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.invoices)) {
        setInvoices(data.invoices);
        if (data.invoices.length > 0) {
          handleSelectInvoice(data.invoices[0]);
        } else {
          setSelectedInvoice(null);
          setPaymodeRows([]);
        }
      } else {
        setInvoices([]);
      }
    } catch (err: any) {
      showAlert("Error", "Failed to load invoices: " + err.message, "error");
    } finally {
      setLoadingInvoices(false);
    }
  };

  // 5. Select Invoice and load paymodes
  const handleSelectInvoice = async (invoice: InvoiceItem) => {
    setSelectedInvoice(invoice);
    try {
      setLoadingPaymodes(true);
      const res = await fetch(
        `${backendUrl}/api/paymode-change/modes?invoiceNo=${encodeURIComponent(invoice.InvoiceNo)}`
      );
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.modes)) {
        const rows: PayModeRow[] = data.modes.map((m: any) => ({
          PayMode: m.PayMode,
          OldAmount: parseFloat(m.OldAmount || 0),
          OldSlipNo: m.OldSlipNo || "",
          NewAmount: "",
          NewSlipNo: "",
          Position: m.Position || 0,
        }));
        setPaymodeRows(rows);
      } else {
        setPaymodeRows([]);
      }
    } catch (err: any) {
      showAlert("Error", "Failed to load paymodes: " + err.message, "error");
    } finally {
      setLoadingPaymodes(false);
    }
  };

  // Calculations
  const invoiceTotal = selectedInvoice ? Number(selectedInvoice.NetTotal || 0) : 0;
  const totalPaid = paymodeRows.reduce(
    (acc, row) => acc + (parseFloat(row.NewAmount) || 0),
    0
  );
  const balance = invoiceTotal - totalPaid;
  const isTally = Math.abs(invoiceTotal - totalPaid) < 0.001 && totalPaid > 0;

  // Clear / Reset form
  const handleClear = () => {
    setPaymodeRows((prev) =>
      prev.map((row) => ({
        ...row,
        NewAmount: "",
        NewSlipNo: "",
      }))
    );
  };

  // Save Paymode changes
  const handleSave = async () => {
    if (!selectedInvoice) {
      showAlert("Notice", "Please select an invoice first.", "warning");
      return;
    }

    if (!isTally) {
      showAlert(
        "Amount Mismatch",
        "Amount Not Tally. Please Key in Exact Amount.",
        "warning"
      );
      return;
    }

    const nonZeroPayments = paymodeRows
      .filter((row) => (parseFloat(row.NewAmount) || 0) !== 0)
      .map((row) => ({
        payMode: row.PayMode,
        amount: parseFloat(row.NewAmount),
        slipNo: row.NewSlipNo,
      }));

    if (nonZeroPayments.length === 0) {
      showAlert("Notice", "Please enter at least one new payment amount.", "warning");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`${backendUrl}/api/paymode-change/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNo: selectedInvoice.InvoiceNo,
          payments: nonZeroPayments,
          userId: loggedInUserId,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showAlert("Success", data.message || "Paymode changed successfully!", "success");
        // Reload invoices and current invoice details
        await loadInvoices();
      } else {
        showAlert("Error", data.message || "Failed to update paymode.", "error");
      }
    } catch (err: any) {
      showAlert("Error", "Transaction failed: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  // Keyboard navigation (F4: Save, F6: Clear, Escape: Exit)
  useEffect(() => {
    if (!visible || !isAuthorized) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "F4") {
        e.preventDefault();
        handleSave();
      } else if (e.key === "F6") {
        e.preventDefault();
        handleClear();
      }
    };

    if (Platform.OS === "web") {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [visible, isAuthorized, isTally, selectedInvoice, paymodeRows]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconBadge}>
                <Feather name="credit-card" size={18} color="#fff" />
              </View>
              <Text style={styles.headerTitle}>Pay Mode Modification</Text>
              <View style={styles.terminalBadge}>
                <Text style={styles.terminalBadgeText}>COUNTER: {terminalCode}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <Feather name="x" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Admin Password Prompt Overlay */}
          {showAdminPasswordPrompt && (
            <View style={styles.adminPromptOverlay}>
              <View style={styles.adminPromptCard}>
                <View style={styles.adminIconWrapper}>
                  <Feather name="shield" size={32} color="#7c1a22" />
                </View>
                <Text style={styles.adminPromptTitle}>Admin Authorization</Text>
                <Text style={styles.adminPromptSubtitle}>
                  Cashier does not have Paymode Change permission (Shft + PgDn). Enter Admin Password to proceed.
                </Text>

                {authError ? (
                  <View style={styles.errorBanner}>
                    <Feather name="alert-circle" size={14} color="#b91c1c" />
                    <Text style={styles.errorBannerText}>{authError}</Text>
                  </View>
                ) : null}

                <TextInput
                  ref={adminPassInputRef}
                  style={styles.adminPassInput}
                  secureTextEntry
                  placeholder="Enter Admin Password..."
                  placeholderTextColor="#94a3b8"
                  value={adminPasswordInput}
                  onChangeText={setAdminPasswordInput}
                  onSubmitEditing={handleVerifyAdminPassword}
                  returnKeyType="done"
                />

                <View style={styles.adminPromptActions}>
                  <TouchableOpacity
                    style={styles.adminCancelBtn}
                    onPress={onClose}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.adminCancelBtnText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.adminSubmitBtn}
                    onPress={handleVerifyAdminPassword}
                    disabled={checkingAuth}
                    activeOpacity={0.8}
                  >
                    {checkingAuth ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Feather name="unlock" size={15} color="#fff" style={{ marginRight: 6 }} />
                        <Text style={styles.adminSubmitBtnText}>Authorize</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Main Content Body */}
          {isAuthorized && (
            <View style={styles.contentBody}>
              {/* Left Pane: Invoices Grid */}
              <View style={styles.leftPane}>
                <View style={styles.paneHeader}>
                  <Feather name="file-text" size={15} color="#1e293b" />
                  <Text style={styles.paneHeaderText}>Sales Invoices ({invoices.length})</Text>
                </View>

                {loadingInvoices ? (
                  <View style={styles.centered}>
                    <ActivityIndicator size="large" color="#7c1a22" />
                    <Text style={styles.loadingText}>Loading Invoices...</Text>
                  </View>
                ) : (
                  <ScrollView style={styles.invoiceTableScroll}>
                    {/* Table Header */}
                    <View style={styles.invoiceTableHeader}>
                      <Text style={[styles.invCol, { flex: 1.3 }]}>Invoice #</Text>
                      <Text style={[styles.invCol, { flex: 0.8 }]}>Time</Text>
                      <Text style={[styles.invCol, { flex: 1, textAlign: "right" }]}>Net Total</Text>
                      <Text style={[styles.invCol, { flex: 0.6, textAlign: "center" }]}>Lines</Text>
                      <Text style={[styles.invCol, { flex: 1.2 }]}>Pay Mode</Text>
                      <Text style={[styles.invCol, { flex: 0.9, textAlign: "right" }]}>Tender</Text>
                      <Text style={[styles.invCol, { flex: 0.8, textAlign: "right" }]}>Change</Text>
                      <Text style={[styles.invCol, { flex: 0.8 }]}>Cashier</Text>
                    </View>

                    {/* Table Rows */}
                    {invoices.length === 0 ? (
                      <View style={styles.noData}>
                        <Text style={styles.noDataText}>No active invoices found for {terminalCode}</Text>
                      </View>
                    ) : (
                      invoices.map((inv) => {
                        const isSelected = selectedInvoice?.InvoiceNo === inv.InvoiceNo;
                        const timeStr = inv.ModifyDate
                          ? new Date(inv.ModifyDate).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })
                          : "";

                        return (
                          <TouchableOpacity
                            key={inv.InvoiceNo}
                            style={[styles.invoiceTableRow, isSelected && styles.invoiceTableRowSelected]}
                            onPress={() => handleSelectInvoice(inv)}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.invColCell,
                                { flex: 1.3, fontWeight: "700", color: isSelected ? "#fff" : "#1e293b" },
                              ]}
                            >
                              {inv.InvoiceNo}
                            </Text>
                            <Text
                              style={[
                                styles.invColCell,
                                { flex: 0.8, color: isSelected ? "#e2e8f0" : "#64748b" },
                              ]}
                            >
                              {timeStr}
                            </Text>
                            <Text
                              style={[
                                styles.invColCell,
                                {
                                  flex: 1,
                                  textAlign: "right",
                                  fontWeight: "800",
                                  color: isSelected ? "#fff" : "#047857",
                                },
                              ]}
                            >
                              ${Number(inv.NetTotal).toFixed(2)}
                            </Text>
                            <Text
                              style={[
                                styles.invColCell,
                                { flex: 0.6, textAlign: "center", color: isSelected ? "#fff" : "#475569" },
                              ]}
                            >
                              {inv.TotalLines}
                            </Text>
                            <Text
                              style={[
                                styles.invColCell,
                                { flex: 1.2, color: isSelected ? "#fef08a" : "#2563eb", fontWeight: "600" },
                              ]}
                              numberOfLines={1}
                            >
                              {inv.PayMode || "-"}
                            </Text>
                            <Text
                              style={[
                                styles.invColCell,
                                { flex: 0.9, textAlign: "right", color: isSelected ? "#fff" : "#334155" },
                              ]}
                            >
                              ${Number(inv.TenderAmount).toFixed(2)}
                            </Text>
                            <Text
                              style={[
                                styles.invColCell,
                                { flex: 0.8, textAlign: "right", color: isSelected ? "#fff" : "#64748b" },
                              ]}
                            >
                              ${Number(inv.Balance).toFixed(2)}
                            </Text>
                            <Text
                              style={[
                                styles.invColCell,
                                { flex: 0.8, color: isSelected ? "#e2e8f0" : "#64748b" },
                              ]}
                            >
                              {inv.CashierID}
                            </Text>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                )}
              </View>

              {/* Right Pane: Paymode Modification Table */}
              <View style={styles.rightPane}>
                <View style={styles.paneHeader}>
                  <Feather name="dollar-sign" size={15} color="#1e293b" />
                  <Text style={styles.paneHeaderText}>
                    Modify Payment: {selectedInvoice ? selectedInvoice.InvoiceNo : "Select Invoice"}
                  </Text>
                </View>

                {loadingPaymodes ? (
                  <View style={styles.centered}>
                    <ActivityIndicator size="large" color="#7c1a22" />
                    <Text style={styles.loadingText}>Loading Payment Modes...</Text>
                  </View>
                ) : (
                  <ScrollView style={styles.paymodeTableScroll}>
                    {/* Paymode Table Header */}
                    <View style={styles.paymodeTableHeader}>
                      <Text style={[styles.pmCol, { flex: 1.2 }]}>Pay Mode</Text>
                      <Text style={[styles.pmCol, { flex: 1, textAlign: "right" }]}>Old Amount</Text>
                      <Text style={[styles.pmCol, { flex: 1 }]}>Old Slip No</Text>
                      <Text style={[styles.pmCol, { flex: 1.1, textAlign: "right" }]}>New Amount</Text>
                      <Text style={[styles.pmCol, { flex: 1 }]}>New Slip No</Text>
                    </View>

                    {/* Paymode Rows */}
                    {paymodeRows.map((row, idx) => {
                      const isCash = row.PayMode.toUpperCase().trim() === "CASH";

                      return (
                        <View key={row.PayMode} style={styles.paymodeTableRow}>
                          <Text style={[styles.pmColCell, { flex: 1.2, fontWeight: "700" }]}>
                            {row.PayMode}
                          </Text>
                          <Text
                            style={[
                              styles.pmColCell,
                              { flex: 1, textAlign: "right", color: "#64748b" },
                            ]}
                          >
                            ${Number(row.OldAmount).toFixed(2)}
                          </Text>
                          <Text
                            style={[
                              styles.pmColCell,
                              { flex: 1, color: "#64748b" },
                            ]}
                          >
                            {row.OldSlipNo || "-"}
                          </Text>

                          {/* New Amount Input */}
                          <View style={{ flex: 1.1, paddingHorizontal: 4 }}>
                            <TextInput
                              style={styles.gridInput}
                              keyboardType="numeric"
                              placeholder="0.00"
                              placeholderTextColor="#94a3b8"
                              value={row.NewAmount}
                              onChangeText={(val) => {
                                const updated = [...paymodeRows];
                                updated[idx].NewAmount = val;
                                setPaymodeRows(updated);
                              }}
                            />
                          </View>

                          {/* New Slip No Input (Read-only for CASH) */}
                          <View style={{ flex: 1, paddingHorizontal: 4 }}>
                            <TextInput
                              style={[styles.gridInput, isCash && styles.gridInputDisabled]}
                              editable={!isCash}
                              placeholder={isCash ? "N/A" : "Slip No"}
                              placeholderTextColor="#94a3b8"
                              value={row.NewSlipNo}
                              onChangeText={(val) => {
                                const updated = [...paymodeRows];
                                updated[idx].NewSlipNo = val;
                                setPaymodeRows(updated);
                              }}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                )}

                {/* Calculation Summary Box (Matching VB.NET lblTotal, lblPaid, lblBalance) */}
                <View style={styles.summaryBox}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Invoice Total</Text>
                    <Text style={styles.summaryValue}>${invoiceTotal.toFixed(2)}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Paid Amount</Text>
                    <Text
                      style={[
                        styles.summaryValue,
                        { color: isTally ? "#047857" : "#b91c1c" },
                      ]}
                    >
                      ${totalPaid.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Balance</Text>
                    <Text
                      style={[
                        styles.summaryValue,
                        { color: balance === 0 ? "#15803d" : "#ea580c" },
                      ]}
                    >
                      ${balance.toFixed(2)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Footer Controls (Save F4, Clear F6, Close Esc) */}
          <View style={styles.footer}>
            <View style={styles.footerInfo}>
              <Text style={styles.shortcutHint}>
                [F4] Save   |   [F6] Clear   |   [Esc] Cancel
              </Text>
            </View>

            <View style={styles.footerActions}>
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={handleClear}
                activeOpacity={0.8}
              >
                <Feather name="rotate-ccw" size={15} color="#475569" style={{ marginRight: 6 }} />
                <Text style={styles.clearBtnText}>Clear (F6)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, !isTally && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={!isTally || saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Feather name="check" size={16} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.saveBtnText}>Save (F4)</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Feather name="x" size={15} color="#1e293b" style={{ marginRight: 6 }} />
                <Text style={styles.cancelBtnText}>Exit (Esc)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContainer: {
    width: "95%",
    maxWidth: 1100,
    height: "88%",
    maxHeight: 760,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 25,
    display: "flex",
    flexDirection: "column",
  },
  header: {
    height: 52,
    backgroundColor: "#7c1a22",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  terminalBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 6,
  },
  terminalBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  contentBody: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#f8fafc",
  },
  leftPane: {
    flex: 1.1,
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#ffffff",
  },
  rightPane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#ffffff",
  },
  paneHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  paneHeaderText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1e293b",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  invoiceTableScroll: {
    flex: 1,
  },
  invoiceTableHeader: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
  },
  invCol: {
    fontSize: 11,
    fontWeight: "800",
    color: "#334155",
    textTransform: "uppercase",
  },
  invoiceTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  invoiceTableRowSelected: {
    backgroundColor: "#7c1a22",
  },
  invColCell: {
    fontSize: 12,
    color: "#334155",
  },
  paymodeTableScroll: {
    flex: 1,
  },
  paymodeTableHeader: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
  },
  pmCol: {
    fontSize: 11,
    fontWeight: "800",
    color: "#334155",
    textTransform: "uppercase",
  },
  paymodeTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  pmColCell: {
    fontSize: 12,
    color: "#1e293b",
  },
  gridInput: {
    height: 32,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
    backgroundColor: "#ffffff",
    textAlign: "right",
  },
  gridInputDisabled: {
    backgroundColor: "#f1f5f9",
    color: "#94a3b8",
  },
  summaryBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  summaryItem: {
    alignItems: "center",
    flex: 1,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 2,
  },
  footer: {
    height: 58,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  footerInfo: {
    flex: 1,
  },
  shortcutHint: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  clearBtnText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#7c1a22",
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
  },
  saveBtnDisabled: {
    backgroundColor: "#94a3b8",
    opacity: 0.6,
  },
  saveBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  cancelBtnText: {
    color: "#1e293b",
    fontSize: 13,
    fontWeight: "700",
  },
  adminPromptOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    zIndex: 999,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  adminPromptCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 20,
  },
  adminIconWrapper: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fef2f2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  adminPromptTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 6,
  },
  adminPromptSubtitle: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 16,
  },
  adminPassInput: {
    width: "100%",
    height: 42,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 14,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
    marginBottom: 14,
  },
  adminPromptActions: {
    flexDirection: "row",
    width: "100%",
    gap: 10,
  },
  adminCancelBtn: {
    flex: 1,
    height: 40,
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  adminCancelBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  adminSubmitBtn: {
    flex: 1.2,
    height: 40,
    backgroundColor: "#7c1a22",
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  adminSubmitBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fee2e2",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginBottom: 12,
    width: "100%",
    gap: 6,
  },
  errorBannerText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#b91c1c",
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  loadingText: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 10,
    fontWeight: "600",
  },
  noData: {
    padding: 30,
    alignItems: "center",
  },
  noDataText: {
    fontSize: 13,
    color: "#94a3b8",
    fontStyle: "italic",
  },
});
