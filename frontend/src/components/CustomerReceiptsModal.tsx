// ==============================================================================
// Project: Supermarket Retail POS
// Module: Customer Receipts Modal (frmCustomerReceipts.vb Parity)
// File: frontend/src/components/CustomerReceiptsModal.tsx
// Description: Matches legacy frmCustomerReceipts.vb:
//              - Tabs: Uncleared (Outstanding Credit Receivables) & Cleared (Settled Receipts)
//              - Live search by Customer Code or Customer Name
//              - Displays Outstanding Balance, Transaction Amount, Cheque info, and Receipt numbers
//              - Zero hardcoding: Data-driven directly from SQL Server
// ==============================================================================

import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface UnclearedRow {
  CustomerCode: string;
  CustomerName: string;
  BalanceAmt: number;
  TranAmt: number;
  ChequeNo?: string;
  ChequeAmt?: number;
  ChequeDate?: string;
}

interface ClearedRow {
  CustomerCode: string;
  CustomerName: string;
  ReceiptNo: string;
  ChequeNo?: string;
  ChequeAmt?: number;
  ChequeDate?: string;
  ClearedDate?: string;
  ChequeStatus?: string;
}

interface CustomerReceiptsModalProps {
  visible: boolean;
  onClose: () => void;
  apiUrl: string;
  primaryColor?: string;
}

