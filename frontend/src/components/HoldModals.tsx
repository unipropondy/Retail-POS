import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ThemeConfig } from "../utils/theme";
import { getBackendBaseUrl } from "../config/appConfig";

const API_URL = getBackendBaseUrl();

export interface HoldHeaderItem {
  HoldNo: number;
  InvoiceNo?: string;
  InvoiceDate?: string;
  TotalValue: number;
  DetailDiscount: number;
  TotalDiscount: number;
  NetTotal: number;
  CashierID: string;
  LocationCode: string;
  TerminalCode: string;
  TotalLines: number;
  CustomerCode?: string;
  CustomerName?: string;
  CreateDate?: string;
  CreateUser?: string;
  Remarks?: string;
}

export interface HoldDetailItem {
  HoldNo: number;
  InventoryCode: string;
  Description: string;
  Qty: number;
  Price: number;
  NetAmount: number;
  Discount?: number;
  UOM?: string;
}

interface HoldModalsProps {
  // Hold List & Release Modal
  showHoldListModal: boolean;
  onCloseHoldListModal: () => void;
  holdList: HoldHeaderItem[];
  loadingHoldList: boolean;
  onSelectReleaseHold: (holdNo: number) => Promise<void>;
  onDeleteHold: (holdNo: number) => Promise<void>;
  selectedHoldNo: number | null;
  onRefreshHoldList: (showAll?: boolean) => void;
  showAllCounters?: boolean;
  onToggleAllCounters?: (val: boolean) => void;

  // Manual Hold Number Entry Modal
  showManualHoldModal: boolean;
  onCloseManualHoldModal: () => void;
  onSubmitManualHold: (holdNo: number) => void;
  suggestedHoldNo: number;

  // Admin Authorization Modal
  showAdminAuthModal: boolean;
  onCloseAdminAuthModal: () => void;
  onSubmitAdminAuth: (username: string, password: string) => Promise<boolean>;

  theme?: ThemeConfig;
  primaryColor?: string;
  activeTerminal?: string;
}

