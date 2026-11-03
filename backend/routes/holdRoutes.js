// ==============================================================================
// Project: Supermarket Retail POS
// Module: Sales Hold and Release (F6 Hold / F7 Release)
// File: routes/holdRoutes.js
// Description: Manages persistent Hold & Release workflow directly mirroring VB.NET
//              frmPos1.vb, reusing sp_POS_SalesHoldHeaderSave, sp_POS_SalesHoldDetailSave,
//              sp_POS_SalesHoldBatchDetailSave, sp_POS_SalesHoldSerialDetailSave,
//              and sp_POS_DeleteHoldSales.
// ==============================================================================

const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../config/db');
const configService = require('../config/configService');

// ------------------------------------------------------------------------------
// GET /api/hold/check-permission
// Checks if current cashier or cashier group has permission for F6 Hold
// ------------------------------------------------------------------------------
router.get('/check-permission', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const cashierId = (req.query.cashierId || '').trim();
    if (!cashierId) {
      return res.status(400).json({ success: false, message: 'cashierId is required' });
    }

    // 1. Check user details from tblMausermaster
    const userReq = pool.request();
    userReq.input('user', sql.VarChar(50), cashierId);
    const userRes = await userReq.query(`
      SELECT UserName, UserGroupCode, CashierGroupCode, IsAdmin
      FROM tblMausermaster
      WHERE UPPER(RTRIM(LTRIM(UserName))) = UPPER(@user)
    `);

    if (userRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = userRes.recordset[0];
    if (user.IsAdmin === 1 || user.IsAdmin === true || (user.UserGroupCode || '').toUpperCase().includes('ADMIN')) {
      return res.status(200).json({ success: true, allowed: true, isAdmin: true });
    }

    // 2. Query tblPOSPermission for F6 function
    const cashierGroup = (user.CashierGroupCode || user.UserGroupCode || '').trim();
    const permReq = pool.request();
    permReq.input('grp', sql.VarChar(50), cashierGroup);
    const permRes = await permReq.query(`
      SELECT Status
      FROM tblPOSPermission
      WHERE UPPER(RTRIM(LTRIM(CashierGroupCode))) = UPPER(@grp)
        AND UPPER(RTRIM(LTRIM(FunctionCode))) = 'F6'
    `);

    let allowed = true; // default in POS if not explicitly blocked
    if (permRes.recordset.length > 0) {
      allowed = Boolean(permRes.recordset[0].Status);
    }

    return res.status(200).json({
      success: true,
      allowed,
      cashierGroup,
      requiresAdminAuth: !allowed,
    });
  } catch (err) {
    console.error('❌ [HOLD PERMISSION ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// POST /api/hold/verify-admin
// Authorizes F6 Hold when normal cashier permission is denied
// ------------------------------------------------------------------------------
router.post('/verify-admin', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const reqAuth = pool.request();
    reqAuth.input('user', sql.VarChar(50), username.trim());
    reqAuth.input('pwd', sql.VarChar(50), password.trim());

    const result = await reqAuth.query(`
      SELECT UserName, UserGroupCode, IsAdmin
      FROM tblMausermaster
      WHERE UPPER(RTRIM(LTRIM(UserName))) = UPPER(@user)
        AND (Password = @pwd OR LTRIM(RTRIM(Password)) = @pwd)
        AND (IsAdmin = 1 OR UPPER(RTRIM(LTRIM(UserGroupCode))) = 'ADMIN')
    `);

    if (result.recordset.length > 0) {
      return res.status(200).json({ success: true, authorized: true, adminName: result.recordset[0].UserName });
    } else {
      return res.status(401).json({ success: false, authorized: false, message: 'Invalid Admin credentials' });
    }
  } catch (err) {
    console.error('❌ [ADMIN VERIFY ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// GET /api/hold/next-number
// Returns next available Hold Number from tblMaCompany
// ------------------------------------------------------------------------------
router.get('/next-number', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const coRes = await pool.request().query(`SELECT ISNULL(HoldNo, 1) AS CoHoldNo FROM tblMaCompany`);
    const hdrRes = await pool.request().query(`SELECT ISNULL(MAX(HoldNo), 0) AS MaxHdrHoldNo FROM tblPOSSalesHoldHeader`);
    
    let coNo = Number(coRes.recordset[0]?.CoHoldNo || 1);
    const maxHdrNo = Number(hdrRes.recordset[0]?.MaxHdrHoldNo || 0);

    // If company counter is already taken by an existing hold header, advance past it
    let nextNo = coNo;
    if (nextNo <= maxHdrNo) {
      nextNo = maxHdrNo + 1;
    }

    return res.status(200).json({ success: true, nextHoldNo: nextNo });
  } catch (err) {
    console.error('❌ [NEXT HOLD NO ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// GET /api/hold/list
// Returns all active hold bills from tblPOSSalesHoldHeader
// ------------------------------------------------------------------------------
router.get('/list', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const terminalCode = (req.query.terminalCode || '').trim();

    let query = `
      SELECT 
        HoldNo,
        InvoiceNo,
        InvoiceDate,
        TotalValue,
        DetailDiscount,
        TotalDiscount,
        NetTotal,
        CashierID,
        LocationCode,
        TerminalCode,
        TotalLines,
        CustomerCode,
        CustomerName,
        CreateDate,
        CreateUser,
        Remarks
      FROM tblPOSSalesHoldHeader
    `;

    const request = pool.request();
    if (terminalCode) {
      query += ` WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@term)`;
      request.input('term', sql.VarChar(20), terminalCode);
    }
    query += ` ORDER BY HoldNo DESC`;

    const result = await request.query(query);

    return res.status(200).json({
      success: true,
      count: result.recordset.length,
      holds: result.recordset,
    });
  } catch (err) {
    console.error('❌ [HOLD LIST ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// GET /api/hold/:holdNo
// Returns full details (Header + Items) of a specific Hold Number
// ------------------------------------------------------------------------------
router.get('/:holdNo', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const holdNo = Number(req.params.holdNo);
    if (isNaN(holdNo)) {
      return res.status(400).json({ success: false, message: 'Invalid holdNo' });
    }

    const headerReq = pool.request();
    headerReq.input('hNo', sql.Decimal(18, 0), holdNo);
    const headerRes = await headerReq.query(`
      SELECT * FROM tblPOSSalesHoldHeader WHERE HoldNo = @hNo
    `);

    if (headerRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Hold bill not found' });
    }

    const detailReq = pool.request();
    detailReq.input('hNo', sql.Decimal(18, 0), holdNo);
    const detailRes = await detailReq.query(`
      SELECT 
        d.*,
        ISNULL(i.UOM, 'PCS') AS UOM
      FROM tblPOSSalesHoldDetail d
      LEFT JOIN tblInventory i ON RTRIM(LTRIM(d.InventoryCode)) = RTRIM(LTRIM(i.InventoryCode))
      WHERE d.HoldNo = @hNo
      ORDER BY d.InventoryCode
    `);

    return res.status(200).json({
      success: true,
      header: headerRes.recordset[0],
      details: detailRes.recordset,
    });
  } catch (err) {
    console.error('❌ [HOLD GET ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// POST /api/hold/save
// Executes complete VB.NET HOLD Transaction (Header + Details via Stored Procedures)
// ------------------------------------------------------------------------------
router.post('/save', async (req, res) => {
  const pool = await getPool();
  if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

  const {
    holdNo: requestedHoldNo,
    manualHold = false,
    items = [],
    terminalCode,
    cashierId,
    locationCode = 'HQ',
    customerCode = 'CASH',
    customerName = '',
    remarks = '',
  } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Cart items cannot be empty for Hold' });
  }

  const termCode = (terminalCode || '').trim();
  const cId = (cashierId || 'UPS').trim();

  // Validate System Configuration rules
  const holdBillEnabled = configService.getBoolean('HOLDBILL');
  if (!holdBillEnabled) {
    return res.status(403).json({ success: false, message: 'Hold Bill functionality is disabled in System Configuration (HOLDBILL = 0)' });
  }

  const allowHoldOnlyTwo = configService.getBoolean('AllowHoldOnlyTwobills');
  if (allowHoldOnlyTwo) {
    const countReq = pool.request();
    countReq.input('term', sql.VarChar(20), termCode);
    const countRes = await countReq.query(`
      SELECT COUNT(*) AS activeHoldCount
      FROM tblPOSSalesHoldHeader
      WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@term)
    `);
    if (countRes.recordset[0]?.activeHoldCount >= 2) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 2 held bills allowed per System Configuration (AllowHoldOnlyTwobills = 1). Please release a bill first.',
      });
    }
  }

  // Begin atomic database transaction
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // 1. Determine Hold Number safely (ensuring no collision with existing records)
    let finalHoldNo = requestedHoldNo ? Number(requestedHoldNo) : null;

    if (!finalHoldNo || isNaN(finalHoldNo)) {
      const coReq = new sql.Request(transaction);
      const coRes = await coReq.query(`SELECT ISNULL(HoldNo, 1) AS NextHoldNo FROM tblMaCompany WITH (UPDLOCK)`);
      const hdrReq = new sql.Request(transaction);
      const hdrRes = await hdrReq.query(`SELECT ISNULL(MAX(HoldNo), 0) AS MaxHdrHoldNo FROM tblPOSSalesHoldHeader WITH (UPDLOCK)`);

      let coNo = Number(coRes.recordset[0]?.NextHoldNo || 1);
      const maxHdrNo = Number(hdrRes.recordset[0]?.MaxHdrHoldNo || 0);

      finalHoldNo = coNo;
      if (finalHoldNo <= maxHdrNo) {
        finalHoldNo = maxHdrNo + 1;
        // Sync tblMaCompany so it remains aligned
        const syncReq = new sql.Request(transaction);
        syncReq.input('syncNo', sql.Decimal(18, 0), finalHoldNo);
        await syncReq.query(`UPDATE tblMaCompany SET HoldNo = @syncNo`);
      }
    } else {
      // Manual Hold number specified: check duplicate
      const dupReq = new sql.Request(transaction);
      dupReq.input('hNo', sql.Decimal(18, 0), finalHoldNo);
      const dupRes = await dupReq.query(`SELECT HoldNo FROM tblPOSSalesHoldHeader WHERE HoldNo = @hNo`);
      if (dupRes.recordset.length > 0) {
        await transaction.rollback();
        return res.status(409).json({ success: false, message: `Hold Number ${finalHoldNo} already exists. Please use a different number.` });
      }
    }

    // 2. Calculate summary totals
    let totalValue = 0;
    let totalDiscount = 0;
    let totalLines = items.length;

    items.forEach(it => {
      const lineAmt = Number(it.amount || (it.qty * it.price - (it.disc || 0)));
      totalValue += (Number(it.qty) * Number(it.price));
      totalDiscount += Number(it.disc || 0);
    });

    const netTotal = parseFloat((totalValue - totalDiscount).toFixed(2));

    // 3. Save Hold Header using sp_POS_SalesHoldHeaderSave
    const hdrReq = new sql.Request(transaction);
    hdrReq.input('HoldNo', sql.Decimal(18, 0), finalHoldNo);
    hdrReq.input('InvoiceNo', sql.VarChar(20), '');
    hdrReq.input('InvoiceDate', sql.SmallDateTime, new Date());
    hdrReq.input('TotalValue', sql.Decimal(18, 2), totalValue);
    hdrReq.input('DetailDiscount', sql.Decimal(18, 2), totalDiscount);
    hdrReq.input('NetDiscountAmount', sql.Decimal(18, 2), 0);
    hdrReq.input('NetDiscountPerc', sql.Decimal(18, 2), 0);
    hdrReq.input('MemberDiscount', sql.Decimal(18, 2), 0);
    hdrReq.input('TotalDiscount', sql.Decimal(18, 2), totalDiscount);
    hdrReq.input('DiscountType', sql.VarChar(20), '');
    hdrReq.input('Gst', sql.Decimal(18, 4), 0);
    hdrReq.input('NetTotal', sql.Decimal(18, 2), netTotal);
    hdrReq.input('CashierID', sql.VarChar(10), cId.slice(0, 10));
    hdrReq.input('LocationCode', sql.VarChar(10), locationCode.slice(0, 10));
    hdrReq.input('TerminalCode', sql.VarChar(10), termCode.slice(0, 10));
    hdrReq.input('TotalLines', sql.Int, totalLines);
    hdrReq.input('TenderAmount', sql.Decimal(18, 2), 0);
    hdrReq.input('Balance', sql.Decimal(18, 2), 0);
    hdrReq.input('SalesType', sql.VarChar(10), 'CASH');
    hdrReq.input('CustomerCode', sql.VarChar(10), customerCode.slice(0, 10));
    hdrReq.input('CustomerName', sql.VarChar(50), customerName.slice(0, 50));
    hdrReq.input('Address1', sql.VarChar(50), '');
    hdrReq.input('Address2', sql.VarChar(50), '');
    hdrReq.input('Address3', sql.VarChar(50), '');
    hdrReq.input('Phone', sql.VarChar(15), '');
    hdrReq.input('Fax', sql.VarChar(15), '');
    hdrReq.input('GstType', sql.Char(1), 'Z');
    hdrReq.input('RoundOff', sql.Decimal(18, 2), 0);
    hdrReq.input('Remarks', sql.NVarChar(400), remarks);
    hdrReq.input('UserID', sql.Char(10), cId.slice(0, 10));

    await hdrReq.execute('sp_POS_SalesHoldHeaderSave');

    // 4. Save Hold Details using sp_POS_SalesHoldDetailSave
    for (const item of items) {
      const invCode = String(item.code || item.InventoryCode).trim();
      const qtyNum = Number(item.qty || 1);
      const priceNum = Number(item.price || 0);
      const discNum = Number(item.disc || 0);
      const lineTotal = parseFloat((qtyNum * priceNum).toFixed(2));
      const lineNet = parseFloat((lineTotal - discNum).toFixed(2));

      // Query inventory extra attributes
      const itemAttrReq = new sql.Request(transaction);
      itemAttrReq.input('code', sql.VarChar(50), invCode);
      const attrRes = await itemAttrReq.query(`
        SELECT 
          ISNULL(DepartmentCode, '') AS DeptCode,
          ISNULL(CategoryCode, '') AS CategoryCode,
          ISNULL(BrandCode, '') AS BrandCode,
          ISNULL(AverageCost, 0) AS AverageCost,
          ISNULL(RetailPrice, 0) AS RetailPrice,
          ISNULL(OutputTax, 0) AS OutputTax
        FROM tblInventory
        WHERE RTRIM(LTRIM(InventoryCode)) = @code
      `);

      const attr = attrRes.recordset[0] || {
        DeptCode: '',
        CategoryCode: '',
        BrandCode: '',
        AverageCost: 0,
        RetailPrice: priceNum,
        OutputTax: 0,
      };

      const detReq = new sql.Request(transaction);
      detReq.input('HoldNo', sql.Decimal(18, 0), finalHoldNo);
      detReq.input('LocationCode', sql.VarChar(10), locationCode.slice(0, 10));
      detReq.input('InvoiceNo', sql.VarChar(20), '');
      detReq.input('InventoryCode', sql.VarChar(20), invCode.slice(0, 20));
      detReq.input('Description', sql.NVarChar(100), String(item.description || item.Description || '').slice(0, 100));
      detReq.input('Qty', sql.Decimal(18, 3), qtyNum);
      detReq.input('Price', sql.Decimal(18, 2), priceNum);
      detReq.input('TotalValue', sql.Decimal(18, 2), lineTotal);
      detReq.input('Discount', sql.Decimal(18, 2), discNum);
      detReq.input('NetDiscount', sql.Decimal(18, 2), discNum);
      detReq.input('MemberDiscount', sql.Decimal(18, 2), 0);
      detReq.input('SubTotal', sql.Decimal(18, 2), lineNet);
      detReq.input('Gst', sql.Decimal(18, 4), 0);
      detReq.input('NetAmount', sql.Decimal(18, 2), lineNet);
      detReq.input('ActualSales', sql.Decimal(18, 2), lineNet);
      detReq.input('SalesManId', sql.VarChar(10), cId.slice(0, 10));
      detReq.input('DeptCode', sql.VarChar(10), String(attr.DeptCode).slice(0, 10));
      detReq.input('CategoryCode', sql.VarChar(10), String(attr.CategoryCode).slice(0, 10));
      detReq.input('BrandCode', sql.VarChar(10), String(attr.BrandCode).slice(0, 10));
      detReq.input('AverageCost', sql.Decimal(18, 2), Number(attr.AverageCost) || 0);
      detReq.input('UnitCost', sql.Decimal(18, 2), 0);
      detReq.input('RetailPrice', sql.Decimal(18, 2), Number(attr.RetailPrice) || priceNum);
      detReq.input('TaxPerc', sql.Decimal(18, 2), Number(attr.OutputTax) || 0);
      detReq.input('Remarks', sql.VarChar(100), '');
      detReq.input('SalesManCode', sql.VarChar(10), '');
      detReq.input('PromotionCode', sql.VarChar(10), '');
      detReq.input('PromotionName', sql.VarChar(50), invCode.slice(0, 50));
      detReq.input('DiscPriceCode', sql.VarChar(10), '');
      detReq.input('DiscPriceQty', sql.Decimal(18, 2), 0);
      detReq.input('UserID', sql.Char(10), cId.slice(0, 10));

      await detReq.execute('sp_POS_SalesHoldDetailSave');
    }

    // 5. Clean active temporary cart in tblTempSales
    const clearTempReq = new sql.Request(transaction);
    clearTempReq.input('term', sql.VarChar(20), termCode);
    await clearTempReq.query(`DELETE FROM tblTempSales WHERE RTRIM(LTRIM(TerminalCode)) = @term`);

    // Commit transaction
    await transaction.commit();

    return res.status(200).json({
      success: true,
      holdNo: finalHoldNo,
      totalLines,
      netTotal,
      message: `Bill successfully held with Hold Number #${finalHoldNo}`,
    });
  } catch (txErr) {
    await transaction.rollback();
    console.error('❌ [HOLD TRANSACTION FAILED]:', txErr.message);
    return res.status(500).json({ success: false, message: 'Hold failed: ' + txErr.message });
  }
});

// ------------------------------------------------------------------------------
// POST /api/hold/:holdNo/release
// Releases a hold bill: returns line items to restore in cart and deletes from hold tables
// ------------------------------------------------------------------------------
router.post('/:holdNo/release', async (req, res) => {
  const pool = await getPool();
  if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

  const holdNo = Number(req.params.holdNo);
  if (isNaN(holdNo)) {
    return res.status(400).json({ success: false, message: 'Invalid holdNo' });
  }

  const { terminalCode } = req.body;
  const termCode = (terminalCode || '').trim();

  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // 1. Fetch Header & Details
    const hReq = new sql.Request(transaction);
    hReq.input('hNo', sql.Decimal(18, 0), holdNo);
    const hRes = await hReq.query(`SELECT * FROM tblPOSSalesHoldHeader WHERE HoldNo = @hNo`);
    if (hRes.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Hold bill not found' });
    }

    const dReq = new sql.Request(transaction);
    dReq.input('hNo', sql.Decimal(18, 0), holdNo);
    const dRes = await dReq.query(`
      SELECT 
        d.*,
        ISNULL(i.UOM, 'PCS') AS UOM
      FROM tblPOSSalesHoldDetail d
      LEFT JOIN tblInventory i ON RTRIM(LTRIM(d.InventoryCode)) = RTRIM(LTRIM(i.InventoryCode))
      WHERE d.HoldNo = @hNo
      ORDER BY d.InventoryCode
    `);

    const header = hRes.recordset[0];
    const details = dRes.recordset;

    // 2. Prepare items for POS cart & tblTempSales
    const cartItems = details.map((d, idx) => ({
      id: String(Date.now() + idx),
      code: d.InventoryCode.trim(),
      description: d.Description.trim(),
      qty: Number(d.Qty),
      price: Number(d.Price),
      disc: Number(d.Discount || 0),
      amount: Number(d.NetAmount || d.SubTotal),
      gst: Number(d.Gst || 0),
      uom: d.UOM || 'PCS',
    }));

    // 3. Clear existing tblTempSales for this terminal before populating released bill
    if (termCode) {
      const clearReq = new sql.Request(transaction);
      clearReq.input('term', sql.VarChar(20), termCode);
      await clearReq.query(`DELETE FROM tblTempSales WHERE RTRIM(LTRIM(TerminalCode)) = @term`);

      // Populate tblTempSales in a single batch insert so persistence works instantly without round-trip latency
      if (cartItems.length > 0) {
        const insTemp = new sql.Request(transaction);
        insTemp.input('term', sql.VarChar(20), termCode);

        const valueClauses = cartItems.map((it, i) => {
          insTemp.input(`code_${i}`, sql.VarChar(50), it.code);
          insTemp.input(`desc_${i}`, sql.VarChar(200), it.description);
          insTemp.input(`qty_${i}`, sql.Decimal(18, 2), it.qty);
          insTemp.input(`price_${i}`, sql.Decimal(18, 2), it.price);
          insTemp.input(`charge_${i}`, sql.Decimal(18, 4), it.price);
          insTemp.input(`disc_${i}`, sql.Decimal(18, 2), it.disc);
          insTemp.input(`netDisc_${i}`, sql.Decimal(18, 2), it.disc);
          insTemp.input(`amt_${i}`, sql.Decimal(18, 2), it.amount);
          insTemp.input(`promoName_${i}`, sql.VarChar(100), it.code);

          return `(
            @term, @code_${i}, @desc_${i}, @qty_${i}, '', '', '',
            0, @price_${i}, @charge_${i}, @disc_${i}, @netDisc_${i}, 0, 0, @amt_${i},
            '', '', @promoName_${i}, 0, '0', ''
          )`;
        }).join(',\n');

        await insTemp.query(`
          INSERT INTO tblTempSales (
            TerminalCode, InventoryCode, Description, Qty, Department, Brand, Category,
            AverageCost, Price, Charge, Discount, NetDiscount, GstPrec, GST, Amount,
            DiscountPriceCode, Salesman, PromoName, MemDiscount, ItemType, MemName
          ) VALUES ${valueClauses}
        `);
      }
    }

    // 4. Delete Hold records via sp_POS_DeleteHoldSales
    const delReq = new sql.Request(transaction);
    delReq.input('HoldNo', sql.Decimal(18, 0), holdNo);
    await delReq.execute('sp_POS_DeleteHoldSales');

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: `Hold #${holdNo} released successfully`,
      header,
      items: cartItems,
    });
  } catch (err) {
    await transaction.rollback();
    console.error('❌ [HOLD RELEASE ERROR]:', err.message);
    return res.status(500).json({ success: false, message: 'Release failed: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// DELETE /api/hold/:holdNo
// Deletes a specific hold record (Discard Hold)
// ------------------------------------------------------------------------------
router.delete('/:holdNo', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const holdNo = Number(req.params.holdNo);
    if (isNaN(holdNo)) {
      return res.status(400).json({ success: false, message: 'Invalid holdNo' });
    }

    const delReq = pool.request();
    delReq.input('HoldNo', sql.Decimal(18, 0), holdNo);
    await delReq.execute('sp_POS_DeleteHoldSales');

    return res.status(200).json({ success: true, message: `Hold #${holdNo} deleted successfully` });
  } catch (err) {
    console.error('❌ [HOLD DELETE ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

