// ==============================================================================
// Project: Supermarket Retail POS
// Module: Touch Screen Inventory (Groups & Items)
// File: routes/inventory.js
//
// Change History:
//   - 28-10-2026 | JAVITH | Initial creation of touch screen inventory endpoints
//                          linking TBLinventorytsgroup, tblInventoryTSList, and tblInventory
//   - 31-10-2026 | JAVITH | Added hasImage flag to touch-items query
//                           Added GET /image/:inventoryCode streaming endpoint
//                           Supports POSDB=NEW (SQL BLOB) and POSDB=OLD (folder)
// ==============================================================================

const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../config/db');
const configService = require('../config/configService');

// ------------------------------------------------------------------------------
// GET /api/inventory/touch-groups
// [JAVITH - 28-10-2026]: Fetches all active touch screen categories from TBLinventorytsgroup
// ------------------------------------------------------------------------------
router.get('/touch-groups', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) {
      return res.status(503).json({
        success: false,
        message: 'Database is currently unreachable. Please check network/VPN.',
      });
    }

    // Query active touch groups ordered by SortCode
    const result = await pool.request().query(`
      SELECT
        RTRIM(LTRIM(GroupCode)) AS GroupCode,
        SortCode
      FROM TBLinventorytsgroup
      WHERE IsActive = 1
      ORDER BY SortCode, GroupCode
    `);

    return res.status(200).json({
      success: true,
      count: result.recordset.length,
      groups: result.recordset,
    });
  } catch (error) {
    console.error('❌ [INVENTORY ERROR] Failed to fetch touch groups:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch touch groups: ' + error.message,
    });
  }
});

// ------------------------------------------------------------------------------
// GET /api/inventory/touch-items
// [JAVITH - 28-10-2026]: Fetches touch screen items by joining tblInventoryTSList with tblInventory
// [JAVITH - 31-10-2026]: hasImage always 1 — image endpoint returns 404 if missing (OLD=folder, NEW=BLOB)
// Query Params:
//   - groupCode (optional): filters items by specific group (e.g. ?groupCode=BEERS)
// ------------------------------------------------------------------------------
router.get('/touch-items', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) {
      return res.status(503).json({
        success: false,
        message: 'Database is currently unreachable. Please check network/VPN.',
      });
    }

    const { groupCode } = req.query;
    const maxItems = configService.getNumber('itemListMaxData', 40);

    let query = `
      SELECT TOP (${maxItems})
        RTRIM(LTRIM(ts.GroupCode)) AS GroupCode,
        RTRIM(LTRIM(ts.InventoryCode)) AS InventoryCode,
        ts.SortOrder,
        RTRIM(LTRIM(inv.Description)) AS Description,
        ISNULL(inv.SellingPrice, 0) AS SellingPrice,
        ISNULL(inv.RetailPrice, 0) AS RetailPrice,
        RTRIM(LTRIM(ISNULL(inv.UOM, 'PCS'))) AS UOM,
        1 AS hasImage
      FROM tblInventoryTSList ts
      INNER JOIN tblInventory inv ON RTRIM(LTRIM(ts.InventoryCode)) = RTRIM(LTRIM(inv.InventoryCode))
      WHERE ts.IsActive = 1
    `;

    const request = pool.request();

    if (groupCode) {
      query += ` AND UPPER(RTRIM(LTRIM(ts.GroupCode))) = @groupCode`;
      request.input('groupCode', sql.VarChar, String(groupCode).trim().toUpperCase());
    }

    query += ` ORDER BY ts.GroupCode, ts.SortOrder, inv.Description`;

    const result = await request.query(query);

    return res.status(200).json({
      success: true,
      count: result.recordset.length,
      items: result.recordset,
    });
  } catch (error) {
    console.error('❌ [INVENTORY ERROR] Failed to fetch touch items:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch touch items: ' + error.message,
    });
  }
});

