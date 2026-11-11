// ==============================================================================
// Author: JAVITH, BAVANI 11-11-2026
// Project: Supermarket Retail POS
// Module: Find Member Screen (frmMemberSearch.vb)
// File: frontend/src/components/FindMemberModal.tsx
// Description: Implements exact VB.NET Find Member screen UI & business logic:
//              - Filters panel:
//                  * Name / Phone No text input
//                  * Radio options: F1 Starts with, F2 Exact, F3 Contains (default)
//                  * Refresh button (green glossy gradient style)
//              - Member List Grid:
//                  * DataGrid columns: Member Code, Name, Member Type, Phone No
//                  * Row selection with active highlighting
//                  * Double click / enter to select
//              - Bottom action buttons:
//                  * Add (opens MemberModal for new member creation)
//                  * Edit (opens MemberModal with selected member)
//                  * Ok (F4) - returns selected Member to caller
//                  * Close (Esc) - dismisses without selecting
//              - Full Keyboard Shortcuts: F1, F2, F3, F4, Esc, Enter
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getBackendBaseUrl } from "../config/appConfig";
import MemberModal from "./MemberModal";

const API_URL = getBackendBaseUrl();

export interface MemberSearchItem {
  MemberCode: string;
  MemberName: string;
  MemberType: string;
  PhoneNo: string;
  Mobile?: string;
  ResPhone?: string;
  OffPhone?: string;
  NricNo?: string;
  Address1?: string;
  Address2?: string;
  Address3?: string;
  Active?: boolean;
}

export type SearchMode = "STARTS_WITH" | "EXACT" | "CONTAINS";

interface FindMemberModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectMember: (member: MemberSearchItem) => void;
  initialQuery?: string;
}

