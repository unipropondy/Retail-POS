// ==============================================================================
// Author: JAVITH, BAVANI 17-11-2026
// Project: Supermarket Retail POS
// Module: Day End Z-Report Modal (rptDayendReport_ERP Parity)
// File: frontend/src/components/DayEndModal.tsx
// Description: Displays Day End closing audit, Z-Report financial summary,
//              direct thermal slip print, and CSV/PDF export.
// ==============================================================================

import React, { useState } from 'react';
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
import { getBackendBaseUrl } from '../config/appConfig';

const API_URL = getBackendBaseUrl();

export interface DayEndReportData {
  date: string;
  company?: string;
  user?: string;
  totals: {
    NetTotal: number;
    GrossTotal: number;
    TotalDiscount: number;
    Gst: number;
    Roundoff: number;
    BillCount: number;
  };
  paymodes: Array<{
    Paymode: string;
    TotalAmount: number;
  }>;
}

interface DayEndModalProps {
  visible: boolean;
  onClose: () => void;
  reportData: DayEndReportData | null;
  terminalCode?: string;
  cashierId?: string;
}

export const DayEndModal: React.FC<DayEndModalProps> = ({
  visible,
  onClose,
  reportData,
  terminalCode = '',
  cashierId = '',
}) => {
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printStatus, setPrintStatus] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  if (!visible || !reportData) return null;

  const totals = reportData.totals || {
    NetTotal: 0,
    GrossTotal: 0,
    TotalDiscount: 0,
    Gst: 0,
    Roundoff: 0,
    BillCount: 0,
  };

  const paymodes = reportData.paymodes || [];
  const totalCollections = paymodes.reduce((acc, curr) => acc + (Number(curr.TotalAmount) || 0), 0);

  // 1. Thermal Z-Report Print
  const handlePrintSlip = async () => {
    if (isPrinting) return;
    setPrintStatus(null);
    try {
      setIsPrinting(true);
      const res = await fetch(`${API_URL}/api/settlement/day-end/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: reportData.date,
          terminalCode,
          cashierId,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPrintStatus({
          type: 'success',
          message: 'Day End Z-Report thermal slip sent to printer successfully!',
        });
      } else {
        setPrintStatus({
          type: 'warning',
          message: `Print Notice: ${data.message || 'Printer response failed.'}`,
        });
      }
    } catch (e: any) {
      setPrintStatus({
        type: 'error',
        message: `Print Error: ${e.message || 'Network communication failed.'}`,
      });
    } finally {
      setIsPrinting(false);
    }
  };

  // 2. Download Audit Report (CSV / Text Report)
  const handleExportCSV = () => {
    if (Platform.OS !== 'web') return;

    let csvContent = `SUPERMARKET RETAIL POS - DAY END Z-REPORT\r\n`;
    csvContent += `Business Date,${reportData.date}\r\n`;
    csvContent += `Audited By,${cashierId}\r\n`;
    csvContent += `Terminal,${terminalCode}\r\n`;
    csvContent += `Total Bills,${totals.BillCount}\r\n\r\n`;

    csvContent += `FINANCIAL SUMMARY\r\n`;
    csvContent += `Metric,Amount ($)\r\n`;
    csvContent += `Gross Sales,${Number(totals.GrossTotal || 0).toFixed(2)}\r\n`;
    csvContent += `Total Discount,${Number(totals.TotalDiscount || 0).toFixed(2)}\r\n`;
    csvContent += `Tax (GST),${Number(totals.Gst || 0).toFixed(2)}\r\n`;
    csvContent += `Round Off,${Number(totals.Roundoff || 0).toFixed(2)}\r\n`;
    csvContent += `NET SALES TOTAL,${Number(totals.NetTotal || 0).toFixed(2)}\r\n\r\n`;

    csvContent += `PAYMENT MODES BREAKDOWN\r\n`;
    csvContent += `Paymode,Amount ($)\r\n`;
    paymodes.forEach((p) => {
      csvContent += `${p.Paymode},${Number(p.TotalAmount || 0).toFixed(2)}\r\n`;
    });
    csvContent += `TOTAL COLLECTION,${totalCollections.toFixed(2)}\r\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Z_REPORT_DAYEND_${reportData.date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headerBar}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MaterialCommunityIcons name="calendar-check" size={24} color="#FFFFFF" />
              <Text style={styles.headerTitle}>Day End Closing • Z-Report</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <ScrollView style={styles.scrollBody} contentContainerStyle={{ padding: 18, gap: 16 }}>
            {/* Real-time In-App Print Feedback Banner */}
            {printStatus ? (
              <View
                style={[
                  styles.printFeedbackBanner,
                  printStatus.type === 'success' && styles.printFeedbackSuccess,
                  printStatus.type === 'warning' && styles.printFeedbackWarning,
                  printStatus.type === 'error' && styles.printFeedbackError,
                ]}
              >
                <MaterialCommunityIcons
                  name={
                    printStatus.type === 'success'
                      ? 'check-circle'
                      : printStatus.type === 'warning'
                      ? 'alert'
                      : 'close-circle'
                  }
                  size={20}
                  color={
                    printStatus.type === 'success'
                      ? '#15803D'
                      : printStatus.type === 'warning'
                      ? '#B45309'
                      : '#DC2626'
                  }
                />
                <Text
                  style={[
                    styles.printFeedbackText,
                    printStatus.type === 'success' && { color: '#166534' },
                    printStatus.type === 'warning' && { color: '#92400E' },
                    printStatus.type === 'error' && { color: '#991B1B' },
                  ]}
                >
                  {printStatus.message}
                </Text>
              </View>
            ) : null}

            {/* Success Banner */}
            <View style={styles.successBanner}>
              <MaterialCommunityIcons name="check-circle" size={28} color="#15803D" />
              <View style={{ flex: 1 }}>
                <Text style={styles.successTitle}>Day End Successfully Executed</Text>
                <Text style={styles.successSub}>
                  Registers closed and sales archived for date: <Text style={{ fontWeight: '800' }}>{reportData.date}</Text>
                </Text>
              </View>
            </View>

            {/* Quick Stats Grid */}
            <View style={styles.statsRow}>
              <View style={[styles.statBox, { backgroundColor: '#ECFDF5', borderColor: '#86EFAC' }]}>
                <Text style={[styles.statLabel, { color: '#065F46' }]}>NET TOTAL SALES</Text>
                <Text style={[styles.statValue, { color: '#047857' }]}>${Number(totals.NetTotal || 0).toFixed(2)}</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: '#FEFCE8', borderColor: '#FDE047' }]}>
                <Text style={[styles.statLabel, { color: '#854D0E' }]}>TOTAL BILLS</Text>
                <Text style={[styles.statValue, { color: '#A16207' }]}>{totals.BillCount}</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' }]}>
                <Text style={[styles.statLabel, { color: '#334155' }]}>TOTAL TAX (GST)</Text>
                <Text style={[styles.statValue, { color: '#1E293B' }]}>${Number(totals.Gst || 0).toFixed(2)}</Text>
              </View>
            </View>

            {/* Financial Summary Table */}
            <View style={styles.tableCard}>
              <View style={styles.tableCardHeader}>
                <Text style={styles.tableCardTitle}>Financial Summary (rptDayendReport_ERP)</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Gross Total (TotalValue)</Text>
                <Text style={styles.summaryVal}>${Number(totals.GrossTotal || 0).toFixed(2)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Discounts</Text>
                <Text style={[styles.summaryVal, { color: '#DC2626' }]}>-${Number(totals.TotalDiscount || 0).toFixed(2)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Tax (GST)</Text>
                <Text style={styles.summaryVal}>${Number(totals.Gst || 0).toFixed(2)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Round Off</Text>
                <Text style={styles.summaryVal}>${Number(totals.Roundoff || 0).toFixed(2)}</Text>
              </View>
              <View style={[styles.summaryRow, styles.summaryRowHighlight]}>
                <Text style={styles.summaryLabelBold}>Net Total</Text>
                <Text style={styles.summaryValBold}>${Number(totals.NetTotal || 0).toFixed(2)}</Text>
              </View>
            </View>

            {/* Payment Modes Collection */}
            <View style={styles.tableCard}>
              <View style={styles.tableCardHeader}>
                <Text style={styles.tableCardTitle}>Payment Modes Collection</Text>
              </View>
              {paymodes.length === 0 ? (
                <View style={{ padding: 14 }}>
                  <Text style={{ color: '#64748B', fontStyle: 'italic' }}>No paymode records found.</Text>
                </View>
              ) : (
                paymodes.map((pm, idx) => (
                  <View key={pm.Paymode || idx} style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>{pm.Paymode}</Text>
                    <Text style={[styles.summaryVal, { fontWeight: '700' }]}>
                      ${Number(pm.TotalAmount || 0).toFixed(2)}
                    </Text>
                  </View>
                ))
              )}
              <View style={[styles.summaryRow, styles.summaryRowHighlight]}>
                <Text style={styles.summaryLabelBold}>Total Collection</Text>
                <Text style={styles.summaryValBold}>${totalCollections.toFixed(2)}</Text>
              </View>
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footerBar}>
            <TouchableOpacity
              style={[styles.btnAction, styles.btnPrintSlip, isPrinting && { opacity: 0.6 }]}
              onPress={handlePrintSlip}
              disabled={isPrinting}
              activeOpacity={0.8}
            >
              {isPrinting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="printer" size={20} color="#FFFFFF" />
                  <Text style={styles.btnActionText}>Print Z-Report Slip</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnAction, styles.btnExportCSV]}
              onPress={handleExportCSV}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="file-delimited" size={20} color="#FFFFFF" />
              <Text style={styles.btnActionText}>Export CSV / Excel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnAction, styles.btnClose]}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.btnActionText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.70)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
  },
  headerBar: {
    height: 52,
    backgroundColor: '#7A0C2E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 6,
  },
  scrollBody: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  // Print Feedback Banner Styles
  printFeedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  printFeedbackSuccess: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  printFeedbackWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  printFeedbackError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  printFeedbackText: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },

  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    borderRadius: 10,
    padding: 14,
  },
  successTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#065F46',
  },
  successSub: {
    fontSize: 13,
    color: '#047857',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statBox: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1.5,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '900',
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  tableCardHeader: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#CBD5E1',
  },
  tableCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  summaryRowHighlight: {
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '600',
  },
  summaryVal: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '700',
  },
  summaryLabelBold: {
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '900',
  },
  summaryValBold: {
    fontSize: 16,
    color: '#15803D',
    fontWeight: '900',
  },
  footerBar: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
  },
  btnAction: {
    flex: 1,
    height: 46,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnPrintSlip: {
    backgroundColor: '#15803D',
  },
  btnExportCSV: {
    backgroundColor: '#0284C7',
  },
  btnClose: {
    flex: 0.6,
    backgroundColor: '#475569',
  },
  btnActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