export default function HoldModals({
  showHoldListModal,
  onCloseHoldListModal,
  holdList,
  loadingHoldList,
  onSelectReleaseHold,
  onDeleteHold,
  onRefreshHoldList,
  showAllCounters = false,
  onToggleAllCounters,
  showManualHoldModal,
  onCloseManualHoldModal,
  onSubmitManualHold,
  suggestedHoldNo,
  showAdminAuthModal,
  onCloseAdminAuthModal,
  onSubmitAdminAuth,
  theme,
  primaryColor = "#155d36",
  activeTerminal = "",
}: HoldModalsProps) {
  const themePrimary = theme?.primary || primaryColor || "#881337";
  const isDark = theme?.isDark || false;

  // Selected Hold record in the left grid
  const [selectedHold, setSelectedHold] = useState<HoldHeaderItem | null>(null);

  // Line items for the selected hold
  const [holdDetails, setHoldDetails] = useState<HoldDetailItem[]>([]);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  // Manual Hold input
  const [manualInput, setManualInput] = useState<string>("");

  // Admin Auth inputs
  const [adminUser, setAdminUser] = useState<string>("");
  const [adminPass, setAdminPass] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  // Releasing indicator
  const [releasingNo, setReleasingNo] = useState<number | null>(null);

  // Auto-select first hold item when list updates
  useEffect(() => {
    if (holdList && holdList.length > 0) {
      if (!selectedHold || !holdList.some((h) => h.HoldNo === selectedHold.HoldNo)) {
        handleSelectHold(holdList[0]);
      }
    } else {
      setSelectedHold(null);
      setHoldDetails([]);
    }
  }, [holdList]);

  // Fetch child items when touching a Hold header
  const handleSelectHold = async (hold: HoldHeaderItem) => {
    setSelectedHold(hold);
    setLoadingDetails(true);
    try {
      const res = await fetch(`${API_URL}/api/hold/${hold.HoldNo}`);
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.details)) {
        setHoldDetails(data.details);
      } else {
        setHoldDetails([]);
      }
    } catch (e) {
      console.error("Failed to fetch hold details:", e);
      setHoldDetails([]);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleAdminSubmit = async () => {
    if (!adminUser.trim() || !adminPass.trim()) {
      setAuthError("Enter both admin username and password");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    try {
      const ok = await onSubmitAdminAuth(adminUser.trim(), adminPass.trim());
      if (ok) {
        setAdminUser("");
        setAdminPass("");
        onCloseAdminAuthModal();
      } else {
        setAuthError("Invalid admin credentials or permission denied.");
      }
    } catch {
      setAuthError("Authorization failed. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleToggleAllSales = () => {
    const nextVal = !showAllCounters;
    if (onToggleAllCounters) {
      onToggleAllCounters(nextVal);
    } else {
      onRefreshHoldList(nextVal);
    }
  };

  return (
    <>
      {/* ============================================================== */}
      {/* 1. MODERN ENTERPRISE HELD BILLS MODAL                          */}
      {/* Two-Pane Modern Touch Layout matching Current POS Theme        */}
      {/* ============================================================== */}
      <Modal
        visible={showHoldListModal}
        transparent
        animationType="fade"
        onRequestClose={onCloseHoldListModal}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modernModalCard,
              {
                backgroundColor: theme?.surface || "#ffffff",
                borderColor: theme?.borderColor || "#e2e8f0",
              },
            ]}
          >
            {/* Top Navigation & Status Bar */}
            <View style={[styles.modalHeaderBar, { backgroundColor: themePrimary }]}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIconBadge}>
                  <MaterialCommunityIcons name="pause-circle" size={20} color="#ffffff" />
                </View>
                <View>
                  <Text style={styles.headerMainTitle}>Held Bills & Transactions</Text>
                  <Text style={styles.headerSubtitle}>
                    Select a parked transaction to preview items and release to active cart
                  </Text>
                </View>
              </View>

              <View style={styles.headerRight}>
                {/* ALL SALES Toggle Pill */}
                <TouchableOpacity
                  style={[
                    styles.allSalesPill,
                    showAllCounters ? styles.allSalesPillActive : {},
                  ]}
                  activeOpacity={0.8}
                  onPress={handleToggleAllSales}
                >
                  <MaterialCommunityIcons
                    name={showAllCounters ? "check-circle" : "checkbox-blank-circle-outline"}
                    size={15}
                    color="#ffffff"
                  />
                  <Text style={styles.allSalesPillText}>ALL COUNTERS</Text>
                </TouchableOpacity>

                {/* Refresh Button */}
                <TouchableOpacity
                  style={styles.headerActionBtn}
                  onPress={() => onRefreshHoldList(showAllCounters)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="refresh" size={18} color="#ffffff" />
                </TouchableOpacity>

                {/* Close Button */}
                <TouchableOpacity
                  style={styles.headerActionBtn}
                  onPress={onCloseHoldListModal}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="close" size={20} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Main Content: Two Modern Split Panels */}
            <View style={styles.twoColumnBody}>
              {/* LEFT PANEL: List of Parked Bills */}
              <View style={styles.leftListPanel}>
                <View style={styles.panelTitleBar}>
                  <MaterialCommunityIcons name="receipt-text-outline" size={17} color={themePrimary} />
                  <Text style={styles.panelTitleText}>Parked Bills</Text>
                  <View style={[styles.countBadge, { backgroundColor: themePrimary }]}>
                    <Text style={styles.countBadgeText}>{holdList.length}</Text>
                  </View>
                </View>

                {loadingHoldList ? (
                  <View style={styles.centerBox}>
                    <ActivityIndicator size="large" color={themePrimary} />
                    <Text style={styles.loadingText}>Fetching held bills...</Text>
                  </View>
                ) : holdList.length === 0 ? (
                  <View style={styles.centerBox}>
                    <MaterialCommunityIcons name="inbox-outline" size={44} color="#94a3b8" />
                    <Text style={styles.emptyTitle}>No Held Bills</Text>
                    <Text style={styles.emptySubtitle}>Press F6 Hold to park an active cart</Text>
                  </View>
                ) : (
                  <FlatList
                    data={holdList}
                    keyExtractor={(item) => String(item.HoldNo)}
                    contentContainerStyle={{ padding: 10, gap: 8 }}
                    renderItem={({ item }) => {
                      const isSelected = selectedHold?.HoldNo === item.HoldNo;
                      const dateStr = item.CreateDate || item.InvoiceDate
                        ? new Date(item.CreateDate || item.InvoiceDate!).toLocaleTimeString("en-GB", {
                            hour: "2-digit",
                            minute: "2-digit",
                          }) +
                          " (" +
                          new Date(item.CreateDate || item.InvoiceDate!).toLocaleDateString("en-GB") +
                          ")"
                        : "---";

                      return (
                        <TouchableOpacity
                          style={[
                            styles.billCard,
                            isSelected
                              ? [styles.billCardActive, { borderColor: themePrimary }]
                              : {},
                          ]}
                          activeOpacity={0.85}
                          onPress={() => handleSelectHold(item)}
                        >
                          <View style={styles.billCardHeader}>
                            <View style={styles.holdNoBadgeWrapper}>
                              <View
                                style={[
                                  styles.holdNoPill,
                                  { backgroundColor: isSelected ? themePrimary : "#f1f5f9" },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.holdNoPillText,
                                    { color: isSelected ? "#ffffff" : "#334155" },
                                  ]}
                                >
                                  Hold #{item.HoldNo}
                                </Text>
                              </View>
                              <View style={styles.termTag}>
                                <MaterialCommunityIcons name="monitor" size={12} color="#64748b" />
                                <Text style={styles.termTagText}>{item.TerminalCode.trim()}</Text>
                              </View>
                            </View>

                            <Text
                              style={[
                                styles.billAmount,
                                { color: isSelected ? themePrimary : "#0f172a" },
                              ]}
                            >
                              ${Number(item.NetTotal).toFixed(2)}
                            </Text>
                          </View>

                          <View style={styles.billCardMetaRow}>
                            <View style={styles.metaCol}>
                              <Text style={styles.metaLabel}>Cashier</Text>
                              <Text style={styles.metaVal}>{item.CashierID?.trim() || "UPS"}</Text>
                            </View>
                            <View style={styles.metaCol}>
                              <Text style={styles.metaLabel}>Lines</Text>
                              <Text style={styles.metaVal}>{item.TotalLines || 0} items</Text>
                            </View>
                            <View style={styles.metaColRight}>
                              <Text style={styles.metaLabel}>Time</Text>
                              <Text style={styles.metaVal}>{dateStr}</Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    }}
                  />
                )}
              </View>

              {/* RIGHT PANEL: Live Item Preview for Selected Hold */}
              <View style={styles.rightDetailPanel}>
                <View style={styles.panelTitleBar}>
                  <MaterialCommunityIcons name="format-list-bulleted" size={17} color={themePrimary} />
                  <Text style={styles.panelTitleText}>
                    {selectedHold ? `Hold #${selectedHold.HoldNo} Items Preview` : "Items Preview"}
                  </Text>
                  {selectedHold && (
                    <View style={styles.selectedHoldHeaderPill}>
                      <Text style={styles.selectedHoldHeaderPillText}>
                        {selectedHold.TerminalCode.trim()} • {selectedHold.CashierID?.trim()}
                      </Text>
                    </View>
                  )}
                </View>

                {loadingDetails ? (
                  <View style={styles.centerBox}>
                    <ActivityIndicator size="large" color={themePrimary} />
                    <Text style={styles.loadingText}>Loading items...</Text>
                  </View>
                ) : !selectedHold ? (
                  <View style={styles.centerBox}>
                    <MaterialCommunityIcons name="cursor-default-click-outline" size={44} color="#94a3b8" />
                    <Text style={styles.emptyTitle}>Select a Parked Bill</Text>
                    <Text style={styles.emptySubtitle}>Touch any bill on the left to see its items</Text>
                  </View>
                ) : holdDetails.length === 0 ? (
                  <View style={styles.centerBox}>
                    <MaterialCommunityIcons name="basket-off-outline" size={44} color="#94a3b8" />
                    <Text style={styles.emptyTitle}>No Items</Text>
                    <Text style={styles.emptySubtitle}>No items recorded in this hold bill</Text>
                  </View>
                ) : (
                  <View style={styles.itemTableWrapper}>
                    {/* Modern High-Density Table Header */}
                    <View style={styles.modernTableHeader}>
                      <Text style={[styles.modernTh, { width: 120 }]}>Code</Text>
                      <Text style={[styles.modernTh, { flex: 1 }]}>Description</Text>
                      <Text style={[styles.modernTh, { width: 75, textAlign: "center" }]}>Qty</Text>
                      <Text style={[styles.modernTh, { width: 95, textAlign: "right" }]}>Price</Text>
                      <Text style={[styles.modernTh, { width: 100, textAlign: "right" }]}>Amount</Text>
                    </View>

                    {/* Modern Item Rows */}
                    <FlatList
                      data={holdDetails}
                      keyExtractor={(it, idx) => `${it.InventoryCode}_${idx}`}
                      renderItem={({ item, index }) => (
                        <View
                          style={[
                            styles.modernTableRow,
                            index % 2 === 1 ? styles.altRow : {},
                          ]}
                        >
                          <Text style={[styles.modernTdCode, { width: 120 }]}>
                            {item.InventoryCode.trim()}
                          </Text>
                          <Text style={[styles.modernTdDesc, { flex: 1 }]} numberOfLines={1}>
                            {item.Description.trim()}
                          </Text>
                          <View style={{ width: 75, alignItems: "center" }}>
                            <View style={styles.qtyBubble}>
                              <Text style={styles.qtyBubbleText}>
                                {Number(item.Qty).toFixed(0)}
                              </Text>
                            </View>
                          </View>
                          <Text style={[styles.modernTdNum, { width: 95, textAlign: "right" }]}>
                            ${Number(item.Price).toFixed(2)}
                          </Text>
                          <Text
                            style={[
                              styles.modernTdNum,
                              { width: 100, textAlign: "right", fontWeight: "800", color: "#0f172a" },
                            ]}
                          >
                            ${Number(item.NetAmount || item.Price * item.Qty).toFixed(2)}
                          </Text>
                        </View>
                      )}
                    />
                  </View>
                )}
              </View>
            </View>

            {/* Bottom Enterprise Control Strip */}
            <View style={styles.modernFooter}>
              {/* Left Summary Box */}
              <View style={styles.footerSummary}>
                <Text style={styles.footerSummaryLabel}>SELECTED BILL TOTAL</Text>
                <Text style={[styles.footerSummaryVal, { color: themePrimary }]}>
                  ${selectedHold ? Number(selectedHold.NetTotal).toFixed(2) : "0.00"}
                </Text>
              </View>

              {/* Action Buttons Row */}
              <View style={styles.footerActions}>
                {/* Discard / Delete Button */}
                {selectedHold && (
                  <TouchableOpacity
                    style={styles.discardBtn}
                    onPress={async () => {
                      if (selectedHold) {
                        await onDeleteHold(selectedHold.HoldNo);
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={17} color="#dc2626" />
                    <Text style={styles.discardBtnText}>Discard Bill</Text>
                  </TouchableOpacity>
                )}

                {/* Release to Cart Hero Button */}
                <TouchableOpacity
                  style={[
                    styles.modernReleaseHeroBtn,
                    { backgroundColor: themePrimary },
                    (!selectedHold || releasingNo !== null) && styles.btnDisabled,
                  ]}
                  disabled={!selectedHold || releasingNo !== null}
                  activeOpacity={0.85}
                  onPress={async () => {
                    if (!selectedHold) return;
                    setReleasingNo(selectedHold.HoldNo);
                    try {
                      await onSelectReleaseHold(selectedHold.HoldNo);
                      onCloseHoldListModal();
                    } finally {
                      setReleasingNo(null);
                    }
                  }}
                >
                  {releasingNo !== null ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="cart-arrow-down" size={20} color="#ffffff" />
                      <Text style={styles.modernReleaseHeroText}>Release to Active Cart</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Close Button */}
                <TouchableOpacity
                  style={styles.modernCloseBtn}
                  onPress={onCloseHoldListModal}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modernCloseBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ============================================================== */}
      {/* 2. MANUAL HOLD NUMBER MODAL                                    */}
      {/* ============================================================== */}
      <Modal
        visible={showManualHoldModal}
        transparent
        animationType="fade"
        onRequestClose={onCloseManualHoldModal}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.inputModalContainer,
              {
                backgroundColor: theme?.surface || "#ffffff",
                borderColor: theme?.borderColor || "#e2e8f0",
              },
            ]}
          >
            <View style={[styles.modalHeaderBar, { backgroundColor: themePrimary }]}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIconBadge}>
                  <MaterialCommunityIcons name="numeric" size={20} color="#ffffff" />
                </View>
                <Text style={styles.headerMainTitle}>Manual Hold Number Entry</Text>
              </View>
              <TouchableOpacity onPress={onCloseManualHoldModal}>
                <MaterialCommunityIcons name="close" size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputModalBody}>
              <Text style={styles.inputPrompt}>
                Manual Hold is enabled in System Configuration. Enter Hold Number or use the suggested auto-number:
              </Text>
              <TextInput
                style={[
                  styles.numberInput,
                  { borderColor: themePrimary, color: themePrimary },
                ]}
                keyboardType="numeric"
                placeholder={String(suggestedHoldNo || 1)}
                value={manualInput}
                onChangeText={setManualInput}
                autoFocus
              />
              <Text style={styles.inputSubtext}>
                Suggested Next Number: #{suggestedHoldNo || 1}
              </Text>

              <View style={styles.inputModalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => {
                    setManualInput("");
                    onCloseManualHoldModal();
                  }}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: themePrimary }]}
                  onPress={() => {
                    const parsed = parseInt(manualInput.trim() || String(suggestedHoldNo || 1), 10);
                    if (parsed > 0) {
                      onSubmitManualHold(parsed);
                      setManualInput("");
                    }
                  }}
                >
                  <Text style={styles.confirmBtnText}>Save Hold</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ============================================================== */}
      {/* 3. ADMIN AUTHORIZATION MODAL                                   */}
      {/* ============================================================== */}
      <Modal
        visible={showAdminAuthModal}
        transparent
        animationType="fade"
        onRequestClose={onCloseAdminAuthModal}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.inputModalContainer,
              {
                backgroundColor: theme?.surface || "#ffffff",
                borderColor: theme?.borderColor || "#e2e8f0",
              },
            ]}
          >
            <View style={[styles.modalHeaderBar, { backgroundColor: "#dc2626" }]}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIconBadge}>
                  <MaterialCommunityIcons name="shield-lock-outline" size={20} color="#ffffff" />
                </View>
                <Text style={styles.headerMainTitle}>Admin Authorization Required</Text>
              </View>
              <TouchableOpacity onPress={onCloseAdminAuthModal}>
                <MaterialCommunityIcons name="close" size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputModalBody}>
              <Text style={styles.inputPrompt}>
                Cashier does not have permission to park bills. Enter Admin or Supervisor credentials:
              </Text>

              {authError ? (
                <View style={styles.errorAlert}>
                  <MaterialCommunityIcons name="alert-circle" size={16} color="#dc2626" />
                  <Text style={styles.errorAlertText}>{authError}</Text>
                </View>
              ) : null}

              <Text style={styles.fieldLabel}>Admin Username</Text>
              <TextInput
                style={styles.authInput}
                placeholder="Admin username"
                value={adminUser}
                onChangeText={setAdminUser}
                autoCapitalize="characters"
              />

              <Text style={styles.fieldLabel}>Password</Text>
              <TextInput
                style={styles.authInput}
                placeholder="Enter password"
                secureTextEntry
                value={adminPass}
                onChangeText={setAdminPass}
              />

              <View style={styles.inputModalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  disabled={authLoading}
                  onPress={() => {
                    setAdminUser("");
                    setAdminPass("");
                    setAuthError("");
                    onCloseAdminAuthModal();
                  }}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: "#dc2626" }]}
                  disabled={authLoading}
                  onPress={handleAdminSubmit}
                >
                  {authLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.confirmBtnText}>Authorize</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 9999,
  },
  modernModalCard: {
    width: "100%",
    maxWidth: 960,
    height: "85%",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 28,
    elevation: 16,
    borderWidth: 1,
  },
  modalHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerMainTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  allSalesPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
  },
  allSalesPillActive: {
    backgroundColor: "rgba(255, 255, 255, 0.28)",
    borderColor: "#ffffff",
  },
  allSalesPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.4,
  },
  headerActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  twoColumnBody: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#f8fafc",
  },
  leftListPanel: {
    width: "42%",
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  rightDetailPanel: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  panelTitleBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    backgroundColor: "#ffffff",
  },
  panelTitleText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1e293b",
    letterSpacing: 0.2,
  },
  countBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: "auto",
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ffffff",
  },
  selectedHoldHeaderPill: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: "auto",
  },
  selectedHoldHeaderPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
  },
  billCard: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  billCardActive: {
    backgroundColor: "#ffffff",
    borderWidth: 2,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  billCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  holdNoBadgeWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  holdNoPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  holdNoPillText: {
    fontSize: 12,
    fontWeight: "800",
  },
  termTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  termTagText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  billAmount: {
    fontSize: 15,
    fontWeight: "900",
    fontFamily: Platform.select({
      web: 'Consolas, Menlo, Monaco, "Courier New", monospace',
      default: undefined,
    }),
  },
  billCardMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 8,
  },
  metaCol: {
    gap: 2,
  },
  metaColRight: {
    gap: 2,
    alignItems: "flex-end",
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
  },
  metaVal: {
    fontSize: 11,
    fontWeight: "600",
    color: "#334155",
  },
  itemTableWrapper: {
    flex: 1,
  },
  modernTableHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  modernTh: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  modernTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  altRow: {
    backgroundColor: "#fafbfc",
  },
  modernTdCode: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    fontFamily: Platform.select({
      web: 'Consolas, Menlo, Monaco, "Courier New", monospace',
      default: undefined,
    }),
  },
  modernTdDesc: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1e293b",
    paddingRight: 10,
  },
  modernTdNum: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
    fontFamily: Platform.select({
      web: 'Consolas, Menlo, Monaco, "Courier New", monospace',
      default: undefined,
    }),
  },
  qtyBubble: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  qtyBubbleText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0f172a",
  },
  modernFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  footerSummary: {
    gap: 2,
  },
  footerSummaryLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 0.5,
  },
  footerSummaryVal: {
    fontSize: 22,
    fontWeight: "900",
    fontFamily: Platform.select({
      web: 'Consolas, Menlo, Monaco, "Courier New", monospace',
      default: undefined,
    }),
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  discardBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  discardBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#dc2626",
  },
  modernReleaseHeroBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  modernReleaseHeroText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.2,
  },
  modernCloseBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  modernCloseBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  btnDisabled: {
    opacity: 0.45,
  },
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: "#64748b",
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#334155",
  },
  emptySubtitle: {
    fontSize: 12,
    color: "#64748b",
  },

  // Manual Hold and Admin Auth Dialog Styles
  inputModalContainer: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
  },
  inputModalBody: {
    padding: 20,
  },
  inputPrompt: {
    fontSize: 13,
    color: "#334155",
    lineHeight: 18,
    marginBottom: 12,
  },
  numberInput: {
    height: 48,
    borderWidth: 2,
    borderRadius: 8,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 6,
  },
  inputSubtext: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 16,
  },
  inputModalActions: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    height: 42,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  confirmBtn: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
  errorAlert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorAlertText: {
    fontSize: 12,
    color: "#dc2626",
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 4,
    marginTop: 8,
  },
  authInput: {
    height: 40,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: "#0f172a",
    marginBottom: 8,
  },
});
