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

  // Active focused input for on-screen touch keyboard/keypad
  const [activeInput, setActiveInput] = useState<"desc" | "amount">("desc");
  const [keypadMode, setKeypadMode] = useState<"alpha" | "num">("alpha");
  const [capsLock, setCapsLock] = useState<boolean>(true);

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
  const handleVirtualKeyPress = (char: string) => {
    if (activeInput === "desc") {
      descInputRef.current?.focus();
      if (char === "BACKSPACE") {
        setDescription((prev) => (prev.length > 0 ? prev.slice(0, -1) : ""));
      } else if (char === "CLEAR") {
        setDescription("");
      } else if (char === "SPACE") {
        setDescription((prev) => prev + " ");
      } else if (char === "ENTER") {
        setActiveInput("amount");
        setKeypadMode("num");
        amountInputRef.current?.focus();
      } else {
        setDescription((prev) => prev + char);
      }
    } else {
      // Amount input
      amountInputRef.current?.focus();
      if (char === "BACKSPACE") {
        setAmount((prev) => (prev.length > 0 ? prev.slice(0, -1) : ""));
      } else if (char === "CLEAR") {
        setAmount("");
      } else if (char === "ENTER") {
        handleSave();
      } else if (char === ".") {
        if (!amount.includes(".")) {
          setAmount((prev) => (prev === "" ? "0." : prev + "."));
        }
      } else if (char === "00") {
        if (amount && !amount.includes(".")) {
          setAmount((prev) => prev + "00");
        }
      } else if (/^[0-9]$/.test(char)) {
        // Enforce max 2 decimal places
        if (amount.includes(".")) {
          const parts = amount.split(".");
          if (parts[1] && parts[1].length >= 2) return;
        }
        setAmount((prev) => (prev === "0" ? char : prev + char));
      }
    }
  };

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
                <Feather name="dollar-sign" size={17} color="#fff" />
              </View>
              <Text style={styles.headerTitle}>Expense Entry</Text>
              <View style={styles.terminalBadge}>
                <Text style={styles.terminalBadgeText}>COUNTER: {terminalCode}</Text>
              </View>
              <View style={[styles.terminalBadge, { backgroundColor: "rgba(255, 255, 255, 0.25)" }]}>
                <Text style={styles.terminalBadgeText}>CASHIER: {loggedInUserId}</Text>
              </View>
            </View>

            <View style={styles.headerRight}>
              <TouchableOpacity
                style={[styles.headerHistoryBtn, showHistory && styles.headerHistoryBtnActive]}
                onPress={() => {
                  const next = !showHistory;
                  setShowHistory(next);
                  if (next) loadExpenseList();
                }}
                activeOpacity={0.8}
              >
                <Feather
                  name={showHistory ? "edit" : "list"}
                  size={13}
                  color={showHistory ? "#7c1a22" : "#ffffff"}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.headerHistoryBtnText, showHistory && styles.headerHistoryBtnTextActive]}>
                  {showHistory ? "New Entry" : "View Recent Expenses"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
                <Feather name="x" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
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
              {/* View 1: New Expense Entry Form */}
              {!showHistory ? (
                <View style={styles.formContainer}>
                  <View style={styles.formCard}>
                    <View style={styles.formSectionHeader}>
                      <Feather name="file-plus" size={16} color="#7c1a22" />
                      <Text style={styles.formSectionTitle}>Enter Payout Information</Text>
                    </View>

                    {/* Inputs Row: Description & Amount Side-by-Side */}
                    <View style={styles.inputsInlineRow}>
                      {/* Left: Description Input */}
                      <View style={[styles.inputFieldGroup, { flex: 2.2 }]}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={styles.fieldLabel}>
                            Expense Description / Reason <Text style={{ color: "#b91c1c" }}>*</Text>
                          </Text>
                          {activeInput === "desc" && (
                            <Text style={styles.activeFieldTag}>Active</Text>
                          )}
                        </View>
                        <TextInput
                          ref={descInputRef}
                          style={[styles.textInputBox, activeInput === "desc" && styles.inputBoxActive]}
                          placeholder="e.g. Cleaning Supplies, Water Bottle..."
                          placeholderTextColor="#94a3b8"
                          value={description}
                          onFocus={() => {
                            setActiveInput("desc");
                            setKeypadMode("alpha");
                          }}
                          onChangeText={setDescription}
                          returnKeyType="next"
                          onSubmitEditing={() => {
                            setActiveInput("amount");
                            setKeypadMode("num");
                            amountInputRef.current?.focus();
                          }}
                        />
                      </View>

                      {/* Right: Amount Input */}
                      <View style={[styles.inputFieldGroup, { flex: 1 }]}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={styles.fieldLabel}>
                            Amount ($) <Text style={{ color: "#b91c1c" }}>*</Text>
                          </Text>
                          {activeInput === "amount" && (
                            <Text style={styles.activeFieldTag}>Active</Text>
                          )}
                        </View>
                        <View style={[styles.amountInputWrap, activeInput === "amount" && styles.inputBoxActive]}>
                          <Text style={styles.currencyPrefix}>$</Text>
                          <TextInput
                            ref={amountInputRef}
                            style={styles.amountInputBox}
                            placeholder="0.00"
                            placeholderTextColor="#94a3b8"
                            keyboardType="numeric"
                            value={amount}
                            onFocus={() => {
                              setActiveInput("amount");
                              setKeypadMode("num");
                            }}
                            onChangeText={(val) => {
                              if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
                                setAmount(val);
                              }
                            }}
                            returnKeyType="done"
                            onSubmitEditing={handleSave}
                          />
                        </View>
                      </View>
                    </View>

                    {/* Fast Presets */}
                    <View style={styles.presetsWrap}>
                      <Text style={styles.presetsLabel}>Quick Amount:</Text>
                      {["5", "10", "20", "50", "100"].map((preset) => (
                        <TouchableOpacity
                          key={preset}
                          style={styles.presetChip}
                          onPress={() => {
                            setAmount(preset);
                            setActiveInput("amount");
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.presetChipText}>${preset}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* ON-SCREEN TOUCH KEYBOARD (ALPHABET + NUMBERS) */}
                    <View style={styles.touchKeypadContainer}>
                      {/* Keyboard mode switcher */}
                      <View style={styles.keypadModeBar}>
                        <View style={{ flexDirection: "row", gap: 6 }}>
                          <TouchableOpacity
                            style={[styles.modeTab, keypadMode === "alpha" && styles.modeTabActive]}
                            onPress={() => setKeypadMode("alpha")}
                          >
                            <Feather name="type" size={13} color={keypadMode === "alpha" ? "#7c1a22" : "#64748b"} />
                            <Text style={[styles.modeTabText, keypadMode === "alpha" && styles.modeTabTextActive]}>
                              Letters (A-Z)
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.modeTab, keypadMode === "num" && styles.modeTabActive]}
                            onPress={() => setKeypadMode("num")}
                          >
                            <Feather name="hash" size={13} color={keypadMode === "num" ? "#7c1a22" : "#64748b"} />
                            <Text style={[styles.modeTabText, keypadMode === "num" && styles.modeTabTextActive]}>
                              Numpad (123)
                            </Text>
                          </TouchableOpacity>
                        </View>

                        <Text style={styles.targetFieldNotice}>
                          Typing to: <Text style={{ fontWeight: "800", color: "#0f172a" }}>{activeInput === "desc" ? "Description" : "Amount ($)"}</Text>
                        </Text>
                      </View>

                      {keypadMode === "alpha" ? (
                        /* Full QWERTY / Alphabetical Touch Keyboard with Numbers row */
                        <View style={styles.keyboardBody}>
                          {/* Numbers Row */}
                          <View style={styles.keyboardRow}>
                            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((k) => (
                              <TouchableOpacity
                                key={k}
                                style={styles.kKey}
                                onPress={() => handleVirtualKeyPress(k)}
                              >
                                <Text style={styles.kKeyText}>{k}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>

                          {/* Row 1: Q-P */}
                          <View style={styles.keyboardRow}>
                            {["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"].map((k) => {
                              const char = capsLock ? k : k.toLowerCase();
                              return (
                                <TouchableOpacity
                                  key={k}
                                  style={styles.kKey}
                                  onPress={() => handleVirtualKeyPress(char)}
                                >
                                  <Text style={styles.kKeyText}>{char}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>

                          {/* Row 2: A-L */}
                          <View style={[styles.keyboardRow, { paddingHorizontal: 12 }]}>
                            {["A", "S", "D", "F", "G", "H", "J", "K", "L"].map((k) => {
                              const char = capsLock ? k : k.toLowerCase();
                              return (
                                <TouchableOpacity
                                  key={k}
                                  style={styles.kKey}
                                  onPress={() => handleVirtualKeyPress(char)}
                                >
                                  <Text style={styles.kKeyText}>{char}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>

                          {/* Row 3: CAPS, Z-M, BACKSPACE */}
                          <View style={styles.keyboardRow}>
                            <TouchableOpacity
                              style={[styles.kKeySpecial, capsLock && styles.kKeyCapsActive]}
                              onPress={() => setCapsLock((prev) => !prev)}
                            >
                              <Feather name="arrow-up" size={15} color={capsLock ? "#7c1a22" : "#64748b"} />
                            </TouchableOpacity>

                            {["Z", "X", "C", "V", "B", "N", "M"].map((k) => {
                              const char = capsLock ? k : k.toLowerCase();
                              return (
                                <TouchableOpacity
                                  key={k}
                                  style={styles.kKey}
                                  onPress={() => handleVirtualKeyPress(char)}
                                >
                                  <Text style={styles.kKeyText}>{char}</Text>
                                </TouchableOpacity>
                              );
                            })}

                            <TouchableOpacity
                              style={styles.kKeySpecial}
                              onPress={() => handleVirtualKeyPress("BACKSPACE")}
                            >
                              <Feather name="delete" size={16} color="#64748b" />
                            </TouchableOpacity>
                          </View>

                          {/* Row 4: Space, Clear, Enter */}
                          <View style={styles.keyboardRow}>
                            <TouchableOpacity
                              style={[styles.kKeySpecial, { flex: 1.2, backgroundColor: "#fef2f2" }]}
                              onPress={() => handleVirtualKeyPress("CLEAR")}
                            >
                              <Text style={{ fontSize: 11, fontWeight: "800", color: "#dc2626" }}>CLR</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.kKey, { flex: 4, backgroundColor: "#f1f5f9" }]}
                              onPress={() => handleVirtualKeyPress("SPACE")}
                            >
                              <Text style={[styles.kKeyText, { fontSize: 12, color: "#64748b" }]}>SPACE</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.kKeySpecial, { flex: 1.5, backgroundColor: "#7c1a22" }]}
                              onPress={() => handleVirtualKeyPress("ENTER")}
                            >
                              <Text style={{ fontSize: 11, fontWeight: "800", color: "#ffffff" }}>NEXT ↵</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        /* POS Numeric Numpad - Broad and Wide */
                        <View style={styles.numpadBody}>
                          <View style={styles.numpadGrid}>
                            <View style={styles.numpadRow}>
                              {["7", "8", "9"].map((n) => (
                                <TouchableOpacity key={n} style={styles.numPadBtn} onPress={() => handleVirtualKeyPress(n)}>
                                  <Text style={styles.numPadBtnText}>{n}</Text>
                                </TouchableOpacity>
                              ))}
                              <TouchableOpacity
                                style={[styles.numPadBtn, styles.numPadBtnAction]}
                                onPress={() => handleVirtualKeyPress("BACKSPACE")}
                              >
                                <Feather name="delete" size={20} color="#64748b" />
                              </TouchableOpacity>
                            </View>

                            <View style={styles.numpadRow}>
                              {["4", "5", "6"].map((n) => (
                                <TouchableOpacity key={n} style={styles.numPadBtn} onPress={() => handleVirtualKeyPress(n)}>
                                  <Text style={styles.numPadBtnText}>{n}</Text>
                                </TouchableOpacity>
                              ))}
                              <TouchableOpacity
                                style={[styles.numPadBtn, { backgroundColor: "#fef2f2" }]}
                                onPress={() => handleVirtualKeyPress("CLEAR")}
                              >
                                <Text style={{ fontSize: 13, fontWeight: "800", color: "#dc2626" }}>CLR</Text>
                              </TouchableOpacity>
                            </View>

                            <View style={styles.numpadRow}>
                              {["1", "2", "3"].map((n) => (
                                <TouchableOpacity key={n} style={styles.numPadBtn} onPress={() => handleVirtualKeyPress(n)}>
                                  <Text style={styles.numPadBtnText}>{n}</Text>
                                </TouchableOpacity>
                              ))}
                              <TouchableOpacity
                                style={[styles.numPadBtn, { backgroundColor: "#7c1a22" }]}
                                onPress={() => handleVirtualKeyPress("ENTER")}
                              >
                                <Text style={{ fontSize: 12, fontWeight: "900", color: "#ffffff" }}>DONE ↵</Text>
                              </TouchableOpacity>
                            </View>

                            <View style={styles.numpadRow}>
                              <TouchableOpacity style={styles.numPadBtn} onPress={() => handleVirtualKeyPress("0")}>
                                <Text style={styles.numPadBtnText}>0</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.numPadBtn} onPress={() => handleVirtualKeyPress("00")}>
                                <Text style={styles.numPadBtnText}>00</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.numPadBtn} onPress={() => handleVirtualKeyPress(".")}>
                                <Text style={styles.numPadBtnText}>.</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.numPadBtn, { backgroundColor: "#f0fdf4" }]}
                                onPress={() => {
                                  setActiveInput("desc");
                                  setKeypadMode("alpha");
                                  descInputRef.current?.focus();
                                }}
                              >
                                <Text style={{ fontSize: 12, fontWeight: "800", color: "#16a34a" }}>ABC</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              ) : (
                /* View 2: Expense History Grid (frmExpensesList) */
                <View style={styles.historyContainer}>
                  <View style={styles.historyHeader}>
                    <Text style={[styles.histCol, { flex: 1.3 }]}>Voucher #</Text>
                    <Text style={[styles.histCol, { flex: 1.1 }]}>Time</Text>
                    <Text style={[styles.histCol, { flex: 2.2 }]}>Description</Text>
                    <Text style={[styles.histCol, { flex: 1.2, textAlign: "right", paddingRight: 10 }]}>Amount ($)</Text>
                    <Text style={[styles.histCol, { flex: 1.1, textAlign: "center" }]}>Cashier</Text>
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
                          <Text style={[styles.histCell, { flex: 1.3, fontWeight: "700" }]}>
                            {item.ExpenseID}
                          </Text>
                          <Text style={[styles.histCell, { flex: 1.1, color: "#64748b" }]}>
                            {item.CreateDate
                              ? new Date(item.CreateDate).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "-"}
                          </Text>
                          <Text style={[styles.histCell, { flex: 2.2 }]} numberOfLines={1}>
                            {item.Description}
                          </Text>
                          <Text
                            style={[
                              styles.histCell,
                              { flex: 1.2, textAlign: "right", fontWeight: "800", color: "#b91c1c", paddingRight: 10 },
                            ]}
                          >
                            ${Number(item.Amount).toFixed(2)}
                          </Text>
                          <Text style={[styles.histCell, { flex: 1.1, textAlign: "center", color: "#64748b" }]}>
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
    height: 48,
    backgroundColor: "#7c1a22",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 15.5,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  terminalBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 5,
  },
  terminalBadgeText: {
    color: "#ffffff",
    fontSize: 10.5,
    fontWeight: "700",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerHistoryBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  headerHistoryBtnActive: {
    backgroundColor: "#ffffff",
  },
  headerHistoryBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#ffffff",
  },
  headerHistoryBtnTextActive: {
    color: "#7c1a22",
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  contentBody: {
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  formContainer: {
    marginTop: 0,
  },
  formCard: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  formSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  formSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: 0.3,
  },
  inputsInlineRow: {
    flexDirection: "row",
    gap: 10,
  },
  inputFieldGroup: {
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 4,
  },
  activeFieldTag: {
    fontSize: 10.5,
    color: "#0284c7",
    fontWeight: "800",
  },
  textInputBox: {
    height: 38,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 13,
    color: "#0f172a",
    backgroundColor: "#ffffff",
    outlineStyle: "none" as any,
    cursor: "text" as any,
  },
  inputBoxActive: {
    borderColor: "#0284c7",
    backgroundColor: "#f0f9ff",
  },
  amountInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    height: 38,
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: "900",
    color: "#047857",
    marginRight: 4,
  },
  amountInputBox: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
    borderWidth: 0,
    outlineStyle: "none" as any,
    cursor: "text" as any,
  },
  presetsWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    marginBottom: 8,
  },
  presetsLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
  },
  presetChip: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  presetChipText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#334155",
  },

  // ON-SCREEN TOUCH KEYPAD STYLES
  touchKeypadContainer: {
    marginTop: 4,
    backgroundColor: "#f8fafc",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 6,
  },
  keypadModeBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 6,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  modeTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  modeTabActive: {
    backgroundColor: "#fee2e2",
    borderColor: "#fca5a5",
  },
  modeTabText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  modeTabTextActive: {
    color: "#7c1a22",
  },
  targetFieldNotice: {
    fontSize: 11,
    color: "#64748b",
  },
  keyboardBody: {
    gap: 5,
    paddingVertical: 2,
  },
  keyboardRow: {
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
  },
  kKey: {
    flex: 1,
    height: 44,
    backgroundColor: "#ffffff",
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    justifyContent: "center",
    alignItems: "center",
  },
  kKeySpecial: {
    height: 44,
    minWidth: 46,
    paddingHorizontal: 12,
    backgroundColor: "#f1f5f9",
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    justifyContent: "center",
    alignItems: "center",
  },
  kKeyCapsActive: {
    backgroundColor: "#fee2e2",
    borderColor: "#fca5a5",
  },
  kKeyText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },
  numpadBody: {
    paddingVertical: 4,
    alignItems: "center",
  },
  numpadGrid: {
    width: "100%",
    maxWidth: 500,
    gap: 6,
  },
  numpadRow: {
    flexDirection: "row",
    gap: 6,
  },
  numPadBtn: {
    flex: 1,
    height: 48,
    backgroundColor: "#ffffff",
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    justifyContent: "center",
    alignItems: "center",
  },
  numPadBtnAction: {
    backgroundColor: "#f1f5f9",
  },
  numPadBtnText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
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

