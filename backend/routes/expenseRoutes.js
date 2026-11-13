// ==============================================================================
// Author: JAVITH, BAVANI 13-11-2026
// Project: Supermarket Retail POS
// Module: POS Expenses / Petty Cash
// File: backend/routes/expenseRoutes.js
// Description: Implements exact VB.NET logic from frmPos1.btn_Expenses_Click
//              and frmExpense.vb:
//              - Cashier Permission check (tblPosPermission with "Ctrl + E")
//              - Admin Password authorization fallback
//              - Generate Next Expense Voucher No (sp_POS_GetNextPosExpenseNo)
//              - Save Expense record into tblPosExpenseCur (sp_POS_ExpenseSave)
//              - Fetch recent expenses for terminal (frmExpensesList)
// ==============================================================================

const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../config/db');

// ------------------------------------------------------------------------------
// 1. POST /api/expenses/permission-check
// Validates whether the cashier group has 'Ctrl + E' permission or checks admin password.
// ------------------------------------------------------------------------------
router.post('/permission-check', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) {
      return res.status(503).json({ success: false, message: 'Database unreachable.' });
    }

    const { cashierGroupCode, adminPassword } = req.body;

    // Check if Cashier has permission directly
    if (cashierGroupCode) {
      const permReq = pool.request();
      permReq.input('CashierGroupCode', sql.VarChar(50), String(cashierGroupCode).trim());
      permReq.input('FunctionCode', sql.VarChar(50), 'Ctrl + E');
      
      const permRes = await permReq.query(`
        SELECT Status 
        FROM tblPosPermission 
        WHERE UPPER(RTRIM(LTRIM(CashierGroupCode))) = UPPER(RTRIM(LTRIM(@CashierGroupCode))) 
          AND UPPER(RTRIM(LTRIM(FunctionCode))) = UPPER(RTRIM(LTRIM(@FunctionCode)))
      `);

      if (permRes.recordset.length > 0 && (permRes.recordset[0].Status === true || permRes.recordset[0].Status === 1)) {
        return res.json({
          success: true,
          authorized: true,
          source: 'cashier_permission',
          message: 'Permission granted for Ctrl + E'
        });
      }
    }

    // If cashier does not have permission, check admin password
    if (adminPassword !== undefined && adminPassword !== null && String(adminPassword).trim() !== '') {
      const adminReq = pool.request();
      adminReq.input('Password', sql.VarChar(50), String(adminPassword).trim());
      const adminRes = await adminReq.query(`
        SELECT UserCode, UserName, IsAdmin, IsActive 
        FROM tblMaUserMaster 
        WHERE Password = @Password AND (IsAdmin = 1 OR IsAdmin = '1') AND (IsActive = 1 OR IsActive = '1')
      `);

      if (adminRes.recordset.length > 0) {
        return res.json({
          success: true,
          authorized: true,
          source: 'admin_override',
          adminUser: adminRes.recordset[0].UserCode,
          message: 'Admin authorization successful'
        });
      } else {
        return res.status(401).json({
          success: false,
          authorized: false,
          message: 'Invalid Admin Password. Access Denied.'
        });
      }
    }

    // Permission required from admin
    return res.json({
      success: true,
      authorized: false,
      needsAdminPassword: true,
      message: 'Cashier does not have Expense permission. Admin authorization required.'
    });

  } catch (error) {
    console.error('❌ [EXPENSES] Error in permission check:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ------------------------------------------------------------------------------
// 2. GET /api/expenses/next-no
// Executes sp_POS_GetNextPosExpenseNo
// ------------------------------------------------------------------------------
router.get('/next-no', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) {
      return res.status(503).json({ success: false, message: 'Database unreachable.' });
    }

    const result = await pool.request().execute('sp_POS_GetNextPosExpenseNo');
    const nextExpenseNo = result.recordset?.[0]?.NextExpenseNo || '';

    return res.json({
      success: true,
      nextExpenseNo: nextExpenseNo.trim()
    });
  } catch (error) {
    console.error('❌ [EXPENSES] Error generating next expense no:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ------------------------------------------------------------------------------
// 3. POST /api/expenses/save
// Atomic Save Execution:
// Executes sp_POS_GetNextPosExpenseNo then sp_POS_ExpenseSave
// ------------------------------------------------------------------------------
router.post('/save', async (req, res) => {
  const { description, amount, locationCode, terminalCode, cashierId, userId } = req.body;

  if (!description || !description.trim()) {
    return res.status(400).json({ success: false, message: 'Please key in the description.' });
  }

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Please key in a valid amount greater than 0.' });
  }

  const cleanLocationCode = String(locationCode || 'HQ').trim();
  const cleanTerminalCode = String(terminalCode || '1').trim();
  const cleanCashier = String(cashierId || 'ADMIN').trim();
  const cleanUserId = String(userId || cleanCashier).trim();
  const cleanDesc = String(description).trim();

  const pool = await getPool();
  if (!pool) {
    return res.status(503).json({ success: false, message: 'Database unreachable.' });
  }

  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // 1. Generate Next Expense No
    const nextNoReq = new sql.Request(transaction);
    const nextNoRes = await nextNoReq.execute('sp_POS_GetNextPosExpenseNo');
    const expenseId = nextNoRes.recordset?.[0]?.NextExpenseNo?.trim();

    if (!expenseId) {
      throw new Error('Failed to retrieve next expense number.');
    }

    // 2. Execute sp_POS_ExpenseSave
    const saveReq = new sql.Request(transaction);
    saveReq.input('ExpenseID', sql.VarChar(20), expenseId);
    saveReq.input('LocationCode', sql.VarChar(10), cleanLocationCode);
    saveReq.input('UserCode', sql.VarChar(10), cleanCashier);
    saveReq.input('TerminalCode', sql.VarChar(10), cleanTerminalCode);
    saveReq.input('Description', sql.VarChar(100), cleanDesc);
    saveReq.input('Amount', sql.Decimal(18, 2), numAmount);
    saveReq.input('UserID', sql.Char(10), cleanUserId.padEnd(10));

    await saveReq.execute('sp_POS_ExpenseSave');

    // 3. Commit Transaction
    await transaction.commit();

    return res.json({
      success: true,
      message: `Expense ${expenseId} saved successfully!`,
      expenseId: expenseId,
      amount: numAmount,
      description: cleanDesc,
      date: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [EXPENSES SAVE ERROR]:', error);
    try {
      await transaction.rollback();
    } catch (rbErr) {
      console.error('❌ Rollback error:', rbErr);
    }
    return res.status(500).json({
      success: false,
      message: 'Error in expense save: ' + error.message
    });
  }
});

// ------------------------------------------------------------------------------
// 4. GET /api/expenses/list
// Returns recent expenses for terminal (frmExpensesList)
// ------------------------------------------------------------------------------
router.get('/list', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) {
      return res.status(503).json({ success: false, message: 'Database unreachable.' });
    }

    const terminalCode = req.query.terminalCode ? String(req.query.terminalCode).trim() : '';

    const listReq = pool.request();
    let query = `
      SELECT 
        RTRIM(LTRIM(ExpenseID)) AS ExpenseID,
        ExpenseDate,
        RTRIM(LTRIM(LocationCode)) AS LocationCode,
        RTRIM(LTRIM(UserCode)) AS UserCode,
        RTRIM(LTRIM(TerminalCode)) AS TerminalCode,
        RTRIM(LTRIM(Description)) AS Description,
        ISNULL(Amount, 0) AS Amount,
        CreateDate
      FROM tblPosExpenseCur
    `;

    if (terminalCode) {
      listReq.input('TerminalCode', sql.VarChar(10), terminalCode);
      query += ` WHERE RTRIM(LTRIM(TerminalCode)) = @TerminalCode `;
    }

    query += ` ORDER BY CreateDate DESC `;

    const result = await listReq.query(query);

    return res.json({
      success: true,
      count: result.recordset.length,
      expenses: result.recordset
    });
  } catch (error) {
    console.error('❌ [EXPENSES] Error fetching expense list:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

