// ==============================================================================
// Project: Supermarket Retail POS
// Module: Touch Screen Billing Screen (POS)
// File: src/screens/pos_billing.tsx
//
// Change History:
//   - 28-10-2026 | JAVITH | Linked live MS SQL tables (TBLinventorytsgroup & tblInventoryTSList),
//                          eliminated category rail gap, connected real inventory prices and codes.
// ==============================================================================

import React, { useState, useEffect, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  Modal,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const API_URL = "http://localhost:5000";

// Author: JAVITH, BAVANI 28-10-2026: Enterprise POS Typography Stack
const FONT_FAMILY = Platform.select({
  web: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  default: undefined,
});

const FONT_MONO = Platform.select({
  web: '"JetBrains Mono", "SF Mono", Menlo, Consolas, Monaco, "Liberation Mono", "Courier New", monospace',
  default: undefined,
});

// Live Touch Screen Group Interface matching TBLinventorytsgroup
export interface TouchGroup {
  GroupCode: string;
  SortCode: number;
}

// Live Touch Screen Item Interface matching tblInventoryTSList joined with tblInventory
export interface TouchItem {
  GroupCode: string;
  InventoryCode: string;
  SortOrder: number;
  Description: string;
  SellingPrice: number;
  RetailPrice: number;
  UOM: string;
}

// Live PayMode Interface matching [dbo].[tblInvPaymode]
// Author: JAVITH, BAVANI 28-10-2026: Typed interface for tblInvPaymode
export interface PayModeItem {
  Position: number;
  PayMode: string;
  Description: string;
  Active: boolean;
  Commission: number;
  isVoucher: boolean;
  isMember: boolean;
}

// Bill Item in cart table
interface CartItem {
  id: string;
  code: string;
  description: string;
  qty: number;
  price: number;
  disc: number;
  amount: number;
}

interface PosBillingProps {
  onLogout?: () => void;
  cashierName?: string;
  terminalCode?: string;
}

// [JAVITH - 28-10-2026]: Dynamic color palette for database categories
const CATEGORY_PALETTE = [
  "#237a3b",
  "#b45309",
  "#0284c7",
  "#f59e0b",
  "#4d695b",
  "#ec4899",
  "#8b5cf6",
  "#d97706",
  "#06b6d4",
  "#dc2626",
  "#ca8a04",
  "#0f766e",
  "#7c3aed",
  "#57534e",
  "#0d9488",
  "#334155",
  "#475569",
  "#2563eb",
  "#78350f",
  "#059669",
];

// Author: JAVITH, BAVANI 28-10-2026: Intelligent vector icon mapping for category groups
function getGroupIconName(
  groupCode: string,
): keyof typeof MaterialCommunityIcons.glyphMap {
  const code = (groupCode || "").toUpperCase().trim();
  if (
    code.includes("VEG") ||
    code.includes("FRUIT") ||
    code.includes("GREENS") ||
    code.includes("PRODUCE")
  ) {
    return "food-apple-outline";
  }
  if (
    code.includes("BEER") ||
    code.includes("ALCOHOL") ||
    code.includes("WINE") ||
    code.includes("LIQUOR")
  ) {
    return "glass-mug-variant";
  }
  if (
    code.includes("GROCERY") ||
    code.includes("RICE") ||
    code.includes("OIL") ||
    code.includes("PROVISION")
  ) {
    return "basket-outline";
  }
  if (
    code.includes("DRINK") ||
    code.includes("BEV") ||
    code.includes("WATER") ||
    code.includes("JUICE") ||
    code.includes("TEA") ||
    code.includes("COFFEE")
  ) {
    return "cup-water";
  }
  if (
    code.includes("PHONE") ||
    code.includes("ACC") ||
    code.includes("ELEC") ||
    code.includes("CABLE") ||
    code.includes("MOBILE")
  ) {
    return "cellphone";
  }
  if (
    code.includes("SNACK") ||
    code.includes("BISCUIT") ||
    code.includes("CHIP") ||
    code.includes("COOKIE") ||
    code.includes("CANDY")
  ) {
    return "cookie-outline";
  }
  if (
    code.includes("BEEDI") ||
    code.includes("TOBACCO") ||
    code.includes("CIG") ||
    code.includes("SMOKE")
  ) {
    return "fire";
  }
  if (
    code.includes("BAKERY") ||
    code.includes("BREAD") ||
    code.includes("CAKE") ||
    code.includes("PASTRY")
  ) {
    return "bread-slice-outline";
  }
  if (
    code.includes("MEAT") ||
    code.includes("CHICKEN") ||
    code.includes("BEEF") ||
    code.includes("PORK")
  ) {
    return "food-steak";
  }
  if (code.includes("FISH") || code.includes("SEAFOOD")) {
    return "fish";
  }
  if (code.includes("FROZEN") || code.includes("ICE")) {
    return "snowflake";
  }
  if (
    code.includes("CLEAN") ||
    code.includes("HOUSE") ||
    code.includes("DETERGENT")
  ) {
    return "spray-bottle";
  }
  if (code.includes("STAT") || code.includes("BOOK") || code.includes("PEN")) {
    return "notebook-outline";
  }
  if (
    code.includes("MED") ||
    code.includes("PHARM") ||
    code.includes("HEALTH")
  ) {
    return "pill";
  }
  if (code.includes("MISC") || code.includes("SUNDRY")) {
    return "shape-outline";
  }
  return "tag-outline";
}

function getGroupVisuals(
  groupCode: string,
  index: number,
): { bg: string; iconName: keyof typeof MaterialCommunityIcons.glyphMap } {
  const bg = CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
  return {
    bg,
    iconName: getGroupIconName(groupCode),
  };
}

// Author: JAVITH, BAVANI 28-10-2026: Vector icon mapping for tblInvPaymode payment modes
function getPayModeVisual(
  payMode: string,
  index: number,
): { bg: string; iconName: keyof typeof MaterialCommunityIcons.glyphMap } {
  const upper = (payMode || "").toUpperCase().trim();
  if (upper.includes("CASH"))
    return { bg: "#f4b400", iconName: "cash-multiple" };
  if (
    upper.includes("NETS") &&
    !upper.includes("FLASH") &&
    !upper.includes("QR")
  )
    return { bg: "#1976d2", iconName: "credit-card-outline" };
  if (upper.includes("PAYNOW"))
    return { bg: "#00bcd4", iconName: "qrcode-scan" };
  if (upper.includes("CDC"))
    return { bg: "#0097a7", iconName: "ticket-percent-outline" };
  if (upper.includes("FLASH"))
    return { bg: "#00838f", iconName: "flash-outline" };
  if (upper.includes("AMEX"))
    return { bg: "#0070ba", iconName: "credit-card-check-outline" };
  if (upper.includes("EZLINK"))
    return { bg: "#7b1fa2", iconName: "smart-card-outline" };
  if (upper.includes("CREDIT"))
    return { bg: "#c2185b", iconName: "credit-card-fast-outline" };
  if (upper.includes("VOUCHER"))
    return { bg: "#e65100", iconName: "ticket-confirmation-outline" };

  const fallback: Array<{
    bg: string;
    iconName: keyof typeof MaterialCommunityIcons.glyphMap;
  }> = [
    { bg: "#f4b400", iconName: "cash-multiple" },
    { bg: "#1976d2", iconName: "credit-card-outline" },
    { bg: "#00bcd4", iconName: "qrcode-scan" },
    { bg: "#0097a7", iconName: "ticket-percent-outline" },
    { bg: "#8e24aa", iconName: "credit-card-outline" },
    { bg: "#e65100", iconName: "ticket-outline" },
    { bg: "#2e7d32", iconName: "wallet-outline" },
  ];
  return fallback[index % fallback.length];
}

export default function PosBillingScreen({
  onLogout,
  cashierName,
  terminalCode,
}: PosBillingProps) {
  // ---------------------------------------------------------------------------
  // LIVE DATABASE STATE (TBLinventorytsgroup & tblInventoryTSList & tblInvPaymode)
  // ---------------------------------------------------------------------------
  const [groups, setGroups] = useState<TouchGroup[]>([]);
  const [items, setItems] = useState<TouchItem[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [loadingGroups, setLoadingGroups] = useState<boolean>(true);
  const [loadingItems, setLoadingItems] = useState<boolean>(false);

  // Paymode state from tblInvPaymode
  // Author: JAVITH 28-10-2026: Live state populated directly from tblInvPaymode
  const [payModes, setPayModes] = useState<PayModeItem[]>([]);
  const [selectedPayMode, setSelectedPayMode] = useState<string>("CASH");
  const [loadingPayModes, setLoadingPayModes] = useState<boolean>(true);
  const [showMorePayModes, setShowMorePayModes] = useState<boolean>(false);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCartIndex, setSelectedCartIndex] = useState<number>(-1);

  // Active top banner item
  const [activeItem, setActiveItem] = useState<{
    name: string;
    qty: number;
    price: number;
    stock: number;
  }>({
    name: "READY TO SCAN / SELECT ITEM",
    qty: 0,
    price: 0.0,
    stock: 0,
  });

  // Search & Payment state
  const [skuCode, setSkuCode] = useState("");
  const [skuDesc, setSkuDesc] = useState("");
  const [tenderAmount, setTenderAmount] = useState("0.00");
  const [numpadValue, setNumpadValue] = useState("");

  // ---------------------------------------------------------------------------
  // [JAVITH - 28-10-2026]: Load Initial Live Data from Database
  // ---------------------------------------------------------------------------
  useEffect(() => {
    fetchTouchGroups();
    fetchPayModes();
  }, []);

  // ---------------------------------------------------------------------------
  // [JAVITH - 28-10-2026]: Load PayModes from tblInvPaymode
  // ---------------------------------------------------------------------------
  const fetchPayModes = async () => {
    setLoadingPayModes(true);
    try {
      const res = await fetch(`${API_URL}/api/paymode`);
      const data = await res.json();
      if (res.ok && data.success && data.paymodes && data.paymodes.length > 0) {
        setPayModes(data.paymodes);
        setSelectedPayMode(data.paymodes[0].PayMode);
      } else {
        setPayModes([]);
      }
    } catch (e) {
      console.warn("⚠️ Could not fetch live paymodes from database.");
      setPayModes([]);
    } finally {
      setLoadingPayModes(false);
    }
  };

  const fetchTouchGroups = async () => {
    setLoadingGroups(true);
    try {
      const res = await fetch(`${API_URL}/api/inventory/touch-groups`);
      const data = await res.json();
      if (res.ok && data.success && data.groups && data.groups.length > 0) {
        setGroups(data.groups);
        // Default to first group returned from TBLinventorytsgroup
        const firstGroup = data.groups[0].GroupCode;
        setSelectedGroup(firstGroup);
        fetchTouchItems(firstGroup);
      } else {
        setGroups([]);
      }
    } catch (e) {
      console.warn("⚠️ Could not fetch live groups from database.");
      setGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  };

  // ---------------------------------------------------------------------------
  // [JAVITH - 28-10-2026]: Load Touch Screen Items from tblInventoryTSList & tblInventory
  // ---------------------------------------------------------------------------
  const fetchTouchItems = async (groupCode?: string) => {
    setLoadingItems(true);
    try {
      const url = groupCode
        ? `${API_URL}/api/inventory/touch-items?groupCode=${encodeURIComponent(groupCode)}`
        : `${API_URL}/api/inventory/touch-items`;

      const res = await fetch(url);
      const data = await res.json();

      if (res.ok && data.success && data.items) {
        setItems(data.items);
      }
    } catch (e) {
      console.warn("⚠️ Could not fetch items from backend.");
    } finally {
      setLoadingItems(false);
    }
  };

  // Switch category handler
  const handleSelectGroup = (groupCode: string) => {
    setSelectedGroup(groupCode);
    fetchTouchItems(groupCode);
  };

  // ---------------------------------------------------------------------------
  // Filtered Products (by selected category & search input)
  // ---------------------------------------------------------------------------
  const filteredProducts = useMemo(() => {
    let result = items;
    if (selectedGroup) {
      result = result.filter(
        (it) => it.GroupCode.toUpperCase() === selectedGroup.toUpperCase(),
      );
    }
    if (skuDesc.trim()) {
      const q = skuDesc.toLowerCase().trim();
      result = result.filter((it) => it.Description.toLowerCase().includes(q));
    }
    if (skuCode.trim()) {
      const q = skuCode.toLowerCase().trim();
      result = result.filter((it) =>
        it.InventoryCode.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, selectedGroup, skuDesc, skuCode]);

  // ---------------------------------------------------------------------------
  // CART OPERATIONS
  // ---------------------------------------------------------------------------
  const handleAddItem = (item: TouchItem) => {
    setActiveItem({
      name: item.Description,
      qty: 1,
      price: item.SellingPrice,
      stock: 25,
    });

    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (c) => c.code === item.InventoryCode,
      );
      if (existingIndex > -1) {
        return prev.map((c, i) =>
          i === existingIndex
            ? {
                ...c,
                qty: c.qty + 1,
                amount: parseFloat(((c.qty + 1) * c.price - c.disc).toFixed(2)),
              }
            : c,
        );
      } else {
        const newItem: CartItem = {
          id: Date.now().toString() + Math.random().toString(),
          code: item.InventoryCode,
          description: item.Description,
          qty: 1,
          price: item.SellingPrice,
          disc: 0.0,
          amount: item.SellingPrice,
        };
        return [...prev, newItem];
      }
    });
  };

  // Adjust active item qty
  const handleQtyChange = (delta: number) => {
    if (cart.length === 0) return;
    const targetIdx =
      selectedCartIndex >= 0 ? selectedCartIndex : cart.length - 1;
    setCart((prev) => {
      return prev
        .map((c, i) => {
          if (i === targetIdx) {
            const nextQty = c.qty + delta;
            if (nextQty <= 0) return null;
            return {
              ...c,
              qty: nextQty,
              amount: parseFloat((nextQty * c.price - c.disc).toFixed(2)),
            };
          }
          return c;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  // Delete cart item
  const handleDeleteItem = () => {
    if (cart.length === 0) return;
    const targetIdx =
      selectedCartIndex >= 0 ? selectedCartIndex : cart.length - 1;
    setCart((prev) => prev.filter((_, i) => i !== targetIdx));
    setSelectedCartIndex(-1);
  };

  // Clear entire cart - Author: JAVITH 28-10-2026: Clears cart & resets tender/balance state
  const handleClearCart = () => {
    setCart([]);
    setSelectedCartIndex(-1);
    setNumpadValue("");
    setTenderAmount("");
    setActiveItem({
      name: "READY TO SCAN / SELECT ITEM",
      qty: 0,
      price: 0.0,
      stock: 0,
    });
  };

  // Numpad key press
  const handleNumpad = (val: string) => {
    if (val === "ENTER") {
      if (numpadValue) {
        setTenderAmount(numpadValue);
        setNumpadValue("");
      }
      return;
    }
    if (val === "C") {
      setNumpadValue("");
      return;
    }
    setNumpadValue((prev) => prev + val);
  };

  // Paymode selection from tblInvPaymode
  // Author: JAVITH 28-10-2026: Selects active payment mode and automatically populates tender
  const handleSelectPayMode = (mode: string) => {
    setSelectedPayMode(mode);
    if (!numpadValue && !tenderAmount && netTotal > 0) {
      setTenderAmount(netTotal.toFixed(2));
    }
  };

  // Render PayMode Button dynamically from tblInvPaymode
  // Author: JAVITH 28-10-2026: Renders active paymodes from tblInvPaymode with visual selection
  const renderPayModeButton = (slotIndex: number, fallbackMode: string) => {
    const payItem = payModes[slotIndex] || {
      PayMode: fallbackMode,
      Description: fallbackMode,
      Position: slotIndex + 1,
      Active: true,
      Commission: 0,
      isVoucher: false,
      isMember: false,
    };
    const isSelected =
      selectedPayMode.toUpperCase() === payItem.PayMode.toUpperCase();
    const visual = getPayModeVisual(payItem.PayMode, slotIndex);

    return (
      <TouchableOpacity
        key={payItem.PayMode}
        style={[
          styles.posBtn,
          { backgroundColor: visual.bg },
          isSelected && styles.posBtnActivePayMode,
        ]}
        onPress={() => handleSelectPayMode(payItem.PayMode)}
        onLongPress={() => setShowMorePayModes(true)}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons
          name={visual.iconName}
          size={18}
          color="#ffffff"
        />
        <Text style={styles.posBtnTextBig} numberOfLines={1}>
          {payItem.PayMode}
        </Text>
      </TouchableOpacity>
    );
  };

  // Totals calculations
  const totalQty = cart.reduce((acc, curr) => acc + curr.qty, 0);
  const subTotal = cart.reduce((acc, curr) => acc + curr.amount, 0);
  const discount = cart.reduce((acc, curr) => acc + curr.disc, 0);
  const netTotal = Math.max(0, subTotal);
  const tender = parseFloat(numpadValue || tenderAmount) || 0.0;
  const balance = Math.max(0, tender - netTotal);

  return (
    <View style={styles.screen}>
      {/* =========================================================================
          TOP BAR: Brand, Stock Status, Selected Item, Quick Qty, Actions
      ========================================================================= */}
      <View style={styles.topHeader}>
        {/* Logo / Brand Icon */}
        <View style={styles.logoBadge}>
          <MaterialCommunityIcons
            name="storefront-outline"
            size={20}
            color="#f8d7b3"
          />
        </View>

        {/* Stock info */}
        <View style={styles.stockBox}>
          <Text style={styles.stockLabel}>Stock : {activeItem.stock}</Text>
        </View>

        {/* Item Name */}
        <View style={styles.activeNameBox}>
          <Text style={styles.activeItemName} numberOfLines={1}>
            {activeItem.name}
          </Text>
        </View>

        {/* Math Calculation: -1 x 1.50 -1.50 */}
        <View style={styles.calcBox}>
          <Text style={styles.calcText}>
            {activeItem.qty} x {activeItem.price.toFixed(2)}{" "}
            {(activeItem.qty * activeItem.price).toFixed(2)}
          </Text>
        </View>

        {/* Plus / Minus Quick Buttons */}
        <TouchableOpacity
          style={styles.qtyPlusBtn}
          onPress={() => handleQtyChange(1)}
        >
          <MaterialCommunityIcons name="plus" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.qtyMinusBtn}
          onPress={() => handleQtyChange(-1)}
        >
          <MaterialCommunityIcons name="minus" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Price Check Button */}
        <TouchableOpacity style={styles.priceCheckBtn}>
          <Text style={styles.priceCheckText}>Price{"\n"}Check</Text>
        </TouchableOpacity>

        {/* Station Badge */}
        <View style={styles.stationBadge}>
          <Text style={styles.stationBadgeText}>
            {terminalCode || "HQPC1"} • {cashierName || "CASHIER"}
          </Text>
        </View>

        {/* Exit / Logout */}
        <TouchableOpacity style={styles.iconSquareBtn} onPress={onLogout}>
          <MaterialCommunityIcons name="power" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* =========================================================================
          INPUT SEARCH BAR: SKU Code, Description, Fast Qty, JD, TG
      ========================================================================= */}
      <View style={styles.inputBar}>
        <View style={styles.skuCodBox}>
          <TextInput
            placeholder="SKU Code"
            placeholderTextColor="#8a7967"
            style={styles.inputField}
            value={skuCode}
            onChangeText={setSkuCode}
          />
        </View>
        <View style={styles.descBox}>
          <TextInput
            placeholder="Search items by description..."
            placeholderTextColor="#8a7967"
            style={styles.inputField}
            value={skuDesc}
            onChangeText={setSkuDesc}
          />
        </View>

        <View style={styles.pillInputRed}>
          <Text style={styles.pillRedText}>1</Text>
        </View>

        <TouchableOpacity style={styles.pillTagBlue}>
          <Text style={styles.pillTagText}>JD</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.pillTagBlue}>
          <Text style={styles.pillTagText}>JD</Text>
        </TouchableOpacity>

        <View style={styles.pillInputRed}>
          <Text style={styles.pillRedText}>0.00</Text>
        </View>

        <TouchableOpacity style={styles.pillTagDark}>
          <Text style={styles.pillTagDarkText}>TG</Text>
        </TouchableOpacity>
      </View>

      {/* =========================================================================
          MAIN BODY: LEFT TABLE + CONTROLS, RIGHT CATEGORIES + PRODUCT GRID
      ========================================================================= */}
      <View style={styles.mainContent}>
        {/* ---------------- LEFT PANEL: Table & Payment Controls ---------------- */}
        <View style={styles.leftPanel}>
          {/* Grid Table */}
          <View style={styles.tableContainer}>
            {/* Table Header - Author: JAVITH 28-10-2026: Expanded column widths for clear readability */}
            <View style={styles.tableHeader}>
              <Text style={[styles.thCell, { width: 85 }]}>Code</Text>
              <Text style={[styles.thCell, { flex: 1 }]}>Description</Text>
              <Text style={[styles.thCell, { width: 55, textAlign: "center" }]}>
                Qty
              </Text>
              <Text style={[styles.thCell, { width: 75, textAlign: "right" }]}>
                Price
              </Text>
              <Text style={[styles.thCell, { width: 60, textAlign: "right" }]}>
                Disc
              </Text>
              <Text
                style={[
                  styles.thCell,
                  { width: 85, textAlign: "right", paddingRight: 8 },
                ]}
              >
                Amount
              </Text>
            </View>

            {/* Table Rows */}
            <ScrollView
              style={styles.tableBody}
              showsVerticalScrollIndicator={false}
            >
              {cart.length === 0
                ? Array.from({ length: 8 }).map((_, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.tableRow,
                        idx % 2 === 1 ? styles.rowEven : styles.rowOdd,
                      ]}
                    >
                      <Text style={[styles.tdCell, { width: 85 }]}></Text>
                      <Text style={[styles.tdCell, { flex: 1 }]}></Text>
                      <Text style={[styles.tdCell, { width: 55 }]}></Text>
                      <Text style={[styles.tdCell, { width: 75 }]}></Text>
                      <Text style={[styles.tdCell, { width: 60 }]}></Text>
                      <Text style={[styles.tdCell, { width: 85 }]}></Text>
                    </View>
                  ))
                : cart.map((item, idx) => (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => setSelectedCartIndex(idx)}
                      style={[
                        styles.tableRow,
                        selectedCartIndex === idx
                          ? styles.rowSelected
                          : idx % 2 === 1
                            ? styles.rowEven
                            : styles.rowOdd,
                      ]}
                    >
                      <Text
                        style={[
                          styles.tdCell,
                          { width: 85, fontWeight: "700" },
                        ]}
                      >
                        {item.code}
                      </Text>
                      <Text
                        style={[styles.tdCell, { flex: 1, fontWeight: "600" }]}
                        numberOfLines={1}
                      >
                        {item.description}
                      </Text>
                      <Text
                        style={[
                          styles.tdCell,
                          { width: 55, textAlign: "center", fontWeight: "700" },
                        ]}
                      >
                        {item.qty}
                      </Text>
                      <Text
                        style={[
                          styles.tdCell,
                          { width: 75, textAlign: "right" },
                        ]}
                      >
                        {item.price.toFixed(2)}
                      </Text>
                      <Text
                        style={[
                          styles.tdCell,
                          { width: 60, textAlign: "right" },
                        ]}
                      >
                        {item.disc.toFixed(2)}
                      </Text>
                      <Text
                        style={[
                          styles.tdCell,
                          {
                            width: 85,
                            textAlign: "right",
                            paddingRight: 8,
                            fontWeight: "700",
                          },
                        ]}
                      >
                        {item.amount.toFixed(2)}
                      </Text>
                    </TouchableOpacity>
                  ))}
            </ScrollView>

            {/* Table Bottom Totals Strip */}
            <View style={styles.tableFooterStrip}>
              <Text style={styles.footerSummaryText}>
                Total{" "}
                <Text style={styles.footerVal}>{subTotal.toFixed(2)}</Text>
              </Text>
              <Text style={styles.footerSummaryText}>
                Tot Qty{" "}
                <Text style={styles.footerVal}>{totalQty.toFixed(2)}</Text>
              </Text>
              <Text style={styles.footerSummaryText}>
                Disc <Text style={styles.footerVal}>{discount.toFixed(2)}</Text>
              </Text>
              <Text style={styles.footerSummaryText}>
                SubTotal{" "}
                <Text style={styles.footerVal}>{subTotal.toFixed(2)}</Text>
              </Text>
              <Text style={styles.footerSummaryText}>
                Tax <Text style={styles.footerVal}>0.0000</Text>
              </Text>
              <Text style={styles.footerSummaryText}>
                RoundOff <Text style={styles.footerVal}>0.00</Text>
              </Text>
            </View>
          </View>

          {/* Lower POS Control Block */}
          <View style={styles.lowerControlBlock}>
            {/* 1. Quick Function Keys & Dynamic PayModes from tblInvPaymode */}
            {/* Author: JAVITH 28-10-2026: Column 3 dynamically linked to tblInvPaymode */}
            <View style={styles.posActionGrid}>
              {/* Row 1 */}
              <TouchableOpacity
                style={[styles.posBtn, { backgroundColor: "#2ba84a" }]}
              >
                <MaterialCommunityIcons
                  name="pause-circle-outline"
                  size={18}
                  color="#fff"
                />
                <Text style={styles.posBtnText}>Hold</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.posBtn, { backgroundColor: "#ea4335" }]}
                onPress={handleDeleteItem}
              >
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={18}
                  color="#fff"
                />
                <Text style={styles.posBtnText}>Delete</Text>
              </TouchableOpacity>
              {renderPayModeButton(0, "CASH")}

              {/* Row 2 */}
              <TouchableOpacity
                style={[styles.posBtn, { backgroundColor: "#926c58" }]}
              >
                <Text style={styles.posBtnSubtitle}>F7</Text>
                <Text style={styles.posBtnText}>Release</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.posBtn, { backgroundColor: "#ff9800" }]}
                onPress={handleClearCart}
              >
                <Text style={styles.posBtnSubtitle}>F2</Text>
                <Text style={styles.posBtnText}>Clear</Text>
              </TouchableOpacity>
              {renderPayModeButton(1, "NETS")}

              {/* Row 3 */}
              <TouchableOpacity
                style={[styles.posBtn, { backgroundColor: "#e91e63" }]}
              >
                <MaterialCommunityIcons
                  name="receipt-text-outline"
                  size={18}
                  color="#fff"
                />
                <Text style={styles.posBtnTextSmall}>View Bill</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.posBtn, { backgroundColor: "#3f51b5" }]}
              >
                <MaterialCommunityIcons name="magnify" size={18} color="#fff" />
                <Text style={styles.posBtnTextSmall}>Search</Text>
              </TouchableOpacity>
              {renderPayModeButton(2, "PAYNOW")}

              {/* Row 4 */}
              <TouchableOpacity
                style={[styles.posBtn, { backgroundColor: "#d32f2f" }]}
                onPress={onLogout}
              >
                <Text style={styles.posBtnSubtitle}>F10</Text>
                <Text style={styles.posBtnText}>Exit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.posBtn, { backgroundColor: "#607d8b" }]}
              >
                <MaterialCommunityIcons
                  name="tag-edit-outline"
                  size={18}
                  color="#fff"
                />
                <Text style={styles.posBtnTextSmall}>Price{"\n"}Change</Text>
              </TouchableOpacity>
              {renderPayModeButton(3, "CDC")}
            </View>

            {/* 2. Total Display & Tender */}
            <View style={styles.totalDisplayBox}>
              <View style={styles.totalHeaderRow}>
                <Text style={styles.totalLabel}>
                  Net Total to Pay (F4){" "}
                  {selectedPayMode ? `• [${selectedPayMode}]` : ""}
                </Text>
              </View>
              <View style={styles.totalBigNumberRow}>
                <Text style={styles.totalBigNumber}>{netTotal.toFixed(2)}</Text>
              </View>

              <View style={styles.tenderBalanceRow}>
                <View style={styles.tenderCol}>
                  <Text style={styles.tenderLabel}>Tender</Text>
                  <Text style={styles.tenderValueGreen}>
                    {tender.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.tenderCol}>
                  <Text style={styles.tenderLabel}>Balance</Text>
                  <Text style={styles.balanceValueRed}>
                    {balance.toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>

            {/* 3. Numeric Keypad - Author: JAVITH 28-10-2026: 4x4 symmetric touch keypad */}
            <View style={styles.numpadGrid}>
              {/* Row 1 */}
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpad("1")}
              >
                <Text style={styles.numKeyText}>1</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpad("2")}
              >
                <Text style={styles.numKeyText}>2</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpad("3")}
              >
                <Text style={styles.numKeyText}>3</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.numKey, styles.numKeySpecial]}
                onPress={() => handleNumpad("-")}
              >
                <Text style={styles.numKeyText}>-</Text>
              </TouchableOpacity>

              {/* Row 2 */}
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpad("4")}
              >
                <Text style={styles.numKeyText}>4</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpad("5")}
              >
                <Text style={styles.numKeyText}>5</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpad("6")}
              >
                <Text style={styles.numKeyText}>6</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.numKey, styles.numKeySpecial]}
                onPress={() => handleNumpad("+")}
              >
                <Text style={styles.numKeyText}>+</Text>
              </TouchableOpacity>

              {/* Row 3 */}
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpad("7")}
              >
                <Text style={styles.numKeyText}>7</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpad("8")}
              >
                <Text style={styles.numKeyText}>8</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpad("9")}
              >
                <Text style={styles.numKeyText}>9</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpad("0")}
              >
                <Text style={styles.numKeyText}>0</Text>
              </TouchableOpacity>

              {/* Row 4 */}
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpad("00")}
              >
                <Text style={styles.numKeyText}>00</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpad(".")}
              >
                <Text style={styles.numKeyText}>.</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.numKey, styles.numKeySpecial]}
                onPress={() => handleNumpad("C")}
              >
                <Text style={styles.numKeyText}>C</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.numKey, styles.enterKey]}
                onPress={() => handleNumpad("ENTER")}
              >
                <MaterialCommunityIcons
                  name="keyboard-return"
                  size={22}
                  color="#ffffff"
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ---------------- RIGHT PANEL: Category Sidebar + Product Grid ---------------- */}
        <View style={styles.rightPanel}>
          {/* Vertical Category Rail (Compact vertical strip) */}
          <View style={styles.categoryRailContainer}>
            <ScrollView
              style={styles.categoryRailScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 4, paddingBottom: 28 }}
            >
              {loadingGroups ? (
                <ActivityIndicator
                  color="#fff"
                  size="small"
                  style={{ marginTop: 20 }}
                />
              ) : (
                groups.map((group, idx) => {
                  const isSelected =
                    selectedGroup.toUpperCase() ===
                    group.GroupCode.toUpperCase();
                  const visual = getGroupVisuals(group.GroupCode, idx);

                  return (
                    <TouchableOpacity
                      key={group.GroupCode}
                      style={[
                        styles.categoryBtn,
                        { backgroundColor: visual.bg },
                        isSelected && styles.categoryBtnActive,
                      ]}
                      onPress={() => handleSelectGroup(group.GroupCode)}
                      activeOpacity={0.85}
                    >
                      <MaterialCommunityIcons
                        name={visual.iconName}
                        size={18}
                        color="#ffffff"
                        style={styles.catIcon}
                      />
                      <Text style={styles.catLabel} numberOfLines={2}>
                        {group.GroupCode}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>

          {/* Product Items Grid (Fills the entire remaining width cleanly with 4 equal columns) */}
          <View style={styles.productsContainer}>
            {loadingItems ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator color="#1e3129" size="large" />
                <Text style={styles.loadingText}>
                  Loading {selectedGroup} items...
                </Text>
              </View>
            ) : filteredProducts.length === 0 ? (
              <View style={styles.centerEmpty}>
                <MaterialCommunityIcons
                  name="cube-off-outline"
                  size={38}
                  color="#9ca3af"
                />
                <Text style={styles.emptyTitle}>No items configured</Text>
                <Text style={styles.emptySubtitle}>
                  No items found in group "{selectedGroup}"
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.productsScroll}
                contentContainerStyle={styles.productsGrid}
                showsVerticalScrollIndicator={true}
              >
                {filteredProducts.map((prod) => {
                  const visual = getGroupVisuals(prod.GroupCode, 0);

                  return (
                    <TouchableOpacity
                      key={prod.InventoryCode}
                      style={styles.productCard}
                      onPress={() => handleAddItem(prod)}
                      activeOpacity={0.85}
                    >
                      {/* Product Thumbnail Banner */}
                      <View
                        style={[
                          styles.productThumb,
                          { backgroundColor: visual.bg + "14" },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={visual.iconName}
                          size={24}
                          color={visual.bg}
                        />
                        <View style={styles.skuBadge}>
                          <Text style={styles.skuBadgeText}>
                            {prod.InventoryCode}
                          </Text>
                        </View>
                      </View>

                      {/* Product Name */}
                      <Text style={styles.productName} numberOfLines={2}>
                        {prod.Description}
                      </Text>

                      {/* Bottom Row: Price and Quick (+) Button */}
                      <View style={styles.productCardBottom}>
                        <View>
                          <Text style={styles.productPrice}>
                            ${prod.SellingPrice.toFixed(2)}
                          </Text>
                          {prod.UOM ? (
                            <Text style={styles.productUom}>{prod.UOM}</Text>
                          ) : null}
                        </View>
                        <View style={styles.productAddBtn}>
                          <MaterialCommunityIcons
                            name="plus"
                            size={16}
                            color="#fff"
                          />
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </View>

      {/* =========================================================================
          MODAL: All Payment Modes from tblInvPaymode
          Author: JAVITH 28-10-2026: Dialog to choose any active paymode from tblInvPaymode
      ========================================================================= */}
      <Modal
        visible={showMorePayModes}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMorePayModes(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Select Payment Mode (tblInvPaymode)
              </Text>
              <TouchableOpacity
                onPress={() => setShowMorePayModes(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.payModeGridModal}>
                {payModes.map((pm, idx) => {
                  const visual = getPayModeVisual(pm.PayMode, idx);
                  const isSel =
                    selectedPayMode.toUpperCase() === pm.PayMode.toUpperCase();
                  return (
                    <TouchableOpacity
                      key={pm.PayMode}
                      style={[
                        styles.payModeModalBtn,
                        { backgroundColor: visual.bg },
                        isSel && styles.posBtnActivePayMode,
                      ]}
                      onPress={() => {
                        handleSelectPayMode(pm.PayMode);
                        setShowMorePayModes(false);
                      }}
                    >
                      <MaterialCommunityIcons
                        name={visual.iconName}
                        size={24}
                        color="#ffffff"
                      />
                      <Text style={styles.payModeModalLabel}>{pm.PayMode}</Text>
                      <Text style={styles.payModeModalDesc} numberOfLines={1}>
                        {pm.Description}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ==============================================================================
// STYLESHEET
// ==============================================================================

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    padding: 4,
    ...(Platform.OS === "web"
      ? {
          height: "100vh",
          userSelect: "none",
        }
      : {}),
  },

  // ---------------------------------------------------------------------------
  // TOP BAR
  // ---------------------------------------------------------------------------
  topHeader: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fffdf9",
    borderRadius: 6,
    paddingHorizontal: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#e5ded1",
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#4a2e18",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  stockBox: {
    paddingHorizontal: 8,
    height: 32,
    backgroundColor: "#f1eae0",
    borderRadius: 4,
    justifyContent: "center",
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#dcd1c2",
  },
  stockLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: "700",
    color: "#4a3b2c",
  },
  activeNameBox: {
    flex: 1,
    justifyContent: "center",
    marginRight: 8,
  },
  activeItemName: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: "800",
    color: "#8b1e1b",
    textTransform: "uppercase",
  },
  calcBox: {
    paddingHorizontal: 10,
    justifyContent: "center",
    marginRight: 8,
  },
  calcText: {
    fontFamily: FONT_MONO,
    fontVariant: ["tabular-nums"],
    fontSize: 13,
    fontWeight: "bold",
    color: "#2a1a0e",
  },
  qtyPlusBtn: {
    width: 38,
    height: 36,
    backgroundColor: "#43a047",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 4,
  },
  qtyMinusBtn: {
    width: 38,
    height: 36,
    backgroundColor: "#e53935",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
  },
  priceCheckBtn: {
    paddingHorizontal: 12,
    height: 36,
    backgroundColor: "#f59e0b",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
  },
  priceCheckText: {
    fontFamily: FONT_FAMILY,
    color: "#fff",
    fontWeight: "bold",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 13,
  },
  stationBadge: {
    backgroundColor: "#eee6d8",
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
    borderWidth: 1,
    borderColor: "#d8ccb9",
  },
  stationBadgeText: {
    fontFamily: FONT_MONO,
    fontVariant: ["tabular-nums"],
    fontSize: 11,
    fontWeight: "700",
    color: "#423d36",
  },
  iconSquareBtn: {
    width: 36,
    height: 36,
    backgroundColor: "#5d4037",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 2,
  },

  // ---------------------------------------------------------------------------
  // INPUT SEARCH BAR
  // ---------------------------------------------------------------------------
  inputBar: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fffcf7",
    borderRadius: 4,
    paddingHorizontal: 4,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#e8e0d4",
  },
  skuCodBox: {
    width: 90,
    height: 28,
    borderWidth: 1,
    borderColor: "#d1c7b8",
    borderRadius: 4,
    backgroundColor: "#fff",
    justifyContent: "center",
    paddingHorizontal: 6,
    marginRight: 4,
  },
  descBox: {
    flex: 1,
    height: 28,
    borderWidth: 1,
    borderColor: "#d1c7b8",
    borderRadius: 4,
    backgroundColor: "#fff",
    justifyContent: "center",
    paddingHorizontal: 8,
    marginRight: 8,
  },
  inputField: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: "#333",
    padding: 0,
  },
  pillInputRed: {
    minWidth: 32,
    height: 26,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e57373",
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
    marginRight: 4,
  },
  pillRedText: {
    fontFamily: FONT_MONO,
    fontVariant: ["tabular-nums"],
    color: "#d32f2f",
    fontWeight: "bold",
    fontSize: 12,
  },
  pillTagBlue: {
    backgroundColor: "#1976d2",
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 4,
  },
  pillTagText: {
    fontFamily: FONT_FAMILY,
    color: "#fff",
    fontWeight: "bold",
    fontSize: 12,
  },
  pillTagDark: {
    backgroundColor: "#37474f",
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  pillTagDarkText: {
    fontFamily: FONT_FAMILY,
    color: "#fff",
    fontWeight: "bold",
    fontSize: 12,
  },

  // ---------------------------------------------------------------------------
  // MAIN CONTENT AREA
  // ---------------------------------------------------------------------------
  mainContent: {
    flex: 1,
    flexDirection: "row",
  },

  // LEFT PANEL (Cart table + Controls)
  // Author: JAVITH 28-10-2026: Expanded to flex 6.5 to give maximum room to cart table, paymodes, total box, and numpad
  leftPanel: {
    flex: 6.5,
    marginRight: 4,
    display: "flex",
    flexDirection: "column",
  },

  // TABLE STYLES
  tableContainer: {
    flex: 1,
    backgroundColor: "#fbf7ee",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ded4c3",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#3d6c46",
    height: 32,
    alignItems: "center",
    paddingHorizontal: 6,
  },
  thCell: {
    fontFamily: FONT_FAMILY,
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 11,
    paddingHorizontal: 2,
  },
  tableBody: {
    flex: 1,
    backgroundColor: "#fbf7ee",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 32,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#ede4d4",
  },
  rowOdd: {
    backgroundColor: "#faf6eb",
  },
  rowEven: {
    backgroundColor: "#f4ede0",
  },
  rowSelected: {
    backgroundColor: "#e2f0d9",
  },
  tdCell: {
    fontFamily: FONT_MONO,
    fontVariant: ["tabular-nums"],
    color: "#2a1a0e",
    fontSize: 11,
    paddingHorizontal: 2,
  },
  tableFooterStrip: {
    height: 26,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#d6cabd",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 6,
  },
  footerSummaryText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: "bold",
    color: "#2b2118",
  },
  footerVal: {
    fontFamily: FONT_MONO,
    fontVariant: ["tabular-nums"],
    color: "#000000",
    fontWeight: "900",
  },

  // LOWER CONTROL BLOCK
  // Author: JAVITH 28-10-2026: Enhanced spacious layout for paymodes, net total, and numeric touch keys
  lowerControlBlock: {
    height: 220,
    flexDirection: "row",
    marginTop: 4,
  },
  posActionGrid: {
    width: 255,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignContent: "space-between",
    marginRight: 4,
  },
  posBtn: {
    width: "31.5%",
    height: 50,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
    padding: 2,
    gap: 2,
  },
  posBtnSubtitle: {
    fontFamily: FONT_FAMILY,
    color: "#ffffffcc",
    fontSize: 10,
    fontWeight: "700",
  },
  posBtnText: {
    fontFamily: FONT_FAMILY,
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "bold",
  },
  posBtnTextBig: {
    fontFamily: FONT_FAMILY,
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  posBtnTextSmall: {
    fontFamily: FONT_FAMILY,
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center",
  },
  posBtnActivePayMode: {
    borderWidth: 2.5,
    borderColor: "#ffffff",
    transform: [{ scale: 1.04 }],
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: 460,
    maxHeight: "80%",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  modalHeader: {
    height: 44,
    backgroundColor: "#3d6c46",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  modalTitle: {
    fontFamily: FONT_FAMILY,
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "bold",
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseText: {
    fontFamily: FONT_FAMILY,
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "bold",
  },
  modalBody: {
    padding: 16,
  },
  payModeGridModal: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  payModeModalBtn: {
    width: "48%",
    height: 70,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    padding: 8,
    gap: 2,
  },
  payModeModalLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: "900",
    color: "#ffffff",
    marginTop: 2,
  },
  payModeModalDesc: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    color: "#ffffffee",
  },

  // TOTAL DISPLAY
  totalDisplayBox: {
    flex: 1,
    backgroundColor: "#fde5b9",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e8c98e",
    padding: 8,
    marginRight: 4,
    justifyContent: "space-between",
  },
  totalHeaderRow: {
    alignItems: "center",
  },
  totalLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: "bold",
    color: "#3a2717",
  },
  totalBigNumberRow: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 4,
  },
  totalBigNumber: {
    fontFamily: FONT_MONO,
    fontVariant: ["tabular-nums"],
    fontSize: 46,
    fontWeight: "900",
    color: "#281a0e",
    letterSpacing: -1,
  },
  tenderBalanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#ffffffdd",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#e8d9c2",
  },
  tenderCol: {
    alignItems: "flex-start",
  },
  tenderLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: "bold",
    color: "#555",
  },
  tenderValueGreen: {
    fontFamily: FONT_MONO,
    fontVariant: ["tabular-nums"],
    fontSize: 19,
    fontWeight: "900",
    color: "#1b8a36",
  },
  balanceValueRed: {
    fontFamily: FONT_MONO,
    fontVariant: ["tabular-nums"],
    fontSize: 19,
    fontWeight: "900",
    color: "#d32f2f",
  },

  // NUMPAD
  numpadGrid: {
    width: 215,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignContent: "space-between",
  },
  numKey: {
    width: "23%",
    height: 50,
    backgroundColor: "#eee6d8",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#d8ccb9",
  },
  numKeySpecial: {
    backgroundColor: "#dfd2c0",
  },
  numKeyText: {
    fontFamily: FONT_MONO,
    fontVariant: ["tabular-nums"],
    fontSize: 19,
    fontWeight: "bold",
    color: "#33271d",
  },
  enterKey: {
    backgroundColor: "#523a28",
  },

  // ---------------------------------------------------------------------------
  // RIGHT PANEL: Category Rail + Products Grid (Compact item page)
  // Author: JAVITH 28-10-2026: Sized to flex 3.5 to keep item section compact & efficient
  // ---------------------------------------------------------------------------
  rightPanel: {
    flex: 3.5,
    flexDirection: "row",
    backgroundColor: "#fbf7ee",
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5ded1",
  },

  // Category Rail Container - Compact vertical bar
  categoryRailContainer: {
    width: 78,
    minWidth: 78,
    maxWidth: 78,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: "#1e1c1a",
  },
  categoryRailScroll: {
    flex: 1,
  },
  categoryBtn: {
    width: 70,
    height: 56,
    marginVertical: 3,
    marginHorizontal: 4,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    padding: 2,
  },
  categoryBtnActive: {
    borderWidth: 2.5,
    borderColor: "#ffffff",
    transform: [{ scale: 1.03 }],
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  catIcon: {
    marginBottom: 2,
  },
  catLabel: {
    fontFamily: FONT_FAMILY,
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "bold",
    textAlign: "center",
    lineHeight: 11,
    textTransform: "uppercase",
  },

  // Products Grid Container - Fills all remaining space smoothly!
  productsContainer: {
    flex: 1,
    backgroundColor: "#fbf7ee",
  },
  productsScroll: {
    flex: 1,
  },
  productsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 4,
    justifyContent: "flex-start",
  },
  // Author: JAVITH 28-10-2026: 3-column compact product card layout for neat display
  productCard: {
    width: "31.8%",
    height: 122,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    margin: "0.7%",
    padding: 5,
    borderWidth: 1,
    borderColor: "#ded5c5",
    justifyContent: "space-between",
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  productThumb: {
    width: "100%",
    height: 50,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  skuBadge: {
    position: "absolute",
    top: 2,
    left: 3,
    backgroundColor: "#00000044",
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 3,
  },
  skuBadgeText: {
    fontFamily: FONT_MONO,
    fontVariant: ["tabular-nums"],
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "700",
  },
  productName: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: "700",
    color: "#2a1e17",
    textAlign: "left",
    marginTop: 2,
    lineHeight: 12,
  },
  productCardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  productPrice: {
    fontFamily: FONT_MONO,
    fontVariant: ["tabular-nums"],
    fontSize: 11,
    fontWeight: "900",
    color: "#1a1816",
  },
  productUom: {
    fontFamily: FONT_FAMILY,
    fontSize: 8,
    fontWeight: "600",
    color: "#78716c",
  },
  productAddBtn: {
    width: 22,
    height: 22,
    backgroundColor: "#2e7d32",
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },

  // Loading & Empty States
  centerLoading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    fontFamily: FONT_FAMILY,
    marginTop: 10,
    fontSize: 12,
    fontWeight: "600",
    color: "#6b655c",
  },
  centerEmpty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: "700",
    color: "#44403c",
    marginTop: 8,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: "#78716c",
    textAlign: "center",
  },
});
