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
const { resolveSalesmanValue } = require('../services/salesmanService');

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
        RTRIM(LTRIM(ISNULL(ts.Salesman, ''))) AS Salesman,
        RTRIM(LTRIM(ISNULL(inv.UOM, 'PCS'))) AS UOM,
        RTRIM(LTRIM(ISNULL(ts.DiscountPriceCode, ''))) AS DiscountPriceCode,
        RTRIM(LTRIM(ISNULL(ts.PromoName, ''))) AS PromoName
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
      salesman: row.Salesman || '',
      uom: row.UOM || 'PCS',
      discountPriceCode: row.DiscountPriceCode || '',
      promoName: row.PromoName || '',
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
      salesman,
      description,
      uom,
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
        ISNULL(OutputTax, 0) AS TaxPerc,
        ISNULL(SalesmanRequired, 0) AS SalesmanRequired
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
      
      const updateSalesman = (salesman && String(salesman).trim()) || '';
      updateReq.input('salesman', sql.VarChar(20), updateSalesman);

      await updateReq.query(`
        UPDATE tblTempSales
        SET Qty = @qty,
            Discount = @disc,
            NetDiscount = @netDisc,
            Amount = @amount,
            GST = @gst,
            GstPrec = @gstPrec,
            PromoName = @promoName,
            Salesman = CASE WHEN @salesman <> '' THEN @salesman ELSE Salesman END
        WHERE TempID = @tempId
      `);

      // Recalculate promotions for the entire cart in this terminal
      const { recalculateCartPromotions } = require('../services/promotionService');
      const allRowsReq = pool.request();
      allRowsReq.input('term', sql.VarChar(20), termCode);
      const allRowsRes = await allRowsReq.query(`
        SELECT 
          ts.TempID, RTRIM(LTRIM(ts.TerminalCode)) AS TerminalCode, RTRIM(LTRIM(ts.InventoryCode)) AS InventoryCode,
          RTRIM(LTRIM(ISNULL(ts.Description, inv.Description))) AS Description, ISNULL(ts.Qty, 1) AS Qty,
          ISNULL(ts.Price, ISNULL(inv.SellingPrice, 0)) AS Price, ISNULL(ts.Price, ISNULL(inv.SellingPrice, 0)) AS NormalPrice,
          ISNULL(ts.Discount, 0) AS Discount, ISNULL(ts.NetDiscount, 0) AS NetDiscount, ISNULL(ts.Amount, 0) AS Amount,
          ISNULL(ts.GstPrec, 0) AS GstPrec, ISNULL(ts.GST, 0) AS GST, RTRIM(LTRIM(ISNULL(ts.Salesman, ''))) AS Salesman,
          RTRIM(LTRIM(ISNULL(inv.UOM, 'PCS'))) AS UOM
        FROM tblTempSales ts
        LEFT JOIN tblInventory inv ON RTRIM(LTRIM(ts.InventoryCode)) = RTRIM(LTRIM(inv.InventoryCode))
        WHERE RTRIM(LTRIM(ts.TerminalCode)) = @term
        ORDER BY ts.TempID ASC
      `);

      const rawItems = allRowsRes.recordset.map((r) => ({
        id: String(r.TempID), code: r.InventoryCode, description: r.Description, qty: Number(r.Qty),
        price: Number(r.Price), normalPrice: Number(r.NormalPrice || r.Price), disc: Number(r.Discount),
        amount: Number(r.Amount), gst: Number(r.GST), gstPrec: Number(r.GstPrec), salesman: r.Salesman || '', uom: r.UOM || 'PCS',
      }));

      const recalculated = await recalculateCartPromotions(pool, rawItems, 'HQ');
      const { batchUpdateTempSalesPromotions } = require('../services/promotionService');
      await batchUpdateTempSalesPromotions(pool, recalculated);

      return res.status(200).json({
        success: true,
        action: 'incremented',
        tempId: existingRow.TempID,
        qty: newQty,
        amount: lineTotal,
        cartItems: recalculated,
      });
    } else {
      // Insert new line item
      const lineTotal = parseFloat((qtyNum * unitPrice - discNum).toFixed(2));
      const gstPerc = Number(item.TaxPerc || 0);
      const gstAmount = parseFloat(((lineTotal * gstPerc) / (100 + gstPerc)).toFixed(2));

      const insertReq = pool.request();
      const lineDesc = (description && String(description).trim()) || item.Description;

      let effectiveSalesman = (salesman && String(salesman).trim()) || '';
      if (!effectiveSalesman) {
        // Determine Salesman column value based on:
        // 1. tblMaParamMaster where Value = 1
        // 2. tblMaUserMaster where IsSalesMan = 1
        // 3. tblInventory where SalesmanRequired = 1
        // 4. tblInvDepartment where SalesmanRequired = 1
        // If SalesmanRequired = 1: User Name
        // If SalesmanRequired = 0: Location Name
        const salesmanResolution = await resolveSalesmanValue(pool, {
          inventoryCode: invCode,
          departmentCode: item.Department,
          itemSalesmanRequired: item.SalesmanRequired,
          cashierId: '',
          terminalCode: termCode,
        });
        effectiveSalesman = salesmanResolution.salesman;
      }

      insertReq.input('term', sql.VarChar(20), termCode);
      insertReq.input('code', sql.VarChar(50), invCode);
      insertReq.input('desc', sql.VarChar(200), lineDesc);
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
      insertReq.input('salesman', sql.VarChar(20), effectiveSalesman);
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

      // Recalculate promotions for the entire cart in this terminal
      const { recalculateCartPromotions } = require('../services/promotionService');
      const allRowsReq = pool.request();
      allRowsReq.input('term', sql.VarChar(20), termCode);
      const allRowsRes = await allRowsReq.query(`
        SELECT 
          ts.TempID, RTRIM(LTRIM(ts.TerminalCode)) AS TerminalCode, RTRIM(LTRIM(ts.InventoryCode)) AS InventoryCode,
          RTRIM(LTRIM(ISNULL(ts.Description, inv.Description))) AS Description, ISNULL(ts.Qty, 1) AS Qty,
          ISNULL(ts.Price, ISNULL(inv.SellingPrice, 0)) AS Price, ISNULL(ts.Price, ISNULL(inv.SellingPrice, 0)) AS NormalPrice,
          ISNULL(ts.Discount, 0) AS Discount, ISNULL(ts.NetDiscount, 0) AS NetDiscount, ISNULL(ts.Amount, 0) AS Amount,
          ISNULL(ts.GstPrec, 0) AS GstPrec, ISNULL(ts.GST, 0) AS GST, RTRIM(LTRIM(ISNULL(ts.Salesman, ''))) AS Salesman,
          RTRIM(LTRIM(ISNULL(inv.UOM, 'PCS'))) AS UOM
        FROM tblTempSales ts
        LEFT JOIN tblInventory inv ON RTRIM(LTRIM(ts.InventoryCode)) = RTRIM(LTRIM(inv.InventoryCode))
        WHERE RTRIM(LTRIM(ts.TerminalCode)) = @term
        ORDER BY ts.TempID ASC
      `);

      const rawItems = allRowsRes.recordset.map((r) => ({
        id: String(r.TempID), code: r.InventoryCode, description: r.Description, qty: Number(r.Qty),
        price: Number(r.Price), normalPrice: Number(r.NormalPrice || r.Price), disc: Number(r.Discount),
        amount: Number(r.Amount), gst: Number(r.GST), gstPrec: Number(r.GstPrec), salesman: r.Salesman || '', uom: r.UOM || 'PCS',
      }));

      const recalculated = await recalculateCartPromotions(pool, rawItems, 'HQ');
      const { batchUpdateTempSalesPromotions } = require('../services/promotionService');
      await batchUpdateTempSalesPromotions(pool, recalculated);

      return res.status(201).json({
        success: true,
        action: 'inserted',
        tempId: newTempId,
        qty: qtyNum,
        amount: lineTotal,
        cartItems: recalculated,
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

    const { terminalCode, inventoryCode, delta, exactQty, tempId } = req.body;
    const termCode = getCleanTerminalCode(terminalCode);
    if (!termCode) return res.status(400).json({ success: false, message: 'terminalCode is required' });

    const invCode = String(inventoryCode || '').trim();

    const request = pool.request();
    request.input('term', sql.VarChar(20), termCode);

    let findQuery = `
      SELECT TOP 1 TempID, Qty, Price, Discount, Amount, GstPrec
      FROM tblTempSales
      WHERE RTRIM(LTRIM(TerminalCode)) = @term
    `;

    const parsedTempId = tempId !== undefined && tempId !== null ? parseInt(String(tempId), 10) : NaN;
    const isValidDbTempId = !isNaN(parsedTempId) && parsedTempId > 0 && parsedTempId < 2147483647;

    if (isValidDbTempId) {
      request.input('tempId', sql.Int, parsedTempId);
      findQuery += ` AND TempID = @tempId`;
    } else if (invCode) {
      request.input('code', sql.VarChar(50), invCode);
      findQuery += ` AND RTRIM(LTRIM(InventoryCode)) = @code ORDER BY TempID DESC`;
    } else {
      return res.status(400).json({ success: false, message: 'inventoryCode or tempId is required' });
    }

    const existing = await request.query(findQuery);

    if (existing.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Item not in cart' });
    }

    const row = existing.recordset[0];
    let nextQty = exactQty !== undefined && exactQty !== null
      ? Number(exactQty)
      : Number(row.Qty) + Number(delta || 0);

    if (nextQty <= 0) {
      // Remove item if qty drops to 0 or less
      const delReq = pool.request();
      delReq.input('tempId', sql.Int, row.TempID);
      await delReq.query(`DELETE FROM tblTempSales WHERE TempID = @tempId`);
      return res.status(200).json({ success: true, action: 'deleted', deletedTempId: row.TempID });
    }

    const itemPrice = Number(row.Price) || 0;
    const itemDisc = Number(row.Discount) || 0;
    const itemGstPrec = Number(row.GstPrec) || 0;
    const baseAmount = Math.max(0, parseFloat((nextQty * itemPrice - itemDisc).toFixed(2)));
    const baseGst = itemGstPrec > 0 ? parseFloat(((baseAmount * itemGstPrec) / (100 + itemGstPrec)).toFixed(2)) : 0;

    const upReq = pool.request();
    upReq.input('tempId', sql.Int, row.TempID);
    upReq.input('qty', sql.Decimal(18, 2), nextQty);
    upReq.input('amt', sql.Decimal(18, 2), baseAmount);
    upReq.input('gst', sql.Decimal(18, 2), baseGst);

    await upReq.query(`
      UPDATE tblTempSales
      SET Qty = @qty,
          Amount = @amt,
          GST = @gst
      WHERE TempID = @tempId
    `);

    // Recalculate promotions for entire cart after quantity modification
    const { recalculateCartPromotions } = require('../services/promotionService');
    const allRowsReq = pool.request();
    allRowsReq.input('term', sql.VarChar(20), termCode);
    const allRowsRes = await allRowsReq.query(`
      SELECT 
        ts.TempID, RTRIM(LTRIM(ts.TerminalCode)) AS TerminalCode, RTRIM(LTRIM(ts.InventoryCode)) AS InventoryCode,
        RTRIM(LTRIM(ISNULL(ts.Description, inv.Description))) AS Description, ISNULL(ts.Qty, 1) AS Qty,
        ISNULL(ts.Price, ISNULL(inv.SellingPrice, 0)) AS Price, ISNULL(ts.Price, ISNULL(inv.SellingPrice, 0)) AS NormalPrice,
        ISNULL(ts.Discount, 0) AS Discount, ISNULL(ts.NetDiscount, 0) AS NetDiscount, ISNULL(ts.Amount, 0) AS Amount,
        ISNULL(ts.GstPrec, 0) AS GstPrec, ISNULL(ts.GST, 0) AS GST, RTRIM(LTRIM(ISNULL(ts.Salesman, ''))) AS Salesman,
        RTRIM(LTRIM(ISNULL(inv.UOM, 'PCS'))) AS UOM
      FROM tblTempSales ts
      LEFT JOIN tblInventory inv ON RTRIM(LTRIM(ts.InventoryCode)) = RTRIM(LTRIM(inv.InventoryCode))
      WHERE RTRIM(LTRIM(ts.TerminalCode)) = @term
      ORDER BY ts.TempID ASC
    `);

    const rawItems = allRowsRes.recordset.map((r) => ({
      id: String(r.TempID), code: r.InventoryCode, description: r.Description, qty: Number(r.Qty),
      price: Number(r.Price), normalPrice: Number(r.NormalPrice || r.Price), disc: Number(r.Discount),
      amount: Number(r.Amount), gst: Number(r.GST), gstPrec: Number(r.GstPrec), salesman: r.Salesman || '', uom: r.UOM || 'PCS',
    }));

    const recalculated = await recalculateCartPromotions(pool, rawItems, 'HQ');
    const { batchUpdateTempSalesPromotions } = require('../services/promotionService');
    await batchUpdateTempSalesPromotions(pool, recalculated);

    return res.status(200).json({ success: true, action: 'updated', qty: nextQty, cartItems: recalculated });
  } catch (error) {
    console.error('❌ [CART ERROR] Failed to update qty in tblTempSales:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ------------------------------------------------------------------------------
// ------------------------------------------------------------------------------
// POST /api/cart/temp-sales/update-desc
// Updates description for an item by code or TempID in tblTempSales & tblDisplaySales
// ------------------------------------------------------------------------------

// ------------------------------------------------------------------------------
// POST /api/cart/temp-sales/update-discount
// Updates item discount amount or percentage for an item by code in tblTempSales & tblDisplaySales
// ------------------------------------------------------------------------------
router.post('/temp-sales/update-discount', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'DB unreachable' });

    const { terminalCode, inventoryCode, discountAmount, discountPerc } = req.body;
    const termCode = getCleanTerminalCode(terminalCode);
    if (!termCode) return res.status(400).json({ success: false, message: 'terminalCode is required' });

    const invCode = String(inventoryCode || '').trim();
    if (!invCode) return res.status(400).json({ success: false, message: 'inventoryCode is required' });

    const request = pool.request();
    request.input('term', sql.VarChar(20), termCode);
    request.input('code', sql.VarChar(50), invCode);

    const existing = await request.query(`
      SELECT TOP 1 TempID, Qty, Price, Discount, Amount, GstPrec
      FROM tblTempSales
      WHERE RTRIM(LTRIM(TerminalCode)) = @term AND RTRIM(LTRIM(InventoryCode)) = @code
      ORDER BY TempID DESC
    `);

    if (existing.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Item not in cart' });
    }

    const row = existing.recordset[0];
    const qty = Number(row.Qty) || 1;
    const price = Number(row.Price) || 0;
    const grossTotal = qty * price;

    let finalDisc = 0;
    if (discountPerc !== undefined && discountPerc !== null && discountPerc !== '') {
      const perc = Number(discountPerc) || 0;
      finalDisc = parseFloat(((grossTotal * perc) / 100).toFixed(2));
    } else if (discountAmount !== undefined && discountAmount !== null && discountAmount !== '') {
      finalDisc = parseFloat(Number(discountAmount).toFixed(2)) || 0;
    }

    if (finalDisc > grossTotal) {
      finalDisc = grossTotal;
    }

    const newAmount = parseFloat((grossTotal - finalDisc).toFixed(2));
    const gstPerc = Number(row.GstPrec) || 0;
    const gstAmount = parseFloat(((newAmount * gstPerc) / (100 + gstPerc)).toFixed(2));

    const upReq = pool.request();
    upReq.input('tempId', sql.Int, row.TempID);
    upReq.input('disc', sql.Decimal(18, 2), finalDisc);
    upReq.input('amt', sql.Decimal(18, 2), newAmount);
    upReq.input('gst', sql.Decimal(18, 2), gstAmount);

    await upReq.query(`
      UPDATE tblTempSales
      SET Discount = @disc,
          NetDiscount = @disc,
          Amount = @amt,
          GST = @gst
      WHERE TempID = @tempId
    `);

    return res.status(200).json({
      success: true,
      action: 'updated',
      discount: finalDisc,
      amount: newAmount,
    });
  } catch (error) {
    console.error('❌ [CART ERROR] Failed to update discount in tblTempSales:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ------------------------------------------------------------------------------
// POST /api/cart/temp-sales/update-price
// Updates price for an item by code or TempID in tblTempSales & recalculates promotions
// ------------------------------------------------------------------------------
router.post('/temp-sales/update-price', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'DB unreachable' });

    const { terminalCode, inventoryCode, newPrice, tempId } = req.body;
    const termCode = getCleanTerminalCode(terminalCode);
    if (!termCode) return res.status(400).json({ success: false, message: 'terminalCode is required' });

    const priceNum = parseFloat(newPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      return res.status(400).json({ success: false, message: 'Valid newPrice is required' });
    }

    const request = pool.request();
    request.input('term', sql.VarChar(20), termCode);
    request.input('price', sql.Decimal(18, 2), priceNum);

    let targetTempId = null;
    const parsedPriceTempId = tempId !== undefined && tempId !== null ? parseInt(String(tempId), 10) : NaN;
    if (!isNaN(parsedPriceTempId) && parsedPriceTempId > 0 && parsedPriceTempId < 2147483647) {
      targetTempId = parsedPriceTempId;
    }

    if (!targetTempId) {
      const invCode = String(inventoryCode || '').trim();
      if (!invCode) return res.status(400).json({ success: false, message: 'inventoryCode or tempId is required' });
      request.input('code', sql.VarChar(50), invCode);
      const findRes = await request.query(`
        SELECT TOP 1 TempID, Qty, Discount, GstPrec
        FROM tblTempSales
        WHERE RTRIM(LTRIM(TerminalCode)) = @term AND RTRIM(LTRIM(InventoryCode)) = @code
        ORDER BY TempID DESC
      `);
      if (findRes.recordset.length === 0) {
        return res.status(404).json({ success: false, message: 'Item not in cart' });
      }
      targetTempId = findRes.recordset[0].TempID;
    }

    // Update item price & amount in tblTempSales
    const upReq = pool.request();
    upReq.input('tempId', sql.Int, targetTempId);
    upReq.input('price', sql.Decimal(18, 2), priceNum);
    await upReq.query(`
      UPDATE tblTempSales
      SET Price = @price,
          Amount = (Qty * @price) - Discount,
          GST = ROUND((((Qty * @price) - Discount) * GstPrec) / (100 + GstPrec), 2)
      WHERE TempID = @tempId
    `);

    // Recalculate promotions for entire cart
    const { recalculateCartPromotions } = require('../services/promotionService');
    const allRowsReq = pool.request();
    allRowsReq.input('term', sql.VarChar(20), termCode);
    const allRowsRes = await allRowsReq.query(`
      SELECT 
        ts.TempID, RTRIM(LTRIM(ts.TerminalCode)) AS TerminalCode, RTRIM(LTRIM(ts.InventoryCode)) AS InventoryCode,
        RTRIM(LTRIM(ISNULL(ts.Description, inv.Description))) AS Description, ISNULL(ts.Qty, 1) AS Qty,
        ISNULL(ts.Price, ISNULL(inv.SellingPrice, 0)) AS Price,
        ISNULL(ts.Price, ISNULL(inv.SellingPrice, 0)) AS NormalPrice,
        ISNULL(ts.Discount, 0) AS Discount, ISNULL(ts.NetDiscount, 0) AS NetDiscount, ISNULL(ts.Amount, 0) AS Amount,
        ISNULL(ts.GstPrec, 0) AS GstPrec, ISNULL(ts.GST, 0) AS GST, RTRIM(LTRIM(ISNULL(ts.Salesman, ''))) AS Salesman,
        RTRIM(LTRIM(ISNULL(inv.UOM, 'PCS'))) AS UOM
      FROM tblTempSales ts
      LEFT JOIN tblInventory inv ON RTRIM(LTRIM(ts.InventoryCode)) = RTRIM(LTRIM(inv.InventoryCode))
      WHERE RTRIM(LTRIM(ts.TerminalCode)) = @term
      ORDER BY ts.TempID ASC
    `);

    const rawItems = allRowsRes.recordset.map((r) => ({
      id: String(r.TempID), code: r.InventoryCode, description: r.Description, qty: Number(r.Qty),
      price: Number(r.Price), normalPrice: Number(r.NormalPrice || r.Price), disc: Number(r.Discount),
      amount: Number(r.Amount), gst: Number(r.GST), gstPrec: Number(r.GstPrec), salesman: r.Salesman || '', uom: r.UOM || 'PCS',
    }));

    const recalculated = await recalculateCartPromotions(pool, rawItems, 'HQ');

    // Persist recalculated promotions/discounts back to tblTempSales
    const { batchUpdateTempSalesPromotions } = require('../services/promotionService');
    await batchUpdateTempSalesPromotions(pool, recalculated);

    return res.status(200).json({
      success: true,
      action: 'price_updated',
      newPrice: priceNum,
      cartItems: recalculated,
    });
  } catch (error) {
    console.error('❌ [CART ERROR] Failed to update price in tblTempSales:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/temp-sales/update-desc', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'DB unreachable' });

    const { terminalCode, inventoryCode, description, tempId } = req.body;
    const termCode = getCleanTerminalCode(terminalCode);
    if (!termCode) return res.status(400).json({ success: false, message: 'terminalCode is required' });

    const newDesc = String(description || '').trim();
    if (!newDesc) return res.status(400).json({ success: false, message: 'description is required' });

    const request = pool.request();
    request.input('term', sql.VarChar(20), termCode);
    request.input('desc', sql.VarChar(200), newDesc);

    if (tempId) {
      request.input('tempId', sql.Int, tempId);
      await request.query(`
        UPDATE tblTempSales
        SET Description = @desc
        WHERE TempID = @tempId AND RTRIM(LTRIM(TerminalCode)) = @term;

        UPDATE tblDisplaySales
        SET Description = @desc
        WHERE TempID = @tempId AND RTRIM(LTRIM(TerminalCode)) = @term;
      `);
    } else {
      const invCode = String(inventoryCode || '').trim();
      if (!invCode) return res.status(400).json({ success: false, message: 'inventoryCode or tempId is required' });
      request.input('code', sql.VarChar(50), invCode);

      await request.query(`
        UPDATE tblTempSales
        SET Description = @desc
        WHERE TempID = (
          SELECT TOP 1 TempID FROM tblTempSales
          WHERE RTRIM(LTRIM(TerminalCode)) = @term AND RTRIM(LTRIM(InventoryCode)) = @code
          ORDER BY TempID DESC
        );

        UPDATE tblDisplaySales
        SET Description = @desc
        WHERE TempID = (
          SELECT TOP 1 TempID FROM tblDisplaySales
          WHERE RTRIM(LTRIM(TerminalCode)) = @term AND RTRIM(LTRIM(InventoryCode)) = @code
          ORDER BY TempID DESC
        );
      `);
    }

    return res.status(200).json({ success: true, action: 'updated', description: newDesc });
  } catch (error) {
    console.error('Failed to update description in tblTempSales:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/cart/temp-sales/update-salesman
// Updates the assigned Salesman for a specific cart row in tblTempSales
// ------------------------------------------------------------------------------
router.post('/temp-sales/update-salesman', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'DB unreachable' });

    const { terminalCode, inventoryCode, tempId, salesman } = req.body;
    const termCode = getCleanTerminalCode(terminalCode);
    if (!termCode) return res.status(400).json({ success: false, message: 'terminalCode is required' });

    const newSalesman = String(salesman || '').trim();
    if (!newSalesman) return res.status(400).json({ success: false, message: 'salesman is required' });

    const request = pool.request();
    request.input('term', sql.VarChar(20), termCode);
    request.input('salesman', sql.VarChar(20), newSalesman);

    if (tempId) {
      request.input('tempId', sql.Int, tempId);
      await request.query(`
        UPDATE tblTempSales
        SET Salesman = @salesman
        WHERE TempID = @tempId AND UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@term);
      `);
    } else {
      const invCode = String(inventoryCode || '').trim();
      if (!invCode) return res.status(400).json({ success: false, message: 'inventoryCode or tempId is required' });
      request.input('code', sql.VarChar(50), invCode);

      await request.query(`
        UPDATE tblTempSales
        SET Salesman = @salesman
        WHERE TempID = (
          SELECT TOP 1 TempID FROM tblTempSales
          WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@term) AND UPPER(RTRIM(LTRIM(InventoryCode))) = UPPER(@code)
          ORDER BY TempID DESC
        );
      `);
    }

    return res.status(200).json({ success: true, action: 'salesman_updated', salesman: newSalesman });
  } catch (error) {
    console.error('Failed to update salesman in tblTempSales:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

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

    // 1 & 2. In a single round-trip, fetch the item from tblTempSales, company LocationCode, and tblInventory master info
    const initialReq = new sql.Request(transaction);
    initialReq.input('term', sql.VarChar(20), termCode);
    initialReq.input('code', sql.VarChar(50), invCode);
    const initialRes = await initialReq.query(`
      SELECT TOP 1 *
      FROM tblTempSales
      WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@term) 
        AND UPPER(RTRIM(LTRIM(InventoryCode))) = UPPER(@code);

      SELECT TOP 1 
        ISNULL(term.LocationCode, ISNULL(comp.LocationCode, 'HQ')) AS LocationCode
      FROM tblMaCompany comp
      LEFT JOIN tblMaTerminal term ON UPPER(RTRIM(LTRIM(term.TerminalCode))) = UPPER(@term);

      SELECT 
        ISNULL(Description, '') AS Description,
        ISNULL(SellingPrice, 0) AS SellingPrice,
        ISNULL(DepartmentCode, '') AS DeptCode,
        ISNULL(CategoryCode, '') AS CategoryCode,
        ISNULL(BrandCode, '') AS BrandCode,
        ISNULL(AverageCost, 0) AS AverageCost
      FROM tblInventory
      WHERE UPPER(RTRIM(LTRIM(InventoryCode))) = UPPER(@code);
    `);

    let item = initialRes.recordsets[0]?.[0];
    const locCode = (initialRes.recordsets[1]?.[0]?.LocationCode || 'HQ').trim();
    const invInfo = initialRes.recordsets[2]?.[0];

    let qtyNum = Number(item?.Qty || 1);
    let priceNum = Number(item?.Price || 0);
    let discNum = Number(item?.Discount || 0);
    let netDiscNum = Number(item?.NetDiscount || 0);
    let lineTotal = parseFloat((qtyNum * priceNum).toFixed(2));
    let lineNet = parseFloat((lineTotal - discNum).toFixed(2));
    let gstNum = Number(item?.GST || 0);
    let salesmanId = (item?.Salesman || '').trim();

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

    // 4 & 5. Delete the item from tblTempSales and tblDisplaySales in a single batch query
    const delReq = new sql.Request(transaction);
    delReq.input('term', sql.VarChar(20), termCode);
    delReq.input('code', sql.VarChar(50), invCode);
    await delReq.query(`
      DELETE FROM tblTempSales
      WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@term) 
        AND UPPER(RTRIM(LTRIM(InventoryCode))) = UPPER(@code);

      DELETE FROM tblDisplaySales
      WHERE UPPER(RTRIM(LTRIM(TerminalCode))) = UPPER(@term) 
        AND UPPER(RTRIM(LTRIM(InventoryCode))) = UPPER(@code);
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

// ------------------------------------------------------------------------------
// POST /api/cart/temp-sales/sync-full
// Synchronizes entire calculated cart into tblTempSales (Exact SaveTempBill from VB.NET)
// ------------------------------------------------------------------------------
router.post('/temp-sales/sync-full', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const { terminalCode, items = [] } = req.body;
    const termCode = getCleanTerminalCode(terminalCode);
    if (!termCode) return res.status(400).json({ success: false, message: 'terminalCode is required' });

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const delReq = new sql.Request(transaction);
      delReq.input('term', sql.VarChar(20), termCode);
      await delReq.query('DELETE FROM tblTempSales WHERE RTRIM(LTRIM(TerminalCode)) = @term');

      if (items.length > 0) {
        const insReq = new sql.Request(transaction);
        insReq.input('term', sql.VarChar(20), termCode);

        const valLines = [];
        items.forEach((it, idx) => {
          insReq.input('code_' + idx, sql.VarChar(50), String(it.code || '').trim());
          insReq.input('desc_' + idx, sql.VarChar(200), String(it.description || '').slice(0, 200));
          insReq.input('qty_' + idx, sql.Decimal(18, 2), Number(it.qty) || 1);
          insReq.input('price_' + idx, sql.Decimal(18, 2), Number(it.price) || 0);
          insReq.input('charge_' + idx, sql.Decimal(18, 4), Number(it.price) || 0);
          insReq.input('disc_' + idx, sql.Decimal(18, 2), Number(it.disc) || 0);
          insReq.input('netDisc_' + idx, sql.Decimal(18, 2), Number(it.disc) || 0);
          insReq.input('gstPrec_' + idx, sql.Decimal(18, 2), Number(it.gstPrec || 0));
          insReq.input('gst_' + idx, sql.Decimal(18, 2), Number(it.gst || 0));
          insReq.input('amt_' + idx, sql.Decimal(18, 2), Number(it.amount || 0));
          insReq.input('dpCode_' + idx, sql.VarChar(50), String(it.discountPriceCode || '').trim());
          insReq.input('salesman_' + idx, sql.VarChar(20), String(it.salesman || '').trim());
          insReq.input('promoName_' + idx, sql.VarChar(100), String(it.promoName || it.code || '').trim().slice(0, 100));

          valLines.push(`(@term, @code_${idx}, @desc_${idx}, @qty_${idx}, '', '', '', 0, @price_${idx}, @charge_${idx}, @disc_${idx}, @netDisc_${idx}, @gstPrec_${idx}, @gst_${idx}, @amt_${idx}, @dpCode_${idx}, @salesman_${idx}, @promoName_${idx}, 0, '0', '')`);
        });

        await insReq.query('INSERT INTO tblTempSales (TerminalCode, InventoryCode, Description, Qty, Department, Brand, Category, AverageCost, Price, Charge, Discount, NetDiscount, GstPrec, GST, Amount, DiscountPriceCode, Salesman, PromoName, MemDiscount, ItemType, MemName) VALUES ' + valLines.join(',\n'));
      }

      await transaction.commit();
      return res.status(200).json({ success: true, count: items.length });
    } catch (txErr) {
      await transaction.rollback();
      throw txErr;
    }
  } catch (err) {
    console.error('❌ [SYNC FULL ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// POST /api/cart/checkout
// Finalizes sale and persists line items into tblPOSSalesDetail (via sp_SalesDetail)
// ------------------------------------------------------------------------------
router.post('/checkout', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const {
      terminalCode,
      invoiceNo,
      cashierId = 'ADMIN',
      locationCode = 'HQ',
      items = [],
      payMode = 'CASH',
      tenderAmount = 0,
    } = req.body;

    const termCode = getCleanTerminalCode(terminalCode);
    if (!termCode) return res.status(400).json({ success: false, message: 'terminalCode is required' });
    if (!invoiceNo) return res.status(400).json({ success: false, message: 'invoiceNo is required' });
    if (!items || items.length === 0) return res.status(400).json({ success: false, message: 'No items in cart to checkout' });

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      for (const it of items) {
        const invCode = String(it.code || '').trim();
        const qtyNum = Number(it.qty) || 1;
        const priceNum = Number(it.price) || 0;
        const totalValue = parseFloat((qtyNum * priceNum).toFixed(2));
        const discNum = Number(it.disc) || 0;
        const netAmount = Math.max(0, parseFloat((totalValue - discNum).toFixed(2)));
        const gstPrec = Number(it.gstPrec) || 0;
        const gst = gstPrec > 0 ? parseFloat(((netAmount * gstPrec) / (100 + gstPrec)).toFixed(2)) : 0;
        const actualSales = parseFloat((netAmount - gst).toFixed(2));

        // Fetch attributes from tblInventory
        const itemReq = new sql.Request(transaction);
        itemReq.input('code', sql.VarChar(50), invCode);
        const itemRes = await itemReq.query('SELECT DepartmentCode, CategoryCode, BrandCode, AverageCost, OutputTax FROM tblInventory WHERE UPPER(RTRIM(LTRIM(InventoryCode))) = UPPER(@code)');
        const attr = itemRes.recordset[0] || {};

        const prmFlag = (it.promoCode || it.discountPriceCode || it.promoDisc > 0 || it.pairDisc > 0) ? 'Y' : 'N';
        const promoName = String(it.promoName || invCode).slice(0, 100);

        const spReq = new sql.Request(transaction);
        spReq.input('InvoiceNo', sql.Char(15), String(invoiceNo).slice(0, 15));
        spReq.input('InventoryCode', sql.Char(20), invCode.slice(0, 20));
        spReq.input('Description', sql.NVarChar(200), String(it.description || '').slice(0, 200));
        spReq.input('Qty', sql.Decimal(18, 2), qtyNum);
        spReq.input('Price', sql.Decimal(18, 2), priceNum);
        spReq.input('TotalValue', sql.Decimal(18, 2), totalValue);
        spReq.input('Discount', sql.Decimal(18, 2), discNum);
        spReq.input('NetDiscount', sql.Decimal(18, 2), discNum);
        spReq.input('NetAmount', sql.Decimal(18, 2), netAmount);
        spReq.input('ActualSales', sql.Decimal(18, 2), actualSales);
        spReq.input('Gst', sql.Decimal(18, 4), gst);
        spReq.input('SalesmanId', sql.Char(10), String(it.salesman || '').slice(0, 10));
        spReq.input('DeptCode', sql.Char(10), String(attr.DepartmentCode || '').slice(0, 10));
        spReq.input('CategoryCode', sql.Char(20), String(attr.CategoryCode || '').slice(0, 20));
        spReq.input('BrandCode', sql.Char(20), String(attr.BrandCode || '').slice(0, 20));
        spReq.input('UserID', sql.Char(10), String(cashierId).slice(0, 10));
        spReq.input('LocationCode', sql.Char(10), String(locationCode).slice(0, 10));
        spReq.input('MemberDiscount', sql.Decimal(18, 2), 0);
        spReq.input('GSTType', sql.Char(10), 'I');
        spReq.input('PRMFlag', sql.Char(1), prmFlag);
        spReq.input('EventDesc', sql.VarChar(100), promoName);
        spReq.input('FreeItem', sql.Char(10), '');
        spReq.input('MRP', sql.Money, 0);
        spReq.input('TaxPerc', sql.Decimal(18, 2), gstPrec);
        spReq.input('ExpiryDate', sql.Char(8), '');
        spReq.input('BatchNo', sql.NVarChar(50), '');
        spReq.input('BinNo', sql.Char(10), '');
        spReq.input('CardType', sql.Char(10), '');
        spReq.input('CardCommPerc', sql.Decimal(18, 2), 0);
        spReq.input('Remarks', sql.VarChar(120), '');
        spReq.input('SerialNo', sql.VarChar(50), '');
        spReq.input('MXRemarks', sql.VarChar(120), '');

        await spReq.execute('sp_SalesDetail');

        // Also update PromotionCode and PromotionName explicitly on tblPOSSalesDetail
        const upReq = new sql.Request(transaction);
        upReq.input('invNo', sql.VarChar(20), invoiceNo);
        upReq.input('code', sql.VarChar(20), invCode);
        upReq.input('pCode', sql.VarChar(10), String(it.promoCode || '').slice(0, 10));
        upReq.input('pName', sql.VarChar(50), promoName.slice(0, 50));
        await upReq.query('UPDATE tblPOSSalesDetail SET PromotionCode = @pCode, PromotionName = @pName WHERE RTRIM(LTRIM(InvoiceNo)) = @invNo AND RTRIM(LTRIM(InventoryCode)) = @code');
      }

      // Clean temporary sales table for this terminal
      const clearTemp = new sql.Request(transaction);
      clearTemp.input('term', sql.VarChar(20), termCode);
      await clearTemp.query('DELETE FROM tblTempSales WHERE RTRIM(LTRIM(TerminalCode)) = @term');

      await transaction.commit();
      return res.status(200).json({ success: true, invoiceNo, message: 'Checkout completed and promotions persisted' });
    } catch (txErr) {
      await transaction.rollback();
      throw txErr;
    }
  } catch (err) {
    console.error('❌ [CHECKOUT ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});