export default function FindMemberModal({
  visible,
  onClose,
  onSelectMember,
  initialQuery = "",
}: FindMemberModalProps) {
  // Filter States
  const [query, setQuery] = useState<string>(initialQuery);
  const [searchMode, setSearchMode] = useState<SearchMode>("CONTAINS");

  // Grid / Data States
  const [members, setMembers] = useState<MemberSearchItem[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberSearchItem | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Sub-modal state for Add / Edit
  const [showMemberEditModal, setShowMemberEditModal] = useState<boolean>(false);
  const [memberCodeForEdit, setMemberCodeForEdit] = useState<string>("");

  const inputRef = useRef<any>(null);

  // Load Members from Backend
  const loadMembers = useCallback(
    async (qText?: string, mode?: SearchMode) => {
      setLoading(true);
      setErrorMsg("");
      const activeQ = qText !== undefined ? qText : query;
      const activeMode = mode !== undefined ? mode : searchMode;

      try {
        const url = `${API_URL}/api/members/search?query=${encodeURIComponent(
          activeQ.trim()
        )}&mode=${encodeURIComponent(activeMode)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (res.ok && data.success && Array.isArray(data.members)) {
          setMembers(data.members);
          if (data.members.length > 0) {
            // Keep existing selection if present in new list, else select first row
            setSelectedMember((prev) => {
              if (!prev) return data.members[0];
              const found = data.members.find((m: MemberSearchItem) => m.MemberCode === prev.MemberCode);
              return found || data.members[0];
            });
          } else {
            setSelectedMember(null);
          }
        } else {
          setMembers([]);
          setSelectedMember(null);
          if (!data.success && data.message) {
            setErrorMsg(data.message);
          }
        }
      } catch (err: any) {
        console.error("❌ [FIND MEMBER ERROR]:", err.message);
        setErrorMsg("Failed to connect to members database.");
        setMembers([]);
        setSelectedMember(null);
      } finally {
        setLoading(false);
      }
    },
    [query, searchMode]
  );

  // Trigger search on mount/visibility change
  useEffect(() => {
    if (visible) {
      setQuery(initialQuery);
      setSearchMode("CONTAINS");
      setErrorMsg("");
      loadMembers(initialQuery, "CONTAINS");
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [visible, initialQuery, loadMembers]);

  // Keyboard Shortcuts (Web / Desktop listener for F1, F2, F3, F4, Esc)
  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (showMemberEditModal) return; // Don't intercept when Add/Edit modal is open

      if (e.key === "F1") {
        e.preventDefault();
        setSearchMode("STARTS_WITH");
        loadMembers(query, "STARTS_WITH");
      } else if (e.key === "F2") {
        e.preventDefault();
        setSearchMode("EXACT");
        loadMembers(query, "EXACT");
      } else if (e.key === "F3") {
        e.preventDefault();
        setSearchMode("CONTAINS");
        loadMembers(query, "CONTAINS");
      } else if (e.key === "F4") {
        e.preventDefault();
        handleOk();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter") {
        // If Enter is pressed, execute search or confirm selection
        e.preventDefault();
        if (selectedMember) {
          handleOk();
        } else {
          loadMembers();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible, showMemberEditModal, query, selectedMember, loadMembers, onClose]);

  // Actions
  const handleRefresh = () => {
    loadMembers();
  };

  const handleSelectMode = (mode: SearchMode) => {
    setSearchMode(mode);
    loadMembers(query, mode);
  };

  const handleRowClick = (item: MemberSearchItem) => {
    setSelectedMember(item);
  };

  const handleRowDoubleClick = (item: MemberSearchItem) => {
    setSelectedMember(item);
    onSelectMember(item);
  };

  const handleOk = () => {
    if (!selectedMember) {
      setErrorMsg("Please select a member from the list.");
      return;
    }
    onSelectMember(selectedMember);
  };

  const handleAdd = () => {
    setMemberCodeForEdit("");
    setShowMemberEditModal(true);
  };

  const handleEdit = () => {
    if (!selectedMember) {
      setErrorMsg("Please select a member to edit.");
      return;
    }
    setMemberCodeForEdit(selectedMember.MemberCode);
    setShowMemberEditModal(true);
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.windowFrame}>
          {/* Windows Classic Style Title Bar */}
          <View style={styles.titleBar}>
            <View style={styles.titleLeft}>
              <View style={styles.titleIcon}>
                <View style={styles.titleIconYellow} />
                <View style={styles.titleIconBlue} />
              </View>
              <Text style={styles.titleText}>Find Member</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeWindowBtn}>
              <MaterialCommunityIcons name="close" size={18} color="#000000" />
            </TouchableOpacity>
          </View>

          {/* Window Body */}
          <View style={styles.windowBody}>
            {/* Filters Group Box matching screenshot */}
            <View style={styles.filtersGroupBox}>
              <Text style={styles.filtersGroupLabel}>Filters</Text>

              <View style={styles.filtersContentRow}>
                {/* Left: Name / Phone No input & Refresh Button */}
                <View style={styles.filterLeftCol}>
                  <View style={styles.inputRow}>
                    <Text style={styles.inputLabel}>Name / Phone No</Text>
                    <TextInput
                      ref={inputRef}
                      style={styles.textInput}
                      value={query}
                      onChangeText={(t) => setQuery(t)}
                      onSubmitEditing={() => loadMembers()}
                      autoCapitalize="characters"
                    />
                  </View>

                  <View style={styles.refreshBtnRow}>
                    <TouchableOpacity
                      style={styles.refreshBtn}
                      onPress={handleRefresh}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.refreshBtnText}>Refresh</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Right: Radio Options (F1 Starts with, F2 Exact, F3 Contains) */}
                <View style={styles.filterRightCol}>
                  <TouchableOpacity
                    style={styles.radioOption}
                    onPress={() => handleSelectMode("STARTS_WITH")}
                    activeOpacity={0.7}
                  >
                    <View style={styles.radioCircle}>
                      {searchMode === "STARTS_WITH" && <View style={styles.radioDot} />}
                    </View>
                    <Text style={styles.radioLabel}>F1 Starts with</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.radioOption}
                    onPress={() => handleSelectMode("EXACT")}
                    activeOpacity={0.7}
                  >
                    <View style={styles.radioCircle}>
                      {searchMode === "EXACT" && <View style={styles.radioDot} />}
                    </View>
                    <Text style={styles.radioLabel}>F2 Exact</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.radioOption}
                    onPress={() => handleSelectMode("CONTAINS")}
                    activeOpacity={0.7}
                  >
                    <View style={styles.radioCircle}>
                      {searchMode === "CONTAINS" && <View style={styles.radioDot} />}
                    </View>
                    <Text style={styles.radioLabel}>F3 Contains</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Error or Notice Alert */}
            {errorMsg ? (
              <View style={styles.errorNotice}>
                <Text style={styles.errorNoticeText}>{errorMsg}</Text>
              </View>
            ) : null}

            {/* Member List Grid matching screenshot */}
            <View style={styles.gridContainer}>
              {/* Grid Header */}
              <View style={styles.gridHeaderRow}>
                <View style={[styles.gridColHeader, styles.colIndicator]} />
                <View style={[styles.gridColHeader, styles.colCode]}>
                  <Text style={styles.gridHeaderText}>Member Code</Text>
                </View>
                <View style={[styles.gridColHeader, styles.colName]}>
                  <Text style={styles.gridHeaderText}>Name</Text>
                </View>
                <View style={[styles.gridColHeader, styles.colType]}>
                  <Text style={styles.gridHeaderText}>Member Type</Text>
                </View>
                <View style={[styles.gridColHeader, styles.colPhone]}>
                  <Text style={styles.gridHeaderText}>Phone No</Text>
                </View>
              </View>

              {/* Grid Body */}
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#7bb042" />
                  <Text style={styles.loadingText}>Loading members...</Text>
                </View>
              ) : members.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No matching members found.</Text>
                </View>
              ) : (
                <FlatList
                  data={members}
                  keyExtractor={(item) => item.MemberCode}
                  renderItem={({ item, index }) => {
                    const isSelected = selectedMember?.MemberCode === item.MemberCode;
                    return (
                      <TouchableOpacity
                        style={[
                          styles.gridDataRow,
                          isSelected && styles.gridDataRowSelected,
                          index % 2 === 1 && !isSelected && styles.gridDataRowAlt,
                        ]}
                        onPress={() => handleRowClick(item)}
                        // Double tap / double click triggers OK
                        onLongPress={() => handleRowDoubleClick(item)}
                      >
                        <View style={[styles.gridCell, styles.colIndicator]}>
                          {isSelected && (
                            <MaterialCommunityIcons name="play" size={12} color="#000000" />
                          )}
                        </View>
                        <View style={[styles.gridCell, styles.colCode]}>
                          <Text
                            style={[
                              styles.gridCellText,
                              isSelected && styles.gridCellTextSelected,
                            ]}
                            numberOfLines={1}
                          >
                            {item.MemberCode}
                          </Text>
                        </View>
                        <View style={[styles.gridCell, styles.colName]}>
                          <Text
                            style={[
                              styles.gridCellText,
                              isSelected && styles.gridCellTextSelected,
                            ]}
                            numberOfLines={1}
                          >
                            {item.MemberName}
                          </Text>
                        </View>
                        <View style={[styles.gridCell, styles.colType]}>
                          <Text
                            style={[
                              styles.gridCellText,
                              isSelected && styles.gridCellTextSelected,
                            ]}
                            numberOfLines={1}
                          >
                            {item.MemberType}
                          </Text>
                        </View>
                        <View style={[styles.gridCell, styles.colPhone]}>
                          <Text
                            style={[
                              styles.gridCellText,
                              isSelected && styles.gridCellTextSelected,
                            ]}
                            numberOfLines={1}
                          >
                            {item.PhoneNo || item.Mobile || ""}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
            </View>

            {/* Bottom Buttons Bar matching screenshot: Add, Edit (Left) | Ok (F4), Close (Esc) (Right) */}
            <View style={styles.bottomBar}>
              <View style={styles.bottomLeftBtns}>
                <TouchableOpacity
                  style={styles.greenGlossyBtn}
                  onPress={handleAdd}
                  activeOpacity={0.8}
                >
                  <Text style={styles.greenGlossyBtnText}>Add</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.greenGlossyBtn,
                    !selectedMember && styles.btnDisabled,
                  ]}
                  onPress={handleEdit}
                  disabled={!selectedMember}
                  activeOpacity={0.8}
                >
                  <Text style={styles.greenGlossyBtnText}>Edit</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.bottomRightBtns}>
                <TouchableOpacity
                  style={[
                    styles.greenGlossyBtn,
                    styles.primaryActionBtn,
                    !selectedMember && styles.btnDisabled,
                  ]}
                  onPress={handleOk}
                  disabled={!selectedMember}
                  activeOpacity={0.8}
                >
                  <Text style={styles.greenGlossyBtnText}>Ok (F4)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.greenGlossyBtn, styles.primaryActionBtn]}
                  onPress={onClose}
                  activeOpacity={0.8}
                >
                  <Text style={styles.greenGlossyBtnText}>Close (Esc)</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Embedded Sub-Modal: Add / Edit Member (frmMember.vb) */}
      <MemberModal
        visible={showMemberEditModal}
        initialMemberCode={memberCodeForEdit}
        onClose={() => setShowMemberEditModal(false)}
        onMemberSaved={(savedCode) => {
          setShowMemberEditModal(false);
          // Reload list and select newly saved member
          loadMembers(savedCode, "EXACT");
        }}
      />
    </Modal>
  );
}

// ------------------------------------------------------------------------------
// Styles exactly matching the reference VB.NET screenshot
// ------------------------------------------------------------------------------
const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  windowFrame: {
    width: "95%",
    maxWidth: 960,
    height: "88%",
    maxHeight: 640,
    backgroundColor: "#2b2b2b",
    borderWidth: 1,
    borderColor: "#4a4a4a",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
    display: "flex",
    flexDirection: "column",
  },
  titleBar: {
    height: 32,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#cccccc",
  },
  titleLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  titleIcon: {
    width: 16,
    height: 16,
    marginRight: 6,
    flexDirection: "row",
  },
  titleIconYellow: {
    width: 8,
    height: 16,
    backgroundColor: "#eab308",
  },
  titleIconBlue: {
    width: 8,
    height: 16,
    backgroundColor: "#2563eb",
  },
  titleText: {
    color: "#000000",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: Platform.OS === "android" ? "monospace" : "System",
  },
  closeWindowBtn: {
    padding: 4,
  },
  windowBody: {
    flex: 1,
    backgroundColor: "#2b2b2b",
    padding: 12,
    display: "flex",
    flexDirection: "column",
  },

  // Filters Group Box
  filtersGroupBox: {
    borderWidth: 1,
    borderColor: "#555555",
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
    marginBottom: 10,
    position: "relative",
    backgroundColor: "#2b2b2b",
  },
  filtersGroupLabel: {
    position: "absolute",
    top: -8,
    left: 12,
    backgroundColor: "#2b2b2b",
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "400",
    paddingHorizontal: 4,
  },
  filtersContentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  filterLeftCol: {
    flex: 1,
    paddingRight: 20,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  inputLabel: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "500",
    width: 120,
  },
  textInput: {
    flex: 1,
    maxWidth: 260,
    height: 24,
    backgroundColor: "#fff0f0", // Very faint pinkish-white matching the screenshot
    borderWidth: 1,
    borderColor: "#7f7f7f",
    color: "#000000",
    paddingHorizontal: 6,
    paddingVertical: 0,
    fontSize: 12,
  },
  refreshBtnRow: {
    marginTop: 10,
    marginLeft: 120,
  },
  refreshBtn: {
    backgroundColor: "#84bd3a",
    paddingVertical: 5,
    paddingHorizontal: 26,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#6a9c2d",
    alignSelf: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 1,
  },
  refreshBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },

  filterRightCol: {
    width: 150,
    paddingLeft: 10,
  },
  radioOption: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  radioCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#cccccc",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  radioDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#000000",
  },
  radioLabel: {
    color: "#ffffff",
    fontSize: 12,
  },

  // Error / notice
  errorNotice: {
    backgroundColor: "#dc2626",
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 8,
    borderRadius: 2,
  },
  errorNoticeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "600",
  },

  // Grid
  gridContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#7f7f7f",
    display: "flex",
    flexDirection: "column",
  },
  gridHeaderRow: {
    height: 26,
    backgroundColor: "#f1f5f9",
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
  },
  gridColHeader: {
    justifyContent: "center",
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: "#cbd5e1",
  },
  gridHeaderText: {
    color: "#1e293b",
    fontSize: 11,
    fontWeight: "700",
  },
  colIndicator: {
    width: 26,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 0,
  },
  colCode: {
    width: 160,
    backgroundColor: "#e0f2fe", // Light blue column header tint matching screenshot
  },
  colName: {
    flex: 2,
  },
  colType: {
    flex: 1.2,
  },
  colPhone: {
    flex: 1.2,
  },

  // Grid Data Rows
  gridDataRow: {
    flexDirection: "row",
    height: 26,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    alignItems: "center",
  },
  gridDataRowAlt: {
    backgroundColor: "#fafafa",
  },
  gridDataRowSelected: {
    backgroundColor: "#0078d7", // Classic Windows blue row selection
  },
  gridCell: {
    paddingHorizontal: 8,
    justifyContent: "center",
  },
  gridCellText: {
    color: "#000000",
    fontSize: 11,
  },
  gridCellTextSelected: {
    color: "#ffffff",
    fontWeight: "600",
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    color: "#64748b",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: "#64748b",
    fontSize: 12,
  },

  // Bottom Buttons Bar
  bottomBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 4,
  },
  bottomLeftBtns: {
    flexDirection: "row",
    gap: 8,
  },
  bottomRightBtns: {
    flexDirection: "row",
    gap: 8,
  },
  greenGlossyBtn: {
    backgroundColor: "#84bd3a",
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#659928",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 90,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 1,
  },
  primaryActionBtn: {
    minWidth: 110,
  },
  greenGlossyBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
