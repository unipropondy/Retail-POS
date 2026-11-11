// ==============================================================================
// Project: Supermarket Retail POS
// Module: View Bill / Last Transaction Screen (frmLastTransaction.vb)
// File: frontend/src/components/ViewBillModal.tsx
// Description: Exact 1:1 reproduction of VB.NET frmLastTransaction matching screenshot:
//   - Header Title Bar with icon & close button
//   - Top Search & Filter Bar:
//       * Date Checkbox (chkDate) + From Date (dtpFrom) + To Date (dtpTo)
//       * Invoice No. (txtInvoiceNo)
//       * CREDIT BILLS (Chk_Credit) Checkbox
//       * ALL SALES (chkAllSales) Checkbox
//       * Fetch Button (Green gradient / classic POS style)
//   - Headers Box (dgvHeader):
//       * Columns: InvoiceNo, Date Time, User Name, Member, Member Name, Paymode, Paid
//       * Row selection with full-row dark blue highlight
//   - Details Box (dgvDetail):
//       * Columns: Barcode, Qty, Description, Paid
//   - Bottom Action Bar:
//       * Bill Cancel (cmdBillCancel)
//       * Convert Delivery (Butcondelivery)
//       * Total Amount Display (lblComputerTotal)
//       * Print Receipt (cmdInvoice)
//       * Exit (cmdExit)
// ==============================================================================

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Platform,
  ScrollView,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ThemeConfig } from "../utils/theme";
import ClearAdminAuthModal from "./ClearAdminAuthModal";

export interface TransactionHeaderItem {
  invoiceNo: string;
  modifyDate: string;
  terminalCode: string;
  cashierId: string;
  memberCode: string;
  memberName: string;
  amount: number;
  netTotal: number;
  payModes: string[];
  payModeText: string;
}

export interface TransactionDetailItem {
  inventoryCode: string;
  barcode: string;
  description: string;
  qty: number;
  price: number;
  totalValue: number;
  subTotal: number;
  discount: number;
  netDiscount: number;
  netAmount: number;
  gst: number;
  salesmanId?: string;
  deptCode?: string;
  categoryCode?: string;
  brandCode?: string;
  prmFlag?: string;
}

export interface BillPaymentItem {
  payMode: string;
  amount: number;
  commission: number;
  slipNo: string;
}

export interface CompleteBillHeader {
  invoiceNo: string;
  invoiceDate: string;
  totalValue: number;
  netTotal: number;
  tenderAmount: number;
  balance: number;
  gst: number;
  totalDiscount: number;
  cashierId: string;
  customerCode: string;
  customerName: string;
  terminalCode: string;
  locationCode: string;
  totalLines: number;
  roundOff: number;
  remarks: string;
  delivered?: string;
  accFlag?: string;
  payModeSummary: string;
}

export interface MemberSearchItem {
  MemberCode: string;
  MemberName: string;
  Mobile?: string;
  Address1?: string;
}

interface ViewBillModalProps {
  visible: boolean;
  onClose: () => void;
  apiUrl: string;
  activeTerminal?: string;
  activeCashier?: string;
  activeLocation?: string;
  theme?: ThemeConfig;
  primaryColor?: string;
  onReprintBill?: (invoiceNo: string) => void;
  onAdminAuthRequest?: (username: string, pass: string) => Promise<boolean>;
}

