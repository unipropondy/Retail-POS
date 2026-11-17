// ==============================================================================
// File: settlementRoutes.js
// Description: Express routes for POS Settlement operations matching exact VB.NET
//              frmSettlement.vb, clsSales.vb, and frmPos.vb current database logic.
// Database: Uses existing tables and stored procedures ONLY (No schema alterations).
// ==============================================================================

const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../config/db');
const { sendRawToPrinter, getActiveReceiptPrinter } = require('../utils/rawPrinter');
const { buildSettlementReceipt, buildDayEndReceipt } = require('../utils/receiptBuilder');

/**
 * Helper: Format date as YYYY-MM-DD
 */
function formatDate(d) {
  if (!d) return new Date().toISOString().split('T')[0];
  if (typeof d === 'string' && d.includes('T')) return d.split('T')[0];
  const dateObj = new Date(d);
  if (isNaN(dateObj.getTime())) return new Date().toISOString().split('T')[0];
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 1. Validate Cashier Permission & Password
 * Checks if the cashier has permission to settle or authenticate.
 */
router.post('/validate-cashier', async (req, res) => {
  try {
    const { cashierId, password, terminalCode } = req.body;
    if (!cashierId) {
      return res.status(400).json({ success: false, message: 'Cashier ID is required.' });
    }

    const pool = await getPool();
    const reqDb = pool.request();
    reqDb.input('CashierID', sql.VarChar, String(cashierId).trim());

    // Check user master using exact existing columns from tblMaUserMaster
    let userQuery = `SELECT UserCode, UserName, Password, IsAdmin, IsCashier, IsActive 
                     FROM tblMaUserMaster 
                     WHERE UPPER(RTRIM(LTRIM(UserCode))) = UPPER(@CashierID)
                        OR UPPER(RTRIM(LTRIM(UserName))) = UPPER(@CashierID)`;
    const userRes = await reqDb.query(userQuery);

    if (userRes.recordset.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid Cashier ID.' });
    }

    const user = userRes.recordset[0];
    if (password !== undefined && password !== null && String(password).trim() !== '') {
      if (String(user.Password || '').trim() !== String(password).trim()) {
        return res.status(401).json({ success: false, message: 'Invalid Password.' });
      }
    }

    // Check if terminal has ShowCompTotal setting
    let showCompTotal = false;
    let tillAmount = 0;
    if (terminalCode) {
      const termReq = pool.request();
      termReq.input('TerminalCode', sql.VarChar, String(terminalCode).trim());
      const termRes = await termReq.query(`SELECT TillAmount, ShowCompTotal, SettlementPrint, PrintShortExcess FROM tblMaTerminal WHERE TerminalCode = @TerminalCode`);
      if (termRes.recordset.length > 0) {
        showCompTotal = Boolean(termRes.recordset[0].ShowCompTotal);
        tillAmount = Number(termRes.recordset[0].TillAmount) || 0;
      }
    }

    return res.json({
      success: true,
      cashier: {
        userCode: user.UserCode,
        userName: user.UserName,
        isAdmin: user.IsAdmin
      },
      terminalSettings: {
        showCompTotal,
        tillAmount
      }
    });
  } catch (err) {
    console.error('Error validating settlement cashier:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 2. Get Settlement Initial Data
 * Loads terminal info, existing settlement (if any), currency denominations,
 * and computer totals for pay modes, expenses, and credit sales.
 */
router.get('/init', async (req, res) => {
  try {
    const { locationCode, terminalCode, shiftNo, date } = req.query;
    if (!terminalCode) {
      return res.status(400).json({ success: false, message: 'TerminalCode is required.' });
    }

    const postingDate = formatDate(date);
    const locCode = locationCode ? String(locationCode).trim() : 'HQ';
    const termCode = String(terminalCode).trim();
    const shift = parseInt(shiftNo, 10) || 1;

    const pool = await getPool();

    // A. Terminal Master Settings (TillAmount, ShowCompTotal, PrintShortExcess)
    let terminalSettings = {
      tillAmount: 0,
      showCompTotal: false,
      printShortExcess: false,
      settlementPrint: false
    };
    const termReq = pool.request();
    termReq.input('TerminalCode', sql.VarChar, termCode);
    const termRes = await termReq.query(`SELECT TillAmount, ShowCompTotal, SettlementPrint, PrintShortExcess FROM tblMaTerminal WHERE TerminalCode = @TerminalCode`);
    if (termRes.recordset.length > 0) {
      terminalSettings = {
        tillAmount: Number(termRes.recordset[0].TillAmount) || 0,
        showCompTotal: Boolean(termRes.recordset[0].ShowCompTotal),
        printShortExcess: Boolean(termRes.recordset[0].PrintShortExcess),
        settlementPrint: Boolean(termRes.recordset[0].SettlementPrint)
      };
    }

    // B. Check Existing Settlement in tblPOSTerminalDinamination & tblPOSTerminalSales
    const checkReq = pool.request();
    checkReq.input('PostingDate', sql.SmallDateTime, postingDate);
    checkReq.input('TerminalCode', sql.VarChar, termCode);
    checkReq.input('ShiftNo', sql.Int, shift);

    const existDenomRes = await checkReq.query(`
      SELECT TD.CurrencyValue, TD.Qty, TD.Amount, CD.CurrencyValue AS MasterVal
      FROM tblPOSCurrencyDinamination CD
      LEFT JOIN tblPOSTerminalDinamination TD 
        ON CD.CurrencyValue = TD.CurrencyValue 
        AND TD.PostingDate = @PostingDate 
        AND TD.TerminalCode = @TerminalCode 
        AND TD.ShiftNo = @ShiftNo
      ORDER BY CD.CurrencyValue DESC
    `);

    const isExistingSettlement = existDenomRes.recordset.some(r => r.Qty !== null && r.Qty !== undefined);

    let denominations = [];
    if (isExistingSettlement) {
      // Existing settlement found
      denominations = existDenomRes.recordset.map(r => ({
        currencyValue: Number(r.MasterVal),
        qty: Number(r.Qty || 0),
        amount: Number(r.Amount || 0)
      }));
    } else {
      // No existing settlement: load fresh master denominations
      denominations = existDenomRes.recordset.map(r => ({
        currencyValue: Number(r.MasterVal),
        qty: 0,
        amount: 0
      }));
    }

    // C. Calculate Expenses for Terminal and Shift
    // SELECT ISNULL(SUM(Amount), 0) AS ExpenseAmount FROM tblPOSExpenseCur WHERE LocationCode = @LocationCode AND TerminalCode = @TerminalCode AND (ShiftNo IS NULL OR ShiftNo = @ShiftNo)
    const expReq = pool.request();
    expReq.input('LocationCode', sql.VarChar, locCode);
    expReq.input('TerminalCode', sql.VarChar, termCode);
    expReq.input('ShiftNo', sql.Int, shift);
    const expRes = await expReq.query(`
      SELECT ISNULL(SUM(Amount), 0) AS ExpenseAmount 
      FROM tblPOSExpenseCur 
      WHERE LocationCode = @LocationCode 
        AND TerminalCode = @TerminalCode 
        AND (ShiftNo IS NULL OR ShiftNo = @ShiftNo)
    `);
    const expenseTotal = Number(expRes.recordset[0]?.ExpenseAmount) || 0;

    // D. Credit Sales / Accounts Receipt (fncGetCreditsales)
    // Select Paymode, sum(chequeamt) Amount from tblAccountsReceiptHeader A join tblAccountsReceiptDetail B on A.ReceiptNo=b.ReceiptNo WHERE A.ReceiptDate =(Select max(Invoicedate) from tblPOSSalesHeaderCur) And TerminalCode = ... And (ShiftNo Is Null Or ShiftNo = ...) group by PayMode
    const credReq = pool.request();
    credReq.input('TerminalCode', sql.VarChar, termCode);
    credReq.input('ShiftNo', sql.Int, shift);
    const credRes = await credReq.query(`
      SELECT 
        B.PayMode, 
        ISNULL(SUM(A.ChequeAmt), 0) AS Amount
      FROM tblAccountsReceiptHeader A 
      JOIN tblAccountsReceiptDetail B ON A.ReceiptNo = B.ReceiptNo 
      WHERE A.ReceiptDate = (SELECT MAX(InvoiceDate) FROM tblPOSSalesHeaderCur WHERE TerminalCode = @TerminalCode)
        AND A.TerminalCode = @TerminalCode
        AND (A.ShiftNo IS NULL OR A.ShiftNo = @ShiftNo)
      GROUP BY B.PayMode
    `);
    const creditSales = credRes.recordset || [];
    const creditReceiptTotal = creditSales.reduce((acc, curr) => acc + (Number(curr.Amount) || 0), 0);

    // E. Calculate Computer Sales per Pay Mode
    let payModes = [];

    if (isExistingSettlement) {
      // Load saved sales from tblPOSTerminalSales
      const salesReq = pool.request();
      salesReq.input('PostingDate', sql.SmallDateTime, postingDate);
      salesReq.input('TerminalCode', sql.VarChar, termCode);
      salesReq.input('ShiftNo', sql.Int, shift);
      const savedSalesRes = await salesReq.query(`
        SELECT Paymode, ComputerAmount, ManualAmount, SortOrExcess
        FROM tblPOSTerminalSales
        WHERE PostingDate = @PostingDate
          AND TerminalCode = @TerminalCode
          AND ShiftNo = @ShiftNo
      `);

      payModes = savedSalesRes.recordset.map(r => ({
        payMode: String(r.Paymode).trim(),
        computerAmount: Number(r.ComputerAmount || 0),
        manualAmount: Number(r.ManualAmount || 0),
        difference: Number(r.SortOrExcess || 0)
      }));
    } else {
      // Compute fresh computer sales from tblPOSPayModeDetailCur & tblPOSSalesHeaderCur & tblInvPayMode
      const calcReq = pool.request();
      calcReq.input('TerminalCode', sql.VarChar, termCode);
      calcReq.input('ShiftNo', sql.Int, shift);

      const calcRes = await calcReq.query(`
        SELECT 
          PM.PayMode,
          ISNULL(SUM(CASE 
            WHEN PM.PayMode = 'CASH' THEN (PD.Amount - ISNULL(SH.Balance, 0))
            ELSE PD.Amount 
          END), 0) AS ComputerAmount
        FROM tblInvPayMode PM
        LEFT JOIN tblPOSPayModeDetailCur PD ON PM.PayMode = PD.PayMode
        LEFT JOIN tblPOSSalesHeaderCur SH 
          ON PD.InvoiceNo = SH.InvoiceNo 
          AND SH.TerminalCode = @TerminalCode 
          AND (SH.ShiftNo IS NULL OR SH.ShiftNo = @ShiftNo)
        GROUP BY PM.PayMode
      `);

      payModes = calcRes.recordset.map(r => {
        const modeName = String(r.PayMode).trim();
        let compAmt = Number(r.ComputerAmount) || 0;

        // Deduct expense from Cash
        if (modeName.toUpperCase() === 'CASH') {
          compAmt = Math.max(0, compAmt - expenseTotal);
        }

        return {
          payMode: modeName,
          computerAmount: parseFloat(compAmt.toFixed(2)),
          manualAmount: 0,
          difference: parseFloat((-compAmt).toFixed(2))
        };
      });

      // Add Expense Amt row if expenseTotal > 0 or as standard row
      if (expenseTotal > 0) {
        payModes.push({
          payMode: 'Expense Amt',
          computerAmount: parseFloat(expenseTotal.toFixed(2)),
          manualAmount: parseFloat(expenseTotal.toFixed(2)),
          difference: 0
        });
      }
    }

    return res.json({
      success: true,
      isExistingSettlement,
      terminalSettings,
      denominations,
      payModes,
      expenseTotal,
      creditReceiptTotal
    });
  } catch (err) {
    console.error('Error in /api/settlement/init:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 3. Save Settlement
 * Runs inside an atomic SQL transaction:
 * - Deletes existing records from tblPOSTerminalSales and tblPOSTerminalDinamination for date, terminal, shift
 * - Inserts denominations via sp_PosTerminalDinaminationSave
 * - Inserts paymodes via sp_PosTerminalSalesSave
 * - Updates ShiftNo in tblPOSSalesHeaderCur, tblPosSalesHeaderCLEAR, tblPosSalesDetailCLEAR, tblAccountsReceiptHeader, and tblPOSExpenseCur
 */
router.post('/save', async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    const {
      locationCode,
      terminalCode,
      shiftNo,
      date,
      cashierId,
      denominations,
      payModes,
      expenseAmount
    } = req.body;

    if (!terminalCode || !cashierId) {
      return res.status(400).json({ success: false, message: 'TerminalCode and CashierId are required.' });
    }

    const postingDate = formatDate(date);
    const locCode = locationCode ? String(locationCode).trim() : 'HQ';
    const termCode = String(terminalCode).trim();
    const shift = parseInt(shiftNo, 10) || 1;
    const cId = String(cashierId).trim();

    await transaction.begin();

    // Step A: Delete previous records from tblPOSTerminalSales and tblPOSTerminalDinamination
    const delReq = new sql.Request(transaction);
    delReq.input('PostingDate', sql.SmallDateTime, postingDate);
    delReq.input('TerminalCode', sql.VarChar, termCode);
    delReq.input('ShiftNo', sql.Int, shift);

    await delReq.query(`
      DELETE FROM tblPOSTerminalSales 
      WHERE PostingDate = @PostingDate AND TerminalCode = @TerminalCode AND ShiftNo = @ShiftNo;

      DELETE FROM tblPOSTerminalDinamination 
      WHERE PostingDate = @PostingDate AND TerminalCode = @TerminalCode AND ShiftNo = @ShiftNo;
    `);

    // Step B: Save Denominations via sp_PosTerminalDinaminationSave
    if (Array.isArray(denominations)) {
      for (const d of denominations) {
        const qty = Number(d.qty) || 0;
        const val = Number(d.currencyValue) || 0;
        const amt = Number(d.amount) || (qty * val);

        if (qty > 0) {
          const denomReq = new sql.Request(transaction);
          denomReq.input('LocationCode', sql.VarChar(50), locCode);
          denomReq.input('TerminalCode', sql.VarChar(50), termCode);
          denomReq.input('ShiftNo', sql.Int, shift);
          denomReq.input('PostingDate', sql.SmallDateTime, postingDate);
          denomReq.input('CashierID', sql.VarChar(50), cId);
          denomReq.input('CurrencyValue', sql.Decimal(18, 2), val);
          denomReq.input('Qty', sql.Decimal(18, 2), qty);
          denomReq.input('Amount', sql.Decimal(18, 2), amt);

          await denomReq.execute('sp_PosTerminalDinaminationSave');
        }
      }
    }

    // Step C: Save PayModes via sp_PosTerminalSalesSave
    if (Array.isArray(payModes)) {
      for (const pm of payModes) {
        const pMode = String(pm.payMode).trim();
        const compAmt = Number(pm.computerAmount) || 0;
        const manAmt = Number(pm.manualAmount) || 0;
        const diff = Number(pm.difference !== undefined ? pm.difference : (manAmt - compAmt));

        const pmReq = new sql.Request(transaction);
        pmReq.input('LocationCode', sql.VarChar(50), locCode);
        pmReq.input('TerminalCode', sql.VarChar(50), termCode);
        pmReq.input('PostingDate', sql.SmallDateTime, postingDate);
        pmReq.input('ShiftNo', sql.Int, shift);
        pmReq.input('Paymode', sql.VarChar(50), pMode);
        pmReq.input('CashierID', sql.VarChar(50), cId);
        pmReq.input('ComputerAmount', sql.Decimal(18, 2), compAmt);
        pmReq.input('ManualAmount', sql.Decimal(18, 2), manAmt);
        pmReq.input('SortOrExcess', sql.Decimal(18, 2), diff);

        await pmReq.execute('sp_PosTerminalSalesSave');
      }
    }

    // Step D: Update ShiftNo in tblPOSSalesHeaderCur
    const updSalesReq = new sql.Request(transaction);
    updSalesReq.input('TerminalCode', sql.VarChar(50), termCode);
    updSalesReq.input('ShiftNo', sql.Int, shift);
    await updSalesReq.query(`
      UPDATE tblPOSSalesHeaderCur 
      SET ShiftNo = @ShiftNo 
      WHERE TerminalCode = @TerminalCode AND ShiftNo IS NULL
    `);

    // Step E: Update ShiftNo in tblPosSalesHeaderCLEAR and tblPosSalesDetailCLEAR
    const updClearReq = new sql.Request(transaction);
    updClearReq.input('TerminalCode', sql.VarChar(50), termCode);
    updClearReq.input('ShiftNo', sql.Int, shift);
    await updClearReq.query(`
      UPDATE tblPosSalesHeaderCLEAR 
      SET ShiftNo = @ShiftNo 
      WHERE TerminalCode = @TerminalCode AND ShiftNo IS NULL;

      UPDATE tblPosSalesDetailCLEAR 
      SET ShiftNo = @ShiftNo 
      WHERE TerminalCode = @TerminalCode AND ShiftNo IS NULL;
    `);

    // Step F: Update ShiftNo in tblAccountsReceiptHeader
    const updRecReq = new sql.Request(transaction);
    updRecReq.input('TerminalCode', sql.VarChar(50), termCode);
    updRecReq.input('ShiftNo', sql.Int, shift);
    await updRecReq.query(`
      UPDATE tblAccountsReceiptHeader 
      SET ShiftNo = @ShiftNo 
      WHERE ReceiptDate >= (SELECT ISNULL(MIN(InvoiceDate), '1900-01-01') FROM tblPOSSalesHeaderCur WHERE TerminalCode = @TerminalCode)
        AND ShiftNo IS NULL 
        AND TerminalCode = @TerminalCode
    `);

    // Step G: Update ShiftNo in tblPOSExpenseCur
    const updExpReq = new sql.Request(transaction);
    updExpReq.input('TerminalCode', sql.VarChar(50), termCode);
    updExpReq.input('ShiftNo', sql.Int, shift);
    await updExpReq.query(`
      UPDATE tblPOSExpenseCur 
      SET ShiftNo = @ShiftNo 
      WHERE TerminalCode = @TerminalCode AND ShiftNo IS NULL
    `);

    await transaction.commit();

    // Step H: Auto-Print Settlement Slip if SettlementPrint enabled in tblMaTerminal
    // Matching VB.NET frmSettlement.vb:
    // If fncTerminalSalesSave() Then
    //    subPrintSettlement()
    let printResult = false;
    try {
      // Lookup terminal settings
      const termCheck = pool.request();
      termCheck.input('TerminalCode', sql.VarChar(50), termCode);
      const termRes = await termCheck.query(`
        SELECT SettlementPrint, TillAmount 
        FROM tblMaTerminal 
        WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@TerminalCode)
      `);
      const termData = termRes.recordset[0] || {};
      const shouldPrint = termData.SettlementPrint !== false && termData.SettlementPrint !== 0;

      if (shouldPrint) {
        // Query company name from tblMaCompany
        const compRes = await pool.request().query('SELECT TOP 1 CompanyName, LocationCode FROM tblMaCompany');
        const companyName = compRes.recordset[0]?.CompanyName || 'SUPERMARKET';

        // Query sales totals from tblPOSSalesHeaderCur
        const totReq = pool.request();
        totReq.input('TerminalCode', sql.VarChar(50), termCode);
        totReq.input('ShiftNo', sql.Int, shift);
        const totRes = await totReq.query(`
          SELECT 
            SUM(NetTotal) AS NetTotal, 
            SUM(TotalDiscount) AS Disc, 
            SUM(Gst) AS Gst, 
            SUM(Roundoff) AS Roundoff 
          FROM tblPOSSalesHeaderCur 
          WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@TerminalCode) 
            AND ShiftNo = @ShiftNo
        `);
        const totRow = totRes.recordset[0] || {};

        const buffer = buildSettlementReceipt({
          companyName,
          locationCode: locCode,
          terminalCode: termCode,
          cashierId: cId,
          shiftNo: shift,
          date: postingDate,
          denominations,
          payModes,
          subTotal: Number(totRow.NetTotal || 0),
          netTotal: Number(totRow.NetTotal || 0),
          discount: Number(totRow.Disc || 0),
          gst: Number(totRow.Gst || 0),
          roundOff: Number(totRow.Roundoff || 0),
          tillAmount: Number(termData.TillAmount || 0),
          expenseAmount: Number(expenseAmount || 0),
        });

        const activePrinter = await getActiveReceiptPrinter(termCode);
        printResult = await sendRawToPrinter(activePrinter, buffer);
        console.log(`🖨️ [SETTLEMENT PRINT] Spooled settlement slip to [${activePrinter}] -> Result: ${printResult}`);
      }
    } catch (prnErr) {
      console.warn('⚠️ [SETTLEMENT AUTO-PRINT ERROR]:', prnErr.message);
    }

    return res.json({
      success: true,
      message: 'Settlement saved successfully.',
      printed: printResult
    });
  } catch (err) {
    if (transaction) {
      try { await transaction.rollback(); } catch (rbErr) { /* ignore rollback error */ }
    }
    console.error('Error saving settlement:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 4. Get Settlement Print Summary
 * Runs Sp_TempPOSTransactionByShift and retrieves summary report from tblTempTerminalTransaction.
 */
router.get('/print-summary', async (req, res) => {
  try {
    const { terminalCode, date, shiftNo, userId } = req.query;
    if (!terminalCode) {
      return res.status(400).json({ success: false, message: 'TerminalCode is required.' });
    }

    const salesDate = formatDate(date);
    const termCode = String(terminalCode).trim();
    const shift = String(shiftNo || 1).trim();
    const uId = String(userId || '').trim();

    const pool = await getPool();

    // Call Sp_TempPOSTransactionByShift
    const spReq = pool.request();
    spReq.input('TerminalID', sql.Char(10), termCode);
    spReq.input('SalesDate', sql.DateTime, salesDate);
    spReq.input('ShiftNo', sql.Char(10), shift);
    spReq.input('UserID', sql.Char(10), uId);

    await spReq.execute('Sp_TempPOSTransactionByShift');

    // Retrieve from tblTempTerminalTransaction
    const getReq = pool.request();
    getReq.input('TerminalID', sql.VarChar, termCode);
    const summaryRes = await getReq.query(`
      SELECT * FROM tblTempTerminalTransaction WHERE TerminalID = @TerminalID
    `);

    return res.json({
      success: true,
      summary: summaryRes.recordset[0] || null
    });
  } catch (err) {
    console.error('Error getting settlement print summary:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 5. POST /api/settlement/reprint-slip
 * Re-prints the Cashier Settlement Slip on demand matching subPrintSettlement
 */
router.post('/reprint-slip', async (req, res) => {
  try {
    const pool = await getPool();

    // 0. Resolve Company & Default Terminal from DB if not provided
    const compRes = await pool.request().query('SELECT TOP 1 CompanyName, LocationCode, CompanyShortCode FROM tblMaCompany');
    const dbComp = compRes.recordset[0] || {};
    const companyName = String(dbComp.CompanyName || '').trim();
    const locCode = String(dbComp.LocationCode || '').trim();
    const shortCode = String(dbComp.CompanyShortCode || '').trim();

    let termCode = String(terminalCode || '').trim();
    if (!termCode) {
      const termLookup = await pool.request().query('SELECT TOP 1 TerminalCode FROM tblMaTerminal ORDER BY TerminalCode ASC');
      termCode = String(termLookup.recordset[0]?.TerminalCode || '').trim();
    }
    const cId = String(cashierId || '').trim();
    const shift = parseInt(shiftNo, 10) || 1;
    const postingDate = formatDate(date);

    // 1. Fetch saved denominations from tblPOSTerminalDinamination
    const denomReq = pool.request();
    denomReq.input('PostingDate', sql.SmallDateTime, postingDate);
    denomReq.input('TerminalCode', sql.VarChar(50), termCode);
    denomReq.input('ShiftNo', sql.Int, shift);
    const denomRes = await denomReq.query(`
      SELECT CurrencyValue, Qty, Amount 
      FROM tblPOSTerminalDinamination 
      WHERE PostingDate = @PostingDate AND TerminalCode = @TerminalCode AND ShiftNo = @ShiftNo
      ORDER BY CurrencyValue DESC
    `);
    const denominations = denomRes.recordset.map(r => ({
      currencyValue: Number(r.CurrencyValue || 0),
      qty: Number(r.Qty || 0),
      amount: Number(r.Amount || 0)
    }));

    // 2. Fetch saved paymodes from tblPOSTerminalSales
    const salesReq = pool.request();
    salesReq.input('PostingDate', sql.SmallDateTime, postingDate);
    salesReq.input('TerminalCode', sql.VarChar(50), termCode);
    salesReq.input('ShiftNo', sql.Int, shift);
    const salesRes = await salesReq.query(`
      SELECT Paymode, ComputerAmount, ManualAmount, SortOrExcess 
      FROM tblPOSTerminalSales 
      WHERE PostingDate = @PostingDate AND TerminalCode = @TerminalCode AND ShiftNo = @ShiftNo
    `);
    const payModes = salesRes.recordset.map(r => ({
      payMode: String(r.Paymode).trim(),
      computerAmount: Number(r.ComputerAmount || 0),
      manualAmount: Number(r.ManualAmount || 0),
      difference: Number(r.SortOrExcess || 0)
    }));

    // 3. Fetch Terminal Master (Till Amount)
    const termReq = pool.request();
    termReq.input('TerminalCode', sql.VarChar(50), termCode);
    const termRes = await termReq.query(`
      SELECT TillAmount FROM tblMaTerminal WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@TerminalCode)
    `);
    const tillAmount = Number(termRes.recordset[0]?.TillAmount || 0);

    // 4. Fetch expense amount
    const expReq = pool.request();
    expReq.input('TerminalCode', sql.VarChar(50), termCode);
    expReq.input('ShiftNo', sql.Int, shift);
    const expRes = await expReq.query(`
      SELECT ISNULL(SUM(Amount), 0) AS ExpTotal 
      FROM tblPOSExpenseCur 
      WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@TerminalCode) AND ShiftNo = @ShiftNo
    `);
    const expenseAmount = Number(expRes.recordset[0]?.ExpTotal || 0);

    // 5. Fetch sales totals from tblPOSSalesHeaderCur
    const totReq = pool.request();
    totReq.input('TerminalCode', sql.VarChar(50), termCode);
    totReq.input('ShiftNo', sql.Int, shift);
    const totRes = await totReq.query(`
      SELECT 
        SUM(NetTotal) AS NetTotal, 
        SUM(TotalDiscount) AS Disc, 
        SUM(Gst) AS Gst, 
        SUM(Roundoff) AS Roundoff 
      FROM tblPOSSalesHeaderCur 
      WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@TerminalCode) 
        AND ShiftNo = @ShiftNo
    `);
    const totRow = totRes.recordset[0] || {};

    const buffer = buildSettlementReceipt({
      companyName,
      locationCode: locCode,
      terminalCode: termCode,
      cashierId: cId,
      shiftNo: shift,
      date: postingDate,
      denominations,
      payModes,
      subTotal: Number(totRow.NetTotal || 0),
      netTotal: Number(totRow.NetTotal || 0),
      discount: Number(totRow.Disc || 0),
      gst: Number(totRow.Gst || 0),
      roundOff: Number(totRow.Roundoff || 0),
      tillAmount,
      expenseAmount,
    });

    const activePrinter = await getActiveReceiptPrinter(termCode);
    const printResult = await sendRawToPrinter(activePrinter, buffer);
    console.log(`🖨️ [SETTLEMENT RE-PRINT] Spooled slip to [${activePrinter}] -> Result: ${printResult}`);

    return res.json({
      success: true,
      message: `Settlement slip spooled to ${activePrinter}`,
      printed: printResult
    });
  } catch (err) {
    console.error('❌ [SETTLEMENT REPRINT ERROR]:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 6. POST /api/settlement/day-end
 * Implements exact VB.NET lbl_dayend_Click from frmPos.vb:
 * 1. Checks if any bill exists: If none -> "No Sales to Dayend"
 * 2. Checks if any bill is un-settled (ShiftNo is null) -> "Please do Settlement Before Dayend"
 * 3. Calls `Exec sp_Dayend 'N', @Date, @User, @CompanyCode`
 * 4. Logs the operation and returns result
 */
router.post('/day-end', async (req, res) => {
  try {
    const pool = await getPool();

    // 0. Resolve User and Company from DB
    const compRes = await pool.request().query('SELECT TOP 1 CompanyName, LocationCode, CompanyShortCode FROM tblMaCompany');
    const dbComp = compRes.recordset[0] || {};
    const shortCode = String(dbComp.CompanyShortCode || '').trim();

    let user = String(cashierId || '').trim();
    if (!user) {
      const userLookup = await pool.request().query('SELECT TOP 1 UserCode FROM tblMaUserMaster WHERE IsCashier = 1 OR IsAdmin = 1 ORDER BY UserCode ASC');
      user = String(userLookup.recordset[0]?.UserCode || 'UPS').trim();
    }

    console.log(`\n====================================================`);
    console.log(`🌅 [DAY END AUDIT] Initiation by user [${user}] on terminal [${terminalCode || 'DYNAMIC'}]`);
    console.log(`====================================================`);

    // Step 1: Check if sales exist in tblPOSSalesHeaderCur
    const chkSalesRes = await pool.request().query('SELECT TOP 1 InvoiceNo FROM tblPOSSalesHeaderCur');
    if (chkSalesRes.recordset.length === 0) {
      console.log(`ℹ️ [DAY END] Blocked: No sales in tblPOSSalesHeaderCur to day-end.`);
      return res.status(400).json({
        success: false,
        message: 'No Sales to Dayend'
      });
    }

    // Step 2: Check for un-settled sales (ShiftNo is NULL or 0)
    const chkUnsettledRes = await pool.request().query(`
      SELECT TOP 1 InvoiceNo 
      FROM tblPOSSalesHeaderCur 
      WHERE NetTotal <> 0 AND (ShiftNo IS NULL OR ShiftNo = 0)
      ORDER BY InvoiceNo
    `);

    if (chkUnsettledRes.recordset.length > 0) {
      const openInv = chkUnsettledRes.recordset[0].InvoiceNo;
      console.log(`⚠️ [DAY END] Blocked: Found un-settled bill [${openInv}]. Settlement must be completed first.`);
      return res.status(400).json({
        success: false,
        message: 'Please do Settlement Before Dayend',
        unsettledInvoice: openInv
      });
    }

    // Step 3: Fetch Server Date
    const serverDateRes = await pool.request().query('SELECT GETDATE() AS ServerDate');
    const serverDate = serverDateRes.recordset[0]?.ServerDate || new Date();

    console.log(`🔄 [DAY END] Executing sp_Dayend with Date=[${serverDate.toISOString().split('T')[0]}], User=[${user}], Company=[${shortCode}]...`);

    // Step 4: Execute sp_Dayend
    const spReq = pool.request();
    spReq.input('Flag', sql.Char(1), 'N');
    spReq.input('Date', sql.SmallDateTime, serverDate);
    spReq.input('User', sql.VarChar(50), user);
    spReq.input('CompanyCode', sql.VarChar(50), shortCode);

    try {
      await spReq.execute('sp_Dayend');
      console.log(`✅ [DAY END] sp_Dayend executed successfully! Day-end completed.`);
    } catch (spErr) {
      // Fallback: If SP uses raw query parameters instead of named
      console.warn(`⚠️ [DAY END] Stored procedure execution retry via direct query: ${spErr.message}`);
      const fallbackReq = pool.request();
      fallbackReq.input('d', sql.SmallDateTime, serverDate);
      fallbackReq.input('u', sql.VarChar(50), user);
      fallbackReq.input('c', sql.VarChar(50), shortCode);
      await fallbackReq.query(`EXEC sp_Dayend 'N', @d, @u, @c`);
      console.log(`✅ [DAY END] Fallback execution succeeded.`);
    }

    // Step 5: Day End Reporting Summary (rptDayendReport_ERP parity)
    const reportDateStr = serverDate.toISOString().split('T')[0];
    const dayTotalsRes = await pool.request()
      .input('dStr', sql.VarChar(10), reportDateStr)
      .query(`
        SELECT 
          ISNULL(SUM(NetTotal), 0) AS NetTotal,
          ISNULL(SUM(TotalValue), 0) AS GrossTotal,
          ISNULL(SUM(TotalDiscount), 0) AS TotalDiscount,
          ISNULL(SUM(Gst), 0) AS Gst,
          ISNULL(SUM(Roundoff), 0) AS Roundoff,
          COUNT(InvoiceNo) AS BillCount
        FROM tblPOSSalesHeader 
        WHERE CONVERT(varchar(10), InvoiceDate, 120) = @dStr
      `);

    const dayPaymodesRes = await pool.request()
      .input('dStr', sql.VarChar(10), reportDateStr)
      .query(`
        SELECT 
          RTRIM(LTRIM(Paymode)) AS Paymode,
          ISNULL(SUM(Amount), 0) AS TotalAmount
        FROM tblPOSPayModeDetail
        WHERE CONVERT(varchar(10), SalesDate, 120) = @dStr
        GROUP BY RTRIM(LTRIM(Paymode))
      `);

    const dayReport = {
      date: reportDateStr,
      company: shortCode,
      user: user,
      totals: dayTotalsRes.recordset[0] || {
        NetTotal: 0,
        GrossTotal: 0,
        TotalDiscount: 0,
        Gst: 0,
        Roundoff: 0,
        BillCount: 0
      },
      paymodes: dayPaymodesRes.recordset || []
    };

    return res.json({
      success: true,
      message: 'Dayend Successfully Completed',
      date: reportDateStr,
      report: dayReport
    });
  } catch (err) {
    console.error('❌ [DAY END ERROR]:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 7. POST /api/settlement/day-end/print
 * Prints Day End Z-Report thermal slip (rptDayendReport_ERP parity)
 */
router.post('/day-end/print', async (req, res) => {
  try {
    const { date, terminalCode, cashierId } = req.body;
    const reportDateStr = formatDate(date);

    const pool = await getPool();

    // 1. Fetch Company Master from DB
    const compRes = await pool.request().query('SELECT TOP 1 CompanyName, LocationCode FROM tblMaCompany');
    const companyName = String(compRes.recordset[0]?.CompanyName || '').trim();
    const locCode = String(compRes.recordset[0]?.LocationCode || '').trim();

    // 2. Resolve Terminal Code from DB if not passed
    let termCode = String(terminalCode || '').trim();
    if (!termCode) {
      const termLookup = await pool.request().query('SELECT TOP 1 TerminalCode FROM tblMaTerminal ORDER BY TerminalCode ASC');
      termCode = String(termLookup.recordset[0]?.TerminalCode || '').trim();
    }
    const cId = String(cashierId || '').trim();

    // 2. Fetch Totals from tblPOSSalesHeader
    const totalsRes = await pool.request()
      .input('dStr', sql.VarChar(10), reportDateStr)
      .query(`
        SELECT 
          ISNULL(SUM(NetTotal), 0) AS NetTotal,
          ISNULL(SUM(TotalValue), 0) AS GrossTotal,
          ISNULL(SUM(TotalDiscount), 0) AS TotalDiscount,
          ISNULL(SUM(Gst), 0) AS Gst,
          ISNULL(SUM(Roundoff), 0) AS Roundoff,
          COUNT(InvoiceNo) AS BillCount
        FROM tblPOSSalesHeader 
        WHERE CONVERT(varchar(10), InvoiceDate, 120) = @dStr
      `);

    // 3. Fetch Paymode collection from tblPOSPayModeDetail
    const paymodesRes = await pool.request()
      .input('dStr', sql.VarChar(10), reportDateStr)
      .query(`
        SELECT 
          RTRIM(LTRIM(Paymode)) AS Paymode,
          ISNULL(SUM(Amount), 0) AS TotalAmount
        FROM tblPOSPayModeDetail
        WHERE CONVERT(varchar(10), SalesDate, 120) = @dStr
        GROUP BY RTRIM(LTRIM(Paymode))
      `);

    const buffer = buildDayEndReceipt({
      companyName,
      locationName: locCode,
      cashierId: cId,
      date: reportDateStr,
      totals: totalsRes.recordset[0] || {},
      paymodes: paymodesRes.recordset || [],
    });

    const activePrinter = await getActiveReceiptPrinter(termCode);
    const printResult = await sendRawToPrinter(activePrinter, buffer);
    console.log(`🖨️ [DAY END Z-REPORT PRINT] Spooled to [${activePrinter}] -> Result: ${printResult}`);

    return res.json({
      success: true,
      message: `Day End Z-Report spooled to ${activePrinter}`,
      printed: printResult
    });
  } catch (err) {
    console.error('❌ [DAY END PRINT ERROR]:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
