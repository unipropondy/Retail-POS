// ==============================================================================
// Author: JAVITH, BAVANI 11-11-2026 / Updated 12-11-2026
// Project: Supermarket Retail POS
// Module: Member Management Modal (frmMember.vb / clsMember.vb / clsSales.vb)
// File: frontend/src/components/MemberModal.tsx
// Description: Direct React conversion of VB.NET frmMember.vb:
//              - Left navigation menu: Details (Panel 0) and Previous Invoices (Panel 1).
//              - Member fields: Member Code, IC No (NRIC), Member Name, Member Type,
//                Address 1/2/3, Country, Zip Code, Email, Home Phone, Office Phone, Mobile,
//                DOB, Join Date, Expiry Date, Renewal Date, Gender (M/F), Marital Status
//                (Single/Married/Divorced/Widowed/Others), Zone (East/West/Central/North/South),
//                Monthly Salary, Remarks, Reference Number, Active, SMS & Email checkboxes.
//              - Metrics display: Total Sales, Total Discount, Reward Points, Usage Points,
//                Reward Expiry Date, Member Discount.
//              - Member Type selection triggers Validity & Card Price lookup to automatically
//                calculate Expiry Date, Renewal Date, and Reward Expiry Date (DateAdd Month).
//              - Save & Update with SQL transaction, duplicate NRIC and MemberCode validation.
//              - Member Search integration (opens FindMemberModal or quick barcode lookup).
//              - Previous Invoices tab (subShowPreviousInvoices): Displays Invoice No, Invoice Date,
//                Cashier, Customer Code, Net Total.
//              - Invoice Details pane (subLoadPreviousInvoiceDetails): Displays Item Code,
//                Quantity, Description, Net Amount.
// ==============================================================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getBackendBaseUrl } from "../config/appConfig";
import { useAppConfig } from "../config/ConfigContext";
import FindMemberModal, { MemberSearchItem } from "./FindMemberModal";

const API_URL = getBackendBaseUrl();

export interface MemberTypeOption {
  MemberTypeCode: string;
  Description: string;
  CardPrice: number;
  RPPerDollar: number;
  Validity: number;
  Active: boolean;
}

export interface InvoiceHeaderItem {
  InvoiceNo: string;
  CreateDate: string;
  CashierID: string;
  CustomerCode: string;
  NetTotal: number;
}

export interface InvoiceDetailItem {
  InvoiceNo: string;
  InventoryCode: string;
  Qty: number;
  Description: string;
  NetAmount: number;
}

interface MemberModalProps {
  visible: boolean;
  onClose: () => void;
  initialMemberCode?: string;
  initialPanel?: number; // 0 = Detail, 1 = Previous Invoices
  onMemberSaved?: (memberCode: string, memberName: string) => void;
}

