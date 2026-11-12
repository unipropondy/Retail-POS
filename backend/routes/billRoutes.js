// ==============================================================================
// Project: Supermarket Retail POS
// Module: View Bill / Last Transaction Functionality (frmLastTransaction.vb)
// File: backend/routes/billRoutes.js
// Description: Implements exact VB.NET frmLastTransaction and clsInventory logic:
//              - fncGetLastTransaction / fncGetLastTransactionCur (Header retrieval with filtering)
//              - fncGetLastTransactionDetail (Line-item details from vwSalesDetail)
//              - fncgetpaymode (Multi-tender paymodes from vw_POS_PayModeDetail)
//              - Full Bill receipt reconstruction with tax, discounts, tenders, balances
//              - Exact invoice-level isolation (no mixing of data)
//              - cmdBillCancel_Click: Cashier permission (F3), Admin Auth, Date validation,
//                sp_SalesBillCancel with NextBillCancelNo and log_memberpointsByInvoice
//              - Butcondelivery_Click: fncselectdelivery, AccFlag1 check, CustomerCode check,
//                member scan/selection update, and fncupdatedeleivery conversion
//              - cmdInvoice_Click / subReceiptReportPrint: Receipt reprint data & status
// ==============================================================================

const express = require('express');
const router = express.Router();
const dns = require('dns');
const http = require('http');
const https = require('https');
const { getPool, sql } = require('../config/db');
const configService = require('../config/configService');

// Helper to format date as YYYY-MM-DD
function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}

// ------------------------------------------------------------------------------
// Helper: Check Network Availability matching IsNetworkConnected() in VB.NET
// ------------------------------------------------------------------------------
async function checkNetworkAvailability() {
  return new Promise((resolve) => {
    dns.lookup('google.com', (err) => {
      if (!err) return resolve(true);
      // Fallback ping check to standard DNS
      dns.lookup('8.8.8.8', (err2) => {
        resolve(!err2);
      });
    });
  });
}

// ------------------------------------------------------------------------------
// Helper: Background API Data Sync matching SubBillCancelDataSyncPOSSales()
// Runs strictly after transaction commit and checks APIEnable & network.
// ------------------------------------------------------------------------------
async function runBillCancelDataSync(pool) {
  try {
    const isApiEnabled = configService.getBoolean('APIEnable', false);
    if (!isApiEnabled) {
      console.log('ℹ️ [DATA SYNC] API DataSync disabled (APIEnable = 0/false).');
      return;
    }

    const isConnected = await checkNetworkAvailability();
    if (!isConnected) {
      console.warn('⚠️ [DATA SYNC] Network unavailable. Skipping BillCancel sync.');
      return;
    }

    const syncUrl = configService.getString('DataSyncURL', '') || configService.getString('WebURL', '');
    if (!syncUrl) {
      console.warn('⚠️ [DATA SYNC] DataSyncURL not configured.');
      return;
    }

    // 1. Fetch pending BillCancel headers
    const hdrRes = await pool.request().query(`
      SELECT TOP 20
        RTRIM(LTRIM(BillCancelNo)) AS BillCancelNo,
        RTRIM(LTRIM(InvoiceNo)) AS InvoiceNo,
        InvoiceDate,
        TotalValue,
        Gst,
        DetailDiscount,
        NetDiscountAmount,
        TotalDiscount,
        RTRIM(LTRIM(ISNULL(DiscountType, ''))) AS DiscountType,
        NetTotal,
        RTRIM(LTRIM(ISNULL(CashierID, ''))) AS CashierID,
        RTRIM(LTRIM(ISNULL(LocationCode, ''))) AS LocationCode,
        RTRIM(LTRIM(ISNULL(TerminalCode, ''))) AS TerminalCode,
        TotalLines,
        TenderAmount,
        Balance,
        RTRIM(LTRIM(ISNULL(SalesType, ''))) AS SalesType,
        RTRIM(LTRIM(ISNULL(CustomerCode, ''))) AS CustomerCode,
        RTRIM(LTRIM(ISNULL(CustomerName, ''))) AS CustomerName,
        RTRIM(LTRIM(ISNULL(Address1, ''))) AS Address1,
        RTRIM(LTRIM(ISNULL(Address2, ''))) AS Address2,
        RTRIM(LTRIM(ISNULL(Address3, ''))) AS Address3,
        RTRIM(LTRIM(ISNULL(Phone, ''))) AS Phone,
        RTRIM(LTRIM(ISNULL(Fax, ''))) AS Fax,
        MemberDiscount,
        RTRIM(LTRIM(ISNULL(GstType, ''))) AS GstType,
        RTRIM(LTRIM(ISNULL(CreateUser, ''))) AS CreateUser,
        CreateDate,
        RTRIM(LTRIM(ISNULL(ModifyUser, ''))) AS ModifyUser,
        ModifyDate
      FROM tblPOSBillCancelSalesHeader
      ORDER BY ModifyDate DESC
    `);

    if (hdrRes.recordset.length === 0) return;

    const billCancelHeaders = [];
    for (const h of hdrRes.recordset) {
      const detRes = await pool.request()
        .input('cNo', sql.VarChar(50), h.BillCancelNo)
        .query(`
          SELECT 
            RTRIM(LTRIM(BillCancelNo)) AS ReturnNo,
            RTRIM(LTRIM(InvoiceNo)) AS InvoiceNo,
            RTRIM(LTRIM(InventoryCode)) AS InventoryCode,
            RTRIM(LTRIM(Description)) AS Description,
            Qty,
            Price,
            TotalValue,
            Discount,
            NetDiscount,
            NetAmount,
            ActualSales,
            Gst,
            RTRIM(LTRIM(ISNULL(SalesManId, ''))) AS SalesManId,
            RTRIM(LTRIM(ISNULL(DeptCode, ''))) AS DeptCode,
            RTRIM(LTRIM(ISNULL(CategoryCode, ''))) AS CategoryCode,
            RTRIM(LTRIM(ISNULL(BrandCode, ''))) AS BrandCode,
            AverageCost,
            MemberDiscount,
            RTRIM(LTRIM(ISNULL(LocationCode, ''))) AS LocationCode,
            UnitCost,
            RetailPrice AS SellingPrice,
            RTRIM(LTRIM(ISNULL(CreateUser, ''))) AS CreateUser,
            CreateDate,
            RTRIM(LTRIM(ISNULL(ModifyUser, ''))) AS ModifyUser,
            ModifyDate,
            RTRIM(LTRIM(ISNULL(TaxPerc, ''))) AS TaxPerc,
            RTRIM(LTRIM(ISNULL(Remarks, ''))) AS Remarks,
            RTRIM(LTRIM(ISNULL(unid, ''))) AS unid
          FROM tblPOSBillCancelSalesDetail
          WHERE RTRIM(LTRIM(BillCancelNo)) = @cNo
        `);

      billCancelHeaders.push({
        ReturnNo: h.BillCancelNo,
        InvoiceNo: h.InvoiceNo,
        InvoiceDate: new Date(h.InvoiceDate).toISOString(),
        TotalValue: h.TotalValue,
        Gst: h.Gst,
        DetailDiscount: h.DetailDiscount,
        NetDiscount: h.NetDiscountAmount,
        Discount: h.TotalDiscount,
        DiscountType: h.DiscountType,
        NetTotal: h.NetTotal,
        CashierID: h.CashierID,
        LocationCode: h.LocationCode,
        TerminalCode: h.TerminalCode,
        TotalLines: h.TotalLines,
        TenderAmount: h.TenderAmount,
        Balance: h.Balance,
        SalesType: h.SalesType,
        CustomerCode: h.CustomerCode,
        CustomerName: h.CustomerName,
        Address1: h.Address1,
        Address2: h.Address2,
        Address3: h.Address3,
        Phone: h.Phone,
        Fax: h.Fax,
        MemberDiscount: h.MemberDiscount,
        GstType: h.GstType,
        PaidStatus: '',
        ChequeNo: '',
        CreateUser: h.CreateUser,
        CreateDate: new Date(h.CreateDate).toISOString(),
        ModifyUser: h.ModifyUser,
        ModifyDate: new Date(h.ModifyDate).toISOString(),
        billCancelDetails: detRes.recordset.map(d => ({
          ...d,
          CreateDate: d.CreateDate ? new Date(d.CreateDate).toISOString() : null,
          ModifyDate: d.ModifyDate ? new Date(d.ModifyDate).toISOString() : null,
        })),
      });
    }

    // 2. Fetch Sales History for sync
    const hisRes = await pool.request().query(`
      SELECT TOP 50
        RTRIM(LTRIM(LocationCode)) AS LocationCode,
        RTRIM(LTRIM(InventoryCode)) AS InventoryCode,
        SalesDate AS [Date],
        QtySold,
        SalesValue,
        Discount,
        Gst,
        NetAmount,
        RTRIM(LTRIM(Type)) AS Type,
        Cost,
        RTRIM(LTRIM(ISNULL(ModifyUser, ''))) AS ModifyUser,
        ModifyDate
      FROM tblPOSSalesHistoryCur
      ORDER BY ModifyDate DESC
    `);

    const salesHistorys = hisRes.recordset.map(sh => ({
      ...sh,
      Date: sh.Date ? new Date(sh.Date).toISOString() : null,
      ModifyDate: sh.ModifyDate ? new Date(sh.ModifyDate).toISOString() : null,
    }));

    const payload = {
      billCancelHeaders,
      salesHistorys,
    };

    const targetUrl = syncUrl.endsWith('/') ? `${syncUrl}BillCancel` : `${syncUrl}/BillCancel`;
    const postData = JSON.stringify(payload);
    const parsedUrl = new URL(targetUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const syncReq = client.request(parsedUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', async () => {
        try {
          const jsonRes = JSON.parse(data);
          const firstResult = jsonRes?.Table?.result?.[0] || jsonRes?.result?.[0];
          if (firstResult && firstResult.status === 'Success') {
            const lastDate = firstResult.lastUpdateDate || new Date();
            await pool.request()
              .input('lastDate', sql.DateTime, new Date(lastDate))
              .query(`
                IF EXISTS (SELECT 1 FROM tblLastSyncDateTime WHERE [Function] = 'BillCancel')
                  UPDATE tblLastSyncDateTime SET LastRunDateTime = @lastDate, NextSyncDateTime = DATEADD(hour, 4, @lastDate) WHERE [Function] = 'BillCancel'
                ELSE
                  INSERT INTO tblLastSyncDateTime ([Function], LastRunDateTime, NextSyncDateTime) VALUES ('BillCancel', @lastDate, DATEADD(hour, 4, @lastDate))
              `);
            console.log('✅ [DATA SYNC] BillCancel sync completed successfully.');
          }
        } catch (e) {
          console.warn('⚠️ [DATA SYNC - RESPONSE PARSE]:', e.message);
        }
      });
    });

    syncReq.on('error', (err) => {
      console.warn('⚠️ [DATA SYNC - REQUEST ERROR]:', err.message);
    });

    syncReq.write(postData);
    syncReq.end();
  } catch (syncErr) {
    console.warn('⚠️ [DATA SYNC - BILL CANCEL ERROR]:', syncErr.message);
  }
}

