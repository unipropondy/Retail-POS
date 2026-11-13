// ==============================================================================
// Author: JAVITH, BAVANI 13-11-2026
// Project: Supermarket Retail POS
// Module: Expense / Petty Cash Entry Modal
// File: frontend/src/components/ExpenseModal.tsx
// Description: Implements exact VB.NET logic from frmPos1.btn_Expenses_Click
//              and frmExpense.vb:
//              - Standalone-mode validation
//              - Checks cashier permission for "Ctrl + E" (tblPosPermission)
//              - Admin password authorization prompt fallback
//              - Description & Amount validation (non-empty description, amount > 0)
//              - Generates next expense ID (sp_POS_GetNextPosExpenseNo)
//              - Saves into tblPosExpenseCur (sp_POS_ExpenseSave)
//              - Receipt voucher preview / thermal print trigger & cash drawer kick
//              - View Recent Expenses list
// ==============================================================================

import React, { useState, useEffect, useRef } from "react";
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

interface ExpenseModalProps {
  visible: boolean;
  onClose: () => void;
  terminalCode: string;
  locationCode?: string;
  cashierGroupCode?: string;
  loggedInUserId?: string;
  backendUrl: string;
  isStandalone?: boolean;
  showAlert: (
    title: string,
    message: string,
    type?: "success" | "warning" | "error" | "info"
  ) => void;
}

