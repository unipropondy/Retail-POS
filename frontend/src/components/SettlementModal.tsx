// ==============================================================================
// File: SettlementModal.tsx
// Description: POS Settlement Dialog matching frmSettlement.vb, clsSales.vb, and
//              frmPos.vb current database architecture and workflows.
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getBackendBaseUrl } from '../config/appConfig';

const API_BASE_URL = getBackendBaseUrl();

interface DenominationItem {
  currencyValue: number;
  qty: number;
  amount: number;
}

interface PayModeItem {
  payMode: string;
  computerAmount: number;
  manualAmount: number;
  difference: number;
}

interface CreditSalesItem {
  payMode: string;
  amount: number;
}

interface SettlementModalProps {
  visible: boolean;
  onClose: () => void;
  terminalCode: string;
  locationCode?: string;
  currentUserId?: string;
  onSettlementSaved?: () => void;
}

export const SettlementModal: React.FC<SettlementModalProps> = ({
  visible,
  onClose,
  terminalCode,
  locationCode = 'HQ',
  currentUserId = 'AMITH',
  onSettlementSaved
}) => {
  // Step 1: Cashier Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [cashierId, setCashierId] = useState<string>(currentUserId);
  const [password, setPassword] = useState<string>('');
  const [shiftNo, setShiftNo] = useState<string>('1');
  const [authError, setAuthError] = useState<string>('');
  const [authActiveField, setAuthActiveField] = useState<'cashierId' | 'password' | 'shiftNo'>('password');
  const [showAuthKeypad, setShowAuthKeypad] = useState<boolean>(true);

  // Step 2: Settlement Data State
  const [loading, setLoading] = useState<boolean>(false);
  const [isExistingSettlement, setIsExistingSettlement] = useState<boolean>(false);
  const [showCompTotal, setShowCompTotal] = useState<boolean>(true);
  const [tillAmount, setTillAmount] = useState<number>(0);
  const [denominations, setDenominations] = useState<DenominationItem[]>([]);
  const [payModes, setPayModes] = useState<PayModeItem[]>([]);
  const [creditSales, setCreditSales] = useState<CreditSalesItem[]>([]);
  const [expenseTotal, setExpenseTotal] = useState<number>(0);

  // Active Tab/View
  const [activeTab, setActiveTab] = useState<'settlement' | 'creditSales' | 'summary'>('settlement');
  const [summaryData, setSummaryData] = useState<any>(null);
  const [saving, setSaving] = useState<boolean>(false);

  // Touch Keypad State for fast tactile denomination entry
  const [activeInputType, setActiveInputType] = useState<'denom' | 'paymode' | null>('denom');
  const [activeInputIndex, setActiveInputIndex] = useState<number>(0);
  const [showTouchKeypad, setShowTouchKeypad] = useState<boolean>(true);

  // Custom In-App Modal Dialog States
  const [confirmDialog, setConfirmDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const [feedbackAlert, setFeedbackAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({ visible: false, title: '', message: '', type: 'info' });

  // Handle Touch Numpad press
  const handleKeypadPress = (val: string) => {
    if (activeInputType === 'denom' && activeInputIndex >= 0) {
      const current = denominations[activeInputIndex]?.qty || 0;
      let newStr = String(current === 0 ? '' : current);

      if (val === 'CLR') {
        newStr = '0';
      } else if (val === 'DEL') {
        newStr = newStr.slice(0, -1) || '0';
      } else if (val === 'ENTER') {
        if (activeInputIndex < denominations.length - 1) {
          setActiveInputIndex(activeInputIndex + 1);
        }
        return;
      } else if (val === '+' || val === '-') {
        const delta = val === '+' ? 1 : -1;
        newStr = String(Math.max(0, current + delta));
      } else {
        newStr = `${newStr}${val}`;
      }
      handleQtyChange(activeInputIndex, newStr);
    } else if (activeInputType === 'paymode' && activeInputIndex >= 0) {
      const current = payModes[activeInputIndex]?.manualAmount || 0;
      let newStr = String(current === 0 ? '' : current);

      if (val === 'CLR') {
        newStr = '0';
      } else if (val === 'DEL') {
        newStr = newStr.slice(0, -1) || '0';
      } else if (val === 'ENTER') {
        if (activeInputIndex < payModes.length - 1) {
          setActiveInputIndex(activeInputIndex + 1);
        }
        return;
      } else {
        if (val === '.' && newStr.includes('.')) return;
        newStr = `${newStr}${val}`;
      }
      handlePayModeManualChange(activeInputIndex, newStr);
    }
  };

  // Handle Touch Numpad press for Cashier Authorization
  const handleAuthKeypadPress = (val: string) => {
    if (authActiveField === 'shiftNo') {
      if (val === 'CLR') {
        setShiftNo('');
      } else if (val === 'DEL') {
        setShiftNo((prev) => prev.slice(0, -1));
      } else if (val === 'ENTER') {
        handleCashierLogin();
      } else {
        setShiftNo((prev) => `${prev}${val}`);
      }
    } else if (authActiveField === 'password') {
      if (val === 'CLR') {
        setPassword('');
      } else if (val === 'DEL') {
        setPassword((prev) => prev.slice(0, -1));
      } else if (val === 'ENTER') {
        if (!shiftNo) {
          setAuthActiveField('shiftNo');
        } else {
          handleCashierLogin();
        }
      } else {
        setPassword((prev) => `${prev}${val}`);
      }
    } else if (authActiveField === 'cashierId') {
      if (val === 'CLR') {
        setCashierId('');
      } else if (val === 'DEL') {
        setCashierId((prev) => prev.slice(0, -1));
      } else if (val === 'ENTER') {
        setAuthActiveField('password');
      } else {
        setCashierId((prev) => `${prev}${val}`);
      }
    }
  };

  // Focus and auth reset when opened
  useEffect(() => {
    if (visible) {
      setCashierId(currentUserId || 'AMITH');
      setPassword('');
      setShiftNo('1');
      setIsAuthenticated(false);
      setAuthActiveField('password');
      setAuthError('');
      setShowAuthKeypad(true);
      setShowTouchKeypad(true);
      setActiveInputType('denom');
      setActiveInputIndex(0);
      setSummaryData(null);
      setActiveTab('settlement');
    }
  }, [visible, currentUserId]);

  // Load Settlement Details after Cashier Login
  const handleCashierLogin = async () => {
    if (!cashierId.trim()) {
      setAuthError('Please enter Cashier ID.');
      return;
    }
    setLoading(true);
    setAuthError('');

    try {
      // 1. Validate Cashier
      const authRes = await fetch(`${API_BASE_URL}/api/settlement/validate-cashier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cashierId: cashierId.trim(),
          password: password.trim(),
          terminalCode: terminalCode || '1'
        })
      });

      const authData = await authRes.json();
      if (!authRes.ok || !authData.success) {
        setAuthError(authData.message || 'Invalid Cashier ID or Password.');
        setLoading(false);
        return;
      }

      setIsAuthenticated(true);
      setShowCompTotal(authData.terminalSettings?.showCompTotal ?? true);
      setTillAmount(authData.terminalSettings?.tillAmount || 0);

      // 2. Fetch Initial Settlement Data
      await loadSettlementData(shiftNo.trim() || '1');
    } catch (err: any) {
      setAuthError(err.message || 'Error connecting to server.');
    } finally {
      setLoading(false);
    }
  };

  const loadSettlementData = async (shift: string) => {
    setLoading(true);
    try {
      const url = `${API_BASE_URL}/api/settlement/init?terminalCode=${encodeURIComponent(
        terminalCode || '1'
      )}&locationCode=${encodeURIComponent(locationCode)}&shiftNo=${encodeURIComponent(shift)}`;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || !data.success) {
        Alert.alert('Settlement Notice', data.message || 'Failed to load settlement.');
        setLoading(false);
        return;
      }

      setIsExistingSettlement(data.isExistingSettlement);
      setExpenseTotal(data.expenseTotal || 0);

      // Denominations
      const denoms: DenominationItem[] = (data.denominations || []).map((d: any) => ({
        currencyValue: Number(d.currencyValue) || 0,
        qty: Number(d.qty) || 0,
        amount: Number(d.amount) || (Number(d.qty || 0) * Number(d.currencyValue || 0))
      }));
      setDenominations(denoms);

      // Calculate initial cash manual total from denominations
      const totalCashFromDenoms = denoms.reduce((acc, curr) => acc + curr.amount, 0);

      // Pay Modes
      const pms: PayModeItem[] = (data.payModes || []).map((pm: any) => {
        const isCash = String(pm.payMode).trim().toUpperCase() === 'CASH';
        const manualAmt = isCash && !data.isExistingSettlement ? totalCashFromDenoms : Number(pm.manualAmount || 0);
        const compAmt = Number(pm.computerAmount || 0);
        return {
          payMode: pm.payMode,
          computerAmount: compAmt,
          manualAmount: manualAmt,
          difference: parseFloat((manualAmt - compAmt).toFixed(2))
        };
      });
      setPayModes(pms);

      // Credit sales if any
      if (Array.isArray(data.creditSales)) {
        setCreditSales(data.creditSales);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load settlement details.');
    } finally {
      setLoading(false);
    }
  };

  // Update Denomination Qty
  const handleQtyChange = (index: number, text: string) => {
    const qty = parseInt(text, 10) || 0;
    const updated = [...denominations];
    const val = updated[index].currencyValue;
    updated[index] = {
      ...updated[index],
      qty: Math.max(0, qty),
      amount: parseFloat((Math.max(0, qty) * val).toFixed(2))
    };
    setDenominations(updated);

    // Recompute total cash and update CASH row in paymodes
    const newCashTotal = updated.reduce((acc, curr) => acc + curr.amount, 0);
    setPayModes(prev =>
      prev.map(pm => {
        if (pm.payMode.trim().toUpperCase() === 'CASH') {
          return {
            ...pm,
            manualAmount: parseFloat(newCashTotal.toFixed(2)),
            difference: parseFloat((newCashTotal - pm.computerAmount).toFixed(2))
          };
        }
        return pm;
      })
    );
  };

  // Update Non-Cash Manual Amount
  const handlePayModeManualChange = (index: number, text: string) => {
    const manualAmt = parseFloat(text) || 0;
    const updated = [...payModes];
    const compAmt = updated[index].computerAmount;
    updated[index] = {
      ...updated[index],
      manualAmount: manualAmt,
      difference: parseFloat((manualAmt - compAmt).toFixed(2))
    };
    setPayModes(updated);
  };

  // Calculations for Totals
  const totalCashDenominations = denominations.reduce((acc, curr) => acc + curr.amount, 0);
  const totalCompAmount = payModes.reduce((acc, curr) => acc + curr.computerAmount, 0);
  const totalManualAmount = payModes.reduce((acc, curr) => acc + curr.manualAmount, 0);
  const totalDifference = totalManualAmount - totalCompAmount;

  // Handle Save or Re-Print
  const [reprinting, setReprinting] = useState<boolean>(false);

  const handleReprintSlip = async () => {
    if (reprinting) return;
    setReprinting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/settlement/reprint-slip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terminalCode: terminalCode || '',
          shiftNo: parseInt(shiftNo, 10) || 1,
          date: new Date().toISOString().split('T')[0],
          cashierId: cashierId.trim()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedbackAlert({
          visible: true,
          title: 'Print Successful',
          message: 'Settlement slip sent to thermal printer!',
          type: 'success'
        });
      } else {
        setFeedbackAlert({
          visible: true,
          title: 'Print Error',
          message: data.message || 'Failed to re-print settlement slip.',
          type: 'error'
        });
      }
    } catch (e: any) {
      setFeedbackAlert({
        visible: true,
        title: 'Print Error',
        message: e.message || 'Error communicating with printer.',
        type: 'error'
      });
    } finally {
      setReprinting(false);
    }
  };

  // Export Settlement Report (CSV / Audit Format)
  const handleExportCSV = () => {
    if (Platform.OS !== 'web') return;

    const exportDate = new Date().toISOString().split('T')[0];
    let csvContent = `SUPERMARKET RETAIL POS - CASHIER SHIFT SETTLEMENT\r\n`;
    csvContent += `Business Date,${exportDate}\r\n`;
    csvContent += `Shift No,${shiftNo}\r\n`;
    csvContent += `Cashier,${cashierId}\r\n`;
    csvContent += `Terminal,${terminalCode}\r\n`;
    csvContent += `Location,${locationCode}\r\n\r\n`;

    csvContent += `1. CASH DENOMINATIONS\r\n`;
    csvContent += `Denomination ($),Quantity,Amount ($)\r\n`;
    denominations.forEach((d) => {
      if (d.qty > 0 || d.amount > 0) {
        csvContent += `${d.currencyValue.toFixed(2)},${d.qty},${d.amount.toFixed(2)}\r\n`;
      }
    });
    csvContent += `TOTAL CASH,,${totalCashDenominations.toFixed(2)}\r\n\r\n`;

    csvContent += `2. PAYMENT MODES COLLECTION & RECONCILIATION\r\n`;
    csvContent += `Paymode,Computer ($),Manual ($),Difference ($)\r\n`;
    payModes.forEach((pm) => {
      const diff = pm.manualAmount - pm.computerAmount;
      csvContent += `${pm.payMode},${pm.computerAmount.toFixed(2)},${pm.manualAmount.toFixed(2)},${diff.toFixed(2)}\r\n`;
    });
    csvContent += `TOTALS,${totalCompAmount.toFixed(2)},${totalManualAmount.toFixed(2)},${totalDifference.toFixed(2)}\r\n\r\n`;

    csvContent += `3. SHIFT TOTALS AUDIT\r\n`;
    csvContent += `Metric,Amount ($)\r\n`;
    csvContent += `Total Manual Collection,${totalManualAmount.toFixed(2)}\r\n`;
    csvContent += `Till Float,-${tillAmount.toFixed(2)}\r\n`;
    csvContent += `Expense,+${expenseTotal.toFixed(2)}\r\n`;
    csvContent += `System Total,${totalCompAmount.toFixed(2)}\r\n`;
    csvContent += `Shortage / Excess,${totalDifference.toFixed(2)}\r\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `SETTLEMENT_SHIFT_${shiftNo}_${terminalCode}_${exportDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle Save
  const handleSave = async () => {
    if (saving) return;

    const executeSave = async () => {
      setSaving(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/settlement/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locationCode,
            terminalCode: terminalCode || '1',
            shiftNo: parseInt(shiftNo, 10) || 1,
            date: new Date().toISOString().split('T')[0],
            cashierId: cashierId.trim(),
            denominations,
            payModes,
            expenseAmount: expenseTotal
          })
        });

        const result = await res.json();
        if (!res.ok || !result.success) {
          setFeedbackAlert({
            visible: true,
            title: 'Save Failed',
            message: result.message || 'Error occurred while saving settlement.',
            type: 'error'
          });
          setSaving(false);
          return;
        }

        setFeedbackAlert({
          visible: true,
          title: 'Settlement Saved',
          message: `Shift ${shiftNo} settlement saved and recorded successfully.`,
          type: 'success'
        });
        if (onSettlementSaved) onSettlementSaved();

        // Automatically trigger print or fetch summary
        await fetchSummary();
      } catch (err: any) {
        setFeedbackAlert({
          visible: true,
          title: 'Save Error',
          message: err.message || 'Network error while saving settlement.',
          type: 'error'
        });
      } finally {
        setSaving(false);
      }
    };

    setConfirmDialog({
      visible: true,
      title: 'Confirm Shift Settlement',
      message: `Are you sure you want to save settlement for Shift ${shiftNo}?`,
      confirmText: 'Save Settlement',
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, visible: false }));
        executeSave();
      }
    });
  };

  // Fetch Print Summary Report
  const fetchSummary = async () => {
    try {
      const url = `${API_BASE_URL}/api/settlement/print-summary?terminalCode=${encodeURIComponent(
        terminalCode || '1'
      )}&shiftNo=${encodeURIComponent(shiftNo)}&userId=${encodeURIComponent(cashierId)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.success && data.summary) {
        setSummaryData(data.summary);
        setActiveTab('summary');
      }
    } catch (e) {
      console.warn('Could not fetch summary report', e);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {!isAuthenticated ? (
          /* Cashier Login & Shift Selection Dialog */
          <View style={styles.authModalContainer}>
            {/* Auth Header */}
            <View style={styles.authHeader}>
              <View style={styles.headerTitleWrap}>
                <MaterialCommunityIcons name="shield-lock-outline" size={22} color="#FFFFFF" />
                <Text style={styles.headerTitle}>Cashier Authorization</Text>
                <View style={styles.stationBadge}>
                  <Text style={styles.stationBadgeText}>STATION: {terminalCode || '1'}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity
                  style={[
                    styles.authToggleKeypadBtn,
                    showAuthKeypad && styles.authToggleKeypadBtnActive
                  ]}
                  onPress={() => setShowAuthKeypad(!showAuthKeypad)}
                >
                  <MaterialCommunityIcons
                    name="dialpad"
                    size={16}
                    color="#FFFFFF"
                  />
                  <Text style={styles.authToggleKeypadBtnText}>
                    {showAuthKeypad ? 'Hide Keypad' : 'Touch Keypad'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                  <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Auth Body - Split with Touch Numpad */}
            <View style={[styles.authBody, showAuthKeypad && styles.authBodyWithPad]}>
              <View style={[styles.authFormColumn, showAuthKeypad && { flex: 1.1 }]}>
                <View style={styles.authIconCircle}>
                  <MaterialCommunityIcons name="account-lock" size={36} color="#7A0C2E" />
                </View>
                <Text style={styles.authPrompt}>
                  Please enter Cashier credentials and select Shift No to begin settlement.
                </Text>

                {authError ? (
                  <View style={styles.errorBox}>
                    <MaterialCommunityIcons name="alert-circle" size={16} color="#D32F2F" />
                    <Text style={styles.errorText}>{authError}</Text>
                  </View>
                ) : null}

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Cashier ID / User Code</Text>
                  <TextInput
                    style={[styles.textInput, authActiveField === 'cashierId' && styles.textInputFocused]}
                    value={cashierId}
                    onChangeText={setCashierId}
                    onFocus={() => setAuthActiveField('cashierId')}
                    placeholder="e.g. AMITH"
                    autoCapitalize="characters"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <TextInput
                    style={[styles.textInput, authActiveField === 'password' && styles.textInputFocused]}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setAuthActiveField('password')}
                    placeholder="Enter password"
                    secureTextEntry
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Shift No</Text>
                  <TextInput
                    style={[styles.textInput, authActiveField === 'shiftNo' && styles.textInputFocused]}
                    value={shiftNo}
                    onChangeText={setShiftNo}
                    onFocus={() => setAuthActiveField('shiftNo')}
                    placeholder="1"
                    keyboardType="numeric"
                  />
                </View>

                <TouchableOpacity
                  style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
                  onPress={handleCashierLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="login" size={20} color="#FFFFFF" />
                      <Text style={styles.loginBtnText}>Proceed to Settlement</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Side Touch Number Pad (matching UcNumberPad_POS1 in frmSettlement) */}
              {showAuthKeypad && (
                <View style={styles.authPadColumn}>
                  <View style={styles.authPadHeader}>
                    <Text style={styles.authPadTitle}>
                      Touch Keypad: <Text style={{ color: '#7A0C2E', fontWeight: '800' }}>
                        {authActiveField === 'password' ? 'Password' : authActiveField === 'shiftNo' ? 'Shift No' : 'User Code'}
                      </Text>
                    </Text>
                  </View>
                  <View style={styles.authPadGrid}>
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'DEL'].map((k) => (
                      <TouchableOpacity
                        key={k}
                        style={[
                          styles.authPadKey,
                          (k === 'CLR' || k === 'DEL') && styles.authPadKeyAction
                        ]}
                        onPress={() => handleAuthKeypadPress(k)}
                      >
                        <Text
                          style={[
                            styles.authPadKeyText,
                            (k === 'CLR' || k === 'DEL') && { color: '#C62828' }
                          ]}
                        >
                          {k}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={styles.authPadEnterBtn}
                    onPress={() => handleAuthKeypadPress('ENTER')}
                  >
                    <MaterialCommunityIcons name="keyboard-return" size={18} color="#FFFFFF" />
                    <Text style={styles.authPadEnterText}>ENTER / PROCEED</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        ) : (
          /* Main Settlement Screen Modal */
          <View style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTitleWrap}>
                <MaterialCommunityIcons name="calculator-variant" size={24} color="#FFFFFF" />
                <Text style={styles.headerTitle}>POS Terminal Settlement (Shift End)</Text>
                <View style={styles.stationBadge}>
                  <Text style={styles.stationBadgeText}>STATION: {terminalCode || '1'}</Text>
                </View>
                {isExistingSettlement && (
                  <View style={styles.settledBadge}>
                    <Text style={styles.settledBadgeText}>SETTLED (VIEW ONLY)</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <MaterialCommunityIcons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Existing Settlement Banner */}
            {isExistingSettlement && (
              <View style={styles.existingSettlementAlert}>
                <MaterialCommunityIcons name="lock-check" size={18} color="#0369a1" />
                <Text style={styles.existingSettlementAlertText}>
                  Settlement for Shift {shiftNo} is finalized in database. You can view numbers or click "Re-Print Slip".
                </Text>
              </View>
            )}

            {/* Settlement Content */}
            <View style={styles.contentContainer}>
              {/* Top Shift & Cashier Meta Bar */}
              <View style={styles.metaBar}>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>CASHIER:</Text>
                  <Text style={styles.metaValue}>{cashierId.toUpperCase()}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>SHIFT NO:</Text>
                  <Text style={styles.metaValue}>{shiftNo}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>DATE:</Text>
                  <Text style={styles.metaValue}>{new Date().toLocaleDateString()}</Text>
                </View>
                {tillAmount > 0 && (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>TILL FLOAT:</Text>
                    <Text style={styles.metaValue}>${tillAmount.toFixed(2)}</Text>
                  </View>
                )}
                {expenseTotal > 0 && (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>EXPENSE TOTAL:</Text>
                    <Text style={[styles.metaValue, { color: '#C62828' }]}>${expenseTotal.toFixed(2)}</Text>
                  </View>
                )}

                {/* Tab switcher & Keypad Toggle */}
                <View style={styles.tabBar}>
                  <TouchableOpacity
                    style={[
                      styles.tabBtn,
                      showTouchKeypad ? styles.keypadActivePill : styles.keypadInactivePill
                    ]}
                    onPress={() => setShowTouchKeypad(!showTouchKeypad)}
                  >
                    <MaterialCommunityIcons
                      name="dialpad"
                      size={15}
                      color={showTouchKeypad ? '#FFFFFF' : '#475569'}
                    />
                    <Text style={[styles.tabBtnText, showTouchKeypad ? { color: '#FFFFFF' } : { color: '#475569' }]}>
                      {showTouchKeypad ? 'Hide Keypad' : 'Touch Keypad'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.tabBtn, activeTab === 'settlement' && styles.tabBtnActive]}
                    onPress={() => setActiveTab('settlement')}
                  >
                    <MaterialCommunityIcons
                      name="table-large"
                      size={15}
                      color={activeTab === 'settlement' ? '#FFFFFF' : '#475569'}
                    />
                    <Text style={[styles.tabBtnText, activeTab === 'settlement' && styles.tabBtnTextActive]}>
                      Settlement Grids
                    </Text>
                  </TouchableOpacity>
                  {summaryData && (
                    <TouchableOpacity
                      style={[styles.tabBtn, activeTab === 'summary' && styles.tabBtnActive]}
                      onPress={() => setActiveTab('summary')}
                    >
                      <MaterialCommunityIcons
                        name="file-document-outline"
                        size={15}
                        color={activeTab === 'summary' ? '#FFFFFF' : '#475569'}
                      />
                      <Text style={[styles.tabBtnText, activeTab === 'summary' && styles.tabBtnTextActive]}>
                        Summary Report
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {loading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="large" color="#7A0C2E" />
                  <Text style={styles.loadingText}>Loading Settlement Data...</Text>
                </View>
              ) : activeTab === 'summary' && summaryData ? (
                /* Summary Report View */
                <ScrollView style={styles.summaryContainer} contentContainerStyle={{ padding: 16 }}>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryTitle}>TERMINAL SETTLEMENT SUMMARY</Text>
                    <Text style={styles.summarySub}>Terminal: {terminalCode} | Shift: {shiftNo}</Text>

                    <View style={styles.summaryDivider} />

                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryRowLabel}>Gross Sales:</Text>
                      <Text style={styles.summaryRowVal}>${Number(summaryData.GrossSales || 0).toFixed(2)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryRowLabel}>Total Invoices:</Text>
                      <Text style={styles.summaryRowVal}>{summaryData.NoOfInvoices || 0}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryRowLabel}>Discounts Given:</Text>
                      <Text style={styles.summaryRowVal}>${Number(summaryData.Discount || 0).toFixed(2)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryRowLabel}>Net Sales (with Tax):</Text>
                      <Text style={[styles.summaryRowVal, { fontWeight: '700', color: '#1B5E20' }]}>
                        ${Number(summaryData.NettSales || 0).toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryRowLabel}>GST / Tax Total:</Text>
                      <Text style={styles.summaryRowVal}>${Number(summaryData.Tax || 0).toFixed(2)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryRowLabel}>Total Collected:</Text>
                      <Text style={styles.summaryRowVal}>${Number(summaryData.TotalCollected || 0).toFixed(2)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryRowLabel}>Cash in Drawer:</Text>
                      <Text style={styles.summaryRowVal}>${Number(summaryData.CashInDrawer || 0).toFixed(2)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryRowLabel}>Cash Declared:</Text>
                      <Text style={styles.summaryRowVal}>${Number(summaryData.CashDeclare || 0).toFixed(2)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryRowLabel}>Cash Difference / Short-Excess:</Text>
                      <Text
                        style={[
                          styles.summaryRowVal,
                          {
                            color:
                              Number(summaryData.CashDiff || 0) < 0
                                ? '#C62828'
                                : Number(summaryData.CashDiff || 0) > 0
                                ? '#2E7D32'
                                : '#333'
                          }
                        ]}
                      >
                        ${Number(summaryData.CashDiff || 0).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                </ScrollView>
              ) : (
                /* Main Settlement Two-Column / Two-Grid View with Dedicated Side Keypad */
                <View style={styles.settlementMainLayout}>
                  {/* Left Grids: Denominations & Paymodes */}
                  <View style={styles.splitGrids}>
                    {/* Column 1: Denominations */}
                    <View style={[styles.gridSection, { flex: 0.95 }]}>
                      <View style={styles.sectionHeader}>
                        <MaterialCommunityIcons name="cash-multiple" size={18} color="#7A0C2E" />
                        <Text style={styles.sectionTitle} numberOfLines={1}>1. Cash Denominations</Text>
                        <View style={styles.denomTotalBadge}>
                          <Text style={styles.denomTotalBadgeText}>
                            Total Cash: ${totalCashDenominations.toFixed(2)}
                          </Text>
                        </View>
                      </View>

                      {/* Denomination Table Header */}
                      <View style={styles.tableHeaderRow}>
                        <Text style={[styles.colHeader, { width: 140 }]}>Denomination ($)</Text>
                        <Text style={[styles.colHeader, { width: 100, textAlign: 'center' }]}>No of $</Text>
                        <Text style={[styles.colHeader, { flex: 1, textAlign: 'right' }]}>Amount ($)</Text>
                      </View>

                      <ScrollView style={styles.tableScrollView}>
                        {denominations.map((denom, idx) => (
                          <View
                            key={`denom-${idx}`}
                            style={[
                              styles.tableDataRow,
                              activeInputType === 'denom' && activeInputIndex === idx && styles.tableDataRowSelected,
                            ]}
                          >
                            <View style={[styles.cell, { width: 140 }]}>
                              <Text style={styles.denomValueText}>${denom.currencyValue.toFixed(2)}</Text>
                            </View>
                            <View style={[styles.cell, { width: 100, alignItems: 'center' }]}>
                              <TextInput
                                style={[
                                  styles.qtyInput,
                                  activeInputType === 'denom' && activeInputIndex === idx && styles.inputHighlight,
                                ]}
                                keyboardType="numeric"
                                value={denom.qty > 0 ? String(denom.qty) : ''}
                                placeholder="0"
                                onFocus={() => {
                                  setActiveInputType('denom');
                                  setActiveInputIndex(idx);
                                }}
                                onChangeText={txt => handleQtyChange(idx, txt)}
                              />
                            </View>
                            <View style={[styles.cell, { flex: 1, alignItems: 'flex-end' }]}>
                              <Text style={styles.amountText}>${denom.amount.toFixed(2)}</Text>
                            </View>
                          </View>
                        ))}
                      </ScrollView>
                    </View>

                    {/* Column 2: Pay Modes */}
                    <View style={[styles.gridSection, { flex: 1.05 }]}>
                      <View style={styles.sectionHeader}>
                        <MaterialCommunityIcons name="credit-card-outline" size={18} color="#7A0C2E" />
                        <Text style={styles.sectionTitle}>2. Payment Modes Breakdown</Text>
                      </View>

                      {/* Paymode Table Header */}
                      <View style={styles.tableHeaderRow}>
                        <Text style={[styles.colHeader, { flex: 1.6 }]}>Pay Mode</Text>
                        {showCompTotal && <Text style={[styles.colHeader, { flex: 1.3, textAlign: 'right' }]}>Comp Total</Text>}
                        <Text style={[styles.colHeader, { flex: 1.3, textAlign: 'right' }]}>Manual Total</Text>
                        <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right' }]}>Difference</Text>
                      </View>

                      <ScrollView style={styles.tableScrollView}>
                        {payModes.map((pm, idx) => {
                          const isCash = pm.payMode.trim().toUpperCase() === 'CASH';
                          const isExpense = pm.payMode.trim().toUpperCase() === 'EXPENSE AMT';
                          const diff = pm.difference;

                          return (
                            <View
                              key={`pm-${idx}`}
                              style={[
                                styles.tableDataRow,
                                activeInputType === 'paymode' && activeInputIndex === idx && styles.tableDataRowSelected,
                              ]}
                            >
                              <View style={[styles.cell, { flex: 1.6 }]}>
                                <Text style={[styles.payModeText, isCash && { fontWeight: '700', color: '#1B5E20' }]}>
                                  {pm.payMode}
                                </Text>
                              </View>

                              {showCompTotal && (
                                <View style={[styles.cell, { flex: 1.3, alignItems: 'flex-end' }]}>
                                  <Text style={styles.compAmountText}>${pm.computerAmount.toFixed(2)}</Text>
                                </View>
                              )}

                              <View style={[styles.cell, { flex: 1.3, alignItems: 'flex-end' }]}>
                                {isCash || isExpense ? (
                                  <Text style={[styles.manualAmountReadOnly, isCash && { fontWeight: '700', color: '#1B5E20' }]}>
                                    ${pm.manualAmount.toFixed(2)}
                                  </Text>
                                ) : (
                                  <TextInput
                                    style={[
                                      styles.manualInput,
                                      activeInputType === 'paymode' && activeInputIndex === idx && styles.inputHighlight,
                                    ]}
                                    keyboardType="numeric"
                                    value={pm.manualAmount > 0 ? String(pm.manualAmount) : ''}
                                    placeholder="0.00"
                                    onFocus={() => {
                                      setActiveInputType('paymode');
                                      setActiveInputIndex(idx);
                                    }}
                                    onChangeText={txt => handlePayModeManualChange(idx, txt)}
                                  />
                                )}
                              </View>

                              <View style={[styles.cell, { flex: 1.2, alignItems: 'flex-end' }]}>
                                <Text
                                  style={[
                                    styles.diffText,
                                    {
                                      color: diff < 0 ? '#C62828' : diff > 0 ? '#2E7D32' : '#666'
                                    }
                                  ]}
                                >
                                  {diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)}
                                </Text>
                              </View>
                            </View>
                          );
                        })}
                      </ScrollView>
                    </View>
                  </View>

                  {/* Right Side: Professional 4x4 POS Touch Keypad */}
                  {showTouchKeypad && (
                    <View style={styles.sideKeypadPanel}>
                      <View style={styles.sideKeypadHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <MaterialCommunityIcons name="dialpad" size={18} color="#7A0C2E" />
                          <Text style={styles.sideKeypadTitle}>Touch Keypad</Text>
                        </View>
                        <TouchableOpacity onPress={() => setShowTouchKeypad(false)}>
                          <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                        </TouchableOpacity>
                      </View>

                      {/* Target Indicator Box */}
                      <View style={styles.targetIndicatorBox}>
                        <Text style={styles.targetIndicatorLabel}>ACTIVE INPUT</Text>
                        <Text style={styles.targetIndicatorValue} numberOfLines={1}>
                          {activeInputType === 'denom' && activeInputIndex >= 0
                            ? `$${denominations[activeInputIndex]?.currencyValue.toFixed(2)} Count (Qty)`
                            : activeInputType === 'paymode' && activeInputIndex >= 0
                            ? `${payModes[activeInputIndex]?.payMode} Manual $`
                            : 'Tap an input field on left'}
                        </Text>
                      </View>

                      {/* 4x4 Button Grid */}
                      <View style={styles.sideKeypadGrid}>
                        <TouchableOpacity style={styles.sideKey} onPress={() => handleKeypadPress('7')}>
                          <Text style={styles.sideKeyText}>7</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.sideKey} onPress={() => handleKeypadPress('8')}>
                          <Text style={styles.sideKeyText}>8</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.sideKey} onPress={() => handleKeypadPress('9')}>
                          <Text style={styles.sideKeyText}>9</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.sideKey, styles.sideKeyDelta]} onPress={() => handleKeypadPress('+')}>
                          <Text style={[styles.sideKeyText, { color: '#7A0C2E' }]}>+1</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.sideKey} onPress={() => handleKeypadPress('4')}>
                          <Text style={styles.sideKeyText}>4</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.sideKey} onPress={() => handleKeypadPress('5')}>
                          <Text style={styles.sideKeyText}>5</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.sideKey} onPress={() => handleKeypadPress('6')}>
                          <Text style={styles.sideKeyText}>6</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.sideKey, styles.sideKeyDelta]} onPress={() => handleKeypadPress('-')}>
                          <Text style={[styles.sideKeyText, { color: '#7A0C2E' }]}>-1</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.sideKey} onPress={() => handleKeypadPress('1')}>
                          <Text style={styles.sideKeyText}>1</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.sideKey} onPress={() => handleKeypadPress('2')}>
                          <Text style={styles.sideKeyText}>2</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.sideKey} onPress={() => handleKeypadPress('3')}>
                          <Text style={styles.sideKeyText}>3</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.sideKey, styles.sideKeyAction]} onPress={() => handleKeypadPress('DEL')}>
                          <Text style={[styles.sideKeyText, { color: '#DC2626' }]}>DEL</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.sideKey} onPress={() => handleKeypadPress('0')}>
                          <Text style={styles.sideKeyText}>0</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.sideKey} onPress={() => handleKeypadPress('00')}>
                          <Text style={styles.sideKeyText}>00</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.sideKey} onPress={() => handleKeypadPress('.')}>
                          <Text style={styles.sideKeyText}>.</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.sideKey, styles.sideKeyAction]} onPress={() => handleKeypadPress('CLR')}>
                          <Text style={[styles.sideKeyText, { color: '#DC2626' }]}>CLR</Text>
                        </TouchableOpacity>
                      </View>

                      {/* ENTER / NEXT ROW */}
                      <TouchableOpacity
                        style={styles.sideKeyEnter}
                        onPress={() => handleKeypadPress('ENTER')}
                      >
                        <MaterialCommunityIcons name="keyboard-return" size={20} color="#FFFFFF" />
                        <Text style={styles.sideKeyEnterText}>ENTER / NEXT ROW</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {/* Bottom Summary Strip & Action Bar */}
              <View style={styles.bottomBar}>
                <View style={styles.totalsGroup}>
                  <View style={styles.totalBlock}>
                    <Text style={styles.totalBlockLabel}>CASH TOTAL</Text>
                    <Text style={styles.totalBlockVal}>${totalCashDenominations.toFixed(2)}</Text>
                  </View>
                  {showCompTotal && (
                    <View style={styles.totalBlock}>
                      <Text style={styles.totalBlockLabel}>COMP TOTAL</Text>
                      <Text style={styles.totalBlockVal}>${totalCompAmount.toFixed(2)}</Text>
                    </View>
                  )}
                  <View style={styles.totalBlock}>
                    <Text style={styles.totalBlockLabel}>MANUAL TOTAL</Text>
                    <Text style={styles.totalBlockVal}>${totalManualAmount.toFixed(2)}</Text>
                  </View>
                  <View style={styles.totalBlock}>
                    <Text style={styles.totalBlockLabel}>DIFFERENCE</Text>
                    <Text
                      style={[
                        styles.totalBlockVal,
                        {
                          color: totalDifference < 0 ? '#FFCDD2' : totalDifference > 0 ? '#C8E6C9' : '#FFFFFF'
                        }
                      ]}
                    >
                      {totalDifference > 0 ? `+${totalDifference.toFixed(2)}` : totalDifference.toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View style={styles.actionBtns}>
                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: '#059669' }]}
                    onPress={handleExportCSV}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="file-delimited" size={20} color="#FFFFFF" />
                    <Text style={styles.saveBtnText}>Export CSV</Text>
                  </TouchableOpacity>

                  {isExistingSettlement ? (
                    <TouchableOpacity
                      style={[styles.saveBtn, { backgroundColor: '#0284c7' }, reprinting && styles.saveBtnDisabled]}
                      onPress={handleReprintSlip}
                      disabled={reprinting}
                    >
                      {reprinting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="printer" size={20} color="#FFFFFF" />
                          <Text style={styles.saveBtnText}>Re-Print Slip</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                      onPress={handleSave}
                      disabled={saving}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="content-save-check" size={20} color="#FFFFFF" />
                          <Text style={styles.saveBtnText}>Save & Finalize</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity style={styles.exitBtn} onPress={onClose}>
                    <MaterialCommunityIcons name="exit-to-app" size={20} color="#333333" />
                    <Text style={styles.exitBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Modern Confirmation Modal Dialog */}
        <Modal visible={confirmDialog.visible} transparent animationType="fade">
          <View style={styles.dialogBackdrop}>
            <View style={styles.dialogCard}>
              <View style={styles.dialogHeader}>
                <View style={styles.dialogIconCircle}>
                  <MaterialCommunityIcons name="help-circle-outline" size={26} color="#7A0C2E" />
                </View>
                <Text style={styles.dialogTitle}>{confirmDialog.title}</Text>
              </View>
              <Text style={styles.dialogMessage}>{confirmDialog.message}</Text>
              <View style={styles.dialogActions}>
                <TouchableOpacity
                  style={styles.dialogCancelBtn}
                  onPress={() => setConfirmDialog((prev) => ({ ...prev, visible: false }))}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dialogCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dialogConfirmBtn}
                  onPress={confirmDialog.onConfirm}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" />
                  <Text style={styles.dialogConfirmBtnText}>
                    {confirmDialog.confirmText || 'OK'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modern Alert / Notification Modal Dialog */}
        <Modal visible={feedbackAlert.visible} transparent animationType="fade">
          <View style={styles.dialogBackdrop}>
            <View style={styles.dialogCard}>
              <View style={styles.dialogHeader}>
                <View
                  style={[
                    styles.dialogIconCircle,
                    feedbackAlert.type === 'success' && { backgroundColor: '#DCFCE7' },
                    feedbackAlert.type === 'error' && { backgroundColor: '#FEE2E2' },
                    feedbackAlert.type === 'info' && { backgroundColor: '#E0F2FE' }
                  ]}
                >
                  <MaterialCommunityIcons
                    name={
                      feedbackAlert.type === 'success'
                        ? 'check-circle'
                        : feedbackAlert.type === 'error'
                        ? 'alert-circle'
                        : 'information'
                    }
                    size={26}
                    color={
                      feedbackAlert.type === 'success'
                        ? '#16A34A'
                        : feedbackAlert.type === 'error'
                        ? '#DC2626'
                        : '#0284C7'
                    }
                  />
                </View>
                <Text style={styles.dialogTitle}>{feedbackAlert.title}</Text>
              </View>
              <Text style={styles.dialogMessage}>{feedbackAlert.message}</Text>
              <View style={styles.dialogActions}>
                <TouchableOpacity
                  style={[
                    styles.dialogConfirmBtn,
                    { flex: 1 },
                    feedbackAlert.type === 'error' && { backgroundColor: '#DC2626' }
                  ]}
                  onPress={() => setFeedbackAlert((prev) => ({ ...prev, visible: false }))}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dialogConfirmBtnText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0
  },
  modalContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 0,
    borderWidth: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column'
  },
  header: {
    height: 52,
    backgroundColor: '#7A0C2E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  stationBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  stationBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600'
  },
  settledBadge: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  settledBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800'
  },
  existingSettlementAlert: {
    backgroundColor: '#f0f9ff',
    borderBottomWidth: 1,
    borderBottomColor: '#bae6fd',
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  existingSettlementAlertText: {
    color: '#0369a1',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 4
  },

  // Auth Modal
  authModalContainer: {
    width: '100%',
    maxWidth: 680,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  authHeader: {
    height: 48,
    backgroundColor: '#7A0C2E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  authToggleKeypadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  authToggleKeypadBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderColor: '#FFFFFF',
  },
  authToggleKeypadBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  authBody: {
    padding: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  authBodyWithPad: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
    padding: 20,
  },
  authFormColumn: {
    width: '100%',
    alignItems: 'center',
  },
  authPadColumn: {
    flex: 0.9,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    alignItems: 'center',
  },
  authPadHeader: {
    width: '100%',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingBottom: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  authPadTitle: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  authPadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    width: 216,
  },
  authPadKey: {
    width: 64,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
  },
  authPadKeyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  authPadKeyAction: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  authPadEnterBtn: {
    marginTop: 10,
    width: 208,
    height: 42,
    backgroundColor: '#7A0C2E',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  authPadEnterText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  authIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FCE4EC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  authPrompt: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginBottom: 14,
    width: '100%',
  },
  errorText: {
    fontSize: 12,
    color: '#D32F2F',
    flex: 1,
  },
  inputGroup: {
    width: '100%',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
  },
  textInput: {
    height: 38,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  textInputFocused: {
    borderColor: '#7A0C2E',
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 42,
    backgroundColor: '#7A0C2E',
    borderRadius: 6,
    width: '100%',
    marginTop: 8,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Main Settlement View
  contentContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#F8FAFC'
  },
  metaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    flexWrap: 'wrap',
    gap: 12
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B'
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B'
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center'
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1'
  },
  tabBtnActive: {
    backgroundColor: '#7A0C2E',
    borderColor: '#7A0C2E'
  },
  keypadActivePill: {
    backgroundColor: '#7A0C2E',
    borderColor: '#7A0C2E'
  },
  keypadInactivePill: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1'
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569'
  },
  tabBtnTextActive: {
    color: '#FFFFFF'
  },

  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748B'
  },

  // Main Settlement Layout
  settlementMainLayout: {
    flex: 1,
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  splitGrids: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  gridSection: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column'
  },

  // Right Side Dedicated Touch Keypad
  sideKeypadPanel: {
    width: 250,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  sideKeypadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sideKeypadTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  targetIndicatorBox: {
    backgroundColor: '#FDF2F4',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 10,
  },
  targetIndicatorLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#9F1239',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  targetIndicatorValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7A0C2E',
  },
  sideKeypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'space-between',
  },
  sideKey: {
    width: 50,
    height: 48,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
  },
  sideKeyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  sideKeyDelta: {
    backgroundColor: '#FDF2F4',
    borderColor: '#FECDD3',
  },
  sideKeyAction: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  sideKeyEnter: {
    marginTop: 8,
    height: 46,
    backgroundColor: '#7A0C2E',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    elevation: 2,
  },
  sideKeyEnterText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sectionHeader: {
    height: 38,
    backgroundColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0'
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1
  },
  denomTotalBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4
  },
  denomTotalBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2E7D32'
  },
  tableHeaderRow: {
    flexDirection: 'row',
    height: 32,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    alignItems: 'center'
  },
  colHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569'
  },
  tableScrollView: {
    flex: 1
  },
  tableDataRow: {
    flexDirection: 'row',
    height: 42,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#F1F5F9'
  },
  tableDataRowSelected: {
    backgroundColor: '#FDF2F4'
  },
  inputHighlight: {
    borderColor: '#7A0C2E',
    borderWidth: 1.5,
    backgroundColor: '#FFF'
  },

  // Touch Keypad Styles
  touchKeypadContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  touchKeypadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  touchKeypadHeaderText: {
    fontSize: 12,
    color: '#475569',
  },
  numpadBtnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  numpadKey: {
    width: 48,
    height: 36,
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
  },
  numpadKeyText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  numpadKeyAction: {
    backgroundColor: '#F1F5F9',
    borderColor: '#94A3B8',
  },
  numpadKeyDelta: {
    backgroundColor: '#FDF2F4',
    borderColor: '#FECDD3',
  },
  numpadKeyEnter: {
    width: 72,
    backgroundColor: '#7A0C2E',
    borderColor: '#7A0C2E',
  },
  cell: {
    justifyContent: 'center'
  },
  denomValueText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B'
  },
  qtyInput: {
    height: 32,
    width: 70,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    paddingHorizontal: 6,
    fontSize: 14,
    textAlign: 'center',
    backgroundColor: '#FFFFFF',
    fontWeight: '700'
  },
  amountText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A'
  },
  payModeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155'
  },
  compAmountText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569'
  },
  manualInput: {
    height: 32,
    width: 90,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    paddingHorizontal: 8,
    fontSize: 14,
    textAlign: 'right',
    backgroundColor: '#FFFFFF',
    fontWeight: '700'
  },
  manualAmountReadOnly: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    paddingRight: 6
  },
  diffText: {
    fontSize: 13,
    fontWeight: '700'
  },

  // Summary View
  summaryContainer: {
    flex: 1
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%'
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#7A0C2E',
    textAlign: 'center'
  },
  summarySub: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 14
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderColor: '#F8FAFC'
  },
  summaryRowLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500'
  },
  summaryRowVal: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '600'
  },

  // Bottom Summary Bar
  bottomBar: {
    backgroundColor: '#7A0C2E',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  totalsGroup: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'center'
  },
  totalBlock: {
    alignItems: 'flex-start'
  },
  totalBlockLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.75)',
    letterSpacing: 0.5
  },
  totalBlockVal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  actionBtns: {
    flexDirection: 'row',
    gap: 10
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2E7D32',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6
  },
  saveBtnDisabled: {
    opacity: 0.6
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700'
  },
  exitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6
  },
  exitBtnText: {
    color: '#333333',
    fontSize: 13,
    fontWeight: '700'
  },

  // Modern Dialog Styles (replacing native browser alert/confirm)
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  dialogCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12
  },
  dialogIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FCE4EC',
    justifyContent: 'center',
    alignItems: 'center'
  },
  dialogTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1
  },
  dialogMessage: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 21,
    marginBottom: 20
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10
  },
  dialogCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1'
  },
  dialogCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569'
  },
  dialogConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#7A0C2E'
  },
  dialogConfirmBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF'
  }
});
