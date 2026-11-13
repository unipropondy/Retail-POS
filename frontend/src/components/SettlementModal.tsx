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
  Alert
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

  // Focus and auth reset when opened
  useEffect(() => {
    if (visible) {
      setCashierId(currentUserId || 'AMITH');
      setPassword('');
      setShiftNo('1');
      setIsAuthenticated(false);
      setAuthError('');
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

  // Handle Save
  const handleSave = async () => {
    if (saving) return;

    Alert.alert(
      'Confirm Settlement',
      `Are you sure you want to save settlement for Shift ${shiftNo}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save Settlement',
          onPress: async () => {
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
                Alert.alert('Save Failed', result.message || 'Error occurred while saving settlement.');
                setSaving(false);
                return;
              }

              Alert.alert('Success', 'Settlement saved successfully!');
              if (onSettlementSaved) onSettlementSaved();

              // Fetch Print Summary
              await fetchSummary();
            } catch (err: any) {
              Alert.alert('Save Error', err.message || 'Network error while saving.');
            } finally {
              setSaving(false);
            }
          }
        }
      ]
    );
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
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Auth Body */}
            <View style={styles.authBody}>
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
                  style={styles.textInput}
                  value={cashierId}
                  onChangeText={setCashierId}
                  placeholder="e.g. AMITH"
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={styles.textInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter password"
                  secureTextEntry
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Shift No</Text>
                <TextInput
                  style={styles.textInput}
                  value={shiftNo}
                  onChangeText={setShiftNo}
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
                    <Text style={styles.settledBadgeText}>SETTLED</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <MaterialCommunityIcons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

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

                {/* Tab switcher */}
                <View style={styles.tabBar}>
                  <TouchableOpacity
                    style={[styles.tabBtn, activeTab === 'settlement' && styles.tabBtnActive]}
                    onPress={() => setActiveTab('settlement')}
                  >
                    <Text style={[styles.tabBtnText, activeTab === 'settlement' && styles.tabBtnTextActive]}>
                      Settlement Grids
                    </Text>
                  </TouchableOpacity>
                  {summaryData && (
                    <TouchableOpacity
                      style={[styles.tabBtn, activeTab === 'summary' && styles.tabBtnActive]}
                      onPress={() => setActiveTab('summary')}
                    >
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
                /* Main Settlement Two-Column / Two-Grid View */
                <View style={styles.splitGrids}>
                  {/* Left Column: Denominations */}
                  <View style={styles.gridSection}>
                    <View style={styles.sectionHeader}>
                      <MaterialCommunityIcons name="cash-multiple" size={18} color="#7A0C2E" />
                      <Text style={styles.sectionTitle}>1. Cash Denominations</Text>
                      <View style={styles.denomTotalBadge}>
                        <Text style={styles.denomTotalBadgeText}>
                          Total Cash: ${totalCashDenominations.toFixed(2)}
                        </Text>
                      </View>
                    </View>

                    {/* Denomination Table Header */}
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.colHeader, { flex: 1.2 }]}>Denom ($)</Text>
                      <Text style={[styles.colHeader, { flex: 1.2 }]}>No of $</Text>
                      <Text style={[styles.colHeader, { flex: 1.5, textAlign: 'right' }]}>Amount ($)</Text>
                    </View>

                    <ScrollView style={styles.tableScrollView}>
                      {denominations.map((denom, idx) => (
                        <View key={`denom-${idx}`} style={styles.tableDataRow}>
                          <View style={[styles.cell, { flex: 1.2 }]}>
                            <Text style={styles.denomValueText}>${denom.currencyValue.toFixed(2)}</Text>
                          </View>
                          <View style={[styles.cell, { flex: 1.2 }]}>
                            <TextInput
                              style={styles.qtyInput}
                              keyboardType="numeric"
                              value={denom.qty > 0 ? String(denom.qty) : ''}
                              placeholder="0"
                              onChangeText={txt => handleQtyChange(idx, txt)}
                            />
                          </View>
                          <View style={[styles.cell, { flex: 1.5, alignItems: 'flex-end' }]}>
                            <Text style={styles.amountText}>${denom.amount.toFixed(2)}</Text>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  </View>

                  {/* Right Column: Pay Modes */}
                  <View style={styles.gridSection}>
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
                          <View key={`pm-${idx}`} style={styles.tableDataRow}>
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
                                  style={styles.manualInput}
                                  keyboardType="numeric"
                                  value={pm.manualAmount > 0 ? String(pm.manualAmount) : ''}
                                  placeholder="0.00"
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

                  <TouchableOpacity style={styles.exitBtn} onPress={onClose}>
                    <MaterialCommunityIcons name="exit-to-app" size={20} color="#333333" />
                    <Text style={styles.exitBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalContainer: {
    width: '92%',
    maxWidth: 960,
    height: '88%',
    maxHeight: 700,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
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
    backgroundColor: '#2E7D32',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  settledBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700'
  },
  closeBtn: {
    padding: 6,
    borderRadius: 4
  },

  // Auth Modal
  authModalContainer: {
    width: '100%',
    maxWidth: 440,
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
  authBody: {
    padding: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  authIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FCE4EC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  authPrompt: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
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
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  textInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
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
    gap: 6
  },
  tabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#F1F5F9'
  },
  tabBtnActive: {
    backgroundColor: '#7A0C2E'
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: '600',
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

  // Two-column Split Grids
  splitGrids: {
    flex: 1,
    flexDirection: 'row',
    padding: 12,
    gap: 12
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
    height: 38,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#F1F5F9'
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
    height: 28,
    width: 60,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    paddingHorizontal: 6,
    fontSize: 12,
    textAlign: 'center',
    backgroundColor: '#FFFFFF',
    fontWeight: '600'
  },
  amountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A'
  },
  payModeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155'
  },
  compAmountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569'
  },
  manualInput: {
    height: 28,
    width: 80,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    paddingHorizontal: 6,
    fontSize: 12,
    textAlign: 'right',
    backgroundColor: '#FFFFFF',
    fontWeight: '600'
  },
  manualAmountReadOnly: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    paddingRight: 6
  },
  diffText: {
    fontSize: 12,
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
  }
});
