// ==============================================================================
// Project: Supermarket Retail POS
// Module: Temporary Sales Cart (tblTempSales)
// File: routes/cartRoutes.js
// Description: Manages uncommitted live cart sessions isolated dynamically by TerminalCode.
//              Provides zero data loss on refresh, hold, or reconnect.
//              Also manages the exact VB.NET Delete Item workflow (subVoidItem):
//              - Disallows deletion of BCRS DEPOSIT
//              - Saves deleted item details into tblPosSalesDetailCLEAR via sp_SalesDetailClear
//              - Deletes the item from tblTempSales
//              - Deletes the item from tblDisplaySales (Dual Display)
//              - Recalculates and refreshes tblTempSalesSummary
//              - Executed inside a single ACID SQL Transaction
// ==============================================================================

const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../config/db');

// Helper to normalize terminal code passed from the client session
const getCleanTerminalCode = (code) => {
  if (!code || typeof code !== 'string') return '';
  return code.trim();
};

// ------------------------------------------------------------------------------
// GET /api/cart/temp-sales
// Fetches active cart for a specific terminal from tblTempSales
// ------------------------------------------------------------------------------
router.get('/temp-sales', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) {
      return res.status(503).json({
        success: false,
        message: 'Database is currently unreachable.',
      });
    }

    const terminalCode = getCleanTerminalCode(req.query.terminalCode);
    if (!terminalCode) {
      return res.status(400).json({ success: false, message: 'terminalCode query parameter is required' });
    }

    const request = pool.request();
    request.input('terminalCode', sql.VarChar(20), terminalCode);

    const result = await request.query(`
      SELECT 
        ts.TempID,
        RTRIM(LTRIM(ts.TerminalCode)) AS TerminalCode,
        RTRIM(LTRIM(ts.InventoryCode)) AS InventoryCode,
        RTRIM(LTRIM(ISNULL(ts.Description, inv.Description))) AS Description,
        ISNULL(ts.Qty, 1) AS Qty,
        ISNULL(ts.Price, ISNULL(inv.SellingPrice, 0)) AS Price,
        ISNULL(ts.Discount, 0) AS Discount,
        ISNULL(ts.NetDiscount, 0) AS NetDiscount,
        ISNULL(ts.Amount, 0) AS Amount,
        ISNULL(ts.GstPrec, 0) AS GstPrec,
        ISNULL(ts.GST, 0) AS GST,
        RTRIM(LTRIM(ISNULL(inv.UOM, 'PCS'))) AS UOM
      FROM tblTempSales ts
      LEFT JOIN tblInventory inv ON RTRIM(LTRIM(ts.InventoryCode)) = RTRIM(LTRIM(inv.InventoryCode))
      WHERE RTRIM(LTRIM(ts.TerminalCode)) = @terminalCode
      ORDER BY ts.TempID ASC
    `);

    // Convert to front-end compatible cart item objects
    const cartItems = result.recordset.map((row) => ({
      id: String(row.TempID),
      code: row.InventoryCode,
      description: row.Description,
      qty: Number(row.Qty),
      price: Number(row.Price),
      disc: Number(row.Discount),
      amount: Number(row.Amount),
      gst: Number(row.GST),
      uom: row.UOM || 'PCS',
    }));

    return res.status(200).json({
      success: true,
      terminalCode,
      count: cartItems.length,
      items: cartItems,
    });
  } catch (error) {
    console.error('❌ [CART ERROR] Failed to fetch tblTempSales:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch cart: ' + error.message,
    });
  }
});

