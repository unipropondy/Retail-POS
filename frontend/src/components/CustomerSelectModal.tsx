// ==============================================================================
// Author: JAVITH, BAVANI 18-11-2026
// Project: Supermarket Retail POS
// Component: CustomerSelectModal (frmAddCustomerDetails.vb & frmCustomer.vb Parity)
// Description: Customer lookup and Credit Limit verification modal for Credit Sales.
//              Fully aligned with modern POS theme (crimson header, clean data grid).
// ==============================================================================

import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export interface CustomerItem {
  CustomerCode: string;
  CustomerName: string;
  Phone?: string;
  Address1?: string;
  CreditLimit: number;
  outstanding?: number;
  availableCredit?: number;
}

interface CustomerSelectModalProps {
  visible: boolean;
  backendUrl: string;
  primaryColor?: string;
  currentCustomerCode?: string;
  requiredAmount?: number;
  onSelectCustomer: (customer: CustomerItem) => void;
  onClose: () => void;
}

export const CustomerSelectModal: React.FC<CustomerSelectModalProps> = ({
  visible,
  backendUrl,
  primaryColor = "#881337", // Default POS theme primary color
  currentCustomerCode,
  requiredAmount = 0,
  onSelectCustomer,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedCust, setSelectedCust] = useState<CustomerItem | null>(null);
  const [checkingCredit, setCheckingCredit] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string>("");

  useEffect(() => {
    if (visible) {
      setSearchQuery("");
      setSelectedCust(null);
      setValidationError("");
      fetchCustomers("");
    }
  }, [visible]);

  const fetchCustomers = async (term: string) => {
    setLoading(true);
    setValidationError("");
    try {
      const res = await fetch(
        `${backendUrl}/api/customers/search?query=${encodeURIComponent(term)}`
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setCustomers(data.customers || []);
      } else {
        setCustomers([]);
      }
    } catch (err: any) {
      setCustomers([]);
      setValidationError("Failed to search customers: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (cust: CustomerItem) => {
    setSelectedCust(cust);
    setCheckingCredit(true);
    setValidationError("");
    try {
      const res = await fetch(
        `${backendUrl}/api/customers/credit-check/${encodeURIComponent(cust.CustomerCode)}`
      );
      const data = await res.json();
      if (res.ok && data.success && data.customer) {
        const enriched: CustomerItem = data.customer;
        setSelectedCust(enriched);

        const available = Number(enriched.availableCredit || 0);
        if (requiredAmount > 0 && available < requiredAmount) {
          setValidationError(
            `Customer available credit ($${available.toFixed(2)}) is less than required sale amount ($${requiredAmount.toFixed(2)}).`
          );
        }
      } else {
        setValidationError(data.message || "Could not retrieve credit balance.");
      }
    } catch (err: any) {
      setValidationError("Credit check error: " + err.message);
    } finally {
      setCheckingCredit(false);
    }
  };

  const handleConfirm = () => {
    if (!selectedCust) {
      setValidationError("Please select a customer.");
      return;
    }
    const available = Number(selectedCust.availableCredit ?? selectedCust.CreditLimit ?? 0);
    if (requiredAmount > 0 && available < requiredAmount) {
      setValidationError(
        `Cannot proceed: Available credit ($${available.toFixed(2)}) exceeded!`
      );
      return;
    }
    onSelectCustomer(selectedCust);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {/* 1. TOP HEADER (Themed with app primaryColor) */}
          <View style={[styles.header, { backgroundColor: primaryColor }]}>
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons name="account-search" size={22} color="#ffffff" />
              <Text style={styles.headerTitle}>Select Customer for Credit Sale</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* 2. BODY CONTENT */}
          <View style={styles.body}>
            {/* Validation Banner */}
            {validationError ? (
              <View style={styles.alertBanner}>
                <MaterialCommunityIcons name="alert-circle" size={18} color="#b91c1c" />
                <Text style={styles.alertText}>{validationError}</Text>
              </View>
            ) : null}

            {/* Filter / Search Card */}
            <View style={styles.searchCard}>
              <View style={styles.searchRow}>
                <MaterialCommunityIcons name="magnify" size={20} color="#64748b" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search customer by Code, Name, or Phone number..."
                  placeholderTextColor="#94a3b8"
                  value={searchQuery}
                  onChangeText={(txt) => {
                    setSearchQuery(txt);
                    fetchCustomers(txt);
                  }}
                  autoFocus
                />
                {searchQuery ? (
                  <TouchableOpacity onPress={() => { setSearchQuery(""); fetchCustomers(""); }}>
                    <MaterialCommunityIcons name="close-circle" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {/* Customer Table Grid */}
            <View style={styles.gridCard}>
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { width: 120 }]}>Customer Code</Text>
                <Text style={[styles.thCell, { flex: 1 }]}>Customer Name</Text>
                <Text style={[styles.thCell, { width: 130 }]}>Phone</Text>
                <Text style={[styles.thCell, { width: 130, textAlign: "right" }]}>Credit Limit</Text>
              </View>

              {loading ? (
                <View style={styles.centerBox}>
                  <ActivityIndicator size="large" color={primaryColor} />
                  <Text style={styles.loadingText}>Searching customer records...</Text>
                </View>
              ) : customers.length === 0 ? (
                <View style={styles.centerBox}>
                  <MaterialCommunityIcons name="account-question-outline" size={44} color="#94a3b8" />
                  <Text style={styles.emptyTitle}>No matching customers found</Text>
                  <Text style={styles.emptySub}>
                    Try searching with another keyword or customer code from tblInvCustomer.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={customers}
                  keyExtractor={(item) => item.CustomerCode}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item, index }) => {
                    const isSelected = selectedCust?.CustomerCode === item.CustomerCode;
                    return (
                      <TouchableOpacity
                        style={[
                          styles.tableRow,
                          index % 2 === 1 && styles.altRow,
                          isSelected && styles.selectedRow,
                        ]}
                        onPress={() => handleSelect(item)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.tdCell, { width: 120, fontWeight: "700", color: isSelected ? "#881337" : "#0f172a" }]}>
                          {item.CustomerCode}
                        </Text>
                        <Text style={[styles.tdCell, { flex: 1, fontWeight: "600" }]} numberOfLines={1}>
                          {item.CustomerName}
                        </Text>
                        <Text style={[styles.tdCell, { width: 130, color: "#475569" }]}>
                          {item.Phone || "-"}
                        </Text>
                        <Text style={[styles.tdCell, { width: 130, textAlign: "right", fontWeight: "800", color: "#0284c7" }]}>
                          ${Number(item.CreditLimit || 0).toFixed(2)}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
            </View>

            {/* Real-time A/R Credit Ledger Preview */}
            {selectedCust ? (
              <View style={styles.creditSummaryCard}>
                <View style={styles.creditStatItem}>
                  <Text style={styles.statLabel}>CUSTOMER</Text>
                  <Text style={styles.statValue} numberOfLines={1}>
                    {selectedCust.CustomerName} ({selectedCust.CustomerCode})
                  </Text>
                </View>
                <View style={styles.creditStatItem}>
                  <Text style={styles.statLabel}>CREDIT LIMIT</Text>
                  <Text style={styles.statValue}>
                    ${Number(selectedCust.CreditLimit || 0).toFixed(2)}
                  </Text>
                </View>
                <View style={styles.creditStatItem}>
                  <Text style={styles.statLabel}>OUTSTANDING</Text>
                  <Text style={[styles.statValue, { color: "#dc2626" }]}>
                    ${Number(selectedCust.outstanding || 0).toFixed(2)}
                  </Text>
                </View>
                <View style={styles.creditStatItem}>
                  <Text style={styles.statLabel}>AVAILABLE CREDIT</Text>
                  <Text style={[styles.statValue, { color: "#16a34a", fontWeight: "800", fontSize: 15 }]}>
                    ${Number(selectedCust.availableCredit ?? selectedCust.CreditLimit ?? 0).toFixed(2)}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* 3. FOOTER ACTIONS */}
          <View style={styles.footer}>
            <View style={styles.previewInfo}>
              {selectedCust ? (
                <Text style={styles.previewText}>
                  Selected: <Text style={{ fontWeight: "800", color: "#0f172a" }}>{selectedCust.CustomerName}</Text> (Available: ${Number(selectedCust.availableCredit ?? selectedCust.CreditLimit ?? 0).toFixed(2)})
                </Text>
              ) : (
                <Text style={styles.noSelectionText}>Please select a customer from the table above.</Text>
              )}
            </View>

            <View style={styles.footerBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmBtn,
                  { backgroundColor: selectedCust && !checkingCredit ? primaryColor : "#cbd5e1" },
                ]}
                disabled={!selectedCust || checkingCredit}
                onPress={handleConfirm}
              >
                {checkingCredit ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="check" size={18} color="#ffffff" />
                    <Text style={styles.confirmBtnText}>Attach to Sale</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 14,
  },
  container: {
    width: "98%",
    maxWidth: 900,
    height: "88%",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
    flexDirection: "column",
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
    gap: 10,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.3,
  },
  badge: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ffffff",
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    flex: 1,
    padding: 12,
    backgroundColor: "#f8fafc",
    gap: 10,
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fee2e2",
    borderColor: "#f87171",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  alertText: {
    color: "#991b1b",
    fontSize: 12.5,
    fontWeight: "700",
    flex: 1,
  },
  searchCard: {
    backgroundColor: "#ffffff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 8,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 38,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "600",
    height: "100%",
    borderWidth: 0,
    backgroundColor: "transparent",
    outlineStyle: "none" as any,
  },
  gridCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1.5,
    borderBottomColor: "#cbd5e1",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  thCell: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#334155",
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  altRow: {
    backgroundColor: "#fafafa",
  },
  selectedRow: {
    backgroundColor: "#fef3c7", // Gold highlight matching SearchModal
  },
  tdCell: {
    fontSize: 12,
    color: "#0f172a",
    paddingHorizontal: 4,
  },
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#475569",
    marginTop: 12,
  },
  emptySub: {
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 4,
    maxWidth: 380,
  },
  creditSummaryCard: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    padding: 10,
    gap: 12,
  },
  creditStatItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748b",
    marginBottom: 2,
  },
  statValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  footer: {
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewInfo: {
    flex: 1,
    marginRight: 12,
  },
  previewText: {
    fontSize: 12.5,
    color: "#475569",
  },
  noSelectionText: {
    fontSize: 12,
    fontStyle: "italic",
    color: "#94a3b8",
  },
  footerBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: "#f1f5f9",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  cancelBtnText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#475569",
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 4,
  },
  confirmBtnText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#ffffff",
  },
});
