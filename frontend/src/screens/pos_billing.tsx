// ==============================================================================
// Project: Supermarket Retail POS
// Module: Professional Enterprise Touch Screen Billing (GreenMart Modern POS)
// File: src/screens/pos_billing.tsx
//
// Complete Enterprise POS Layout:
//   - Top Bar: Brand, Stock count, Active Item Banner, Math Calc (-1 x 1.50 = -1.50),
//              Quick (+)/(-) buttons, Price Check, Keyboard toggle, Terminal badge, Logout.
//   - Search/SKU Bar: SKU Code, Description, Fast Qty (1), Disc (0.00), JD/TG tags.
//   - Cart Grid (Referencing Image 2): Full high-density receipt grid (Code, Description,
//              Qty, Price, Disc, Amount, GST), colored row bands, active row highlight.
//              Generous space designed for desktop/EXE full-screen display.
//   - Footer Summary Strip: Total, Tot Qty, Disc, SubTotal, Tax, RoundOff.
//   - POS Control Block: 12 Function/Pay buttons (F6 Hold, Delete, CASH, F7 Release,
//              F2 Clear, NETS/CARD, View Bill, Search, PAYNOW/UPI, F10 Exit, Price Change, FLASH PAY).
//   - Net Total to Pay: Prominent hero display with Tender and Balance calculation.
//   - 4x4 Touch Numpad: 1-9, 0, 00, *, ., -, +, Enter.
//   - Right Catalog Panel: Vertical category sidebar + 4-column fast touch item tiles
//              with Description & Price. Automatically expands on wide screens/EXE.
//   - Keyboard Hotkeys: F2, F4, F6, F7, F10, Delete, Enter.
// ==============================================================================

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  StyleSheet,
  View,
  Text as RNText,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  Modal,
  Image,
  Linking,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import ThemeModal from "../components/ThemeModal";
import { useAppConfig } from "../config/ConfigContext";
import { getBackendBaseUrl } from "../config/appConfig";
import AppConfigScreen from "./AppConfigScreen";
import {
  THEMES,
  FONTS,
  ThemeConfig,
  FontOption,
  getSavedTheme,
  getSavedFont,
  saveThemePreference,
  saveFontPreference,
} from "../utils/theme";

const API_URL = getBackendBaseUrl();

// Enterprise POS Typography Stack
const FONT_FAMILY = Platform.select({
  web: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  default: undefined,
});

const FONT_MONO = Platform.select({
  web: '"JetBrains Mono", "SF Mono", Menlo, Consolas, Monaco, monospace',
  default: undefined,
});

// Live Database Interfaces
export interface TouchGroup {
  GroupCode: string;
  SortCode: number;
}

export interface TouchItem {
  GroupCode: string;
  InventoryCode: string;
  SortOrder: number;
  Description: string;
  SellingPrice: number;
  RetailPrice: number;
  UOM: string;
  hasImage?: number; // 1 = BLOB image exists in DB, 0 = no image (show icon)
}

export interface PayModeItem {
  Position: number;
  PayMode: string;
  Description: string;
  Active: boolean;
  Commission: number;
  isVoucher: boolean;
  isMember: boolean;
}

// Cart Item matching Image 2 grid
interface CartItem {
  id: string;
  code: string;
  description: string;
  qty: number;
  price: number;
  disc: number;
  amount: number;
  gst?: number;
  uom: string;
}

interface PosBillingProps {
  onLogout?: () => void;
  cashierName?: string;
  terminalCode?: string;
}

// Visual category icon mappings
function getCategoryIcon(
  groupCode: string,
): keyof typeof MaterialCommunityIcons.glyphMap {
  const code = (groupCode || "").toUpperCase().trim();
  if (
    code.includes("VEG") ||
    code.includes("FRUIT") ||
    code.includes("PRODUCE")
  )
    return "food-apple-outline";
  if (
    code.includes("BEER") ||
    code.includes("ALCOHOL") ||
    code.includes("WINE")
  )
    return "glass-mug-variant";
  if (
    code.includes("GROCERY") ||
    code.includes("RICE") ||
    code.includes("SPICE")
  )
    return "basket-outline";
  if (
    code.includes("DRINK") ||
    code.includes("BEV") ||
    code.includes("WATER") ||
    code.includes("COFFEE") ||
    code.includes("TEA")
  )
    return "coffee-outline";
  if (code.includes("SNACK") || code.includes("SWEET") || code.includes("CHIP"))
    return "cookie-outline";
  if (
    code.includes("SOAP") ||
    code.includes("DETERGENT") ||
    code.includes("CLEAN")
  )
    return "spray-bottle";
  if (code.includes("FROZEN") || code.includes("ICE")) return "snowflake";
  if (code.includes("PHONE") || code.includes("ACC") || code.includes("TOYS"))
    return "cellphone";
  return "tag-outline";
}