// ------------------------------------------------------------------------------
// POST /api/cart/temp-sales/add
// Adds an item to tblTempSales or increments quantity if it exists
// ------------------------------------------------------------------------------
router.post('/temp-sales/add', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) {
      return res.status(503).json({
        success: false,
        message: 'Database is currently unreachable.',
      });
    }

    const {
      terminalCode,
      inventoryCode,
      qty = 1,
      disc = 0,
      overridePrice,
      promoName,
    } = req.body;

    const termCode = getCleanTerminalCode(terminalCode);
    if (!termCode) {
      return res.status(400).json({ success: false, message: 'terminalCode is required' });
    }
    if (!inventoryCode) {
      return res.status(400).json({ success: false, message: 'inventoryCode is required' });
    }

    const invCode = String(inventoryCode).trim();
    const qtyNum = Number(qty) || 1;
    const discNum = Number(disc) || 0;
    // In VB.NET POS: cPromoName holds the scanned barcode / inventory code
    const effectivePromoName = String(promoName || invCode).trim();

    // 1. Fetch item master info from tblInventory
    const itemReq = pool.request();
    itemReq.input('code', sql.VarChar(50), invCode);
    const itemRes = await itemReq.query(`
      SELECT 
        RTRIM(LTRIM(InventoryCode)) AS InventoryCode,
        RTRIM(LTRIM(Description)) AS Description,
        ISNULL(SellingPrice, 0) AS SellingPrice,
        RTRIM(LTRIM(ISNULL(DepartmentCode, ''))) AS Department,
        RTRIM(LTRIM(ISNULL(BrandCode, ''))) AS Brand,
        RTRIM(LTRIM(ISNULL(CategoryCode, ''))) AS Category,
        ISNULL(AverageCost, 0) AS AverageCost,
        ISNULL(OutputTax, 0) AS TaxPerc
      FROM tblInventory
      WHERE RTRIM(LTRIM(InventoryCode)) = @code
    `);

    if (itemRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: `Item [${invCode}] not found in inventory` });
    }

    const item = itemRes.recordset[0];
    const unitPrice = overridePrice !== undefined ? Number(overridePrice) : Number(item.SellingPrice);

    // 2. Check if this exact item is already in tblTempSales for this terminal
    const checkReq = pool.request();
    checkReq.input('term', sql.VarChar(20), termCode);
    checkReq.input('code', sql.VarChar(50), invCode);
    const existing = await checkReq.query(`
      SELECT TOP 1 TempID, Qty, Discount, Price, NetDiscount
      FROM tblTempSales
      WHERE RTRIM(LTRIM(TerminalCode)) = @term AND RTRIM(LTRIM(InventoryCode)) = @code
      ORDER BY TempID DESC
    `);

    if (existing.recordset.length > 0) {
      // Increment quantity
      const existingRow = existing.recordset[0];
      const newQty = Number(existingRow.Qty) + qtyNum;
      const effectivePrice = Number(existingRow.Price) || unitPrice;
      const totalDisc = Number(existingRow.Discount) + discNum;
      const lineTotal = parseFloat((newQty * effectivePrice - totalDisc).toFixed(2));

      const gstPerc = Number(item.TaxPerc || 0);
      const gstAmount = parseFloat(((lineTotal * gstPerc) / (100 + gstPerc)).toFixed(2));

      const updateReq = pool.request();
      updateReq.input('tempId', sql.Int, existingRow.TempID);
      updateReq.input('qty', sql.Decimal(18, 2), newQty);
      updateReq.input('disc', sql.Decimal(18, 2), totalDisc);
      updateReq.input('netDisc', sql.Decimal(18, 2), totalDisc);
      updateReq.input('amount', sql.Decimal(18, 2), lineTotal);
      updateReq.input('gst', sql.Decimal(18, 2), gstAmount);
      updateReq.input('gstPrec', sql.Decimal(18, 2), gstPerc);
      updateReq.input('promoName', sql.VarChar(100), effectivePromoName);

      await updateReq.query(`
        UPDATE tblTempSales
        SET Qty = @qty,
            Discount = @disc,
            NetDiscount = @netDisc,
            Amount = @amount,
            GST = @gst,
            GstPrec = @gstPrec,
            PromoName = @promoName
        WHERE TempID = @tempId
      `);

      return res.status(200).json({
        success: true,
        action: 'incremented',
        tempId: existingRow.TempID,
        qty: newQty,
        amount: lineTotal,
      });
    } else {
      // Insert new line item
      const lineTotal = parseFloat((qtyNum * unitPrice - discNum).toFixed(2));
      const gstPerc = Number(item.TaxPerc || 0);
      const gstAmount = parseFloat(((lineTotal * gstPerc) / (100 + gstPerc)).toFixed(2));

      const insertReq = pool.request();
      insertReq.input('term', sql.VarChar(20), termCode);
      insertReq.input('code', sql.VarChar(50), invCode);
      insertReq.input('desc', sql.VarChar(200), item.Description);
      insertReq.input('qty', sql.Decimal(18, 2), qtyNum);
      insertReq.input('dept', sql.VarChar(50), item.Department);
      insertReq.input('brand', sql.VarChar(50), item.Brand);
      insertReq.input('cat', sql.VarChar(50), item.Category);
      insertReq.input('avgCost', sql.Decimal(18, 2), Number(item.AverageCost || 0));
      insertReq.input('price', sql.Decimal(18, 2), unitPrice);
      insertReq.input('charge', sql.Decimal(18, 4), 0);
      insertReq.input('disc', sql.Decimal(18, 2), discNum);
      insertReq.input('netDisc', sql.Decimal(18, 2), discNum);
      insertReq.input('gstPrec', sql.Decimal(18, 2), gstPerc);
      insertReq.input('gst', sql.Decimal(18, 2), gstAmount);
      insertReq.input('amount', sql.Decimal(18, 2), lineTotal);
      insertReq.input('salesman', sql.VarChar(20), 'UPS');
      insertReq.input('promoName', sql.VarChar(100), effectivePromoName);
      insertReq.input('memDisc', sql.Decimal(18, 2), 0);
      insertReq.input('itemType', sql.VarChar(50), 'NORMAL');
      insertReq.input('memName', sql.VarChar(100), '');

      const insertResult = await insertReq.query(`
        INSERT INTO tblTempSales (
          TerminalCode, InventoryCode, Description, Qty, Department, Brand, Category,
          AverageCost, Price, Charge, Discount, NetDiscount, GstPrec, GST, Amount,
          Salesman, PromoName, MemDiscount, ItemType, MemName
        )
        OUTPUT INSERTED.TempID
        VALUES (
          @term, @code, @desc, @qty, @dept, @brand, @cat,
          @avgCost, @price, @charge, @disc, @netDisc, @gstPrec, @gst, @amount,
          @salesman, @promoName, @memDisc, @itemType, @memName
        )
      `);

      const newTempId = insertResult.recordset[0]?.TempID;
      return res.status(201).json({
        success: true,
        action: 'inserted',
        tempId: newTempId,
        qty: qtyNum,
        amount: lineTotal,
      });
    }
  } catch (error) {
    console.error('❌ [CART ERROR] Failed to add to tblTempSales:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to add item to cart: ' + error.message,
    });
  }
});

