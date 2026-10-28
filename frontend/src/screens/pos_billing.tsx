import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Platform,
  Image,
} from 'react-native';

// Categories matching the reference UI left-side category rail
interface Category {
  id: string;
  name: string;
  icon: string;
  bg: string;
  count?: number;
}

const CATEGORIES: Category[] = [
  { id: 'misc', name: 'MISC', icon: '⊞', bg: '#4d695b' },
  { id: 'hot_drinks', name: 'HOT\nDRINKS', icon: '☕', bg: '#c72e27' },
  { id: 'cold_drink', name: 'COLD\nDRINK', icon: '🥤', bg: '#177bb3' },
  { id: 'snacks', name: 'SNACKS', icon: '🍟', bg: '#f49d25' },
  { id: 'sweets', name: 'SWEETS', icon: '🍰', bg: '#c43a7a' },
  { id: 'veg1', name: 'VEGETABL\nES 1', icon: '🥬', bg: '#237a3b' },
  { id: 'veg2', name: 'VEGETABL\nES 2', icon: '🥦', bg: '#237a3b' },
  { id: 'veg3', name: 'VEGETABL\nE 3', icon: '🥕', bg: '#1d899f' },
  { id: 'fruits', name: 'FRUITS\nElectronics', icon: '🍎', bg: '#d8296a' },
  { id: 'soaps', name: 'Soaps\nDetergent', icon: '🧴', bg: '#764ba2' },
  { id: 'unsca', name: 'UNSCA\nITEM3', icon: '📦', bg: '#82563b' },
  { id: 'rice', name: 'RICE ATTA', icon: '🌾', bg: '#e27b2b' },
  { id: 'others', name: 'OTHERS', icon: '💬', bg: '#5e6871' },
  { id: 'non_veg', name: 'NON VEG', icon: '🍗', bg: '#54463a' },
];

// Product Item interface
interface ProductItem {
  id: string;
  code: string;
  name: string;
  category: string;
  price: number;
  image?: string;
  avatarBg?: string;
  isHot?: boolean;
}

