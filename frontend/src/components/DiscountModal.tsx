// ==============================================================================
// Author: JAVITH, BAVANI 13-11-2026
// Project: Supermarket Retail POS
// Module: Bill-Level Discount Modal (frmDiscount.vb)
// File: frontend/src/components/DiscountModal.tsx
// Description: Implements exact VB.NET logic from frmPos1.subDiscount() and frmDiscount.vb:
//              - Check cashier permission for "F5" in tblPosPermission
//              - Fallback to Admin Password authorization if not permitted
//              - Load active discount reasons (tblMaDiscountReason WHERE isActive = 1)
//              - Bi-directional calculation:
//                  Discount Amount = SubTotal * DiscountPerc / 100
//                  Discount Perc   = (Discount Amount * 100) / SubTotal
//              - Max Discount validation against gsMaxDiscountAllowed (tblMaCompany)
//              - Keyboard shortcuts: F4 (Save), Escape (Cancel), Enter (Next input)
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

interface DiscountReasonItem {
  DiscountCode: string;
  Description: string;
}

interface DiscountModalProps {
  visible: boolean;
  onClose: () => void;
  subTotal: number;
  initialDiscountAmount?: number;
  cashierGroupCode?: string;
  backendUrl: string;
  onSaveDiscount: (discountAmount: number, discountPerc: number, reason: string, reasonCode?: string) => void;
  onCancelDiscount: () => void;
  showAlert: (
    title: string,
    message: string,
    type?: "success" | "warning" | "error" | "info"
  ) => void;
}

