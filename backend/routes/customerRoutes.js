// ==============================================================================
// Author: JAVITH, BAVANI 18-11-2026
// Project: Supermarket Retail POS
// Module: Customer & Credit Sales API (tblInvCustomer & tblAccountsReceivable)
// File: backend/routes/customerRoutes.js
// Description: Customer lookup, credit validation, and accounts receivable parity
//              matching legacy VB.NET frmAddCustomerDetails.vb & clsSales.vb
// ==============================================================================

const express = require('express');
const router = express.Router();
const sql = require('mssql');
const { getPool } = require('../config/db');

// ------------------------------------------------------------------------------
// 1. GET /api/customers/search?query=
// Searches tblInvCustomer by CustomerCode, CustomerName, or Phone
// Matches frmAddCustomerDetails.vb subSearchClick & frmCustomer.vb
// ------------------------------------------------------------------------------
router.get('/search', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const query = String(req.query.query || '').trim();
    let sqlQuery = `
      SELECT TOP 50
        RTRIM(LTRIM(CustomerCode)) AS CustomerCode,
        RTRIM(LTRIM(CustomerName)) AS CustomerName,
        RTRIM(LTRIM(ISNULL(Address1, ''))) AS Address1,
        RTRIM(LTRIM(ISNULL(Country, ''))) AS Country,
        RTRIM(LTRIM(ISNULL(Phone, ''))) AS Phone,
        CAST(ISNULL(CreditLimit, 0) AS DECIMAL(18, 2)) AS CreditLimit
      FROM tblInvCustomer WITH (NOLOCK)
    `;

    const request = pool.request();
    if (query) {
      request.input('term', sql.VarChar(50), `%${query}%`);
      sqlQuery += `
        WHERE CustomerCode LIKE @term 
           OR CustomerName LIKE @term 
           OR Phone LIKE @term
      `;
    }
    sqlQuery += ` ORDER BY CustomerName ASC, CustomerCode ASC`;

    const result = await request.query(sqlQuery);
    return res.status(200).json({
      success: true,
      count: result.recordset.length,
      customers: result.recordset,
    });
  } catch (error) {
    console.error('❌ [CUSTOMER SEARCH ERROR]:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ------------------------------------------------------------------------------
// 2. GET /api/customers/credit-check/:customerCode
// Checks customer credit limit against outstanding debt from tblAccountsReceivable
// Formula matches exact legacy frmAddCustomerDetails.vb lines 75-88:
//   Available Credit = CreditLimit - Outstanding
// ------------------------------------------------------------------------------
router.get('/credit-check/:customerCode', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const customerCode = String(req.params.customerCode || '').trim();
    if (!customerCode || customerCode.toUpperCase() === 'CASH') {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer code for credit sales.',
      });
    }

    // 1. Fetch customer master & credit limit
    const custReq = pool.request();
    custReq.input('code', sql.VarChar(50), customerCode);
    const custRes = await custReq.query(`
      SELECT TOP 1
        RTRIM(LTRIM(CustomerCode)) AS CustomerCode,
        RTRIM(LTRIM(CustomerName)) AS CustomerName,
        RTRIM(LTRIM(ISNULL(Address1, ''))) AS Address1,
        RTRIM(LTRIM(ISNULL(Country, ''))) AS Country,
        RTRIM(LTRIM(ISNULL(Phone, ''))) AS Phone,
        CAST(ISNULL(CreditLimit, 0) AS DECIMAL(18, 2)) AS CreditLimit
      FROM tblInvCustomer WITH (NOLOCK)
      WHERE RTRIM(LTRIM(CustomerCode)) = @code
    `);

    if (!custRes.recordset || custRes.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Customer ${customerCode} not found in database.`,
      });
    }

    const customer = custRes.recordset[0];
    const creditLimit = Number(customer.CreditLimit) || 0;

    // 2. Fetch outstanding balance from tblAccountsReceivable
    const arReq = pool.request();
    arReq.input('code', sql.VarChar(50), customerCode);
    const arRes = await arReq.query(`
      SELECT 
        ISNULL(SUM(BalanceAmt), 0) AS Outstanding
      FROM tblAccountsReceivable WITH (NOLOCK)
      WHERE RTRIM(LTRIM(CustomerCode)) = @code
    `);

    const outstanding = Number(arRes.recordset[0]?.Outstanding || 0);
    const availableCredit = Math.max(0, parseFloat((creditLimit - outstanding).toFixed(2)));

    return res.status(200).json({
      success: true,
      customer: {
        ...customer,
        outstanding,
        availableCredit,
      },
    });
  } catch (error) {
    console.error('❌ [CUSTOMER CREDIT CHECK ERROR]:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