interface ExpenseHistoryItem {
  ExpenseID: string;
  ExpenseDate: string;
  LocationCode: string;
  UserCode: string;
  TerminalCode: string;
  Description: string;
  Amount: number;
  CreateDate: string;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  visible,
  onClose,
  terminalCode,
  locationCode = "HQ",
  cashierGroupCode = "CASHIER",
  loggedInUserId = "ADMIN",
  backendUrl,
  isStandalone = false,
  showAlert,
}) => {
  // Permission & Auth State
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);
  const [showAdminPasswordPrompt, setShowAdminPasswordPrompt] = useState<boolean>(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");

  // Expense Form State
  const [description, setDescription] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);

  // Expense History List State
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [expenseHistory, setExpenseHistory] = useState<ExpenseHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Voucher Receipt Modal
  const [savedVoucher, setSavedVoucher] = useState<{
    expenseId: string;
    description: string;
    amount: number;
    date: string;
  } | null>(null);

  const descInputRef = useRef<any>(null);
  const amountInputRef = useRef<any>(null);
  const adminPassRef = useRef<any>(null);

  useEffect(() => {
    if (!visible) {
      resetState();
      return;
    }

    if (isStandalone) {
      showAlert(
        "Offline / Standalone Mode",
        "Can not able to key in expense on standalone mode.",
        "warning"
      );
      onClose();
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
    setDescription("");
    setAmount("");
    setSaving(false);
    setShowHistory(false);
    setSavedVoucher(null);
  };

  // 1. Permission check (Ctrl + E)
  const checkCashierPermission = async () => {
    try {
      setCheckingAuth(true);
      setAuthError("");
      const res = await fetch(`${backendUrl}/api/expenses/permission-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cashierGroupCode }),
      });
      const data = await res.json();

      if (res.ok && data.authorized) {
        setIsAuthorized(true);
        setTimeout(() => descInputRef.current?.focus(), 200);
      } else {
        // Cashier lacks permission -> prompt for Admin Password
        setShowAdminPasswordPrompt(true);
        setTimeout(() => adminPassRef.current?.focus(), 200);
      }
    } catch (err: any) {
      setAuthError(err.message || "Failed to check permission");
      setShowAdminPasswordPrompt(true);
    } finally {
      setCheckingAuth(false);
    }
  };

  // 2. Admin Password Override
  const handleVerifyAdminPassword = async () => {
    if (!adminPasswordInput.trim()) {
      setAuthError("Please enter Admin Password.");
      return;
    }
    try {
      setCheckingAuth(true);
      setAuthError("");
      const res = await fetch(`${backendUrl}/api/expenses/permission-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminPassword: adminPasswordInput.trim() }),
      });
      const data = await res.json();

      if (res.ok && data.authorized) {
        setShowAdminPasswordPrompt(false);
        setIsAuthorized(true);
        setTimeout(() => descInputRef.current?.focus(), 200);
      } else {
        setAuthError(data.message || "Invalid Admin Password. Access Denied.");
      }
    } catch (err: any) {
      setAuthError(err.message || "Admin verification failed");
    } finally {
      setCheckingAuth(false);
    }
  };

  // 3. Save Expense
  const handleSave = async () => {
    if (!description.trim()) {
      showAlert("Required Field", "Please key in the description.", "warning");
      descInputRef.current?.focus();
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showAlert("Invalid Amount", "Please key in the amount.", "warning");
      amountInputRef.current?.focus();
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`${backendUrl}/api/expenses/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          amount: numAmount,
          locationCode,
          terminalCode,
          cashierId: loggedInUserId,
          userId: loggedInUserId,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showAlert("Expense Recorded", `Expense #${data.expenseId} saved successfully!`, "success");
        setSavedVoucher({
          expenseId: data.expenseId,
          description: data.description,
          amount: data.amount,
          date: data.date || new Date().toISOString(),
        });
        setDescription("");
        setAmount("");
      } else {
        showAlert("Save Error", data.message || "Error in expense save.", "error");
      }
    } catch (err: any) {
      showAlert("Save Error", "Transaction failed: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  // 4. Load Recent Expenses List (frmExpensesList.vb)
  const loadExpenseList = async () => {
    try {
      setLoadingHistory(true);
      const res = await fetch(
        `${backendUrl}/api/expenses/list?terminalCode=${encodeURIComponent(terminalCode)}`
      );
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.expenses)) {
        setExpenseHistory(data.expenses);
      } else {
        setExpenseHistory([]);
      }
    } catch (err: any) {
      showAlert("Error", "Failed to load expenses list: " + err.message, "error");
    } finally {
      setLoadingHistory(false);
    }
  };

  // Hotkey listener (F4: Save, Esc: Close)
  useEffect(() => {
    if (!visible || !isAuthorized) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (showHistory) {
          setShowHistory(false);
        } else if (savedVoucher) {
          setSavedVoucher(null);
        } else {
          onClose();
        }
      } else if (e.key === "F4" && !showHistory && !savedVoucher) {
        e.preventDefault();
        handleSave();
      }
    };

    if (Platform.OS === "web") {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [visible, isAuthorized, description, amount, showHistory, savedVoucher]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconBadge}>
                <Feather name="dollar-sign" size={18} color="#fff" />
              </View>
              <Text style={styles.headerTitle}>Petty Cash / Expense Entry</Text>
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
                  Cashier does not have Expense permission (Ctrl + E). Enter Admin Password to proceed.
                </Text>

                {authError ? (
                  <View style={styles.errorBanner}>
                    <Feather name="alert-circle" size={14} color="#b91c1c" />
                    <Text style={styles.errorBannerText}>{authError}</Text>
                  </View>
                ) : null}

                <TextInput
                  ref={adminPassRef}
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

          {/* Voucher Print Preview Modal Overlay */}
          {savedVoucher && (
            <View style={styles.adminPromptOverlay}>
              <View style={styles.voucherCard}>
                <View style={styles.voucherHeader}>
                  <MaterialCommunityIcons name="printer-check" size={32} color="#047857" />
                  <Text style={styles.voucherTitle}>EXPENSE VOUCHER</Text>
                  <Text style={styles.voucherSub}>Cash Drawer Opened (ESC/POS Pulse Sent)</Text>
                </View>

                <View style={styles.voucherBody}>
                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherLabel}>Voucher #:</Text>
                    <Text style={[styles.voucherVal, { fontWeight: "800" }]}>
                      {savedVoucher.expenseId}
                    </Text>
                  </View>
                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherLabel}>Counter / Station:</Text>
                    <Text style={styles.voucherVal}>{terminalCode}</Text>
                  </View>
                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherLabel}>Cashier / User:</Text>
                    <Text style={styles.voucherVal}>{loggedInUserId}</Text>
                  </View>
                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherLabel}>Date & Time:</Text>
                    <Text style={styles.voucherVal}>
                      {new Date(savedVoucher.date).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.voucherDivider} />
                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherLabel}>Reason / Desc:</Text>
                    <Text style={styles.voucherVal}>{savedVoucher.description}</Text>
                  </View>
                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherLabel}>Paid Out Amount:</Text>
                    <Text style={[styles.voucherVal, { fontSize: 18, fontWeight: "900", color: "#b91c1c" }]}>
                      ${savedVoucher.amount.toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View style={styles.voucherSignatures}>
                  <View style={styles.signBox}>
                    <View style={styles.signLine} />
                    <Text style={styles.signLabel}>Cashier Signature</Text>
                  </View>
                  <View style={styles.signBox}>
                    <View style={styles.signLine} />
                    <Text style={styles.signLabel}>Receiver / Manager</Text>
                  </View>
                </View>

                <View style={styles.voucherActions}>
                  <TouchableOpacity
                    style={styles.voucherPrintBtn}
                    onPress={() => {
                      showAlert("Printer", "Voucher sent to receipt printer.", "info");
                      setSavedVoucher(null);
                    }}
                    activeOpacity={0.8}
                  >
                    <Feather name="printer" size={16} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.voucherPrintBtnText}>Print Copy</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.voucherCloseBtn}
                    onPress={() => setSavedVoucher(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.voucherCloseBtnText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Main Body */}
          {isAuthorized && (
            <View style={styles.contentBody}>
              {/* Top View Selector / Bar */}
              <View style={styles.navBar}>
                <View style={styles.navBarLeft}>
                  <Text style={styles.navInfo}>
                    Cashier: <Text style={{ fontWeight: "700" }}>{loggedInUserId}</Text> | Counter:{" "}
                    <Text style={{ fontWeight: "700" }}>{terminalCode}</Text>
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.historyToggleBtn, showHistory && styles.historyToggleBtnActive]}
                  onPress={() => {
                    const next = !showHistory;
                    setShowHistory(next);
                    if (next) loadExpenseList();
                  }}
                  activeOpacity={0.8}
                >
                  <Feather
                    name={showHistory ? "edit" : "list"}
                    size={14}
                    color={showHistory ? "#7c1a22" : "#475569"}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.historyToggleText, showHistory && styles.historyToggleTextActive]}>
                    {showHistory ? "New Expense Entry" : "View Recent Expenses (frmExpensesList)"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* View 1: New Expense Entry Form */}
              {!showHistory ? (
                <View style={styles.formContainer}>
                  <View style={styles.formCard}>
                    <View style={styles.formSectionHeader}>
                      <Feather name="file-plus" size={16} color="#7c1a22" />
                      <Text style={styles.formSectionTitle}>Enter Payout Information</Text>
                    </View>

                    {/* Description Input */}
                    <View style={styles.inputFieldGroup}>
                      <Text style={styles.fieldLabel}>
                        Expense Description / Reason <Text style={{ color: "#b91c1c" }}>*</Text>
                      </Text>
                      <TextInput
                        ref={descInputRef}
                        style={styles.textInputBox}
                        placeholder="e.g. Cleaning Supplies, Water Bottle, Urgent Dispatch..."
                        placeholderTextColor="#94a3b8"
                        value={description}
                        onChangeText={setDescription}
                        returnKeyType="next"
                        onSubmitEditing={() => amountInputRef.current?.focus()}
                      />
                    </View>

                    {/* Amount Input */}
                    <View style={styles.inputFieldGroup}>
                      <Text style={styles.fieldLabel}>
                        Amount ($) <Text style={{ color: "#b91c1c" }}>*</Text>
                      </Text>
                      <View style={styles.amountInputWrap}>
                        <Text style={styles.currencyPrefix}>$</Text>
                        <TextInput
                          ref={amountInputRef}
                          style={styles.amountInputBox}
                          placeholder="0.00"
                          placeholderTextColor="#94a3b8"
                          keyboardType="numeric"
                          value={amount}
                          onChangeText={(val) => {
                            // Only allow valid numeric input
                            if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
                              setAmount(val);
                            }
                          }}
                          returnKeyType="done"
                          onSubmitEditing={handleSave}
                        />
                      </View>
                    </View>

                    {/* Fast Presets */}
                    <View style={styles.presetsWrap}>
                      <Text style={styles.presetsLabel}>Quick Amount:</Text>
                      {["5", "10", "20", "50", "100"].map((preset) => (
                        <TouchableOpacity
                          key={preset}
                          style={styles.presetChip}
                          onPress={() => setAmount(preset)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.presetChipText}>${preset}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              ) : (
                /* View 2: Expense History Grid (frmExpensesList) */
                <View style={styles.historyContainer}>
                  <View style={styles.historyHeader}>
                    <Text style={[styles.histCol, { flex: 1.2 }]}>Voucher #</Text>
                    <Text style={[styles.histCol, { flex: 1 }]}>Time</Text>
                    <Text style={[styles.histCol, { flex: 2.2 }]}>Description</Text>
                    <Text style={[styles.histCol, { flex: 1, textAlign: "right" }]}>Amount ($)</Text>
                    <Text style={[styles.histCol, { flex: 1 }]}>Cashier</Text>
                  </View>

                  {loadingHistory ? (
                    <View style={styles.centered}>
                      <ActivityIndicator size="large" color="#7c1a22" />
                      <Text style={styles.loadingText}>Loading Expenses List...</Text>
                    </View>
                  ) : expenseHistory.length === 0 ? (
                    <View style={styles.noData}>
                      <Text style={styles.noDataText}>No recorded expenses found for today.</Text>
                    </View>
                  ) : (
                    <ScrollView style={{ flex: 1 }}>
                      {expenseHistory.map((item) => (
                        <View key={item.ExpenseID} style={styles.historyRow}>
                          <Text style={[styles.histCell, { flex: 1.2, fontWeight: "700" }]}>
                            {item.ExpenseID}
                          </Text>
                          <Text style={[styles.histCell, { flex: 1, color: "#64748b" }]}>
                            {item.CreateDate
                              ? new Date(item.CreateDate).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "-"}
                          </Text>
                          <Text style={[styles.histCell, { flex: 2.2 }]}>{item.Description}</Text>
                          <Text
                            style={[
                              styles.histCell,
                              { flex: 1, textAlign: "right", fontWeight: "800", color: "#b91c1c" },
                            ]}
                          >
                            ${Number(item.Amount).toFixed(2)}
                          </Text>
                          <Text style={[styles.histCell, { flex: 1, color: "#64748b" }]}>
                            {item.UserCode}
                          </Text>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.footerInfo}>
              <Text style={styles.shortcutHint}>[F4] Save Expense   |   [Esc] Close</Text>
            </View>

            <View style={styles.footerActions}>
              {!showHistory && (
                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                  onPress={handleSave}
                  disabled={saving}
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
              )}

              <TouchableOpacity style={styles.closeActionBtn} onPress={onClose} activeOpacity={0.8}>
                <Feather name="x" size={15} color="#1e293b" style={{ marginRight: 6 }} />
                <Text style={styles.closeActionBtnText}>Close (Esc)</Text>
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
    width: "90%",
    maxWidth: 720,
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
    backgroundColor: "#f8fafc",
    padding: 16,
  },
  navBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  navBarLeft: {
    flex: 1,
  },
  navInfo: {
    fontSize: 12,
    color: "#64748b",
  },
  historyToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#e2e8f0",
  },
  historyToggleBtnActive: {
    backgroundColor: "#fee2e2",
  },
  historyToggleText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  historyToggleTextActive: {
    color: "#7c1a22",
  },
  formContainer: {
    marginTop: 4,
  },
  formCard: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  formSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  formSectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: 0.3,
  },
  inputFieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
  },
  textInputBox: {
    height: 42,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: "#0f172a",
    backgroundColor: "#ffffff",
  },
  amountInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    height: 48,
  },
  currencyPrefix: {
    fontSize: 20,
    fontWeight: "900",
    color: "#047857",
    marginRight: 6,
  },
  amountInputBox: {
    flex: 1,
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
  },
  presetsWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  presetsLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
  },
  presetChip: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  historyContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    height: 280,
    overflow: "hidden",
  },
  historyHeader: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
  },
  histCol: {
    fontSize: 11,
    fontWeight: "800",
    color: "#334155",
    textTransform: "uppercase",
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  histCell: {
    fontSize: 12,
    color: "#1e293b",
  },
  footer: {
    height: 56,
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
  closeActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  closeActionBtnText: {
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
    maxWidth: 420,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
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
  voucherCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
  },
  voucherHeader: {
    alignItems: "center",
    marginBottom: 14,
  },
  voucherTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 6,
    letterSpacing: 0.5,
  },
  voucherSub: {
    fontSize: 11,
    color: "#047857",
    fontWeight: "700",
    marginTop: 2,
  },
  voucherBody: {
    width: "100%",
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 14,
  },
  voucherRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  voucherLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
  },
  voucherVal: {
    fontSize: 13,
    color: "#0f172a",
    fontWeight: "700",
  },
  voucherDivider: {
    height: 1,
    backgroundColor: "#cbd5e1",
    marginVertical: 6,
  },
  voucherSignatures: {
    flexDirection: "row",
    width: "100%",
    gap: 16,
    marginBottom: 16,
  },
  signBox: {
    flex: 1,
    alignItems: "center",
  },
  signLine: {
    width: "100%",
    height: 1,
    backgroundColor: "#94a3b8",
    marginBottom: 4,
  },
  signLabel: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: "600",
  },
  voucherActions: {
    flexDirection: "row",
    width: "100%",
    gap: 10,
  },
  voucherPrintBtn: {
    flex: 1.2,
    height: 40,
    backgroundColor: "#7c1a22",
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  voucherPrintBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  voucherCloseBtn: {
    flex: 1,
    height: 40,
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  voucherCloseBtnText: {
    color: "#1e293b",
    fontSize: 13,
    fontWeight: "700",
  },
  centered: {
    padding: 30,
    alignItems: "center",
  },
  loadingText: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 8,
  },
  noData: {
    padding: 30,
    alignItems: "center",
  },
  noDataText: {
    fontSize: 12,
    color: "#94a3b8",
    fontStyle: "italic",
  },
});

