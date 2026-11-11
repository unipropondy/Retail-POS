// ==============================================================================
// Author: JAVITH, BAVANI 11-11-2026
// Project: Supermarket Retail POS
// Module: Member Modal (frmMember.vb / clsMember.vb)
// File: frontend/src/components/MemberModal.tsx
// Description: Member detail management & viewer modal opened directly from
//              the Last Transaction screen (cmdMember_Click).
//              Uses Sp_POS_GetMember, Sp_GetNextMemberCode, sp_Pos_MemberSave.
// ==============================================================================

import React, { useState, useEffect } from "react";
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

const API_URL = getBackendBaseUrl();

export interface MemberData {
  memberCode: string;
  nricNo: string;
  memberName: string;
  memberType: string;
  address1: string;
  address2: string;
  address3: string;
  street: string;
  buildingName: string;
  country: string;
  zipCode: string;
  email: string;
  resPhone: string;
  offPhone: string;
  mobile: string;
  createLocation: string;
  dateOfBirth?: string | null;
  joinDate?: string | null;
  expiryDate?: string | null;
  renewalDate?: string | null;
  totalSales: number;
  totalDiscount: number;
  totalRewardPoint: number;
  totalUsagePoint: number;
  rewardExpiryDate?: string | null;
  active: boolean;
  memberDiscount: number;
  maritalStatus: string;
  zone: string;
  sex: string;
  monSalary: number;
  remarks: string;
  referenceNumber: string;
  bySMS: boolean;
  byEmail: boolean;
  cardPrice: number;
}

export interface MemberTypeOption {
  MemberTypeCode: string;
  Description: string;
  CardPrice: number;
  RPPerDollar: number;
  Validity: number;
  Active: boolean;
}

interface MemberModalProps {
  visible: boolean;
  onClose: () => void;
  initialMemberCode?: string;
  onMemberSaved?: (memberCode: string, memberName: string) => void;
}

