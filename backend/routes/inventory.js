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

module.exports = router;