export default function PosBillingScreen({
  onLogout,
  cashierName,
  terminalCode,
}: PosBillingProps) {
  // ---------------------------------------------------------------------------
  // LIVE DATABASE STATE
  // ---------------------------------------------------------------------------
  const [groups, setGroups] = useState<TouchGroup[]>([]);
  const [items, setItems] = useState<TouchItem[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [loadingGroups, setLoadingGroups] = useState<boolean>(true);
  const [loadingItems, setLoadingItems] = useState<boolean>(false);

  // Paymodes state from tblInvPaymode
  const [payModes, setPayModes] = useState<PayModeItem[]>([]);
  const [selectedPayMode, setSelectedPayMode] = useState<string>("CASH");
  const [showMorePayModes, setShowMorePayModes] = useState<boolean>(false);

  // Cart State (Initialized empty)
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCartIndex, setSelectedCartIndex] = useState<number>(-1);
  const cartScrollRef = useRef<any>(null);
  const shouldAutoScrollRef = useRef<boolean>(false);
  // Tracks tile codes whose image failed to load — shows icon fallback
  const imageErrorCodes = useRef<Set<string>>(new Set());
  const [imageErrorTick, setImageErrorTick] = useState<number>(0);
  const prevCartLengthRef = useRef<number>(0);

  // Auto-scroll cart grid to newly added items
  useEffect(() => {
    if (cart.length > prevCartLengthRef.current) {
      shouldAutoScrollRef.current = true;
      const timer = setTimeout(() => {
        cartScrollRef.current?.scrollToEnd({ animated: true });
      }, 60);
      prevCartLengthRef.current = cart.length;
      return () => clearTimeout(timer);
    }
    prevCartLengthRef.current = cart.length;
  }, [cart.length]);

  // Active Item for Top Bar Banner & Math Display
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

  // Search & SKU Input Bar
  const [skuCode, setSkuCode] = useState("");
  const [skuDesc, setSkuDesc] = useState("");
  const [fastQty, setFastQty] = useState("1");
  const [fastDisc, setFastDisc] = useState("0.00");

  // Numpad & Tender state
  const [numpadValue, setNumpadValue] = useState("");
  const [tenderAmount, setTenderAmount] = useState("0.00");

  // Held Bills queue (for F6 Hold & F7 Release)
  const [heldBills, setHeldBills] = useState<CartItem[][]>([]);

  // Modals
  const [showPriceCheckModal, setShowPriceCheckModal] = useState(false);
  const [priceCheckQuery, setPriceCheckQuery] = useState("");
  const [priceCheckResult, setPriceCheckResult] = useState<TouchItem | null>(
    null,
  );

  const [showPriceChangeModal, setShowPriceChangeModal] = useState(false);
  const [overridePrice, setOverridePrice] = useState("");

  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptSummary, setReceiptSummary] = useState<{
    total: number;
    tender: number;
    balance: number;
    payMode: string;
  } | null>(null);

  // Centralized VB.NET App.config Integration
  const { config, isEnabled, getNum } = useAppConfig();
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);

  // License validation states (tblMaCompany ValidateDate)
  const [licenseExpired, setLicenseExpired] = useState(false);
  const [licenseWarning, setLicenseWarning] = useState<string | null>(null);
  const [showLicenseModal, setShowLicenseModal] = useState(false);

  // Theme & Typography Customizer State
  const [currentTheme, setCurrentTheme] = useState<ThemeConfig>(THEMES[0]);
  const [currentFont, setCurrentFont] = useState<FontOption>(FONTS[0]);
  const [showThemeModal, setShowThemeModal] = useState<boolean>(false);

  // Refs for auto-focusing inputs
  const skuInputRef = useRef<any>(null);

  // Load saved theme & typography preferences on mount
  useEffect(() => {
    loadThemePreferences();
  }, []);

  const loadThemePreferences = async () => {
    const theme = await getSavedTheme();
    const font = await getSavedFont();
    setCurrentTheme(theme);
    setCurrentFont(font);
  };

  const handleSelectTheme = async (theme: ThemeConfig) => {
    setCurrentTheme(theme);
    await saveThemePreference(theme.id);
  };

  const handleSelectFont = async (font: FontOption) => {
    setCurrentFont(font);
    await saveFontPreference(font.id);
  };

  // Check live license status from tblMaCompany
  const checkLicenseStatus = async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/api/auth/license-status`);
      const data = await res.json();
      if (!res.ok || data.success === false || data.licenseExpired) {
        setLicenseExpired(true);
        return false;
      } else {
        setLicenseExpired(false);
        if (data.license && data.license.warning) {
          setLicenseWarning(data.license.warning);
        } else {
          setLicenseWarning(null);
        }
        return true;
      }
    } catch {
      return !licenseExpired;
    }
  };

  // Load Groups and Paymodes on startup & poll license status
  useEffect(() => {
    fetchTouchGroups();
    fetchPayModes();
    checkLicenseStatus();

    // Live validation interval (checks license every 30s while cashier is billing)
    const licenseInterval = setInterval(() => {
      checkLicenseStatus();
    }, 30000);

    return () => clearInterval(licenseInterval);
  }, []);

  const fetchPayModes = async () => {
    try {
      const res = await fetch(`${API_URL}/api/paymode`);
      const data = await res.json();
      if (res.ok && data.success && data.paymodes && data.paymodes.length > 0) {
        setPayModes(data.paymodes);
      }
    } catch {
      setPayModes([]);
    }
  };

  const fetchTouchGroups = async () => {
    setLoadingGroups(true);
    try {
      const res = await fetch(`${API_URL}/api/inventory/touch-groups`);
      const data = await res.json();
      if (res.ok && data.success && data.groups && data.groups.length > 0) {
        setGroups(data.groups);
        const first = data.groups[0].GroupCode;
        setSelectedGroup(first);
        fetchTouchItems(first);
      } else {
        setGroups([]);
        setSelectedGroup("");
        setItems([]);
      }
    } catch {
      setGroups([]);
      setSelectedGroup("");
      setItems([]);
    } finally {
      setLoadingGroups(false);
    }
  };

  const fetchTouchItems = async (groupCode?: string) => {
    setLoadingItems(true);
    try {
      const url = groupCode
        ? `${API_URL}/api/inventory/touch-items?groupCode=${encodeURIComponent(groupCode)}`
        : `${API_URL}/api/inventory/touch-items`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.success && data.items && data.items.length > 0) {
        setItems(data.items);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleSelectGroup = (groupCode: string) => {
    setSelectedGroup(groupCode);
    setItemPageIndex(0);
    fetchTouchItems(groupCode);
  };

  // ---------------------------------------------------------------------------
  // FILTERED CATALOG ITEMS & NO-SCROLL PAGINATION (Up/Down Buttons)
  // ---------------------------------------------------------------------------
  const filteredProducts = useMemo(() => {
    let list = items;
    if (selectedGroup) {
      list = list.filter(
        (it) => it.GroupCode.toUpperCase() === selectedGroup.toUpperCase(),
      );
    }
    if (skuDesc.trim()) {
      const q = skuDesc.toLowerCase().trim();
      list = list.filter((it) => it.Description.toLowerCase().includes(q));
    }
    if (skuCode.trim()) {
      const q = skuCode.toLowerCase().trim();
      list = list.filter((it) => it.InventoryCode.toLowerCase().includes(q));
    }
    return list;
  }, [items, selectedGroup, skuDesc, skuCode]);

  // Category Group pagination (dynamically fits vertical rail height without scrolling or touching buttons)
  const [groupPageIndex, setGroupPageIndex] = useState<number>(0);
  const [railHeight, setRailHeight] = useState<number>(0);
  const CAT_GAP = 5;
  const CAT_BTN_HEIGHT = 50;
  const DEFAULT_GROUPS_PER_PAGE = 6;
  const BOTTOM_BUFFER = 12; // Guaranteed safety buffer so groups never touch the next button

  const groupsPerPage = useMemo(() => {
    if (railHeight <= 0) return DEFAULT_GROUPS_PER_PAGE;
    const usableHeight = railHeight - BOTTOM_BUFFER;
    const count = Math.floor(
      (usableHeight + CAT_GAP) / (CAT_BTN_HEIGHT + CAT_GAP),
    );
    return Math.max(1, count);
  }, [railHeight]);

  const totalGroupPages = Math.max(
    1,
    Math.ceil(groups.length / groupsPerPage),
  );

  const visibleGroups = useMemo(() => {
    return groups.slice(
      groupPageIndex * groupsPerPage,
      (groupPageIndex + 1) * groupsPerPage,
    );
  }, [groups, groupPageIndex, groupsPerPage]);

  // Keep groupPageIndex within valid range when groupsPerPage or groups change
  useEffect(() => {
    if (groupPageIndex >= totalGroupPages) {
      setGroupPageIndex(Math.max(0, totalGroupPages - 1));
    }
  }, [groupPageIndex, totalGroupPages]);

  // Item pagination (3x3 grid = exactly 9 items per page, zero scrolling)
  const [itemPageIndex, setItemPageIndex] = useState<number>(0);
  const ITEMS_PER_PAGE = 9;
  const totalItemPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / ITEMS_PER_PAGE),
  );
  const visibleProducts = useMemo(() => {
    return filteredProducts.slice(
      itemPageIndex * ITEMS_PER_PAGE,
      (itemPageIndex + 1) * ITEMS_PER_PAGE,
    );
  }, [filteredProducts, itemPageIndex]);

  // Reset itemPageIndex to 0 whenever filter/category changes
  useEffect(() => {
    setItemPageIndex(0);
  }, [selectedGroup, skuDesc, skuCode]);

  // ---------------------------------------------------------------------------
  // FINANCIAL CALCULATIONS (Total, Tot Qty, Disc, SubTotal, Tax, RoundOff)
  // ---------------------------------------------------------------------------
  const totalQty = cart.reduce((acc, curr) => acc + curr.qty, 0);
  const totalDiscount = cart.reduce((acc, curr) => acc + curr.disc, 0);
  const subTotal = cart.reduce((acc, curr) => acc + curr.qty * curr.price, 0);
  const netBeforeTax = Math.max(0, subTotal - totalDiscount);
  const taxRate = 0.0; // matching image (Tax 0.0000)
  const taxAmount = parseFloat((netBeforeTax * taxRate).toFixed(4));
  const rawTotal = netBeforeTax + taxAmount;
  const grandTotal = parseFloat(rawTotal.toFixed(2));
  const roundOff = parseFloat((grandTotal - rawTotal).toFixed(2));

  // Current tender value from numpad or tender input
  const currentTender = numpadValue
    ? parseFloat(numpadValue)
    : parseFloat(tenderAmount) || 0.0;
  const balance = Math.max(0, currentTender - grandTotal);

  // Sync active item when cart selection changes
  useEffect(() => {
    if (selectedCartIndex >= 0 && selectedCartIndex < cart.length) {
      const item = cart[selectedCartIndex];
      setActiveItem({
        name: item.description,
        qty: item.qty,
        price: item.price,
        stock: 0,
      });
    }
  }, [selectedCartIndex, cart]);

  // ---------------------------------------------------------------------------
  // CART OPERATIONS
  // ---------------------------------------------------------------------------
  const handleAddItem = async (item: TouchItem) => {
    // 1. License Validation: Block item additions if license ended
    if (licenseExpired) {
      setShowLicenseModal(true);
      return;
    }
    const isLicenseActive = await checkLicenseStatus();
    if (!isLicenseActive) {
      setShowLicenseModal(true);
      return;
    }

    const qtyToAdd = parseFloat(fastQty) || 1;
    const discToAdd = parseFloat(fastDisc) || 0;

    // App.config Conditions: AbovePrice, Aboveqty, ISValueAbove validation alerts
    const isValueAboveCheck = isEnabled("ISValueAbove");
    const abovePriceLimit = getNum("AbovePrice", 2000);
    const aboveQtyLimit = getNum("Aboveqty", 10);

    if (isValueAboveCheck || abovePriceLimit > 0) {
      if (item.SellingPrice > abovePriceLimit) {
        const warnMsg = `Item Price ($${item.SellingPrice.toFixed(2)}) exceeds configured threshold ($${abovePriceLimit.toFixed(2)}) [AbovePrice]. Supervisor authorization required.`;
        if (Platform.OS === "web") {
          window.alert(`⚠️ High Value Warning: ${warnMsg}`);
        } else {
          Alert.alert("High Value Warning", warnMsg);
        }
      }
    }

    if (qtyToAdd > aboveQtyLimit) {
      const warnMsg = `Quantity (${qtyToAdd}) exceeds configured limit (${aboveQtyLimit}) [Aboveqty]. Please verify bulk sale.`;
      if (Platform.OS === "web") {
        window.alert(`⚠️ High Quantity Warning: ${warnMsg}`);
      } else {
        Alert.alert("High Quantity Warning", warnMsg);
      }
    }

    setActiveItem({
      name: item.Description,
      qty: qtyToAdd,
      price: item.SellingPrice,
      stock: 0,
    });

    setCart((prev) => {
      const existingIdx = prev.findIndex((c) => c.code === item.InventoryCode);
      if (existingIdx > -1) {
        const updated = prev.map((c, i) =>
          i === existingIdx
            ? {
                ...c,
                qty: c.qty + qtyToAdd,
                disc: c.disc + discToAdd,
                amount: parseFloat(
                  ((c.qty + qtyToAdd) * c.price - (c.disc + discToAdd)).toFixed(
                    2,
                  ),
                ),
              }
            : c,
        );
        setSelectedCartIndex(existingIdx);
        return updated;
      } else {
        const newItem: CartItem = {
          id: Date.now().toString() + Math.random().toString(),
          code: item.InventoryCode,
          description: item.Description,
          qty: qtyToAdd,
          price: item.SellingPrice,
          disc: discToAdd,
          amount: parseFloat(
            (qtyToAdd * item.SellingPrice - discToAdd).toFixed(2),
          ),
          gst: 0.0,
          uom: item.UOM || "PCS",
        };
        const nextCart = [...prev, newItem];
        setSelectedCartIndex(nextCart.length - 1);
        shouldAutoScrollRef.current = true;
        return nextCart;
      }
    });
  };

  // Adjust active item quantity with (+) or (-) buttons
  const handleQtyChange = async (delta: number) => {
    if (delta > 0) {
      if (licenseExpired) {
        setShowLicenseModal(true);
        return;
      }
      const isLicenseActive = await checkLicenseStatus();
      if (!isLicenseActive) {
        setShowLicenseModal(true);
        return;
      }
    }
    if (cart.length === 0) return;
    const targetIdx =
      selectedCartIndex >= 0 ? selectedCartIndex : cart.length - 1;

    setCart(
      (prev) =>
        prev
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
          .filter(Boolean) as CartItem[],
    );
  };

  // Delete selected item from cart
  const handleDeleteItem = () => {
    if (cart.length === 0) return;
    const targetIdx =
      selectedCartIndex >= 0 ? selectedCartIndex : cart.length - 1;
    setCart((prev) => prev.filter((_, i) => i !== targetIdx));
    setSelectedCartIndex(-1);
  };

  // Clear entire cart (F2 Clear)
  const handleClearCart = () => {
    setCart([]);
    setSelectedCartIndex(-1);
    setNumpadValue("");
    setTenderAmount("0.00");
    setActiveItem({
      name: "READY TO SCAN / SELECT ITEM",
      qty: 0,
      price: 0.0,
      stock: 0,
    });
    setSkuCode("");
    setSkuDesc("");
  };

  // Hold current bill (F6 Hold) - Enforces HOLDBILL and AllowHoldOnlyTwobills settings
  const handleHoldBill = () => {
    // Condition 1: Check if HOLDBILL is enabled (App.config HOLDBILL = 0 disables parking)
    if (!isEnabled("HOLDBILL")) {
      if (Platform.OS === "web") {
        window.alert(
          "Hold Bill functionality is disabled in System Configuration (HOLDBILL = 0).",
        );
      } else {
        Alert.alert(
          "Feature Disabled",
          "Hold Bill functionality is disabled in System Configuration (HOLDBILL = 0).",
        );
      }
      return;
    }

    if (cart.length === 0) return;

    // Condition 2: Check AllowHoldOnlyTwobills restriction
    if (isEnabled("AllowHoldOnlyTwobills") && heldBills.length >= 2) {
      if (Platform.OS === "web") {
        window.alert(
          "Maximum 2 held bills allowed per System Configuration (AllowHoldOnlyTwobills = 1). Please release a bill first.",
        );
      } else {
        Alert.alert(
          "Hold Limit Reached",
          "Maximum 2 held bills allowed per System Configuration (AllowHoldOnlyTwobills = 1). Please release a bill first.",
        );
      }
      return;
    }

    setHeldBills((prev) => [...prev, cart]);
    handleClearCart();
  };

  // Release held bill (F7 Release)
  const handleReleaseBill = () => {
    if (heldBills.length === 0) return;
    const lastHeld = heldBills[heldBills.length - 1];
    setCart(lastHeld);
    setSelectedCartIndex(lastHeld.length - 1);
    shouldAutoScrollRef.current = true;
    setHeldBills((prev) => prev.slice(0, -1));
  };

  // SKU Bar Enter Key submission
  const handleSkuSubmit = async () => {
    if (licenseExpired) {
      setShowLicenseModal(true);
      return;
    }
    const isLicenseActive = await checkLicenseStatus();
    if (!isLicenseActive) {
      setShowLicenseModal(true);
      return;
    }

    if (!skuCode.trim() && !skuDesc.trim()) return;
    const searchVal = (skuCode || skuDesc).trim().toLowerCase();

    const match = items.find(
      (it) =>
        it.InventoryCode.toLowerCase() === searchVal ||
        it.Description.toLowerCase().includes(searchVal),
    );

    if (match) {
      handleAddItem(match);
      setSkuCode("");
      setSkuDesc("");
    } else {
      const customItem: TouchItem = {
        GroupCode: selectedGroup || "MISC",
        InventoryCode: skuCode || "999999",
        SortOrder: 99,
        Description: skuDesc ? skuDesc.toUpperCase() : `ITEM #${skuCode}`,
        SellingPrice: 1.0,
        RetailPrice: 1.0,
        UOM: "PCS",
      };
      handleAddItem(customItem);
      setSkuCode("");
      setSkuDesc("");
    }
  };

  // ---------------------------------------------------------------------------
  // NUMPAD LOGIC (1-9, 0, 00, *, ., -, +, ↵ Enter)
  // ---------------------------------------------------------------------------
  const handleNumpadKey = (key: string) => {
    if (key === "ENTER") {
      if (numpadValue) {
        setTenderAmount(parseFloat(numpadValue).toFixed(2));
        setNumpadValue("");
      } else {
        handleCheckout();
      }
      return;
    }
    if (key === "CLEAR" || key === "C") {
      setNumpadValue("");
      return;
    }
    if (key === "+" || key === "-") {
      handleQtyChange(key === "+" ? 1 : -1);
      return;
    }
    if (key === "." && numpadValue.includes(".")) return;
    setNumpadValue((prev) => prev + key);
  };

  // Checkout (Net Total to Pay F4)
  const handleCheckout = () => {
    if (cart.length === 0) return;
    const finalTender = currentTender > 0 ? currentTender : grandTotal;
    setReceiptSummary({
      total: grandTotal,
      tender: finalTender,
      balance: Math.max(0, finalTender - grandTotal),
      payMode: selectedPayMode,
    });
    setShowReceiptModal(true);
  };

  const handleFinishSale = () => {
    setShowReceiptModal(false);
    handleClearCart();
  };

  // Price Change override
  const handleApplyPriceChange = () => {
    const newPrice = parseFloat(overridePrice);
    if (
      !isNaN(newPrice) &&
      selectedCartIndex >= 0 &&
      selectedCartIndex < cart.length
    ) {
      setCart((prev) =>
        prev.map((c, i) =>
          i === selectedCartIndex
            ? {
                ...c,
                price: newPrice,
                amount: parseFloat((c.qty * newPrice - c.disc).toFixed(2)),
              }
            : c,
        ),
      );
      setShowPriceChangeModal(false);
      setOverridePrice("");
    }
  };

  // Keyboard Shortcuts (Web/Desktop EXE)
  useEffect(() => {
    if (Platform.OS !== "web") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        handleClearCart();
      } else if (e.key === "F4") {
        e.preventDefault();
        handleCheckout();
      } else if (e.key === "F6") {
        e.preventDefault();
        handleHoldBill();
      } else if (e.key === "F7") {
        e.preventDefault();
        handleReleaseBill();
      } else if (e.key === "F10") {
        e.preventDefault();
        if (onLogout) onLogout();
      } else if (e.key === "Delete") {
        handleDeleteItem();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart, heldBills, grandTotal, currentTender, selectedPayMode]);

  const activeFontFamily = currentFont.fontFamily;

  // Global theme font-aware Text wrapper - dynamically propagates activeFontFamily globally across all elements (including cart items, grid, buttons, and metrics)
  const Text = ({ style, ...props }: React.ComponentProps<typeof RNText>) => {
    const flattened = StyleSheet.flatten(style);
    const isMono = flattened?.fontFamily === FONT_MONO;
    return (
      <RNText
        {...props}
        style={[
          style,
          { fontFamily: isMono ? currentFont.monoFontFamily : activeFontFamily },
        ]}
      />
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: currentTheme.bg }]}>
      {/* Hide native scrollbar arrow buttons and track on web while preserving smooth scrolling */}
      {Platform.OS === "web" && (
        <style
          dangerouslySetInnerHTML={{
            __html: `
              ::-webkit-scrollbar { width: 0px !important; height: 0px !important; display: none !important; }
              ::-webkit-scrollbar-button { width: 0px !important; height: 0px !important; display: none !important; }
              ::-webkit-scrollbar-thumb { display: none !important; }
              ::-webkit-scrollbar-track { display: none !important; }
              * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
            `,
          }}
        />
      )}
      {/* =========================================================================
          TOP BAR: Brand, Stock count, Active Item Banner, Math Calc (-1 x 1.50 = -1.50),
          Quick (+)/(-) buttons, Price Check, Keyboard toggle, Theme toggle, Terminal badge, Logout.
      ========================================================================= */}
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: currentTheme.surface,
            borderColor: currentTheme.borderColor,
          },
        ]}
      >
        {/* Brand Logo & Stock Count */}
        <TouchableOpacity
          style={[styles.brandBadge, { backgroundColor: currentTheme.primary }]}
          onPress={() => setShowThemeModal(true)}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="cart-variant"
            size={20}
            color="#ffffff"
          />
          <Text style={styles.brandBadgeText}>GM</Text>
        </TouchableOpacity>

        <View style={styles.stockBox}>
          <Text
            style={[
              styles.stockLabel,
              { color: currentTheme.textDark, fontFamily: activeFontFamily },
            ]}
          >
            Stock : {activeItem.stock}
          </Text>
        </View>

        {/* Active Item Banner */}
        <View style={styles.activeBannerBox}>
          <Text
            style={[
              styles.activeBannerText,
              { color: currentTheme.primary, fontFamily: activeFontFamily },
            ]}
            numberOfLines={1}
          >
            {activeItem.name}
          </Text>
        </View>

        {/* Math Calculation Display: 1 x 1.00 = 1.00 */}
        <View style={styles.mathCalcBox}>
          <Text
            style={[
              styles.mathCalcText,
              { color: currentTheme.textDark, fontFamily: activeFontFamily },
            ]}
          >
            {activeItem.qty} x {activeItem.price.toFixed(2)} ={" "}
            {(activeItem.qty * activeItem.price).toFixed(2)}
          </Text>
        </View>

        {/* Plus / Minus Quick Buttons */}
        <TouchableOpacity
          style={[styles.qtyBtnPlus, { backgroundColor: currentTheme.primary }]}
          onPress={() => handleQtyChange(1)}
        >
          <MaterialCommunityIcons name="plus" size={20} color="#ffffff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.qtyBtnMinus}
          onPress={() => handleQtyChange(-1)}
        >
          <MaterialCommunityIcons name="minus" size={20} color="#ffffff" />
        </TouchableOpacity>

        {/* Price Check Button */}
        <TouchableOpacity
          style={styles.priceCheckBtn}
          onPress={() => setShowPriceCheckModal(true)}
        >
          <Text style={styles.priceCheckText}>Price{"\n"}Check</Text>
        </TouchableOpacity>

        {/* Keyboard / Scanner Toggle Icon */}
        <TouchableOpacity
          style={styles.keyboardToggleBtn}
          onPress={() => skuInputRef.current?.focus()}
        >
          <MaterialCommunityIcons
            name="keyboard-outline"
            size={20}
            color="#ffffff"
          />
        </TouchableOpacity>

        {/* System App.config Manager Button */}
        <TouchableOpacity
          style={[
            styles.posThemeBtn,
            {
              backgroundColor: currentTheme.isDark ? "#334155" : "#f1f5f9",
              borderColor: currentTheme.borderColor,
            },
          ]}
          onPress={() => setShowConfigModal(true)}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="cog-outline"
            size={18}
            color={currentTheme.primary}
          />
          <Text
            style={[
              styles.posThemeBtnText,
              { color: currentTheme.textDark, fontFamily: activeFontFamily },
            ]}
          >
            Config
          </Text>
        </TouchableOpacity>

        {/* Theme & Typography Customizer Button */}
        <TouchableOpacity
          style={[
            styles.posThemeBtn,
            {
              backgroundColor: currentTheme.isDark ? "#334155" : "#f1f5f9",
              borderColor: currentTheme.borderColor,
            },
          ]}
          onPress={() => setShowThemeModal(true)}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="palette-outline"
            size={18}
            color={currentTheme.primary}
          />
          <Text
            style={[
              styles.posThemeBtnText,
              { color: currentTheme.textDark, fontFamily: activeFontFamily },
            ]}
          >
            Theme
          </Text>
        </TouchableOpacity>

        {/* Station Badge */}
        <View
          style={[
            styles.stationBadge,
            {
              backgroundColor: currentTheme.isDark ? "#1e293b" : "#f1f5f9",
              borderColor: currentTheme.borderColor,
            },
          ]}
        >
          <Text
            style={[
              styles.stationBadgeText,
              { color: currentTheme.textDark, fontFamily: activeFontFamily },
            ]}
          >
            {terminalCode || "HQPC1"} • {cashierName || "CASHIER"}
          </Text>
        </View>

        {/* Exit / Logout Power Icon */}
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
          <MaterialCommunityIcons name="power" size={18} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* License Expired Live Alert Banner */}
      {licenseExpired && (
        <View style={styles.posLicenseExpiredBanner}>
          <MaterialCommunityIcons
            name="alert-octagon"
            size={18}
            color="#ffffff"
          />
          <Text style={styles.posLicenseExpiredText}>
            License expired. You cannot add items.
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL("https://uniprosg.com")}
          >
            <Text style={styles.posLicenseExpiredLink}>
              Please contact https://uniprosg.com
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* =========================================================================
          SEARCH & SKU BAR: SKU Code, Description, Fast Qty, TG / Sales M Tags
      ========================================================================= */}
      <View style={styles.skuBar}>
        <View style={styles.skuCodeBox}>
          <TextInput
            ref={skuInputRef}
            placeholder="SKU Code"
            placeholderTextColor="#64748b"
            style={styles.skuInput}
            value={skuCode}
            onChangeText={setSkuCode}
            onSubmitEditing={handleSkuSubmit}
          />
        </View>

        <View style={styles.skuDescBox}>
          <TextInput
            placeholder="Search items by description..."
            placeholderTextColor="#64748b"
            style={styles.skuInput}
            value={skuDesc}
            onChangeText={setSkuDesc}
            onSubmitEditing={handleSkuSubmit}
          />
        </View>

        {/* Fast Quantity Pill (1) */}
        <View style={styles.pillInputBox}>
          <TextInput
            style={styles.pillInput}
            value={fastQty}
            onChangeText={setFastQty}
            keyboardType="numeric"
          />
        </View>

        {/* Quick Tag Pills */}
        <TouchableOpacity style={styles.tagPillBlue}>
          <Text style={styles.tagPillText}>JD</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tagPillBlue}>
          <Text style={styles.tagPillText}>Sales M</Text>
        </TouchableOpacity>

        <View style={styles.pillInputBox}>
          <TextInput
            style={styles.pillInput}
            value={fastDisc}
            onChangeText={setFastDisc}
            keyboardType="numeric"
          />
        </View>

        <TouchableOpacity style={styles.tagPillDark}>
          <Text style={styles.tagPillDarkText}>TG</Text>
        </TouchableOpacity>
      </View>

      {/* =========================================================================
          MAIN WORKSPACE: LEFT (Cart Ledger + Controls) | RIGHT (Category Rail + Touch Items)
      ========================================================================= */}
      <View style={styles.workspace}>
        {/* ---------------- LEFT PANEL: Cart Ledger + Bottom Controls ---------------- */}
        <View style={styles.leftPanel}>
          {/* CART GRID TABLE (Referencing Image 2) */}
          <View
            style={[
              styles.tableCard,
              {
                backgroundColor: currentTheme.surface,
                borderColor: currentTheme.borderColor,
              },
            ]}
          >
            {/* Table Header */}
            <View
              style={[
                styles.tableHeader,
                { backgroundColor: currentTheme.tableHeaderBg },
              ]}
            >
              <Text
                style={[
                  styles.thCell,
                  {
                    width: 90,
                    color: currentTheme.tableHeaderColor,
                    fontFamily: activeFontFamily,
                  },
                ]}
              >
                Code
              </Text>
              <Text
                style={[
                  styles.thCell,
                  {
                    flex: 1,
                    color: currentTheme.tableHeaderColor,
                    fontFamily: activeFontFamily,
                  },
                ]}
              >
                Description
              </Text>
              <Text
                style={[
                  styles.thCell,
                  {
                    width: 55,
                    textAlign: "center",
                    color: currentTheme.tableHeaderColor,
                    fontFamily: activeFontFamily,
                  },
                ]}
              >
                Qty
              </Text>
              <Text
                style={[
                  styles.thCell,
                  {
                    width: 70,
                    textAlign: "right",
                    color: currentTheme.tableHeaderColor,
                    fontFamily: activeFontFamily,
                  },
                ]}
              >
                Price
              </Text>
              <Text
                style={[
                  styles.thCell,
                  {
                    width: 60,
                    textAlign: "right",
                    color: currentTheme.tableHeaderColor,
                    fontFamily: activeFontFamily,
                  },
                ]}
              >
                Disc
              </Text>
              <Text
                style={[
                  styles.thCell,
                  {
                    width: 90,
                    textAlign: "right",
                    paddingRight: 8,
                    color: currentTheme.tableHeaderColor,
                    fontFamily: activeFontFamily,
                  },
                ]}
              >
                Amount
              </Text>
            </View>

            {/* Table Rows (Clean Scroll with auto-scroll on new item) */}
            <ScrollView
              ref={cartScrollRef}
              style={styles.tableBodyScroll}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
              onContentSizeChange={() => {
                if (shouldAutoScrollRef.current) {
                  cartScrollRef.current?.scrollToEnd({ animated: true });
                  shouldAutoScrollRef.current = false;
                }
              }}
            >
              {cart.length === 0 ? (
                <View style={styles.emptyTableState}>
                  <MaterialCommunityIcons
                    name="cart-outline"
                    size={44}
                    color="#94a3b8"
                  />
                  <Text style={styles.emptyTableTitle}>No items in cart</Text>
                  <Text style={styles.emptyTableSubtitle}>
                    Scan SKU barcode or tap items on the right touch catalog.
                  </Text>
                </View>
              ) : (
                cart.map((item, idx) => {
                  const isSelected = selectedCartIndex === idx;

                  // Row background styling matching Image 2
                  let rowCustomStyle = styles.rowDefault;
                  if (isSelected) {
                    rowCustomStyle = styles.rowSelectedActive; // Yellow/amber band with bold red text
                  } else if (idx === 0) {
                    rowCustomStyle = styles.rowBandPink;
                  } else if (idx === 1) {
                    rowCustomStyle = styles.rowBandPeach;
                  } else if (idx === 2) {
                    rowCustomStyle = styles.rowBandCyan;
                  } else if (idx % 2 === 1) {
                    rowCustomStyle = styles.rowAlt;
                  }

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.tableRow, rowCustomStyle]}
                      onPress={() => setSelectedCartIndex(idx)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.tdCell,
                          styles.tdCode,
                          {
                            width: 90,
                            fontSize: getNum("GridFontSize", 17) - 3,
                          },
                          isSelected && styles.tdSelectedText,
                        ]}
                      >
                        {item.code}
                      </Text>

                      <Text
                        style={[
                          styles.tdCell,
                          styles.tdDescription,
                          { flex: 1, fontSize: getNum("GridFontSize", 17) - 3 },
                          isSelected && styles.tdSelectedText,
                        ]}
                        numberOfLines={1}
                      >
                        {item.description}
                      </Text>

                      <Text
                        style={[
                          styles.tdCell,
                          styles.tdQty,
                          {
                            width: 55,
                            textAlign: "center",
                            fontSize: getNum("GridFontSize", 17) - 3,
                          },
                          isSelected && styles.tdSelectedText,
                        ]}
                      >
                        {item.qty}
                      </Text>

                      <Text
                        style={[
                          styles.tdCell,
                          styles.tdPrice,
                          {
                            width: 70,
                            textAlign: "right",
                            fontSize: getNum("GridFontSize", 17) - 3,
                          },
                          isSelected && styles.tdSelectedText,
                        ]}
                      >
                        {item.price.toFixed(2)}
                      </Text>

                      <Text
                        style={[
                          styles.tdCell,
                          styles.tdDisc,
                          {
                            width: 60,
                            textAlign: "right",
                            fontSize: getNum("GridFontSize", 17) - 3,
                          },
                          isSelected && styles.tdSelectedText,
                        ]}
                      >
                        {item.disc.toFixed(2)}
                      </Text>

                      <Text
                        style={[
                          styles.tdCell,
                          styles.tdAmount,
                          {
                            width: 90,
                            textAlign: "right",
                            paddingRight: 8,
                            fontSize: getNum("GridFontSize", 17) - 3,
                          },
                          isSelected && styles.tdSelectedText,
                        ]}
                      >
                        {item.amount.toFixed(2)}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {/* Table Footer Totals Strip (Modern Metric Chips) */}
            <View style={styles.footerSummaryStrip}>
              <View style={styles.summaryChip}>
                <Text style={styles.summaryChipLabel}>TOTAL</Text>
                <Text style={styles.summaryChipVal}>
                  ${subTotal.toFixed(2)}
                </Text>
              </View>
              <View style={styles.summaryChip}>
                <Text style={styles.summaryChipLabel}>ITEMS</Text>
                <Text style={styles.summaryChipVal}>{totalQty.toFixed(0)}</Text>
              </View>
              <View style={styles.summaryChip}>
                <Text style={styles.summaryChipLabel}>DISC</Text>
                <Text style={styles.summaryChipVal}>
                  ${totalDiscount.toFixed(2)}
                </Text>
              </View>
              <View style={styles.summaryChip}>
                <Text style={styles.summaryChipLabel}>SUBTOTAL</Text>
                <Text style={styles.summaryChipVal}>
                  ${subTotal.toFixed(2)}
                </Text>
              </View>
              <View style={styles.summaryChip}>
                <Text style={styles.summaryChipLabel}>TAX</Text>
                <Text style={styles.summaryChipVal}>
                  ${taxAmount.toFixed(2)}
                </Text>
              </View>
              <View style={styles.summaryChip}>
                <Text style={styles.summaryChipLabel}>ROUND OFF</Text>
                <Text style={styles.summaryChipVal}>
                  ${roundOff.toFixed(2)}
                </Text>
              </View>
            </View>
          </View>

          {/* LOWER POS CONTROL BLOCK: 12 Actions + Net Total to Pay + Numpad */}
          <View style={styles.lowerControlBlock}>
            {/* 1. POS Action & Payment Function Buttons (4x3 Modern Grid) */}
            <View style={styles.actionGrid}>
              {/* Row 1 */}
              <TouchableOpacity
                style={[styles.posBtn, styles.btnHold]}
                onPress={handleHoldBill}
                activeOpacity={0.8}
              >
                <View style={styles.posKeyBadge}>
                  <Text style={styles.posKeyBadgeText}>F6</Text>
                </View>
                <MaterialCommunityIcons
                  name="pause-circle-outline"
                  size={16}
                  color="#ffffff"
                  style={styles.posBtnIcon}
                />
                <Text style={styles.posBtnTitle}>Hold</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.posBtn, styles.btnDelete]}
                onPress={handleDeleteItem}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={16}
                  color="#ffffff"
                  style={styles.posBtnIcon}
                />
                <Text style={styles.posBtnTitle}>Delete</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.posBtn,
                  styles.btnPayMode,
                  selectedPayMode === "CASH" && styles.btnPayModeActive,
                ]}
                onPress={() => setSelectedPayMode("CASH")}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="cash-multiple"
                  size={16}
                  color={selectedPayMode === "CASH" ? "#ffffff" : "#38bdf8"}
                  style={styles.posBtnIcon}
                />
                <Text
                  style={[
                    styles.posBtnTitle,
                    selectedPayMode === "CASH" && styles.posBtnTitleActive,
                  ]}
                >
                  CASH
                </Text>
              </TouchableOpacity>

              {/* Row 2 */}
              <TouchableOpacity
                style={[styles.posBtn, styles.btnRelease]}
                onPress={handleReleaseBill}
                activeOpacity={0.8}
              >
                <View style={styles.posKeyBadge}>
                  <Text style={styles.posKeyBadgeText}>F7</Text>
                </View>
                <MaterialCommunityIcons
                  name="play-circle-outline"
                  size={16}
                  color="#ffffff"
                  style={styles.posBtnIcon}
                />
                <Text style={styles.posBtnTitle}>Release</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.posBtn, styles.btnClear]}
                onPress={handleClearCart}
                activeOpacity={0.8}
              >
                <View style={styles.posKeyBadge}>
                  <Text style={styles.posKeyBadgeText}>F2</Text>
                </View>
                <MaterialCommunityIcons
                  name="close-circle-outline"
                  size={16}
                  color="#ffffff"
                  style={styles.posBtnIcon}
                />
                <Text style={styles.posBtnTitle}>Clear</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.posBtn,
                  styles.btnPayMode,
                  selectedPayMode === "NETS" && styles.btnPayModeActive,
                ]}
                onPress={() => setSelectedPayMode("NETS")}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="credit-card-outline"
                  size={16}
                  color={selectedPayMode === "NETS" ? "#ffffff" : "#38bdf8"}
                  style={styles.posBtnIcon}
                />
                <Text
                  style={[
                    styles.posBtnTitle,
                    selectedPayMode === "NETS" && styles.posBtnTitleActive,
                  ]}
                >
                  NETS
                </Text>
              </TouchableOpacity>

              {/* Row 3 */}
              <TouchableOpacity
                style={[styles.posBtn, styles.btnViewBill]}
                onPress={() => {
                  setReceiptSummary({
                    total: grandTotal,
                    tender: currentTender,
                    balance: balance,
                    payMode: selectedPayMode,
                  });
                  setShowReceiptModal(true);
                }}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="receipt-text-outline"
                  size={16}
                  color="#ffffff"
                  style={styles.posBtnIcon}
                />
                <Text style={styles.posBtnTitle}>View Bill</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.posBtn, styles.btnSearch]}
                onPress={() => setShowPriceCheckModal(true)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="magnify"
                  size={16}
                  color="#ffffff"
                  style={styles.posBtnIcon}
                />
                <Text style={styles.posBtnTitle}>Search</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.posBtn,
                  styles.btnPayMode,
                  selectedPayMode === "PAYNOW" && styles.btnPayModeActive,
                ]}
                onPress={() => setSelectedPayMode("PAYNOW")}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="qrcode-scan"
                  size={16}
                  color={selectedPayMode === "PAYNOW" ? "#ffffff" : "#38bdf8"}
                  style={styles.posBtnIcon}
                />
                <Text
                  style={[
                    styles.posBtnTitle,
                    selectedPayMode === "PAYNOW" && styles.posBtnTitleActive,
                  ]}
                >
                  PAYNOW
                </Text>
              </TouchableOpacity>

              {/* Row 4 */}
              <TouchableOpacity
                style={[styles.posBtn, styles.btnExit]}
                onPress={onLogout}
                activeOpacity={0.8}
              >
                <View style={styles.posKeyBadge}>
                  <Text style={styles.posKeyBadgeText}>F10</Text>
                </View>
                <MaterialCommunityIcons
                  name="logout-variant"
                  size={16}
                  color="#ffffff"
                  style={styles.posBtnIcon}
                />
                <Text style={styles.posBtnTitle}>Exit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.posBtn, styles.btnPriceChange]}
                onPress={() => setShowPriceChangeModal(true)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="tag-outline"
                  size={16}
                  color="#ffffff"
                  style={styles.posBtnIcon}
                />
                <Text style={styles.posBtnTitle}>Price Chg</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.posBtn,
                  styles.btnPayMode,
                  selectedPayMode === "FLASH PAY" && styles.btnPayModeActive,
                ]}
                onPress={() => setShowMorePayModes(true)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="contactless-payment"
                  size={16}
                  color={
                    selectedPayMode === "FLASH PAY" ? "#ffffff" : "#38bdf8"
                  }
                  style={styles.posBtnIcon}
                />
                <Text
                  style={[
                    styles.posBtnTitle,
                    selectedPayMode === "FLASH PAY" && styles.posBtnTitleActive,
                  ]}
                >
                  FLASH
                </Text>
              </TouchableOpacity>
            </View>

            {/* 2. Modern Net Total to Pay Hero Card */}
            <TouchableOpacity
              style={[
                styles.netTotalBox,
                {
                  backgroundColor: currentTheme.primary,
                  borderColor: currentTheme.accent || currentTheme.primary,
                },
              ]}
              onPress={handleCheckout}
              activeOpacity={0.92}
            >
              {/* Header Badges */}
              <View style={styles.netTotalHeaderRow}>
                <View style={styles.netTotalKeyPill}>
                  <Text style={styles.netTotalKeyPillText}>F4 CHECKOUT</Text>
                </View>
                <View style={styles.netTotalModePill}>
                  <MaterialCommunityIcons
                    name={
                      selectedPayMode === "CASH"
                        ? "cash"
                        : selectedPayMode === "NETS"
                          ? "credit-card"
                          : selectedPayMode === "PAYNOW"
                            ? "qrcode"
                            : "wallet-outline"
                    }
                    size={12}
                    color="#86efac"
                  />
                  <Text style={styles.netTotalModePillText}>
                    {selectedPayMode}
                  </Text>
                </View>
              </View>

              {/* Big Hero Amount */}
              <View style={styles.netTotalNumberRow}>
                <Text style={styles.netTotalCurrencySymbol}>$</Text>
                <Text style={styles.netTotalBigAmount}>
                  {grandTotal.toFixed(2)}
                </Text>
              </View>

              {/* Digital Register Tender & Balance Bar */}
              <View style={styles.tenderBalanceRow}>
                <View style={styles.tenderCol}>
                  <Text style={styles.tenderColLabel}>TENDERED</Text>
                  <Text style={styles.tenderColVal}>
                    ${parseFloat(numpadValue || tenderAmount || "0").toFixed(2)}
                  </Text>
                </View>

                <View style={styles.tenderDivider} />

                <View style={styles.tenderCol}>
                  <Text style={styles.tenderColLabel}>
                    {currentTender >= grandTotal ? "CHANGE DUE" : "BALANCE"}
                  </Text>
                  <Text
                    style={[
                      styles.tenderColVal,
                      currentTender >= grandTotal
                        ? styles.balanceColValGreen
                        : styles.balanceColValRed,
                    ]}
                  >
                    ${balance.toFixed(2)}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* 3. 4x4 Numeric Keypad */}
            <View style={styles.numpadGrid}>
              {/* Row 1 */}
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpadKey("1")}
              >
                <Text style={styles.numKeyText}>1</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpadKey("2")}
              >
                <Text style={styles.numKeyText}>2</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpadKey("3")}
              >
                <Text style={styles.numKeyText}>3</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.numKey, styles.numKeySpecial]}
                onPress={() => handleNumpadKey("-")}
              >
                <Text style={styles.numKeyText}>-</Text>
              </TouchableOpacity>

              {/* Row 2 */}
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpadKey("4")}
              >
                <Text style={styles.numKeyText}>4</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpadKey("5")}
              >
                <Text style={styles.numKeyText}>5</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpadKey("6")}
              >
                <Text style={styles.numKeyText}>6</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.numKey, styles.numKeySpecial]}
                onPress={() => handleNumpadKey("+")}
              >
                <Text style={styles.numKeyText}>+</Text>
              </TouchableOpacity>

              {/* Row 3 */}
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpadKey("7")}
              >
                <Text style={styles.numKeyText}>7</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpadKey("8")}
              >
                <Text style={styles.numKeyText}>8</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpadKey("9")}
              >
                <Text style={styles.numKeyText}>9</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpadKey("0")}
              >
                <Text style={styles.numKeyText}>0</Text>
              </TouchableOpacity>

              {/* Row 4 */}
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpadKey("00")}
              >
                <Text style={styles.numKeyText}>00</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpadKey("*")}
              >
                <Text style={styles.numKeyText}>*</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.numKey}
                onPress={() => handleNumpadKey(".")}
              >
                <Text style={styles.numKeyText}>.</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.numKey,
                  styles.enterKey,
                  {
                    backgroundColor: currentTheme.primary,
                    borderColor: currentTheme.primary,
                  },
                ]}
                onPress={() => handleNumpadKey("ENTER")}
              >
                <MaterialCommunityIcons
                  name="keyboard-return"
                  size={20}
                  color="#ffffff"
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ---------------- RIGHT PANEL: Vertical Category Rail + 3x3 Touch Grid ---------------- */}
        <View style={styles.rightPanel}>
          {/* Vertical Category Rail (No scrolling, touch Up/Down buttons) */}
          <View style={styles.categoryRailContainer}>
            {/* Up / Previous Button for Item Groups */}
            <TouchableOpacity
              style={[
                styles.railArrowBtn,
                groupPageIndex === 0 && styles.railArrowBtnDisabled,
              ]}
              disabled={groupPageIndex === 0}
              onPress={() => setGroupPageIndex((prev) => Math.max(0, prev - 1))}
              activeOpacity={0.7}
            >
              <View style={styles.railArrowContent}>
                <MaterialCommunityIcons
                  name="chevron-up"
                  size={22}
                  color={groupPageIndex === 0 ? "#cbd5e1" : currentTheme.primary}
                />
              </View>
            </TouchableOpacity>

            <View
              style={styles.railListContainer}
              onLayout={(e) => {
                const { height } = e.nativeEvent.layout;
                if (height > 0 && Math.abs(height - railHeight) > 2) {
                  setRailHeight(height);
                }
              }}
              // @ts-ignore - Web mousewheel support for easy desktop pagination
              onWheel={(e: any) => {
                if (e?.deltaY > 0) {
                  setGroupPageIndex((prev) =>
                    Math.min(totalGroupPages - 1, prev + 1),
                  );
                } else if (e?.deltaY < 0) {
                  setGroupPageIndex((prev) => Math.max(0, prev - 1));
                }
              }}
            >
              {loadingGroups ? (
                <ActivityIndicator
                  color={currentTheme.primary}
                  size="small"
                  style={{ marginTop: 20 }}
                />
              ) : (
                visibleGroups.map((group, idx) => {
                  const isSelected =
                    selectedGroup.toUpperCase() ===
                    group.GroupCode.toUpperCase();
                  const iconName = getCategoryIcon(group.GroupCode);
                  const isLast = idx === visibleGroups.length - 1;

                  return (
                    <TouchableOpacity
                      key={group.GroupCode}
                      style={[
                        styles.catRailBtn,
                        {
                          height: CAT_BTN_HEIGHT,
                          marginBottom: isLast ? 0 : CAT_GAP,
                        },
                        isSelected && [
                          styles.catRailBtnActive,
                          {
                            backgroundColor: currentTheme.primary,
                            borderColor: currentTheme.primary,
                          },
                        ],
                      ]}
                      onPress={() => handleSelectGroup(group.GroupCode)}
                      activeOpacity={0.85}
                    >
                      <MaterialCommunityIcons
                        name={iconName}
                        size={18}
                        color={isSelected ? "#ffffff" : "#475569"}
                        style={{ marginBottom: 2 }}
                      />
                      <Text
                        style={[
                          styles.catRailText,
                          isSelected && styles.catRailTextActive,
                        ]}
                        numberOfLines={2}
                      >
                        {group.GroupCode}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            {/* Down / Next Button for Item Groups */}
            <TouchableOpacity
              style={[
                styles.railArrowBtn,
                groupPageIndex >= totalGroupPages - 1 &&
                  styles.railArrowBtnDisabled,
              ]}
              disabled={groupPageIndex >= totalGroupPages - 1}
              onPress={() =>
                setGroupPageIndex((prev) =>
                  Math.min(totalGroupPages - 1, prev + 1),
                )
              }
              activeOpacity={0.7}
            >
              <View style={styles.railArrowContent}>
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={22}
                  color={
                    groupPageIndex >= totalGroupPages - 1
                      ? "#cbd5e1"
                      : currentTheme.primary
                  }
                />
                {totalGroupPages > 1 && (
                  <Text
                    style={[
                      styles.railArrowPageText,
                      {
                        color:
                          groupPageIndex >= totalGroupPages - 1
                            ? "#94a3b8"
                            : currentTheme.primary,
                      },
                    ]}
                  >
                    {groupPageIndex + 1}/{totalGroupPages}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          </View>

          {/* Touch Item Tiles Grid (3x3 Grid, No scrolling, touch Up/Down buttons) */}
          <View style={styles.touchCatalogGrid}>
            {loadingItems ? (
              <View style={styles.centerLoadingBox}>
                <ActivityIndicator color="#155d36" size="large" />
                <Text style={styles.loadingCatalogText}>
                  Loading {selectedGroup} items...
                </Text>
              </View>
            ) : filteredProducts.length === 0 ? (
              <View style={styles.centerEmptyBox}>
                <MaterialCommunityIcons
                  name="package-variant"
                  size={38}
                  color="#94a3b8"
                />
                <Text style={styles.emptyCatalogTitle}>
                  No items configured
                </Text>
                <Text style={styles.emptyCatalogSubtitle}>
                  No products found in group "{selectedGroup}"
                </Text>
              </View>
            ) : (
              <View style={styles.catalogItemsWrapper}>
                {/* 3x3 Grid (Exactly 9 tiles, no scrolling) */}
                <View style={styles.touchTilesContainer}>
                  {visibleProducts.map((prod) => {
                    const iconName = getCategoryIcon(prod.GroupCode);

                    return (
                      <TouchableOpacity
                        key={prod.InventoryCode}
                        style={styles.touchTile}
                        onPress={() => handleAddItem(prod)}
                        activeOpacity={0.85}
                      >
                        {/* Image Box - Controlled by EnableImageforTouchPad setting */}
                        {isEnabled("EnableImageforTouchPad") && (
                          <View style={styles.touchTilePlaceholder}>
                            {!imageErrorCodes.current.has(prod.InventoryCode) ? (
                              <Image
                                source={{ uri: `${API_URL}/api/inventory/image/${encodeURIComponent(prod.InventoryCode.trim())}` }}
                                style={{ width: "100%", height: "100%", borderRadius: 6 }}
                                resizeMode="contain"
                                onError={() => {
                                  imageErrorCodes.current.add(prod.InventoryCode);
                                  setImageErrorTick((t) => t + 1); // trigger re-render to show icon
                                }}
                              />
                            ) : (
                              <MaterialCommunityIcons
                                name={iconName}
                                size={22}
                                color="#64748b"
                              />
                            )}
                          </View>
                        )}

                        {/* Product Name (2 Lines for Full Readability) */}
                        <Text style={styles.touchTileTitle} numberOfLines={2}>
                          {prod.Description}
                        </Text>

                        {/* Price Row */}
                        <View style={styles.touchTileBottomRow}>
                          <Text
                            style={[
                              styles.touchTilePrice,
                              { color: currentTheme.primary },
                            ]}
                          >
                            ${prod.SellingPrice.toFixed(2)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Bottom Pagination Bar: Up Arrow & Down Arrow buttons */}
                <View style={styles.itemNavDock}>
                  <TouchableOpacity
                    style={[
                      styles.itemNavArrowBtn,
                      itemPageIndex === 0
                        ? styles.itemNavArrowBtnDisabled
                        : { backgroundColor: currentTheme.primary },
                    ]}
                    disabled={itemPageIndex === 0}
                    onPress={() =>
                      setItemPageIndex((prev) => Math.max(0, prev - 1))
                    }
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons
                      name="arrow-up-bold"
                      size={18}
                      color={itemPageIndex === 0 ? "#94a3b8" : "#ffffff"}
                    />
                    <Text
                      style={[
                        styles.itemNavBtnText,
                        itemPageIndex === 0 && styles.itemNavBtnTextDisabled,
                      ]}
                    >
                      UP
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.itemNavPageBadge}>
                    <Text style={styles.itemNavPageText}>
                      PAGE {itemPageIndex + 1} / {totalItemPages}
                    </Text>
                    <Text style={styles.itemNavCountText}>
                      ({filteredProducts.length} Items)
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.itemNavArrowBtn,
                      itemPageIndex >= totalItemPages - 1
                        ? styles.itemNavArrowBtnDisabled
                        : { backgroundColor: currentTheme.primary },
                    ]}
                    disabled={itemPageIndex >= totalItemPages - 1}
                    onPress={() =>
                      setItemPageIndex((prev) =>
                        Math.min(totalItemPages - 1, prev + 1),
                      )
                    }
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons
                      name="arrow-down-bold"
                      size={18}
                      color={
                        itemPageIndex >= totalItemPages - 1
                          ? "#94a3b8"
                          : "#ffffff"
                      }
                    />
                    <Text
                      style={[
                        styles.itemNavBtnText,
                        itemPageIndex >= totalItemPages - 1 &&
                          styles.itemNavBtnTextDisabled,
                      ]}
                    >
                      DOWN
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* =========================================================================
          MODAL: Price Check / Search Modal
      ========================================================================= */}
      <Modal
        visible={showPriceCheckModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPriceCheckModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Price Check & Search</Text>
              <TouchableOpacity onPress={() => setShowPriceCheckModal(false)}>
                <MaterialCommunityIcons
                  name="close"
                  size={20}
                  color="#475569"
                />
              </TouchableOpacity>
            </View>

            <View style={styles.modalInputRow}>
              <TextInput
                style={styles.modalTextInput}
                placeholder="Enter SKU Code or Item Name..."
                placeholderTextColor="#94a3b8"
                value={priceCheckQuery}
                onChangeText={(text) => {
                  setPriceCheckQuery(text);
                  const found = items.find(
                    (it) =>
                      it.InventoryCode.toLowerCase() ===
                        text.trim().toLowerCase() ||
                      it.Description.toLowerCase().includes(
                        text.trim().toLowerCase(),
                      ),
                  );
                  setPriceCheckResult(found || null);
                }}
              />
            </View>

            {priceCheckResult ? (
              <View style={styles.priceResultBox}>
                <Text style={styles.priceResultName}>
                  {priceCheckResult.Description}
                </Text>
                <Text style={styles.priceResultCode}>
                  Code: {priceCheckResult.InventoryCode} • UOM:{" "}
                  {priceCheckResult.UOM}
                </Text>
                <Text style={styles.priceResultAmount}>
                  Selling Price: ${priceCheckResult.SellingPrice.toFixed(2)}
                </Text>
                <TouchableOpacity
                  style={styles.modalAddBtn}
                  onPress={() => {
                    handleAddItem(priceCheckResult);
                    setShowPriceCheckModal(false);
                    setPriceCheckQuery("");
                    setPriceCheckResult(null);
                  }}
                >
                  <Text style={styles.modalAddBtnText}>Add To Cart</Text>
                </TouchableOpacity>
              </View>
            ) : priceCheckQuery ? (
              <Text style={styles.noResultText}>No matching item found.</Text>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          MODAL: Price Change Modal
      ========================================================================= */}
      <Modal
        visible={showPriceChangeModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPriceChangeModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Price Change Override</Text>
              <TouchableOpacity onPress={() => setShowPriceChangeModal(false)}>
                <MaterialCommunityIcons
                  name="close"
                  size={20}
                  color="#475569"
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.overrideSubtitle}>
              Item: {activeItem.name} (Current: ${activeItem.price.toFixed(2)})
            </Text>

            <TextInput
              style={styles.modalTextInput}
              placeholder="Enter new price (e.g. 1.25)..."
              placeholderTextColor="#94a3b8"
              keyboardType="numeric"
              value={overridePrice}
              onChangeText={setOverridePrice}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalSecondaryBtn}
                onPress={() => setShowPriceChangeModal(false)}
              >
                <Text style={styles.modalSecondaryBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalPrimaryBtn}
                onPress={handleApplyPriceChange}
              >
                <Text style={styles.modalPrimaryBtnText}>Apply Price</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          MODAL: Checkout Receipt Confirmation
      ========================================================================= */}
      <Modal
        visible={showReceiptModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowReceiptModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 440 }]}>
            <View style={styles.receiptHeader}>
              <MaterialCommunityIcons
                name="check-circle"
                size={48}
                color="#155d36"
              />
              <Text style={styles.receiptTitle}>Payment Completed</Text>
              <Text style={styles.receiptMode}>
                Paid via {receiptSummary?.payMode || "CASH"}
              </Text>
            </View>

            <View style={styles.receiptDetails}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptRowLabel}>Net Total</Text>
                <Text style={styles.receiptRowVal}>
                  ${receiptSummary?.total.toFixed(2)}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptRowLabel}>Tender Amount</Text>
                <Text style={styles.receiptRowVal}>
                  ${receiptSummary?.tender.toFixed(2)}
                </Text>
              </View>
              <View style={[styles.receiptRow, { borderBottomWidth: 0 }]}>
                <Text style={[styles.receiptRowLabel, { fontWeight: "700" }]}>
                  Balance Due
                </Text>
                <Text
                  style={[
                    styles.receiptRowVal,
                    { color: "#dc2626", fontWeight: "700" },
                  ]}
                >
                  ${receiptSummary?.balance.toFixed(2)}
                </Text>
              </View>
            </View>

            <View style={styles.modalBtnRow}>
              {/* Controlled by PrintReceipt setting (App.config PrintReceipt = 1) */}
              {isEnabled("PrintReceipt") && (
                <TouchableOpacity
                  style={styles.modalSecondaryBtn}
                  onPress={() => {
                    const printer = config.ReceiptPrinter || "RECEIPT PRINTER";
                    const tpl = config.ReceiptTemplate || "Template2";
                    const store = config.CompanyName || "SUPERMART";
                    if (Platform.OS === "web") {
                      window.alert(
                        `🖨️ [${printer}] Spooling receipt to thermal printer using [${tpl}] for ${store}...`,
                      );
                    } else {
                      Alert.alert(
                        "Printing Receipt",
                        `Spooling receipt to ${printer} using ${tpl}...`,
                      );
                    }
                    handleFinishSale();
                  }}
                >
                  <MaterialCommunityIcons
                    name="printer"
                    size={18}
                    color="#334155"
                  />
                  <Text style={styles.modalSecondaryBtnText}>
                    Print ({config.ReceiptTemplate || "Tpl2"})
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.modalPrimaryBtn}
                onPress={handleFinishSale}
              >
                <Text style={styles.modalPrimaryBtnText}>Next Sale (F4)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          MODAL: All PayModes
      ========================================================================= */}
      <Modal
        visible={showMorePayModes}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMorePayModes(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 500 }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Select Payment Mode</Text>
              <TouchableOpacity onPress={() => setShowMorePayModes(false)}>
                <MaterialCommunityIcons
                  name="close"
                  size={20}
                  color="#475569"
                />
              </TouchableOpacity>
            </View>

            <View style={styles.payModesGridModal}>
              {payModes.map((pm) => (
                <TouchableOpacity
                  key={pm.PayMode}
                  style={[
                    styles.payModeModalBtn,
                    selectedPayMode.toUpperCase() ===
                      pm.PayMode.toUpperCase() && styles.payModeModalBtnActive,
                  ]}
                  onPress={() => {
                    setSelectedPayMode(pm.PayMode);
                    setShowMorePayModes(false);
                  }}
                >
                  <Text style={styles.payModeModalTitle}>{pm.PayMode}</Text>
                  <Text style={styles.payModeModalDesc}>{pm.Description}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          MODAL: License Expired Alert
      ========================================================================= */}
      <Modal
        visible={showLicenseModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLicenseModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                maxWidth: 440,
                alignItems: "center",
                paddingVertical: 28,
                paddingHorizontal: 24,
              },
            ]}
          >
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: "#fee2e2",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <MaterialCommunityIcons
                name="alert-octagon"
                size={34}
                color="#dc2626"
              />
            </View>

            <Text
              style={{
                fontSize: 18,
                fontWeight: "800",
                color: "#991b1b",
                fontFamily: FONT_FAMILY,
                marginBottom: 8,
              }}
            >
              License Expired
            </Text>

            <Text
              style={{
                fontSize: 13,
                color: "#475569",
                textAlign: "center",
                lineHeight: 20,
                fontFamily: FONT_FAMILY,
                marginBottom: 16,
                paddingHorizontal: 8,
              }}
            >
              Your software license has expired. You cannot add items to the
              bill.
            </Text>

            <TouchableOpacity
              onPress={() => Linking.openURL("https://uniprosg.com")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#eff6ff",
                borderWidth: 1,
                borderColor: "#bfdbfe",
                borderRadius: 8,
                paddingVertical: 10,
                paddingHorizontal: 16,
                marginBottom: 20,
                gap: 6,
              }}
            >
              <MaterialCommunityIcons name="web" size={18} color="#2563eb" />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: "#1d4ed8",
                  textDecorationLine: "underline",
                  fontFamily: FONT_FAMILY,
                }}
              >
                Please contact https://uniprosg.com
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                width: "100%",
                height: 42,
                backgroundColor: "#dc2626",
                borderRadius: 8,
                justifyContent: "center",
                alignItems: "center",
              }}
              onPress={() => setShowLicenseModal(false)}
            >
              <Text
                style={{
                  color: "#ffffff",
                  fontWeight: "700",
                  fontSize: 13,
                  fontFamily: FONT_FAMILY,
                }}
              >
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Theme & Typography Customizer Modal */}
      <ThemeModal
        visible={showThemeModal}
        onClose={() => setShowThemeModal(false)}
        currentTheme={currentTheme}
        currentFont={currentFont}
        onSelectTheme={handleSelectTheme}
        onSelectFont={handleSelectFont}
      />

      {/* App Configuration Management Modal */}
      <Modal
        visible={showConfigModal}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setShowConfigModal(false)}
      >
        <AppConfigScreen onClose={() => setShowConfigModal(false)} />
      </Modal>
    </View>
  );
}

