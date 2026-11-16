// ==============================================================================
// routes/denominationRoutes.js
// Module: Terminal Dinamination Check (VB.NET FrmDinaminationCheck)
// ==============================================================================

const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../config/db');

// Helper to clean strings
const cleanStr = (val) => (val && typeof val === 'string' ? val.trim() : '');

// ------------------------------------------------------------------------------
// 1. GET /api/denomination/currencies
// Fetches list of active currency values from tblPOSCurrencyDinamination
// ------------------------------------------------------------------------------
router.get('/currencies', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const result = await pool.request().query(`
      SELECT CurrencyValue 
      FROM tblPOSCurrencyDinamination 
      ORDER BY CurrencyValue DESC
    `);

    return res.status(200).json({
      success: true,
      currencies: result.recordset.map((r) => Number(r.CurrencyValue)),
    });
  } catch (err) {
    console.error('❌ [DENOMINATION CURRENCIES ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 2. GET /api/denomination/summary
// Retrieves summary for current session (Expected Cash, Till/Float, Total Cash Sales, Cash Expenses)
// ------------------------------------------------------------------------------
router.get('/summary', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const terminalCode = cleanStr(req.query.terminalCode) || 'HQPC2';
    const locationCode = cleanStr(req.query.locationCode) || 'HQ';
    const shiftNo = parseInt(req.query.shiftNo, 10) || 1;

    // A. Terminal Float / Till Amount
    const termReq = pool.request();
    termReq.input('termCode', sql.VarChar(50), terminalCode);
    const termRes = await termReq.query(`
      SELECT TOP 1 ISNULL(TillAmount, 0) AS TillAmount, TerminalName
      FROM tblMaTerminal
      WHERE RTRIM(LTRIM(TerminalCode)) = @termCode
    `);
    const tillAmount = Number(termRes.recordset[0]?.TillAmount || 0);

    // B. Cash Sales from tblPOSSalesHeaderCur + tblPOSPayModeDetailCur
    const salesReq = pool.request();
    salesReq.input('termCode', sql.VarChar(50), terminalCode);
    const salesRes = await salesReq.query(`
      SELECT ISNULL(SUM(PMD.Amount), 0) AS TotalCashSales
      FROM tblPOSSalesHeaderCur SH
      INNER JOIN tblPOSPayModeDetailCur PMD ON SH.InvoiceNo = PMD.InvoiceNo
      WHERE RTRIM(LTRIM(SH.TerminalCode)) = @termCode
        AND UPPER(RTRIM(LTRIM(PMD.PayMode))) = 'CASH'
    `);
    const totalCashSales = Number(salesRes.recordset[0]?.TotalCashSales || 0);

    // C. Cash Expenses from tblPOSExpenseCur
    const expReq = pool.request();
    expReq.input('termCode', sql.VarChar(50), terminalCode);
    expReq.input('locCode', sql.VarChar(50), locationCode);
    expReq.input('shiftNo', sql.Int, shiftNo);
    const expRes = await expReq.query(`
      SELECT ISNULL(SUM(Amount), 0) AS TotalCashExpenses
      FROM tblPOSExpenseCur
      WHERE RTRIM(LTRIM(TerminalCode)) = @termCode
        AND (LocationCode IS NULL OR RTRIM(LTRIM(LocationCode)) = @locCode)
        AND (ShiftNo IS NULL OR ShiftNo = @shiftNo)
    `);
    const totalCashExpenses = Number(expRes.recordset[0]?.TotalCashExpenses || 0);

    const expectedCashInDrawer = tillAmount + totalCashSales - totalCashExpenses;

    // D. Paymode breakdown for current shift/terminal
    const payModeReq = pool.request();
    payModeReq.input('termCode', sql.VarChar(50), terminalCode);
    const payModeRes = await payModeReq.query(`
      SELECT 
        UPPER(RTRIM(LTRIM(PMD.PayMode))) AS PayMode, 
        ISNULL(SUM(PMD.Amount), 0) AS Amount
      FROM tblPOSSalesHeaderCur SH
      INNER JOIN tblPOSPayModeDetailCur PMD ON SH.InvoiceNo = PMD.InvoiceNo
      WHERE RTRIM(LTRIM(SH.TerminalCode)) = @termCode
      GROUP BY PMD.PayMode
      ORDER BY PayMode ASC
    `);
    const paymodes = payModeRes.recordset.map((r) => ({
      payMode: r.PayMode,
      amount: Number(r.Amount || 0),
    }));

    // E. Check existing saved count in tblPOSTerminalDinamination for this session
    const prevReq = pool.request();
    prevReq.input('termCode', sql.VarChar(50), terminalCode);
    prevReq.input('shiftNo', sql.Int, shiftNo);
    const prevRes = await prevReq.query(`
      SELECT CurrencyValue, Qty, Amount
      FROM tblPOSTerminalDinamination
      WHERE RTRIM(LTRIM(TerminalCode)) = @termCode
        AND ShiftNo = @shiftNo
        AND CONVERT(VARCHAR(10), PostingDate, 120) = CONVERT(VARCHAR(10), GETDATE(), 120)
      ORDER BY CurrencyValue DESC
    `);

    return res.status(200).json({
      success: true,
      terminalCode,
      locationCode,
      tillAmount,
      totalCashSales,
      totalCashExpenses,
      expectedCashInDrawer,
      paymodes,
      previousCounts: prevRes.recordset || [],
    });
  } catch (err) {
    console.error('❌ [DENOMINATION SUMMARY ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 3. POST /api/denomination/save
// Saves cashier counted denominations into tblPOSTerminalDinamination via sp_PosTerminalDinaminationSave
// ------------------------------------------------------------------------------
router.post('/save', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const {
      locationCode = 'HQ',
      terminalCode = 'HQPC2',
      shiftNo = 1,
      cashierId = 'UPS',
      denominations = [],
    } = req.body;

    const loc = cleanStr(locationCode) || 'HQ';
    const term = cleanStr(terminalCode) || 'HQPC2';
    const shift = parseInt(shiftNo, 10) || 1;
    const cashier = cleanStr(cashierId) || 'UPS';

    if (!Array.isArray(denominations) || denominations.length === 0) {
      return res.status(400).json({ success: false, message: 'No denomination items provided' });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. Delete previous entries for today's shift
      const delReq = new sql.Request(transaction);
      delReq.input('term', sql.VarChar(50), term);
      delReq.input('shift', sql.Int, shift);
      await delReq.query(`
        DELETE FROM tblPOSTerminalDinamination
        WHERE RTRIM(LTRIM(TerminalCode)) = @term
          AND ShiftNo = @shift
          AND CONVERT(VARCHAR(10), PostingDate, 120) = CONVERT(VARCHAR(10), GETDATE(), 120)
      `);

      // 2. Insert rows using sp_PosTerminalDinaminationSave
      let totalPhysicalCash = 0;
      for (const item of denominations) {
        const val = Number(item.currencyValue) || 0;
        const qty = Number(item.qty) || 0;
        const amt = parseFloat((val * qty).toFixed(2));

        if (qty > 0) {
          totalPhysicalCash += amt;
          const spReq = new sql.Request(transaction);
          spReq.input('LocationCode', sql.VarChar(10), loc.slice(0, 10));
          spReq.input('TerminalCode', sql.VarChar(10), term.slice(0, 10));
          spReq.input('ShiftNo', sql.Int, shift);
          spReq.input('PostingDate', sql.SmallDateTime, new Date());
          spReq.input('CashierID', sql.VarChar(10), cashier.slice(0, 10));
          spReq.input('CurrencyValue', sql.Decimal(18, 2), val);
          spReq.input('Qty', sql.Decimal(18, 0), qty);
          spReq.input('Amount', sql.Decimal(18, 2), amt);

          await spReq.execute('sp_PosTerminalDinaminationSave');
        }
      }

      await transaction.commit();

      return res.status(200).json({
        success: true,
        message: 'Denomination count saved successfully.',
        totalPhysicalCash: parseFloat(totalPhysicalCash.toFixed(2)),
      });
    } catch (txErr) {
      await transaction.rollback();
      throw txErr;
    }
  } catch (err) {
    console.error('❌ [DENOMINATION SAVE ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