// Sample catalog based exactly on the image products
const SAMPLE_PRODUCTS: ProductItem[] = [
  { id: '1', code: 'TEA01', name: 'MINI TEA', category: 'hot_drinks', price: 0.80, avatarBg: '#ffedd5' },
  { id: '2', code: 'COF01', name: 'MINI COFFEE', category: 'hot_drinks', price: 1.00, avatarBg: '#fef3c7' },
  { id: '3', code: 'GIN01', name: 'GINGER TEA', category: 'hot_drinks', price: 1.00, avatarBg: '#ecfccb' },
  { id: '4', code: 'ELA01', name: 'ELACHI TEA', category: 'hot_drinks', price: 1.00, avatarBg: '#ffedd5' },
  { id: '5', code: 'MAS01', name: 'MASALATEA', category: 'hot_drinks', price: 1.00, avatarBg: '#fed7aa' },
  { id: '6', code: 'MIL01', name: 'FRESH MILK', category: 'hot_drinks', price: 1.00, avatarBg: '#f1f5f9' },
  { id: '7', code: 'TAK01', name: 'TEA-TAKE\nAWAY', category: 'hot_drinks', price: 1.30, avatarBg: '#fee2e2' },
  { id: '8', code: 'TAK02', name: 'COFFEE\nTAKE AWAY', category: 'hot_drinks', price: 1.30, avatarBg: '#ffedd5' },
  { id: '9', code: 'TAK03', name: 'GINGER TEA\nTAKE', category: 'hot_drinks', price: 1.30, avatarBg: '#fef9c3' },
  { id: '10', code: 'TAK04', name: 'ELACHI TEA\nTAKE', category: 'hot_drinks', price: 1.30, avatarBg: '#fef08a' },
  { id: '11', code: 'TAK05', name: 'MASALATEA\nTAKE', category: 'hot_drinks', price: 1.30, avatarBg: '#fed7aa' },
  { id: '12', code: 'BIG01', name: 'TEA- BIG\nCUP', category: 'hot_drinks', price: 1.20, avatarBg: '#f3e8ff' },
  { id: '13', code: 'BIG02', name: 'COFFEE BIG\nCUP', category: 'hot_drinks', price: 1.50, avatarBg: '#ffedd5' },
  { id: '14', code: 'GIN02', name: 'GINGER TEA\n- BI', category: 'hot_drinks', price: 1.40, avatarBg: '#fef08a' },
  { id: '15', code: 'ELA02', name: 'ELACHI TEA\n- BI', category: 'hot_drinks', price: 1.40, avatarBg: '#fde68a' },
  { id: '16', code: 'MAS02', name: 'MASALATEA\n- BI', category: 'hot_drinks', price: 1.50, avatarBg: '#fed7aa' },
  { id: '17', code: 'BST01', name: 'BOOST', category: 'hot_drinks', price: 1.50, avatarBg: '#fee2e2' },
  { id: '18', code: 'HOR01', name: 'HORLICKS', category: 'hot_drinks', price: 1.50, avatarBg: '#e0f2fe' },
  { id: '19', code: 'MAL01', name: 'MALTOVA', category: 'hot_drinks', price: 1.80, avatarBg: '#ffedd5' },
  { id: '20', code: 'BRN01', name: 'BOURNVITA', category: 'hot_drinks', price: 1.50, avatarBg: '#fae8ff' },
  { id: '21', code: 'RSM01', name: 'ROSE MILK', category: 'cold_drink', price: 1.50, avatarBg: '#fce7f3' },
  { id: '22', code: 'FML02', name: 'FRESH MILK\n- BI', category: 'hot_drinks', price: 1.50, avatarBg: '#f8fafc' },
  { id: '23', code: 'SKU01', name: 'SUKKU\nCOFFEE', category: 'hot_drinks', price: 1.30, avatarBg: '#fed7aa' },
  { id: '24', code: 'SKU02', name: 'SUKKU\nCOFFEE -', category: 'hot_drinks', price: 1.50, avatarBg: '#ffedd5' },
  { id: '25', code: 'EGG01', name: 'EGG PUPS', category: 'snacks', price: 1.50, avatarBg: '#fef3c7' },
  { id: '26', code: 'SAM01', name: 'SAMOSA', category: 'snacks', price: 1.00, avatarBg: '#fed7aa' },
  { id: '27', code: 'VAD01', name: 'MEDU VADA', category: 'snacks', price: 0.80, avatarBg: '#ffedd5' },
  { id: '28', code: 'JAL01', name: 'JALEBI', category: 'sweets', price: 2.00, avatarBg: '#fed7aa' },
];

// Bill Item in table
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