export default function CustomerReceiptsModal({
  visible,
  onClose,
  apiUrl,
  primaryColor = "#155d36",
}: CustomerReceiptsModalProps) {
  const [activeTab, setActiveTab] = useState<"UNCLEARED" | "CLEARED">("UNCLEARED");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [unclearedList, setUnclearedList] = useState<UnclearedRow[]>([]);
  const [clearedList, setClearedList] = useState<ClearedRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const searchInputRef = useRef<any>(null);

  const fetchCustomerReceipts = async (query: string = "") => {
    try {
      setIsLoading(true);
      setErrorMsg("");
      const url = `${apiUrl}/api/customer-receipts/list?search=${encodeURIComponent(query.trim())}`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.success) {
        setUnclearedList(data.uncleared || []);
        setClearedList(data.cleared || []);
      } else {
        setErrorMsg(data.message || "Failed to load customer receipts.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Network error loading customer receipts.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setSearchQuery("");
      fetchCustomerReceipts("");
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [visible]);

  const handleSearchSubmit = () => {
    fetchCustomerReceipts(searchQuery);
  };

  const totalUnclearedBalance = unclearedList.reduce(
    (acc, item) => acc + (Number(item.BalanceAmt) || 0),
    0
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          {/* Header Bar */}
          <View style={[styles.headerBar, { backgroundColor: primaryColor }]}>
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons name="account-cash-outline" size={24} color="#FFFFFF" />
              <Text style={styles.headerTitle}>Customer Receipts & Credit Receivables</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Subheader / Search & Tabs */}
          <View style={styles.controlsBar}>
            {/* Tabs */}
            <View style={styles.tabsContainer}>
              <TouchableOpacity
                style={[
                  styles.tabButton,
                  activeTab === "UNCLEARED" && [styles.tabButtonActive, { borderColor: primaryColor }],
                ]}
                onPress={() => setActiveTab("UNCLEARED")}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="clock-alert-outline"
                  size={16}
                  color={activeTab === "UNCLEARED" ? primaryColor : "#64748B"}
                />
                <Text
                  style={[
                    styles.tabButtonText,
                    activeTab === "UNCLEARED" && [styles.tabButtonTextActive, { color: primaryColor }],
                  ]}
                >
                  Uncleared Receivables ({unclearedList.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.tabButton,
                  activeTab === "CLEARED" && [styles.tabButtonActive, { borderColor: primaryColor }],
                ]}
                onPress={() => setActiveTab("CLEARED")}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="check-circle-outline"
                  size={16}
                  color={activeTab === "CLEARED" ? primaryColor : "#64748B"}
                />
                <Text
                  style={[
                    styles.tabButtonText,
                    activeTab === "CLEARED" && [styles.tabButtonTextActive, { color: primaryColor }],
                  ]}
                >
                  Cleared Receipts ({clearedList.length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={styles.searchContainer}>
              <MaterialCommunityIcons name="magnify" size={18} color="#64748B" style={{ marginLeft: 8 }} />
              <TextInput
                ref={searchInputRef}
                style={styles.searchInput}
                placeholder="Search Customer Code or Name..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearchSubmit}
              />
              {searchQuery ? (
                <TouchableOpacity
                  onPress={() => {
                    setSearchQuery("");
                    fetchCustomerReceipts("");
                  }}
                  style={{ padding: 4, marginRight: 4 }}
                >
                  <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.searchBtn, { backgroundColor: primaryColor }]}
                onPress={handleSearchSubmit}
                activeOpacity={0.8}
              >
                <Text style={styles.searchBtnText}>Search</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Grid Content */}
          <View style={styles.gridContainer}>
            {isLoading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={primaryColor} />
                <Text style={styles.loadingText}>Fetching customer receivable data...</Text>
              </View>
            ) : errorMsg ? (
              <View style={styles.emptyBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={40} color="#EF4444" />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : activeTab === "UNCLEARED" ? (
              /* Uncleared Table */
              unclearedList.length === 0 ? (
                <View style={styles.emptyBox}>
                  <MaterialCommunityIcons name="cash-check" size={48} color="#94A3B8" />
                  <Text style={styles.emptyTitle}>No Uncleared Receivables Found</Text>
                  <Text style={styles.emptySub}>All customer credit accounts are fully balanced.</Text>
                </View>
              ) : (
                <ScrollView style={styles.scrollArea}>
                  {/* Table Header */}
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableHeaderCol, { flex: 1.2 }]}>Customer Code</Text>
                    <Text style={[styles.tableHeaderCol, { flex: 2.2 }]}>Customer Name</Text>
                    <Text style={[styles.tableHeaderCol, { flex: 1.2, textAlign: "right" }]}>Balance Due ($)</Text>
                    <Text style={[styles.tableHeaderCol, { flex: 1.2, textAlign: "right" }]}>Tran Amount ($)</Text>
                    <Text style={[styles.tableHeaderCol, { flex: 1.2, textAlign: "center" }]}>Cheque No</Text>
                  </View>

                  {/* Table Rows */}
                  {unclearedList.map((row, idx) => (
                    <View
                      key={`${row.CustomerCode}-${idx}`}
                      style={[
                        styles.tableDataRow,
                        idx % 2 === 1 && styles.tableDataRowAlt,
                      ]}
                    >
                      <Text style={[styles.tableDataColBold, { flex: 1.2 }]}>{row.CustomerCode}</Text>
                      <Text style={[styles.tableDataCol, { flex: 2.2 }]}>{row.CustomerName || "—"}</Text>
                      <Text style={[styles.tableDataColDue, { flex: 1.2, textAlign: "right" }]}>
                        ${Number(row.BalanceAmt || 0).toFixed(2)}
                      </Text>
                      <Text style={[styles.tableDataCol, { flex: 1.2, textAlign: "right" }]}>
                        ${Number(row.TranAmt || 0).toFixed(2)}
                      </Text>
                      <Text style={[styles.tableDataCol, { flex: 1.2, textAlign: "center" }]}>
                        {row.ChequeNo || "—"}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )
            ) : (
              /* Cleared Table */
              clearedList.length === 0 ? (
                <View style={styles.emptyBox}>
                  <MaterialCommunityIcons name="receipt" size={48} color="#94A3B8" />
                  <Text style={styles.emptyTitle}>No Cleared Receipts Found</Text>
                  <Text style={styles.emptySub}>No settled customer receipts recorded yet.</Text>
                </View>
              ) : (
                <ScrollView style={styles.scrollArea}>
                  {/* Table Header */}
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableHeaderCol, { flex: 1.2 }]}>Receipt No</Text>
                    <Text style={[styles.tableHeaderCol, { flex: 1.2 }]}>Customer Code</Text>
                    <Text style={[styles.tableHeaderCol, { flex: 2.0 }]}>Customer Name</Text>
                    <Text style={[styles.tableHeaderCol, { flex: 1.2, textAlign: "right" }]}>Cheque Amt ($)</Text>
                    <Text style={[styles.tableHeaderCol, { flex: 1.2, textAlign: "center" }]}>Cleared Date</Text>
                  </View>

                  {/* Table Rows */}
                  {clearedList.map((row, idx) => (
                    <View
                      key={`${row.ReceiptNo}-${idx}`}
                      style={[
                        styles.tableDataRow,
                        idx % 2 === 1 && styles.tableDataRowAlt,
                      ]}
                    >
                      <Text style={[styles.tableDataColBold, { flex: 1.2, color: primaryColor }]}>
                        {row.ReceiptNo}
                      </Text>
                      <Text style={[styles.tableDataCol, { flex: 1.2 }]}>{row.CustomerCode}</Text>
                      <Text style={[styles.tableDataCol, { flex: 2.0 }]}>{row.CustomerName || "—"}</Text>
                      <Text style={[styles.tableDataCol, { flex: 1.2, textAlign: "right", fontWeight: "700" }]}>
                        ${Number(row.ChequeAmt || 0).toFixed(2)}
                      </Text>
                      <Text style={[styles.tableDataCol, { flex: 1.2, textAlign: "center" }]}>
                        {row.ClearedDate || "—"}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )
            )}
          </View>

          {/* Footer Bar */}
          <View style={styles.footerBar}>
            {activeTab === "UNCLEARED" ? (
              <View style={styles.footerSummary}>
                <Text style={styles.footerSummaryLabel}>Total Outstanding Balance:</Text>
                <Text style={styles.footerSummaryVal}>${totalUnclearedBalance.toFixed(2)}</Text>
              </View>
            ) : (
              <View style={styles.footerSummary}>
                <Text style={styles.footerSummaryLabel}>Total Cleared Records:</Text>
                <Text style={[styles.footerSummaryVal, { color: primaryColor }]}>{clearedList.length}</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.closeFooterBtn}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="close-circle-outline" size={18} color="#334155" />
              <Text style={styles.closeFooterBtnText}>Close (Esc)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "92%",
    maxWidth: 960,
    maxHeight: "88%",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
    display: "flex",
    flexDirection: "column",
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.4,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  controlsBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    flexWrap: "wrap",
    gap: 12,
  },
  tabsContainer: {
    flexDirection: "row",
    gap: 8,
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  tabButtonActive: {
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  tabButtonTextActive: {
    fontWeight: "800",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    overflow: "hidden",
    minWidth: 320,
    flex: 1,
    maxWidth: 420,
  },
  searchInput: {
    flex: 1,
    height: 36,
    paddingHorizontal: 8,
    fontSize: 13,
    color: "#0F172A",
    outlineStyle: "none" as any,
  },
  searchBtn: {
    paddingHorizontal: 14,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  searchBtnText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "700",
  },
  gridContainer: {
    flex: 1,
    minHeight: 320,
    backgroundColor: "#FFFFFF",
  },
  scrollArea: {
    flex: 1,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#CBD5E1",
  },
  tableHeaderCol: {
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
    textTransform: "uppercase",
  },
  tableDataRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    alignItems: "center",
  },
  tableDataRowAlt: {
    backgroundColor: "#FAFAFA",
  },
  tableDataCol: {
    fontSize: 13,
    color: "#334155",
  },
  tableDataColBold: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },
  tableDataColDue: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#DC2626",
  },
  loadingBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
    gap: 12,
  },
  loadingText: {
    fontSize: 13.5,
    color: "#64748B",
    fontWeight: "600",
  },
  emptyBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 36,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#334155",
    marginTop: 6,
  },
  emptySub: {
    fontSize: 13,
    color: "#94A3B8",
  },
  errorText: {
    fontSize: 14,
    color: "#EF4444",
    fontWeight: "600",
    textAlign: "center",
  },
  footerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  footerSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  footerSummaryLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  footerSummaryVal: {
    fontSize: 15,
    fontWeight: "900",
    color: "#DC2626",
  },
  closeFooterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  closeFooterBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
});