// ------------------------------------------------------------------------------
// GET /api/inventory/image/:inventoryCode
// [JAVITH - 31-10-2026]: Streams item image from DB BLOB or Windows folder
//
// Behavior:
//   POSDB = "NEW" (default) → reads tblInventory.Image BLOB column
//   POSDB = "OLD"           → reads file from {ImagePath}/Inventory/{code}.{ext}
//                             Supports jpg, jpeg, png, webp
//
// Returns 404 if image is missing/empty so frontend falls back to icon placeholder.
// Sets Cache-Control: 7 days so repeated tile loads don't re-hit the server.
// ------------------------------------------------------------------------------
router.get('/image/:inventoryCode', async (req, res) => {
  try {
    const { inventoryCode } = req.params;
    if (!inventoryCode || !inventoryCode.trim()) {
      return res.status(400).json({ success: false, message: 'InventoryCode is required' });
    }
    const code = inventoryCode.trim();

    const posDb = (configService.get('POSDB') || 'NEW').toUpperCase();
    const imagePath = configService.get('ImagePath') || '';

    // ------------------------------------------------------------------
    // OLD mode: serve image file from folder
    // Folder: {ImagePath}/Inventory/{InventoryCode}.{ext}
    // ImagePath can be absolute (e.g. D:\Images) or relative (e.g. ./images)
    // Relative paths resolve from the backend directory (__dirname/../)
    // ------------------------------------------------------------------
    if (posDb === 'OLD') {
      // Resolve relative path from backend root if needed
      const backendDir = path.resolve(__dirname, '..');
      const resolvedImagePath = imagePath
        ? path.resolve(backendDir, imagePath)
        : path.join(backendDir, 'images');
      const inventoryFolder = path.join(resolvedImagePath, 'Inventory');
      const extensions = ['jpg', 'jpeg', 'png', 'webp'];

      for (const ext of extensions) {
        const filePath = path.join(inventoryFolder, code + '.' + ext);
        if (fs.existsSync(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=604800');
          return res.sendFile(filePath);
        }
      }

      return res.status(404).json({ success: false, message: 'Image file not found in folder' });
    }

    // ------------------------------------------------------------------
    // NEW mode (default): serve image BLOB from tblInventory.Image
    // ------------------------------------------------------------------
    const pool = await getPool();
    if (!pool) {
      return res.status(503).json({ success: false, message: 'Database unavailable' });
    }

    const request = pool.request();
    request.input('code', sql.VarChar(50), code);

    const result = await request.query(`
      SELECT Image FROM tblInventory
      WHERE RTRIM(LTRIM(InventoryCode)) = @code
    `);

    if (!result.recordset.length) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    const imgBuffer = result.recordset[0].Image;

    // Guard: SQL Server image type returns null or 2-byte stub when empty
    if (!imgBuffer || imgBuffer.length <= 4) {
      return res.status(404).json({ success: false, message: 'No image data stored for this item' });
    }

    // Detect image format from magic bytes for correct Content-Type
    let contentType = 'image/jpeg'; // default
    if (imgBuffer[0] === 0x89 && imgBuffer[1] === 0x50) contentType = 'image/png';
    else if (imgBuffer[0] === 0x47 && imgBuffer[1] === 0x49) contentType = 'image/gif';
    else if (imgBuffer[0] === 0x52 && imgBuffer[1] === 0x49) contentType = 'image/webp';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.setHeader('Content-Length', imgBuffer.length);
    return res.send(imgBuffer);

  } catch (err) {
    console.error('❌ [IMAGE ERROR]', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// POST /api/inventory/lookup
// Complete VB.NET item pipeline:
// Parses Qty prefix (*), Weighing scale barcodes (20...), resolves Barcode/Carton,
// validates InActive/Discontinued/Voucher/ZeroPrice/QOH stock, and returns item package.
// ------------------------------------------------------------------------------
router.post('/lookup', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unavailable' });

    const { rawCode, currentQty, locationCode = 'HQ' } = req.body;
    if (!rawCode || !String(rawCode).trim()) {
      return res.status(400).json({ success: false, message: 'Item code is required' });
    }

    const posItemService = require('../services/posItemService');

    // 1. Check quantity prefix (e.g. 5*8888001)
    const { code: unprefixCode, qty: parsedQty } = posItemService.parseQtyPrefix(rawCode, currentQty);

    // 2. Check weighing scale barcodes (20...)
    const allowScale = configService.get('ALLOWWEIGHINSCALE') !== '0';
    const scaleRes = posItemService.parseWeighingScaleBarcode(unprefixCode, allowScale);
    const searchCode = scaleRes.code;

    // 3. Resolve SKU / Barcode / Carton Barcode
    const resolveRes = await posItemService.resolveInventoryCode(pool, searchCode);
    if (!resolveRes.resolvedCode) {
      return res.status(404).json({
        success: false,
        message: 'Inventory code not found.',
        errorCode: 'ITEM_NOT_FOUND',
      });
    }

    // 4. Retrieve complete master inventory record
    const item = await posItemService.getInventoryMaster(pool, resolveRes.resolvedCode);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Inventory record not found in tblInventory.',
        errorCode: 'ITEM_NOT_FOUND',
      });
    }

    // 5. VB.NET Item Validations
    // Check A: BCRS Deposit directly scanned
    if (item.Description.toUpperCase() === 'BCRS DEPOSIT') {
      return res.status(400).json({
        success: false,
        message: 'This Item is for BCRS Deposit. Unable to Scan directly.',
        errorCode: 'BCRS_DEPOSIT_DIRECT',
      });
    }

    // Check B: Discontinued
    if (Boolean(item.Discontinued)) {
      return res.status(400).json({
        success: false,
        message: 'Item is Discontinued. Not Allowed to do any Transaction!',
        errorCode: 'ITEM_DISCONTINUED',
      });
    }

    // Check C: InActive
    if (Boolean(item.InActive)) {
      return res.status(400).json({
        success: false,
        message: 'Item is InActive. Not Allowed to do any Transaction!',
        errorCode: 'ITEM_INACTIVE',
      });
    }

    // Check D: Pricing determination
    let price = Number(item.RetailPrice);
    if (resolveRes.isCarton) {
      price = resolveRes.unitPriceFromCarton;
    } else if (scaleRes.isScale && scaleRes.encodedPrice > 0) {
      price = scaleRes.encodedPrice;
    }

    // Check E: Zero Price allowance
    const allowZero = Boolean(item.AllowZeroPrice);
    if (price <= 0 && !allowZero && !Boolean(item.OpenItem) && !Boolean(item.AllowPaymodeCommision)) {
      if (item.UOM !== 'KG') {
        return res.status(400).json({
          success: false,
          message: 'Please set the price. Zero price not allowed for this item.',
          errorCode: 'ZERO_PRICE_NOT_ALLOWED',
        });
      }
    }

    // 6. QOH Stock Check
    const qoh = await posItemService.getItemStock(pool, item.InventoryCode, locationCode);

    // 7. Determine fractional UOM allowance
    const allowFraction = (item.UOM === 'KG' || item.UOM === 'MTR');
    let effectiveQty = parsedQty;
    if (resolveRes.isCarton) {
      effectiveQty = parsedQty * resolveRes.cartonQty;
    } else if (scaleRes.isScale && scaleRes.weightKg) {
      effectiveQty = scaleRes.weightKg;
    }

    return res.status(200).json({
      success: true,
      item: {
        InventoryCode: item.InventoryCode,
        Description: item.Description,
        ShortDescription: item.ShortDescription,
        RetailPrice: Number(item.RetailPrice),
        SellingPrice: Number(item.SellingPrice),
        Price: price,
        UOM: item.UOM,
        AllowFraction: allowFraction,
        IsScale: scaleRes.isScale,
        LockQty: scaleRes.lockQty || false,
        Qty: effectiveQty,
        IsCarton: resolveRes.isCarton,
        CartonQty: resolveRes.cartonQty || 1,
        CartonPrice: resolveRes.cartonPrice || 0,
        DepartmentCode: item.DepartmentCode,
        CategoryCode: item.CategoryCode,
        BrandCode: item.BrandCode,
        AverageCost: Number(item.AverageCost),
        AllowNegativeStock: Boolean(item.AllowNegativeStock),
        SalesmanRequired: Boolean(item.SalesmanRequired),
        OpenItem: Boolean(item.OpenItem),
        ChangeDescription: Boolean(item.ChangeDescription),
        IsFixedPrice: Boolean(item.IsFixedPrice),
        AllowZeroPrice: allowZero,
        AllowMemberPrice: Boolean(item.AllowMemberPrice),
        NonTaxItem: Boolean(item.NonTaxItem),
        OutputTax: Number(item.OutputTax),
        WebInfo: Boolean(item.WebInfo),
        QOH: qoh,
      },
    });
  } catch (err) {
    console.error('❌ [INVENTORY LOOKUP ERROR]:', err.message);
    return res.status(500).json({ success: false, message: 'Lookup error: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// GET /api/inventory/search-desc
// Live full-text search against tblInventory master for description lookup
// ------------------------------------------------------------------------------
router.get('/search-desc', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unavailable' });

    const q = String(req.query.q || '').trim();
    if (!q || q.length < 1) {
      return res.status(200).json({ success: true, items: [] });
    }

    const request = pool.request();
    request.input('searchTerm', sql.VarChar(100), `%${q}%`);
    request.input('exactTerm', sql.VarChar(50), q);

    const result = await request.query(`
      SELECT TOP 25
        RTRIM(LTRIM(InventoryCode)) AS InventoryCode,
        RTRIM(LTRIM(Description)) AS Description,
        ISNULL(SellingPrice, 0) AS SellingPrice,
        ISNULL(RetailPrice, 0) AS RetailPrice,
        RTRIM(LTRIM(ISNULL(UOM, 'PCS'))) AS UOM,
        RTRIM(LTRIM(ISNULL(DepartmentCode, ''))) AS DepartmentCode,
        ISNULL(OpenItem, 0) AS OpenItem,
        ISNULL(SalesmanRequired, 0) AS SalesmanRequired
      FROM tblInventory
      WHERE InActive = 0 AND Discontinued = 0
        AND (
          Description LIKE @searchTerm 
          OR UPPER(RTRIM(LTRIM(InventoryCode))) = UPPER(@exactTerm)
          OR InventoryCode LIKE @searchTerm
        )
      ORDER BY 
        CASE WHEN UPPER(RTRIM(LTRIM(InventoryCode))) = UPPER(@exactTerm) THEN 0
             WHEN Description LIKE @exactTerm + '%' THEN 1
             ELSE 2 END,
        Description
    `);

    return res.status(200).json({
      success: true,
      count: result.recordset.length,
      items: result.recordset,
    });
  } catch (err) {
    console.error('❌ [DESC SEARCH ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// POST /api/inventory/validate-salesman
// Validates salesman code against tblInvSalesMan and tblMaSalesMan
// ------------------------------------------------------------------------------
router.post('/validate-salesman', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unavailable' });

    const { salesmanCode } = req.body;
    if (!salesmanCode || !String(salesmanCode).trim()) {
      return res.status(400).json({ success: false, message: 'Salesman code required' });
    }

    const posItemService = require('../services/posItemService');
    const sm = await posItemService.validateSalesman(pool, salesmanCode);

    if (sm) {
      return res.status(200).json({
        success: true,
        salesman: sm,
      });
    } else {
      return res.status(404).json({
        success: false,
        message: 'Please check the sales man code. Not found in master.',
      });
    }
  } catch (err) {
    console.error('❌ [SALESMAN VALIDATE ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