// ------------------------------------------------------------------------------
// POST /api/cart/temp-sales/update-qty
// Updates quantity (+1 / -1 / specific) for an item by code or TempID
// ------------------------------------------------------------------------------
router.post('/temp-sales/update-qty', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'DB unreachable' });

    const { terminalCode, inventoryCode, delta, exactQty } = req.body;
    const termCode = getCleanTerminalCode(terminalCode);
    if (!termCode) return res.status(400).json({ success: false, message: 'terminalCode is required' });

    const invCode = String(inventoryCode || '').trim();

    const request = pool.request();
    request.input('term', sql.VarChar(20), termCode);
    request.input('code', sql.VarChar(50), invCode);

    const existing = await request.query(`
      SELECT TOP 1 TempID, Qty, Price, Discount, Amount
      FROM tblTempSales
      WHERE RTRIM(LTRIM(TerminalCode)) = @term AND RTRIM(LTRIM(InventoryCode)) = @code
      ORDER BY TempID DESC
    `);

    if (existing.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Item not in cart' });
    }

    const row = existing.recordset[0];
    let nextQty = exactQty !== undefined ? Number(exactQty) : Number(row.Qty) + Number(delta || 0);

    if (nextQty <= 0) {
      // Remove item if qty drops to 0 or less
      const delReq = pool.request();
      delReq.input('tempId', sql.Int, row.TempID);
      await delReq.query(`DELETE FROM tblTempSales WHERE TempID = @tempId`);
      return res.status(200).json({ success: true, action: 'deleted' });
    }

    const newAmount = parseFloat((nextQty * Number(row.Price) - Number(row.Discount)).toFixed(2));
    const upReq = pool.request();
    upReq.input('tempId', sql.Int, row.TempID);
    upReq.input('qty', sql.Decimal(18, 2), nextQty);
    upReq.input('amt', sql.Decimal(18, 2), newAmount);

    await upReq.query(`
      UPDATE tblTempSales
      SET Qty = @qty,
          Amount = @amt
      WHERE TempID = @tempId
    `);

    return res.status(200).json({ success: true, action: 'updated', qty: nextQty, amount: newAmount });
  } catch (error) {
    console.error('❌ [CART ERROR] Failed to update qty in tblTempSales:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ------------------------------------------------------------------------------
// DELETE /api/cart/temp-sales/item
// Exact VB.NET POS subVoidItem() execution:
// 1. Validates selected item (BCRS DEPOSIT check)
// 2. Executes sp_SalesDetailClear to archive deleted item in tblPosSalesDetailCLEAR
// 3. Deletes item from tblTempSales
// 4. Deletes item from tblDisplaySales (Dual Display)
// 5. Recalculates and refreshes tblTempSalesSummary
// 6. Commits inside single ACID SQL transaction
// ------------------------------------------------------------------------------
router.delete('/temp-sales/item', async (req, res) => {
  const pool = await getPool();
  if (!pool) return res.status(503).json({ success: false, message: 'DB unreachable' });

  const { terminalCode, inventoryCode, cashierId } = req.body;
  const termCode = getCleanTerminalCode(terminalCode);
  if (!termCode) return res.status(400).json({ success: false, message: 'terminalCode is required' });

  const invCode = String(inventoryCode || '').trim();
  if (!invCode) return res.status(400).json({ success: false, message: 'inventoryCode is required' });

  const cId = (cashierId || 'UPS').trim();

  // Rule 1: BCRS DEPOSIT validation
  if (invCode.toUpperCase() === 'BCRS DEPOSIT' || invCode.toUpperCase().includes('BCRS')) {
    return res.status(400).json({
      success: false,
      message: 'Deletion of BCRS DEPOSIT is not allowed.',
    });
  }

  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // 1. Fetch item from tblTempSales to get exact quantity, price, and amounts
    const fetchReq = new sql.Request(transaction);
    fetchReq.input('term', sql.VarChar(20), termCode);
    fetchReq.input('code', sql.VarChar(50), invCode);
    const itemRes = await fetchReq.query(`
      SELECT TOP 1 *
      FROM tblTempSales
      WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@term) 
        AND UPPER(RTRIM(LTRIM(InventoryCode))) = UPPER(@code)
    `);

    // If item was added only in frontend state (or table had slight trim difference),
    // still allow removing from display and updating summary
    let item = itemRes.recordset[0];
    let qtyNum = Number(item?.Qty || 1);
    let priceNum = Number(item?.Price || 0);
    let discNum = Number(item?.Discount || 0);
    let netDiscNum = Number(item?.NetDiscount || 0);
    let lineTotal = parseFloat((qtyNum * priceNum).toFixed(2));
    let lineNet = parseFloat((lineTotal - discNum).toFixed(2));
    let gstNum = Number(item?.GST || 0);
    let salesmanId = (item?.Salesman || '').trim();

    // 2. Fetch LocationCode and Item Master Info
    const locReq = new sql.Request(transaction);
    const locRes = await locReq.query(`
      SELECT TOP 1 ISNULL(LocationCode, 'HQ') AS LocationCode FROM tblMaCompany
    `);
    const locCode = (locRes.recordset[0]?.LocationCode || 'HQ').trim();

    const invInfoReq = new sql.Request(transaction);
    invInfoReq.input('code', sql.VarChar(50), invCode);
    const invInfoRes = await invInfoReq.query(`
      SELECT 
        ISNULL(Description, '') AS Description,
        ISNULL(SellingPrice, 0) AS SellingPrice,
        ISNULL(DepartmentCode, '') AS DeptCode,
        ISNULL(CategoryCode, '') AS CategoryCode,
        ISNULL(BrandCode, '') AS BrandCode,
        ISNULL(AverageCost, 0) AS AverageCost
      FROM tblInventory
      WHERE UPPER(RTRIM(LTRIM(InventoryCode))) = UPPER(@code)
    `);

    const invInfo = invInfoRes.recordset[0];
    const description = String(item?.Description || invInfo?.Description || invCode).trim();
    if (priceNum === 0 && invInfo?.SellingPrice) {
      priceNum = Number(invInfo.SellingPrice);
      lineTotal = parseFloat((qtyNum * priceNum).toFixed(2));
      lineNet = lineTotal;
    }

    const deptCode = (invInfo?.DeptCode || item?.Department || '').trim();
    const catCode = (invInfo?.CategoryCode || item?.Category || '').trim();
    const brandCode = (invInfo?.BrandCode || item?.Brand || '').trim();

    // 3. Save deleted item history via sp_SalesDetailClear
    // When deleting a single item, InvoiceNo is recorded as 'DELETE'
    const spReq = new sql.Request(transaction);
    spReq.input('InvoiceNo', sql.Char(15), 'DELETE');
    spReq.input('InventoryCode', sql.Char(20), invCode.slice(0, 20));
    spReq.input('Description', sql.Char(50), description.slice(0, 50));
    spReq.input('Qty', sql.Decimal(18, 2), qtyNum);
    spReq.input('Price', sql.Decimal(18, 2), priceNum);
    spReq.input('TotalValue', sql.Decimal(18, 2), lineTotal);
    spReq.input('Discount', sql.Decimal(18, 2), discNum);
    spReq.input('NetDiscount', sql.Decimal(18, 2), netDiscNum);
    spReq.input('NetAmount', sql.Decimal(18, 2), lineNet);
    spReq.input('ActualSales', sql.Decimal(18, 2), lineNet);
    spReq.input('Gst', sql.Decimal(18, 4), gstNum);
    spReq.input('SalesmanId', sql.Char(10), salesmanId.slice(0, 10));
    spReq.input('DeptCode', sql.Char(10), deptCode.slice(0, 10));
    spReq.input('CategoryCode', sql.Char(10), catCode.slice(0, 10));
    spReq.input('BrandCode', sql.Char(10), brandCode.slice(0, 10));
    spReq.input('UserID', sql.Char(10), cId.slice(0, 10));
    spReq.input('LocationCode', sql.Char(10), locCode.slice(0, 10));
    spReq.input('MemberDiscount', sql.Decimal(18, 2), Number(item?.MemDiscount || 0));
    spReq.input('GSTType', sql.Char(10), 'Z');

    await spReq.execute('sp_SalesDetailClear');

    // 4. Delete the item from tblTempSales
    const delTempReq = new sql.Request(transaction);
    delTempReq.input('term', sql.VarChar(20), termCode);
    delTempReq.input('code', sql.VarChar(50), invCode);
    await delTempReq.query(`
      DELETE FROM tblTempSales
      WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@term) 
        AND UPPER(RTRIM(LTRIM(InventoryCode))) = UPPER(@code)
    `);

    // 5. Delete corresponding item from tblDisplaySales (Dual Display)
    const delDispReq = new sql.Request(transaction);
    delDispReq.input('term', sql.VarChar(20), termCode);
    delDispReq.input('code', sql.VarChar(50), invCode);
    await delDispReq.query(`
      DELETE FROM tblDisplaySales
      WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@term) 
        AND UPPER(RTRIM(LTRIM(InventoryCode))) = UPPER(@code)
    `);

    // 6. Recalculate and refresh tblTempSalesSummary for this terminal
    const sumReq = new sql.Request(transaction);
    sumReq.input('term', sql.VarChar(20), termCode);
    const sumRes = await sumReq.query(`
      SELECT 
        COUNT(*) AS TotalItems,
        ISNULL(SUM(Qty), 0) AS TotalQty,
        ISNULL(SUM(Qty * Price), 0) AS SubTotal,
        ISNULL(SUM(Discount), 0) AS Discount,
        ISNULL(SUM(GST), 0) AS Tax,
        ISNULL(SUM(Amount), 0) AS NetTotal
      FROM tblTempSales
      WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@term)
    `);

    const summary = sumRes.recordset[0] || {
      TotalItems: 0,
      TotalQty: 0,
      SubTotal: 0,
      Discount: 0,
      Tax: 0,
      NetTotal: 0,
    };

    // Remove existing summary row and insert refreshed calculations
    const refreshSumReq = new sql.Request(transaction);
    refreshSumReq.input('term', sql.VarChar(20), termCode);
    refreshSumReq.input('totalItems', sql.Int, summary.TotalItems);
    refreshSumReq.input('totalQty', sql.Decimal(18, 2), summary.TotalQty);
    refreshSumReq.input('subTotal', sql.Decimal(18, 2), summary.SubTotal);
    refreshSumReq.input('disc', sql.Decimal(18, 2), summary.Discount);
    refreshSumReq.input('tax', sql.Decimal(18, 2), summary.Tax);
    refreshSumReq.input('netTotal', sql.Decimal(18, 2), summary.NetTotal);

    await refreshSumReq.query(`
      DELETE FROM tblTempSalesSummary WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@term);
      IF (@totalItems > 0)
      BEGIN
        INSERT INTO tblTempSalesSummary (
          TerminalCode, TotalItems, TotalQty, SubTotal, Discount, Tax, RoundOff, Deposit, NetTotal
        ) VALUES (
          @term, @totalItems, @totalQty, @subTotal, @disc, @tax, 0, 0, @netTotal
        );
      END
    `);

    // 7. Commit SQL Transaction
    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: `Item [${invCode}] deleted successfully`,
      remainingItems: summary.TotalItems,
      summary,
    });
  } catch (error) {
    await transaction.rollback();
    console.error('❌ [CART DELETE ERROR]:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ------------------------------------------------------------------------------
// DELETE /api/cart/temp-sales/clear
// Clears all items for a specific TerminalCode (Used by Clear, Hold, Settlement)
// ------------------------------------------------------------------------------
router.delete('/temp-sales/clear', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'DB unreachable' });

    const terminalCode = getCleanTerminalCode(req.body.terminalCode || req.query.terminalCode);
    if (!terminalCode) return res.status(400).json({ success: false, message: 'terminalCode is required' });

    const request = pool.request();
    request.input('term', sql.VarChar(20), terminalCode);

    await request.query(`
      DELETE FROM tblTempSales WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@term);
      DELETE FROM tblDisplaySales WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@term);
      DELETE FROM tblTempSalesSummary WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@term);
    `);

    return res.status(200).json({ success: true, message: 'Cart cleared for terminal ' + terminalCode });
  } catch (error) {
    console.error('❌ [CART ERROR] Failed to clear cart:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