// ------------------------------------------------------------------------------
// 1. GET /api/bills/transactions
// Retrieves transaction list matching subGetHeaderData & subGetHeaderData_CREDIT
// ------------------------------------------------------------------------------
router.get('/transactions', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const {
      fromDate,
      toDate,
      dateFilter,
      transactionLimit,
      invoiceNo,
      memberCode,
      isCredit,
      allSales,
      terminalCode,
    } = req.query;

    const request = pool.request();
    const whereConditions = [];

    // Filter by InvoiceNo if provided
    const cleanInv = String(invoiceNo || '').trim();
    if (cleanInv) {
      request.input('invSearch', sql.VarChar(50), `%${cleanInv}%`);
      whereConditions.push('A.InvoiceNo LIKE @invSearch');
    }

    // Filter by MemberCode if provided
    const cleanMem = String(memberCode || '').trim();
    if (cleanMem) {
      request.input('memSearch', sql.VarChar(50), `%${cleanMem}%`);
      whereConditions.push('(A.MemberCode LIKE @memSearch OR A.Customercode LIKE @memSearch)');
    }

    // Filter by Credit Mode (matching subGetHeaderData_CREDIT)
    const creditMode = String(isCredit) === 'true';
    if (creditMode) {
      whereConditions.push("UPPER(RTRIM(LTRIM(A.PayMode))) = 'CREDITS'");
    }

    // Filter by Date Range if dateFilter enabled (matching chkDate in frmLastTransaction)
    const useDateFilter = String(dateFilter) === 'true';
    if (useDateFilter && fromDate && toDate) {
      request.input('fromDate', sql.DateTime, new Date(`${fromDate} 00:00:00`));
      request.input('toDate', sql.DateTime, new Date(`${toDate} 23:59:59`));
      whereConditions.push('A.ModifyDate BETWEEN @fromDate AND @toDate');
    }

    // Filter by Terminal unless "All Counters" is checked
    // Normalize spaces and hyphens so 'HQPC1' and 'HQ-PC1' both match accurately
    const isAll = String(allSales) === 'true';
    const cleanTerm = String(terminalCode || '').trim();
    if (!isAll && cleanTerm) {
      request.input('terminal', sql.VarChar(50), cleanTerm.replace(/[\s-]/g, ''));
      whereConditions.push("REPLACE(REPLACE(UPPER(RTRIM(LTRIM(A.TerminalCode))), ' ', ''), '-', '') = UPPER(@terminal)");
    }

    const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Calculate limit (default 20, up to 200 for ALL)
    let limitNum = 20;
    if (transactionLimit && !isNaN(parseInt(transactionLimit, 10))) {
      limitNum = parseInt(transactionLimit, 10);
    }
    if (String(transactionLimit).toUpperCase() === 'ALL' || isAll) {
      limitNum = 200;
    }

    // Query vw_POS_LastTransaction
    const query = `
      SELECT TOP ${limitNum}
        RTRIM(LTRIM(A.InvoiceNo)) AS InvoiceNo,
        A.ModifyDate,
        RTRIM(LTRIM(ISNULL(A.TerminalCode, ''))) AS TerminalCode,
        RTRIM(LTRIM(ISNULL(A.CashierID, ''))) AS CashierID,
        RTRIM(LTRIM(ISNULL(A.MemberCode, ''))) AS MemberCode,
        RTRIM(LTRIM(ISNULL(A.MemberName, ''))) AS MemberName,
        ISNULL(A.Amount, 0) AS Amount,
        ISNULL(A.NetTotal, 0) AS NetTotal,
        RTRIM(LTRIM(ISNULL(A.PayMode, ''))) AS PayMode
      FROM vw_POS_LastTransaction A
      ${whereSql}
      ORDER BY A.ModifyDate DESC, A.InvoiceNo DESC
    `;

    const result = await request.query(query);

    // Group rows by unique InvoiceNo as in VB.NET (where multi-tender split creates distinct paymode rows)
    const headerMap = new Map();
    for (const r of result.recordset) {
      const inv = r.InvoiceNo;
      if (!headerMap.has(inv)) {
        headerMap.set(inv, {
          invoiceNo: inv,
          modifyDate: r.ModifyDate,
          terminalCode: r.TerminalCode,
          cashierId: r.CashierID,
          memberCode: r.MemberCode,
          memberName: r.MemberName,
          amount: Number(r.Amount),
          netTotal: Number(r.NetTotal),
          payModes: [r.PayMode],
          payModeText: r.PayMode,
        });
      } else {
        const existing = headerMap.get(inv);
        if (r.PayMode && !existing.payModes.includes(r.PayMode)) {
          existing.payModes.push(r.PayMode);
          existing.payModeText = existing.payModes.join(' , ');
        }
      }
    }

    const uniqueHeaders = Array.from(headerMap.values());

    return res.status(200).json({
      success: true,
      count: uniqueHeaders.length,
      transactions: uniqueHeaders,
    });
  } catch (err) {
    console.error('❌ [BILL ERROR - TRANSACTIONS]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 2. GET /api/bills/check-cancel-permission
// Checks cashier permission for Bill Cancel (FunctionCode 'F3')
// Mirrors fncGetCashierPermission(gsConn, gsCashierGroup, "F3")
// ------------------------------------------------------------------------------
router.get('/check-cancel-permission', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const cashierId = (req.query.cashierId || '').trim();
    if (!cashierId) {
      return res.status(400).json({ success: false, message: 'cashierId is required' });
    }

    // 1. Fetch user master
    const userReq = pool.request();
    userReq.input('user', sql.VarChar(50), cashierId);
    const userRes = await userReq.query(`
      SELECT UserName, UserGroupCode, CashierGroupCode, IsAdmin
      FROM tblMausermaster
      WHERE UPPER(RTRIM(LTRIM(UserName))) = UPPER(@user)
    `);

    if (userRes.recordset.length === 0) {
      return res.status(200).json({
        success: true,
        allowed: false,
        requiresAdminAuth: true,
      });
    }

    const user = userRes.recordset[0];
    const isAdmin = Boolean(user.IsAdmin) || (user.UserGroupCode || '').toUpperCase().includes('ADMIN');

    if (isAdmin) {
      return res.status(200).json({
        success: true,
        allowed: true,
        isAdmin: true,
        requiresAdminAuth: false,
      });
    }

    // 2. Check tblPOSPermission for F3
    const cashierGroup = (user.CashierGroupCode || user.UserGroupCode || '').trim();
    const permReq = pool.request();
    permReq.input('cgroup', sql.VarChar(50), cashierGroup);
    permReq.input('fcode', sql.VarChar(10), 'F3');
    const permRes = await permReq.query(`
      SELECT Status
      FROM tblPOSPermission
      WHERE UPPER(RTRIM(LTRIM(CashierGroupCode))) = UPPER(@cgroup)
        AND UPPER(RTRIM(LTRIM(FunctionCode))) = UPPER(@fcode)
    `);

    const hasPermission = permRes.recordset.length > 0 && Boolean(permRes.recordset[0].Status);

    return res.status(200).json({
      success: true,
      allowed: hasPermission,
      requiresAdminAuth: !hasPermission,
    });
  } catch (err) {
    console.error('❌ [BILL ERROR - CHECK PERM]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 3. GET /api/bills/search-members
// Search members/customers for Convert Delivery modal
// ------------------------------------------------------------------------------
router.get('/search-members', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const search = String(req.query.search || '').trim();
    const reqQuery = pool.request();
    reqQuery.input('search', sql.VarChar(50), `%${search}%`);

    const result = await reqQuery.query(`
      SELECT TOP 20
        RTRIM(LTRIM(MemberCode)) AS MemberCode,
        RTRIM(LTRIM(MemberName)) AS MemberName,
        RTRIM(LTRIM(ISNULL(Mobile, ''))) AS Mobile,
        RTRIM(LTRIM(ISNULL(Address1, ''))) AS Address1
      FROM tblMember
      WHERE MemberCode LIKE @search OR MemberName LIKE @search OR Mobile LIKE @search
      ORDER BY MemberName ASC
    `);

    return res.status(200).json({
      success: true,
      members: result.recordset,
    });
  } catch (err) {
    console.error('❌ [BILL ERROR - SEARCH MEMBERS]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 3.5. GET /api/bills/void-receipt/:invoiceNo
// Retrieves voided/cancelled bill receipt data matching subPrintVoidBill &
// rptPOSBillCancelReceipt_ERP from tblPOSBillCancelSalesHeader/Detail/PayMode
// ------------------------------------------------------------------------------
router.get('/void-receipt/:invoiceNo', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const rawInv = String(req.params.invoiceNo || '').trim();
    if (!rawInv) {
      return res.status(400).json({ success: false, message: 'Invoice number is required' });
    }

    const hdrReq = pool.request();
    hdrReq.input('inv', sql.VarChar(50), rawInv);
    const hdrRes = await hdrReq.query(`
      SELECT TOP 1
        RTRIM(LTRIM(BillCancelNo)) AS BillCancelNo,
        RTRIM(LTRIM(ISNULL(BillCancelledBy, ''))) AS BillCancelledBy,
        RTRIM(LTRIM(InvoiceNo)) AS InvoiceNo,
        InvoiceDate,
        ISNULL(TotalValue, 0) AS TotalValue,
        ISNULL(NetTotal, 0) AS NetTotal,
        ISNULL(Gst, 0) AS Gst,
        RTRIM(LTRIM(ISNULL(CashierID, ''))) AS CashierID,
        RTRIM(LTRIM(ISNULL(LocationCode, ''))) AS LocationCode,
        RTRIM(LTRIM(ISNULL(TerminalCode, ''))) AS TerminalCode,
        ISNULL(TotalLines, 0) AS TotalLines,
        ISNULL(TenderAmount, 0) AS TenderAmount,
        ISNULL(Balance, 0) AS Balance,
        RTRIM(LTRIM(ISNULL(SalesType, ''))) AS SalesType,
        RTRIM(LTRIM(ISNULL(CustomerCode, 'CASH'))) AS CustomerCode,
        RTRIM(LTRIM(ISNULL(CustomerName, 'CASH'))) AS CustomerName,
        ISNULL(TotalDiscount, 0) AS TotalDiscount,
        ISNULL(DetailDiscount, 0) AS DetailDiscount,
        ISNULL(NetDiscountAmount, 0) AS NetDiscountAmount,
        ISNULL(MemberDiscount, 0) AS MemberDiscount,
        ISNULL(RoundOff, 0) AS RoundOff,
        RTRIM(LTRIM(ISNULL(Remarks, ''))) AS Remarks,
        CreateDate,
        ModifyDate
      FROM tblPOSBillCancelSalesHeader
      WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
      ORDER BY ModifyDate DESC
    `);

    if (hdrRes.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Void bill receipt record for invoice ${rawInv} not found.`,
      });
    }

    const header = hdrRes.recordset[0];
    const cancelNo = header.BillCancelNo;

    const detReq = pool.request();
    detReq.input('inv', sql.VarChar(50), rawInv);
    detReq.input('cNo', sql.VarChar(50), cancelNo);
    const detRes = await detReq.query(`
      SELECT 
        RTRIM(LTRIM(InventoryCode)) AS InventoryCode,
        RTRIM(LTRIM(Description)) AS Description,
        ISNULL(Qty, 0) AS Qty,
        ISNULL(Price, 0) AS Price,
        ISNULL(TotalValue, 0) AS TotalValue,
        ISNULL(SubTotal, 0) AS SubTotal,
        ISNULL(Discount, 0) AS Discount,
        ISNULL(NetDiscount, 0) AS NetDiscount,
        ISNULL(NetAmount, 0) AS NetAmount,
        ISNULL(ActualSales, 0) AS ActualSales,
        ISNULL(Gst, 0) AS Gst,
        RTRIM(LTRIM(ISNULL(SalesManId, ''))) AS SalesManId,
        RTRIM(LTRIM(ISNULL(DeptCode, ''))) AS DeptCode,
        RTRIM(LTRIM(ISNULL(CategoryCode, ''))) AS CategoryCode,
        RTRIM(LTRIM(ISNULL(BrandCode, ''))) AS BrandCode,
        ISNULL(RetailPrice, 0) AS RetailPrice,
        ISNULL(TaxPerc, 0) AS TaxPerc
      FROM tblPOSBillCancelSalesDetail
      WHERE RTRIM(LTRIM(InvoiceNo)) = @inv AND (RTRIM(LTRIM(BillCancelNo)) = @cNo OR @cNo = '')
      ORDER BY InventoryCode ASC
    `);

    const payReq = pool.request();
    payReq.input('inv', sql.VarChar(50), rawInv);
    payReq.input('cNo', sql.VarChar(50), cancelNo);
    const payRes = await payReq.query(`
      SELECT 
        RTRIM(LTRIM(PayMode)) AS PayMode,
        ISNULL(Amount, 0) AS Amount,
        ISNULL(Commision, 0) AS Commision,
        RTRIM(LTRIM(ISNULL(SlipNo, ''))) AS SlipNo
      FROM tblPOSBillCancelPayModeDetail
      WHERE RTRIM(LTRIM(InvoiceNo)) = @inv AND (RTRIM(LTRIM(BillCancelNo)) = @cNo OR @cNo = '')
    `);

    return res.status(200).json({
      success: true,
      header,
      items: detRes.recordset,
      payments: payRes.recordset,
    });
  } catch (err) {
    console.error('❌ [BILL ERROR - VOID RECEIPT]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 4. GET /api/bills/:invoiceNo
// Retrieves complete Bill details:
//   - Checks tblPOSSalesHeaderCur first (today's active session for void/return)
//   - Falls back to vw_POS_SalesHeader for historical view
//   - Line items from tblPOSSalesDetailCur or vwSalesDetail
//   - Payments from tblPOSPayModeDetailCur or vw_POS_PayModeDetail
// ------------------------------------------------------------------------------
router.get('/:invoiceNo', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const rawInv = String(req.params.invoiceNo || '').trim();
    if (!rawInv) {
      return res.status(400).json({ success: false, message: 'Invoice number is required' });
    }

    // 1. Fetch Header - First check current ERP active table tblPOSSalesHeaderCur
    const curHdrReq = pool.request();
    curHdrReq.input('inv', sql.VarChar(50), rawInv);
    const curHdrRes = await curHdrReq.query(`
      SELECT TOP 1
        RTRIM(LTRIM(InvoiceNo)) AS InvoiceNo,
        InvoiceDate,
        ISNULL(TotalValue, 0) AS TotalValue,
        ISNULL(NetTotal, 0) AS NetTotal,
        ISNULL(Gst, 0) AS Gst,
        RTRIM(LTRIM(ISNULL(CashierID, ''))) AS CashierID,
        RTRIM(LTRIM(ISNULL(LocationCode, ''))) AS LocationCode,
        RTRIM(LTRIM(ISNULL(TerminalCode, ''))) AS TerminalCode,
        ISNULL(TotalLines, 0) AS TotalLines,
        ISNULL(TenderAmount, 0) AS TenderAmount,
        ISNULL(Balance, 0) AS Balance,
        RTRIM(LTRIM(ISNULL(SalesType, ''))) AS SalesType,
        RTRIM(LTRIM(ISNULL(CustomerCode, 'CASH'))) AS CustomerCode,
        RTRIM(LTRIM(ISNULL(CustomerName, 'CASH'))) AS CustomerName,
        ISNULL(TotalDiscount, 0) AS TotalDiscount,
        RTRIM(LTRIM(ISNULL(Address1, ''))) AS Address1,
        RTRIM(LTRIM(ISNULL(Phone, ''))) AS Phone,
        ISNULL(MemberDiscount, 0) AS MemberDiscount,
        RTRIM(LTRIM(ISNULL(GstType, 'I'))) AS GstType,
        ISNULL(RoundOff, 0) AS RoundOff,
        RTRIM(LTRIM(ISNULL(Remarks, ''))) AS Remarks,
        RTRIM(LTRIM(ISNULL(Delivered, ''))) AS Delivered,
        RTRIM(LTRIM(ISNULL(AccFlag, ''))) AS AccFlag,
        ShiftNo,
        1 AS IsCur,
        CreateDate,
        ModifyDate
      FROM tblPOSSalesHeaderCur
      WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
    `);

    let header = null;
    let isCur = false;

    if (curHdrRes.recordset.length > 0) {
      header = curHdrRes.recordset[0];
      isCur = true;
    } else {
      // Fallback: check vw_POS_SalesHeader for completed/history sales
      const hdrReq = pool.request();
      hdrReq.input('inv', sql.VarChar(50), rawInv);
      const hdrRes = await hdrReq.query(`
        SELECT TOP 1
          RTRIM(LTRIM(InvoiceNo)) AS InvoiceNo,
          InvoiceDate,
          ISNULL(TotalValue, 0) AS TotalValue,
          ISNULL(NetTotal, 0) AS NetTotal,
          ISNULL(Gst, 0) AS Gst,
          RTRIM(LTRIM(ISNULL(CashierID, ''))) AS CashierID,
          RTRIM(LTRIM(ISNULL(LocationCode, ''))) AS LocationCode,
          RTRIM(LTRIM(ISNULL(TerminalCode, ''))) AS TerminalCode,
          ISNULL(TotalLines, 0) AS TotalLines,
          ISNULL(TenderAmount, 0) AS TenderAmount,
          ISNULL(Balance, 0) AS Balance,
          RTRIM(LTRIM(ISNULL(SalesType, ''))) AS SalesType,
          RTRIM(LTRIM(ISNULL(CustomerCode, 'CASH'))) AS CustomerCode,
          RTRIM(LTRIM(ISNULL(CustomerName, 'CASH'))) AS CustomerName,
          ISNULL(TotalDiscount, 0) AS TotalDiscount,
          RTRIM(LTRIM(ISNULL(Address1, ''))) AS Address1,
          RTRIM(LTRIM(ISNULL(Phone, ''))) AS Phone,
          ISNULL(MemberDiscount, 0) AS MemberDiscount,
          RTRIM(LTRIM(ISNULL(GstType, 'I'))) AS GstType,
          ISNULL(RoundOff, 0) AS RoundOff,
          RTRIM(LTRIM(ISNULL(Remarks, ''))) AS Remarks,
          RTRIM(LTRIM(ISNULL(Delivered, ''))) AS Delivered,
          RTRIM(LTRIM(ISNULL(AccFlag, ''))) AS AccFlag,
          ShiftNo,
          0 AS IsCur,
          CreateDate,
          ModifyDate
        FROM vw_POS_SalesHeader
        WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
      `);

      if (hdrRes.recordset.length > 0) {
        header = hdrRes.recordset[0];
        isCur = false;
      }
    }

    // 2. Fetch Line Items
    let items = [];
    if (isCur) {
      const curDetReq = pool.request();
      curDetReq.input('inv', sql.VarChar(50), rawInv);
      const curDetRes = await curDetReq.query(`
        SELECT 
          RTRIM(LTRIM(InventoryCode)) AS InventoryCode,
          RTRIM(LTRIM(Description)) AS Description,
          ISNULL(Qty, 0) AS Qty,
          ISNULL(Price, 0) AS Price,
          ISNULL(TotalValue, 0) AS TotalValue,
          ISNULL(SubTotal, 0) AS SubTotal,
          ISNULL(Discount, 0) AS Discount,
          ISNULL(NetDiscount, 0) AS NetDiscount,
          ISNULL(NetAmount, 0) AS NetAmount,
          ISNULL(ActualSales, 0) AS ActualSales,
          ISNULL(Gst, 0) AS Gst,
          RTRIM(LTRIM(ISNULL(SalesManId, ''))) AS SalesManId,
          RTRIM(LTRIM(ISNULL(DeptCode, ''))) AS DeptCode,
          RTRIM(LTRIM(ISNULL(CategoryCode, ''))) AS CategoryCode,
          RTRIM(LTRIM(ISNULL(BrandCode, ''))) AS BrandCode,
          ISNULL(AverageCost, 0) AS AverageCost,
          ISNULL(MemberDiscount, 0) AS MemberDiscount,
          RTRIM(LTRIM(ISNULL(PRMFlag, 'N'))) AS PRMFlag,
          ISNULL(RetailPrice, 0) AS SellingPrice
        FROM tblPOSSalesDetailCur
        WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
        ORDER BY InventoryCode ASC
      `);
      items = curDetRes.recordset.map((r) => ({
        inventoryCode: r.InventoryCode,
        barcode: r.InventoryCode,
        description: r.Description,
        qty: Number(r.Qty),
        price: Number(r.Price),
        totalValue: Number(r.TotalValue),
        subTotal: Number(r.SubTotal),
        discount: Number(r.Discount),
        netDiscount: Number(r.NetDiscount),
        netAmount: Number(r.NetAmount),
        gst: Number(r.Gst),
        salesmanId: r.SalesManId,
        deptCode: r.DeptCode,
        categoryCode: r.CategoryCode,
        brandCode: r.BrandCode,
        prmFlag: r.PRMFlag,
      }));
    } else {
      const detReq = pool.request();
      detReq.input('inv', sql.VarChar(50), rawInv);
      const detRes = await detReq.query(`
        SELECT 
          RTRIM(LTRIM(InventoryCode)) AS InventoryCode,
          RTRIM(LTRIM(Description)) AS Description,
          ISNULL(Qty, 0) AS Qty,
          ISNULL(Price, 0) AS Price,
          ISNULL(TotalValue, 0) AS TotalValue,
          ISNULL(SUBTOTAL, 0) AS SubTotal,
          ISNULL(Discount, 0) AS Discount,
          ISNULL(NetDiscount, 0) AS NetDiscount,
          ISNULL(NetAmount, 0) AS NetAmount,
          ISNULL(ActualSales, 0) AS ActualSales,
          ISNULL(Gst, 0) AS Gst,
          RTRIM(LTRIM(ISNULL(SalesManId, ''))) AS SalesManId,
          RTRIM(LTRIM(ISNULL(DeptCode, ''))) AS DeptCode,
          RTRIM(LTRIM(ISNULL(CategoryCode, ''))) AS CategoryCode,
          RTRIM(LTRIM(ISNULL(BrandCode, ''))) AS BrandCode,
          ISNULL(AVERAGECOST, 0) AS AverageCost,
          ISNULL(MEMBERDISCOUNT, 0) AS MemberDiscount,
          RTRIM(LTRIM(ISNULL(PRMFlag, 'N'))) AS PRMFlag,
          ISNULL(Sellingprice, 0) AS SellingPrice
        FROM vwSalesDetail
        WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
        ORDER BY InventoryCode ASC
      `);
      items = detRes.recordset.map((r) => ({
        inventoryCode: r.InventoryCode,
        barcode: r.InventoryCode,
        description: r.Description,
        qty: Number(r.Qty),
        price: Number(r.Price),
        totalValue: Number(r.TotalValue),
        subTotal: Number(r.SubTotal),
        discount: Number(r.Discount),
        netDiscount: Number(r.NetDiscount),
        netAmount: Number(r.NetAmount),
        gst: Number(r.Gst),
        salesmanId: r.SalesManId,
        deptCode: r.DeptCode,
        categoryCode: r.CategoryCode,
        brandCode: r.BrandCode,
        prmFlag: r.PRMFlag,
      }));
    }

    // 3. Fetch Payment Mode details
    let payModesList = [];
    if (isCur) {
      const curPayReq = pool.request();
      curPayReq.input('inv', sql.VarChar(50), rawInv);
      const curPayRes = await curPayReq.query(`
        SELECT 
          RTRIM(LTRIM(PayMode)) AS PayMode,
          ISNULL(Amount, 0) AS Amount,
          ISNULL(Commision, 0) AS Commision,
          RTRIM(LTRIM(ISNULL(SlipNo, ''))) AS SlipNo
        FROM tblPOSPayModeDetailCur
        WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
      `);
      payModesList = curPayRes.recordset.map((p) => ({
        payMode: p.PayMode,
        amount: Number(p.Amount),
        commission: Number(p.Commision),
        slipNo: p.SlipNo,
      }));
    } else {
      const payReq = pool.request();
      payReq.input('inv', sql.VarChar(50), rawInv);
      const payRes = await payReq.query(`
        SELECT 
          RTRIM(LTRIM(PayMode)) AS PayMode,
          ISNULL(Amount, 0) AS Amount,
          ISNULL(Commision, 0) AS Commision,
          RTRIM(LTRIM(ISNULL(SlipNo, ''))) AS SlipNo
        FROM vw_POS_PayModeDetail
        WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
      `);
      payModesList = payRes.recordset.map((p) => ({
        payMode: p.PayMode,
        amount: Number(p.Amount),
        commission: Number(p.Commision),
        slipNo: p.SlipNo,
      }));
    }

    if (!header && items.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found in transaction history.',
      });
    }

    if (!header) {
      header = {
        InvoiceNo: rawInv,
        InvoiceDate: new Date(),
        TotalValue: items.reduce((s, r) => s + Number(r.totalValue || 0), 0),
        NetTotal: items.reduce((s, r) => s + Number(r.netAmount || 0), 0),
        TenderAmount: payModesList.reduce((s, r) => s + Number(r.amount || 0), 0),
        Balance: 0,
        Gst: items.reduce((s, r) => s + Number(r.gst || 0), 0),
        TotalDiscount: items.reduce((s, r) => s + Number(r.discount || 0), 0),
        CashierID: 'UPS',
        CustomerCode: 'CASH',
        CustomerName: 'CASH',
        TerminalCode: '',
        LocationCode: '',
        TotalLines: items.length,
        Delivered: '',
        AccFlag: '',
        ShiftNo: null,
        IsCur: false,
      };
    }

    const payModeSummaryText = payModesList.map((p) => p.payMode).join(' , ') || 'CASH';

    return res.status(200).json({
      success: true,
      header: {
        invoiceNo: header.InvoiceNo,
        invoiceDate: header.InvoiceDate,
        totalValue: Number(header.TotalValue),
        netTotal: Number(header.NetTotal),
        tenderAmount: Number(header.TenderAmount),
        balance: Number(header.Balance),
        gst: Number(header.Gst),
        totalDiscount: Number(header.TotalDiscount),
        cashierId: header.CashierID,
        customerCode: header.CustomerCode,
        customerName: header.CustomerName,
        terminalCode: header.TerminalCode,
        locationCode: header.LocationCode,
        totalLines: Number(header.TotalLines || items.length),
        roundOff: Number(header.RoundOff || 0),
        remarks: header.Remarks || '',
        delivered: header.Delivered || '',
        accFlag: header.AccFlag || '',
        shiftNo: header.ShiftNo,
        isCur: Boolean(header.IsCur),
        payModeSummary: payModeSummaryText,
      },
      bill: {
        InvoiceNo: header.InvoiceNo,
        InvoiceDate: header.InvoiceDate,
        TotalValue: Number(header.TotalValue),
        NetTotal: Number(header.NetTotal),
        TenderAmount: Number(header.TenderAmount),
        Balance: Number(header.Balance),
        Gst: Number(header.Gst),
        TotalDiscount: Number(header.TotalDiscount),
        CashierID: header.CashierID,
        CustomerCode: header.CustomerCode,
        CustomerName: header.CustomerName,
        TerminalCode: header.TerminalCode,
        LocationCode: header.LocationCode,
        TotalLines: Number(header.TotalLines || items.length),
        ShiftNo: header.ShiftNo,
        IsCur: Boolean(header.IsCur),
      },
      items,
      payments: payModesList,
    });
  } catch (err) {
    console.error('❌ [BILL ERROR - DETAILS]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 5. POST /api/bills/cancel
// Implements cmdSave_Click from frmBillCancel.vb:
//   - Shifts & Historical bill validation (ShiftNo check matching VB.NET)
//   - NextBillCancelNo retrieval from tblmaCompany
//   - Safe database transaction management (BEGIN, COMMIT, ROLLBACK)
//   - sp_SalesBillCancel (ERP mode) or legacy ERP cancellation
//   - Member points synchronization (fncUpdateMemberPointsToHQ)
//   - Background DataSync API trigger (SubBillCancelDataSyncPOSSales) strictly post-commit
// ------------------------------------------------------------------------------
router.post('/cancel', async (req, res) => {
  let pool = null;
  let tx = null;
  try {
    pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const { invoiceNo, cashierId, locationCode, printVoidBill } = req.body;
    const cleanInv = String(invoiceNo || '').trim();
    if (!cleanInv) {
      return res.status(400).json({ success: false, message: 'Invoice number is required for bill cancellation' });
    }

    const loc = String(locationCode || 'HQ').trim();
    const user = String(cashierId || 'UPS').trim();

    // 1. Fetch sales header using entered Invoice Number from tblPOSSalesHeaderCur ONLY
    // Requirement:
    // - Use only tblPOSSalesHeaderCur for Void Bill invoice lookup
    // - Completely remove ERP_tblPOSSalesHeaderCur dependency
    // - Do not implement OLD database conditional logic
    // - Search using the entered Invoice Number
    // - Do not apply ShiftNo filter directly in the initial lookup query
    const chkReq = pool.request();
    chkReq.input('inv', sql.VarChar(50), cleanInv);
    const chkRes = await chkReq.query(`
      SELECT TOP 1 
        RTRIM(LTRIM(InvoiceNo)) AS InvoiceNo, 
        InvoiceDate, 
        NetTotal, 
        RTRIM(LTRIM(CustomerCode)) AS CustomerCode,
        RTRIM(LTRIM(LocationCode)) AS LocationCode,
        ShiftNo
      FROM tblPOSSalesHeaderCur
      WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
    `);

    // 8. If the invoice does not exist in tblPOSSalesHeaderCur, display "Bill not found in transaction history."
    if (chkRes.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found in transaction history.',
      });
    }

    const header = chkRes.recordset[0];

    // 2. Validate its ShiftNo separately:
    // - If the invoice exists and ShiftNo is NULL or 0, allow bill cancellation.
    // - If the invoice exists but ShiftNo is not 0, display the historical bill restriction message.
    const rawShiftNo = header.ShiftNo;
    const shiftVal = rawShiftNo !== null && rawShiftNo !== undefined && rawShiftNo !== '' ? Number(rawShiftNo) : 0;

    if (shiftVal !== 0) {
      return res.status(400).json({
        success: false,
        message: 'You cannot cancel History Bills ....Please Give Correct Bill No',
      });
    }

    // 3. Retrieve NextBillCancelNo from tblmaCompany
    const cancelNoReq = pool.request();
    const cancelNoRes = await cancelNoReq.query('SELECT ISNULL(NextBillCancelNo, 1) AS NextBillCancelNo FROM tblmaCompany');
    const billCancelNo = String(cancelNoRes.recordset[0]?.NextBillCancelNo || 1);

    // 4. Start Database Transaction
    tx = new sql.Transaction(pool);
    await tx.begin();

    try {
      // Execute cancellation process (fncBillCancelSave / sp_SalesBillCancel)
      const execReq = new sql.Request(tx);
      execReq.input('InvoiceNo', sql.Char(15), cleanInv);
      execReq.input('LocationCode', sql.Char(10), loc);
      execReq.input('UserID', sql.Char(10), user);
      await execReq.execute('sp_SalesBillCancel');

      // Commit the database transaction
      await tx.commit();
      tx = null; // Mark committed
    } catch (saveErr) {
      if (tx) {
        await tx.rollback();
        tx = null;
      }
      throw saveErr;
    }

    // 5. Member Points Synchronization (ERP database fncUpdateMemberPointsToHQ)
    // Executed after local transaction commit
    try {
      const memCode = (header.CustomerCode || '').trim();
      if (memCode && memCode.toUpperCase() !== 'CASH') {
        // Step A: Update local log_MemberPointsByInvoice via sp_SaveMemberPointsByInvoice
        const logReq = pool.request();
        logReq.input('InvoiceNo', sql.VarChar(30), cleanInv);
        logReq.input('BillCancelNo', sql.VarChar(10), billCancelNo);
        logReq.input('MemberCode', sql.VarChar(30), memCode);
        logReq.input('UserID', sql.VarChar(20), user);
        await logReq.execute('sp_SaveMemberPointsByInvoice');

        // Step B: If HQ connection is available, synchronize member points and transactions to HQ
        const hqConnStr = configService.getString('DBHQConn', '');
        if (hqConnStr && !hqConnStr.includes('SCK-TG')) {
          try {
            const hqPool = await new sql.ConnectionPool(hqConnStr).connect();
            try {
              // 0. Update member points at HQ
              const memPointsRes = await pool.request()
                .input('inv', sql.VarChar(50), cleanInv)
                .query(`
                  SELECT TOP 1 A.TotalSales, A.TotalSavings, A.TotalRewardPoint, A.TotalUsagePoint, A.MemberCode
                  FROM tblMember A 
                  INNER JOIN log_MemberPointsByInvoice B ON A.MemberCode = B.MemberCode
                  WHERE B.InvoiceNo = @inv
                `);

              if (memPointsRes.recordset.length > 0) {
                const mp = memPointsRes.recordset[0];
                await hqPool.request()
                  .input('mCode', sql.VarChar(50), mp.MemberCode)
                  .input('sales', sql.Decimal(18, 2), mp.TotalSales || 0)
                  .input('savings', sql.Decimal(18, 2), mp.TotalSavings || 0)
                  .input('reward', sql.Decimal(18, 2), mp.TotalRewardPoint || 0)
                  .input('usage', sql.Decimal(18, 2), mp.TotalUsagePoint || 0)
                  .query(`
                    UPDATE tblMember 
                    SET TotalSales = @sales, TotalSavings = @savings, TotalRewardPoint = @reward, TotalUsagePoint = @usage
                    WHERE MemberCode = @mCode
                  `);

                // 1. Upload Log Details to HQ
                await hqPool.request()
                  .input('InvoiceNo', sql.VarChar(30), cleanInv)
                  .input('BillCancelNo', sql.VarChar(10), billCancelNo)
                  .input('MemberCode', sql.VarChar(30), mp.MemberCode)
                  .input('UserID', sql.VarChar(20), user)
                  .execute('sp_SaveMemberPointsByInvoice');

                // 2. Upload Member Transaction to HQ if SP exists
                const transRes = await pool.request()
                  .input('cNo', sql.VarChar(50), billCancelNo)
                  .query(`SELECT TOP 1 * FROM tblMemberTransaction WHERE InvoiceNo = @cNo`);
                if (transRes.recordset.length > 0) {
                  const tr = transRes.recordset[0];
                  try {
                    await hqPool.request()
                      .input('LocationCode', sql.VarChar(50), tr.LocationCode)
                      .input('MemberCode', sql.VarChar(50), tr.MemberCode)
                      .input('InvoiceNo', sql.VarChar(50), tr.InvoiceNo)
                      .input('InvoiceDate', sql.DateTime, tr.InvoiceDate)
                      .input('InvoiceAmount', sql.Decimal(18, 2), tr.InvoiceAmount)
                      .input('MemberDiscount', sql.Decimal(18, 2), tr.MemberDiscount)
                      .input('RewardPoint', sql.Decimal(18, 2), tr.RewardPoint)
                      .input('CreateUser', sql.VarChar(50), tr.CreateUser)
                      .input('CreateDate', sql.DateTime, tr.CreateDate)
                      .input('ModifyUser', sql.VarChar(50), tr.ModifyUser)
                      .input('ModifyDate', sql.DateTime, tr.ModifyDate)
                      .execute('sp_UploadMemberTransactionToHQ');
                  } catch (spErr) {
                    console.warn('ℹ️ [HQ - sp_UploadMemberTransactionToHQ skipped/not found]:', spErr.message);
                  }
                }

                // 3. Delete Member savings detail at HQ
                await hqPool.request()
                  .input('inv', sql.VarChar(50), cleanInv)
                  .query(`DELETE FROM tblMemberSavingsDetails WHERE InvoiceNo = @inv`);
              }
            } finally {
              await hqPool.close();
            }
          } catch (hqErr) {
            console.warn('ℹ️ [HQ CONNECTION SKIPPED]:', hqErr.message);
          }
        }
      }
    } catch (memSyncErr) {
      console.warn('⚠️ [BILL CANCEL - MEMBER POINTS SYNC]:', memSyncErr.message);
    }

    // 6. Background API Data Synchronization (SubBillCancelDataSyncPOSSales in VB.NET)
    // Non-blocking asynchronous task executed after transaction commit
    setImmediate(() => {
      runBillCancelDataSync(pool).catch((err) => {
        console.warn('⚠️ [BACKGROUND DATA SYNC ERROR]:', err.message);
      });
    });

    return res.status(200).json({
      success: true,
      invoiceNo: cleanInv,
      billCancelNo,
      printVoidBill: Boolean(printVoidBill),
      message: 'Bill Cancelled Successfully.',
    });
  } catch (err) {
    if (tx) {
      try { await tx.rollback(); } catch {}
    }
    console.error('❌ [BILL ERROR - CANCEL]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 6. POST /api/bills/check-delivery
// Exact equivalent of `fncselectdelivery(sInvoiceNo)` in clsInventory.vb
// Step 1:
//   - Retrieves delivery information for selected InvoiceNo
//   - Checks tblPOSSalesHeaderCur first (today's/current session sales)
//   - If not found in Cur, checks tblPOSSalesHeader (history sales)
//   - Returns AccFlag1 / AccFlag and CustomerCode
// ------------------------------------------------------------------------------
router.post('/check-delivery', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const cleanInv = String(req.body.invoiceNo || '').trim();
    if (!cleanInv) {
      return res.status(400).json({ success: false, message: 'invoiceNo is required' });
    }

    // First check tblPOSSalesHeaderCur
    const qCur = pool.request();
    qCur.input('inv', sql.VarChar(50), cleanInv);
    const resultCur = await qCur.query(`
      SELECT TOP 1
        RTRIM(LTRIM(InvoiceNo)) AS InvoiceNo,
        RTRIM(LTRIM(ISNULL(AccFlag, '0'))) AS AccFlag1,
        RTRIM(LTRIM(ISNULL(CustomerCode, 'CASH'))) AS CustomerCode,
        RTRIM(LTRIM(ISNULL(CustomerName, 'CASH'))) AS CustomerName,
        RTRIM(LTRIM(ISNULL(Delivered, '0'))) AS Delivered,
        1 AS IsCur
      FROM tblPOSSalesHeaderCur
      WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
    `);

    let row = null;
    let isCur = true;

    if (resultCur.recordset.length > 0) {
      row = resultCur.recordset[0];
      isCur = true;
    } else {
      // Check tblPOSSalesHeader (local history bills)
      const qHist = pool.request();
      qHist.input('inv', sql.VarChar(50), cleanInv);
      const resultHist = await qHist.query(`
        SELECT TOP 1
          RTRIM(LTRIM(InvoiceNo)) AS InvoiceNo,
          '0' AS AccFlag1,
          RTRIM(LTRIM(ISNULL(CustomerCode, 'CASH'))) AS CustomerCode,
          RTRIM(LTRIM(ISNULL(CustomerName, 'CASH'))) AS CustomerName,
          '0' AS Delivered,
          0 AS IsCur
        FROM tblPOSSalesHeader
        WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
      `);

      if (resultHist.recordset.length > 0) {
        row = resultHist.recordset[0];
        isCur = false;
      } else {
        // Fallback: Check unified view vw_POS_SalesHeader (which includes archived database RetailposHisERP)
        const qView = pool.request();
        qView.input('inv', sql.VarChar(50), cleanInv);
        const resultView = await qView.query(`
          SELECT TOP 1
            RTRIM(LTRIM(InvoiceNo)) AS InvoiceNo,
            RTRIM(LTRIM(ISNULL(AccFlag, '0'))) AS AccFlag1,
            RTRIM(LTRIM(ISNULL(CustomerCode, 'CASH'))) AS CustomerCode,
            RTRIM(LTRIM(ISNULL(CustomerName, 'CASH'))) AS CustomerName,
            RTRIM(LTRIM(ISNULL(Delivered, '0'))) AS Delivered,
            0 AS IsCur
          FROM vw_POS_SalesHeader
          WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
        `);

        if (resultView.recordset.length > 0) {
          row = resultView.recordset[0];
          isCur = false;
        }
      }

      if (row) {
        // Check if already in tblPaidDeliveryOrder
        const qPaidDO = pool.request();
        qPaidDO.input('inv', sql.VarChar(50), cleanInv);
        const paidRes = await qPaidDO.query(`
          SELECT TOP 1 InvoiceNo FROM tblPaidDeliveryOrder WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
        `);
        if (paidRes.recordset.length > 0) {
          row.AccFlag1 = '1';
          row.Delivered = '1';
        }
      }
    }

    if (!row) {
      return res.status(404).json({
        success: false,
        message: 'This invoice was not found in sales records.',
      });
    }

    const isDelivered = row.AccFlag1 === '1' || row.Delivered === '1';

    return res.status(200).json({
      success: true,
      invoiceNo: row.InvoiceNo,
      accFlag1: row.AccFlag1,
      isDelivered,
      customerCode: row.CustomerCode,
      customerName: row.CustomerName,
      isCur,
    });
  } catch (err) {
    console.error('❌ [BILL ERROR - CHECK DELIVERY]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 7. POST /api/bills/update-delivery-member
// Exact equivalent of:
// `Update tblPOSSalesHeaderCur Set CustomerCode = @memberCode Where InvoiceNo = @invoiceNo`
// Triggered when CustomerCode is CASH in Butcondelivery_Click.
// Updates tblPOSSalesHeaderCur (or tblPOSSalesHeader / RetailposHisERP) with selected Member Code.
// ------------------------------------------------------------------------------
router.post('/update-delivery-member', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const cleanInv = String(req.body.invoiceNo || '').trim();
    const cleanMem = String(req.body.memberCode || '').trim();

    if (!cleanInv) {
      return res.status(400).json({ success: false, message: 'invoiceNo is required' });
    }
    if (!cleanMem) {
      return res.status(400).json({ success: false, message: 'memberCode is required' });
    }

    // Lookup Member Name from tblMember
    let memberName = '';
    try {
      const qMem = pool.request();
      qMem.input('mem', sql.VarChar(50), cleanMem);
      const memRes = await qMem.query(`
        SELECT TOP 1 RTRIM(LTRIM(MemberName)) AS MemberName
        FROM tblMember
        WHERE UPPER(RTRIM(LTRIM(MemberCode))) = UPPER(@mem)
           OR UPPER(RTRIM(LTRIM(NRICNo))) = UPPER(@mem)
      `);
      if (memRes.recordset.length > 0) {
        memberName = memRes.recordset[0].MemberName || '';
      }
    } catch (e) {
      console.warn('Member name lookup warning:', e.message);
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();

    try {
      // 1. Try updating tblPOSSalesHeaderCur first
      const updCur = new sql.Request(tx);
      updCur.input('inv', sql.VarChar(50), cleanInv);
      updCur.input('mem', sql.VarChar(50), cleanMem);
      updCur.input('name', sql.VarChar(100), memberName);

      const resCur = await updCur.query(`
        UPDATE tblPOSSalesHeaderCur
        SET CustomerCode = @mem,
            CustomerName = CASE WHEN @name <> '' THEN @name ELSE CustomerName END,
            ModifyDate = GETDATE()
        WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
      `);

      if (resCur.rowsAffected && resCur.rowsAffected[0] > 0) {
        await tx.commit();
        return res.status(200).json({
          success: true,
          invoiceNo: cleanInv,
          customerCode: cleanMem,
          customerName: memberName,
          targetTable: 'tblPOSSalesHeaderCur',
          message: `Member ${cleanMem} assigned to Invoice ${cleanInv} successfully.`,
        });
      }

      // 2. If not in Cur, try updating local history table tblPOSSalesHeader
      const updHist = new sql.Request(tx);
      updHist.input('inv', sql.VarChar(50), cleanInv);
      updHist.input('mem', sql.VarChar(50), cleanMem);
      updHist.input('name', sql.VarChar(100), memberName);

      const resHist = await updHist.query(`
        UPDATE tblPOSSalesHeader
        SET CustomerCode = @mem,
            CustomerName = CASE WHEN @name <> '' THEN @name ELSE CustomerName END,
            ModifyDate = GETDATE()
        WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
      `);

      if (resHist.rowsAffected && resHist.rowsAffected[0] > 0) {
        await tx.commit();
        return res.status(200).json({
          success: true,
          invoiceNo: cleanInv,
          customerCode: cleanMem,
          customerName: memberName,
          targetTable: 'tblPOSSalesHeader',
          message: `Member ${cleanMem} assigned to History Invoice ${cleanInv} successfully.`,
        });
      }

      // 3. If not in local tables, update archived database RetailposHisERP.dbo.TBLPOSSALESHEADER
      const updHisERP = new sql.Request(tx);
      updHisERP.input('inv', sql.VarChar(50), cleanInv);
      updHisERP.input('mem', sql.VarChar(50), cleanMem);
      updHisERP.input('name', sql.VarChar(100), memberName);

      const resHisERP = await updHisERP.query(`
        UPDATE RetailposHisERP.dbo.TBLPOSSALESHEADER
        SET CustomerCode = @mem,
            CustomerName = CASE WHEN @name <> '' THEN @name ELSE CustomerName END,
            ModifyDate = GETDATE()
        WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
      `);

      if (resHisERP.rowsAffected && resHisERP.rowsAffected[0] > 0) {
        await tx.commit();
        return res.status(200).json({
          success: true,
          invoiceNo: cleanInv,
          customerCode: cleanMem,
          customerName: memberName,
          targetTable: 'RetailposHisERP.dbo.TBLPOSSALESHEADER',
          message: `Member ${cleanMem} assigned to Archived Invoice ${cleanInv} successfully.`,
        });
      }

      await tx.rollback();
      return res.status(404).json({
        success: false,
        message: `Invoice #${cleanInv} was not found in active, history, or archived sales records.`,
      });
    } catch (txErr) {
      await tx.rollback();
      throw txErr;
    }
  } catch (err) {
    console.error('❌ [BILL ERROR - UPDATE MEMBER]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 8. POST /api/bills/execute-delivery
// Exact equivalent of `fncupdatedeleivery(sInvoiceNo)` in clsInventory.vb
// Triggered when CustomerCode is NOT CASH.
// Creates/marks delivery in database with safe transaction handling (COMMIT/ROLLBACK).
// ------------------------------------------------------------------------------
router.post('/execute-delivery', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const cleanInv = String(req.body.invoiceNo || '').trim();
    if (!cleanInv) {
      return res.status(400).json({ success: false, message: 'invoiceNo is required' });
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();

    try {
      // 1. Check in tblPOSSalesHeaderCur first
      const chkCur = new sql.Request(tx);
      chkCur.input('inv', sql.VarChar(50), cleanInv);
      const chkResCur = await chkCur.query(`
        SELECT TOP 1
          RTRIM(LTRIM(InvoiceNo)) AS InvoiceNo,
          InvoiceDate,
          RTRIM(LTRIM(ISNULL(AccFlag, '0'))) AS AccFlag1,
          RTRIM(LTRIM(ISNULL(CustomerCode, ''))) AS CustomerCode,
          RTRIM(LTRIM(ISNULL(CustomerName, ''))) AS CustomerName,
          RTRIM(LTRIM(ISNULL(LocationCode, 'HQ'))) AS LocationCode,
          RTRIM(LTRIM(ISNULL(CashierID, 'UPS'))) AS CashierID,
          1 AS IsCur
        FROM tblPOSSalesHeaderCur WITH (UPDLOCK)
        WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
      `);

      let invRow = null;
      let isCur = true;

      if (chkResCur.recordset.length > 0) {
        invRow = chkResCur.recordset[0];
        isCur = true;
      } else {
        // Check in tblPOSSalesHeader (history table)
        const chkHist = new sql.Request(tx);
        chkHist.input('inv', sql.VarChar(50), cleanInv);
        const chkResHist = await chkHist.query(`
          SELECT TOP 1
            RTRIM(LTRIM(InvoiceNo)) AS InvoiceNo,
            InvoiceDate,
            '0' AS AccFlag1,
            RTRIM(LTRIM(ISNULL(CustomerCode, ''))) AS CustomerCode,
            RTRIM(LTRIM(ISNULL(CustomerName, ''))) AS CustomerName,
            RTRIM(LTRIM(ISNULL(LocationCode, 'HQ'))) AS LocationCode,
            RTRIM(LTRIM(ISNULL(CashierID, 'UPS'))) AS CashierID,
            0 AS IsCur
          FROM tblPOSSalesHeader WITH (UPDLOCK)
          WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
        `);

        if (chkResHist.recordset.length > 0) {
          invRow = chkResHist.recordset[0];
          isCur = false;

          // Check if already in tblPaidDeliveryOrder
          const paidReq = new sql.Request(tx);
          paidReq.input('inv', sql.VarChar(50), cleanInv);
          const paidCheck = await paidReq.query(`
            SELECT TOP 1 InvoiceNo FROM tblPaidDeliveryOrder WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
          `);
          if (paidCheck.recordset.length > 0) {
            invRow.AccFlag1 = '1';
          }
        } else {
          // Check in RetailposHisERP.dbo.TBLPOSSALESHEADER (archived table)
          const chkHisERP = new sql.Request(tx);
          chkHisERP.input('inv', sql.VarChar(50), cleanInv);
          const chkResHisERP = await chkHisERP.query(`
            SELECT TOP 1
              RTRIM(LTRIM(InvoiceNo)) AS InvoiceNo,
              InvoiceDate,
              '0' AS AccFlag1,
              RTRIM(LTRIM(ISNULL(CustomerCode, ''))) AS CustomerCode,
              RTRIM(LTRIM(ISNULL(CustomerName, ''))) AS CustomerName,
              RTRIM(LTRIM(ISNULL(LocationCode, 'HQ'))) AS LocationCode,
              RTRIM(LTRIM(ISNULL(CashierID, 'UPS'))) AS CashierID,
              0 AS IsCur
            FROM RetailposHisERP.dbo.TBLPOSSALESHEADER WITH (UPDLOCK)
            WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
          `);

          if (chkResHisERP.recordset.length > 0) {
            invRow = chkResHisERP.recordset[0];
            isCur = false;

            const paidReq = new sql.Request(tx);
            paidReq.input('inv', sql.VarChar(50), cleanInv);
            const paidCheck = await paidReq.query(`
              SELECT TOP 1 InvoiceNo FROM tblPaidDeliveryOrder WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
            `);
            if (paidCheck.recordset.length > 0) {
              invRow.AccFlag1 = '1';
            }
          }
        }
      }

      if (!invRow) {
        await tx.rollback();
        return res.status(404).json({
          success: false,
          message: 'Invoice not found in sales records.',
        });
      }

      // Re-verify AccFlag1 to prevent duplicate delivery creation
      if (invRow.AccFlag1 === '1') {
        await tx.rollback();
        return res.status(400).json({
          success: false,
          alreadyDelivered: true,
          message: 'This Sales already delivered!!',
        });
      }

      // Re-verify CustomerCode is not CASH
      if (!invRow.CustomerCode || invRow.CustomerCode.toUpperCase() === 'CASH') {
        await tx.rollback();
        return res.status(400).json({
          success: false,
          requireMemberScan: true,
          message: 'Please Scan the Member',
        });
      }

      // 2. Execute fncupdatedeleivery updates:
      if (isCur) {
        const upd = new sql.Request(tx);
        upd.input('inv', sql.VarChar(50), cleanInv);
        upd.input('user', sql.VarChar(50), invRow.CashierID || 'UPS');

        await upd.query(`
          UPDATE tblPOSSalesHeaderCur
          SET 
            AccFlag = '1',
            Delivered = '1',
            DeliverDate = GETDATE(),
            ModifyDate = GETDATE(),
            ModifyUser = @user
          WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
        `);
      }

      // 3. Insert into tblPaidDeliveryOrder if customer record exists
      try {
        const doReq = new sql.Request(tx);
        doReq.input('loc', sql.VarChar(20), invRow.LocationCode || 'HQ');
        doReq.input('cust', sql.VarChar(50), invRow.CustomerCode);
        doReq.input('inv', sql.VarChar(50), cleanInv);
        doReq.input('user', sql.VarChar(50), invRow.CashierID || 'UPS');

        await doReq.query(`
          IF NOT EXISTS (SELECT 1 FROM tblPaidDeliveryOrder WHERE RTRIM(LTRIM(InvoiceNo)) = @inv)
          BEGIN
            INSERT INTO tblPaidDeliveryOrder (
              LocationCode, CustomerCode, CustomerName, Address1, Address2, Address3,
              HandPhone, Phone, Country, ZipCode, InvoiceNo, InvoiceDate, DeliveryDate,
              CreateUser, CreateDate, Modifyuser, ModifyDate
            )
            SELECT TOP 1
              @loc, MemberCode, MemberName, ISNULL(Address1, ''), ISNULL(Address2, ''), ISNULL(Address3, ''),
              ISNULL(Mobile, ''), ISNULL(ResPhone, ''), ISNULL(Country, ''), ISNULL(ZipCode, ''),
              @inv, GETDATE(), GETDATE(), @user, GETDATE(), @user, GETDATE()
            FROM tblMember
            WHERE RTRIM(LTRIM(MemberCode)) = @cust
          END
        `);
      } catch (doErr) {
        console.warn('⚠️ [OPTIONAL PAID DELIVERY ORDER RECORD]:', doErr.message);
      }

      // Commit transaction
      await tx.commit();

      return res.status(200).json({
        success: true,
        invoiceNo: cleanInv,
        message: 'Delivered Created Successfully',
      });
    } catch (txErr) {
      await tx.rollback();
      throw txErr;
    }
  } catch (err) {
    console.error('❌ [BILL ERROR - EXECUTE DELIVERY]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Backward-compatible alias for single-call convert-delivery
router.post('/convert-delivery', async (req, res) => {
  const { invoiceNo, memberCode } = req.body;
  const cleanInv = String(invoiceNo || '').trim();
  const cleanMem = String(memberCode || '').trim();

  // If memberCode is provided, update member first
  if (cleanMem) {
    try {
      const pool = await getPool();
      const upd = pool.request();
      upd.input('inv', sql.VarChar(50), cleanInv);
      upd.input('mem', sql.VarChar(50), cleanMem);
      await upd.query('UPDATE tblPOSSalesHeaderCur SET CustomerCode = @mem WHERE RTRIM(LTRIM(InvoiceNo)) = @inv');
    } catch (e) {
      console.warn('Member update failed:', e.message);
    }
  }

  // Then delegate to execute-delivery
  req.url = '/execute-delivery';
  return router.handle(req, res);
});

module.exports = router;
