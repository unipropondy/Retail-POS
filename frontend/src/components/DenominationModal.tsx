// ==============================================================================
// DenominationModal.tsx
// Module: Cash Drawer Denomination Check (VB.NET FrmDinaminationCheck)
// Modernized with high-speed touch numeric keypad + live paymode breakdown grid
// ==============================================================================

import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export interface DenominationRow {
  currencyValue: number;
  qty: string;
  amount: number;
}

export interface PayModeItem {
  payMode: string;
  amount: number;
}

interface DenominationModalProps {
  visible: boolean;
  onClose: () => void;
  apiUrl: string;
  terminalCode?: string;
  locationCode?: string;
  cashierName?: string;
  shiftNo?: number;
  theme?: any;
}

export default function DenominationModal({
  visible,
  onClose,
  apiUrl,
  terminalCode = "HQPC2",
  locationCode = "HQ",
  cashierName = "UPS",
  shiftNo = 1,
  theme,
}: DenominationModalProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [denominations, setDenominations] = useState<DenominationRow[]>([]);
  const [payModes, setPayModes] = useState<PayModeItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [summary, setSummary] = useState<{
    tillAmount: number;
    totalCashSales: number;
    totalCashExpenses: number;
    expectedCashInDrawer: number;
  }>({
    tillAmount: 0,
    totalCashSales: 0,
    totalCashExpenses: 0,
    expectedCashInDrawer: 0,
  });

  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // References to row text inputs
  const inputRefs = useRef<{ [key: number]: any }>({});

  const primaryCol = theme?.primary || "#881337";

  useEffect(() => {
    if (visible) {
      setMessage(null);
      setSelectedIndex(0);
      loadDenominationData();
    }
  }, [visible]);

  const loadDenominationData = async () => {
    setLoading(true);
    try {
      // 1. Fetch currencies
      const curRes = await fetch(`${apiUrl}/api/denomination/currencies`);
      const curData = await curRes.json();

      // 2. Fetch drawer & paymode summary
      const sumRes = await fetch(
        `${apiUrl}/api/denomination/summary?terminalCode=${encodeURIComponent(
          terminalCode
        )}&locationCode=${encodeURIComponent(locationCode)}&shiftNo=${shiftNo}`
      );
      const sumData = await sumRes.json();

      if (curData.success && Array.isArray(curData.currencies)) {
        const prevMap: { [val: number]: number } = {};
        if (sumData.success && Array.isArray(sumData.previousCounts)) {
          sumData.previousCounts.forEach((p: any) => {
            prevMap[Number(p.CurrencyValue)] = Number(p.Qty) || 0;
          });
        }

        const rows: DenominationRow[] = curData.currencies.map((val: number) => {
          const qtyNum = prevMap[val] || 0;
          return {
            currencyValue: val,
            qty: qtyNum > 0 ? String(qtyNum) : "",
            amount: parseFloat((val * qtyNum).toFixed(2)),
          };
        });

        setDenominations(rows);
      }

      if (sumData.success) {
        setSummary({
          tillAmount: sumData.tillAmount || 0,
          totalCashSales: sumData.totalCashSales || 0,
          totalCashExpenses: sumData.totalCashExpenses || 0,
          expectedCashInDrawer: sumData.expectedCashInDrawer || 0,
        });
        if (Array.isArray(sumData.paymodes)) {
          setPayModes(sumData.paymodes);
        }
      }
    } catch (err: any) {
      console.error("Failed to load denomination data:", err);
      setMessage({ text: "Failed to connect to server: " + err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleQtyChange = (index: number, valStr: string) => {
    const cleanQty = valStr.replace(/[^0-9]/g, "");
    setDenominations((prev) => {
      const updated = [...prev];
      if (!updated[index]) return prev;
      const row = { ...updated[index] };
      row.qty = cleanQty;
      const count = parseInt(cleanQty, 10) || 0;
      row.amount = parseFloat((row.currencyValue * count).toFixed(2));
      updated[index] = row;
      return updated;
    });
  };

  // ----------------------------------------------------------------------------
  // Touch Keypad Handler (acts on the currently selected denomination row)
  // ----------------------------------------------------------------------------
  const handleKeypadPress = (key: string) => {
    if (denominations.length === 0) return;
    const currentRow = denominations[selectedIndex];
    if (!currentRow) return;

    if (key === "ENTER") {
      // Advance to next row
      if (selectedIndex < denominations.length - 1) {
        const nextIdx = selectedIndex + 1;
        setSelectedIndex(nextIdx);
        inputRefs.current[nextIdx]?.focus();
      }
      return;
    }

    if (key === "DEL" || key === "BACKSPACE") {
      const cur = currentRow.qty || "";
      const updatedStr = cur.length > 0 ? cur.slice(0, -1) : "";
      handleQtyChange(selectedIndex, updatedStr);
      return;
    }

    if (key === "CLEAR") {
      handleQtyChange(selectedIndex, "");
      return;
    }

    if (key === "+") {
      const count = (parseInt(currentRow.qty, 10) || 0) + 1;
      handleQtyChange(selectedIndex, String(count));
      return;
    }

    if (key === "-") {
      const count = Math.max(0, (parseInt(currentRow.qty, 10) || 0) - 1);
      handleQtyChange(selectedIndex, count > 0 ? String(count) : "");
      return;
    }

    if (key === "00") {
      const cur = currentRow.qty || "";
      if (cur === "" || cur === "0") return;
      handleQtyChange(selectedIndex, cur + "00");
      return;
    }

    // Normal digit tap
    const cur = currentRow.qty || "";
    // Avoid double leading zero
    if (cur === "0" && key === "0") return;
    const updatedStr = cur === "0" ? key : cur + key;
    handleQtyChange(selectedIndex, updatedStr);
  };

  // Compute total counted physical cash
  const totalCountedCash = denominations.reduce((acc, row) => acc + (row.amount || 0), 0);
  const variance = totalCountedCash - summary.expectedCashInDrawer;

  const handleSaveCount = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        locationCode,
        terminalCode,
        shiftNo,
        cashierId: cashierName,
        denominations: denominations.map((d) => ({
          currencyValue: d.currencyValue,
          qty: parseInt(d.qty, 10) || 0,
          amount: d.amount,
        })),
      };

      const res = await fetch(`${apiUrl}/api/denomination/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({
          text: `Saved successfully! Total: $${totalCountedCash.toFixed(2)} (${
            variance >= 0 ? "+$" + variance.toFixed(2) : "-$" + Math.abs(variance).toFixed(2)
          })`,
          type: "success",
        });
        setTimeout(() => {
          onClose();
        }, 1100);
      } else {
        setMessage({ text: data.message || "Failed to save denomination count.", type: "error" });
      }
    } catch (err: any) {
      console.error("Save error:", err);
      setMessage({ text: "Network error: " + err.message, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {/* TOP HEADER */}
          <View style={[styles.header, { backgroundColor: primaryCol }]}>
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons name="calculator-variant-outline" size={24} color="#ffffff" />
              <View style={{ marginLeft: 10 }}>
                <Text style={styles.headerTitle}>Denomination Check (Cash Count)</Text>
                <Text style={styles.headerSubtitle}>
                  Station: {terminalCode} | Cashier: {cashierName} | Shift: #{shiftNo}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* STATUS / ALERT BANNER */}
          {message && (
            <View
              style={[
                styles.messageBanner,
                message.type === "success" && { backgroundColor: "#dcfce7", borderColor: "#16a34a" },
                message.type === "error" && { backgroundColor: "#fee2e2", borderColor: "#dc2626" },
                message.type === "info" && { backgroundColor: "#e0f2fe", borderColor: "#0284c7" },
              ]}
            >
              <MaterialCommunityIcons
                name={
                  message.type === "success"
                    ? "check-circle"
                    : message.type === "error"
                    ? "alert-circle"
                    : "information"
                }
                size={18}
                color={
                  message.type === "success"
                    ? "#16a34a"
                    : message.type === "error"
                    ? "#dc2626"
                    : "#0284c7"
                }
              />
              <Text
                style={[
                  styles.messageText,
                  message.type === "success" && { color: "#166534" },
                  message.type === "error" && { color: "#991b1b" },
                  message.type === "info" && { color: "#075985" },
                ]}
              >
                {message.text}
              </Text>
            </View>
          )}

          {/* MAIN BODY */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={primaryCol} />
              <Text style={styles.loadingText}>Loading denominations and shift sales...</Text>
            </View>
          ) : (
            <View style={styles.body}>
              {/* ========================================================= */}
              {/* LEFT COLUMN: DENOMINATION TABLE ($ | No Of $ | Amount)     */}
              {/* ========================================================= */}
              <View style={styles.leftTableCard}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.thText, { width: 105 }]}>$ Denom</Text>
                  <Text style={[styles.thText, { width: 95, textAlign: "center" }]}>No Of $</Text>
                  <Text style={[styles.thText, { flex: 1, textAlign: "right" }]}>Amount ($)</Text>
                </View>

                <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                  {denominations.map((row, idx) => {
                    const isSelected = selectedIndex === idx;
                    const isNote = row.currencyValue >= 2;
                    return (
                      <TouchableOpacity
                        key={row.currencyValue}
                        activeOpacity={0.8}
                        onPress={() => {
                          setSelectedIndex(idx);
                          inputRefs.current[idx]?.focus();
                        }}
                        style={[
                          styles.tableRow,
                          idx % 2 === 1 && { backgroundColor: "#f8fafc" },
                          isSelected && styles.tableRowSelected,
                        ]}
                      >
                        {/* Denomination label ($1000.00, $500.00, etc.) */}
                        <View style={{ width: 105, flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <MaterialCommunityIcons
                            name={isNote ? "cash" : "circle-slice-8"}
                            size={16}
                            color={isSelected ? primaryCol : isNote ? "#059669" : "#d97706"}
                          />
                          <Text
                            style={[
                              styles.currencyLabel,
                              isSelected && { color: primaryCol, fontWeight: "900" },
                            ]}
                          >
                            ${row.currencyValue.toFixed(2)}
                          </Text>
                        </View>

                        {/* No Of $ (Input / Display) */}
                        <View style={{ width: 95, alignItems: "center" }}>
                          <TextInput
                            ref={(r) => {
                              inputRefs.current[idx] = r;
                            }}
                            style={[
                              styles.qtyInput,
                              isSelected && styles.qtyInputSelected,
                            ]}
                            keyboardType="numeric"
                            placeholder="0.00"
                            placeholderTextColor="#94a3b8"
                            value={row.qty}
                            onFocus={() => setSelectedIndex(idx)}
                            onChangeText={(text) => handleQtyChange(idx, text)}
                            selectTextOnFocus
                            returnKeyType={idx < denominations.length - 1 ? "next" : "done"}
                            onSubmitEditing={() => {
                              if (idx < denominations.length - 1) {
                                setSelectedIndex(idx + 1);
                                inputRefs.current[idx + 1]?.focus();
                              }
                            }}
                          />
                        </View>

                        {/* Amount */}
                        <Text
                          style={[
                            styles.amountText,
                            row.amount > 0 && { color: "#0f766e", fontWeight: "800" },
                            isSelected && { fontWeight: "900" },
                          ]}
                        >
                          ${row.amount.toFixed(2)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Table Footer: Total Counted */}
                <View style={styles.tableFooter}>
                  <Text style={styles.tableFooterLabel}>Total Counted Cash:</Text>
                  <Text style={[styles.tableFooterAmt, { color: primaryCol }]}>
                    ${totalCountedCash.toFixed(2)}
                  </Text>
                </View>
              </View>

              {/* ========================================================= */}
              {/* RIGHT COLUMN: TOUCH NUMERIC KEYPAD + PAYMODE BREAKDOWN    */}
              {/* ========================================================= */}
              <View style={styles.rightColumn}>
                {/* 1. TOUCH NUMERIC KEYPAD (Matching POS Main Theme) */}
                <View style={styles.keypadCard}>
                  <View style={styles.keypadHeader}>
                    <Text style={styles.keypadHeaderText}>
                      Row:{" "}
                      <Text style={{ color: primaryCol, fontWeight: "900" }}>
                        ${denominations[selectedIndex]?.currencyValue.toFixed(2) || "0.00"}
                      </Text>{" "}
                      | Qty:{" "}
                      <Text style={{ color: "#0f766e", fontWeight: "900" }}>
                        {denominations[selectedIndex]?.qty || "0"}
                      </Text>
                    </Text>
                  </View>

                  {/* 4x4 Keypad Grid */}
                  <View style={styles.keypadGrid}>
                    {/* Row 1 */}
                    <View style={styles.keypadRow}>
                      <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeypadPress("7")}>
                        <Text style={styles.keyText}>7</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeypadPress("8")}>
                        <Text style={styles.keyText}>8</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeypadPress("9")}>
                        <Text style={styles.keyText}>9</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.keyBtn, styles.keyBtnSpecial]} onPress={() => handleKeypadPress("+")}>
                        <Text style={[styles.keyText, { color: primaryCol }]}>+</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Row 2 */}
                    <View style={styles.keypadRow}>
                      <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeypadPress("4")}>
                        <Text style={styles.keyText}>4</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeypadPress("5")}>
                        <Text style={styles.keyText}>5</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeypadPress("6")}>
                        <Text style={styles.keyText}>6</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.keyBtn, styles.keyBtnSpecial]} onPress={() => handleKeypadPress("-")}>
                        <Text style={[styles.keyText, { color: primaryCol }]}>-</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Row 3 */}
                    <View style={styles.keypadRow}>
                      <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeypadPress("1")}>
                        <Text style={styles.keyText}>1</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeypadPress("2")}>
                        <Text style={styles.keyText}>2</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeypadPress("3")}>
                        <Text style={styles.keyText}>3</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.keyBtn, styles.keyBtnSpecial]}
                        onPress={() => handleKeypadPress("DEL")}
                      >
                        <MaterialCommunityIcons name="backspace-outline" size={20} color="#64748b" />
                      </TouchableOpacity>
                    </View>

                    {/* Row 4 */}
                    <View style={styles.keypadRow}>
                      <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeypadPress("0")}>
                        <Text style={styles.keyText}>0</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.keyBtn} onPress={() => handleKeypadPress("00")}>
                        <Text style={styles.keyText}>00</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.keyBtn, styles.keyBtnClear]}
                        onPress={() => handleKeypadPress("CLEAR")}
                      >
                        <Text style={styles.keyClearText}>CLR</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.keyBtn, styles.keyBtnEnter, { backgroundColor: primaryCol, borderColor: primaryCol }]}
                        onPress={() => handleKeypadPress("ENTER")}
                      >
                        <MaterialCommunityIcons name="keyboard-return" size={18} color="#ffffff" />
                        <Text style={styles.keyEnterText}>ENTER</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* 2. PAYMODE BREAKDOWN TABLE (CASH, NETS, PAYNOW, PAYWAY...) */}
                <View style={styles.payModeCard}>
                  <View style={styles.payModeHeader}>
                    <Text style={[styles.thText, { flex: 1.2, color: "#334155" }]}>Paymode</Text>
                    <Text style={[styles.thText, { flex: 1, textAlign: "right", color: "#334155" }]}>Amount ($)</Text>
                  </View>
                  <ScrollView style={{ flex: 1 }} nestedScrollEnabled>
                    {payModes.length === 0 ? (
                      <View style={{ padding: 12, alignItems: "center" }}>
                        <Text style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>
                          No sales recorded in current shift
                        </Text>
                      </View>
                    ) : (
                      payModes.map((pm, pIdx) => (
                        <View
                          key={pm.payMode || pIdx}
                          style={[
                            styles.payModeRow,
                            pIdx % 2 === 1 && { backgroundColor: "#f8fafc" },
                          ]}
                        >
                          <Text style={styles.payModeName}>{pm.payMode}</Text>
                          <Text style={styles.payModeAmt}>${pm.amount.toFixed(2)}</Text>
                        </View>
                      ))
                    )}
                  </ScrollView>
                  <View style={styles.payModeFooter}>
                    <Text style={styles.payModeTotalLabel}>Expected Drawer Cash:</Text>
                    <Text style={styles.payModeTotalAmt}>${summary.expectedCashInDrawer.toFixed(2)}</Text>
                  </View>
                </View>

                {/* 3. ACTION BUTTONS: SAVE & EXIT */}
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.exitBtn} onPress={onClose}>
                    <Text style={styles.exitBtnText}>Exit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: primaryCol }]}
                    onPress={handleSaveCount}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="content-save-check" size={18} color="#ffffff" />
                        <Text style={styles.saveBtnText}>Save & Exit</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    justifyContent: "center",
    alignItems: "center",
    padding: 14,
  },
  container: {
    width: "100%",
    maxWidth: 860,
    height: "92%",
    maxHeight: 650,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  headerSubtitle: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  messageBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  messageText: {
    fontSize: 12.5,
    fontWeight: "700",
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600",
  },
  body: {
    flex: 1,
    flexDirection: "row",
    padding: 12,
    gap: 12,
    backgroundColor: "#f8fafc",
  },

  // LEFT COLUMN: TABLE
  leftTableCard: {
    flex: 1.15,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef3c7", // Warm soft header matching classic POS readability
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: "#fde68a",
  },
  thText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#78350f",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  tableRowSelected: {
    backgroundColor: "#e0f2fe",
    borderLeftWidth: 4,
    borderLeftColor: "#0284c7",
  },
  currencyLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1e293b",
  },
  qtyInput: {
    width: 76,
    height: 32,
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 5,
    textAlign: "center",
    fontSize: 13.5,
    fontWeight: "800",
    color: "#0f172a",
  },
  qtyInputSelected: {
    borderColor: "#0284c7",
    backgroundColor: "#f0f9ff",
  },
  amountText: {
    flex: 1,
    textAlign: "right",
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600",
  },
  tableFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1.5,
    borderTopColor: "#cbd5e1",
  },
  tableFooterLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#334155",
  },
  tableFooterAmt: {
    fontSize: 16,
    fontWeight: "900",
  },

  // RIGHT COLUMN: KEYPAD + PAYMODE BREAKDOWN
  rightColumn: {
    flex: 1,
    gap: 10,
  },

  // TOUCH KEYPAD (Matching POS Main Numpad Theme)
  keypadCard: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  keypadHeader: {
    paddingHorizontal: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    marginBottom: 6,
  },
  keypadHeaderText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
  },
  keypadGrid: {
    gap: 6,
  },
  keypadRow: {
    flexDirection: "row",
    gap: 6,
  },
  keyBtn: {
    flex: 1,
    height: 44,
    backgroundColor: "#ffffff",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  keyText: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "800",
  },
  keyBtnSpecial: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
  },
  keyBtnClear: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  keyClearText: {
    color: "#dc2626",
    fontSize: 13,
    fontWeight: "800",
  },
  keyBtnEnter: {
    flexDirection: "row",
    gap: 4,
  },
  keyEnterText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  // PAYMODE BREAKDOWN
  payModeCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    overflow: "hidden",
  },
  payModeHeader: {
    flexDirection: "row",
    backgroundColor: "#fef3c7",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#fde68a",
  },
  payModeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  payModeName: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#1e293b",
  },
  payModeAmt: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#0f172a",
  },
  payModeFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  payModeTotalLabel: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#475569",
  },
  payModeTotalAmt: {
    fontSize: 12.5,
    fontWeight: "900",
    color: "#1e293b",
  },

  // ACTION BUTTONS
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  exitBtn: {
    flex: 1,
    height: 40,
    backgroundColor: "#e2e8f0",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  exitBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#334155",
  },
  saveBtn: {
    flex: 1.5,
    height: 40,
    borderRadius: 6,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  saveBtnText: {
    color: "#ffffff",
    fontSize: 13.5,
    fontWeight: "800",
  },
});
