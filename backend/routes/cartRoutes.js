// ==============================================================================
// Project: Supermarket Retail POS
// Module: Temporary Sales Cart (tblTempSales)
// File: routes/cartRoutes.js
// Description: Manages uncommitted live cart sessions isolated dynamically by TerminalCode.
//              Provides zero data loss on refresh, hold, or reconnect.
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
        RTRIM(LTRIM(ISNULL(UOM, 'PCS'))) AS UOM
      FROM tblInventory
      WHERE RTRIM(LTRIM(InventoryCode)) = @code
    `);

    const inv = itemRes.recordset[0] || {
      InventoryCode: invCode,
      Description: 'Custom Item ' + invCode,
      SellingPrice: 0,
      Department: '',
      Brand: '',
      Category: '',
      AverageCost: 0,
      UOM: 'PCS',
    };

    const unitPrice = overridePrice !== undefined && overridePrice !== null 
      ? Number(overridePrice) 
      : Number(inv.SellingPrice);

    // 2. Check if item is already in tblTempSales for this terminal
    const checkReq = pool.request();
    checkReq.input('term', sql.VarChar(20), termCode);
    checkReq.input('code', sql.VarChar(50), invCode);
    const existing = await checkReq.query(`
      SELECT TOP 1 TempID, Qty, Price, Discount, Amount
      FROM tblTempSales
      WHERE RTRIM(LTRIM(TerminalCode)) = @term AND RTRIM(LTRIM(InventoryCode)) = @code
      ORDER BY TempID DESC
    `);

    if (existing.recordset.length > 0) {
      // Update existing line
      const row = existing.recordset[0];
      const newQty = Number(row.Qty) + qtyNum;
      const newDisc = Number(row.Discount) + discNum;
      const newAmount = parseFloat((newQty * unitPrice - newDisc).toFixed(2));

      const updateReq = pool.request();
      updateReq.input('tempId', sql.Int, row.TempID);
      updateReq.input('qty', sql.Decimal(18, 2), newQty);
      updateReq.input('price', sql.Decimal(18, 2), unitPrice);
      updateReq.input('charge', sql.Decimal(18, 4), unitPrice);
      updateReq.input('disc', sql.Decimal(18, 2), newDisc);
      updateReq.input('amt', sql.Decimal(18, 2), newAmount);

      await updateReq.query(`
        UPDATE tblTempSales
        SET Qty = @qty,
            Price = @price,
            Charge = @charge,
            Discount = @disc,
            Amount = @amt
        WHERE TempID = @tempId
      `);

      return res.status(200).json({
        success: true,
        action: 'updated',
        tempId: row.TempID,
      });
    } else {
      // Insert new line
      const newAmount = parseFloat((qtyNum * unitPrice - discNum).toFixed(2));
      const insertReq = pool.request();
      insertReq.input('term', sql.VarChar(20), termCode);
      insertReq.input('code', sql.VarChar(50), invCode);
      insertReq.input('desc', sql.VarChar(200), inv.Description);
      insertReq.input('qty', sql.Decimal(18, 2), qtyNum);
      insertReq.input('dept', sql.VarChar(50), inv.Department);
      insertReq.input('brand', sql.VarChar(50), inv.Brand);
      insertReq.input('cat', sql.VarChar(50), inv.Category);
      insertReq.input('cost', sql.Decimal(18, 2), inv.AverageCost);
      insertReq.input('price', sql.Decimal(18, 2), unitPrice);
      insertReq.input('charge', sql.Decimal(18, 4), unitPrice);
      insertReq.input('disc', sql.Decimal(18, 2), discNum);
      insertReq.input('netDisc', sql.Decimal(18, 2), discNum);
      insertReq.input('amt', sql.Decimal(18, 2), newAmount);
      insertReq.input('promoName', sql.VarChar(100), effectivePromoName);

      const insRes = await insertReq.query(`
        INSERT INTO tblTempSales (
          TerminalCode, InventoryCode, Description, Qty, Department, Brand, Category,
          AverageCost, Price, Charge, Discount, NetDiscount, GstPrec, GST, Amount,
          DiscountPriceCode, Salesman, PromoName, MemDiscount, ItemType, MemName
        ) 
        OUTPUT INSERTED.TempID
        VALUES (
          @term, @code, @desc, @qty, @dept, @brand, @cat,
          @cost, @price, @charge, @disc, @netDisc, 0, 0, @amt,
          '', '', @promoName, 0, '0', ''
        )
      `);

      return res.status(200).json({
        success: true,
        action: 'inserted',
        tempId: insRes.recordset[0]?.TempID,
      });
    }
  } catch (error) {
    console.error('❌ [CART ERROR] Failed to add item to tblTempSales:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to add item: ' + error.message,
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
// Deletes a single item by InventoryCode & TerminalCode
// ------------------------------------------------------------------------------
router.delete('/temp-sales/item', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'DB unreachable' });

    const { terminalCode, inventoryCode } = req.body;
    const termCode = getCleanTerminalCode(terminalCode);
    if (!termCode) return res.status(400).json({ success: false, message: 'terminalCode is required' });

    const invCode = String(inventoryCode || '').trim();

    const request = pool.request();
    request.input('term', sql.VarChar(20), termCode);
    request.input('code', sql.VarChar(50), invCode);

    await request.query(`
      DELETE FROM tblTempSales
      WHERE RTRIM(LTRIM(TerminalCode)) = @term AND RTRIM(LTRIM(InventoryCode)) = @code
    `);

    return res.status(200).json({ success: true, message: 'Item deleted' });
  } catch (error) {
    console.error('❌ [CART ERROR] Failed to delete item:', error.message);
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
      DELETE FROM tblTempSales
      WHERE RTRIM(LTRIM(TerminalCode)) = @term
    `);

    return res.status(200).json({ success: true, message: 'Cart cleared for terminal ' + terminalCode });
  } catch (error) {
    console.error('❌ [CART ERROR] Failed to clear cart:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