export default function MemberModal({
  visible,
  onClose,
  initialMemberCode,
  initialPanel = 0,
  onMemberSaved,
}: MemberModalProps) {
  const { config } = useAppConfig();
  const primaryColor = "#800020";

  // Navigation Panel Selection: 0 = Member Details, 1 = Previous Invoices (lvMenu_SelectedIndexChanged)
  const [activePanel, setActivePanel] = useState<number>(initialPanel);

  // Form Field States
  const [memberCode, setMemberCode] = useState<string>("");
  const [isMemberCodeAuto, setIsMemberCodeAuto] = useState<boolean>(true);
  const [nricNo, setNricNo] = useState<string>("");
  const [memberName, setMemberName] = useState<string>("");
  const [memberType, setMemberType] = useState<string>("BASIC MEMB");
  const [address1, setAddress1] = useState<string>("");
  const [address2, setAddress2] = useState<string>("");
  const [address3, setAddress3] = useState<string>("");
  const [country, setCountry] = useState<string>("");
  const [zipCode, setZipCode] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [resPhone, setResPhone] = useState<string>("");
  const [offPhone, setOffPhone] = useState<string>("");
  const [mobile, setMobile] = useState<string>("");
  const [dateOfBirth, setDateOfBirth] = useState<string>("");
  const [joinDate, setJoinDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [renewalDate, setRenewalDate] = useState<string>("");
  const [active, setActive] = useState<boolean>(true);
  const [maritalStatus, setMaritalStatus] = useState<string>("Single");
  const [sex, setSex] = useState<string>("M");
  const [zone, setZone] = useState<string>("Central");
  const [monSalary, setMonSalary] = useState<string>("0.00");
  const [remarks, setRemarks] = useState<string>("");
  const [referenceNumber, setReferenceNumber] = useState<string>("");
  const [bySMS, setBySMS] = useState<boolean>(false);
  const [byEmail, setByEmail] = useState<boolean>(false);

  // Metrics from tblMember
  const [totalSales, setTotalSales] = useState<number>(0);
  const [totalDiscount, setTotalDiscount] = useState<number>(0);
  const [totalRewardPoint, setTotalRewardPoint] = useState<number>(0);
  const [totalUsagePoint, setTotalUsagePoint] = useState<number>(0);
  const [rewardExpiryDate, setRewardExpiryDate] = useState<string>("");
  const [memberDiscount, setMemberDiscount] = useState<number>(0);
  const [cardPrice, setCardPrice] = useState<number>(0);

  // Dropdown options & loaded state
  const [memberTypes, setMemberTypes] = useState<MemberTypeOption[]>([]);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Search modal state
  const [showSearchModal, setShowSearchModal] = useState<boolean>(false);

  // Previous Invoices Tab State
  const [invoices, setInvoices] = useState<InvoiceHeaderItem[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceHeaderItem | null>(null);
  const [invoiceDetails, setInvoiceDetails] = useState<InvoiceDetailItem[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState<boolean>(false);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  const showStatus = (text: string, type: "success" | "error" | "info" = "info") => {
    setStatusMessage({ text, type });
    if (type !== "error") {
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  // Helper to add months to a date string (YYYY-MM-DD)
  const addMonths = (baseDateStr: string, months: number): string => {
    const base = baseDateStr ? new Date(baseDateStr) : new Date();
    if (isNaN(base.getTime())) return "";
    const result = new Date(base);
    result.setMonth(result.getMonth() + Number(months));
    return result.toISOString().split("T")[0];
  };

  // 1. Load Member Types
  const loadMemberTypes = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/members/types`);
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.types)) {
        setMemberTypes(data.types);
      }
    } catch (err: any) {
      console.warn("Could not load member types:", err.message);
    }
  }, []);

  // 2. Load Auto Member Code Setting
  const checkAutoMemberCode = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/members/code-setting`);
      const data = await res.json();
      if (res.ok && data.success) {
        setIsMemberCodeAuto(data.isAuto);
        if (data.isAuto) {
          const nextRes = await fetch(`${API_URL}/api/members/next-code`);
          const nextData = await nextRes.json();
          if (nextRes.ok && nextData.success && nextData.nextCode) {
            setMemberCode(nextData.nextCode);
          }
        }
      }
    } catch (err: any) {
      console.warn("Could not check member code setting:", err.message);
    }
  }, []);

  // 3. Load Member Details (subDisplayDetails)
  const loadMemberDetails = useCallback(async (codeToLoad: string) => {
    if (!codeToLoad || !codeToLoad.trim()) return;
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/members/details/${encodeURIComponent(codeToLoad.trim())}`);
      const data = await res.json();
      if (res.ok && data.success && data.member) {
        const m = data.member;
        setMemberCode(m.memberCode || codeToLoad);
        setNricNo(m.nricNo || "");
        setMemberName(m.memberName || "");
        setMemberType(m.memberType || "BASIC MEMB");
        setAddress1(m.address1 || "");
        setAddress2(m.address2 || "");
        setAddress3(m.address3 || "");
        setCountry(m.country || "");
        setZipCode(m.zipCode || "");
        setEmail(m.email || "");
        setResPhone(m.resPhone || "");
        setOffPhone(m.offPhone || "");
        setMobile(m.mobile || "");
        setDateOfBirth(m.dateOfBirth ? String(m.dateOfBirth).split("T")[0] : "");
        setJoinDate(m.joinDate ? String(m.joinDate).split("T")[0] : new Date().toISOString().split("T")[0]);
        setExpiryDate(m.expiryDate ? String(m.expiryDate).split("T")[0] : "");
        setRenewalDate(m.renewalDate ? String(m.renewalDate).split("T")[0] : "");
        setActive(m.active !== false);

        // Convert Sex M/F
        setSex(m.sex === "F" ? "F" : "M");

        // Convert Marital Status
        if (m.maritalStatus === "S") setMaritalStatus("Single");
        else if (m.maritalStatus === "M") setMaritalStatus("Married");
        else if (m.maritalStatus === "D") setMaritalStatus("Divorced");
        else if (m.maritalStatus === "W") setMaritalStatus("Widowed");
        else if (m.maritalStatus === "O") setMaritalStatus("Others");
        else setMaritalStatus("Single");

        // Convert Zone
        if (m.zone === "E") setZone("East");
        else if (m.zone === "W") setZone("West");
        else if (m.zone === "C") setZone("Central");
        else if (m.zone === "N") setZone("North");
        else if (m.zone === "S") setZone("South");
        else setZone("Central");

        setMonSalary(m.monSalary ? Number(m.monSalary).toFixed(2) : "0.00");
        setRemarks(m.remarks || "");
        setReferenceNumber(m.referenceNumber || "");
        setBySMS(Boolean(m.bySMS));
        setByEmail(Boolean(m.byEmail));

        // Metrics
        setTotalSales(Number(m.totalSales) || 0);
        setTotalDiscount(Number(m.totalDiscount) || 0);
        setTotalRewardPoint(Number(m.totalRewardPoint) || 0);
        setTotalUsagePoint(Number(m.totalUsagePoint) || 0);
        setRewardExpiryDate(m.rewardExpiryDate ? String(m.rewardExpiryDate).split("T")[0] : "");
        setMemberDiscount(Number(m.memberDiscount) || 0);
        setCardPrice(Number(m.cardPrice) || 0);

        setIsEditMode(true);
      } else {
        showStatus(data.message || "Member not found.", "error");
      }
    } catch (err: any) {
      console.error("Error loading member details:", err);
      showStatus("Failed to load member: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  // 4. Handle Member Type Change & Calculate Validity / Expiry Dates (txtMemberType_Leave)
  const handleMemberTypeChange = async (typeCode: string) => {
    setMemberType(typeCode);
    try {
      const res = await fetch(`${API_URL}/api/members/type/${encodeURIComponent(typeCode)}`);
      const data = await res.json();
      if (res.ok && data.success && data.memberType) {
        const mt = data.memberType;
        const validityMonths = Number(mt.Validity) || 12;
        setCardPrice(Number(mt.CardPrice) || 0);

        // Date calculation from VB.NET txtMemberType_Leave:
        // dtExpiryDate.Text = DateAdd(DateInterval.Month, nValidity, dtJoinDate.Value)
        // dtRenewalDate.Text = DateAdd(DateInterval.Month, nValidity, dtJoinDate.Value)
        // dtRewardExpiry.Text = DateAdd(DateInterval.Month, nValidity, dtJoinDate.Value)
        const newExpiry = addMonths(joinDate, validityMonths);
        setExpiryDate(newExpiry);
        setRenewalDate(newExpiry);
        setRewardExpiryDate(newExpiry);
      }
    } catch (err) {
      console.warn("Could not calculate dates for member type:", err);
    }
  };

  // 5. Load Previous Invoices (subShowPreviousInvoices)
  const loadPreviousInvoices = useCallback(async (codeToQuery?: string) => {
    const targetCode = (codeToQuery || memberCode).trim();
    if (!targetCode) {
      setInvoices([]);
      setSelectedInvoice(null);
      setInvoiceDetails([]);
      return;
    }

    setLoadingInvoices(true);
    try {
      const res = await fetch(`${API_URL}/api/members/invoices/${encodeURIComponent(targetCode)}`);
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.invoices)) {
        setInvoices(data.invoices);
        if (data.invoices.length > 0) {
          setSelectedInvoice(data.invoices[0]);
          loadInvoiceDetails(data.invoices[0].InvoiceNo);
        } else {
          setSelectedInvoice(null);
          setInvoiceDetails([]);
        }
      } else {
        setInvoices([]);
        setSelectedInvoice(null);
        setInvoiceDetails([]);
      }
    } catch (err: any) {
      console.error("Error loading previous invoices:", err);
      setInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  }, [memberCode]);

  // 6. Load Invoice Details (subLoadPreviousInvoiceDetails)
  const loadInvoiceDetails = async (invoiceNo: string) => {
    if (!invoiceNo) return;
    setLoadingDetails(true);
    try {
      const res = await fetch(`${API_URL}/api/members/invoice-details/${encodeURIComponent(invoiceNo.trim())}`);
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.items)) {
        setInvoiceDetails(data.items);
      } else {
        setInvoiceDetails([]);
      }
    } catch (err: any) {
      console.error("Error loading invoice details:", err);
      setInvoiceDetails([]);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Clear Form State
  const clearForm = () => {
    setMemberCode("");
    setNricNo("");
    setMemberName("");
    setMemberType(memberTypes.length > 0 ? memberTypes[0].MemberTypeCode : "BASIC MEMB");
    setAddress1("");
    setAddress2("");
    setAddress3("");
    setCountry("");
    setZipCode("");
    setEmail("");
    setResPhone("");
    setOffPhone("");
    setMobile("");
    setDateOfBirth("");
    const todayStr = new Date().toISOString().split("T")[0];
    setJoinDate(todayStr);
    setExpiryDate(addMonths(todayStr, 12));
    setRenewalDate(addMonths(todayStr, 12));
    setActive(true);
    setMaritalStatus("Single");
    setSex("M");
    setZone("Central");
    setMonSalary("0.00");
    setRemarks("");
    setReferenceNumber("");
    setBySMS(false);
    setByEmail(false);
    setTotalSales(0);
    setTotalDiscount(0);
    setTotalRewardPoint(0);
    setTotalUsagePoint(0);
    setRewardExpiryDate(addMonths(todayStr, 12));
    setMemberDiscount(0);
    setCardPrice(0);
    setIsEditMode(false);
    setStatusMessage(null);
    setInvoices([]);
    setSelectedInvoice(null);
    setInvoiceDetails([]);
  };

  // Form Initializer on Visible
  useEffect(() => {
    if (visible) {
      loadMemberTypes();
      setActivePanel(initialPanel || 0);

      if (initialMemberCode && initialMemberCode.trim()) {
        const clean = initialMemberCode.trim();
        loadMemberDetails(clean);
        if (initialPanel === 1) {
          loadPreviousInvoices(clean);
        }
      } else {
        clearForm();
        checkAutoMemberCode();
      }
    }
  }, [visible, initialMemberCode, initialPanel]);

  // When switching to Previous Invoices tab, auto-load invoices
  const handleSelectPanel = (panelIdx: number) => {
    setActivePanel(panelIdx);
    if (panelIdx === 1) {
      loadPreviousInvoices();
    }
  };

  // 7. Save / Update Member (subSave & cmdOK_Click)
  const handleSave = async () => {
    // Required field validation (matching VB.NET cmdOK_Click)
    if (!nricNo.trim()) {
      showStatus("Please key in the member IC / NRIC number.", "error");
      return;
    }
    if (!memberName.trim()) {
      showStatus("Please key in the member name.", "error");
      return;
    }
    if (!memberType.trim()) {
      showStatus("Please key in the member type.", "error");
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    try {
      const payload = {
        memberCode: memberCode.trim(),
        nricNo: nricNo.trim(),
        memberName: memberName.trim(),
        memberType: memberType.trim(),
        address1: address1.trim(),
        address2: address2.trim(),
        address3: address3.trim(),
        country: country.trim(),
        zipCode: zipCode.trim(),
        email: email.trim(),
        resPhone: resPhone.trim(),
        offPhone: offPhone.trim(),
        mobile: mobile.trim(),
        createLocation: "HQ",
        dateOfBirth: dateOfBirth ? dateOfBirth : null,
        joinDate: joinDate ? joinDate : new Date().toISOString().split("T")[0],
        expiryDate: expiryDate ? expiryDate : null,
        renewalDate: renewalDate ? renewalDate : null,
        rewardExpiryDate: rewardExpiryDate ? rewardExpiryDate : null,
        active,
        maritalStatus,
        zone,
        sex,
        monSalary: parseFloat(monSalary) || 0,
        remarks: remarks.trim(),
        referenceNumber: referenceNumber.trim(),
        user: "UPS",
        byEmail,
        bySMS,
        isEditMode,
      };

      const res = await fetch(`${API_URL}/api/members/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showStatus(data.message || (isEditMode ? "Updated Successfully" : "Saved Successfully"), "success");
        setIsEditMode(true);
        if (data.memberCode) setMemberCode(data.memberCode);
        if (onMemberSaved) {
          onMemberSaved(data.memberCode || memberCode, memberName);
        }
      } else {
        showStatus(data.message || "Error saving member.", "error");
      }
    } catch (err: any) {
      console.error("Save error:", err);
      showStatus("Failed to save member: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Header Bar */}
          <View style={[styles.headerBar, { backgroundColor: primaryColor }]}>
            <View style={styles.headerTitleRow}>
              <MaterialCommunityIcons name="account-group" size={24} color="#ffffff" />
              <Text style={styles.headerTitleText}>MEMBER MANAGEMENT</Text>
              {memberCode ? (
                <View style={styles.codeBadge}>
                  <Text style={styles.codeBadgeText}>{memberCode}</Text>
                </View>
              ) : null}
            </View>

            <TouchableOpacity
              style={styles.headerCloseBtn}
              onPress={onClose}
              activeOpacity={0.7}
              accessibilityLabel="Close Member Screen"
            >
              <MaterialCommunityIcons name="close" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Status / Alert Banner */}
          {statusMessage && (
            <View
              style={[
                styles.statusBanner,
                statusMessage.type === "success" && styles.bannerSuccess,
                statusMessage.type === "error" && styles.bannerError,
                statusMessage.type === "info" && styles.bannerInfo,
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
              <Text style={styles.statusBannerText}>{statusMessage.text}</Text>
            </View>
          )}

          {/* Main Body with Sidebar (lvMenu) */}
          <View style={styles.bodyLayout}>
            {/* Left Navigation Sidebar */}
            <View style={styles.sidebar}>
              <TouchableOpacity
                style={[
                  styles.navItem,
                  activePanel === 0 && styles.navItemActive,
                ]}
                onPress={() => handleSelectPanel(0)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="card-account-details-outline"
                  size={20}
                  color={activePanel === 0 ? primaryColor : "#64748b"}
                />
                <Text
                  style={[
                    styles.navItemText,
                    activePanel === 0 && { color: primaryColor, fontWeight: "800" },
                  ]}
                >
                  Member Details
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.navItem,
                  activePanel === 1 && styles.navItemActive,
                ]}
                onPress={() => handleSelectPanel(1)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="receipt-text-outline"
                  size={20}
                  color={activePanel === 1 ? primaryColor : "#64748b"}
                />
                <Text
                  style={[
                    styles.navItemText,
                    activePanel === 1 && { color: primaryColor, fontWeight: "800" },
                  ]}
                >
                  Previous Invoices
                </Text>
              </TouchableOpacity>

              <View style={styles.sidebarDivider} />

              <TouchableOpacity
                style={styles.searchLauncherBtn}
                onPress={() => setShowSearchModal(true)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="magnify" size={18} color="#0f172a" />
                <Text style={styles.searchLauncherText}>Find Member (F8)</Text>
              </TouchableOpacity>
            </View>

            {/* Content Area */}
            <View style={styles.contentArea}>
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={primaryColor} />
                  <Text style={styles.loadingText}>Loading Member Information...</Text>
                </View>
              ) : activePanel === 0 ? (
                /* PANEL 0: MEMBER DETAILS */
                <ScrollView
                  style={styles.scrollContainer}
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={true}
                >
                  {/* Top Bar: Code, IC, Name, Type */}
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionHeader}>PRIMARY IDENTIFICATION</Text>
                    <View style={styles.formRow}>
                      {/* Member Code */}
                      <View style={styles.formCol3}>
                        <Text style={styles.fieldLabel}>Member Code</Text>
                        <TextInput
                          style={[styles.input, isMemberCodeAuto && !isEditMode && styles.inputDisabled]}
                          value={memberCode}
                          onChangeText={setMemberCode}
                          editable={!isMemberCodeAuto || isEditMode}
                          placeholder="Auto Generated"
                          placeholderTextColor="#94a3b8"
                        />
                      </View>

                      {/* IC Number */}
                      <View style={styles.formCol3}>
                        <Text style={styles.fieldLabel}>IC / NRIC Number *</Text>
                        <TextInput
                          style={styles.input}
                          value={nricNo}
                          onChangeText={setNricNo}
                          placeholder="NRIC / ID Number"
                          placeholderTextColor="#94a3b8"
                          autoCapitalize="characters"
                        />
                      </View>

                      {/* Member Type */}
                      <View style={styles.formCol3}>
                        <Text style={styles.fieldLabel}>Member Type *</Text>
                        <View style={styles.memberTypeRow}>
                          <TextInput
                            style={[styles.input, { flex: 1 }]}
                            value={memberType}
                            onChangeText={handleMemberTypeChange}
                            placeholder="Type Code"
                            placeholderTextColor="#94a3b8"
                          />
                          <TouchableOpacity
                            style={[styles.typePickerBtn, { backgroundColor: primaryColor }]}
                            onPress={() => {
                              if (memberTypes.length > 0) {
                                const currentIndex = memberTypes.findIndex(
                                  (t) => t.MemberTypeCode.trim() === memberType.trim()
                                );
                                const nextIndex = (currentIndex + 1) % memberTypes.length;
                                handleMemberTypeChange(memberTypes[nextIndex].MemberTypeCode);
                              }
                            }}
                            activeOpacity={0.8}
                          >
                            <MaterialCommunityIcons name="swap-horizontal" size={16} color="#ffffff" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>

                    {/* Member Name */}
                    <View style={[styles.formRow, { marginTop: 8 }]}>
                      <View style={styles.formColFull}>
                        <Text style={styles.fieldLabel}>Member Name *</Text>
                        <TextInput
                          style={styles.input}
                          value={memberName}
                          onChangeText={setMemberName}
                          placeholder="Full Name"
                          placeholderTextColor="#94a3b8"
                        />
                      </View>
                    </View>
                  </View>

                  {/* Address Section */}
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionHeader}>ADDRESS & LOCATION</Text>
                    <View style={styles.formRow}>
                      <View style={styles.formColFull}>
                        <Text style={styles.fieldLabel}>Address Line 1</Text>
                        <TextInput
                          style={styles.input}
                          value={address1}
                          onChangeText={setAddress1}
                          placeholder="Street Address / Block / Unit"
                          placeholderTextColor="#94a3b8"
                        />
                      </View>
                    </View>

                    <View style={[styles.formRow, { marginTop: 8 }]}>
                      <View style={styles.formCol2}>
                        <Text style={styles.fieldLabel}>Address Line 2</Text>
                        <TextInput
                          style={styles.input}
                          value={address2}
                          onChangeText={setAddress2}
                          placeholder="Building / Floor"
                          placeholderTextColor="#94a3b8"
                        />
                      </View>
                      <View style={styles.formCol2}>
                        <Text style={styles.fieldLabel}>Address Line 3</Text>
                        <TextInput
                          style={styles.input}
                          value={address3}
                          onChangeText={setAddress3}
                          placeholder="Area / Estate"
                          placeholderTextColor="#94a3b8"
                        />
                      </View>
                    </View>

                    <View style={[styles.formRow, { marginTop: 8 }]}>
                      <View style={styles.formCol3}>
                        <Text style={styles.fieldLabel}>Country</Text>
                        <TextInput
                          style={styles.input}
                          value={country}
                          onChangeText={setCountry}
                          placeholder="Country"
                          placeholderTextColor="#94a3b8"
                        />
                      </View>
                      <View style={styles.formCol3}>
                        <Text style={styles.fieldLabel}>Zip Code</Text>
                        <TextInput
                          style={styles.input}
                          value={zipCode}
                          onChangeText={setZipCode}
                          placeholder="Postal Code"
                          placeholderTextColor="#94a3b8"
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={styles.formCol3}>
                        <Text style={styles.fieldLabel}>Zone (E / W / C / N / S)</Text>
                        <View style={styles.genderRow}>
                          {["East", "West", "Central", "North", "South"].map((z) => (
                            <TouchableOpacity
                              key={z}
                              style={[
                                styles.pillOption,
                                zone === z && { backgroundColor: primaryColor, borderColor: primaryColor },
                              ]}
                              onPress={() => setZone(z)}
                              activeOpacity={0.8}
                            >
                              <Text
                                style={[
                                  styles.pillOptionText,
                                  zone === z && { color: "#ffffff", fontWeight: "700" },
                                ]}
                              >
                                {z.charAt(0)}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Contact Information */}
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionHeader}>CONTACT DETAILS</Text>
                    <View style={styles.formRow}>
                      <View style={styles.formCol3}>
                        <Text style={styles.fieldLabel}>Mobile Phone</Text>
                        <TextInput
                          style={styles.input}
                          value={mobile}
                          onChangeText={setMobile}
                          placeholder="Mobile Number"
                          placeholderTextColor="#94a3b8"
                          keyboardType="phone-pad"
                        />
                      </View>
                      <View style={styles.formCol3}>
                        <Text style={styles.fieldLabel}>Home Phone</Text>
                        <TextInput
                          style={styles.input}
                          value={resPhone}
                          onChangeText={setResPhone}
                          placeholder="Residence Phone"
                          placeholderTextColor="#94a3b8"
                          keyboardType="phone-pad"
                        />
                      </View>
                      <View style={styles.formCol3}>
                        <Text style={styles.fieldLabel}>Office Phone</Text>
                        <TextInput
                          style={styles.input}
                          value={offPhone}
                          onChangeText={setOffPhone}
                          placeholder="Office Phone"
                          placeholderTextColor="#94a3b8"
                          keyboardType="phone-pad"
                        />
                      </View>
                    </View>

                    <View style={[styles.formRow, { marginTop: 8 }]}>
                      <View style={styles.formCol2}>
                        <Text style={styles.fieldLabel}>Email Address</Text>
                        <TextInput
                          style={styles.input}
                          value={email}
                          onChangeText={setEmail}
                          placeholder="email@example.com"
                          placeholderTextColor="#94a3b8"
                          keyboardType="email-address"
                          autoCapitalize="none"
                        />
                      </View>
                      <View style={styles.formCol2}>
                        <Text style={styles.fieldLabel}>Notification Preferences</Text>
                        <View style={styles.checkboxRow}>
                          <TouchableOpacity
                            style={styles.checkboxBtn}
                            onPress={() => setBySMS(!bySMS)}
                            activeOpacity={0.8}
                          >
                            <MaterialCommunityIcons
                              name={bySMS ? "checkbox-marked" : "checkbox-blank-outline"}
                              size={20}
                              color={bySMS ? primaryColor : "#64748b"}
                            />
                            <Text style={styles.checkboxLabel}>By SMS</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.checkboxBtn}
                            onPress={() => setByEmail(!byEmail)}
                            activeOpacity={0.8}
                          >
                            <MaterialCommunityIcons
                              name={byEmail ? "checkbox-marked" : "checkbox-blank-outline"}
                              size={20}
                              color={byEmail ? primaryColor : "#64748b"}
                            />
                            <Text style={styles.checkboxLabel}>By Email</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Demographics & Dates */}
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionHeader}>DEMOGRAPHICS & MEMBERSHIP DATES</Text>
                    <View style={styles.formRow}>
                      <View style={styles.formCol3}>
                        <Text style={styles.fieldLabel}>Gender</Text>
                        <View style={styles.genderRow}>
                          <TouchableOpacity
                            style={[
                              styles.pillOption,
                              sex === "M" && { backgroundColor: primaryColor, borderColor: primaryColor },
                            ]}
                            onPress={() => setSex("M")}
                            activeOpacity={0.8}
                          >
                            <Text
                              style={[
                                styles.pillOptionText,
                                sex === "M" && { color: "#ffffff", fontWeight: "700" },
                              ]}
                            >
                              Male
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.pillOption,
                              sex === "F" && { backgroundColor: primaryColor, borderColor: primaryColor },
                            ]}
                            onPress={() => setSex("F")}
                            activeOpacity={0.8}
                          >
                            <Text
                              style={[
                                styles.pillOptionText,
                                sex === "F" && { color: "#ffffff", fontWeight: "700" },
                              ]}
                            >
                              Female
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={styles.formCol3}>
                        <Text style={styles.fieldLabel}>Marital Status</Text>
                        <View style={styles.genderRow}>
                          {["Single", "Married", "Divorced", "Widowed", "Others"].map((m) => (
                            <TouchableOpacity
                              key={m}
                              style={[
                                styles.pillOptionSmall,
                                maritalStatus === m && { backgroundColor: primaryColor, borderColor: primaryColor },
                              ]}
                              onPress={() => setMaritalStatus(m)}
                              activeOpacity={0.8}
                            >
                              <Text
                                style={[
                                  styles.pillOptionTextSmall,
                                  maritalStatus === m && { color: "#ffffff", fontWeight: "700" },
                                ]}
                              >
                                {m}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>

                      <View style={styles.formCol3}>
                        <Text style={styles.fieldLabel}>Date of Birth (YYYY-MM-DD)</Text>
                        <TextInput
                          style={styles.input}
                          value={dateOfBirth}
                          onChangeText={setDateOfBirth}
                          placeholder="1990-01-01"
                          placeholderTextColor="#94a3b8"
                        />
                      </View>
                    </View>

                    <View style={[styles.formRow, { marginTop: 8 }]}>
                      <View style={styles.formCol3}>
                        <Text style={styles.fieldLabel}>Join Date</Text>
                        <TextInput
                          style={styles.input}
                          value={joinDate}
                          onChangeText={setJoinDate}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor="#94a3b8"
                        />
                      </View>

                      <View style={styles.formCol3}>
                        <Text style={styles.fieldLabel}>Expiry Date</Text>
                        <TextInput
                          style={styles.input}
                          value={expiryDate}
                          onChangeText={setExpiryDate}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor="#94a3b8"
                        />
                      </View>

                      <View style={styles.formCol3}>
                        <Text style={styles.fieldLabel}>Renewal Date</Text>
                        <TextInput
                          style={styles.input}
                          value={renewalDate}
                          onChangeText={setRenewalDate}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor="#94a3b8"
                        />
                      </View>
                    </View>

                    <View style={[styles.formRow, { marginTop: 8 }]}>
                      <View style={styles.formCol3}>
                        <Text style={styles.fieldLabel}>Monthly Salary</Text>
                        <TextInput
                          style={styles.input}
                          value={monSalary}
                          onChangeText={setMonSalary}
                          placeholder="0.00"
                          placeholderTextColor="#94a3b8"
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={styles.formCol3}>
                        <Text style={styles.fieldLabel}>Reference Number</Text>
                        <TextInput
                          style={styles.input}
                          value={referenceNumber}
                          onChangeText={setReferenceNumber}
                          placeholder="Ref / Referral Code"
                          placeholderTextColor="#94a3b8"
                        />
                      </View>
                      <View style={styles.formCol3}>
                        <Text style={styles.fieldLabel}>Account Status</Text>
                        <TouchableOpacity
                          style={styles.checkboxBtn}
                          onPress={() => setActive(!active)}
                          activeOpacity={0.8}
                        >
                          <MaterialCommunityIcons
                            name={active ? "checkbox-marked" : "checkbox-blank-outline"}
                            size={20}
                            color={active ? primaryColor : "#64748b"}
                          />
                          <Text style={[styles.checkboxLabel, { fontWeight: "700" }]}>
                            {active ? "Active Member" : "Inactive / Suspended"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={[styles.formRow, { marginTop: 8 }]}>
                      <View style={styles.formColFull}>
                        <Text style={styles.fieldLabel}>Remarks</Text>
                        <TextInput
                          style={styles.input}
                          value={remarks}
                          onChangeText={setRemarks}
                          placeholder="Additional Notes / Member Remarks"
                          placeholderTextColor="#94a3b8"
                        />
                      </View>
                    </View>
                  </View>

                  {/* Financial & Reward Metrics */}
                  <View style={styles.metricsCard}>
                    <Text style={styles.metricsTitle}>FINANCIAL & REWARD METRICS</Text>
                    <View style={styles.metricsGrid}>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Total Sales</Text>
                        <Text style={styles.metricVal}>${totalSales.toFixed(2)}</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Total Discount</Text>
                        <Text style={styles.metricVal}>${totalDiscount.toFixed(2)}</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Reward Points</Text>
                        <Text style={[styles.metricVal, { color: "#16a34a" }]}>{totalRewardPoint}</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Usage Points</Text>
                        <Text style={[styles.metricVal, { color: "#dc2626" }]}>{totalUsagePoint}</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Reward Expiry</Text>
                        <Text style={styles.metricValSmall}>{rewardExpiryDate || "-"}</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Card Price</Text>
                        <Text style={styles.metricVal}>${cardPrice.toFixed(2)}</Text>
                      </View>
                    </View>
                  </View>
                </ScrollView>
              ) : (
                /* PANEL 1: PREVIOUS INVOICES (subShowPreviousInvoices & subLoadPreviousInvoiceDetails) */
                <View style={styles.invoicesPanelContainer}>
                  {/* Top: Invoice Headers Table */}
                  <View style={styles.invoicesHeaderSection}>
                    <View style={styles.panelTitleRow}>
                      <MaterialCommunityIcons name="history" size={20} color="#0f172a" />
                      <Text style={styles.panelTitleText}>
                        PREVIOUS INVOICES FOR {memberCode || "MEMBER"} ({invoices.length})
                      </Text>
                    </View>

                    {/* Header Grid */}
                    <View style={styles.gridHeaderRow}>
                      <Text style={[styles.gridHeaderCell, { flex: 2 }]}>INVOICE NO</Text>
                      <Text style={[styles.gridHeaderCell, { flex: 2 }]}>DATE</Text>
                      <Text style={[styles.gridHeaderCell, { flex: 1.5 }]}>CASHIER</Text>
                      <Text style={[styles.gridHeaderCell, { flex: 1.5 }]}>CUSTOMER</Text>
                      <Text style={[styles.gridHeaderCell, { flex: 1.5, textAlign: "right" }]}>NET TOTAL</Text>
                    </View>

                    {loadingInvoices ? (
                      <View style={styles.loadingInner}>
                        <ActivityIndicator size="small" color={primaryColor} />
                        <Text style={styles.loadingTextSmall}>Loading invoice history...</Text>
                      </View>
                    ) : invoices.length === 0 ? (
                      <View style={styles.emptyTableContainer}>
                        <Text style={styles.emptyTableText}>No previous invoices found for this member.</Text>
                      </View>
                    ) : (
                      <ScrollView style={styles.invoicesScrollView}>
                        {invoices.map((inv, idx) => {
                          const isSelected = selectedInvoice?.InvoiceNo === inv.InvoiceNo;
                          return (
                            <TouchableOpacity
                              key={`${inv.InvoiceNo}-${idx}`}
                              style={[
                                styles.gridDataRow,
                                idx % 2 === 0 ? styles.rowEven : styles.rowOdd,
                                isSelected && styles.rowSelected,
                              ]}
                              onPress={() => {
                                setSelectedInvoice(inv);
                                loadInvoiceDetails(inv.InvoiceNo);
                              }}
                              activeOpacity={0.8}
                            >
                              <Text style={[styles.gridDataCell, { flex: 2, fontWeight: "700" }]}>
                                {inv.InvoiceNo}
                              </Text>
                              <Text style={[styles.gridDataCell, { flex: 2 }]}>
                                {inv.CreateDate ? new Date(inv.CreateDate).toLocaleString() : "-"}
                              </Text>
                              <Text style={[styles.gridDataCell, { flex: 1.5 }]}>{inv.CashierID}</Text>
                              <Text style={[styles.gridDataCell, { flex: 1.5 }]}>{inv.CustomerCode}</Text>
                              <Text style={[styles.gridDataCell, { flex: 1.5, textAlign: "right", fontWeight: "800" }]}>
                                ${(Number(inv.NetTotal) || 0).toFixed(2)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>

                  {/* Bottom: Invoice Details Table */}
                  <View style={styles.invoiceDetailsSection}>
                    <View style={styles.panelTitleRow}>
                      <MaterialCommunityIcons name="format-list-bulleted" size={18} color="#0f172a" />
                      <Text style={styles.panelTitleText}>
                        INVOICE DETAILS: {selectedInvoice ? selectedInvoice.InvoiceNo : "Select an invoice above"}
                      </Text>
                    </View>

                    <View style={styles.gridHeaderRowSub}>
                      <Text style={[styles.gridHeaderCell, { flex: 2 }]}>ITEM CODE</Text>
                      <Text style={[styles.gridHeaderCell, { flex: 1, textAlign: "center" }]}>QTY</Text>
                      <Text style={[styles.gridHeaderCell, { flex: 4 }]}>DESCRIPTION</Text>
                      <Text style={[styles.gridHeaderCell, { flex: 2, textAlign: "right" }]}>NET AMOUNT</Text>
                    </View>

                    {loadingDetails ? (
                      <View style={styles.loadingInner}>
                        <ActivityIndicator size="small" color={primaryColor} />
                        <Text style={styles.loadingTextSmall}>Loading line items...</Text>
                      </View>
                    ) : invoiceDetails.length === 0 ? (
                      <View style={styles.emptyTableContainer}>
                        <Text style={styles.emptyTableText}>No items found for this invoice.</Text>
                      </View>
                    ) : (
                      <ScrollView style={styles.detailsScrollView}>
                        {invoiceDetails.map((item, idx) => (
                          <View
                            key={`${item.InventoryCode}-${idx}`}
                            style={[
                              styles.gridDataRow,
                              idx % 2 === 0 ? styles.rowEven : styles.rowOdd,
                            ]}
                          >
                            <Text style={[styles.gridDataCell, { flex: 2, fontWeight: "600" }]}>
                              {item.InventoryCode}
                            </Text>
                            <Text style={[styles.gridDataCell, { flex: 1, textAlign: "center", fontWeight: "700" }]}>
                              {item.Qty}
                            </Text>
                            <Text style={[styles.gridDataCell, { flex: 4 }]}>{item.Description}</Text>
                            <Text style={[styles.gridDataCell, { flex: 2, textAlign: "right", fontWeight: "800" }]}>
                              ${(Number(item.NetAmount) || 0).toFixed(2)}
                            </Text>
                          </View>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Bottom Actions Bar */}
          <View style={styles.bottomBar}>
            <View style={styles.bottomLeftActions}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={clearForm}
                disabled={saving}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="file-document-outline" size={18} color="#0f172a" />
                <Text style={styles.secondaryBtnText}>New / Clear</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setShowSearchModal(true)}
                disabled={saving}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="account-search" size={18} color="#0f172a" />
                <Text style={styles.secondaryBtnText}>Search</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.bottomRightActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
                disabled={saving}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: primaryColor }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name={isEditMode ? "content-save-edit" : "content-save"}
                      size={18}
                      color="#ffffff"
                    />
                    <Text style={styles.saveBtnText}>
                      {isEditMode ? "Update" : "Save"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Member Search Modal (frmMemberSearch.vb) */}
      <FindMemberModal
        visible={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSelectMember={(item: MemberSearchItem) => {
          setShowSearchModal(false);
          loadMemberDetails(item.MemberCode);
          if (activePanel === 1) {
            loadPreviousInvoices(item.MemberCode);
          }
        }}
        primaryColor={primaryColor}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 960,
    height: "92%",
    maxHeight: 740,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 10,
    flexDirection: "column",
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerTitleText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.6,
  },
  codeBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  codeBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#ffffff",
  },
  headerCloseBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  bannerSuccess: {
    backgroundColor: "#f0fdf4",
    borderBottomColor: "#bbf7d0",
  },
  bannerError: {
    backgroundColor: "#fef2f2",
    borderBottomColor: "#fecaca",
  },
  bannerInfo: {
    backgroundColor: "#eff6ff",
    borderBottomColor: "#bfdbfe",
  },
  statusBannerText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1e293b",
    flex: 1,
  },
  bodyLayout: {
    flex: 1,
    flexDirection: "row",
  },
  sidebar: {
    width: 200,
    backgroundColor: "#f8fafc",
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
    padding: 12,
    gap: 8,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "transparent",
  },
  navItemActive: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#64748b",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 1,
  },
  navItemText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  sidebarDivider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 6,
  },
  searchLauncherBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#e2e8f0",
  },
  searchLauncherText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#0f172a",
  },
  contentArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
  },
  cardSection: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 14,
  },
  sectionHeader: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  formRow: {
    flexDirection: "row",
    gap: 12,
  },
  formColFull: {
    flex: 1,
  },
  formCol2: {
    flex: 1,
  },
  formCol3: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 4,
  },
  input: {
    height: 38,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 7,
    paddingHorizontal: 10,
    fontSize: 13,
    color: "#0f172a",
  },
  inputDisabled: {
    backgroundColor: "#f1f5f9",
    color: "#64748b",
  },
  memberTypeRow: {
    flexDirection: "row",
    gap: 6,
  },
  typePickerBtn: {
    width: 38,
    height: 38,
    borderRadius: 7,
    justifyContent: "center",
    alignItems: "center",
  },
  genderRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  pillOption: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  pillOptionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  pillOptionSmall: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  pillOptionTextSmall: {
    fontSize: 11,
    fontWeight: "600",
    color: "#334155",
  },
  checkboxRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
    height: 38,
  },
  checkboxBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  checkboxLabel: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#334155",
  },
  metricsCard: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 14,
  },
  metricsTitle: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#475569",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  metricsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
  },
  metricItem: {
    minWidth: 110,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 8,
    alignItems: "center",
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 4,
  },
  metricVal: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },
  metricValSmall: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
  },
  invoicesPanelContainer: {
    flex: 1,
    flexDirection: "column",
  },
  invoicesHeaderSection: {
    flex: 1.2,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
  },
  invoiceDetailsSection: {
    flex: 1,
  },
  panelTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  panelTitleText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#1e293b",
    letterSpacing: 0.5,
  },
  gridHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
  },
  gridHeaderRowSub: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
  },
  gridHeaderCell: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#334155",
  },
  invoicesScrollView: {
    flex: 1,
  },
  detailsScrollView: {
    flex: 1,
  },
  gridDataRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  rowEven: {
    backgroundColor: "#ffffff",
  },
  rowOdd: {
    backgroundColor: "#f8fafc",
  },
  rowSelected: {
    backgroundColor: "#fef2f2",
    borderLeftWidth: 3,
    borderLeftColor: "#800020",
  },
  gridDataCell: {
    fontSize: 12.5,
    color: "#1e293b",
  },
  loadingInner: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingTextSmall: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  emptyTableContainer: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTableText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#94a3b8",
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#f8fafc",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  bottomLeftActions: {
    flexDirection: "row",
    gap: 8,
  },
  bottomRightActions: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  secondaryBtnText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#0f172a",
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "#e2e8f0",
    justifyContent: "center",
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 8,
    justifyContent: "center",
    minWidth: 100,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
});
