// ==============================================================================
// Author: JAVITH, BAVANI 17-11-2026
// Project: Supermarket Retail POS
// Module: Modern Touch POS Payment Window (frmPayment.vb Parity)
// File: frontend/src/components/PosPaymentModal.tsx
// Description: Multi-Paymode Split Payment with:
//              - Paymode Grid (Cash, NETS, PayNow, CDC, Amex, Credit) from tblInvPaymode
//              - Status Display: TOTAL (Green), PAID (Yellow), BALANCE (Red)
//              - Fast Cash Presets ($2, $5, $10, $50, $100) from tblMaPayAmount (ENABLED ONLY FOR CASH)
//              - Digital Paymodes (NETS, PayNow, CDC, Cards) capped to Exact Bill Total / Balance (NO CHANGE ALLOWED)
//              - Modern POS Theme Matched 4x4 Touch Keypad (same as main POS billing screen)
//              - Dual Actions: Save & Print (F4) vs Save Without Print (F5)
// ==============================================================================

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export interface SplitPaymentLine {
  payMode: string;
  amount: number;
  slipNo?: string;
}

interface PosPaymentModalProps {
  visible: boolean;
  onClose: () => void;
  grandTotal: number;
  availablePayModes: Array<{ PayMode: string; Description?: string }>;
  defaultPayMode?: string;
  onCompleteSale: (
    payments: SplitPaymentLine[],
    totalTendered: number,
    changeDue: number,
    shouldPrintReceipt: boolean
  ) => Promise<void>;
}

