import React, { useState, useEffect, useMemo } from "react";
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
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ThemeConfig } from "../utils/theme";
import ClearAdminAuthModal from "./ClearAdminAuthModal";
import MemberModal from "./MemberModal";
import FindMemberModal from "./FindMemberModal";

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
  // Filter States (matching frmLastTransaction.vb)
  const [transactionLimit, setTransactionLimit] = useState<string>("20");
  const [invoiceFilter, setInvoiceFilter] = useState<string>("");
  const [memberFilter, setMemberFilter] = useState<string>("");
  const [isCreditMode, setIsCreditMode] = useState<boolean>(false);
  const [isAllSales, setIsAllSales] = useState<boolean>(false);
  const [useDateFilter, setUseDateFilter] = useState<boolean>(false);

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const [fromDate, setFromDate] = useState<string>(todayStr);
  const [toDate, setToDate] = useState<string>(todayStr);

  // Data States
  const [transactions, setTransactions] = useState<TransactionHeaderItem[]>([]);
  const [selectedInvoiceNo, setSelectedInvoiceNo] = useState<string>("");
  const [loadingList, setLoadingList] = useState<boolean>(false);

  // Selected Bill Details State
  const [billHeader, setBillHeader] = useState<CompleteBillHeader | null>(null);
  const [billItems, setBillItems] = useState<TransactionDetailItem[]>([]);
  const [billPayments, setBillPayments] = useState<BillPaymentItem[]>([]);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  // Receipt popup preview view toggle
  const [viewMode, setViewMode] = useState<"GRID" | "RECEIPT">("GRID");

  // Admin Auth Dialog State for Bill Cancel (F3 permission check)
  const [showAdminAuthModal, setShowAdminAuthModal] = useState<boolean>(false);

  // Member Search Dialog State for Convert Delivery (when customer is CASH)
  const [showMemberSearchModal, setShowMemberSearchModal] = useState<boolean>(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState<string>("");
  const [memberSearchResults, setMemberSearchResults] = useState<MemberSearchItem[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState<boolean>(false);

  // Full Member Master Modal State (cmdMember_Click in frmLastTransaction.vb)
  const [showMemberModal, setShowMemberModal] = useState<boolean>(false);
  const [selectedMemberCodeForModal, setSelectedMemberCodeForModal] = useState<string>("");

  // Bill Cancel Confirmation & Void Print Dialog State
  const [cancelLoading, setCancelLoading] = useState<boolean>(false);
  const [showVoidConfirmModal, setShowVoidConfirmModal] = useState<boolean>(false);

  // Convert Delivery Loading State
  const [deliveryLoading, setDeliveryLoading] = useState<boolean>(false);

  // Feedback Notification banner state
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

  // Load Transactions when modal opens or primary filters change
  useEffect(() => {
    if (visible) {
      fetchTransactions();
    } else {
      setSelectedInvoiceNo("");
      setBillHeader(null);
      setBillItems([]);
      setBillPayments([]);
      setViewMode("GRID");
      setStatusMessage(null);
    }
  }, [visible, transactionLimit, isCreditMode, isAllSales]);

  // Fetch header list from /api/bills/transactions
  const fetchTransactions = async (preserveSelectedInvoice?: string) => {
    setLoadingList(true);
    try {
      const queryParams = new URLSearchParams({
        transactionLimit,
        isCredit: String(isCreditMode),
        allSales: String(isAllSales),
        dateFilter: String(useDateFilter),
        terminalCode: activeTerminal,
      });

      if (invoiceFilter.trim()) queryParams.append("invoiceNo", invoiceFilter.trim());
      if (memberFilter.trim()) queryParams.append("memberCode", memberFilter.trim());
      if (useDateFilter) {
        queryParams.append("fromDate", fromDate);
        queryParams.append("toDate", toDate);
      }

      const res = await fetch(`${apiUrl}/api/bills/transactions?${queryParams.toString()}`);
      const data = await res.json();

      if (res.ok && data.success && Array.isArray(data.transactions)) {
        setTransactions(data.transactions);
        if (data.transactions.length > 0) {
          // If a specific invoice should be preserved/selected (e.g. after member update), select it
          const targetInv =
            preserveSelectedInvoice && data.transactions.some((t: any) => t.invoiceNo === preserveSelectedInvoice)
              ? preserveSelectedInvoice
              : (selectedInvoiceNo && data.transactions.some((t: any) => t.invoiceNo === selectedInvoiceNo)
                ? selectedInvoiceNo
                : data.transactions[0].invoiceNo);

          setSelectedInvoiceNo(targetInv);
          fetchBillDetails(targetInv);
        } else {
          setSelectedInvoiceNo("");
          setBillHeader(null);
          setBillItems([]);
          setBillPayments([]);
        }
      } else {
        setTransactions([]);
      }
    } catch (err: any) {
      console.error("Failed to fetch transactions:", err.message);
      showNotice(err.message || "Failed to load transactions", "error");
    } finally {
      setLoadingList(false);
    }
  };

  // Fetch complete details for a selected invoice
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

  // Select row handler
  const handleSelectInvoice = (invoiceNo: string) => {
    if (selectedInvoiceNo === invoiceNo) return;
    setSelectedInvoiceNo(invoiceNo);
    fetchBillDetails(invoiceNo);
  };

  // Calculate Computer Total of all loaded header transactions
  const totalGridAmount = useMemo(() => {
    return transactions.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [transactions]);

  // Total amount of currently selected bill
  const selectedBillAmount = useMemo(() => {
    if (billHeader) return billHeader.netTotal;
    const item = transactions.find((t) => t.invoiceNo === selectedInvoiceNo);
    return item ? item.amount || item.netTotal : 0;
  }, [billHeader, transactions, selectedInvoiceNo]);

  // ----------------------------------------------------------------------------
  // BUTTON 1: Bill Cancel Flow (cmdBillCancel_Click in frmLastTransaction.vb)
  // ----------------------------------------------------------------------------
  const handleBillCancelClick = async () => {
    if (!selectedInvoiceNo) {
      showNotice("Please select a bill from the list to cancel.", "error");
      return;
    }

    try {
      // 1. Check Cashier Permission for F3
      const permRes = await fetch(
        `${apiUrl}/api/bills/check-cancel-permission?cashierId=${encodeURIComponent(activeCashier)}`
      );
      const permData = await permRes.json();

      if (permRes.ok && permData.allowed) {
        // Cashier has permission -> proceed directly to confirmation
        promptCancelConfirmation();
      } else {
        // Permission denied -> show Admin Password Dialog
        setShowAdminAuthModal(true);
      }
    } catch (err: any) {
      promptCancelConfirmation();
    }
  };

  // Admin authentication submission for Bill Cancel
  const handleAdminAuthSubmit = async (user: string, pass: string): Promise<boolean> => {
    try {
      if (onAdminAuthRequest) {
        const ok = await onAdminAuthRequest(user, pass);
        if (ok) {
          setShowAdminAuthModal(false);
          setTimeout(() => promptCancelConfirmation(), 200);
          return true;
        }
      }

      // Check admin credentials via auth API
      const authRes = await fetch(`${apiUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass }),
      });
      const authData = await authRes.json();

      if (authRes.ok && authData.success) {
        setShowAdminAuthModal(false);
        setTimeout(() => promptCancelConfirmation(), 200);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // Prompt confirmation: "Do you want to cancel the bill {InvoiceNo}?"
  const promptCancelConfirmation = () => {
    setShowVoidConfirmModal(true);
  };

  // Execute Bill Cancellation via backend API
  const executeBillCancel = async (printVoidBill: boolean) => {
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
          printVoidBill,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showNotice(
          `Bill ${selectedInvoiceNo} Cancelled Successfully (Void Ref #${data.billCancelNo}).`,
          "success"
        );
        // Refresh list
        fetchTransactions();
      } else {
        showNotice(data.message || "Failed to cancel bill", "error");
      }
    } catch (err: any) {
      showNotice(err.message || "Network error while cancelling bill", "error");
    } finally {
      setCancelLoading(false);
    }
  };

  // ----------------------------------------------------------------------------
  // BUTTON 2: Convert Delivery Flow (Exact Butcondelivery_Click in frmLastTransaction.vb)
  // ----------------------------------------------------------------------------
  // 1. Get the selected Invoice Number.
  // 2. Call equivalent of fncselectdelivery(sInvoiceNo).
  // 3. Check AccFlag1: If AccFlag1 = "1", display "This Sales already delivered!!" and stop.
  // 4. Check CustomerCode:
  //    - If CustomerCode = "CASH":
  //      - Display "Please Scan the Member".
  //      - Open Member Search UI (frmMemberSearch).
  //      - User selects Member Code.
  //      - Update tblPOSSalesHeaderCur Set CustomerCode = @memberCode Where InvoiceNo = @sInvoiceNo.
  //      - Refresh the transaction list (cmdFetch_Click) and stop without creating delivery.
  //    - If CustomerCode is not "CASH":
  //      - Directly execute existing fncupdatedeleivery(sInvoiceNo) equivalent.
  //      - Complete delivery creation in database with safe transaction handling.
  //      - Refresh the transaction list.
  //      - Display "Delivered Created Successfully".
  // ----------------------------------------------------------------------------
  const handleConvertDeliveryClick = async () => {
    if (!selectedInvoiceNo) {
      showNotice("Please select a bill from the list.", "error");
      return;
    }

    setDeliveryLoading(true);
    try {
      // Step 1 & 2: Call fncselectdelivery(sInvoiceNo)
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

      // Step 3 & 4: Check AccFlag1. If AccFlag1 = "1", stop.
      if (data.accFlag1 === "1" || data.isDelivered) {
        showNotice("This Sales already delivered!!", "error");
        return;
      }

      // Step 5: Check CustomerCode
      const custCode = (data.customerCode || "").trim().toUpperCase();
      if (custCode === "CASH" || custCode === "") {
        // Display "Please Scan the Member" & open Member Search UI
        showNotice("Please Scan the Member", "info");
        setShowMemberSearchModal(true);
        searchMembers("");
        return;
      }

      // If CustomerCode is NOT CASH: Directly execute fncupdatedeleivery(sInvoiceNo)
      await executeDeliveryCreation(selectedInvoiceNo);
    } catch (err: any) {
      showNotice(err.message || "Network error during delivery conversion", "error");
    } finally {
      setDeliveryLoading(false);
    }
  };

  // Execute fncupdatedeleivery(sInvoiceNo) when CustomerCode is not CASH
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
        // Refresh transaction list and reload current bill
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

  // Search Members for Member Search UI (frmMemberSearch)
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

  // Member Search Confirmation (Matching VB.NET flow for CASH Customer):
  // Update tblPOSSalesHeaderCur / tblPOSSalesHeader Set CustomerCode = @memberCode Where InvoiceNo = @sInvoiceNo
  // Then cmdFetch_Click (refresh list) and Exit Sub without creating delivery yet.
  const handleSelectMemberForDelivery = async (memberCode: string) => {
    setShowMemberSearchModal(false);
    const targetInvoice = selectedInvoiceNo;
    setDeliveryLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/bills/update-delivery-member`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNo: targetInvoice,
          memberCode,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotice(`Member ${memberCode} assigned to Invoice #${targetInvoice}.`, "success");
        // Optimistically update the selected bill's member in current transactions state
        setTransactions((prev) =>
          prev.map((t) =>
            t.invoiceNo === targetInvoice
              ? {
                  ...t,
                  memberCode: memberCode,
                  memberName: data.customerName || t.memberName,
                }
              : t
          )
        );
        // Refresh transaction list & bill details while preserving selected invoice
        await fetchTransactions(targetInvoice);
        if (targetInvoice) {
          fetchBillDetails(targetInvoice);
        }
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
  // BUTTON: Member Click Flow (Exact cmdMember_Click in frmLastTransaction.vb)
  // ----------------------------------------------------------------------------
  // VB.NET logic:
  //   sMemberBarcode = fnGetText(dgvHeader, dgvHeader.CurrentRow.Index, cMember.Index).Trim
  //   frmMember.prpMemberBarCode = sMemberBarcode
  //   frmMember.ShowDialog()
  // ----------------------------------------------------------------------------
  const handleMemberButtonClick = (memberCodeToOpen?: string) => {
    let targetMemberCode = (memberCodeToOpen || "").trim();

    if (!targetMemberCode && selectedInvoiceNo) {
      const selectedTx = transactions.find((t) => t.invoiceNo === selectedInvoiceNo);
      if (selectedTx) {
        targetMemberCode = (selectedTx.memberCode || "").trim();
      }
    }

    if (!targetMemberCode && billHeader) {
      targetMemberCode = (billHeader.customerCode || "").trim();
    }

    setSelectedMemberCodeForModal(targetMemberCode);
    setShowMemberModal(true);
  };

  // ----------------------------------------------------------------------------
  // BUTTON 3: Print Receipt Flow (cmdInvoice_Click & subReceiptReportPrint)
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
      setViewMode("RECEIPT");
      showNotice(`Viewing reprint receipt for #${selectedInvoiceNo}`, "info");
    }
  };

  // ----------------------------------------------------------------------------
  // BUTTON 4: Exit Flow
  // ----------------------------------------------------------------------------
  const handleExitClick = () => {
    onClose();
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContainer}>
          {/* Header Bar */}
          <View style={[styles.modalHeader, { backgroundColor: primaryColor }]}>
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons name="history" size={24} color="#ffffff" />
              <Text style={styles.headerTitle}>View Bill / Last Transactions</Text>
              {activeTerminal ? (
                <View style={styles.stationBadge}>
                  <Text style={styles.stationBadgeText}>STATION: {activeTerminal}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.headerRight}>
              {/* Receipt / Grid View Toggle Button */}
              <TouchableOpacity
                style={[styles.modeToggleBtn, viewMode === "GRID" && styles.modeToggleActive]}
                onPress={() => setViewMode("GRID")}
              >
                <MaterialCommunityIcons
                  name="table-large"
                  size={16}
                  color={viewMode === "GRID" ? "#ffffff" : "#cbd5e1"}
                />
                <Text
                  style={[styles.modeToggleText, viewMode === "GRID" && styles.modeToggleTextActive]}
                >
                  Grid View
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeToggleBtn, viewMode === "RECEIPT" && styles.modeToggleActive]}
                onPress={() => setViewMode("RECEIPT")}
              >
                <MaterialCommunityIcons
                  name="receipt"
                  size={16}
                  color={viewMode === "RECEIPT" ? "#ffffff" : "#cbd5e1"}
                />
                <Text
                  style={[styles.modeToggleText, viewMode === "RECEIPT" && styles.modeToggleTextActive]}
                >
                  Receipt Preview
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={22} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Feedback Banner */}
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
                size={18}
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
                  styles.noticeBannerText,
                  statusMessage.type === "success" && { color: "#15803d" },
                  statusMessage.type === "error" && { color: "#b91c1c" },
                  statusMessage.type === "info" && { color: "#1d4ed8" },
                ]}
              >
                {statusMessage.text}
              </Text>
            </View>
          )}

          {/* Top Filter Toolbar (Matching frmLastTransaction.vb) */}
          <View style={styles.filterToolbar}>
            {/* Record Limit Selector: 10, 20, 50, ALL */}
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Show:</Text>
              {["10", "20", "50", "ALL"].map((val) => (
                <TouchableOpacity
                  key={val}
                  style={[
                    styles.limitChip,
                    transactionLimit === val && {
                      backgroundColor: primaryColor,
                      borderColor: primaryColor,
                    },
                  ]}
                  onPress={() => setTransactionLimit(val)}
                >
                  <Text
                    style={[
                      styles.limitChipText,
                      transactionLimit === val && styles.limitChipTextActive,
                    ]}
                  >
                    {val}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Invoice Filter */}
            <View style={[styles.filterGroup, { flex: 1, minWidth: 150 }]}>
              <MaterialCommunityIcons name="magnify" size={16} color="#64748b" />
              <TextInput
                style={styles.searchTextInput}
                placeholder="Search Invoice #..."
                value={invoiceFilter}
                onChangeText={setInvoiceFilter}
                onSubmitEditing={() => fetchTransactions()}
                placeholderTextColor="#94a3b8"
              />
              {invoiceFilter ? (
                <TouchableOpacity onPress={() => setInvoiceFilter("")}>
                  <MaterialCommunityIcons name="close-circle" size={14} color="#94a3b8" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Member Code Filter */}
            <View style={[styles.filterGroup, { flex: 1, minWidth: 150 }]}>
              <MaterialCommunityIcons name="account-search-outline" size={16} color="#64748b" />
              <TextInput
                style={styles.searchTextInput}
                placeholder="Member / Customer Code..."
                value={memberFilter}
                onChangeText={setMemberFilter}
                onSubmitEditing={() => fetchTransactions()}
                placeholderTextColor="#94a3b8"
              />
              {memberFilter ? (
                <TouchableOpacity onPress={() => setMemberFilter("")}>
                  <MaterialCommunityIcons name="close-circle" size={14} color="#94a3b8" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Credit Bills Checkbox (Chk_Credit) */}
            <TouchableOpacity
              style={[styles.toggleCheckbox, isCreditMode && styles.toggleCheckboxActive]}
              onPress={() => setIsCreditMode(!isCreditMode)}
            >
              <MaterialCommunityIcons
                name={isCreditMode ? "checkbox-marked" : "checkbox-blank-outline"}
                size={18}
                color={isCreditMode ? primaryColor : "#64748b"}
              />
              <Text style={styles.toggleCheckboxLabel}>Credit Bills</Text>
            </TouchableOpacity>

            {/* All Sales Checkbox */}
            <TouchableOpacity
              style={[styles.toggleCheckbox, isAllSales && styles.toggleCheckboxActive]}
              onPress={() => setIsAllSales(!isAllSales)}
            >
              <MaterialCommunityIcons
                name={isAllSales ? "checkbox-marked" : "checkbox-blank-outline"}
                size={18}
                color={isAllSales ? primaryColor : "#64748b"}
              />
              <Text style={styles.toggleCheckboxLabel}>All Counters</Text>
            </TouchableOpacity>

            {/* Refresh Button (cmdFetch) */}
            <TouchableOpacity
              style={[styles.fetchBtn, { backgroundColor: primaryColor }]}
              onPress={() => fetchTransactions()}
            >
              <MaterialCommunityIcons name="refresh" size={16} color="#ffffff" />
              <Text style={styles.fetchBtnText}>Fetch</Text>
            </TouchableOpacity>
          </View>

          {/* Main Dual-Panel Grid View */}
          {viewMode === "GRID" ? (
            <View style={styles.mainSplit}>
              {/* Left Panel: Header Transaction Table (dgvHeader) */}
              <View style={styles.leftTableContainer}>
                {/* Table Header */}
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.thCell, { width: 110 }]}>Invoice #</Text>
                  <Text style={[styles.thCell, { width: 75 }]}>Time</Text>
                  <Text style={[styles.thCell, { width: 65 }]}>User</Text>
                  <Text style={[styles.thCell, { width: 75 }]}>Member</Text>
                  <Text style={[styles.thCell, { width: 110 }]}>Member Name</Text>
                  <Text style={[styles.thCell, { width: 85 }]}>Pay Mode</Text>
                  <Text style={[styles.thCell, { width: 75, textAlign: "right" }]}>Paid</Text>
                </View>

                {/* Table Body */}
                {loadingList ? (
                  <View style={styles.loadingBox}>
                    <ActivityIndicator size="small" color={primaryColor} />
                    <Text style={styles.loadingText}>Loading transactions...</Text>
                  </View>
                ) : transactions.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <MaterialCommunityIcons name="text-box-remove-outline" size={40} color="#cbd5e1" />
                    <Text style={styles.emptyText}>No transactions found</Text>
                  </View>
                ) : (
                  <FlatList
                    data={transactions}
                    keyExtractor={(item) => item.invoiceNo}
                    renderItem={({ item }) => {
                      const isSelected = selectedInvoiceNo === item.invoiceNo;
                      const dateObj = new Date(item.modifyDate);
                      const timeStr = !isNaN(dateObj.getTime())
                        ? dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "";

                      return (
                        <TouchableOpacity
                          style={[styles.tableRow, isSelected && styles.tableRowSelected]}
                          onPress={() => handleSelectInvoice(item.invoiceNo)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.tdCell,
                              { width: 110, fontWeight: "700" },
                              isSelected && { color: "#ffffff" },
                            ]}
                            numberOfLines={1}
                          >
                            {item.invoiceNo}
                          </Text>
                          <Text
                            style={[
                              styles.tdCell,
                              { width: 75, color: "#64748b" },
                              isSelected && { color: "#e2e8f0" },
                            ]}
                          >
                            {timeStr}
                          </Text>
                          <Text
                            style={[
                              styles.tdCell,
                              { width: 65 },
                              isSelected && { color: "#ffffff" },
                            ]}
                            numberOfLines={1}
                          >
                            {item.cashierId}
                          </Text>
                          <TouchableOpacity
                            style={{ width: 75, justifyContent: "center" }}
                            onPress={() => handleMemberButtonClick(item.memberCode)}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.tdCell,
                                isSelected ? { color: "#ffffff" } : { color: "#0284c7" },
                                { fontWeight: "700", textDecorationLine: "underline" },
                              ]}
                              numberOfLines={1}
                            >
                              {item.memberCode || "CASH"}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{ width: 110, justifyContent: "center" }}
                            onPress={() => handleMemberButtonClick(item.memberCode)}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.tdCell,
                                isSelected ? { color: "#ffffff" } : { color: "#334155" },
                                { fontWeight: "600" },
                              ]}
                              numberOfLines={1}
                            >
                              {item.memberName || "CASH"}
                            </Text>
                          </TouchableOpacity>
                          <Text
                            style={[
                              styles.tdCell,
                              { width: 85, color: "#2563eb", fontWeight: "600" },
                              isSelected && { color: "#bfdbfe" },
                            ]}
                            numberOfLines={1}
                          >
                            {item.payModeText || "CASH"}
                          </Text>
                          <Text
                            style={[
                              styles.tdCell,
                              { width: 75, textAlign: "right", fontWeight: "700" },
                              isSelected && { color: "#ffffff" },
                            ]}
                          >
                            ${(item.amount || item.netTotal || 0).toFixed(2)}
                          </Text>
                        </TouchableOpacity>
                      );
                    }}
                  />
                )}

                {/* Left Panel Footer: Computer Total */}
                <View style={styles.leftFooterBar}>
                  <Text style={styles.leftFooterLabel}>
                    Showing {transactions.length} record(s)
                  </Text>
                  <Text style={styles.leftFooterTotal}>
                    List Total: ${totalGridAmount.toFixed(2)}
                  </Text>
                </View>
              </View>

              {/* Right Panel: Selected Invoice Details Table (dgvDetail) */}
              <View style={styles.rightTableContainer}>
                {billHeader ? (
                  <>
                    <View style={styles.detailHeaderBox}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.detailTitle}>Invoice: #{billHeader.invoiceNo}</Text>
                        <Text style={styles.detailSubtitle}>
                          Customer: {billHeader.customerName || billHeader.customerCode} | Date:{" "}
                          {new Date(billHeader.invoiceDate).toLocaleDateString()}{" "}
                          {new Date(billHeader.invoiceDate).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.memberBadgeBtn, { backgroundColor: primaryColor }]}
                        onPress={() => handleMemberButtonClick(billHeader.customerCode)}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name="card-account-details-outline" size={15} color="#ffffff" />
                        <Text style={styles.memberBadgeBtnText}>
                          Member: {billHeader.customerCode || "CASH"}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Detail Table Header */}
                    <View style={styles.detailTableHeaderRow}>
                      <Text style={[styles.dthCell, { width: 90 }]}>Code</Text>
                      <Text style={[styles.dthCell, { flex: 1 }]}>Description</Text>
                      <Text style={[styles.dthCell, { width: 45, textAlign: "right" }]}>Qty</Text>
                      <Text style={[styles.dthCell, { width: 65, textAlign: "right" }]}>Price</Text>
                      <Text style={[styles.dthCell, { width: 55, textAlign: "right" }]}>Disc</Text>
                      <Text style={[styles.dthCell, { width: 75, textAlign: "right" }]}>Amount</Text>
                    </View>

                    {/* Detail Items Body */}
                    {loadingDetails ? (
                      <View style={styles.loadingBox}>
                        <ActivityIndicator size="small" color={primaryColor} />
                        <Text style={styles.loadingText}>Loading bill details...</Text>
                      </View>
                    ) : billItems.length === 0 ? (
                      <View style={styles.emptyBox}>
                        <Text style={styles.emptyText}>No items found for this invoice</Text>
                      </View>
                    ) : (
                      <FlatList
                        data={billItems}
                        keyExtractor={(item, index) => `${item.inventoryCode}_${index}`}
                        renderItem={({ item, index }) => (
                          <View
                            style={[
                              styles.detailTableRow,
                              index % 2 === 1 && { backgroundColor: "#f8fafc" },
                            ]}
                          >
                            <Text style={[styles.dtdCell, { width: 90 }]} numberOfLines={1}>
                              {item.inventoryCode}
                            </Text>
                            <Text
                              style={[styles.dtdCell, { flex: 1, fontWeight: "600" }]}
                              numberOfLines={1}
                            >
                              {item.description}
                            </Text>
                            <Text style={[styles.dtdCell, { width: 45, textAlign: "right" }]}>
                              {item.qty}
                            </Text>
                            <Text style={[styles.dtdCell, { width: 65, textAlign: "right" }]}>
                              ${item.price.toFixed(2)}
                            </Text>
                            <Text
                              style={[
                                styles.dtdCell,
                                { width: 55, textAlign: "right", color: "#b91c1c" },
                              ]}
                            >
                              {item.discount > 0 ? `-$${item.discount.toFixed(2)}` : "0.00"}
                            </Text>
                            <Text
                              style={[
                                styles.dtdCell,
                                { width: 75, textAlign: "right", fontWeight: "700" },
                              ]}
                            >
                              ${item.netAmount.toFixed(2)}
                            </Text>
                          </View>
                        )}
                      />
                    )}

                    {/* Bill Summary Card */}
                    <View style={styles.billSummaryCard}>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>SubTotal:</Text>
                        <Text style={styles.summaryVal}>${billHeader.totalValue.toFixed(2)}</Text>
                      </View>
                      {billHeader.totalDiscount > 0 && (
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryLabel}>Discount:</Text>
                          <Text style={[styles.summaryVal, { color: "#b91c1c" }]}>
                            -${billHeader.totalDiscount.toFixed(2)}
                          </Text>
                        </View>
                      )}
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Tax (GST):</Text>
                        <Text style={styles.summaryVal}>${billHeader.gst.toFixed(2)}</Text>
                      </View>
                      <View style={styles.summaryDivider} />
                      <View style={styles.summaryRow}>
                        <Text style={[styles.summaryLabel, { fontWeight: "800", fontSize: 13 }]}>
                          Net Total:
                        </Text>
                        <Text style={[styles.summaryGrandTotal, { color: primaryColor }]}>
                          ${billHeader.netTotal.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.emptyBox}>
                    <MaterialCommunityIcons name="receipt-text-outline" size={48} color="#cbd5e1" />
                    <Text style={styles.emptyText}>Select an invoice from the left panel</Text>
                  </View>
                )}
              </View>
            </View>
          ) : (
            /* Receipt Paper Preview Mode */
            <ScrollView contentContainerStyle={styles.receiptScrollContainer}>
              <View style={styles.receiptPaper}>
                {billHeader ? (
                  <>
                    <View style={styles.receiptPaperHeader}>
                      <Text style={styles.receiptStoreName}>RETAIL STORE POS</Text>
                      <Text style={styles.receiptStoreInfo}>INVOICE RECEIPT</Text>
                      <Text style={styles.receiptStoreInfo}>
                        Invoice: #{billHeader.invoiceNo} | Date:{" "}
                        {new Date(billHeader.invoiceDate).toLocaleString()}
                      </Text>
                      <Text style={styles.receiptStoreInfo}>
                        Terminal: {billHeader.terminalCode} | Cashier: {billHeader.cashierId}
                      </Text>
                      <Text style={styles.receiptStoreInfo}>
                        Customer: {billHeader.customerName || billHeader.customerCode}
                      </Text>
                    </View>

                    <View style={styles.receiptPaperDivider} />

                    {/* Receipt Items */}
                    {billItems.map((item, idx) => (
                      <View key={idx} style={styles.receiptPaperLine}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.receiptLineDesc} numberOfLines={1}>
                            {item.description}
                          </Text>
                          <Text style={styles.receiptLineQtyPrice}>
                            {item.qty} x ${item.price.toFixed(2)}
                            {item.discount > 0 ? ` (Disc: -$${item.discount.toFixed(2)})` : ""}
                          </Text>
                        </View>
                        <Text style={styles.receiptLineTotal}>${item.netAmount.toFixed(2)}</Text>
                      </View>
                    ))}

                    <View style={styles.receiptPaperDivider} />

                    {/* Receipt Totals */}
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptRowLabel}>SubTotal:</Text>
                      <Text style={styles.receiptRowVal}>${billHeader.totalValue.toFixed(2)}</Text>
                    </View>
                    {billHeader.totalDiscount > 0 && (
                      <View style={styles.receiptRow}>
                        <Text style={styles.receiptRowLabel}>Total Discount:</Text>
                        <Text style={styles.receiptRowVal}>
                          -${billHeader.totalDiscount.toFixed(2)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptRowLabel}>Tax (GST):</Text>
                      <Text style={styles.receiptRowVal}>${billHeader.gst.toFixed(2)}</Text>
                    </View>
                    <View style={[styles.receiptRow, { marginTop: 4 }]}>
                      <Text style={[styles.receiptRowLabel, { fontSize: 16, fontWeight: "900" }]}>
                        GRAND TOTAL:
                      </Text>
                      <Text
                        style={[
                          styles.receiptRowVal,
                          { fontSize: 16, fontWeight: "900", color: "#b91c1c" },
                        ]}
                      >
                        ${billHeader.netTotal.toFixed(2)}
                      </Text>
                    </View>

                    <View style={styles.receiptPaperDivider} />

                    {/* Payment Breakdown */}
                    {billPayments.map((p, pIdx) => (
                      <View key={pIdx} style={styles.receiptRow}>
                        <Text style={styles.receiptRowLabel}>{p.payMode}:</Text>
                        <Text style={styles.receiptRowVal}>${p.amount.toFixed(2)}</Text>
                      </View>
                    ))}
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptRowLabel}>Balance / Change:</Text>
                      <Text style={styles.receiptRowVal}>${billHeader.balance.toFixed(2)}</Text>
                    </View>

                    <View style={styles.receiptPaperFooter}>
                      <Text style={styles.receiptFooterText}>*** THANK YOU FOR SHOPPING ***</Text>
                    </View>
                  </>
                ) : (
                  <ActivityIndicator size="large" color={primaryColor} />
                )}
              </View>
            </ScrollView>
          )}

          {/* =========================================================================
              BOTTOM BAR: 4 VB.NET BUTTONS + CENTER TOTAL AMOUNT
              Layout:
                [Left: Bill Cancel, Convert Delivery] 
                [Center: Total Amount] 
                [Right: Print Receipt, Exit]
          ========================================================================= */}
          <View style={styles.vbBottomBar}>
            {/* Left Side: Bill Cancel & Convert Delivery */}
            <View style={styles.vbBottomLeftCol}>
              <TouchableOpacity
                style={[
                  styles.vbActionBtn,
                  styles.btnBillCancel,
                  (!selectedInvoiceNo || cancelLoading) && styles.btnDisabled,
                ]}
                onPress={handleBillCancelClick}
                disabled={!selectedInvoiceNo || cancelLoading}
                activeOpacity={0.8}
              >
                {cancelLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="cancel" size={18} color="#ffffff" />
                    <Text style={styles.vbActionBtnText}>Bill Cancel</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.vbActionBtn,
                  styles.btnConvertDelivery,
                  (!selectedInvoiceNo || deliveryLoading) && styles.btnDisabled,
                ]}
                onPress={handleConvertDeliveryClick}
                disabled={!selectedInvoiceNo || deliveryLoading}
                activeOpacity={0.8}
              >
                {deliveryLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="truck-delivery" size={18} color="#ffffff" />
                    <Text style={styles.vbActionBtnText}>Convert Delivery</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Center: Total Amount Display */}
            <View style={styles.vbBottomCenterCol}>
              <Text style={styles.vbTotalAmountLabel}>TOTAL AMOUNT</Text>
              <View style={styles.vbTotalAmountBadge}>
                <Text style={styles.vbTotalAmountCurrency}>$</Text>
                <Text style={styles.vbTotalAmountValue}>
                  {selectedBillAmount.toFixed(2)}
                </Text>
              </View>
              {selectedInvoiceNo ? (
                <Text style={styles.vbSelectedBillIndicator}>
                  Invoice: #{selectedInvoiceNo}
                </Text>
              ) : null}
            </View>

            {/* Right Side: Member, Print Receipt & Exit */}
            <View style={styles.vbBottomRightCol}>
              <TouchableOpacity
                style={[
                  styles.vbActionBtn,
                  styles.btnMemberAction,
                  !selectedInvoiceNo && styles.btnDisabled,
                ]}
                onPress={() => handleMemberButtonClick()}
                disabled={!selectedInvoiceNo}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="card-account-details-outline" size={18} color="#ffffff" />
                <Text style={styles.vbActionBtnText}>Member</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.vbActionBtn,
                  styles.btnPrintReceipt,
                  !selectedInvoiceNo && styles.btnDisabled,
                ]}
                onPress={handlePrintReceiptClick}
                disabled={!selectedInvoiceNo}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="printer" size={18} color="#ffffff" />
                <Text style={styles.vbActionBtnText}>Print Receipt</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.vbActionBtn, styles.btnExit]}
                onPress={handleExitClick}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="exit-to-app" size={18} color="#ffffff" />
                <Text style={styles.vbActionBtnText}>Exit</Text>
              </TouchableOpacity>
            </View>
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
          SUB-MODAL: Void Bill Printing Confirmation Prompt (VB.NET Question)
      ========================================================================= */}
      <Modal
        visible={showVoidConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowVoidConfirmModal(false)}
      >
        <View style={styles.confirmModalBackdrop}>
          <View style={styles.confirmModalCard}>
            <View style={styles.confirmModalHeader}>
              <MaterialCommunityIcons name="alert-octagon" size={32} color="#dc2626" />
              <Text style={styles.confirmModalTitle}>Cancel Bill #{selectedInvoiceNo}</Text>
            </View>
            <Text style={styles.confirmModalBody}>
              Are you sure you want to cancel the bill {selectedInvoiceNo}? This will revert
              inventory stock, reverse payments, and record an audit void entry.
            </Text>

            <Text style={[styles.confirmModalBody, { fontWeight: "700", marginTop: 8 }]}>
              Do you want to print the void bill receipt?
            </Text>

            <View style={styles.confirmModalBtnRow}>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: "#f1f5f9" }]}
                onPress={() => setShowVoidConfirmModal(false)}
              >
                <Text style={[styles.confirmBtnText, { color: "#475569" }]}>Abort</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: "#64748b" }]}
                onPress={() => executeBillCancel(false)}
              >
                <Text style={styles.confirmBtnText}>Cancel Without Print</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: "#dc2626" }]}
                onPress={() => executeBillCancel(true)}
              >
                <Text style={styles.confirmBtnText}>Print & Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          SUB-MODAL: Find Member Screen (frmMemberSearch.vb for Convert Delivery)
          Matches exact UI from reference screenshot:
          - Filters: Name / Phone No input, F1 Starts with, F2 Exact, F3 Contains, Refresh
          - Member List Grid: Member Code, Name, Member Type, Phone No
          - Bottom Buttons: Add, Edit, Ok (F4), Close (Esc)
      ========================================================================= */}
      <FindMemberModal
        visible={showMemberSearchModal}
        initialQuery={memberSearchQuery}
        onClose={() => setShowMemberSearchModal(false)}
        onSelectMember={(member) => {
          handleSelectMemberForDelivery(member.MemberCode);
        }}
      />

      {/* =========================================================================
          SUB-MODAL: Member Master Modal (frmMember.vb cmdMember_Click)
          Executes Sp_POS_GetMember, Sp_GetNextMemberCode, sp_Pos_MemberSave
      ========================================================================= */}
      <MemberModal
        visible={showMemberModal}
        onClose={() => setShowMemberModal(false)}
        initialMemberCode={selectedMemberCodeForModal}
        onMemberSaved={(savedCode, savedName) => {
          showNotice(`Member ${savedName} (${savedCode}) updated successfully.`, "success");
          fetchTransactions(selectedInvoiceNo);
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContainer: {
    width: "96%",
    maxWidth: 1180,
    height: "92%",
    maxHeight: 760,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
    display: "flex",
    flexDirection: "column",
  },
  modalHeader: {
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
    fontSize: 17,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.3,
  },
  stationBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  stationBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modeToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  modeToggleActive: {
    backgroundColor: "rgba(255, 255, 255, 0.35)",
  },
  modeToggleText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#cbd5e1",
  },
  modeToggleTextActive: {
    color: "#ffffff",
    fontWeight: "800",
  },
  closeBtn: {
    padding: 4,
    marginLeft: 6,
  },
  noticeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  noticeSuccess: {
    backgroundColor: "#f0fdf4",
    borderBottomColor: "#bbf7d0",
  },
  noticeError: {
    backgroundColor: "#fef2f2",
    borderBottomColor: "#fecaca",
  },
  noticeInfo: {
    backgroundColor: "#eff6ff",
    borderBottomColor: "#bfdbfe",
  },
  noticeBannerText: {
    fontSize: 12.5,
    fontWeight: "700",
    flex: 1,
  },
  filterToolbar: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  filterGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    paddingHorizontal: 8,
    height: 34,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginRight: 4,
  },
  limitChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f1f5f9",
  },
  limitChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
  },
  limitChipTextActive: {
    color: "#ffffff",
  },
  searchTextInput: {
    flex: 1,
    fontSize: 12,
    color: "#0f172a",
    padding: 0,
    outlineStyle: "none" as any,
  },
  toggleCheckbox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    height: 34,
  },
  toggleCheckboxActive: {
    backgroundColor: "#f0f9ff",
    borderRadius: 6,
  },
  toggleCheckboxLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  fetchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  fetchBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#ffffff",
  },
  mainSplit: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#ffffff",
  },
  leftTableContainer: {
    flex: 1.3,
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
    display: "flex",
    flexDirection: "column",
  },
  tableHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  thCell: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#334155",
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  tableRowSelected: {
    backgroundColor: "#1e3a8a",
  },
  tdCell: {
    fontSize: 12,
    color: "#1e293b",
  },
  leftFooterBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f8fafc",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  leftFooterLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
  },
  leftFooterTotal: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0f172a",
  },
  rightTableContainer: {
    flex: 1.0,
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#ffffff",
  },
  detailHeaderBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  detailTitle: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#0f172a",
  },
  detailSubtitle: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  detailTableHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e2e8f0",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
  },
  dthCell: {
    fontSize: 11,
    fontWeight: "800",
    color: "#334155",
    textTransform: "uppercase",
  },
  detailTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  dtdCell: {
    fontSize: 11.5,
    color: "#1e293b",
  },
  billSummaryCard: {
    backgroundColor: "#f8fafc",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    padding: 10,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  summaryVal: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
  },
  summaryGrandTotal: {
    fontSize: 14,
    fontWeight: "900",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 4,
  },
  receiptScrollContainer: {
    padding: 20,
    alignItems: "center",
    backgroundColor: "#e2e8f0",
  },
  receiptPaper: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#ffffff",
    borderRadius: 4,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  receiptPaperHeader: {
    alignItems: "center",
    marginBottom: 8,
  },
  receiptStoreName: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: 0.5,
  },
  receiptStoreInfo: {
    fontSize: 11,
    color: "#475569",
    marginTop: 2,
    textAlign: "center",
  },
  receiptPaperDivider: {
    height: 1,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    marginVertical: 8,
  },
  receiptPaperLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 3,
  },
  receiptLineDesc: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
  },
  receiptLineQtyPrice: {
    fontSize: 11,
    color: "#64748b",
  },
  receiptLineTotal: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0f172a",
  },
  receiptRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 2,
  },
  receiptRowLabel: {
    fontSize: 12,
    color: "#475569",
  },
  receiptRowVal: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
  },
  receiptPaperFooter: {
    alignItems: "center",
    marginTop: 16,
  },
  receiptFooterText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748b",
  },

  // =========================================================================
  // VB.NET BOTTOM BAR STYLES
  // Expected Layout:
  //   [Left: Bill Cancel, Convert Delivery]
  //   [Center: Total Amount Display]
  //   [Right: Print Receipt, Exit]
  // =========================================================================
  vbBottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
    borderTopWidth: 2,
    borderTopColor: "#e2e8f0",
    gap: 16,
  },
  vbBottomLeftCol: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  vbBottomCenterCol: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#e2e8f0",
  },
  vbTotalAmountLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  vbTotalAmountBadge: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 2,
  },
  vbTotalAmountCurrency: {
    fontSize: 16,
    fontWeight: "800",
    color: "#b91c1c",
    marginRight: 2,
    marginTop: 2,
  },
  vbTotalAmountValue: {
    fontSize: 26,
    fontWeight: "900",
    color: "#b91c1c",
    letterSpacing: 0.5,
  },
  vbSelectedBillIndicator: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
    marginTop: 2,
  },
  vbBottomRightCol: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  },
  vbActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    minWidth: 135,
    paddingHorizontal: 16,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  vbActionBtnText: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.2,
  },

  // Color schemes matching the classic VB.NET action palette
  btnBillCancel: {
    backgroundColor: "#b91c1c", // Crimson red for Void/Bill Cancel
  },
  btnConvertDelivery: {
    backgroundColor: "#0284c7", // Bright cyan/blue for Convert Delivery
  },
  btnPrintReceipt: {
    backgroundColor: "#15803d", // Forest green for Print Receipt
  },
  btnExit: {
    backgroundColor: "#475569", // Dark slate gray for Exit
  },
  btnMemberAction: {
    backgroundColor: "#7c3aed", // Rich purple for Member action
  },
  memberBadgeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginLeft: 8,
  },
  memberBadgeBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 12,
  },
  btnDisabled: {
    opacity: 0.45,
  },

  // Sub-modal styles
  confirmModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  confirmModalCard: {
    width: "90%",
    maxWidth: 460,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 20,
    elevation: 10,
  },
  confirmModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  confirmModalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
  },
  confirmModalBody: {
    fontSize: 13,
    color: "#334155",
    lineHeight: 19,
  },
  confirmModalBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 20,
    flexWrap: "wrap",
  },
  confirmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 6,
  },
  confirmBtnText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#ffffff",
  },

  memberModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  memberModalCard: {
    width: "90%",
    maxWidth: 500,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    overflow: "hidden",
  },
  memberModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  memberModalTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#ffffff",
  },
  memberSearchInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  memberSearchInput: {
    flex: 1,
    fontSize: 13,
    color: "#0f172a",
    padding: 0,
    outlineStyle: "none" as any,
  },
  memberResultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  memberCodeText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
  },
  memberNameText: {
    fontSize: 12,
    color: "#64748b",
  },
  memberPhoneText: {
    fontSize: 12,
    color: "#2563eb",
    marginRight: 8,
  },

  loadingBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    padding: 24,
  },
  loadingText: {
    fontSize: 12,
    color: "#64748b",
  },
  emptyBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    padding: 24,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#94a3b8",
  },
});