export default function PosBillingScreen({ onLogout, cashierName, terminalCode }: PosBillingProps) {
  const [selectedCategory, setSelectedCategory] = useState('hot_drinks');
  const [cart, setCart] = useState<CartItem[]>([
    // Start with empty or sample row like Egg Pups
  ]);
  const [activeItem, setActiveItem] = useState<{ name: string; qty: number; price: number; stock: number }>({
    name: 'EGG PUPS',
    qty: -1,
    price: 1.50,
    stock: 0,
  });

  const [skuCode, setSkuCode] = useState('');
  const [skuDesc, setSkuDesc] = useState('');
  const [tenderAmount, setTenderAmount] = useState('2.00');
  const [numpadValue, setNumpadValue] = useState('');

  // Add product to cart
  const handleAddProduct = (prod: ProductItem) => {
    setActiveItem({
      name: prod.name.replace('\n', ' '),
      qty: 1,
      price: prod.price,
      stock: 25,
    });

    setCart((prev) => {
      const existing = prev.find((item) => item.code === prod.code);
      if (existing) {
        return prev.map((item) =>
          item.code === prod.code
            ? {
                ...item,
                qty: item.qty + 1,
                amount: parseFloat(((item.qty + 1) * item.price - item.disc).toFixed(2)),
              }
            : item
        );
      } else {
        const newItem: CartItem = {
          id: Date.now().toString(),
          code: prod.code,
          description: prod.name.replace('\n', ' '),
          qty: 1,
          price: prod.price,
          disc: 0.0,
          amount: prod.price,
        };
        return [...prev, newItem];
      }
    });
  };

  // Adjust active item qty
  const handleQtyChange = (delta: number) => {
    setActiveItem((prev) => {
      const nextQty = prev.qty + delta;
      return { ...prev, qty: nextQty };
    });
  };

  // Numpad key press
  const handleNumpad = (val: string) => {
    if (val === 'ENTER') {
      if (numpadValue) {
        setTenderAmount(numpadValue);
        setNumpadValue('');
      }
      return;
    }
    if (val === 'C') {
      setNumpadValue('');
      return;
    }
    setNumpadValue((prev) => prev + val);
  };

  // Totals calculations
  const totalQty = cart.reduce((acc, curr) => acc + curr.qty, 0);
  const subTotal = cart.reduce((acc, curr) => acc + curr.amount, 0);
  const discount = cart.reduce((acc, curr) => acc + curr.disc, 0);
  const tax = 0.0;
  const roundOff = 0.0;
  const netTotal = Math.max(0, subTotal);
  const tender = parseFloat(tenderAmount) || 0.0;
  const balance = Math.max(0, tender - netTotal);

  // Filter products by selected category
  const filteredProducts = SAMPLE_PRODUCTS.filter(
    (p) => selectedCategory === 'misc' || p.category === selectedCategory
  );

  return (
    <View style={styles.screen}>
      {/* =========================================================================
          TOP BAR: Brand, Stock Status, Selected Item, Quick Qty, Buttons
      ========================================================================= */}
      <View style={styles.topHeader}>
        {/* Logo / Brand Icon */}
        <View style={styles.logoBadge}>
          <Text style={styles.logoSymbol}>❖</Text>
        </View>

        {/* Stock info */}
        <View style={styles.stockBox}>
          <Text style={styles.stockLabel}>Stock : {activeItem.stock}</Text>
        </View>

        {/* Item Name */}
        <View style={styles.activeNameBox}>
          <Text style={styles.activeItemName}>{activeItem.name}</Text>
        </View>

        {/* Math Calculation: -1 x 1.50 -1.50 */}
        <View style={styles.calcBox}>
          <Text style={styles.calcText}>
            {activeItem.qty} x   {activeItem.price.toFixed(2)}   {(activeItem.qty * activeItem.price).toFixed(2)}
          </Text>
        </View>

        {/* Plus / Minus Quick Buttons */}
        <TouchableOpacity style={styles.qtyPlusBtn} onPress={() => handleQtyChange(1)}>
          <Text style={styles.qtyBtnText}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.qtyMinusBtn} onPress={() => handleQtyChange(-1)}>
          <Text style={styles.qtyBtnText}>-</Text>
        </TouchableOpacity>

        {/* Price Check Button */}
        <TouchableOpacity style={styles.priceCheckBtn}>
          <Text style={styles.priceCheckText}>Price{'\n'}Check</Text>
        </TouchableOpacity>

        {/* Cash Drawer / Radio Icon */}
        <TouchableOpacity style={styles.iconSquareBtn}>
          <Text style={styles.topIconText}>📻</Text>
        </TouchableOpacity>

        {/* Hamburger Menu */}
        <TouchableOpacity style={styles.iconSquareBtn}>
          <Text style={styles.topIconText}>☰</Text>
        </TouchableOpacity>
      </View>

      {/* =========================================================================
          INPUT BAR: SKU Cod, Description, Fast Qty, JD, JD, Round, TG
      ========================================================================= */}
      <View style={styles.inputBar}>
        <View style={styles.skuCodBox}>
          <TextInput
            placeholder="SKU Cod"
            placeholderTextColor="#8a7967"
            style={styles.inputField}
            value={skuCode}
            onChangeText={setSkuCode}
          />
        </View>
        <View style={styles.descBox}>
          <TextInput
            placeholder="Description"
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
          MAIN BODY: LEFT TABLE + NUMPAD/ACTIONS, RIGHT CATEGORIES + PRODUCTS
      ========================================================================= */}
      <View style={styles.mainContent}>
        {/* ---------------- LEFT PANEL: Table & Payment Controls ---------------- */}
        <View style={styles.leftPanel}>
          {/* Grid Table */}
          <View style={styles.tableContainer}>
            {/* Table Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.thCell, { width: 65 }]}>Code</Text>
              <Text style={[styles.thCell, { flex: 1 }]}>Description</Text>
              <Text style={[styles.thCell, { width: 55, textAlign: 'center' }]}>Qty</Text>
              <Text style={[styles.thCell, { width: 65, textAlign: 'right' }]}>Price</Text>
              <Text style={[styles.thCell, { width: 55, textAlign: 'right' }]}>Disc</Text>
              <Text style={[styles.thCell, { width: 75, textAlign: 'right', paddingRight: 8 }]}>Amount</Text>
            </View>

            {/* Table Rows (Zebra striped cream/tan) */}
            <ScrollView style={styles.tableBody}>
              {cart.length === 0 ? (
                // Fill empty lines for authentic POS screen look
                Array.from({ length: 8 }).map((_, idx) => (
                  <View
                    key={idx}
                    style={[styles.tableRow, idx % 2 === 1 ? styles.rowEven : styles.rowOdd]}
                  >
                    <Text style={[styles.tdCell, { width: 65 }]}></Text>
                    <Text style={[styles.tdCell, { flex: 1 }]}></Text>
                    <Text style={[styles.tdCell, { width: 55 }]}></Text>
                    <Text style={[styles.tdCell, { width: 65 }]}></Text>
                    <Text style={[styles.tdCell, { width: 55 }]}></Text>
                    <Text style={[styles.tdCell, { width: 75 }]}></Text>
                  </View>
                ))
              ) : (
                cart.map((item, idx) => (
                  <View
                    key={item.id}
                    style={[styles.tableRow, idx % 2 === 1 ? styles.rowEven : styles.rowOdd]}
                  >
                    <Text style={[styles.tdCell, { width: 65 }]}>{item.code}</Text>
                    <Text style={[styles.tdCell, { flex: 1, fontWeight: '600' }]}>{item.description}</Text>
                    <Text style={[styles.tdCell, { width: 55, textAlign: 'center' }]}>{item.qty}</Text>
                    <Text style={[styles.tdCell, { width: 65, textAlign: 'right' }]}>{item.price.toFixed(2)}</Text>
                    <Text style={[styles.tdCell, { width: 55, textAlign: 'right' }]}>{item.disc.toFixed(2)}</Text>
                    <Text style={[styles.tdCell, { width: 75, textAlign: 'right', paddingRight: 8 }]}>
                      {item.amount.toFixed(2)}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

            {/* Table Bottom Totals Strip */}
            <View style={styles.tableFooterStrip}>
              <Text style={styles.footerSummaryText}>
                Total <Text style={styles.footerVal}>{subTotal.toFixed(2)}</Text>
              </Text>
              <Text style={styles.footerSummaryText}>
                Tot Qty <Text style={styles.footerVal}>{totalQty.toFixed(2)}</Text>
              </Text>
              <Text style={styles.footerSummaryText}>
                Disc <Text style={styles.footerVal}>{discount.toFixed(2)}</Text>
              </Text>
              <Text style={styles.footerSummaryText}>
                SubTotal <Text style={styles.footerVal}>{subTotal.toFixed(2)}</Text>
              </Text>
              <Text style={styles.footerSummaryText}>
                Tax <Text style={styles.footerVal}>0.0000</Text>
              </Text>
              <Text style={styles.footerSummaryText}>
                RoundOF <Text style={styles.footerVal}>0.00</Text>
              </Text>
            </View>
          </View>

          {/* Lower POS Control Block: 3 sub-sections */}
          <View style={styles.lowerControlBlock}>
            {/* 1. Quick Function Keys (Hold, Delete, Cash, Nets, Search, Paynow, Flash Pay) */}
            <View style={styles.posActionGrid}>
              {/* Row 1 */}
              <TouchableOpacity style={[styles.posBtn, { backgroundColor: '#2ba84a' }]}>
                <Text style={styles.posBtnIcon}>💵</Text>
                <Text style={styles.posBtnText}>Hold</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.posBtn, { backgroundColor: '#ea4335' }]}>
                <Text style={styles.posBtnIcon}>🗑</Text>
                <Text style={styles.posBtnText}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.posBtn, { backgroundColor: '#f4b400' }]}>
                <Text style={styles.posBtnIcon}>💵</Text>
                <Text style={styles.posBtnText}>CASH</Text>
              </TouchableOpacity>

              {/* Row 2 */}
              <TouchableOpacity style={[styles.posBtn, { backgroundColor: '#926c58' }]}>
                <Text style={styles.posBtnSubtitle}>F7</Text>
                <Text style={styles.posBtnText}>Release</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.posBtn, { backgroundColor: '#ff9800' }]}>
                <Text style={styles.posBtnSubtitle}>F2</Text>
                <Text style={styles.posBtnText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.posBtn, { backgroundColor: '#1976d2' }]}>
                <Text style={styles.posBtnTextBig}>NETS</Text>
              </TouchableOpacity>

              {/* Row 3 */}
              <TouchableOpacity style={[styles.posBtn, { backgroundColor: '#e91e63' }]}>
                <Text style={styles.posBtnIcon}>📄</Text>
                <Text style={styles.posBtnTextSmall}>View Bill</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.posBtn, { backgroundColor: '#3f51b5' }]}>
                <Text style={styles.posBtnIcon}>🔍</Text>
                <Text style={styles.posBtnTextSmall}>Search</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.posBtn, { backgroundColor: '#00bcd4' }]}>
                <Text style={styles.posBtnTextSmall}>PAYNOW</Text>
              </TouchableOpacity>

              {/* Row 4 */}
              <TouchableOpacity
                style={[styles.posBtn, { backgroundColor: '#d32f2f' }]}
                onPress={onLogout}
              >
                <Text style={styles.posBtnSubtitle}>F10</Text>
                <Text style={styles.posBtnText}>Exit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.posBtn, { backgroundColor: '#607d8b' }]}>
                <Text style={styles.posBtnIcon}>⚙</Text>
                <Text style={styles.posBtnTextSmall}>Price{'\n'}Change</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.posBtn, { backgroundColor: '#0097a7' }]}>
                <Text style={styles.posBtnTextSmall}>FLASH{'\n'}PAY</Text>
              </TouchableOpacity>
            </View>

            {/* 2. Total Display & Tender */}
            <View style={styles.totalDisplayBox}>
              <View style={styles.totalHeaderRow}>
                <Text style={styles.totalLabel}>Net Total to Pay (F4)</Text>
              </View>
              <View style={styles.totalBigNumberRow}>
                <Text style={styles.totalBigNumber}>{netTotal.toFixed(2)}</Text>
              </View>

              <View style={styles.tenderBalanceRow}>
                <View style={styles.tenderCol}>
                  <Text style={styles.tenderLabel}>Tender</Text>
                  <Text style={styles.tenderValueGreen}>{tender.toFixed(2)}</Text>
                </View>
                <View style={styles.tenderCol}>
                  <Text style={styles.tenderLabel}>Balance</Text>
                  <Text style={styles.balanceValueRed}>{balance.toFixed(2)}</Text>
                </View>
              </View>
            </View>

            {/* 3. Numeric Keypad */}
            <View style={styles.numpadGrid}>
              {/* Row 1 */}
              <TouchableOpacity style={styles.numKey} onPress={() => handleNumpad('1')}>
                <Text style={styles.numKeyText}>1</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.numKey} onPress={() => handleNumpad('2')}>
                <Text style={styles.numKeyText}>2</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.numKey} onPress={() => handleNumpad('3')}>
                <Text style={styles.numKeyText}>3</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.numKey, styles.numKeySpecial]} onPress={() => handleNumpad('-')}>
                <Text style={styles.numKeyText}>-</Text>
              </TouchableOpacity>

              {/* Row 2 */}
              <TouchableOpacity style={styles.numKey} onPress={() => handleNumpad('4')}>
                <Text style={styles.numKeyText}>4</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.numKey} onPress={() => handleNumpad('5')}>
                <Text style={styles.numKeyText}>5</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.numKey} onPress={() => handleNumpad('6')}>
                <Text style={styles.numKeyText}>6</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.numKey, styles.numKeySpecial]} onPress={() => handleNumpad('+')}>
                <Text style={styles.numKeyText}>+</Text>
              </TouchableOpacity>

              {/* Row 3 */}
              <TouchableOpacity style={styles.numKey} onPress={() => handleNumpad('7')}>
                <Text style={styles.numKeyText}>7</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.numKey} onPress={() => handleNumpad('8')}>
                <Text style={styles.numKeyText}>8</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.numKey} onPress={() => handleNumpad('9')}>
                <Text style={styles.numKeyText}>9</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.numKey, styles.enterKey]}
                onPress={() => handleNumpad('ENTER')}
              >
                <Text style={styles.enterKeyText}>↵</Text>
              </TouchableOpacity>

              {/* Row 4 */}
              <TouchableOpacity style={styles.numKey} onPress={() => handleNumpad('0')}>
                <Text style={styles.numKeyText}>0</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.numKey} onPress={() => handleNumpad('00')}>
                <Text style={styles.numKeyText}>00</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.numKey} onPress={() => handleNumpad('.')}>
                <Text style={styles.numKeyText}>.</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ---------------- RIGHT PANEL: Category Sidebar + Product Grid ---------------- */}
        <View style={styles.rightPanel}>
          {/* Vertical Category Rail */}
          <ScrollView
            style={styles.categoryRail}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 2 }}
          >
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryBtn,
                    { backgroundColor: cat.bg },
                    isSelected && styles.categoryBtnActive,
                  ]}
                  onPress={() => setSelectedCategory(cat.id)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.catIcon}>{cat.icon}</Text>
                  <Text style={styles.catLabel}>{cat.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Product Items Grid (4 columns exactly like image) */}
          <ScrollView style={styles.productsScroll} contentContainerStyle={styles.productsGrid}>
            {filteredProducts.map((prod) => (
              <View key={prod.id} style={styles.productCard}>
                {/* Visual Avatar / Photo Thumbnail */}
                <View style={[styles.productThumb, { backgroundColor: prod.avatarBg || '#fef3c7' }]}>
                  <Text style={styles.productEmoji}>
                    {prod.category === 'hot_drinks'
                      ? '☕'
                      : prod.category === 'cold_drink'
                      ? '🥛'
                      : prod.category === 'snacks'
                      ? '🥐'
                      : '🧁'}
                  </Text>
                </View>

                {/* Product Name */}
                <Text style={styles.productName} numberOfLines={2}>
                  {prod.name}
                </Text>

                {/* Bottom Row: Price and Quick (+) Button */}
                <View style={styles.productCardBottom}>
                  <Text style={styles.productPrice}>${prod.price.toFixed(2)}</Text>
                  <TouchableOpacity
                    style={styles.productAddBtn}
                    onPress={() => handleAddProduct(prod)}
                  >
                    <Text style={styles.productAddPlus}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    padding: 4,
    ...(Platform.OS === 'web'
      ? {
          height: '100vh',
          userSelect: 'none',
        }
      : {}),
  },

  // ---------------------------------------------------------------------------
  // TOP BAR
  // ---------------------------------------------------------------------------
  topHeader: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffdf9',
    borderRadius: 6,
    paddingHorizontal: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#e5ded1',
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#4a2e18',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  logoSymbol: {
    color: '#f8d7b3',
    fontSize: 20,
    fontWeight: 'bold',
  },
  stockBox: {
    paddingHorizontal: 8,
    marginRight: 16,
  },
  stockLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#222',
  },
  activeNameBox: {
    marginRight: 20,
  },
  activeItemName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#7b1e18',
    letterSpacing: 0.5,
  },
  calcBox: {
    flex: 1,
    paddingHorizontal: 12,
  },
  calcText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#222',
    letterSpacing: 0.5,
  },
  qtyPlusBtn: {
    width: 44,
    height: 36,
    backgroundColor: '#4cae4f',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  qtyMinusBtn: {
    width: 44,
    height: 36,
    backgroundColor: '#e53935',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  qtyBtnText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    lineHeight: 24,
  },
  priceCheckBtn: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  priceCheckText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 13,
  },
  iconSquareBtn: {
    width: 38,
    height: 36,
    backgroundColor: '#5d4037',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  topIconText: {
    color: '#fff',
    fontSize: 16,
  },

  // ---------------------------------------------------------------------------
  // INPUT SEARCH BAR
  // ---------------------------------------------------------------------------
  inputBar: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffcf7',
    borderRadius: 4,
    paddingHorizontal: 4,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#e8e0d4',
  },
  skuCodBox: {
    width: 90,
    height: 28,
    borderWidth: 1,
    borderColor: '#d1c7b8',
    borderRadius: 4,
    backgroundColor: '#fff',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginRight: 4,
  },
  descBox: {
    flex: 1,
    height: 28,
    borderWidth: 1,
    borderColor: '#d1c7b8',
    borderRadius: 4,
    backgroundColor: '#fff',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginRight: 8,
  },
  inputField: {
    fontSize: 13,
    color: '#333',
    padding: 0,
  },
  pillInputRed: {
    minWidth: 32,
    height: 26,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e57373',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginRight: 4,
  },
  pillRedText: {
    color: '#d32f2f',
    fontWeight: 'bold',
    fontSize: 12,
  },
  pillTagBlue: {
    backgroundColor: '#1976d2',
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  pillTagText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  pillTagDark: {
    backgroundColor: '#37474f',
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillTagDarkText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },

  // ---------------------------------------------------------------------------
  // MAIN CONTENT AREA
  // ---------------------------------------------------------------------------
  mainContent: {
    flex: 1,
    flexDirection: 'row',
  },

  // LEFT PANEL
  leftPanel: {
    flex: 6,
    marginRight: 4,
    display: 'flex',
    flexDirection: 'column',
  },

  // TABLE STYLES
  tableContainer: {
    flex: 1,
    backgroundColor: '#fbf7ee',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ded4c3',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#3d6c46', // Classic olive green header from screenshot
    height: 32,
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  thCell: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  tableBody: {
    flex: 1,
  },
  tableRow: {
    flexDirection: 'row',
    height: 30,
    alignItems: 'center',
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#ede4d4',
  },
  rowOdd: {
    backgroundColor: '#fffdf8',
  },
  rowEven: {
    backgroundColor: '#f7f1e3',
  },
  tdCell: {
    fontSize: 12,
    color: '#2c251f',
  },
  tableFooterStrip: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f4ede0',
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: '#dfd5c4',
  },
  footerSummaryText: {
    fontSize: 11,
    color: '#443b33',
    fontWeight: 'bold',
  },
  footerVal: {
    color: '#111',
    fontWeight: '900',
  },

  // LOWER CONTROL BLOCK
  lowerControlBlock: {
    height: 220,
    flexDirection: 'row',
    marginTop: 4,
  },

  // 1. POS FUNCTION BUTTONS
  posActionGrid: {
    width: 210,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignContent: 'space-between',
    marginRight: 4,
  },
  posBtn: {
    width: '31%',
    height: 50,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    padding: 2,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  posBtnIcon: {
    fontSize: 15,
    color: '#fff',
  },
  posBtnSubtitle: {
    color: '#ffffffcc',
    fontSize: 10,
    fontWeight: '700',
  },
  posBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  posBtnTextBig: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  posBtnTextSmall: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },

  // 2. TOTAL DISPLAY
  totalDisplayBox: {
    flex: 1,
    backgroundColor: '#fde5b9', // Golden yellow box from screenshot
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e8c98e',
    padding: 8,
    marginRight: 4,
    justifyContent: 'space-between',
  },
  totalHeaderRow: {
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#3a2717',
  },
  totalBigNumberRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  totalBigNumber: {
    fontSize: 48,
    fontWeight: '900',
    color: '#281a0e',
    letterSpacing: -1,
  },
  tenderBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#ffffffdd',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e8d9c2',
  },
  tenderCol: {
    alignItems: 'flex-start',
  },
  tenderLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#555',
  },
  tenderValueGreen: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1b8a36',
  },
  balanceValueRed: {
    fontSize: 20,
    fontWeight: '900',
    color: '#d32f2f',
  },

  // 3. NUMPAD
  numpadGrid: {
    width: 190,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignContent: 'space-between',
  },
  numKey: {
    width: '23%',
    height: 50,
    backgroundColor: '#eee6d8',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#d8ccb9',
  },
  numKeySpecial: {
    backgroundColor: '#dfd2c0',
  },
  numKeyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#33271d',
  },
  enterKey: {
    backgroundColor: '#523a28',
    height: 104,
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: '23%',
  },
  enterKeyText: {
    fontSize: 26,
    color: '#ffffff',
    fontWeight: 'bold',
  },

  // ---------------------------------------------------------------------------
  // RIGHT PANEL: CATEGORY RAIL + PRODUCT TILES
  // ---------------------------------------------------------------------------
  rightPanel: {
    flex: 5.5,
    flexDirection: 'row',
    backgroundColor: '#fcf8f0',
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5ded1',
  },

  // Category sidebar
  categoryRail: {
    width: 86,
    backgroundColor: '#272522',
  },
  categoryBtn: {
    width: 80,
    height: 60,
    marginVertical: 2,
    marginHorizontal: 3,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  categoryBtnActive: {
    borderWidth: 2,
    borderColor: '#ffffff',
    transform: [{ scale: 1.02 }],
  },
  catIcon: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 2,
  },
  catLabel: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 11,
  },

  // Products grid
  productsScroll: {
    flex: 1,
    backgroundColor: '#fbf6ec',
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 4,
    justifyContent: 'flex-start',
  },
  productCard: {
    width: '23.8%',
    height: 132,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    margin: '0.6%',
    padding: 4,
    borderWidth: 1,
    borderColor: '#ded5c5',
    justifyContent: 'space-between',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  productThumb: {
    width: '100%',
    height: 64,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productEmoji: {
    fontSize: 32,
  },
  productName: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#2a1e17',
    textAlign: 'left',
    marginTop: 2,
    lineHeight: 12,
  },
  productCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  productPrice: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1a1816',
  },
  productAddBtn: {
    width: 24,
    height: 24,
    backgroundColor: '#388e3c',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productAddPlus: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 18,
  },
});