// Format date to DD/MM/YYYY
function formatDDMMYYYY(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

// Format timestamp to DD/MM/YYYY HH:mm:ss matching VB.NET FormatDateTime
function formatDateTimeFull(val: string | Date): string {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hrs = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  const secs = String(d.getSeconds()).padStart(2, "0");
  return `${day}/${month}/${year} ${hrs}:${mins}:${secs}`;
}

export default function ViewBillModal({
  visible,
  onClose,
  apiUrl,
  activeTerminal = "",
  activeCashier = "UPS",
  activeLocation = "HQ",
  theme,
  primaryColor = "#7A1C30",
  onReprintBill,
  onAdminAuthRequest,
}: ViewBillModalProps) {
  // ----------------------------------------------------------------------------
  // FILTER STATES (matching frmLastTransaction.vb)
  // ----------------------------------------------------------------------------
  const todayFormatted = useMemo(() => formatDDMMYYYY(new Date()), []);
  const [useDateFilter, setUseDateFilter] = useState<boolean>(false);
  const [fromDate, setFromDate] = useState<string>(todayFormatted);
  const [toDate, setToDate] = useState<string>(todayFormatted);
  const [invoiceFilter, setInvoiceFilter] = useState<string>("");
  const [isCreditMode, setIsCreditMode] = useState<boolean>(false);
  const [isAllSales, setIsAllSales] = useState<boolean>(false);

  // ----------------------------------------------------------------------------
  // DATA STATES
  // ----------------------------------------------------------------------------
  const [transactions, setTransactions] = useState<TransactionHeaderItem[]>([]);
  const [selectedInvoiceNo, setSelectedInvoiceNo] = useState<string>("");
  const [loadingList, setLoadingList] = useState<boolean>(false);

  // Selected Bill Details State (dgvDetail)
  const [billHeader, setBillHeader] = useState<CompleteBillHeader | null>(null);
  const [billItems, setBillItems] = useState<TransactionDetailItem[]>([]);
  const [billPayments, setBillPayments] = useState<BillPaymentItem[]>([]);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  // Modal dialog states
  const [showAdminAuthModal, setShowAdminAuthModal] = useState<boolean>(false);
  const [showMemberSearchModal, setShowMemberSearchModal] = useState<boolean>(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState<string>("");
  const [memberSearchResults, setMemberSearchResults] = useState<MemberSearchItem[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState<boolean>(false);
  const [cancelLoading, setCancelLoading] = useState<boolean>(false);
  const [showVoidConfirmModal, setShowVoidConfirmModal] = useState<boolean>(false);
  const [deliveryLoading, setDeliveryLoading] = useState<boolean>(false);

  // Feedback Notification Banner
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const showNotice = (text: string, type: "success" | "error" | "info" = "info") => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage(null);
    }, 4500);
  };

  // ----------------------------------------------------------------------------
  // TOTAL AMOUNT CALCULATION (lblComputerTotal in frmLastTransaction.vb)
  // Sum of all loaded transactions' NetTotal / Amount in dgvHeader
  // ----------------------------------------------------------------------------
  const totalGridAmount = useMemo(() => {
    return transactions.reduce((acc, t) => acc + (t.amount || t.netTotal || 0), 0);
  }, [transactions]);

  // Load Transactions when modal opens
  useEffect(() => {
    if (visible) {
      fetchTransactions();
    } else {
      setSelectedInvoiceNo("");
      setBillHeader(null);
      setBillItems([]);
      setBillPayments([]);
      setStatusMessage(null);
    }
  }, [visible]);

  // ----------------------------------------------------------------------------
  // FETCH TRANSACTIONS (cmdFetch_Click & subGetHeaderData)
  // ----------------------------------------------------------------------------
  const fetchTransactions = async () => {
    setLoadingList(true);
    try {
      const queryParams = new URLSearchParams({
        transactionLimit: "ALL",
        isCredit: String(isCreditMode),
        allSales: String(isAllSales),
        dateFilter: String(useDateFilter),
        terminalCode: activeTerminal,
      });

      if (invoiceFilter.trim()) queryParams.append("invoiceNo", invoiceFilter.trim());
      if (useDateFilter) {
        queryParams.append("fromDate", fromDate);
        queryParams.append("toDate", toDate);
      }

      const res = await fetch(`${apiUrl}/api/bills/transactions?${queryParams.toString()}`);
      const data = await res.json();

      if (res.ok && data.success && Array.isArray(data.transactions)) {
        setTransactions(data.transactions);
        if (data.transactions.length > 0) {
          const firstInv = data.transactions[0].invoiceNo;
          setSelectedInvoiceNo(firstInv);
          fetchBillDetails(firstInv);
        } else {
          setSelectedInvoiceNo("");
          setBillHeader(null);
          setBillItems([]);
          setBillPayments([]);
        }
      } else {
        setTransactions([]);
        setSelectedInvoiceNo("");
        setBillHeader(null);
        setBillItems([]);
        setBillPayments([]);
      }
    } catch (err: any) {
      console.error("Failed to fetch transactions:", err.message);
      showNotice(err.message || "Failed to load transactions", "error");
    } finally {
      setLoadingList(false);
    }
  };

  // ----------------------------------------------------------------------------
  // FETCH BILL DETAILS (subGetDetailData & fncGetLastTransactionDetail)
  // ----------------------------------------------------------------------------
  const fetchBillDetails = async (invoiceNo: string) => {
    if (!invoiceNo) return;
    setLoadingDetails(true);
    try {
      const res = await fetch(`${apiUrl}/api/bills/${encodeURIComponent(invoiceNo.trim())}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setBillHeader(data.header);
        setBillItems(data.items || []);
        setBillPayments(data.payments || []);
      } else {
        setBillHeader(null);
        setBillItems([]);
        setBillPayments([]);
      }
    } catch (err: any) {
      console.error("Failed to fetch bill details:", err.message);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleSelectInvoice = (invoiceNo: string) => {
    if (invoiceNo === selectedInvoiceNo) return;
    setSelectedInvoiceNo(invoiceNo);
    fetchBillDetails(invoiceNo);
  };

  // ----------------------------------------------------------------------------
  // BUTTON 1: BILL CANCEL FLOW (cmdBillCancel_Click in frmLastTransaction.vb)
  // ----------------------------------------------------------------------------
  const handleBillCancelClick = () => {
    if (!selectedInvoiceNo) {
      showNotice("Please select a bill from the list to cancel.", "error");
      return;
    }
    setShowAdminAuthModal(true);
  };

  const handleAdminAuthSubmit = async (user: string, pass: string): Promise<boolean> => {
    try {
      let isAuthorized = false;
      if (onAdminAuthRequest) {
        isAuthorized = await onAdminAuthRequest(user, pass);
      } else {
        const authRes = await fetch(`${apiUrl}/api/auth/verify-admin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: user, password: pass }),
        });
        const authData = await authRes.json();
        isAuthorized = authRes.ok && authData.success;
      }

      if (isAuthorized) {
        setShowAdminAuthModal(false);
        setShowVoidConfirmModal(true);
        return true;
      } else {
        showNotice("Invalid Admin or Supervisor Credentials.", "error");
        return false;
      }
    } catch (err: any) {
      showNotice(err.message || "Admin authorization failed", "error");
      return false;
    }
  };

  const executeBillCancel = async (printVoid: boolean) => {
    setShowVoidConfirmModal(false);
    setCancelLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/bills/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNo: selectedInvoiceNo,
          cashierId: activeCashier,
          locationCode: activeLocation,
          printVoidBill: printVoid,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showNotice(
          `Bill #${selectedInvoiceNo} cancelled successfully (Cancel Ref #${data.billCancelNo}).`,
          "success"
        );
        fetchTransactions();
      } else {
        showNotice(data.message || "Failed to cancel bill.", "error");
      }
    } catch (err: any) {
      showNotice(err.message || "Network error while cancelling bill.", "error");
    } finally {
      setCancelLoading(false);
    }
  };

  // ----------------------------------------------------------------------------
  // BUTTON 2: CONVERT DELIVERY FLOW (Butcondelivery_Click in frmLastTransaction.vb)
  // ----------------------------------------------------------------------------
  const handleConvertDeliveryClick = async () => {
    if (!selectedInvoiceNo) {
      showNotice("Please select a bill from the list.", "error");
      return;
    }

    setDeliveryLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/bills/check-delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceNo: selectedInvoiceNo }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotice(data.message || "Failed to retrieve delivery information.", "error");
        return;
      }

      if (data.accFlag1 === "1" || data.isDelivered) {
        showNotice("This Sales already delivered!!", "error");
        return;
      }

      const custCode = (data.customerCode || "").trim().toUpperCase();
      if (custCode === "CASH" || custCode === "") {
        showNotice("Please Scan the Member", "info");
        setShowMemberSearchModal(true);
        searchMembers("");
        return;
      }

      await executeDeliveryCreation(selectedInvoiceNo);
    } catch (err: any) {
      showNotice(err.message || "Network error during delivery conversion", "error");
    } finally {
      setDeliveryLoading(false);
    }
  };

  const executeDeliveryCreation = async (invNo: string) => {
    setDeliveryLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/bills/execute-delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceNo: invNo }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showNotice("Delivered Created Successfully", "success");
        fetchTransactions();
      } else {
        showNotice(data.message || "Failed to create delivery", "error");
      }
    } catch (err: any) {
      showNotice(err.message || "Error executing delivery", "error");
    } finally {
      setDeliveryLoading(false);
    }
  };

  const searchMembers = async (q: string) => {
    setMemberSearchLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/bills/search-members?search=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.members)) {
        setMemberSearchResults(data.members);
      } else {
        setMemberSearchResults([]);
      }
    } catch {
      setMemberSearchResults([]);
    } finally {
      setMemberSearchLoading(false);
    }
  };

  const handleSelectMemberForDelivery = async (memberCode: string) => {
    setShowMemberSearchModal(false);
    setDeliveryLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/bills/update-delivery-member`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNo: selectedInvoiceNo,
          memberCode,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotice(`Member ${memberCode} assigned to Invoice #${selectedInvoiceNo}.`, "success");
        fetchTransactions();
      } else {
        showNotice(data.message || "Failed to update member code", "error");
      }
    } catch (err: any) {
      showNotice(err.message || "Error updating member for invoice", "error");
    } finally {
      setDeliveryLoading(false);
    }
  };

  // ----------------------------------------------------------------------------
  // BUTTON 3: PRINT RECEIPT FLOW (cmdInvoice_Click & subReceiptReportPrint)
  // ----------------------------------------------------------------------------
  const handlePrintReceiptClick = () => {
    if (!selectedInvoiceNo) {
      showNotice("Please select a bill from the list to print.", "error");
      return;
    }

    if (onReprintBill) {
      onReprintBill(selectedInvoiceNo);
      showNotice(`Printing receipt for Invoice #${selectedInvoiceNo}...`, "info");
    } else {
      showNotice(`Printing receipt for Invoice #${selectedInvoiceNo}...`, "info");
    }
  };

  // ----------------------------------------------------------------------------
  // BUTTON 4: EXIT FLOW
  // ----------------------------------------------------------------------------
  const handleExitClick = () => {
    onClose();
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.windowFrame}>
          {/* =====================================================================
              1. WINDOW TITLE BAR (Last Transaction)
          ===================================================================== */}
          <View style={styles.windowTitleBar}>
            <View style={styles.titleLeft}>
              <View style={styles.appIconBadge}>
                <View style={styles.iconSquareYellow} />
                <View style={styles.iconSquareBlue} />
              </View>
              <Text style={styles.windowTitleText}>Last Transaction</Text>
            </View>

            <TouchableOpacity onPress={onClose} style={styles.windowCloseBtn} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Feedback Notice Banner if active */}
          {statusMessage && (
            <View
              style={[
                styles.noticeBanner,
                statusMessage.type === "success" && styles.noticeSuccess,
                statusMessage.type === "error" && styles.noticeError,
                statusMessage.type === "info" && styles.noticeInfo,
              ]}
            >
              <MaterialCommunityIcons
                name={
                  statusMessage.type === "success"
                    ? "check-circle"
                    : statusMessage.type === "error"
                    ? "alert-circle"
                    : "information"
                }
                size={16}
                color={
                  statusMessage.type === "success"
                    ? "#15803d"
                    : statusMessage.type === "error"
                    ? "#b91c1c"
                    : "#1d4ed8"
                }
              />
              <Text
                style={[
                  styles.noticeText,
                  statusMessage.type === "success" && { color: "#15803d" },
                  statusMessage.type === "error" && { color: "#b91c1c" },
                  statusMessage.type === "info" && { color: "#1d4ed8" },
                ]}
              >
                {statusMessage.text}
              </Text>
            </View>
          )}

          {/* =====================================================================
              2. TOP FILTER & SEARCH SECTION
          ===================================================================== */}
          <View style={styles.topFilterContainer}>
            {/* Left Block: Date Checkbox & Date Pickers */}
            <View style={styles.filterLeftBlock}>
              {/* Date Filter Enable Checkbox */}
              <TouchableOpacity
                style={styles.chkDateBox}
                onPress={() => setUseDateFilter(!useDateFilter)}
                activeOpacity={0.8}
              >
                <View style={[styles.customSquareBox, useDateFilter && styles.customSquareBoxActive]}>
                  {useDateFilter && <View style={styles.innerSquareChecked} />}
                </View>
              </TouchableOpacity>

              {/* From Date & To Date Inputs */}
              <View style={styles.dateInputsCol}>
                <View style={styles.dateRow}>
                  <Text style={styles.dateLabel}>From Date</Text>
                  <View style={styles.datePickerField}>
                    <TextInput
                      style={styles.dateTextInput}
                      value={fromDate}
                      onChangeText={setFromDate}
                      placeholder="DD/MM/YYYY"
                      placeholderTextColor="#64748b"
                    />
                    <MaterialCommunityIcons name="chevron-down" size={16} color="#475569" />
                  </View>
                </View>

                <View style={[styles.dateRow, { marginTop: 6 }]}>
                  <Text style={styles.dateLabel}>To Date</Text>
                  <View style={styles.datePickerField}>
                    <TextInput
                      style={styles.dateTextInput}
                      value={toDate}
                      onChangeText={setToDate}
                      placeholder="DD/MM/YYYY"
                      placeholderTextColor="#64748b"
                    />
                    <MaterialCommunityIcons name="chevron-down" size={16} color="#475569" />
                  </View>
                </View>
              </View>
            </View>

            {/* Middle Block: Invoice No Textbox & Empty Row */}
            <View style={styles.filterMidBlock}>
              <Text style={styles.invoiceNoLabel}>Invoice No.</Text>
              <View style={styles.invoiceInputsCol}>
                <View style={styles.invEmptyTopField} />
                <TextInput
                  style={styles.invoiceTextInput}
                  value={invoiceFilter}
                  onChangeText={setInvoiceFilter}
                  onSubmitEditing={fetchTransactions}
                  placeholder=""
                />
              </View>
            </View>

            {/* Right Block: Checkboxes & Fetch Button */}
            <View style={styles.filterRightBlock}>
              <View style={styles.checkboxGroupCol}>
                {/* Credit Bills Checkbox */}
                <TouchableOpacity
                  style={styles.filterCheckboxRow}
                  onPress={() => setIsCreditMode(!isCreditMode)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.customSquareBox, isCreditMode && styles.customSquareBoxActive]}>
                    {isCreditMode && <View style={styles.innerSquareChecked} />}
                  </View>
                  <Text style={styles.checkboxLabel}>CREDIT BILLS</Text>
                </TouchableOpacity>

                {/* All Sales Checkbox */}
                <TouchableOpacity
                  style={[styles.filterCheckboxRow, { marginTop: 6 }]}
                  onPress={() => setIsAllSales(!isAllSales)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.customSquareBox, isAllSales && styles.customSquareBoxActive]}>
                    {isAllSales && <View style={styles.innerSquareChecked} />}
                  </View>
                  <Text style={styles.checkboxLabel}>ALL SALES</Text>
                </TouchableOpacity>
              </View>

              {/* Fetch Button (Classic Lime Green Gradient POS button) */}
              <TouchableOpacity
                style={styles.fetchButton}
                onPress={fetchTransactions}
                activeOpacity={0.85}
              >
                {loadingList ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.fetchButtonText}>Fetch</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* =====================================================================
              3. HEADERS GROUP BOX (dgvHeader)
              Columns: InvoiceNo | Date Time | User Name | Member | Member Name | Paymode | Paid
          ===================================================================== */}
          <View style={styles.groupBoxHeaders}>
            {/* Group Label */}
            <View style={styles.groupLabelContainer}>
              <Text style={styles.groupLabelText}>Headers</Text>
            </View>

            {/* Header Table Header */}
            <View style={styles.headerGridHeaderRow}>
              <Text style={[styles.gridTh, { width: 110 }]}>InvoiceNo</Text>
              <Text style={[styles.gridTh, { width: 160 }]}>Date Time</Text>
              <Text style={[styles.gridTh, { width: 120 }]}>User Name</Text>
              <Text style={[styles.gridTh, { width: 110 }]}>Member</Text>
              <Text style={[styles.gridTh, { width: 130 }]}>Member Name</Text>
              <Text style={[styles.gridTh, { width: 190 }]}>Paymode</Text>
              <Text style={[styles.gridTh, { flex: 1, textAlign: "right", paddingRight: 12 }]}>Paid</Text>
            </View>

            {/* Header Table List */}
            {loadingList ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#22c55e" />
                <Text style={styles.loadingLabel}>Loading headers...</Text>
              </View>
            ) : transactions.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyLabel}>No records found</Text>
              </View>
            ) : (
              <FlatList
                data={transactions}
                keyExtractor={(item) => item.invoiceNo}
                style={styles.headersList}
                renderItem={({ item }) => {
                  const isSelected = selectedInvoiceNo === item.invoiceNo;
                  return (
                    <TouchableOpacity
                      style={[styles.headerGridRow, isSelected && styles.headerGridRowSelected]}
                      onPress={() => handleSelectInvoice(item.invoiceNo)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.gridTd,
                          { width: 110 },
                          isSelected && styles.gridTdSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {item.invoiceNo}
                      </Text>
                      <Text
                        style={[
                          styles.gridTd,
                          { width: 160 },
                          isSelected && styles.gridTdSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {formatDateTimeFull(item.modifyDate)}
                      </Text>
                      <Text
                        style={[
                          styles.gridTd,
                          { width: 120 },
                          isSelected && styles.gridTdSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {item.cashierId || "UPS"}
                      </Text>
                      <Text
                        style={[
                          styles.gridTd,
                          { width: 110 },
                          isSelected && styles.gridTdSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {item.memberCode || "CASH"}
                      </Text>
                      <Text
                        style={[
                          styles.gridTd,
                          { width: 130 },
                          isSelected && styles.gridTdSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {item.memberName || "CASH"}
                      </Text>
                      <Text
                        style={[
                          styles.gridTd,
                          { width: 190 },
                          isSelected && styles.gridTdSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {item.payModeText || "CASH"}
                      </Text>
                      <Text
                        style={[
                          styles.gridTd,
                          { flex: 1, textAlign: "right", paddingRight: 12 },
                          isSelected && styles.gridTdSelected,
                        ]}
                      >
                        {(item.amount || item.netTotal || 0).toFixed(2)}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>

          {/* =====================================================================
              4. DETAILS GROUP BOX (dgvDetail)
              Columns: Barcode | Qty | Description | Paid
          ===================================================================== */}
          <View style={styles.groupBoxDetails}>
            {/* Group Label */}
            <View style={styles.groupLabelContainer}>
              <Text style={styles.groupLabelText}>Details</Text>
            </View>

            {/* Details Table Header */}
            <View style={styles.detailsGridHeaderRow}>
              <Text style={[styles.detailTh, { width: 160 }]}>Barcode</Text>
              <Text style={[styles.detailTh, { width: 90, textAlign: "right" }]}>Qty</Text>
              <Text style={[styles.detailTh, { flex: 1, paddingLeft: 12 }]}>Description</Text>
              <Text style={[styles.detailTh, { width: 120, textAlign: "right", paddingRight: 12 }]}>Paid</Text>
            </View>

            {/* Details Table List */}
            {loadingDetails ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#22c55e" />
                <Text style={styles.loadingLabel}>Loading details...</Text>
              </View>
            ) : billItems.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyLabel}>No details to display</Text>
              </View>
            ) : (
              <FlatList
                data={billItems}
                keyExtractor={(item, index) => `${item.inventoryCode}_${index}`}
                style={styles.detailsList}
                renderItem={({ item, index }) => {
                  return (
                    <View
                      style={[
                        styles.detailGridRow,
                        index === 0 && styles.detailGridRowFirstSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.detailTd,
                          { width: 160 },
                          index === 0 && styles.detailTdFirstSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {item.barcode || item.inventoryCode}
                      </Text>
                      <Text
                        style={[
                          styles.detailTd,
                          { width: 90, textAlign: "right" },
                          index === 0 && styles.detailTdFirstSelected,
                        ]}
                      >
                        {item.qty.toFixed(2)}
                      </Text>
                      <Text
                        style={[
                          styles.detailTd,
                          { flex: 1, paddingLeft: 12 },
                          index === 0 && styles.detailTdFirstSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {item.description}
                      </Text>
                      <Text
                        style={[
                          styles.detailTd,
                          { width: 120, textAlign: "right", paddingRight: 12 },
                          index === 0 && styles.detailTdFirstSelected,
                        ]}
                      >
                        {item.netAmount.toFixed(2)}
                      </Text>
                    </View>
                  );
                }}
              />
            )}
          </View>

          {/* =====================================================================
              5. BOTTOM ACTION SECTION
              [Bill Cancel] [Convert Delivery] [Total Amount: 777.40] [Print Receipt] [Exit]
          ===================================================================== */}
          <View style={styles.bottomBarContainer}>
            {/* Left Button 1: Bill Cancel */}
            <TouchableOpacity
              style={[
                styles.classicButton,
                styles.btnCancelStyle,
                (!selectedInvoiceNo || cancelLoading) && styles.btnDisabled,
              ]}
              onPress={handleBillCancelClick}
              disabled={!selectedInvoiceNo || cancelLoading}
              activeOpacity={0.8}
            >
              {cancelLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.classicButtonText}>Bill Cancel</Text>
              )}
            </TouchableOpacity>

            {/* Left Button 2: Convert Delivery */}
            <TouchableOpacity
              style={[
                styles.classicButton,
                styles.btnDeliveryStyle,
                (!selectedInvoiceNo || deliveryLoading) && styles.btnDisabled,
              ]}
              onPress={handleConvertDeliveryClick}
              disabled={!selectedInvoiceNo || deliveryLoading}
              activeOpacity={0.8}
            >
              {deliveryLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <View style={{ alignItems: "center" }}>
                  <Text style={styles.classicButtonText}>Convert</Text>
                  <Text style={styles.classicButtonText}>Delivery</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Center: Total Amount Display */}
            <View style={styles.totalAmountSection}>
              <Text style={styles.totalAmountLabel}>Total Amount</Text>
              <View style={styles.totalAmountDisplayBox}>
                <Text style={styles.totalAmountText}>{totalGridAmount.toFixed(2)}</Text>
              </View>
            </View>

            {/* Right Button 1: Print Receipt */}
            <TouchableOpacity
              style={[
                styles.classicButton,
                styles.btnPrintStyle,
                !selectedInvoiceNo && styles.btnDisabled,
              ]}
              onPress={handlePrintReceiptClick}
              disabled={!selectedInvoiceNo}
              activeOpacity={0.8}
            >
              <Text style={styles.classicButtonText}>Print Receipt</Text>
            </TouchableOpacity>

            {/* Right Button 2: Exit */}
            <TouchableOpacity
              style={[styles.classicButton, styles.btnExitStyle]}
              onPress={handleExitClick}
              activeOpacity={0.8}
            >
              <Text style={styles.classicButtonText}>Exit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* =========================================================================
          SUB-MODAL: Admin Authorization (frmAdminPassword) for Bill Cancel
      ========================================================================= */}
      <ClearAdminAuthModal
        visible={showAdminAuthModal}
        onClose={() => setShowAdminAuthModal(false)}
        onSubmit={handleAdminAuthSubmit}
        theme={theme}
        primaryColor={primaryColor}
        actionTitle="Bill Cancel Authorization (F3)"
        promptMessage="Cashier does not have permission to cancel bills (F3). Enter Admin or Supervisor credentials:"
      />

      {/* =========================================================================
          SUB-MODAL: Void Bill Printing Confirmation Prompt
      ========================================================================= */}
      <Modal
        visible={showVoidConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowVoidConfirmModal(false)}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Cancel Bill #{selectedInvoiceNo}</Text>
            <Text style={styles.confirmBody}>
              Do you want to cancel the bill {selectedInvoiceNo}?
            </Text>
            <Text style={[styles.confirmBody, { marginTop: 8, fontWeight: "700" }]}>
              Do you want to print the void bill?
            </Text>
            <View style={styles.confirmBtnRow}>
              <TouchableOpacity
                style={[styles.modalSubBtn, { backgroundColor: "#cbd5e1" }]}
                onPress={() => setShowVoidConfirmModal(false)}
              >
                <Text style={[styles.modalSubBtnText, { color: "#334155" }]}>Abort</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubBtn, { backgroundColor: "#64748b" }]}
                onPress={() => executeBillCancel(false)}
              >
                <Text style={styles.modalSubBtnText}>Cancel Without Print</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubBtn, { backgroundColor: "#22c55e" }]}
                onPress={() => executeBillCancel(true)}
              >
                <Text style={styles.modalSubBtnText}>Print & Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          SUB-MODAL: Member Search Dialog (frmMemberSearch for Convert Delivery)
      ========================================================================= */}
      <Modal
        visible={showMemberSearchModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowMemberSearchModal(false)}
      >
        <View style={styles.confirmBackdrop}>
          <View style={[styles.confirmCard, { maxWidth: 500, padding: 0, overflow: "hidden" }]}>
            <View style={styles.memberModalHeader}>
              <Text style={styles.memberModalTitle}>Scan / Select Member for Delivery</Text>
              <TouchableOpacity onPress={() => setShowMemberSearchModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>

            <View style={styles.memberInputRow}>
              <MaterialCommunityIcons name="magnify" size={20} color="#64748b" />
              <TextInput
                style={styles.memberTextInput}
                placeholder="Search Member Code, Name, or Mobile..."
                value={memberSearchQuery}
                onChangeText={(text) => {
                  setMemberSearchQuery(text);
                  searchMembers(text);
                }}
                autoFocus={true}
                placeholderTextColor="#94a3b8"
              />
            </View>

            {memberSearchLoading ? (
              <ActivityIndicator size="small" color="#22c55e" style={{ margin: 20 }} />
            ) : memberSearchResults.length === 0 ? (
              <View style={{ padding: 20, alignItems: "center" }}>
                <Text style={{ color: "#64748b", fontSize: 13 }}>
                  No members matched "{memberSearchQuery}".
                </Text>
                <TouchableOpacity
                  style={{
                    marginTop: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    backgroundColor: "#22c55e",
                    borderRadius: 4,
                  }}
                  onPress={() => handleSelectMemberForDelivery(memberSearchQuery.trim() || "CASH")}
                >
                  <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 12 }}>
                    Assign "{memberSearchQuery.trim() || "CASH"}" Anyway
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={memberSearchResults}
                keyExtractor={(item) => item.MemberCode}
                style={{ maxHeight: 280 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.memberItemRow}
                    onPress={() => handleSelectMemberForDelivery(item.MemberCode)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#0f172a" }}>
                        {item.MemberCode}
                      </Text>
                      <Text style={{ fontSize: 12, color: "#64748b" }}>{item.MemberName}</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: "#2563eb", marginRight: 8 }}>
                      {item.Mobile || ""}
                    </Text>
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
  },
  windowFrame: {
    width: "98%",
    maxWidth: 1100,
    height: "94%",
    maxHeight: 760,
    backgroundColor: "#262626", // Dark charcoal background matching VB.NET window
    borderWidth: 1,
    borderColor: "#4b5563",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },

  // ----------------------------------------------------------------------------
  // 1. WINDOW TITLE BAR
  // ----------------------------------------------------------------------------
  windowTitleBar: {
    height: 30,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#9ca3af",
  },
  titleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  appIconBadge: {
    width: 14,
    height: 14,
    backgroundColor: "#000000",
    position: "relative",
    borderWidth: 1,
    borderColor: "#000000",
  },
  iconSquareYellow: {
    width: 6,
    height: 6,
    backgroundColor: "#eab308",
    position: "absolute",
    top: 0,
    left: 0,
  },
  iconSquareBlue: {
    width: 6,
    height: 6,
    backgroundColor: "#2563eb",
    position: "absolute",
    bottom: 0,
    right: 0,
  },
  windowTitleText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#000000",
    fontFamily: Platform.OS === "android" ? "monospace" : "Segoe UI, Tahoma, sans-serif",
  },
  windowCloseBtn: {
    width: 22,
    height: 20,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 2,
  },

  // ----------------------------------------------------------------------------
  // FEEDBACK NOTICE BANNER
  // ----------------------------------------------------------------------------
  noticeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  noticeSuccess: {
    backgroundColor: "#dcfce7",
    borderBottomColor: "#86efac",
  },
  noticeError: {
    backgroundColor: "#fee2e2",
    borderBottomColor: "#fca5a5",
  },
  noticeInfo: {
    backgroundColor: "#dbeafe",
    borderBottomColor: "#93c5fd",
  },
  noticeText: {
    fontSize: 12,
    fontWeight: "700",
  },

  // ----------------------------------------------------------------------------
  // 2. TOP FILTER CONTAINER
  // ----------------------------------------------------------------------------
  topFilterContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#262626",
    gap: 24,
  },
  filterLeftBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chkDateBox: {
    padding: 4,
  },
  customSquareBox: {
    width: 15,
    height: 15,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  customSquareBoxActive: {
    backgroundColor: "#ffffff",
  },
  innerSquareChecked: {
    width: 9,
    height: 9,
    backgroundColor: "#000000",
  },
  dateInputsCol: {
    display: "flex",
    flexDirection: "column",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
    width: 65,
    textAlign: "right",
  },
  datePickerField: {
    width: 125,
    height: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#71717a",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  dateTextInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#000000",
    padding: 0,
    outlineStyle: "none" as any,
  },

  filterMidBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  invoiceNoLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
  },
  invoiceInputsCol: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  invEmptyTopField: {
    width: 180,
    height: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#71717a",
  },
  invoiceTextInput: {
    width: 180,
    height: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#71717a",
    paddingHorizontal: 6,
    paddingVertical: 0,
    fontSize: 12,
    fontWeight: "700",
    color: "#000000",
    outlineStyle: "none" as any,
  },

  filterRightBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  checkboxGroupCol: {
    display: "flex",
    flexDirection: "column",
  },
  filterCheckboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkboxLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.3,
  },
  fetchButton: {
    width: 120,
    height: 52,
    backgroundColor: "#65a30d", // Olive green gradient
    borderWidth: 1,
    borderColor: "#a3e635",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  fetchButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.5,
  },

  // ----------------------------------------------------------------------------
  // 3. HEADERS GROUP BOX (dgvHeader)
  // ----------------------------------------------------------------------------
  groupBoxHeaders: {
    flex: 1.15,
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#9ca3af",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#ffffff",
  },
  groupLabelContainer: {
    position: "absolute",
    top: -9,
    left: 12,
    backgroundColor: "#262626",
    paddingHorizontal: 4,
    zIndex: 10,
  },
  groupLabelText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#ffffff",
  },
  headerGridHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderBottomWidth: 1,
    borderBottomColor: "#9ca3af",
    height: 25,
    paddingHorizontal: 4,
  },
  gridTh: {
    fontSize: 12,
    fontWeight: "600",
    color: "#000000",
    paddingHorizontal: 4,
    fontFamily: Platform.OS === "android" ? "monospace" : "Segoe UI, Tahoma, sans-serif",
  },
  headersList: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  headerGridRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 23,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  headerGridRowSelected: {
    backgroundColor: "#1e1b4b", // Deep midnight blue selection matching screenshot
  },
  gridTd: {
    fontSize: 12,
    color: "#000000",
    paddingHorizontal: 4,
    fontFamily: Platform.OS === "android" ? "monospace" : "Segoe UI, Tahoma, sans-serif",
  },
  gridTdSelected: {
    color: "#ffffff",
    fontWeight: "700",
  },

  // ----------------------------------------------------------------------------
  // 4. DETAILS GROUP BOX (dgvDetail)
  // ----------------------------------------------------------------------------
  groupBoxDetails: {
    flex: 0.95,
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#9ca3af",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#ffffff",
  },
  detailsGridHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#bfdbfe", // Soft sky blue header row matching screenshot
    borderBottomWidth: 1,
    borderBottomColor: "#9ca3af",
    height: 25,
    paddingHorizontal: 4,
  },
  detailTh: {
    fontSize: 12,
    fontWeight: "600",
    color: "#000000",
    paddingHorizontal: 4,
    fontFamily: Platform.OS === "android" ? "monospace" : "Segoe UI, Tahoma, sans-serif",
  },
  detailsList: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  detailGridRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 23,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  detailGridRowFirstSelected: {
    backgroundColor: "#1e1b4b", // Deep midnight blue highlight matching screenshot
  },
  detailTd: {
    fontSize: 12,
    color: "#000000",
    paddingHorizontal: 4,
    fontFamily: Platform.OS === "android" ? "monospace" : "Segoe UI, Tahoma, sans-serif",
  },
  detailTdFirstSelected: {
    color: "#ffffff",
    fontWeight: "700",
  },

  // ----------------------------------------------------------------------------
  // 5. BOTTOM BAR SECTION
  // ----------------------------------------------------------------------------
  bottomBarContainer: {
    height: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: "#262626",
    gap: 12,
  },
  classicButton: {
    height: 48,
    minWidth: 120,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  classicButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  btnCancelStyle: {
    backgroundColor: "#6b7280", // Slate gray for Bill Cancel
  },
  btnDeliveryStyle: {
    backgroundColor: "#65a30d", // Olive green for Convert Delivery
  },
  btnPrintStyle: {
    backgroundColor: "#6b7280", // Slate gray for Print Receipt
  },
  btnExitStyle: {
    backgroundColor: "#65a30d", // Olive green for Exit
  },
  btnDisabled: {
    opacity: 0.45,
  },

  totalAmountSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  totalAmountLabel: {
    fontSize: 17,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  totalAmountDisplayBox: {
    width: 175,
    height: 38,
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: "#52525b",
    alignItems: "center",
    justifyContent: "center",
  },
  totalAmountText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 1,
    fontFamily: Platform.OS === "android" ? "monospace" : "Courier New, monospace",
  },

  // Helper empty/loading containers
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 16,
  },
  loadingLabel: {
    fontSize: 12,
    color: "#64748b",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  emptyLabel: {
    fontSize: 12,
    color: "#94a3b8",
  },

  // Sub-modal styles
  confirmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  confirmCard: {
    width: "90%",
    maxWidth: 440,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 18,
    elevation: 8,
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8,
  },
  confirmBody: {
    fontSize: 13,
    color: "#334155",
    lineHeight: 18,
  },
  confirmBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 16,
    flexWrap: "wrap",
  },
  modalSubBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
  },
  modalSubBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
  },
  memberModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1e1b4b",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  memberModalTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff",
  },
  memberInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  memberTextInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
    color: "#000000",
    outlineStyle: "none" as any,
  },
  memberItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
});
