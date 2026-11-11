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
const { getPool, sql } = require('../config/db');

// Helper to format date as YYYY-MM-DD
function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
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
// 4. GET /api/bills/:invoiceNo
// Retrieves complete Bill details:
//   - Header from vw_POS_SalesHeader
//   - Items from vwSalesDetail
//   - Payments from vw_POS_PayModeDetail
// ------------------------------------------------------------------------------
router.get('/:invoiceNo', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const rawInv = String(req.params.invoiceNo || '').trim();
    if (!rawInv) {
      return res.status(400).json({ success: false, message: 'Invoice number is required' });
    }

    // 1. Fetch Header from vw_POS_SalesHeader
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
        CreateDate,
        ModifyDate
      FROM vw_POS_SalesHeader
      WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
    `);

    // 2. Fetch Line Items from vwSalesDetail
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

    // 3. Fetch Payment Mode details
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

    if (hdrRes.recordset.length === 0 && detRes.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Bill ${rawInv} not found in transaction history.`,
      });
    }

    const header = hdrRes.recordset[0] || {
      InvoiceNo: rawInv,
      InvoiceDate: new Date(),
      TotalValue: detRes.recordset.reduce((s, r) => s + Number(r.TotalValue || 0), 0),
      NetTotal: detRes.recordset.reduce((s, r) => s + Number(r.NetAmount || 0), 0),
      TenderAmount: payRes.recordset.reduce((s, r) => s + Number(r.Amount || 0), 0),
      Balance: 0,
      Gst: detRes.recordset.reduce((s, r) => s + Number(r.Gst || 0), 0),
      TotalDiscount: detRes.recordset.reduce((s, r) => s + Number(r.Discount || 0), 0),
      CashierID: 'UPS',
      CustomerCode: 'CASH',
      CustomerName: 'CASH',
      TerminalCode: '',
      LocationCode: '',
      TotalLines: detRes.recordset.length,
      Delivered: '',
      AccFlag: '',
    };

    const payModesList = payRes.recordset.map((p) => ({
      payMode: p.PayMode,
      amount: Number(p.Amount),
      commission: Number(p.Commision),
      slipNo: p.SlipNo,
    }));

    const payModeSummaryText = payModesList.map((p) => p.payMode).join(' , ') || 'CASH';

    const items = detRes.recordset.map((r) => ({
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
        payModeSummary: payModeSummaryText,
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
// Implements cmdBillCancel_Click from frmLastTransaction.vb:
//   - Date validation against server date (Current vs History bill check)
//   - sp_SalesBillCancel stored procedure execution
//   - Transaction commit/rollback
//   - NextBillCancelNo increment
//   - Member points log update via sp_SaveMemberPointsByInvoice
// ------------------------------------------------------------------------------
router.post('/cancel', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const { invoiceNo, cashierId, locationCode, printVoidBill } = req.body;
    const cleanInv = String(invoiceNo || '').trim();
    if (!cleanInv) {
      return res.status(400).json({ success: false, message: 'invoiceNo is required for bill cancel' });
    }

    const loc = String(locationCode || 'HQ').trim();
    const user = String(cashierId || 'UPS').trim();

    // 1. Retrieve the sales header using fncGetSalesHeaderByInvoiceNoTemp logic
    const chkReq = pool.request();
    chkReq.input('inv', sql.VarChar(50), cleanInv);
    const chkRes = await chkReq.query(`
      SELECT TOP 1 
        RTRIM(LTRIM(InvoiceNo)) AS InvoiceNo, 
        InvoiceDate, 
        NetTotal, 
        RTRIM(LTRIM(CustomerCode)) AS CustomerCode,
        RTRIM(LTRIM(LocationCode)) AS LocationCode
      FROM tblPOSSalesHeaderCur
      WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
    `);

    if (chkRes.recordset.length === 0) {
      // Check if it's already in history table
      const histReq = pool.request();
      histReq.input('inv', sql.VarChar(50), cleanInv);
      const histRes = await histReq.query(`
        SELECT TOP 1 InvoiceNo FROM tblPOSSalesHeader WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
      `);

      if (histRes.recordset.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'You cannot cancel History Bills. Only today\'s current bills can be cancelled.',
        });
      }

      return res.status(404).json({
        success: false,
        message: 'This Bill Not Found... Please Give Correct Bill No',
      });
    }

    const header = chkRes.recordset[0];

    // 2. Date validation against server date
    const serverDateReq = pool.request();
    const serverDateRes = await serverDateReq.query('SELECT CONVERT(varchar(10), GETDATE(), 120) AS ServerDate');
    const serverDateStr = serverDateRes.recordset[0]?.ServerDate;
    const invDateStr = formatDate(header.InvoiceDate);

    // 3. Get NextBillCancelNo from tblmaCompany
    const cancelNoReq = pool.request();
    const cancelNoRes = await cancelNoReq.query('SELECT ISNULL(NextBillCancelNo, 1) AS NextBillCancelNo FROM tblmaCompany');
    const billCancelNo = String(cancelNoRes.recordset[0]?.NextBillCancelNo || 1);

    // 4. Execute sp_SalesBillCancel
    const execReq = pool.request();
    execReq.input('InvoiceNo', sql.Char(15), cleanInv);
    execReq.input('LocationCode', sql.Char(10), loc);
    execReq.input('UserID', sql.Char(10), user);

    await execReq.execute('sp_SalesBillCancel');

    // 5. Update Member Points to HQ if applicable:
    try {
      const memCode = (header.CustomerCode || '').trim();
      if (memCode && memCode.toUpperCase() !== 'CASH') {
        const hqReq = pool.request();
        hqReq.input('InvoiceNo', sql.VarChar(30), cleanInv);
        hqReq.input('BillCancelNo', sql.VarChar(10), billCancelNo);
        hqReq.input('MemberCode', sql.VarChar(30), memCode);
        hqReq.input('UserID', sql.VarChar(20), user);
        await hqReq.execute('sp_SaveMemberPointsByInvoice');
      }
    } catch (memErr) {
      console.warn('⚠️ [BILL CANCEL - MEMBER POINTS UPDATE]:', memErr.message);
    }

    return res.status(200).json({
      success: true,
      invoiceNo: cleanInv,
      billCancelNo,
      printVoidBill: Boolean(printVoidBill),
      message: 'Bill Cancelled Successfully.',
    });
  } catch (err) {
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
      // Check tblPOSSalesHeader (history bills)
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
// Updates tblPOSSalesHeaderCur (or tblPOSSalesHeader if history) with selected Member Code.
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

    const tx = new sql.Transaction(pool);
    await tx.begin();

    try {
      const updCur = new sql.Request(tx);
      updCur.input('inv', sql.VarChar(50), cleanInv);
      updCur.input('mem', sql.VarChar(50), cleanMem);

      const resCur = await updCur.query(`
        UPDATE tblPOSSalesHeaderCur
        SET CustomerCode = @mem
        WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
      `);

      if (resCur.rowsAffected && resCur.rowsAffected[0] > 0) {
        await tx.commit();
        return res.status(200).json({
          success: true,
          invoiceNo: cleanInv,
          customerCode: cleanMem,
          message: `Member ${cleanMem} assigned to Invoice ${cleanInv} successfully.`,
        });
      }

      // If not in Cur, update history table tblPOSSalesHeader
      const updHist = new sql.Request(tx);
      updHist.input('inv', sql.VarChar(50), cleanInv);
      updHist.input('mem', sql.VarChar(50), cleanMem);

      await updHist.query(`
        UPDATE tblPOSSalesHeader
        SET CustomerCode = @mem
        WHERE RTRIM(LTRIM(InvoiceNo)) = @inv
      `);

      await tx.commit();

      return res.status(200).json({
        success: true,
        invoiceNo: cleanInv,
        customerCode: cleanMem,
        message: `Member ${cleanMem} assigned to History Invoice ${cleanInv} successfully.`,
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
            SELECT 
              @loc, CustomerCode, CustomerName, ISNULL(Address1, ''), ISNULL(Address2, ''), ISNULL(Address3, ''),
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
