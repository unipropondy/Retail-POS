// ==============================================================================
// Project: Supermarket Retail POS
// Module: Void Bill / Bill Cancellation Modal (frmBillCancel.vb)
// File: frontend/src/components/VoidBillModal.tsx
// Description: Replicates exact VB.NET frmBillCancel.vb workflow:
//              - Enter the Invoice Number (prefilled with location code or typed).
//              - Fetch sales header using entered Invoice Number.
//              - ShiftNo validation: If ShiftNo is 0 or empty/null, allow cancellation.
//              - If ShiftNo > 0 or history bill, reject with exact VB message:
//                "You cannot cancel History Bills ....Please Give Correct Bill No".
//              - Step 1 Confirmation: "Do you want to cancel the bill {InvoiceNo}?"
//              - Step 2 Question: "Do you want to print the void bill?"
//              - Calls backend POST /api/bills/cancel (DB transaction, sp_SalesBillCancel,
//                sp_SaveMemberPointsByInvoice, member points sync to HQ, background DataSync).
//              - If print is chosen, fetches void receipt from /api/bills/void-receipt/:inv
//                and prints or previews with high-contrast "VOID BILL" header.
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
import { ThemeConfig } from "../utils/theme";
import ClearAdminAuthModal from "./ClearAdminAuthModal";

export interface VoidBillModalProps {
  visible: boolean;
  onClose: () => void;
  apiUrl: string;
  activeLocation?: string;
  activeCashier?: string;
  activeTerminal?: string;
  primaryColor?: string;
  theme?: ThemeConfig;
  initialInvoiceNo?: string;
  onAdminAuthRequest?: (username: string, pass: string) => Promise<boolean>;
  onSuccess?: (cancelledInvoiceNo: string) => void;
}