export default function MemberModal({
  visible,
  onClose,
  initialMemberCode,
  onMemberSaved,
}: MemberModalProps) {
  const { config } = useAppConfig();
  const primaryColor = "#800020";

  // Form Field States
  const [memberCode, setMemberCode] = useState<string>("");
  const [nricNo, setNricNo] = useState<string>("");
  const [memberName, setMemberName] = useState<string>("");
  const [memberType, setMemberType] = useState<string>("BASIC MEMB");
  const [address1, setAddress1] = useState<string>("");
  const [address2, setAddress2] = useState<string>("");
  const [address3, setAddress3] = useState<string>("");
  const [street, setStreet] = useState<string>("");
  const [buildingName, setBuildingName] = useState<string>("");
  const [country, setCountry] = useState<string>("");
  const [zipCode, setZipCode] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [resPhone, setResPhone] = useState<string>("");
  const [offPhone, setOffPhone] = useState<string>("");
  const [mobile, setMobile] = useState<string>("");
  const [dateOfBirth, setDateOfBirth] = useState<string>("");
  const [joinDate, setJoinDate] = useState<string>("");
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [active, setActive] = useState<boolean>(true);
  const [maritalStatus, setMaritalStatus] = useState<string>("Single");
  const [sex, setSex] = useState<string>("M");
  const [zone, setZone] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");
  const [bySMS, setBySMS] = useState<boolean>(false);
  const [byEmail, setByEmail] = useState<boolean>(false);

  // Read-only metrics from Sp_POS_GetMember
  const [totalSales, setTotalSales] = useState<number>(0);
  const [totalRewardPoint, setTotalRewardPoint] = useState<number>(0);
  const [totalUsagePoint, setTotalUsagePoint] = useState<number>(0);
  const [totalDiscount, setTotalDiscount] = useState<number>(0);
  const [cardPrice, setCardPrice] = useState<number>(0);

  // Dropdowns & Loading
  const [memberTypes, setMemberTypes] = useState<MemberTypeOption[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [searchBarcode, setSearchBarcode] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Load Member Types from tblMemberType
  useEffect(() => {
    if (visible) {
      loadMemberTypes();
      if (initialMemberCode && initialMemberCode.trim()) {
        const cleanCode = initialMemberCode.trim();
        setSearchBarcode(cleanCode);
        loadMemberDetails(cleanCode);
      } else {
        clearForm();
        checkAutoMemberCode();
      }
    }
  }, [visible, initialMemberCode]);

  const loadMemberTypes = async () => {
    try {
      const res = await fetch(`${API_URL}/api/members/types`);
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.types)) {
        setMemberTypes(data.types);
        if (data.types.length > 0 && !memberType) {
          setMemberType(data.types[0].MemberTypeCode);
        }
      }
    } catch (err: any) {
      console.warn("Could not load member types:", err.message);
    }
  };

  const checkAutoMemberCode = async () => {
    try {
      const res = await fetch(`${API_URL}/api/members/next-code`);
      const data = await res.json();
      if (res.ok && data.success && data.isAuto && data.nextCode) {
        setMemberCode(data.nextCode);
      }
    } catch {}
  };

  const clearForm = () => {
    setMemberCode("");
    setNricNo("");
    setMemberName("");
    setMemberType("BASIC MEMB");
    setAddress1("");
    setAddress2("");
    setAddress3("");
    setStreet("");
    setBuildingName("");
    setCountry("");
    setZipCode("");
    setEmail("");
    setResPhone("");
    setOffPhone("");
    setMobile("");
    setDateOfBirth("");
    setJoinDate(new Date().toISOString().split("T")[0]);
    setExpiryDate("");
    setActive(true);
    setMaritalStatus("Single");
    setSex("M");
    setZone("");
    setRemarks("");
    setBySMS(false);
    setByEmail(false);
    setTotalSales(0);
    setTotalRewardPoint(0);
    setTotalUsagePoint(0);
    setTotalDiscount(0);
    setCardPrice(0);
    setStatusMessage(null);
  };

  // Load member using Sp_POS_GetMember
  const loadMemberDetails = async (code: string) => {
    if (!code || !code.trim()) return;
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/members/details/${encodeURIComponent(code.trim())}`);
      const data = await res.json();

      if (res.ok && data.success && data.member) {
        const m: MemberData = data.member;
        setMemberCode(m.memberCode);
        setNricNo(m.nricNo);
        setMemberName(m.memberName);
        setMemberType(m.memberType || "BASIC MEMB");
        setAddress1(m.address1);
        setAddress2(m.address2);
        setAddress3(m.address3);
        setStreet(m.street);
        setBuildingName(m.buildingName);
        setCountry(m.country);
        setZipCode(m.zipCode);
        setEmail(m.email);
        setResPhone(m.resPhone);
        setOffPhone(m.offPhone);
        setMobile(m.mobile);
        setDateOfBirth(m.dateOfBirth ? m.dateOfBirth.split("T")[0] : "");
        setJoinDate(m.joinDate ? m.joinDate.split("T")[0] : "");
        setExpiryDate(m.expiryDate ? m.expiryDate.split("T")[0] : "");
        setActive(m.active);
        setMaritalStatus(m.maritalStatus || "Single");
        setSex(m.sex || "M");
        setZone(m.zone);
        setRemarks(m.remarks);
        setBySMS(m.bySMS);
        setByEmail(m.byEmail);
        setTotalSales(m.totalSales);
        setTotalRewardPoint(m.totalRewardPoint);
        setTotalUsagePoint(m.totalUsagePoint);
        setTotalDiscount(m.totalDiscount);
        setCardPrice(m.cardPrice);

        setStatusMessage({
          text: `Loaded details for ${m.memberName} (${m.memberCode}).`,
          type: "success",
        });
      } else {
        setStatusMessage({
          text: data.message || `Member '${code}' not found in database.`,
          type: "error",
        });
      }
    } catch (err: any) {
      setStatusMessage({
        text: err.message || "Network error loading member details.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  // Save / Update member via sp_Pos_MemberSave
  const handleSaveMember = async () => {
    if (!nricNo.trim()) {
      setStatusMessage({ text: "Please enter NRIC / ID Number.", type: "error" });
      return;
    }
    if (!memberName.trim()) {
      setStatusMessage({ text: "Please enter Member Name.", type: "error" });
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
        street: street.trim(),
        buildingName: buildingName.trim(),
        country: country.trim(),
        zipCode: zipCode.trim(),
        email: email.trim(),
        resPhone: resPhone.trim(),
        offPhone: offPhone.trim(),
        mobile: mobile.trim(),
        createLocation: "HQ",
        dateOfBirth: dateOfBirth ? dateOfBirth : null,
        joinDate: joinDate ? joinDate : new Date().toISOString(),
        expiryDate: expiryDate ? expiryDate : null,
        active,
        maritalStatus: maritalStatus.trim(),
        zone: zone.trim(),
        sex: sex.trim(),
        monSalary: 0,
        remarks: remarks.trim(),
        referenceNumber: "",
        user: "UPS",
        byEmail,
        bySMS,
      };

      const res = await fetch(`${API_URL}/api/members/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage({ text: data.message || "Member saved successfully.", type: "success" });
        if (onMemberSaved) {
          onMemberSaved(data.member?.memberCode || memberCode, memberName);
        }
      } else {
        setStatusMessage({ text: data.message || "Failed to save member.", type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || "Network error saving member.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Header */}
          <View style={[styles.header, { backgroundColor: primaryColor }]}>
            <View style={styles.headerTitleRow}>
              <MaterialCommunityIcons name="card-account-details-outline" size={24} color="#ffffff" />
              <Text style={styles.headerTitle}>Member Master / Lookup</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Quick Search Bar */}
          <View style={styles.searchBar}>
            <View style={styles.searchInputWrap}>
              <MaterialCommunityIcons name="barcode-scan" size={20} color="#64748b" />
              <TextInput
                style={styles.searchInput}
                placeholder="Scan / Enter Member Code or NRIC..."
                value={searchBarcode}
                onChangeText={setSearchBarcode}
                onSubmitEditing={() => loadMemberDetails(searchBarcode)}
                placeholderTextColor="#94a3b8"
              />
              {searchBarcode ? (
                <TouchableOpacity onPress={() => setSearchBarcode("")}>
                  <MaterialCommunityIcons name="close-circle" size={16} color="#94a3b8" />
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              style={[styles.searchBtn, { backgroundColor: primaryColor }]}
              onPress={() => loadMemberDetails(searchBarcode)}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <MaterialCommunityIcons name="magnify" size={16} color="#ffffff" />
                  <Text style={styles.searchBtnText}>Lookup</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Status Banner */}
          {statusMessage ? (
            <View
              style={[
                styles.noticeBanner,
                statusMessage.type === "success"
                  ? styles.noticeSuccess
                  : statusMessage.type === "error"
                  ? styles.noticeError
                  : styles.noticeInfo,
              ]}
            >
              <Text
                style={[
                  styles.noticeText,
                  statusMessage.type === "success"
                    ? styles.noticeTextSuccess
                    : statusMessage.type === "error"
                    ? styles.noticeTextError
                    : styles.noticeTextInfo,
                ]}
              >
                {statusMessage.text}
              </Text>
            </View>
          ) : null}

          {/* Body Content */}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* Top Stat Cards (from Sp_POS_GetMember) */}
            <View style={styles.statRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Total Sales</Text>
                <Text style={styles.statValue}>${totalSales.toFixed(2)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Reward Points</Text>
                <Text style={[styles.statValue, { color: "#16a34a" }]}>{totalRewardPoint}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Points Used</Text>
                <Text style={[styles.statValue, { color: "#ea580c" }]}>{totalUsagePoint}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Member Status</Text>
                <Text style={[styles.statValue, { color: active ? "#16a34a" : "#dc2626" }]}>
                  {active ? "ACTIVE" : "INACTIVE"}
                </Text>
              </View>
            </View>

            {/* Form Fields: Grid 2 Columns */}
            <View style={styles.formGrid}>
              {/* Left Column */}
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>Member Code</Text>
                <TextInput
                  style={[styles.input, styles.inputDisabled]}
                  value={memberCode}
                  editable={false}
                  placeholder="Auto-generated"
                />

                <Text style={styles.fieldLabel}>NRIC / Passport / ID *</Text>
                <TextInput
                  style={styles.input}
                  value={nricNo}
                  onChangeText={setNricNo}
                  placeholder="e.g. 9786310609"
                />

                <Text style={styles.fieldLabel}>Member Name *</Text>
                <TextInput
                  style={styles.input}
                  value={memberName}
                  onChangeText={setMemberName}
                  placeholder="Full Name"
                />

                <Text style={styles.fieldLabel}>Member Type</Text>
                <View style={styles.typeRow}>
                  {memberTypes.map((t) => (
                    <TouchableOpacity
                      key={t.MemberTypeCode}
                      style={[
                        styles.typePill,
                        memberType === t.MemberTypeCode && { backgroundColor: primaryColor },
                      ]}
                      onPress={() => setMemberType(t.MemberTypeCode)}
                    >
                      <Text
                        style={[
                          styles.typePillText,
                          memberType === t.MemberTypeCode && { color: "#ffffff", fontWeight: "700" },
                        ]}
                      >
                        {t.Description.trim()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Mobile Phone</Text>
                <TextInput
                  style={styles.input}
                  value={mobile}
                  onChangeText={setMobile}
                  placeholder="e.g. 9786310609"
                  keyboardType="phone-pad"
                />

                <Text style={styles.fieldLabel}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="name@example.com"
                  keyboardType="email-address"
                />
              </View>

              {/* Right Column */}
              <View style={styles.formCol}>
                <Text style={styles.fieldLabel}>Address Line 1</Text>
                <TextInput
                  style={styles.input}
                  value={address1}
                  onChangeText={setAddress1}
                  placeholder="Street / Unit"
                />

                <Text style={styles.fieldLabel}>Address Line 2 / Building</Text>
                <TextInput
                  style={styles.input}
                  value={address2}
                  onChangeText={setAddress2}
                  placeholder="Building Name / Area"
                />

                <Text style={styles.fieldLabel}>Postal / Zip Code</Text>
                <TextInput
                  style={styles.input}
                  value={zipCode}
                  onChangeText={setZipCode}
                  placeholder="e.g. 609876"
                />

                <View style={styles.inlineRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.fieldLabel}>Gender</Text>
                    <View style={styles.typeRow}>
                      {["M", "F"].map((s) => (
                        <TouchableOpacity
                          key={s}
                          style={[styles.typePill, sex === s && { backgroundColor: primaryColor }]}
                          onPress={() => setSex(s)}
                        >
                          <Text style={[styles.typePillText, sex === s && { color: "#ffffff" }]}>
                            {s === "M" ? "Male" : "Female"}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Status</Text>
                    <TouchableOpacity
                      style={[
                        styles.statusBtn,
                        active ? { backgroundColor: "#dcfce7" } : { backgroundColor: "#fee2e2" },
                      ]}
                      onPress={() => setActive(!active)}
                    >
                      <Text style={{ fontWeight: "700", color: active ? "#16a34a" : "#dc2626" }}>
                        {active ? "Active" : "Inactive"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={styles.fieldLabel}>Remarks</Text>
                <TextInput
                  style={[styles.input, { height: 60 }]}
                  value={remarks}
                  onChangeText={setRemarks}
                  placeholder="Notes / Preferences..."
                  multiline
                />
              </View>
            </View>
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.clearBtn} onPress={clearForm}>
              <MaterialCommunityIcons name="eraser" size={18} color="#64748b" />
              <Text style={styles.clearBtnText}>New / Clear</Text>
            </TouchableOpacity>

            <View style={styles.footerRight}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>Exit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: primaryColor }]}
                onPress={handleSaveMember}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="content-save-outline" size={18} color="#ffffff" />
                    <Text style={styles.saveBtnText}>Save Member</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 880,
    maxHeight: "92%",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
    display: "flex",
    flexDirection: "column",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: 4,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    gap: 12,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#0f172a",
  },
  searchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 8,
    justifyContent: "center",
  },
  searchBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  noticeBanner: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  noticeSuccess: {
    backgroundColor: "#dcfce7",
  },
  noticeError: {
    backgroundColor: "#fee2e2",
  },
  noticeInfo: {
    backgroundColor: "#e0f2fe",
  },
  noticeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  noticeTextSuccess: {
    color: "#166534",
  },
  noticeTextError: {
    color: "#991b1b",
  },
  noticeTextInfo: {
    color: "#0369a1",
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 20,
  },
  statRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  formGrid: {
    flexDirection: "row",
    gap: 20,
  },
  formCol: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 4,
    marginTop: 10,
  },
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    paddingHorizontal: 12,
    height: 38,
    fontSize: 14,
    color: "#0f172a",
  },
  inputDisabled: {
    backgroundColor: "#f8fafc",
    color: "#64748b",
    fontWeight: "600",
  },
  typeRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  typePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  typePillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  statusBtn: {
    height: 34,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#f8fafc",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  footerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  cancelBtn: {
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    height: 38,
    borderRadius: 6,
    justifyContent: "center",
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
});

