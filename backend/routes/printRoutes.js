// ==============================================================================
// Project: Supermarket Retail POS
// Module: Print Routes (Receipt Print, Test Print, Windows Spooler Diagnostics)
// File: backend/routes/printRoutes.js
// ==============================================================================

const express = require('express');
const router = express.Router();
const os = require('os');
const { sql, getPool } = require('../config/db');
const {
  sendRawToPrinter,
  getActiveReceiptPrinter,
  getInstalledPrinters,
  getDefaultPrinter,
  kickCashDrawer,
} = require('../utils/rawPrinter');
const { buildSaleReceipt, ReceiptBuilder } = require('../utils/receiptBuilder');

// ------------------------------------------------------------------------------
// GET /api/print/printers
// Discovers and lists all installed Windows printers dynamically
// ------------------------------------------------------------------------------
router.get('/printers', async (req, res) => {
  try {
    const installed = getInstalledPrinters();
    const defaultPrinter = getDefaultPrinter();
    const terminalCode = req.query.terminalCode || '';
    const activeResolved = await getActiveReceiptPrinter(terminalCode);

    return res.status(200).json({
      success: true,
      printers: installed,
      defaultPrinter,
      activeResolved,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// POST /api/print/test
// Sends an 80mm test slip directly to the dynamically resolved printer
// ------------------------------------------------------------------------------
router.post('/test', async (req, res) => {
  try {
    const { printerName, terminalCode } = req.body;
    const targetPrinter = await getActiveReceiptPrinter(terminalCode, printerName);

    const b = new ReceiptBuilder(42);
    b.alignCenter();
    b.setBold(true).setDoubleHeight(true);
    b.textLine('HARDWARE PRINTER TEST');
    b.setDoubleHeight(false).setBold(false);
    b.doubleDivider();
    b.alignLeft();
    b.textLine(`PRINTER  : ${targetPrinter}`);
    b.textLine(`TERMINAL : ${terminalCode || os.hostname()}`);
    b.textLine(`WORKSTN  : ${os.hostname()}`);
    b.textLine(`DATE/TIME: ${new Date().toLocaleString()}`);
    b.divider('-');
    b.textLine('ESC/POS Direct Spooler Connection: OK');
    b.textLine('Winspool.Drv RAW Driver Pipeline: OK');
    b.divider('-');
    b.alignCenter();
    b.textLine('RETAIL POS PRINT BRIDGE LIVE');
    b.cutPaper();

    const bytes = b.getBuffer();
    const success = sendRawToPrinter(targetPrinter, bytes);

    return res.status(200).json({
      success,
      printer: targetPrinter,
      message: `Test slip successfully spooled to [${targetPrinter}].`,
    });
  } catch (err) {
    console.error('❌ [TEST PRINT ERROR]:', err.message);
    return res.status(500).json({
      success: false,
      message: `Print error: ${err.message}`,
    });
  }
});

// ------------------------------------------------------------------------------
// POST /api/print/receipt
// Generates and prints an 80mm sales tax invoice receipt using dynamic DB company header
// ------------------------------------------------------------------------------
router.post('/receipt', async (req, res) => {
  try {
    const pool = await getPool();
    const {
      billNo,
      date,
      cashier,
      counter,
      salesman,
      items,
      subTotal,
      discount,
      tax,
      grandTotal,
      payments,
      tendered,
      change,
      isReprint,
      isVoid,
      printerName,
      terminalCode,
      template,
    } = req.body;

    const targetPrinter = await getActiveReceiptPrinter(terminalCode || counter, printerName);

    // Dynamic resolution of Company Master Header from tblMaCompany
    let company = {
      CompanyName: 'RETAIL SUPERMARKET',
      Address1: 'SINGAPORE',
      Address2: '',
      TelNo: '',
      GSTRegNo: '',
    };

    if (pool) {
      try {
        const compRes = await pool.request().query('SELECT TOP 1 * FROM tblMaCompany');
        if (compRes.recordset.length > 0) {
          const c = compRes.recordset[0];
          company = {
            CompanyName: (c.CompanyName || c.Company_Name || '').trim() || company.CompanyName,
            Address1: (c.Address1 || c.Address_1 || '').trim(),
            Address2: (c.Address2 || c.Address_2 || '').trim(),
            TelNo: (c.Phone || c.TelNo || '').trim(),
            GSTRegNo: (c.TaxRegNo || c.BizRegNo || c.GSTNo || '').trim(),
          };
        }
      } catch (dbErr) {
        console.warn('⚠️ [COMPANY MASTER NOTICE]:', dbErr.message);
      }
    }

    const receiptBuffer = buildSaleReceipt({
      company,
      billNo: billNo || 'INV-00000',
      date: date || new Date(),
      cashier: cashier || 'ADMIN',
      counter: counter || terminalCode || os.hostname(),
      salesman: salesman || '',
      items: items || [],
      subTotal: subTotal !== undefined ? subTotal : grandTotal,
      discount: discount || 0,
      tax: tax || 0,
      grandTotal: grandTotal || 0,
      payments: payments || [{ mode: 'CASH', amount: grandTotal }],
      tendered: tendered || grandTotal,
      change: change || 0,
      isReprint: Boolean(isReprint),
      isVoid: Boolean(isVoid),
      template: template || undefined,
      kickDrawerOnCash: true,
    });

    const success = sendRawToPrinter(targetPrinter, receiptBuffer);

    return res.status(200).json({
      success,
      printer: targetPrinter,
      message: `Receipt for bill [${billNo}] printed on [${targetPrinter}].`,
    });
  } catch (err) {
    console.error('❌ [RECEIPT PRINT ERROR]:', err.message);
    return res.status(500).json({
      success: false,
      message: `Receipt print error: ${err.message}`,
    });
  }
});

module.exports = router;