// ==============================================================================
// STYLESHEET: Modern Enterprise Retail POS Theme
// ==============================================================================

const styles = StyleSheet.create({
  posThemeBtn: {
    flexDirection: "row",
    alignItems: "center",
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 6,
    gap: 4,
  },
  posThemeBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  screen: {
    flex: 1,
    backgroundColor: "#f4f6f8",
    padding: 6,
    fontFamily: FONT_FAMILY,
    ...(Platform.OS === "web"
      ? {
          height: "100vh",
          userSelect: "none",
        }
      : {}),
  },

  // ---------------------------------------------------------------------------
  // 1. TOP BAR
  // ---------------------------------------------------------------------------
  topBar: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 8,
    marginBottom: 6,
    gap: 6,
  },

  // Top Banner for Live Expired License
  posLicenseExpiredBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#b91c1c",
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginBottom: 6,
    gap: 8,
  },
  posLicenseExpiredText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 12,
    fontFamily: FONT_FAMILY,
  },
  posLicenseExpiredLink: {
    color: "#fef08a",
    fontWeight: "800",
    fontSize: 12,
    textDecorationLine: "underline",
    fontFamily: FONT_FAMILY,
  },

  // Top Banner for 30-Day Advance Expiry Warning
  posLicenseWarningBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fefce8",
    borderWidth: 1,
    borderColor: "#fde047",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 6,
    gap: 8,
  },
  posLicenseWarningText: {
    color: "#854d0e",
    fontWeight: "700",
    fontSize: 12,
    fontFamily: FONT_FAMILY,
  },
  posLicenseWarningLink: {
    color: "#1d4ed8",
    fontWeight: "800",
    fontSize: 12,
    textDecorationLine: "underline",
    fontFamily: FONT_FAMILY,
  },
  brandBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#155d36",
    borderRadius: 6,
    paddingHorizontal: 8,
    height: 34,
    gap: 4,
  },
  brandBadgeText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 13,
    fontFamily: FONT_FAMILY,
  },
  stockBox: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    paddingHorizontal: 8,
    height: 34,
    justifyContent: "center",
  },
  stockLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    fontFamily: FONT_FAMILY,
  },
  activeBannerBox: {
    flex: 1.5,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 6,
    height: 34,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  activeBannerText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#155d36",
    fontFamily: FONT_FAMILY,
  },
  mathCalcBox: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    height: 34,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  mathCalcText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
    fontFamily: FONT_MONO,
  },
  qtyBtnPlus: {
    width: 36,
    height: 34,
    borderRadius: 6,
    backgroundColor: "#155d36",
    justifyContent: "center",
    alignItems: "center",
  },
  qtyBtnMinus: {
    width: 36,
    height: 34,
    borderRadius: 6,
    backgroundColor: "#dc2626",
    justifyContent: "center",
    alignItems: "center",
  },
  priceCheckBtn: {
    backgroundColor: "#f59e0b",
    borderRadius: 6,
    paddingHorizontal: 8,
    height: 34,
    justifyContent: "center",
    alignItems: "center",
  },
  priceCheckText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 12,
  },
  keyboardToggleBtn: {
    width: 36,
    height: 34,
    borderRadius: 6,
    backgroundColor: "#0284c7",
    justifyContent: "center",
    alignItems: "center",
  },
  stationBadge: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    paddingHorizontal: 8,
    height: 34,
    justifyContent: "center",
  },
  stationBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
    fontFamily: FONT_FAMILY,
  },
  logoutBtn: {
    width: 36,
    height: 34,
    borderRadius: 6,
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
  },

  // ---------------------------------------------------------------------------
  // 2. SEARCH & SKU BAR
  // ---------------------------------------------------------------------------
  skuBar: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 8,
    marginBottom: 6,
    gap: 6,
  },
  skuCodeBox: {
    width: 140,
    height: 32,
    backgroundColor: "#f8fafc",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 8,
    justifyContent: "center",
  },
  skuDescBox: {
    flex: 1,
    height: 32,
    backgroundColor: "#f8fafc",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 8,
    justifyContent: "center",
  },
  skuInput: {
    fontSize: 13,
    color: "#0f172a",
    fontFamily: FONT_FAMILY,
    outlineStyle: "none" as any,
  },
  pillInputBox: {
    width: 50,
    height: 32,
    backgroundColor: "#fef2f2",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fecaca",
    justifyContent: "center",
    alignItems: "center",
  },
  pillInput: {
    fontSize: 13,
    fontWeight: "700",
    color: "#dc2626",
    textAlign: "center",
    outlineStyle: "none" as any,
  },
  tagPillBlue: {
    backgroundColor: "#e0f2fe",
    borderWidth: 1,
    borderColor: "#bae6fd",
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  tagPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0369a1",
  },
  tagPillDark: {
    backgroundColor: "#334155",
    borderRadius: 6,
    paddingHorizontal: 12,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  tagPillDarkText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
  },

  // ---------------------------------------------------------------------------
  // 3. MAIN WORKSPACE
  // ---------------------------------------------------------------------------
  workspace: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
  },

  // ---------------------------------------------------------------------------
  // 4. LEFT PANEL (Cart Table + Control Block)
  // ---------------------------------------------------------------------------
  leftPanel: {
    flex: 1.85, // Dominant space for Cart Grid & controls (Barcode-first POS)
    flexDirection: "column",
    gap: 6,
  },
  tableCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  thCell: {
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
    fontFamily: FONT_FAMILY,
  },
  tableBodyScroll: {
    flex: 1,
    ...(Platform.OS === "web"
      ? {
          scrollbarWidth: "none" as any,
          msOverflowStyle: "none" as any,
        }
      : {}),
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },

  // Row Color Bands matching Image 2
  rowDefault: {
    backgroundColor: "#ffffff",
  },
  rowAlt: {
    backgroundColor: "#fafafa",
  },
  rowBandPink: {
    backgroundColor: "#fdf2f8", // light pink tint
  },
  rowBandPeach: {
    backgroundColor: "#fff7ed", // light peach tint
  },
  rowBandCyan: {
    backgroundColor: "#f0fdfa", // light cyan tint
  },
  rowSelectedActive: {
    backgroundColor: "#fef9c3", // bright yellow active highlight
    borderLeftWidth: 4,
    borderLeftColor: "#ca8a04",
  },

  tdCell: {
    fontSize: 13,
    color: "#0f172a",
    fontFamily: FONT_FAMILY,
  },
  tdSelectedText: {
    color: "#b91c1c", // High contrast red text for active row
    fontWeight: "800",
  },
  tdCode: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: FONT_MONO,
  },
  tdDescription: {
    fontSize: 13,
    fontWeight: "700",
    paddingRight: 8,
  },
  tdQty: {
    fontSize: 13,
    fontWeight: "700",
  },
  tdPrice: {
    fontSize: 13,
    fontWeight: "600",
  },
  tdDisc: {
    fontSize: 13,
    color: "#64748b",
  },
  tdAmount: {
    fontSize: 13,
    fontWeight: "700",
  },
  tdGst: {
    fontSize: 12,
    color: "#94a3b8",
  },
  emptyTableState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 50,
  },
  emptyTableTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#475569",
    marginTop: 8,
  },
  emptyTableSubtitle: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 2,
  },

  // Table Footer Strip (Total, Tot Qty, Disc, SubTotal, Tax, RoundOff)
  footerSummaryStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
  },
  summaryChip: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 1,
    elevation: 1,
  },
  summaryChipLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748b",
    letterSpacing: 0.5,
    fontFamily: FONT_FAMILY,
  },
  summaryChipVal: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0f172a",
    fontFamily: FONT_MONO,
    marginTop: 1,
  },
  summaryCell: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
    fontFamily: FONT_FAMILY,
  },
  summaryVal: {
    fontWeight: "800",
    color: "#0f172a",
    fontFamily: FONT_MONO,
  },

  // ---------------------------------------------------------------------------
  // 5. LOWER CONTROL BLOCK (12 Actions + Net Total to Pay + Numpad)
  // ---------------------------------------------------------------------------
  lowerControlBlock: {
    flexDirection: "row",
    height: 195,
    gap: 6,
  },

  // 12 Actions Grid (4 rows x 3 columns)
  actionGrid: {
    flex: 1.3,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  posBtn: {
    width: "31.8%",
    height: 44,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  posBtnIcon: {
    marginBottom: 2,
  },
  posBtnTitle: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#ffffff",
    textAlign: "center",
    fontFamily: FONT_FAMILY,
    lineHeight: 12,
    letterSpacing: 0.2,
  },
  posBtnTitleActive: {
    color: "#ffffff",
  },
  posKeyBadge: {
    position: "absolute",
    top: 3,
    right: 4,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  posKeyBadgeText: {
    fontSize: 7.5,
    fontWeight: "800",
    color: "rgba(255, 255, 255, 0.95)",
    fontFamily: FONT_MONO,
  },
  btnHold: {
    backgroundColor: "#0f766e", // Modern Deep Teal
  },
  btnDelete: {
    backgroundColor: "#dc2626", // Modern Red
  },
  btnPayMode: {
    backgroundColor: "#1e293b", // Deep slate for inactive payment modes
    borderColor: "#334155",
  },
  btnPayModeActive: {
    backgroundColor: "#155d36", // Rich GreenMart brand green when active
    borderColor: "#4ade80",
    borderWidth: 2,
    shadowColor: "#155d36",
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  btnRelease: {
    backgroundColor: "#334155", // Slate
  },
  btnClear: {
    backgroundColor: "#ea580c", // Modern Orange
  },
  btnViewBill: {
    backgroundColor: "#6366f1", // Modern Indigo
  },
  btnSearch: {
    backgroundColor: "#0284c7", // Modern Blue
  },
  btnExit: {
    backgroundColor: "#991b1b", // Dark Crimson
  },
  btnPriceChange: {
    backgroundColor: "#059669", // Modern Emerald
  },

  // Net Total to Pay Hero Display
  netTotalBox: {
    flex: 1.5,
    backgroundColor: "#0e4a2a", // Deep luxury forest green
    borderRadius: 10,
    padding: 10,
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#166534",
    shadowColor: "#052e16",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  netTotalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  netTotalKeyPill: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  netTotalKeyPillText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    letterSpacing: 0.5,
  },
  netTotalModePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(134, 239, 172, 0.4)",
  },
  netTotalModePillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#86efac",
    fontFamily: FONT_MONO,
    letterSpacing: 0.5,
  },
  netTotalNumberRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    marginVertical: 2,
    gap: 2,
  },
  netTotalCurrencySymbol: {
    fontSize: 22,
    fontWeight: "700",
    color: "rgba(255, 255, 255, 0.7)",
    fontFamily: FONT_FAMILY,
    marginRight: 2,
  },
  netTotalBigAmount: {
    fontSize: 40,
    fontWeight: "900",
    color: "#ffffff",
    fontFamily: FONT_MONO,
    letterSpacing: -1,
  },
  tenderBalanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  tenderCol: {
    flex: 1,
    alignItems: "center",
  },
  tenderDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#cbd5e1",
    marginHorizontal: 4,
  },
  tenderColLabel: {
    fontSize: 8.5,
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 0.5,
    fontFamily: FONT_FAMILY,
  },
  tenderColVal: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    fontFamily: FONT_MONO,
    marginTop: 1,
  },
  balanceColValGreen: {
    fontSize: 14,
    fontWeight: "800",
    color: "#15803d",
    fontFamily: FONT_MONO,
    marginTop: 1,
  },
  balanceColValRed: {
    fontSize: 14,
    fontWeight: "800",
    color: "#dc2626",
    fontFamily: FONT_MONO,
    marginTop: 1,
  },

  // 4x4 Numpad
  numpadGrid: {
    flex: 1.2,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  numKey: {
    width: "23%",
    height: 42,
    backgroundColor: "#ffffff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    justifyContent: "center",
    alignItems: "center",
  },
  numKeySpecial: {
    backgroundColor: "#f1f5f9",
  },
  enterKey: {
    backgroundColor: "#155d36",
    borderColor: "#155d36",
  },
  numKeyText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    fontFamily: FONT_FAMILY,
  },

  // ---------------------------------------------------------------------------
  // 6. RIGHT PANEL: Vertical Category Rail + 4-Column Touch Grid
  // ---------------------------------------------------------------------------
  rightPanel: {
    flex: 0.95, // Compact right side with comfortable 3x3 layout
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },

  // Category Rail (GreenMart theme: rich green active card, clean white inactive, Up/Down navigation)
  categoryRailContainer: {
    width: 110,
    backgroundColor: "#f8fafc",
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
    padding: 5,
    flexDirection: "column",
    justifyContent: "space-between",
    overflow: "hidden",
  },
  railArrowBtn: {
    height: 34,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  railArrowBtnDisabled: {
    backgroundColor: "#f1f5f9",
    borderColor: "#e2e8f0",
  },
  railArrowContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  railArrowPageText: {
    fontSize: 9.5,
    fontWeight: "800",
    fontFamily: FONT_FAMILY,
  },
  railListContainer: {
    flex: 1,
    justifyContent: "flex-start",
    marginTop: 6,
    marginBottom: 8,
    overflow: "hidden",
  },
  catRailBtn: {
    height: 50,
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRadius: 8,
    marginBottom: 5,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  catRailBtnActive: {
    backgroundColor: "#155d36", // Rich GreenMart forest green
    borderColor: "#155d36",
    shadowColor: "#155d36",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  catRailText: {
    fontSize: 9.5,
    fontWeight: "700",
    color: "#334155",
    textAlign: "center",
    fontFamily: FONT_FAMILY,
    lineHeight: 12,
  },
  catRailTextActive: {
    color: "#ffffff",
    fontWeight: "800",
  },

  // Touch Catalog Tiles (3x3 Grid with comfortable item space, no scrolling, Up/Down navigation)
  touchCatalogGrid: {
    flex: 1,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  catalogItemsWrapper: {
    flex: 1,
    justifyContent: "space-between",
    padding: 6,
  },
  touchTilesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  touchTile: {
    width: "31.4%", // Exactly 3 columns (3x3 layout)
    height: 110, // Comfortable higher card for full 2-line item descriptions & larger image
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 1,
    elevation: 1,
  },
  touchTilePlaceholder: {
    width: "100%",
    height: 54,
    borderRadius: 6,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  touchTileTitle: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
    fontFamily: FONT_FAMILY,
    width: "100%",
    marginTop: 2,
    lineHeight: 14,
    minHeight: 28, // Guarantees 2-line vertical space for clean alignment
  },
  touchTileBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingBottom: 2,
  },
  touchTilePrice: {
    fontSize: 12,
    fontWeight: "800",
    color: "#155d36",
    fontFamily: FONT_MONO,
    textAlign: "center",
  },

  // Item Navigation Dock (Up & Down Arrow Buttons)
  itemNavDock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 4,
    marginTop: 4,
    gap: 8,
  },
  itemNavArrowBtn: {
    flex: 1,
    height: 38,
    backgroundColor: "#155d36",
    borderRadius: 6,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  itemNavArrowBtnDisabled: {
    backgroundColor: "#e2e8f0",
    shadowOpacity: 0,
    elevation: 0,
  },
  itemNavBtnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 12,
    fontFamily: FONT_FAMILY,
    letterSpacing: 0.5,
  },
  itemNavBtnTextDisabled: {
    color: "#94a3b8",
  },
  itemNavPageBadge: {
    alignItems: "center",
    paddingHorizontal: 8,
  },
  itemNavPageText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0f172a",
    fontFamily: FONT_FAMILY,
  },
  itemNavCountText: {
    fontSize: 9.5,
    color: "#64748b",
    fontFamily: FONT_FAMILY,
  },
  centerLoadingBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingCatalogText: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 6,
  },
  centerEmptyBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyCatalogTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
    marginTop: 6,
  },
  emptyCatalogSubtitle: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 2,
  },

  // ---------------------------------------------------------------------------
  // 7. MODAL STYLES
  // ---------------------------------------------------------------------------
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    fontFamily: FONT_FAMILY,
  },
  modalInputRow: {
    marginTop: 12,
  },
  modalTextInput: {
    height: 42,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 10,
    fontSize: 13,
    color: "#0f172a",
    marginTop: 10,
    outlineStyle: "none" as any,
  },
  priceResultBox: {
    marginTop: 12,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 8,
    padding: 12,
  },
  priceResultName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#155d36",
  },
  priceResultCode: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  priceResultAmount: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 6,
  },
  modalAddBtn: {
    marginTop: 10,
    backgroundColor: "#155d36",
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: "center",
  },
  modalAddBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 12,
  },
  noResultText: {
    color: "#dc2626",
    fontSize: 12,
    marginTop: 10,
    textAlign: "center",
  },
  overrideSubtitle: {
    fontSize: 12,
    color: "#475569",
    marginTop: 8,
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  modalSecondaryBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
  },
  modalSecondaryBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  modalPrimaryBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#155d36",
    justifyContent: "center",
    alignItems: "center",
  },
  modalPrimaryBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
  receiptHeader: {
    alignItems: "center",
    paddingVertical: 10,
  },
  receiptTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 6,
  },
  receiptMode: {
    fontSize: 12,
    color: "#64748b",
  },
  receiptDetails: {
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    marginVertical: 12,
  },
  receiptRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  receiptRowLabel: {
    fontSize: 13,
    color: "#475569",
  },
  receiptRowVal: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
    fontFamily: FONT_MONO,
  },
  payModesGridModal: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  payModeModalBtn: {
    width: "48%",
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 10,
    alignItems: "center",
  },
  payModeModalBtnActive: {
    borderColor: "#155d36",
    backgroundColor: "#f0fdf4",
  },
  payModeModalTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
  },
  payModeModalDesc: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
    textAlign: "center",
  },
});
