// ==============================================================================
// SearchModal.tsx
// Complete Implementation of VB.NET frmSearch & clsInventory Search Dialog
// ==============================================================================

import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export interface SearchResultItem {
  InventoryCode: string;
  Description: string;
  QtyOnHand: number;
  RetailPrice: number;
  SellingPrice: number;
  AverageCost: number;
  DepartmentCode: string;
  CategoryCode: string;
  BrandCode: string;
  VendorCode: string;
  Barcode: string;
  UOM?: string;
}

export interface StockLocationInfo {
  LocationCode: string;
  LocationName: string;
  QtyOnHand: number;
  OutletSellingPrice: number;
  OutletRetailPrice: number;
  HQSellingPrice: number;
  AverageCost: number;
}

interface SearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectItem: (item: SearchResultItem) => void;
  apiUrl: string;
  currentLocationCode?: string;
  theme?: any;
}

export default function SearchModal({
  visible,
  onClose,
  onSelectItem,
  apiUrl,
  currentLocationCode = "HQ",
  theme,
}: SearchModalProps) {
  // Search Fields (Filters)
  const [barcode, setBarcode] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [vendor, setVendor] = useState("");
  const [price, setPrice] = useState("");

  // Metadata dropdown options
  const [departments, setDepartments] = useState<Array<{ DeptCode: string; DeptName: string }>>([]);
  const [vendors, setVendors] = useState<Array<{ VendorCode: string; VendorName: string }>>([]);
  const [brands, setBrands] = useState<Array<{ BrandCode: string; BrandName: string }>>([]);
  const [locations, setLocations] = useState<Array<{ LocationCode: string; LocationName: string }>>([]);

  // Active Dropdown Selector Modal / View
  const [activePickerField, setActivePickerField] = useState<"dept" | "vendor" | "brand" | null>(null);

  // Tree View / Hierarchy Mode (sp_GetInventorySearch)
  const [isTreeMode, setIsTreeMode] = useState(false);
  const [treeStep, setTreeStep] = useState<"DEPT" | "CAT" | "BRAND" | "ITEMS">("DEPT");
  const [treeDept, setTreeDept] = useState("");
  const [treeCat, setTreeCat] = useState("");
  const [treeBrand, setTreeBrand] = useState("");
  const [treeList, setTreeList] = useState<any[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);

  // Search Results
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResult, setSelectedResult] = useState<SearchResultItem | null>(null);

  // Stock Lookup Drawer/Panel
  const [showStockPanel, setShowStockPanel] = useState(false);
  const [stockInfo, setStockInfo] = useState<{
    inventoryCode: string;
    hqLocationCode: string;
    locations: StockLocationInfo[];
  } | null>(null);
  const [loadingStock, setLoadingStock] = useState(false);

  // Focus ref
  const barcodeInputRef = useRef<any>(null);

  // Load filter metadata when modal becomes visible
  useEffect(() => {
    if (visible) {
      loadFilters();
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    } else {
      resetSearchState();
    }
  }, [visible]);

  const resetSearchState = () => {
    setBarcode("");
    setDescription("");
    setDepartment("");
    setCategory("");
    setBrand("");
    setVendor("");
    setPrice("");
    setResults([]);
    setSelectedResult(null);
    setShowStockPanel(false);
    setStockInfo(null);
    setIsTreeMode(false);
    setActivePickerField(null);
  };

  const loadFilters = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/search/filters`);
      const data = await res.json();
      if (data.success) {
        setDepartments(data.departments || []);
        setVendors(data.vendors || []);
        setBrands(data.brands || []);
        setLocations(data.locations || []);
      }
    } catch (e) {
      console.warn("Failed to load search filter options:", e);
    }
  };

  // Execute Multiple Search (fncGetMultipleSearchDetails)
  const handleExecuteSearch = async () => {
    // If no search criteria entered, return empty result
    const hasInput = Boolean(
      barcode.trim() ||
      description.trim() ||
      department.trim() ||
      category.trim() ||
      brand.trim() ||
      vendor.trim() ||
      price.trim()
    );

    if (!hasInput) {
      setResults([]);
      setSelectedResult(null);
      return;
    }

    setIsSearching(true);
    setSelectedResult(null);
    try {
      const res = await fetch(`${apiUrl}/api/search/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: barcode.trim(),
          description: description.trim(),
          department: department.trim(),
          category: category.trim(),
          brand: brand.trim(),
          vendor: vendor.trim(),
          price: price.trim(),
          locationCode: currentLocationCode,
          limit: 100,
        }),
      });

      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        setResults(data.items);
        if (data.items.length > 0) {
          setSelectedResult(data.items[0]);
        }
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error("Search failed:", err);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Stock Lookup for an item (fncGetOutletStock & fncGetOutletStockHQ)
  const handleFetchStock = async (invCode: string) => {
    setLoadingStock(true);
    setShowStockPanel(true);
    try {
      const res = await fetch(`${apiUrl}/api/search/stock?inventoryCode=${encodeURIComponent(invCode)}`);
      const data = await res.json();
      if (data.success) {
        setStockInfo(data);
      } else {
        setStockInfo(null);
      }
    } catch (e) {
      console.error("Failed to fetch stock:", e);
      setStockInfo(null);
    } finally {
      setLoadingStock(false);
    }
  };

  // Tree View Hierarchy Navigation (sp_GetInventorySearch)
  const loadTreeHierarchy = async (dept = "", cat = "", br = "") => {
    setTreeLoading(true);
    try {
      const q = new URLSearchParams({
        dept,
        category: cat,
        brand: br,
        locationCode: currentLocationCode,
      });
      const res = await fetch(`${apiUrl}/api/search/hierarchy?${q.toString()}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setTreeList(data.data);
        if (!dept && !cat && !br) setTreeStep("DEPT");
        else if (dept && !cat && !br) setTreeStep("CAT");
        else if (dept && cat && !br) setTreeStep("BRAND");
        else setTreeStep("ITEMS");
      }
    } catch (e) {
      console.error("Hierarchy load error:", e);
    } finally {
      setTreeLoading(false);
    }
  };

  const handleTreeSelect = (val: string) => {
    if (treeStep === "DEPT") {
      setTreeDept(val);
      loadTreeHierarchy(val, "", "");
    } else if (treeStep === "CAT") {
      setTreeCat(val);
      loadTreeHierarchy(treeDept, val, "");
    } else if (treeStep === "BRAND") {
      setTreeBrand(val);
      loadTreeHierarchy(treeDept, treeCat, val);
    } else {
      // Final level item selected
      const matched = treeList.find((it) => it.InventoryCode === val);
      if (matched) {
        const resultItem: SearchResultItem = {
          InventoryCode: matched.InventoryCode.trim(),
          Description: matched.Description.trim(),
          QtyOnHand: Number(matched.QtyOnHand || 0),
          RetailPrice: Number(matched.RetailPrice || matched.SellingPrice || 0),
          SellingPrice: Number(matched.SellingPrice || 0),
          AverageCost: Number(matched.AverageCost || 0),
          DepartmentCode: matched.DepartmentCode.trim(),
          CategoryCode: matched.CategoryCode.trim(),
          BrandCode: matched.BrandCode.trim(),
          VendorCode: matched.VendorCode.trim(),
          Barcode: (matched.BarCode || matched.InventoryCode).trim(),
          UOM: (matched.UOM || "PCS").trim(),
        };
        onSelectItem(resultItem);
        onClose();
      }
    }
  };

  // Confirm selection to POS Billing
  const handleConfirmSelection = () => {
    if (!selectedResult) return;
    onSelectItem(selectedResult);
    onClose();
  };

  const primaryCol = theme?.primary || "#881337";

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {/* TOP HEADER */}
          <View style={[styles.header, { backgroundColor: primaryCol }]}>
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons name="magnify" size={22} color="#ffffff" />
              <Text style={styles.headerTitle}>Inventory Search (frmSearch)</Text>
              <View style={styles.locBadge}>
                <Text style={styles.locBadgeText}>LOC: {currentLocationCode}</Text>
              </View>
            </View>

            <View style={styles.headerRight}>
              <TouchableOpacity
                style={[styles.modeToggleBtn, isTreeMode && styles.modeToggleBtnActive]}
                onPress={() => {
                  if (!isTreeMode) {
                    setIsTreeMode(true);
                    loadTreeHierarchy("", "", "");
                  } else {
                    setIsTreeMode(false);
                  }
                }}
              >
                <MaterialCommunityIcons
                  name="file-tree"
                  size={16}
                  color={isTreeMode ? "#b91c1c" : "#ffffff"}
                />
                <Text style={[styles.modeToggleText, isTreeMode && { color: "#b91c1c" }]}>
                  {isTreeMode ? "Filter Mode" : "Category Tree"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <MaterialCommunityIcons name="close" size={22} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* MAIN BODY */}
          <View style={styles.body}>
            {!isTreeMode ? (
              <>
                {/* SEARCH FILTERS PANEL (VB.NET frmSearch Inputs) */}
                <View style={styles.filtersCard}>
                  <View style={styles.filtersGrid}>
                    {/* Barcode Filter */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Barcode / Item Code</Text>
                      <TextInput
                        ref={barcodeInputRef}
                        style={styles.textInput}
                        placeholder="Scan or enter code..."
                        placeholderTextColor="#94a3b8"
                        value={barcode}
                        onChangeText={setBarcode}
                        onSubmitEditing={handleExecuteSearch}
                        returnKeyType="search"
                      />
                    </View>

                    {/* Description Filter */}
                    <View style={[styles.inputGroup, { flex: 1.5 }]}>
                      <Text style={styles.inputLabel}>Item Description</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="Enter item description..."
                        placeholderTextColor="#94a3b8"
                        value={description}
                        onChangeText={setDescription}
                        onSubmitEditing={handleExecuteSearch}
                        returnKeyType="search"
                      />
                    </View>

                    {/* Department Dropdown */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Department</Text>
                      <TouchableOpacity
                        style={styles.pickerInput}
                        onPress={() => setActivePickerField(activePickerField === "dept" ? null : "dept")}
                      >
                        <Text style={[styles.pickerValue, !department && styles.pickerPlaceholder]} numberOfLines={1}>
                          {department || "All Departments"}
                        </Text>
                        <MaterialCommunityIcons name="chevron-down" size={16} color="#64748b" />
                      </TouchableOpacity>
                    </View>

                    {/* Category Filter */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Category</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="All Categories"
                        placeholderTextColor="#94a3b8"
                        value={category}
                        onChangeText={setCategory}
                        onSubmitEditing={handleExecuteSearch}
                      />
                    </View>

                    {/* Brand Filter */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Brand</Text>
                      <TouchableOpacity
                        style={styles.pickerInput}
                        onPress={() => setActivePickerField(activePickerField === "brand" ? null : "brand")}
                      >
                        <Text style={[styles.pickerValue, !brand && styles.pickerPlaceholder]} numberOfLines={1}>
                          {brand || "All Brands"}
                        </Text>
                        <MaterialCommunityIcons name="chevron-down" size={16} color="#64748b" />
                      </TouchableOpacity>
                    </View>

                    {/* Vendor Filter */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Vendor</Text>
                      <TouchableOpacity
                        style={styles.pickerInput}
                        onPress={() => setActivePickerField(activePickerField === "vendor" ? null : "vendor")}
                      >
                        <Text style={[styles.pickerValue, !vendor && styles.pickerPlaceholder]} numberOfLines={1}>
                          {vendor || "All Vendors"}
                        </Text>
                        <MaterialCommunityIcons name="chevron-down" size={16} color="#64748b" />
                      </TouchableOpacity>
                    </View>

                    {/* Price Filter */}
                    <View style={[styles.inputGroup, { maxWidth: 100 }]}>
                      <Text style={styles.inputLabel}>Price ($)</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="0.00"
                        placeholderTextColor="#94a3b8"
                        keyboardType="numeric"
                        value={price}
                        onChangeText={setPrice}
                        onSubmitEditing={handleExecuteSearch}
                      />
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.actionBtnGroup}>
                      <TouchableOpacity
                        style={[styles.searchBtn, { backgroundColor: primaryCol }]}
                        onPress={handleExecuteSearch}
                        activeOpacity={0.8}
                      >
                        {isSearching ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <>
                            <MaterialCommunityIcons name="magnify" size={16} color="#ffffff" />
                            <Text style={styles.searchBtnText}>Search</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.clearFilterBtn}
                        onPress={() => {
                          setBarcode("");
                          setDescription("");
                          setDepartment("");
                          setCategory("");
                          setBrand("");
                          setVendor("");
                          setPrice("");
                          setResults([]);
                          setSelectedResult(null);
                        }}
                      >
                        <MaterialCommunityIcons name="refresh" size={16} color="#475569" />
                        <Text style={styles.clearFilterText}>Reset</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* INLINE PICKER DROPDOWN IF OPEN */}
                  {activePickerField && (
                    <View style={styles.pickerDropdownContainer}>
                      <View style={styles.pickerDropdownHeader}>
                        <Text style={styles.pickerDropdownTitle}>
                          Select {activePickerField === "dept" ? "Department" : activePickerField === "brand" ? "Brand" : "Vendor"}
                        </Text>
                        <TouchableOpacity onPress={() => setActivePickerField(null)}>
                          <MaterialCommunityIcons name="close" size={18} color="#64748b" />
                        </TouchableOpacity>
                      </View>
                      <ScrollView style={styles.pickerDropdownList} keyboardShouldPersistTaps="handled">
                        <TouchableOpacity
                          style={styles.pickerDropdownItem}
                          onPress={() => {
                            if (activePickerField === "dept") setDepartment("");
                            if (activePickerField === "brand") setBrand("");
                            if (activePickerField === "vendor") setVendor("");
                            setActivePickerField(null);
                          }}
                        >
                          <Text style={[styles.pickerDropdownItemText, { fontWeight: "800", color: "#b91c1c" }]}>
                            -- Clear Selection (All) --
                          </Text>
                        </TouchableOpacity>
                        {activePickerField === "dept" &&
                          departments.map((d) => (
                            <TouchableOpacity
                              key={d.DeptCode}
                              style={styles.pickerDropdownItem}
                              onPress={() => {
                                setDepartment(d.DeptCode);
                                setActivePickerField(null);
                              }}
                            >
                              <Text style={styles.pickerDropdownItemText}>
                                {d.DeptCode} - {d.DeptName}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        {activePickerField === "brand" &&
                          brands.map((b) => (
                            <TouchableOpacity
                              key={b.BrandCode}
                              style={styles.pickerDropdownItem}
                              onPress={() => {
                                setBrand(b.BrandCode);
                                setActivePickerField(null);
                              }}
                            >
                              <Text style={styles.pickerDropdownItemText}>
                                {b.BrandName || b.BrandCode}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        {activePickerField === "vendor" &&
                          vendors.map((v) => (
                            <TouchableOpacity
                              key={v.VendorCode}
                              style={styles.pickerDropdownItem}
                              onPress={() => {
                                setVendor(v.VendorCode);
                                setActivePickerField(null);
                              }}
                            >
                              <Text style={styles.pickerDropdownItemText}>
                                {v.VendorName || v.VendorCode}
                              </Text>
                            </TouchableOpacity>
                          ))}
                      </ScrollView>
                    </View>
                  )}
                </View>

                {/* RESULTS GRID & DETAILS */}
                <View style={styles.gridSection}>
                  {/* GRID HEADER */}
                  <View style={styles.tableHeader}>
                    <Text style={[styles.thCell, { width: 40 }]}>S#</Text>
                    <Text style={[styles.thCell, { width: 95 }]}>Item Code</Text>
                    <Text style={[styles.thCell, { flex: 2 }]}>Description</Text>
                    <Text style={[styles.thCell, { width: 70, textAlign: "right" }]}>QOH</Text>
                    <Text style={[styles.thCell, { width: 80, textAlign: "right" }]}>Price ($)</Text>
                    <Text style={[styles.thCell, { width: 80, textAlign: "right" }]}>Cost ($)</Text>
                    <Text style={[styles.thCell, { width: 100 }]}>Department</Text>
                    <Text style={[styles.thCell, { width: 95 }]}>Brand</Text>
                    <Text style={[styles.thCell, { width: 110 }]}>Barcode</Text>
                  </View>

                  {/* GRID ROWS */}
                  {isSearching ? (
                    <View style={styles.centerBox}>
                      <ActivityIndicator size="large" color={primaryCol} />
                      <Text style={styles.loadingText}>Searching Inventory...</Text>
                    </View>
                  ) : results.length === 0 ? (
                    <View style={styles.centerBox}>
                      <MaterialCommunityIcons name="database-search" size={48} color="#94a3b8" />
                      <Text style={styles.emptyTitle}>No Search Results</Text>
                      <Text style={styles.emptySub}>
                        Enter a Barcode, Description, Department, Brand, or Price above and click Search.
                      </Text>
                    </View>
                  ) : (
                    <FlatList
                      data={results}
                      keyExtractor={(item, index) => `${item.InventoryCode}_${index}`}
                      renderItem={({ item, index }) => {
                        const isSelected = selectedResult?.InventoryCode === item.InventoryCode;
                        return (
                          <TouchableOpacity
                            style={[styles.tableRow, isSelected && styles.selectedRow, index % 2 === 1 && !isSelected && styles.altRow]}
                            onPress={() => setSelectedResult(item)}
                            onLongPress={() => handleFetchStock(item.InventoryCode)}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.tdCell, { width: 40 }]}>{index + 1}</Text>
                            <Text style={[styles.tdCell, { width: 95, fontWeight: "700" }]} numberOfLines={1}>
                              {item.InventoryCode}
                            </Text>
                            <Text style={[styles.tdCell, { flex: 2, fontWeight: "600" }]} numberOfLines={1}>
                              {item.Description}
                            </Text>
                            <Text
                              style={[
                                styles.tdCell,
                                {
                                  width: 70,
                                  textAlign: "right",
                                  fontWeight: "800",
                                  color: item.QtyOnHand > 0 ? "#15803d" : item.QtyOnHand < 0 ? "#dc2626" : "#64748b",
                                },
                              ]}
                            >
                              {item.QtyOnHand}
                            </Text>
                            <Text style={[styles.tdCell, { width: 80, textAlign: "right", fontWeight: "700" }]}>
                              {Number(item.RetailPrice || item.SellingPrice).toFixed(2)}
                            </Text>
                            <Text style={[styles.tdCell, { width: 80, textAlign: "right", color: "#64748b" }]}>
                              {Number(item.AverageCost).toFixed(2)}
                            </Text>
                            <Text style={[styles.tdCell, { width: 100 }]} numberOfLines={1}>
                              {item.DepartmentCode}
                            </Text>
                            <Text style={[styles.tdCell, { width: 95 }]} numberOfLines={1}>
                              {item.BrandCode}
                            </Text>
                            <Text style={[styles.tdCell, { width: 110, fontSize: 11 }]} numberOfLines={1}>
                              {item.Barcode}
                            </Text>
                          </TouchableOpacity>
                        );
                      }}
                    />
                  )}
                </View>
              </>
            ) : (
              /* CATEGORY HIERARCHY TREE VIEW (sp_GetInventorySearch) */
              <View style={styles.treeContainer}>
                <View style={styles.treeBreadcrumbs}>
                  <TouchableOpacity onPress={() => loadTreeHierarchy("", "", "")}>
                    <Text style={[styles.breadcrumbText, treeStep === "DEPT" && styles.breadcrumbActive]}>Departments</Text>
                  </TouchableOpacity>
                  {treeDept ? (
                    <>
                      <MaterialCommunityIcons name="chevron-right" size={16} color="#94a3b8" />
                      <TouchableOpacity onPress={() => loadTreeHierarchy(treeDept, "", "")}>
                        <Text style={[styles.breadcrumbText, treeStep === "CAT" && styles.breadcrumbActive]}>{treeDept}</Text>
                      </TouchableOpacity>
                    </>
                  ) : null}
                  {treeCat ? (
                    <>
                      <MaterialCommunityIcons name="chevron-right" size={16} color="#94a3b8" />
                      <TouchableOpacity onPress={() => loadTreeHierarchy(treeDept, treeCat, "")}>
                        <Text style={[styles.breadcrumbText, treeStep === "BRAND" && styles.breadcrumbActive]}>{treeCat}</Text>
                      </TouchableOpacity>
                    </>
                  ) : null}
                  {treeBrand ? (
                    <>
                      <MaterialCommunityIcons name="chevron-right" size={16} color="#94a3b8" />
                      <Text style={[styles.breadcrumbText, treeStep === "ITEMS" && styles.breadcrumbActive]}>{treeBrand}</Text>
                    </>
                  ) : null}
                </View>

                {treeLoading ? (
                  <View style={styles.centerBox}>
                    <ActivityIndicator size="large" color={primaryCol} />
                    <Text style={styles.loadingText}>Loading hierarchy...</Text>
                  </View>
                ) : (
                  <ScrollView style={{ flex: 1 }}>
                    <View style={styles.treeGrid}>
                      {treeList.map((item, idx) => {
                        const val = item.DeptCode || item.CategoryCode || item.BrandCode || item.InventoryCode;
                        const label = item.DeptCode ? item.DeptCode.trim() :
                                      item.CategoryCode ? item.CategoryCode.trim() :
                                      item.BrandCode ? (item.BrandCode.trim() || "[NO BRAND]") :
                                      item.Description ? item.Description.trim() : val;
                        return (
                          <TouchableOpacity
                            key={`${val}_${idx}`}
                            style={styles.treeTile}
                            onPress={() => handleTreeSelect(val)}
                            activeOpacity={0.8}
                          >
                            <MaterialCommunityIcons
                              name={treeStep === "ITEMS" ? "barcode-scan" : "folder-open"}
                              size={24}
                              color={primaryCol}
                            />
                            <Text style={styles.treeTileText} numberOfLines={2}>
                              {label}
                            </Text>
                            {item.SellingPrice !== undefined && (
                              <Text style={styles.treeTilePrice}>${Number(item.SellingPrice).toFixed(2)}</Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                )}
              </View>
            )}
          </View>

          {/* STOCK DRAWER / POPUP (fncGetOutletStock & fncGetOutletStockHQ) */}
          {showStockPanel && (
            <View style={styles.stockPanelOverlay}>
              <View style={styles.stockPanel}>
                <View style={[styles.stockPanelHeader, { backgroundColor: primaryCol }]}>
                  <Text style={styles.stockPanelTitle}>Outlet Stock Lookup (fncGetOutletStock)</Text>
                  <TouchableOpacity onPress={() => setShowStockPanel(false)}>
                    <MaterialCommunityIcons name="close" size={20} color="#ffffff" />
                  </TouchableOpacity>
                </View>

                {loadingStock ? (
                  <View style={[styles.centerBox, { height: 160 }]}>
                    <ActivityIndicator size="small" color={primaryCol} />
                    <Text style={styles.loadingText}>Retrieving outlet inventory stock...</Text>
                  </View>
                ) : stockInfo ? (
                  <View style={styles.stockPanelContent}>
                    <Text style={styles.stockItemHeading}>
                      SKU: <Text style={{ fontWeight: "800", color: "#1e293b" }}>{stockInfo.inventoryCode}</Text> | HQ:{" "}
                      <Text style={{ fontWeight: "800", color: "#b91c1c" }}>{stockInfo.hqLocationCode}</Text>
                    </Text>

                    <ScrollView style={{ maxHeight: 220 }}>
                      <View style={styles.stockTable}>
                        <View style={styles.stockTableHeader}>
                          <Text style={[styles.stockTh, { flex: 1 }]}>Location</Text>
                          <Text style={[styles.stockTh, { width: 80, textAlign: "right" }]}>QOH</Text>
                          <Text style={[styles.stockTh, { width: 90, textAlign: "right" }]}>Sell Price</Text>
                          <Text style={[styles.stockTh, { width: 90, textAlign: "right" }]}>Retail Price</Text>
                        </View>
                        {stockInfo.locations.map((loc, i) => (
                          <View key={loc.LocationCode} style={[styles.stockTableRow, i % 2 === 1 && { backgroundColor: "#f8fafc" }]}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 12, fontWeight: "700", color: "#1e293b" }}>{loc.LocationName}</Text>
                              <Text style={{ fontSize: 10, color: "#64748b" }}>Code: {loc.LocationCode}</Text>
                            </View>
                            <Text
                              style={[
                                styles.stockTd,
                                {
                                  width: 80,
                                  fontWeight: "800",
                                  color: loc.QtyOnHand > 0 ? "#15803d" : loc.QtyOnHand < 0 ? "#dc2626" : "#64748b",
                                },
                              ]}
                            >
                              {loc.QtyOnHand}
                            </Text>
                            <Text style={[styles.stockTd, { width: 90 }]}>${Number(loc.OutletSellingPrice).toFixed(2)}</Text>
                            <Text style={[styles.stockTd, { width: 90 }]}>${Number(loc.OutletRetailPrice).toFixed(2)}</Text>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                ) : (
                  <Text style={{ padding: 20, textAlign: "center", color: "#64748b" }}>No stock details found.</Text>
                )}
              </View>
            </View>
          )}

          {/* BOTTOM SELECTION & ACTIONS BAR */}
          <View style={styles.footer}>
            <View style={styles.selectedItemPreview}>
              {selectedResult ? (
                <View>
                  <Text style={styles.previewTitle} numberOfLines={1}>
                    {selectedResult.Description}
                  </Text>
                  <Text style={styles.previewMeta}>
                    Code: <Text style={{ fontWeight: "800", color: "#0f172a" }}>{selectedResult.InventoryCode}</Text> | QOH:{" "}
                    <Text style={{ fontWeight: "800", color: selectedResult.QtyOnHand > 0 ? "#15803d" : "#dc2626" }}>
                      {selectedResult.QtyOnHand}
                    </Text>{" "}
                    | Price: <Text style={{ fontWeight: "800", color: "#047857" }}>${Number(selectedResult.RetailPrice || selectedResult.SellingPrice).toFixed(2)}</Text>
                  </Text>
                </View>
              ) : (
                <Text style={styles.noItemSelectedText}>Click an item in the search results grid to select</Text>
              )}
            </View>

            <View style={styles.footerBtnGroup}>
              {selectedResult && (
                <TouchableOpacity
                  style={styles.stockLookupBtn}
                  onPress={() => handleFetchStock(selectedResult.InventoryCode)}
                >
                  <MaterialCommunityIcons name="warehouse" size={16} color="#0284c7" />
                  <Text style={styles.stockLookupText}>Check All Outlets Stock</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmBtn,
                  { backgroundColor: selectedResult ? primaryCol : "#cbd5e1" },
                ]}
                disabled={!selectedResult}
                onPress={handleConfirmSelection}
              >
                <MaterialCommunityIcons name="check-bold" size={16} color="#ffffff" />
                <Text style={styles.confirmBtnText}>Add To Cart</Text>
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
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 14,
  },
  container: {
    width: "98%",
    maxWidth: 1040,
    height: "92%",
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
  locBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  locBadgeText: {
    fontSize: 11,
    fontWeight: "800",
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
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  modeToggleBtnActive: {
    backgroundColor: "#ffffff",
  },
  modeToggleText: {
    fontSize: 12,
    fontWeight: "700",
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
  filtersCard: {
    backgroundColor: "#ffffff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 10,
    position: "relative",
    zIndex: 10,
  },
  filtersGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "flex-end",
  },
  inputGroup: {
    flex: 1,
    minWidth: 130,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 4,
  },
  textInput: {
    height: 36,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 4,
    paddingHorizontal: 10,
    fontSize: 12,
    color: "#0f172a",
  },
  pickerInput: {
    height: 36,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 4,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerValue: {
    fontSize: 12,
    color: "#0f172a",
    fontWeight: "600",
    flex: 1,
  },
  pickerPlaceholder: {
    color: "#94a3b8",
    fontWeight: "400",
  },
  actionBtnGroup: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  searchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 4,
    justifyContent: "center",
  },
  searchBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  clearFilterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 36,
    paddingHorizontal: 12,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 4,
    justifyContent: "center",
  },
  clearFilterText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  pickerDropdownContainer: {
    marginTop: 8,
    maxHeight: 180,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    backgroundColor: "#ffffff",
    padding: 6,
  },
  pickerDropdownHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    marginBottom: 4,
  },
  pickerDropdownTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#334155",
  },
  pickerDropdownList: {
    flex: 1,
  },
  pickerDropdownItem: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f8fafc",
  },
  pickerDropdownItemText: {
    fontSize: 12,
    color: "#1e293b",
  },
  gridSection: {
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
    paddingHorizontal: 8,
  },
  thCell: {
    fontSize: 11,
    fontWeight: "800",
    color: "#334155",
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  selectedRow: {
    backgroundColor: "#fef3c7", // Golden yellow highlight
  },
  altRow: {
    backgroundColor: "#fafafa",
  },
  tdCell: {
    fontSize: 11.5,
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
  treeContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
  },
  treeBreadcrumbs: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    marginBottom: 12,
  },
  breadcrumbText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0284c7",
  },
  breadcrumbActive: {
    color: "#1e293b",
    fontWeight: "800",
  },
  treeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  treeTile: {
    width: 140,
    height: 100,
    backgroundColor: "#f8fafc",
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    justifyContent: "center",
    alignItems: "center",
    padding: 8,
  },
  treeTileText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1e293b",
    textAlign: "center",
    marginTop: 6,
  },
  treeTilePrice: {
    fontSize: 11,
    fontWeight: "800",
    color: "#15803d",
    marginTop: 2,
  },
  stockPanelOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 50,
  },
  stockPanel: {
    width: "90%",
    maxWidth: 580,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    overflow: "hidden",
    elevation: 10,
  },
  stockPanelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  stockPanelTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff",
  },
  stockPanelContent: {
    padding: 12,
  },
  stockItemHeading: {
    fontSize: 12,
    color: "#64748b",
    marginBottom: 8,
  },
  stockTable: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
  },
  stockTableHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
  },
  stockTh: {
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
  },
  stockTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  stockTd: {
    fontSize: 12,
    color: "#0f172a",
    fontWeight: "600",
    textAlign: "right",
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
  selectedItemPreview: {
    flex: 1,
    marginRight: 12,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1e293b",
  },
  previewMeta: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  noItemSelectedText: {
    fontSize: 12,
    fontStyle: "italic",
    color: "#94a3b8",
  },
  footerBtnGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stockLookupBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    borderRadius: 4,
  },
  stockLookupText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#0284c7",
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#f1f5f9",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 4,
  },
  confirmBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#ffffff",
  },
});

