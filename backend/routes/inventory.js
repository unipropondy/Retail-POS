// ==============================================================================
// Project: Supermarket Retail POS
// Module: Touch Screen Inventory (Groups & Items)
// File: routes/inventory.js
//
// Change History:
//   - 28-10-2026 | JAVITH | Initial creation of touch screen inventory endpoints
//                          linking TBLinventorytsgroup, tblInventoryTSList, and tblInventory
// ==============================================================================

const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../config/db');

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

    let query = `
      SELECT 
        RTRIM(LTRIM(ts.GroupCode)) AS GroupCode,
        RTRIM(LTRIM(ts.InventoryCode)) AS InventoryCode,
        ts.SortOrder,
        RTRIM(LTRIM(inv.Description)) AS Description,
        ISNULL(inv.SellingPrice, 0) AS SellingPrice,
        ISNULL(inv.RetailPrice, 0) AS RetailPrice,
        RTRIM(LTRIM(ISNULL(inv.UOM, 'PCS'))) AS UOM
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

module.exports = router;