export default function VoidBillModal({
  visible,
  onClose,
  apiUrl,
  activeLocation = "HQ",
  activeCashier = "UPS",
  activeTerminal = "1",
  primaryColor = "#7A1C30",
  theme,
  initialInvoiceNo = "",
  onAdminAuthRequest,
  onSuccess,
}: VoidBillModalProps) {
  // Input state
  const [billNo, setBillNo] = useState<string>("");
  const [fetchingHeader, setFetchingHeader] = useState<boolean>(false);
  const [billDetails, setBillDetails] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  // Dialog step states
  // Step 1: "Do you want to cancel the bill {InvoiceNo}?"
  const [showStep1Confirm, setShowStep1Confirm] = useState<boolean>(false);
  // Step 2: "Do you want to print the void bill?"
  const [showStep2PrintConfirm, setShowStep2PrintConfirm] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  // Admin authorization dialog (F3 permission check)
  const [showAdminAuthModal, setShowAdminAuthModal] = useState<boolean>(false);

  // Void receipt preview modal
  const [showVoidReceiptModal, setShowVoidReceiptModal] = useState<boolean>(false);
  const [voidReceiptData, setVoidReceiptData] = useState<any | null>(null);

  // Notice alert banner
  const [notice, setNotice] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);

  const inputRef = useRef<any>(null);

  const showNotice = (msg: string, type: "success" | "error" | "info" = "info") => {
    setNotice({ msg, type });
    if (type !== "error") {
      setTimeout(() => setNotice(null), 4000);
    }
  };

  // Reset or prefill on open (matching frmBillCancel_Load: txtBillNo.Text = gsLocationCode)
  useEffect(() => {
    if (visible) {
      const init = initialInvoiceNo.trim() || activeLocation.trim();
      setBillNo(init);
      setBillDetails(null);
      setItems([]);
      setPayments([]);
      setShowStep1Confirm(false);
      setShowStep2PrintConfirm(false);
      setNotice(null);

      if (initialInvoiceNo.trim()) {
        fetchBillHeader(initialInvoiceNo.trim());
      } else {
        setTimeout(() => inputRef.current?.focus(), 150);
      }
    }
  }, [visible, initialInvoiceNo, activeLocation]);

  // Fetch bill details from backend
  const fetchBillHeader = async (invToFetch: string) => {
    const cleanInv = invToFetch.trim();
    if (!cleanInv) {
      showNotice("Please enter an Invoice Number.", "error");
      return;
    }

    setFetchingHeader(true);
    setNotice(null);
    try {
      const res = await fetch(`${apiUrl}/api/bills/${encodeURIComponent(cleanInv)}`);
      const data = await res.json();

      if (res.ok && data.success && data.bill) {
        setBillDetails(data.bill);
        setItems(data.items || []);
        setPayments(data.payments || []);
      } else {
        setBillDetails(null);
        setItems([]);
        setPayments([]);
        showNotice(data.message || `Invoice #${cleanInv} was not found.`, "error");
      }
    } catch (err: any) {
      setBillDetails(null);
      setItems([]);
      setPayments([]);
      showNotice(err.message || "Failed to fetch invoice details.", "error");
    } finally {
      setFetchingHeader(false);
    }
  };

  // User clicks Save (F4) / Cancel Bill button
  const handleInitiateCancel = async () => {
    const cleanInv = billNo.trim();
    if (!cleanInv) {
      showNotice("Please enter an Invoice Number.", "error");
      inputRef.current?.focus();
      return;
    }

    // Check F3 Void Bill cashier permission
    try {
      const permRes = await fetch(
        `${apiUrl}/api/bills/check-cancel-permission?cashierId=${encodeURIComponent(activeCashier)}`
      );
      const permData = await permRes.json();
      if (permRes.ok && permData.hasPermission === false) {
        setShowAdminAuthModal(true);
        return;
      }
    } catch {
      // Continue if permission check endpoint fails
    }

    proceedToConfirmation();
  };

  const proceedToConfirmation = () => {
    setShowStep1Confirm(true);
  };

  // Step 1: User says YES to "Do you want to cancel the bill?"
  const handleStep1Yes = () => {
    setShowStep1Confirm(false);
    setShowStep2PrintConfirm(true);
  };

  // Step 2: User answers print question (Yes = printVoidBill: true, No = printVoidBill: false)
  const handleStep2PrintChoice = async (printVoid: boolean) => {
    setShowStep2PrintConfirm(false);
    await executeBillCancellation(printVoid);
  };

  // Perform backend cancellation
  const executeBillCancellation = async (printVoidBill: boolean) => {
    const cleanInv = billNo.trim();
    setIsCancelling(true);
    setNotice(null);

    try {
      const res = await fetch(`${apiUrl}/api/bills/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNo: cleanInv,
          cashierId: activeCashier,
          locationCode: activeLocation,
          printVoidBill,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showNotice(
          `Bill Cancelled Successfully. (Void Ref #${data.billCancelNo})`,
          "success"
        );

        if (onSuccess) {
          onSuccess(cleanInv);
        }

        // If print requested, load void receipt details and display receipt preview
        if (printVoidBill) {
          try {
            const rRes = await fetch(
              `${apiUrl}/api/bills/void-receipt/${encodeURIComponent(cleanInv)}`
            );
            const rData = await rRes.json();
            if (rRes.ok && rData.success) {
              setVoidReceiptData(rData);
              setShowVoidReceiptModal(true);
            }
          } catch (rErr) {
            console.warn("Could not load void receipt:", rErr);
          }
        } else {
          setTimeout(() => {
            onClose();
          }, 1500);
        }
      } else {
        showNotice(
          data.message || "You cannot cancel History Bills ....Please Give Correct Bill No",
          "error"
        );
      }
    } catch (err: any) {
      showNotice(err.message || "Failed to cancel bill.", "error");
    } finally {
      setIsCancelling(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={[styles.modalHeader, { backgroundColor: primaryColor }]}>
            <View style={styles.headerTitleBox}>
              <MaterialCommunityIcons name="cancel" size={24} color="#ffffff" />
              <Text style={styles.modalHeaderTitle}>Void Bill (frmBillCancel)</Text>
              <View style={styles.locBadge}>
                <Text style={styles.locBadgeText}>LOC: {activeLocation}</Text>
              </View>
            </View>

            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.8}>
              <MaterialCommunityIcons name="close" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Notice Alert Banner */}
          {notice && (
            <View
              style={[
                styles.noticeBanner,
                notice.type === "error"
                  ? styles.noticeError
                  : notice.type === "success"
                  ? styles.noticeSuccess
                  : styles.noticeInfo,
              ]}
            >
              <MaterialCommunityIcons
                name={
                  notice.type === "error"
                    ? "alert-circle"
                    : notice.type === "success"
                    ? "check-circle"
                    : "information"
                }
                size={18}
                color={
                  notice.type === "error"
                    ? "#b91c1c"
                    : notice.type === "success"
                    ? "#15803d"
                    : "#0369a1"
                }
              />
              <Text style={styles.noticeText}>{notice.msg}</Text>
              <TouchableOpacity onPress={() => setNotice(null)}>
                <MaterialCommunityIcons name="close" size={16} color="#64748b" />
              </TouchableOpacity>
            </View>
          )}

          {/* Body Content */}
          <View style={styles.modalBody}>
            {/* Input Bar: Invoice Number */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>Invoice / Bill Number:</Text>
              <View style={styles.inputRow}>
                <TextInput
                  ref={inputRef}
                  style={styles.billInput}
                  value={billNo}
                  onChangeText={setBillNo}
                  placeholder="e.g. HQ0007405"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="characters"
                  onSubmitEditing={() => fetchBillHeader(billNo)}
                  returnKeyType="search"
                />

                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnFetch, { backgroundColor: primaryColor }]}
                  onPress={() => fetchBillHeader(billNo)}
                  disabled={fetchingHeader}
                  activeOpacity={0.85}
                >
                  {fetchingHeader ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="magnify" size={18} color="#ffffff" />
                      <Text style={styles.btnText}>Find Bill</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnReset]}
                  onPress={() => {
                    setBillNo(activeLocation);
                    setBillDetails(null);
                    setItems([]);
                    setPayments([]);
                    setNotice(null);
                    inputRef.current?.focus();
                  }}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons name="refresh" size={18} color="#475569" />
                  <Text style={[styles.btnText, { color: "#475569" }]}>Reset</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Bill Details Summary Card */}
            {billDetails ? (
              <View style={styles.billDetailsCard}>
                <View style={styles.billMetaGrid}>
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLabel}>Invoice No:</Text>
                    <Text style={styles.metaValueHighlight}>{billDetails.InvoiceNo}</Text>
                  </View>
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLabel}>Date / Time:</Text>
                    <Text style={styles.metaValue}>
                      {new Date(billDetails.InvoiceDate).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLabel}>Cashier / Till:</Text>
                    <Text style={styles.metaValue}>
                      {billDetails.CashierID || activeCashier} ({billDetails.TerminalCode || activeTerminal})
                    </Text>
                  </View>
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLabel}>Member / Customer:</Text>
                    <Text style={styles.metaValue}>
                      {billDetails.CustomerCode || "CASH"} - {billDetails.CustomerName || ""}
                    </Text>
                  </View>
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLabel}>Total Lines:</Text>
                    <Text style={styles.metaValue}>{items.length || billDetails.TotalLines}</Text>
                  </View>
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLabel}>Net Total:</Text>
                    <Text style={styles.metaTotalValue}>
                      ${Number(billDetails.NetTotal || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Line Items Preview */}
                <Text style={styles.itemsHeaderTitle}>Line Items in this Bill:</Text>
                <ScrollView style={styles.itemsTableScroll} showsVerticalScrollIndicator>
                  <View style={styles.itemsTableHeader}>
                    <Text style={[styles.thCell, { flex: 1.2 }]}>Code</Text>
                    <Text style={[styles.thCell, { flex: 3.5 }]}>Description</Text>
                    <Text style={[styles.thCell, { flex: 1, textAlign: "right" }]}>Qty</Text>
                    <Text style={[styles.thCell, { flex: 1.3, textAlign: "right" }]}>Price</Text>
                    <Text style={[styles.thCell, { flex: 1.4, textAlign: "right" }]}>Total</Text>
                  </View>

                  {items.map((it: any, idx: number) => (
                    <View
                      key={idx}
                      style={[styles.itemsTableRow, idx % 2 === 1 && styles.itemsTableRowAlt]}
                    >
                      <Text style={[styles.tdCell, { flex: 1.2, fontFamily: "Courier" }]}>
                        {it.InventoryCode}
                      </Text>
                      <Text style={[styles.tdCell, { flex: 3.5 }]} numberOfLines={1}>
                        {it.Description}
                      </Text>
                      <Text style={[styles.tdCell, { flex: 1, textAlign: "right", fontWeight: "700" }]}>
                        {it.Qty}
                      </Text>
                      <Text style={[styles.tdCell, { flex: 1.3, textAlign: "right" }]}>
                        ${Number(it.Price || 0).toFixed(2)}
                      </Text>
                      <Text style={[styles.tdCell, { flex: 1.4, textAlign: "right", fontWeight: "800" }]}>
                        ${Number(it.TotalValue || it.NetAmount || 0).toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </ScrollView>

                {/* Payment Breakdown Strip */}
                {payments.length > 0 && (
                  <View style={styles.paymentStrip}>
                    <Text style={styles.payStripTitle}>Settlement:</Text>
                    {payments.map((p: any, pIdx: number) => (
                      <View key={pIdx} style={styles.payBadge}>
                        <Text style={styles.payBadgeText}>
                          {p.PayMode}: ${Number(p.Amount || 0).toFixed(2)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.emptyStateBox}>
                <MaterialCommunityIcons name="file-search-outline" size={54} color="#cbd5e1" />
                <Text style={styles.emptyTitle}>No Bill Selected</Text>
                <Text style={styles.emptySubtitle}>
                  Enter an Invoice Number above and click "Find Bill" or press F4 to initiate void.
                </Text>
              </View>
            )}
          </View>

          {/* Footer Navigation Strip */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.footerBtn, styles.btnCancel]}
              onPress={onClose}
              disabled={isCancelling}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="close" size={18} color="#475569" />
              <Text style={styles.footerBtnTextCancel}>Close (Esc)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.footerBtn,
                styles.btnVoid,
                (!billNo.trim() || isCancelling) && styles.btnDisabled,
              ]}
              onPress={handleInitiateCancel}
              disabled={!billNo.trim() || isCancelling}
              activeOpacity={0.85}
            >
              {isCancelling ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <MaterialCommunityIcons name="delete-forever" size={20} color="#ffffff" />
                  <Text style={styles.footerBtnTextVoid}>Void Bill (F4)</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* =========================================================================
          STEP 1: CONFIRMATION MODAL ("Do you want to cancel the bill {InvoiceNo}?")
      ========================================================================= */}
      <Modal visible={showStep1Confirm} transparent animationType="fade">
        <View style={styles.subModalBackdrop}>
          <View style={styles.dialogCard}>
            <View style={styles.dialogHeader}>
              <MaterialCommunityIcons name="alert-octagon" size={34} color="#dc2626" />
              <Text style={styles.dialogTitle}>Cancel Bill</Text>
            </View>

            <Text style={styles.dialogBodyText}>
              Do you want to cancel the bill <Text style={{ fontWeight: "800" }}>{billNo.trim()}</Text>?
            </Text>

            <View style={styles.dialogBtnRow}>
              <TouchableOpacity
                style={[styles.dialogBtn, styles.dialogBtnNo]}
                onPress={() => setShowStep1Confirm(false)}
              >
                <Text style={styles.dialogBtnTextNo}>No</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dialogBtn, styles.dialogBtnYes]}
                onPress={handleStep1Yes}
              >
                <Text style={styles.dialogBtnTextYes}>Yes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          STEP 2: VOID RECEIPT PRINT CONFIRMATION ("Do you want to print the void bill?")
      ========================================================================= */}
      <Modal visible={showStep2PrintConfirm} transparent animationType="fade">
        <View style={styles.subModalBackdrop}>
          <View style={styles.dialogCard}>
            <View style={styles.dialogHeader}>
              <MaterialCommunityIcons name="printer-outline" size={34} color="#0284c7" />
              <Text style={styles.dialogTitle}>Print Void Bill?</Text>
            </View>

            <Text style={styles.dialogBodyText}>
              Do you want to print the void bill?
            </Text>

            <View style={styles.dialogBtnRow}>
              <TouchableOpacity
                style={[styles.dialogBtn, styles.dialogBtnNo]}
                onPress={() => handleStep2PrintChoice(false)}
              >
                <Text style={styles.dialogBtnTextNo}>No</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dialogBtn, styles.dialogBtnYes, { backgroundColor: "#0284c7" }]}
                onPress={() => handleStep2PrintChoice(true)}
              >
                <Text style={styles.dialogBtnTextYes}>Yes (Print)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          VOID RECEIPT PREVIEW / PRINT MODAL
      ========================================================================= */}
      <Modal visible={showVoidReceiptModal} transparent animationType="fade">
        <View style={styles.subModalBackdrop}>
          <View style={styles.receiptCard}>
            <View style={styles.receiptHeader}>
              <Text style={styles.receiptHeaderTitle}>Void Bill Receipt Preview</Text>
              <TouchableOpacity onPress={() => setShowVoidReceiptModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color="#ffffff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.receiptScroll}>
              <View style={styles.receiptPaper}>
                {/* VOID BILL BANNER matching VB.NET clsPrint */}
                <View style={styles.voidBannerBox}>
                  <Text style={styles.voidBannerText}>*** VOID BILL ***</Text>
                  <Text style={styles.voidSubBanner}>BILL CANCELLATION RECEIPT</Text>
                </View>

                {voidReceiptData && (
                  <>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptKey}>Void Ref No:</Text>
                      <Text style={styles.receiptValHighlight}>
                        #{voidReceiptData.header.BillCancelNo}
                      </Text>
                    </View>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptKey}>Original Invoice:</Text>
                      <Text style={styles.receiptVal}>{voidReceiptData.header.InvoiceNo}</Text>
                    </View>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptKey}>Date:</Text>
                      <Text style={styles.receiptVal}>
                        {new Date(voidReceiptData.header.InvoiceDate).toLocaleDateString()}
                      </Text>
                    </View>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptKey}>Cancelled By:</Text>
                      <Text style={styles.receiptVal}>
                        {voidReceiptData.header.BillCancelledBy || activeCashier}
                      </Text>
                    </View>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptKey}>Terminal / Loc:</Text>
                      <Text style={styles.receiptVal}>
                        {voidReceiptData.header.TerminalCode} / {voidReceiptData.header.LocationCode}
                      </Text>
                    </View>

                    <View style={styles.receiptDivider} />

                    {/* Void Items List */}
                    {voidReceiptData.items?.map((it: any, iIdx: number) => (
                      <View key={iIdx} style={styles.receiptItemRow}>
                        <Text style={styles.receiptItemDesc} numberOfLines={1}>
                          {it.Description}
                        </Text>
                        <View style={styles.receiptItemSub}>
                          <Text style={styles.receiptItemQty}>
                            {it.Qty} x ${Number(it.Price || 0).toFixed(2)}
                          </Text>
                          <Text style={styles.receiptItemTotal}>
                            -${Number(it.TotalValue || it.NetAmount || 0).toFixed(2)}
                          </Text>
                        </View>
                      </View>
                    ))}

                    <View style={styles.receiptDivider} />

                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptKeyBold}>Total Voided Amount:</Text>
                      <Text style={styles.receiptTotalHighlight}>
                        -${Number(voidReceiptData.header.NetTotal || 0).toFixed(2)}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </ScrollView>

            <View style={styles.receiptActionsRow}>
              <TouchableOpacity
                style={[styles.receiptBtn, { backgroundColor: "#0284c7" }]}
                onPress={() => {
                  if (Platform.OS === "web" && typeof window !== "undefined") {
                    window.print();
                  } else {
                    showNotice("Sent to thermal receipt printer.", "success");
                  }
                  setShowVoidReceiptModal(false);
                  onClose();
                }}
              >
                <MaterialCommunityIcons name="printer" size={18} color="#ffffff" />
                <Text style={styles.receiptBtnText}>Print Receipt</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.receiptBtn, { backgroundColor: "#64748b" }]}
                onPress={() => {
                  setShowVoidReceiptModal(false);
                  onClose();
                }}
              >
                <Text style={styles.receiptBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Admin Auth Modal if cashier lacks F3 permission */}
      {onAdminAuthRequest && (
        <ClearAdminAuthModal
          visible={showAdminAuthModal}
          onClose={() => setShowAdminAuthModal(false)}
          onSubmit={async (u, p) => {
            const ok = await onAdminAuthRequest(u, p);
            if (ok) {
              setShowAdminAuthModal(false);
              setTimeout(() => proceedToConfirmation(), 200);
            }
            return ok;
          }}
          primaryColor={primaryColor}
          theme={theme}
          actionTitle="Bill Cancellation Authorization (F3)"
          promptMessage="Cashier does not have permission to cancel bills (F3). Enter Admin or Supervisor credentials:"
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
  },
  modalContainer: {
    width: "100%",
    maxWidth: 820,
    maxHeight: "90%",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  headerTitleBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  locBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  locBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
  closeBtn: {
    padding: 4,
  },

  // Notice Banner
  noticeBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  noticeError: {
    backgroundColor: "#fef2f2",
    borderBottomColor: "#fecaca",
  },
  noticeSuccess: {
    backgroundColor: "#f0fdf4",
    borderBottomColor: "#bbf7d0",
  },
  noticeInfo: {
    backgroundColor: "#f0f9ff",
    borderBottomColor: "#bae6fd",
  },
  noticeText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: "700",
    color: "#0f172a",
    marginHorizontal: 8,
  },

  modalBody: {
    padding: 16,
    maxHeight: 520,
  },
  inputSection: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#334155",
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  billInput: {
    flex: 1,
    height: 42,
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: 1,
  },
  actionBtn: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  btnFetch: {
    backgroundColor: "#7A1C30",
  },
  btnReset: {
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  btnText: {
    color: "#ffffff",
    fontSize: 12.5,
    fontWeight: "800",
  },

  // Bill Details Card
  billDetailsCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
  },
  billMetaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  metaCol: {
    width: "31%",
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  metaValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
    marginTop: 1,
  },
  metaValueHighlight: {
    fontSize: 13,
    fontWeight: "900",
    color: "#7A1C30",
    marginTop: 1,
  },
  metaTotalValue: {
    fontSize: 15,
    fontWeight: "900",
    color: "#b91c1c",
    marginTop: 1,
  },

  itemsHeaderTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
    marginTop: 10,
    marginBottom: 6,
  },
  itemsTableScroll: {
    maxHeight: 180,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
  },
  itemsTableHeader: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  thCell: {
    fontSize: 11,
    fontWeight: "800",
    color: "#334155",
  },
  itemsTableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f8fafc",
    alignItems: "center",
  },
  itemsTableRowAlt: {
    backgroundColor: "#fbfcfe",
  },
  tdCell: {
    fontSize: 11.5,
    color: "#0f172a",
  },

  paymentStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  payStripTitle: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#475569",
  },
  payBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  payBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0f172a",
  },

  emptyStateBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 45,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#64748b",
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 4,
    maxWidth: 400,
  },

  modalFooter: {
    height: 54,
    backgroundColor: "#f8fafc",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  footerBtn: {
    height: 40,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    gap: 6,
  },
  btnCancel: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  btnVoid: {
    backgroundColor: "#b91c1c",
  },
  btnDisabled: {
    backgroundColor: "#cbd5e1",
  },
  footerBtnTextCancel: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#475569",
  },
  footerBtnTextVoid: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff",
  },

  // Sub-modal dialog styles
  subModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  dialogCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  dialogHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  dialogTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
  },
  dialogBodyText: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 20,
    marginBottom: 20,
  },
  dialogBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  dialogBtn: {
    height: 38,
    paddingHorizontal: 18,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  dialogBtnNo: {
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  dialogBtnYes: {
    backgroundColor: "#dc2626",
  },
  dialogBtnTextNo: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  dialogBtnTextYes: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff",
  },

  // Receipt preview styles
  receiptCard: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "85%",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    overflow: "hidden",
  },
  receiptHeader: {
    height: 44,
    backgroundColor: "#1e293b",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  receiptHeaderTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  receiptScroll: {
    maxHeight: 460,
    backgroundColor: "#f1f5f9",
    padding: 12,
  },
  receiptPaper: {
    backgroundColor: "#ffffff",
    borderRadius: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  voidBannerBox: {
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: "#b91c1c",
    borderStyle: "dashed",
    marginBottom: 10,
  },
  voidBannerText: {
    fontSize: 17,
    fontWeight: "900",
    color: "#b91c1c",
    letterSpacing: 2,
  },
  voidSubBanner: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#64748b",
    marginTop: 2,
  },
  receiptRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 2,
  },
  receiptKey: {
    fontSize: 11.5,
    color: "#64748b",
    fontWeight: "600",
  },
  receiptKeyBold: {
    fontSize: 12.5,
    color: "#0f172a",
    fontWeight: "800",
  },
  receiptVal: {
    fontSize: 11.5,
    color: "#0f172a",
    fontWeight: "700",
  },
  receiptValHighlight: {
    fontSize: 12.5,
    color: "#b91c1c",
    fontWeight: "900",
  },
  receiptDivider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 8,
    borderStyle: "dashed",
  },
  receiptItemRow: {
    marginVertical: 3,
  },
  receiptItemDesc: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#0f172a",
  },
  receiptItemSub: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 1,
  },
  receiptItemQty: {
    fontSize: 10.5,
    color: "#64748b",
  },
  receiptItemTotal: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#b91c1c",
  },
  receiptTotalHighlight: {
    fontSize: 15,
    fontWeight: "900",
    color: "#b91c1c",
  },
  receiptActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    padding: 10,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  receiptBtn: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  receiptBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
});