export const DiscountModal: React.FC<DiscountModalProps> = ({
  visible,
  onClose,
  subTotal,
  initialDiscountAmount = 0,
  cashierGroupCode = "CASHIER",
  backendUrl,
  onSaveDiscount,
  onCancelDiscount,
  showAlert,
}) => {
  // Permission & Auth state
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);
  const [showAdminPasswordPrompt, setShowAdminPasswordPrompt] = useState<boolean>(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");

  // Config & Limits
  const [maxDiscountAllowed, setMaxDiscountAllowed] = useState<number>(100);
  const [reasons, setReasons] = useState<DiscountReasonItem[]>([]);
  const [selectedReasonCode, setSelectedReasonCode] = useState<string>("");
  const [selectedReasonDesc, setSelectedReasonDesc] = useState<string>("");

  // Input fields
  const [discountPerc, setDiscountPerc] = useState<string>("");
  const [discountAmount, setDiscountAmount] = useState<string>("");
  const [customRemarks, setCustomRemarks] = useState<string>("");

  // Touch Keypad State
  const [activeInput, setActiveInput] = useState<"perc" | "amount" | "remarks">("perc");
  const [keyboardMode, setKeyboardMode] = useState<"num" | "alpha">("num");
  const [showKeypad, setShowKeypad] = useState<boolean>(true);

  const percInputRef = useRef<any>(null);
  const amountInputRef = useRef<any>(null);
  const adminPassRef = useRef<any>(null);

  useEffect(() => {
    if (!visible) {
      resetState();
      return;
    }
    checkCashierPermission();
    fetchConfig();
  }, [visible]);

  const resetState = () => {
    setIsAuthorized(false);
    setCheckingAuth(true);
    setShowAdminPasswordPrompt(false);
    setAdminPasswordInput("");
    setAuthError("");
    setDiscountPerc("");
    setDiscountAmount("");
    setCustomRemarks("");
    setActiveInput("perc");
    setKeyboardMode("num");
    setShowKeypad(true);
    setSelectedReasonCode("");
    setSelectedReasonDesc("");
  };

  // 1. Fetch Company Discount Limits & Reasons
  const fetchConfig = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/discounts/config`);
      const data = await res.json();
      if (res.ok && data.success) {
        setMaxDiscountAllowed(Number(data.maxDiscountAllowed) || 100);
        if (Array.isArray(data.reasons) && data.reasons.length > 0) {
          setReasons(data.reasons);
          setSelectedReasonCode(data.reasons[0].DiscountCode);
          setSelectedReasonDesc(data.reasons[0].Description);
        } else {
          // Default reason when database reasons are empty
          const defaults: DiscountReasonItem[] = [
            { DiscountCode: "GEN", Description: "GENERAL PROMOTION" },
            { DiscountCode: "MGR", Description: "MANAGER COURTESY" },
            { DiscountCode: "DMG", Description: "DAMAGED PACKAGING" },
            { DiscountCode: "EXP", Description: "NEAR EXPIRY DISCOUNT" },
          ];
          setReasons(defaults);
          setSelectedReasonCode(defaults[0].DiscountCode);
          setSelectedReasonDesc(defaults[0].Description);
        }
      }
    } catch (err) {
      console.warn("Could not fetch discount config", err);
    }
  };

  // 2. Permission Check for 'F5'
  const checkCashierPermission = async () => {
    try {
      setCheckingAuth(true);
      setAuthError("");
      const res = await fetch(`${backendUrl}/api/discounts/permission-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cashierGroupCode }),
      });
      const data = await res.json();

      if (res.ok && data.authorized) {
        setIsAuthorized(true);
        initValues();
      } else {
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

  const initValues = () => {
    if (initialDiscountAmount > 0 && subTotal > 0) {
      const initAmt = Number(initialDiscountAmount);
      const initPerc = (initAmt * 100) / subTotal;
      setDiscountAmount(initAmt.toFixed(2));
      setDiscountPerc(initPerc.toFixed(2));
    }
    setTimeout(() => percInputRef.current?.focus(), 200);
  };

  // 3. Admin Password Override
  const handleVerifyAdminPassword = async () => {
    if (!adminPasswordInput.trim()) {
      setAuthError("Please enter Admin Password.");
      return;
    }
    try {
      setCheckingAuth(true);
      setAuthError("");
      const res = await fetch(`${backendUrl}/api/discounts/permission-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminPassword: adminPasswordInput.trim() }),
      });
      const data = await res.json();

      if (res.ok && data.authorized) {
        setShowAdminPasswordPrompt(false);
        setIsAuthorized(true);
        initValues();
      } else {
        setAuthError(data.message || "Invalid Admin Password. Access Denied.");
      }
    } catch (err: any) {
      setAuthError(err.message || "Admin verification failed");
    } finally {
      setCheckingAuth(false);
    }
  };

  // 4. Percentage Blur / Calculation
  // VB.NET: txtDiscountAmount.Text = Format((Val(frmPos1.lbl_SubTotal.Text) * Val(txtDiscountPerc.Text)) / 100, "#0.00")
  const handlePercBlur = () => {
    const p = parseFloat(discountPerc);
    if (isNaN(p) || p <= 0) {
      setDiscountPerc("");
      setDiscountAmount("");
      return;
    }

    if (subTotal <= 0) {
      showAlert("Notice", "Subtotal is 0.00. Cannot apply discount.", "warning");
      return;
    }

    const calculatedAmt = (subTotal * p) / 100;
    validateAndSetDiscount(calculatedAmt, p);
  };

  // 5. Amount Blur / Calculation & Max Discount Validation
  // VB.NET:
  //   nTempDisc = Format((Val(frmPos1.lbl_SubTotal.Text) * gsMaxDiscountAllowed) / 100, "#0.00")
  //   If Val(txtDiscountAmount.Text) > nTempDisc Then MsgBox("More Discount cannot allowed !!!...")
  const handleAmountBlur = () => {
    const a = parseFloat(discountAmount);
    if (isNaN(a) || a <= 0) {
      setDiscountAmount("");
      setDiscountPerc("");
      return;
    }

    if (subTotal <= 0) {
      showAlert("Notice", "Subtotal is 0.00. Cannot apply discount.", "warning");
      return;
    }

    const calculatedPerc = (a * 100) / subTotal;
    validateAndSetDiscount(a, calculatedPerc);
  };

  const validateAndSetDiscount = (amt: number, perc: number) => {
    const maxAllowedAmt = (subTotal * maxDiscountAllowed) / 100;

    if (amt > maxAllowedAmt + 0.0001) {
      showAlert(
        "Discount Limit Exceeded",
        `More Discount cannot allowed !!!\nMax Discount Amount : $${maxAllowedAmt.toFixed(2)}\nMax Discount : ${maxDiscountAllowed.toFixed(2)}%`,
        "warning"
      );
      setDiscountAmount("");
      setDiscountPerc("");
      amountInputRef.current?.focus();
      return;
    }

    setDiscountAmount(amt.toFixed(2));
    setDiscountPerc(perc.toFixed(2));
  };

  // 6. Save Discount (F4)
  const handleSave = () => {
    const amt = parseFloat(discountAmount) || 0;
    const perc = parseFloat(discountPerc) || 0;

    if (amt <= 0) {
      showAlert("Notice", "Please key in a valid discount amount or percentage.", "warning");
      return;
    }

    const finalRemarks = customRemarks.trim()
      ? `${selectedReasonDesc ? selectedReasonDesc + " - " : ""}${customRemarks.trim()}`
      : selectedReasonDesc;

    onSaveDiscount(amt, perc, finalRemarks, selectedReasonCode);
    onClose();
  };

  // 7. Cancel Discount (Escape)
  const handleCancel = () => {
    onCancelDiscount();
    onClose();
  };

  // Handle Touch Virtual Keypad Key Press
  const handleKeypadPress = (val: string) => {
    if (activeInput === "perc") {
      let current = discountPerc;
      if (val === "CLR") {
        setDiscountPerc("");
        setDiscountAmount("");
      } else if (val === "DEL") {
        const next = current.slice(0, -1);
        setDiscountPerc(next);
        if (!next) setDiscountAmount("");
        else {
          const p = parseFloat(next);
          if (!isNaN(p)) validateAndSetDiscount((subTotal * p) / 100, p);
        }
      } else if (val === "ENTER") {
        handlePercBlur();
        setActiveInput("amount");
      } else {
        if (val === "." && current.includes(".")) return;
        const next = `${current}${val}`;
        if (/^\d*\.?\d{0,2}$/.test(next)) {
          setDiscountPerc(next);
          const p = parseFloat(next);
          if (!isNaN(p)) {
            const calculatedAmt = (subTotal * p) / 100;
            validateAndSetDiscount(calculatedAmt, p);
          }
        }
      }
    } else if (activeInput === "amount") {
      let current = discountAmount;
      if (val === "CLR") {
        setDiscountAmount("");
        setDiscountPerc("");
      } else if (val === "DEL") {
        const next = current.slice(0, -1);
        setDiscountAmount(next);
        if (!next) setDiscountPerc("");
        else {
          const a = parseFloat(next);
          if (!isNaN(a)) validateAndSetDiscount(a, (a * 100) / subTotal);
        }
      } else if (val === "ENTER") {
        handleAmountBlur();
        setActiveInput("remarks");
        setKeyboardMode("alpha");
      } else {
        if (val === "." && current.includes(".")) return;
        const next = `${current}${val}`;
        if (/^\d*\.?\d{0,2}$/.test(next)) {
          setDiscountAmount(next);
          const a = parseFloat(next);
          if (!isNaN(a) && subTotal > 0) {
            validateAndSetDiscount(a, (a * 100) / subTotal);
          }
        }
      }
    } else if (activeInput === "remarks") {
      if (val === "CLR") {
        setCustomRemarks("");
      } else if (val === "DEL") {
        setCustomRemarks((prev) => prev.slice(0, -1));
      } else if (val === "SPACE") {
        setCustomRemarks((prev) => `${prev} `);
      } else if (val === "ENTER") {
        handleSave();
      } else {
        setCustomRemarks((prev) => `${prev}${val}`);
      }
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    if (!visible || !isAuthorized) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      } else if (e.key === "F4") {
        e.preventDefault();
        handleSave();
      }
    };

    if (Platform.OS === "web") {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [visible, isAuthorized, discountAmount, discountPerc, selectedReasonDesc, selectedReasonCode]);

  if (!visible) return null;

  const currentAmt = parseFloat(discountAmount) || 0;
  const newNetTotal = Math.max(0, subTotal - currentAmt);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconBadge}>
                <Feather name="percent" size={18} color="#fff" />
              </View>
              <Text style={styles.headerTitle}>Bill-Level Discount (F5)</Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {isAuthorized && (
                <TouchableOpacity
                  style={[
                    styles.keypadToggleBtn,
                    showKeypad && styles.keypadToggleBtnActive
                  ]}
                  onPress={() => setShowKeypad(!showKeypad)}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name="dialpad"
                    size={16}
                    color="#ffffff"
                  />
                  <Text style={styles.keypadToggleBtnText}>
                    {showKeypad ? "Hide Keypad" : "Touch Keypad"}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.closeBtn} onPress={handleCancel} activeOpacity={0.7}>
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
                  Cashier does not have Discount permission (F5). Enter Admin Password to proceed.
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
                    onPress={handleCancel}
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

          {/* Content Body */}
          {isAuthorized && (
            <View style={styles.contentBody}>
              {/* Bill Summary Strip */}
              <View style={styles.billSummaryStrip}>
                <View style={styles.billSummaryItem}>
                  <Text style={styles.billSummaryLabel}>Bill SubTotal</Text>
                  <Text style={styles.billSummaryValue}>${subTotal.toFixed(2)}</Text>
                </View>
                <View style={styles.billSummaryItem}>
                  <Text style={styles.billSummaryLabel}>Max Allowed</Text>
                  <Text style={[styles.billSummaryValue, { color: "#2563eb" }]}>
                    {maxDiscountAllowed.toFixed(0)}% (${((subTotal * maxDiscountAllowed) / 100).toFixed(2)})
                  </Text>
                </View>
                <View style={styles.billSummaryItem}>
                  <Text style={styles.billSummaryLabel}>Net Total After Disc</Text>
                  <Text style={[styles.billSummaryValue, { color: "#047857" }]}>
                    ${newNetTotal.toFixed(2)}
                  </Text>
                </View>
              </View>

              {/* Discount Inputs */}
              <View style={styles.inputsGrid}>
                {/* Discount Percentage */}
                <View style={styles.inputCol}>
                  <Text style={styles.fieldLabel}>Discount Percentage (%)</Text>
                  <View style={[styles.inputWrap, activeInput === "perc" && styles.inputWrapActive]}>
                    <TextInput
                      ref={percInputRef}
                      style={styles.textInputBox}
                      placeholder="0.00"
                      placeholderTextColor="#94a3b8"
                      keyboardType="numeric"
                      value={discountPerc}
                      onFocus={() => {
                        setActiveInput("perc");
                        setKeyboardMode("num");
                      }}
                      onChangeText={(val) => {
                        if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
                          setDiscountPerc(val);
                        }
                      }}
                      onBlur={handlePercBlur}
                      returnKeyType="next"
                      onSubmitEditing={() => amountInputRef.current?.focus()}
                    />
                    <Text style={styles.suffixText}>%</Text>
                  </View>
                </View>

                {/* Discount Amount */}
                <View style={styles.inputCol}>
                  <Text style={styles.fieldLabel}>Discount Amount ($)</Text>
                  <View style={[styles.inputWrap, activeInput === "amount" && styles.inputWrapActive]}>
                    <Text style={styles.prefixText}>$</Text>
                    <TextInput
                      ref={amountInputRef}
                      style={styles.textInputBox}
                      placeholder="0.00"
                      placeholderTextColor="#94a3b8"
                      keyboardType="numeric"
                      value={discountAmount}
                      onFocus={() => {
                        setActiveInput("amount");
                        setKeyboardMode("num");
                      }}
                      onChangeText={(val) => {
                        if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
                          setDiscountAmount(val);
                        }
                      }}
                      onBlur={handleAmountBlur}
                      returnKeyType="done"
                      onSubmitEditing={handleSave}
                    />
                  </View>
                </View>
              </View>

              {/* Quick Preset Buttons */}
              <View style={styles.presetsRow}>
                <Text style={styles.presetsLabel}>Quick %:</Text>
                {[5, 10, 15, 20, 25, 50].map((preset) => (
                  <TouchableOpacity
                    key={preset}
                    style={styles.presetChip}
                    onPress={() => {
                      setDiscountPerc(String(preset));
                      const amt = (subTotal * preset) / 100;
                      validateAndSetDiscount(amt, preset);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.presetChipText}>{preset}%</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Discount Reason Selector (cboDiscountRemarks / tblMaDiscountReason) */}
              <View style={styles.reasonsSection}>
                <Text style={styles.fieldLabel}>
                  Discount Reason / Preset (tblMaDiscountReason)
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reasonsScroll}>
                  {reasons.map((r) => {
                    const isSelected = selectedReasonCode === r.DiscountCode;
                    return (
                      <TouchableOpacity
                        key={r.DiscountCode}
                        style={[styles.reasonChip, isSelected && styles.reasonChipSelected]}
                        onPress={() => {
                          setSelectedReasonCode(r.DiscountCode);
                          setSelectedReasonDesc(r.Description);
                        }}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons
                          name={isSelected ? "check-circle" : "circle-outline"}
                          size={15}
                          color={isSelected ? "#ffffff" : "#64748b"}
                          style={{ marginRight: 6 }}
                        />
                        <Text style={[styles.reasonChipText, isSelected && styles.reasonChipTextSelected]}>
                          {r.Description}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Custom Remarks Input Field */}
              <View style={styles.customRemarksSection}>
                <Text style={styles.fieldLabel}>Custom Remarks / Note</Text>
                <View style={[styles.customRemarksInputWrap, activeInput === "remarks" && styles.inputWrapActive]}>
                  <MaterialCommunityIcons name="note-edit-outline" size={18} color="#64748b" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.customRemarksInput}
                    placeholder="Type additional discount remarks here..."
                    placeholderTextColor="#94a3b8"
                    value={customRemarks}
                    onFocus={() => {
                      setActiveInput("remarks");
                      setKeyboardMode("alpha");
                    }}
                    onChangeText={setCustomRemarks}
                  />
                  {customRemarks ? (
                    <TouchableOpacity onPress={() => setCustomRemarks("")}>
                      <MaterialCommunityIcons name="close-circle" size={16} color="#94a3b8" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {/* Integrated Touch Keypad (Number & Alphabetical QWERTY for Remarks) */}
              {showKeypad && (
                <View style={styles.keypadSection}>
                  {/* Keypad Mode Switcher & Target indicator */}
                  <View style={styles.keypadTopBar}>
                    <View style={styles.targetIndicatorWrap}>
                      <Text style={styles.targetIndicatorLabel}>INPUT TARGET: </Text>
                      <Text style={styles.targetIndicatorName}>
                        {activeInput === "perc"
                          ? "Discount %"
                          : activeInput === "amount"
                          ? "Discount $"
                          : "Remarks / Note"}
                      </Text>
                    </View>

                    <View style={styles.modeSwitcherWrap}>
                      <TouchableOpacity
                        style={[styles.modeTab, keyboardMode === "num" && styles.modeTabActive]}
                        onPress={() => setKeyboardMode("num")}
                      >
                        <Text style={[styles.modeTabText, keyboardMode === "num" && styles.modeTabTextActive]}>
                          123 Numeric
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modeTab, keyboardMode === "alpha" && styles.modeTabActive]}
                        onPress={() => setKeyboardMode("alpha")}
                      >
                        <Text style={[styles.modeTabText, keyboardMode === "alpha" && styles.modeTabTextActive]}>
                          ABC Alphabet
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Keyboard View */}
                  {keyboardMode === "num" ? (
                    /* NUMPAD GRID */
                    <View style={styles.numpadContainer}>
                      <View style={styles.numpadGrid}>
                        {["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", "00", "."].map((k) => (
                          <TouchableOpacity
                            key={k}
                            style={styles.numKey}
                            onPress={() => handleKeypadPress(k)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.numKeyText}>{k}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={styles.numpadActionsCol}>
                        <TouchableOpacity
                          style={[styles.numActionKey, { backgroundColor: "#fee2e2", borderColor: "#fca5a5" }]}
                          onPress={() => handleKeypadPress("DEL")}
                          activeOpacity={0.7}
                        >
                          <MaterialCommunityIcons name="backspace-outline" size={20} color="#dc2626" />
                          <Text style={[styles.numActionText, { color: "#dc2626" }]}>DEL</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.numActionKey, { backgroundColor: "#fef2f2", borderColor: "#fecdd3" }]}
                          onPress={() => handleKeypadPress("CLR")}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.numActionText, { color: "#b91c1c" }]}>CLR</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.numActionKey, styles.numEnterKey]}
                          onPress={() => handleKeypadPress("ENTER")}
                          activeOpacity={0.7}
                        >
                          <MaterialCommunityIcons name="keyboard-return" size={20} color="#ffffff" />
                          <Text style={styles.numEnterText}>ENTER</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    /* ALPHABETICAL QWERTY KEYBOARD */
                    <View style={styles.alphaKeyboardContainer}>
                      {/* Row 1 */}
                      <View style={styles.alphaKeyRow}>
                        {["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"].map((ch) => (
                          <TouchableOpacity
                            key={ch}
                            style={styles.alphaKey}
                            onPress={() => handleKeypadPress(ch)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.alphaKeyText}>{ch}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {/* Row 2 */}
                      <View style={styles.alphaKeyRow}>
                        {["A", "S", "D", "F", "G", "H", "J", "K", "L"].map((ch) => (
                          <TouchableOpacity
                            key={ch}
                            style={styles.alphaKey}
                            onPress={() => handleKeypadPress(ch)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.alphaKeyText}>{ch}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {/* Row 3 */}
                      <View style={styles.alphaKeyRow}>
                        <TouchableOpacity
                          style={[styles.alphaKey, styles.alphaActionKey, { backgroundColor: "#fee2e2" }]}
                          onPress={() => handleKeypadPress("CLR")}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.alphaKeyText, { color: "#dc2626", fontSize: 11 }]}>CLR</Text>
                        </TouchableOpacity>

                        {["Z", "X", "C", "V", "B", "N", "M"].map((ch) => (
                          <TouchableOpacity
                            key={ch}
                            style={styles.alphaKey}
                            onPress={() => handleKeypadPress(ch)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.alphaKeyText}>{ch}</Text>
                          </TouchableOpacity>
                        ))}

                        <TouchableOpacity
                          style={[styles.alphaKey, styles.alphaActionKey, { backgroundColor: "#fee2e2" }]}
                          onPress={() => handleKeypadPress("DEL")}
                          activeOpacity={0.7}
                        >
                          <MaterialCommunityIcons name="backspace-outline" size={18} color="#dc2626" />
                        </TouchableOpacity>
                      </View>

                      {/* Row 4: Space & Done */}
                      <View style={styles.alphaKeyRow}>
                        <TouchableOpacity
                          style={[styles.alphaKey, { flex: 2.5, backgroundColor: "#f1f5f9" }]}
                          onPress={() => handleKeypadPress("SPACE")}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.alphaKeyText, { fontSize: 13, fontWeight: "600", color: "#475569" }]}>SPACE</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.alphaKey, { flex: 1.5, backgroundColor: "#7c1a22", borderColor: "#7c1a22" }]}
                          onPress={() => handleKeypadPress("ENTER")}
                          activeOpacity={0.7}
                        >
                          <MaterialCommunityIcons name="keyboard-return" size={16} color="#ffffff" style={{ marginRight: 4 }} />
                          <Text style={[styles.alphaKeyText, { color: "#ffffff", fontSize: 12, fontWeight: "800" }]}>DONE</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.footerInfo}>
              <Text style={styles.shortcutHint}>[F4] Save Discount   |   [Esc] Cancel</Text>
            </View>

            <View style={styles.footerActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleCancel}
                activeOpacity={0.8}
              >
                <Feather name="x" size={15} color="#475569" style={{ marginRight: 6 }} />
                <Text style={styles.cancelBtnText}>Cancel (Esc)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSave}
                activeOpacity={0.8}
              >
                <Feather name="check" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.saveBtnText}>Apply Discount (F4)</Text>
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
    width: "92%",
    maxWidth: 700,
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
    padding: 20,
  },
  billSummaryStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 16,
  },
  billSummaryItem: {
    alignItems: "center",
    flex: 1,
  },
  billSummaryLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  billSummaryValue: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 2,
  },
  inputsGrid: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 14,
  },
  inputCol: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    height: 46,
  },
  inputWrapActive: {
    borderColor: "#7c1a22",
    backgroundColor: "#fffdfd",
    borderWidth: 2,
  },
  keypadToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  keypadToggleBtnActive: {
    backgroundColor: "rgba(255, 255, 255, 0.28)",
    borderColor: "#ffffff",
  },
  keypadToggleBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  customRemarksSection: {
    marginTop: 10,
  },
  customRemarksInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    height: 40,
  },
  customRemarksInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a",
  },

  // Keypad Section
  keypadSection: {
    marginTop: 12,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 10,
  },
  keypadTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  targetIndicatorWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  targetIndicatorLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
  },
  targetIndicatorName: {
    fontSize: 12,
    fontWeight: "800",
    color: "#7c1a22",
  },
  modeSwitcherWrap: {
    flexDirection: "row",
    gap: 6,
  },
  modeTab: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: "#f1f5f9",
  },
  modeTabActive: {
    backgroundColor: "#7c1a22",
  },
  modeTabText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
  },
  modeTabTextActive: {
    color: "#ffffff",
  },

  // Numpad Styles
  numpadContainer: {
    flexDirection: "row",
    gap: 8,
  },
  numpadGrid: {
    flex: 3,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  numKey: {
    width: "31.5%",
    height: 40,
    backgroundColor: "#f8fafc",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    justifyContent: "center",
    alignItems: "center",
  },
  numKeyText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1e293b",
  },
  numpadActionsCol: {
    flex: 1.2,
    gap: 6,
  },
  numActionKey: {
    flex: 1,
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  numActionText: {
    fontSize: 12,
    fontWeight: "800",
  },
  numEnterKey: {
    backgroundColor: "#7c1a22",
    borderColor: "#7c1a22",
    flex: 1.5,
  },
  numEnterText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },

  // Alphabetical Keyboard Styles
  alphaKeyboardContainer: {
    gap: 5,
  },
  alphaKeyRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  alphaKey: {
    flex: 1,
    height: 38,
    backgroundColor: "#ffffff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    justifyContent: "center",
    alignItems: "center",
    elevation: 1,
  },
  alphaActionKey: {
    borderColor: "#fca5a5",
  },
  alphaKeyText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1e293b",
  },
  textInputBox: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  prefixText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#047857",
    marginRight: 6,
  },
  suffixText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#64748b",
    marginLeft: 6,
  },
  presetsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  presetsLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "700",
  },
  presetChip: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
  },
  reasonsSection: {
    marginTop: 4,
  },
  reasonsScroll: {
    flexDirection: "row",
    marginTop: 4,
  },
  reasonChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  reasonChipSelected: {
    backgroundColor: "#7c1a22",
    borderColor: "#7c1a22",
  },
  reasonChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  reasonChipTextSelected: {
    color: "#ffffff",
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
  saveBtnText: {
    color: "#ffffff",
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
});

