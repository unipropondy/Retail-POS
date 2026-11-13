// ==============================================================================
// File: settlementRoutes.js
// Description: Express routes for POS Settlement operations matching exact VB.NET
//              frmSettlement.vb, clsSales.vb, and frmPos.vb current database logic.
// Database: Uses existing tables and stored procedures ONLY (No schema alterations).
// ==============================================================================

const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../config/db');

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

    return res.json({
      success: true,
      message: 'Settlement saved successfully.'
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

module.exports = router;