export const PosPaymentModal: React.FC<PosPaymentModalProps> = ({
  visible,
  onClose,
  grandTotal,
  availablePayModes,
  defaultPayMode = 'CASH',
  onCompleteSale,
}) => {
  const [payLines, setPayLines] = useState<SplitPaymentLine[]>([]);
  const [selectedPayModeIdx, setSelectedPayModeIdx] = useState<number>(0);
  const [activeInputString, setActiveInputString] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Initialize paymodes strictly from live database state (tblInvPaymode)
  useEffect(() => {
    if (visible) {
      const modes = availablePayModes || [];
      const initialLines: SplitPaymentLine[] = modes.map((pm, idx) => {
        const modeName = (pm.PayMode || '').trim();
        const isDefault = defaultPayMode
          ? modeName.toUpperCase() === defaultPayMode.toUpperCase()
          : idx === 0;
        return {
          payMode: modeName,
          amount: isDefault ? grandTotal : 0,
          slipNo: '',
        };
      });

      const defaultIdx = initialLines.findIndex(
        l => l.payMode.toUpperCase() === (defaultPayMode || 'CASH').toUpperCase()
      );
      const activeIdx = defaultIdx >= 0 ? defaultIdx : 0;

      setPayLines(initialLines);
      setSelectedPayModeIdx(activeIdx);
      setActiveInputString(String(grandTotal.toFixed(2)));
      setIsSubmitting(false);
    }
  }, [visible, grandTotal, availablePayModes, defaultPayMode]);

  // Derived Calculations
  const currentSelectedMode = payLines[selectedPayModeIdx]?.payMode?.toUpperCase() || 'CASH';
  const isCashSelected = currentSelectedMode === 'CASH';

  const totalPaid = payLines.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const balanceRemaining = parseFloat((grandTotal - totalPaid).toFixed(2));
  const changeDue = totalPaid > grandTotal ? parseFloat((totalPaid - grandTotal).toFixed(2)) : 0;

  // Max allowed for current line: For non-cash (NETS, PayNow, CDC, Credit), amount cannot exceed remaining balance
  const otherLinesTotal = payLines.reduce((acc, curr, idx) => {
    if (idx === selectedPayModeIdx) return acc;
    return acc + (Number(curr.amount) || 0);
  }, 0);
  const maxAllowedForSelected = isCashSelected ? 999999 : Math.max(0, parseFloat((grandTotal - otherLinesTotal).toFixed(2)));

  // When cashier taps on a paymode row
  const handleSelectPaymodeRow = (idx: number) => {
    setSelectedPayModeIdx(idx);
    const targetMode = payLines[idx]?.payMode?.toUpperCase() || '';
    const isTargetCash = targetMode === 'CASH';

    // If target is NOT cash and current line amount is 0, auto-fill remaining balance (exact VB.NET behavior)
    if (!isTargetCash && (!payLines[idx]?.amount || payLines[idx]?.amount === 0)) {
      const others = payLines.reduce((acc, curr, i) => (i === idx ? acc : acc + (Number(curr.amount) || 0)), 0);
      const remaining = Math.max(0, parseFloat((grandTotal - others).toFixed(2)));
      setActiveInputString(String(remaining.toFixed(2)));
      setPayLines(prev => {
        const updated = [...prev];
        if (updated[idx]) {
          updated[idx] = { ...updated[idx], amount: remaining };
        }
        return updated;
      });
    } else {
      setActiveInputString(String(payLines[idx]?.amount || '0'));
    }
  };

  // Handle Numeric Keypad
  const handleKeypadPress = (val: string) => {
    let nextStr = activeInputString;

    if (val === 'CLR') {
      nextStr = '0';
    } else if (val === 'DEL') {
      nextStr = nextStr.length > 1 ? nextStr.slice(0, -1) : '0';
    } else if (val === '.') {
      if (!nextStr.includes('.')) {
        nextStr = nextStr === '' || nextStr === '0' ? '0.' : nextStr + '.';
      }
    } else if (val === '00') {
      if (nextStr !== '0' && nextStr !== '') {
        nextStr += '00';
      }
    } else if (val === '+' || val === '-') {
      const delta = val === '+' ? 1 : -1;
      const curNum = parseFloat(nextStr) || 0;
      nextStr = Math.max(0, curNum + delta).toFixed(2);
    } else {
      // 0 - 9
      if (nextStr === '0' || nextStr === '') {
        nextStr = val;
      } else {
        const parts = nextStr.split('.');
        if (parts.length === 2 && parts[1].length >= 2) {
          return;
        }
        nextStr += val;
      }
    }

    let numericVal = parseFloat(nextStr) || 0;

    // Strict Rule: Digital Paymodes cannot exceed bill total / balance (No change allowed for card/NETS/CDC)
    if (!isCashSelected && numericVal > maxAllowedForSelected) {
      numericVal = maxAllowedForSelected;
      nextStr = String(numericVal.toFixed(2));
    }

    setActiveInputString(nextStr);

    setPayLines(prev => {
      const updated = [...prev];
      if (updated[selectedPayModeIdx]) {
        updated[selectedPayModeIdx] = {
          ...updated[selectedPayModeIdx],
          amount: numericVal,
        };
      }
      return updated;
    });
  };

  // Quick Cash Presets ($2, $5, $10, $50, $100) - Only allowed for CASH
  const handleQuickCash = (presetVal: number) => {
    if (!isCashSelected) return;

    setActiveInputString(String(presetVal.toFixed(2)));
    setPayLines(prev => {
      const updated = [...prev];
      if (updated[selectedPayModeIdx]) {
        updated[selectedPayModeIdx] = {
          ...updated[selectedPayModeIdx],
          amount: presetVal,
        };
      }
      return updated;
    });
  };

  // Final Checkout Save (F4 = Print, F5 = Without Print)
  const handleSave = async (shouldPrint: boolean) => {
    if (isSubmitting) return;

    if (totalPaid < grandTotal) {
      if (Platform.OS === 'web') {
        window.alert(`Payment Incomplete: $${balanceRemaining.toFixed(2)} remaining.`);
      }
      return;
    }

    // Safety check: Non-cash payments cannot create change due
    const nonCashPaid = payLines
      .filter(p => p.payMode.toUpperCase() !== 'CASH')
      .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

    if (nonCashPaid > grandTotal) {
      if (Platform.OS === 'web') {
        window.alert(`Invalid Payment: Non-cash tender ($${nonCashPaid.toFixed(2)}) cannot exceed Net Total ($${grandTotal.toFixed(2)}). Change can only be given for Cash.`);
      }
      return;
    }

    try {
      setIsSubmitting(true);
      const activePayments = payLines.filter(p => Number(p.amount) > 0);
      await onCompleteSale(activePayments, totalPaid, changeDue, shouldPrint);
    } catch (err) {
      console.error('POS Payment completion error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Keyboard shortcut listener for F4, F5, Esc
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'F4') {
        e.preventDefault();
        handleSave(true);
      } else if (e.key === 'F5') {
        e.preventDefault();
        handleSave(false);
      }
    };

    if (Platform.OS === 'web') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [visible, totalPaid, grandTotal, payLines, isSubmitting]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.paymentModalCard}>
          {/* Header Bar */}
          <View style={styles.headerBar}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MaterialCommunityIcons name="point-of-sale" size={22} color="#FFFFFF" />
              <Text style={styles.headerTitle}>POS Payment & Checkout</Text>
              <View style={styles.billTotalBadge}>
                <Text style={styles.billTotalBadgeText}>BILL TOTAL: ${grandTotal.toFixed(2)}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Main 2-Column Split Content */}
          <View style={styles.bodySplit}>
            {/* Left Column: Paymode Breakdown Table */}
            <View style={styles.leftCol}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.colHeader, { flex: 1.8 }]}>Paymode</Text>
                <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right' }]}>Amount ($)</Text>
                <Text style={[styles.colHeader, { flex: 1.0, textAlign: 'right' }]}>Slip / Ref</Text>
              </View>

              <ScrollView style={styles.tableScrollView} showsVerticalScrollIndicator={true}>
                {payLines.map((line, idx) => {
                  const isSelected = selectedPayModeIdx === idx;
                  const isCash = line.payMode.toUpperCase() === 'CASH';

                  return (
                    <TouchableOpacity
                      key={line.payMode || idx}
                      style={[
                        styles.tableDataRow,
                        isSelected && styles.tableDataRowSelected,
                      ]}
                      onPress={() => handleSelectPaymodeRow(idx)}
                      activeOpacity={0.8}
                    >
                      {/* Paymode Name & Icon */}
                      <View style={{ flex: 1.8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <MaterialCommunityIcons
                          name={
                            isCash
                              ? 'cash'
                              : line.payMode.includes('NETS')
                              ? 'credit-card-outline'
                              : line.payMode.includes('PAYNOW') || line.payMode.includes('QR')
                              ? 'qrcode-scan'
                              : 'credit-card'
                          }
                          size={22}
                          color={isSelected ? '#7A0C2E' : '#475569'}
                        />
                        <View>
                          <Text
                            style={[
                              styles.payModeText,
                              isSelected && { color: '#7A0C2E', fontWeight: '800' },
                            ]}
                          >
                            {line.payMode}
                          </Text>
                          {!isCash && (
                            <Text style={styles.payModeHint}>Exact tender only</Text>
                          )}
                        </View>
                      </View>

                      {/* Tendered Amount */}
                      <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                        <Text
                          style={[
                            styles.amountText,
                            isSelected && styles.amountTextSelected,
                            line.amount > 0 && { color: '#15803D' },
                          ]}
                        >
                          ${Number(line.amount || 0).toFixed(2)}
                        </Text>
                      </View>

                      {/* Slip / Ref */}
                      <View style={{ flex: 1.0, alignItems: 'flex-end' }}>
                        <Text style={styles.slipText}>
                          {line.slipNo || (isCash ? '—' : 'Auto')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Right Column: Status Panels, Cash Presets, and Modern POS Numpad */}
            <View style={styles.rightCol}>
              {/* 3 Status Panels (Total, Paid, Balance) */}
              <View style={styles.statusBoxesRow}>
                {/* 1. Total */}
                <View style={[styles.statusBox, styles.statusBoxTotal]}>
                  <Text style={styles.statusBoxLabelTotal}>TOTAL</Text>
                  <Text style={styles.statusBoxValueTotal}>${grandTotal.toFixed(2)}</Text>
                </View>

                {/* 2. Paid */}
                <View style={[styles.statusBox, styles.statusBoxPaid]}>
                  <Text style={styles.statusBoxLabelPaid}>PAID</Text>
                  <Text style={styles.statusBoxValuePaid}>${totalPaid.toFixed(2)}</Text>
                </View>

                {/* 3. Balance / Change Due */}
                <View
                  style={[
                    styles.statusBox,
                    balanceRemaining > 0 ? styles.statusBoxBalanceDue : styles.statusBoxChangeDue,
                  ]}
                >
                  <Text
                    style={balanceRemaining > 0 ? styles.statusBoxLabelBalance : styles.statusBoxLabelChange}
                  >
                    {balanceRemaining > 0 ? 'BALANCE' : 'CHANGE DUE'}
                  </Text>
                  <Text
                    style={balanceRemaining > 0 ? styles.statusBoxValueBalance : styles.statusBoxValueChange}
                  >
                    ${balanceRemaining > 0 ? balanceRemaining.toFixed(2) : changeDue.toFixed(2)}
                  </Text>
                </View>
              </View>

              {/* Mode indicator banner */}
              <View style={[styles.modeIndicatorBar, !isCashSelected && styles.modeIndicatorBarNonCash]}>
                <MaterialCommunityIcons
                  name={isCashSelected ? "cash" : "information-outline"}
                  size={16}
                  color={isCashSelected ? "#15803D" : "#7A0C2E"}
                />
                <Text style={[styles.modeIndicatorText, !isCashSelected && { color: "#7A0C2E" }]}>
                  {isCashSelected
                    ? "Tendering in CASH: Change due allowed, quick cash presets enabled."
                    : `Tendering in ${currentSelectedMode}: Exact amount capped to $${maxAllowedForSelected.toFixed(2)} (No change due on electronic cards).`}
                </Text>
              </View>

              {/* Controls Row: Quick Cash Presets and Modern POS Keypad */}
              <View style={styles.controlsRow}>
                {/* Left Stack: Quick Cash Denomination Buttons */}
                <View style={styles.presetsStack}>
                  {[2.0, 5.0, 10.0, 50.0, 100.0].map((preset) => (
                    <TouchableOpacity
                      key={preset}
                      style={[
                        styles.presetCashBtn,
                        !isCashSelected && styles.presetCashBtnDisabled,
                      ]}
                      onPress={() => handleQuickCash(preset)}
                      disabled={!isCashSelected}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.presetCashText,
                          !isCashSelected && styles.presetCashTextDisabled,
                        ]}
                      >
                        ${preset.toFixed(2)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Right Stack: Modern POS Theme 4x4 Keypad */}
                <View style={styles.numpadStack}>
                  {/* Row 1: 1, 2, 3, - */}
                  <View style={styles.numpadRow}>
                    <TouchableOpacity style={styles.numKey} onPress={() => handleKeypadPress('1')} activeOpacity={0.7}>
                      <Text style={styles.numKeyText}>1</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.numKey} onPress={() => handleKeypadPress('2')} activeOpacity={0.7}>
                      <Text style={styles.numKeyText}>2</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.numKey} onPress={() => handleKeypadPress('3')} activeOpacity={0.7}>
                      <Text style={styles.numKeyText}>3</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.numKey, styles.numKeySpecial]} onPress={() => handleKeypadPress('-')} activeOpacity={0.7}>
                      <Text style={styles.numKeySpecialText}>-</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Row 2: 4, 5, 6, + */}
                  <View style={styles.numpadRow}>
                    <TouchableOpacity style={styles.numKey} onPress={() => handleKeypadPress('4')} activeOpacity={0.7}>
                      <Text style={styles.numKeyText}>4</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.numKey} onPress={() => handleKeypadPress('5')} activeOpacity={0.7}>
                      <Text style={styles.numKeyText}>5</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.numKey} onPress={() => handleKeypadPress('6')} activeOpacity={0.7}>
                      <Text style={styles.numKeyText}>6</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.numKey, styles.numKeySpecial]} onPress={() => handleKeypadPress('+')} activeOpacity={0.7}>
                      <Text style={styles.numKeySpecialText}>+</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Row 3: 7, 8, 9, 0 */}
                  <View style={styles.numpadRow}>
                    <TouchableOpacity style={styles.numKey} onPress={() => handleKeypadPress('7')} activeOpacity={0.7}>
                      <Text style={styles.numKeyText}>7</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.numKey} onPress={() => handleKeypadPress('8')} activeOpacity={0.7}>
                      <Text style={styles.numKeyText}>8</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.numKey} onPress={() => handleKeypadPress('9')} activeOpacity={0.7}>
                      <Text style={styles.numKeyText}>9</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.numKey} onPress={() => handleKeypadPress('0')} activeOpacity={0.7}>
                      <Text style={styles.numKeyText}>0</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Row 4: 00, ., DEL, CLR */}
                  <View style={styles.numpadRow}>
                    <TouchableOpacity style={styles.numKey} onPress={() => handleKeypadPress('00')} activeOpacity={0.7}>
                      <Text style={styles.numKeyText}>00</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.numKey} onPress={() => handleKeypadPress('.')} activeOpacity={0.7}>
                      <Text style={styles.numKeyText}>.</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.numKey, styles.numKeyDelete]} onPress={() => handleKeypadPress('DEL')} activeOpacity={0.7}>
                      <MaterialCommunityIcons name="backspace-outline" size={20} color="#DC2626" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.numKey, styles.numKeyClear]} onPress={() => handleKeypadPress('CLR')} activeOpacity={0.7}>
                      <Text style={styles.numKeyClearText}>CLR</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Dual Action Buttons (Save F4 vs Save Without Print F5 vs Cancel) */}
              <View style={styles.actionsFooter}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.saveWithPrintBtn, isSubmitting && styles.btnDisabled]}
                  onPress={() => handleSave(true)}
                  disabled={isSubmitting}
                  activeOpacity={0.8}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="printer-check" size={20} color="#FFFFFF" />
                      <Text style={styles.actionBtnText}>Save (F4)</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.saveNoPrintBtn, isSubmitting && styles.btnDisabled]}
                  onPress={() => handleSave(false)}
                  disabled={isSubmitting}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="content-save-check" size={20} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Save Without Print (F5)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.cancelBtn]}
                  onPress={onClose}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="close-circle" size={18} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Cancel (Esc)</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.70)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  paymentModalCard: {
    width: '100%',
    maxWidth: 980,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 24,
    display: 'flex',
    flexDirection: 'column',
  },
  headerBar: {
    height: 48,
    backgroundColor: '#7A0C2E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  billTotalBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 16,
    marginLeft: 6,
  },
  billTotalBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 6,
  },
  bodySplit: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
    backgroundColor: '#F8FAFC',
  },

  // Left Column (Paymode Table)
  leftCol: {
    flex: 1.05,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 460,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    height: 38,
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  colHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableScrollView: {
    flex: 1,
  },
  tableDataRow: {
    flexDirection: 'row',
    height: 52,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  tableDataRowSelected: {
    backgroundColor: '#FDF2F4',
    borderLeftWidth: 4,
    borderLeftColor: '#7A0C2E',
  },
  payModeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  payModeHint: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  amountText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#334155',
  },
  amountTextSelected: {
    color: '#7A0C2E',
  },
  slipText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },

  // Right Column
  rightCol: {
    flex: 1.35,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },

  // Status Boxes (Total, Paid, Balance)
  statusBoxesRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statusBox: {
    flex: 1,
    height: 64,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  statusBoxTotal: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  statusBoxLabelTotal: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statusBoxValueTotal: {
    fontSize: 20,
    fontWeight: '900',
    color: '#047857',
  },

  statusBoxPaid: {
    backgroundColor: '#FEFCE8',
    borderColor: '#FACC15',
  },
  statusBoxLabelPaid: {
    fontSize: 11,
    fontWeight: '800',
    color: '#854D0E',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statusBoxValuePaid: {
    fontSize: 20,
    fontWeight: '900',
    color: '#A16207',
  },

  statusBoxBalanceDue: {
    backgroundColor: '#FEF2F2',
    borderColor: '#F87171',
  },
  statusBoxLabelBalance: {
    fontSize: 11,
    fontWeight: '800',
    color: '#991B1B',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statusBoxValueBalance: {
    fontSize: 20,
    fontWeight: '900',
    color: '#DC2626',
  },

  statusBoxChangeDue: {
    backgroundColor: '#F0FDF4',
    borderColor: '#4ADE80',
  },
  statusBoxLabelChange: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statusBoxValueChange: {
    fontSize: 20,
    fontWeight: '900',
    color: '#15803D',
  },

  // Mode Indicator Bar
  modeIndicatorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  modeIndicatorBarNonCash: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  modeIndicatorText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },

  // Controls Row: Quick Cash Presets + Modern 4x4 Keypad
  controlsRow: {
    flexDirection: 'row',
    gap: 10,
    height: 250,
  },
  presetsStack: {
    width: 105,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    justifyContent: 'space-between',
  },
  presetCashBtn: {
    flex: 1,
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FCD34D',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1,
  },
  presetCashBtnDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    opacity: 0.5,
  },
  presetCashText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#78350F',
  },
  presetCashTextDisabled: {
    color: '#94A3B8',
  },

  // Modern POS 4x4 Keypad Stack
  numpadStack: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 6,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    justifyContent: 'space-between',
  },
  numpadRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  numKey: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  numKeyText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  numKeySpecial: {
    backgroundColor: '#F1F5F9',
  },
  numKeySpecialText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#334155',
  },
  numKeyDelete: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  numKeyClear: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  numKeyClearText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
  },

  // Actions Footer
  actionsFooter: {
    flexDirection: 'row',
    gap: 8,
    height: 48,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 6,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    height: 48,
  },
  saveWithPrintBtn: {
    backgroundColor: '#15803D',
  },
  saveNoPrintBtn: {
    backgroundColor: '#0369A1',
  },
  cancelBtn: {
    flex: 0.75,
    backgroundColor: '#475569',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
