// ==============================================================================
// routes/searchRoutes.js
// Complete Inventory Search Implementation (VB.NET frmSearch & clsInventory)
// ==============================================================================

const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../config/db');

// Helper to get clean location code
function getCleanLocationCode(loc) {
  if (!loc || typeof loc !== 'string') return 'HQ';
  const cleaned = loc.trim();
  return cleaned.length > 0 ? cleaned : 'HQ';
}

// ------------------------------------------------------------------------------
// 1. GET /api/search/filters
// Loads departments, vendors, brands and locations for dropdown/tree filter choices
// ------------------------------------------------------------------------------
router.get('/filters', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unavailable' });

    const [deptRes, vendorRes, brandRes, locRes] = await Promise.all([
      pool.request().query(`
        SELECT RTRIM(LTRIM(DeptCode)) AS DeptCode, RTRIM(LTRIM(DeptName)) AS DeptName
        FROM tblInvDepartment
        ORDER BY DeptCode
      `),
      pool.request().query(`
        SELECT DISTINCT TOP 200 RTRIM(LTRIM(VendorCode)) AS VendorCode, RTRIM(LTRIM(VendorName)) AS VendorName
        FROM tblInvVendor
        WHERE VendorCode IS NOT NULL AND RTRIM(LTRIM(VendorCode)) <> ''
        ORDER BY VendorName
      `),
      pool.request().query(`
        SELECT DISTINCT TOP 200 RTRIM(LTRIM(BrandCode)) AS BrandCode, RTRIM(LTRIM(BrandName)) AS BrandName
        FROM tblInvBrand
        WHERE BrandCode IS NOT NULL AND RTRIM(LTRIM(BrandCode)) <> ''
        ORDER BY BrandName
      `),
      pool.request().query(`
        SELECT RTRIM(LTRIM(LocationCode)) AS LocationCode, RTRIM(LTRIM(LocationName)) AS LocationName
        FROM tblmaLocation
        ORDER BY LocationCode
      `)
    ]);

    return res.status(200).json({
      success: true,
      departments: deptRes.recordset || [],
      vendors: vendorRes.recordset || [],
      brands: brandRes.recordset || [],
      locations: locRes.recordset || [],
    });
  } catch (err) {
    console.error('❌ [SEARCH ERROR - FILTERS]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 2. GET /api/search/hierarchy
// Implements VB.NET fncGetTreeViewList() calling stored procedure: sp_GetInventorySearch
// Parameters: Dept, Category, Brand, LocCode
// ------------------------------------------------------------------------------
router.get('/hierarchy', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unavailable' });

    const dept = String(req.query.dept || '').trim();
    const category = String(req.query.category || '').trim();
    const brand = String(req.query.brand || '').trim();
    const locationCode = getCleanLocationCode(req.query.locationCode);

    const spReq = pool.request();
    spReq.input('Dept', sql.VarChar(20), dept);
    spReq.input('Category', sql.VarChar(20), category);
    spReq.input('Brand', sql.VarChar(20), brand);
    spReq.input('LocCode', sql.Char(20), locationCode);

    const result = await spReq.execute('sp_GetInventorySearch');

    return res.status(200).json({
      success: true,
      data: result.recordset || [],
      step: !dept && !category && !brand ? 'DEPARTMENTS' :
            dept && !category && !brand ? 'CATEGORIES' :
            dept && category && !brand ? 'BRANDS' : 'ITEMS',
    });
  } catch (err) {
    console.error('❌ [SEARCH ERROR - HIERARCHY]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 3. POST /api/search/items
// Implements VB.NET fncGetMultipleSearchDetails()
// Searches inventory based on Barcode (or 6-char InventoryCode),
// Description, Department, Category, Brand, Vendor, Price, LocationCode
// Rule: If no criteria entered, returns empty array without loading all inventory.
// ------------------------------------------------------------------------------
router.post('/items', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unavailable' });

    const {
      barcode,
      description,
      department,
      category,
      brand,
      vendor,
      price,
      locationCode,
      limit = 100,
    } = req.body;

    const locCode = getCleanLocationCode(locationCode);

    const cleanBarcode = barcode ? String(barcode).trim() : '';
    const cleanDesc = description ? String(description).trim() : '';
    const cleanDept = department ? String(department).trim() : '';
    const cleanCat = category ? String(category).trim() : '';
    const cleanBrand = brand ? String(brand).trim() : '';
    const cleanVendor = vendor ? String(vendor).trim() : '';
    const cleanPrice = price !== undefined && price !== null && String(price).trim() !== '' ? parseFloat(price) : null;

    // RULE: If no search criteria are entered, return an empty result instead of loading all inventory
    const hasCriteria = Boolean(
      cleanBarcode ||
      cleanDesc ||
      cleanDept ||
      cleanCat ||
      cleanBrand ||
      cleanVendor ||
      (cleanPrice !== null && !isNaN(cleanPrice))
    );

    if (!hasCriteria) {
      return res.status(200).json({
        success: true,
        items: [],
        message: 'No search criteria specified.',
      });
    }

    const request = pool.request();
    request.input('locCode', sql.VarChar(20), locCode);
    const whereClauses = ['b.LocationCode = @locCode'];

    // 1. Barcode filtering
    // VB.NET logic: If barcode length is 6, search using InventoryCode directly;
    // otherwise search tblInventoryBarcode
    if (cleanBarcode) {
      if (cleanBarcode.length === 6) {
        request.input('invCode', sql.VarChar(50), cleanBarcode);
        whereClauses.push('(RTRIM(LTRIM(a.InventoryCode)) = @invCode OR EXISTS (SELECT 1 FROM tblInventoryBarcode bc WHERE bc.InventoryCode = a.InventoryCode AND RTRIM(LTRIM(bc.BarCode)) = @invCode))');
      } else {
        request.input('barcodeInput', sql.VarChar(50), cleanBarcode);
        whereClauses.push(`(
          EXISTS (
            SELECT 1 FROM tblInventoryBarcode bc 
            WHERE bc.InventoryCode = a.InventoryCode 
              AND RTRIM(LTRIM(bc.BarCode)) = @barcodeInput
          )
          OR RTRIM(LTRIM(a.InventoryCode)) = @barcodeInput
        )`);
      }
    }

    // 2. Description filtering
    if (cleanDesc) {
      request.input('descInput', sql.VarChar(100), `%${cleanDesc}%`);
      whereClauses.push('a.Description LIKE @descInput');
    }

    // 3. Department filtering
    if (cleanDept) {
      request.input('deptInput', sql.VarChar(50), cleanDept);
      whereClauses.push('RTRIM(LTRIM(a.DepartmentCode)) = @deptInput');
    }

    // 4. Category filtering
    if (cleanCat) {
      request.input('catInput', sql.VarChar(50), cleanCat);
      whereClauses.push('RTRIM(LTRIM(a.CategoryCode)) = @catInput');
    }

    // 5. Brand filtering
    if (cleanBrand) {
      request.input('brandInput', sql.VarChar(50), cleanBrand);
      whereClauses.push('RTRIM(LTRIM(a.BrandCode)) = @brandInput');
    }

    // 6. Vendor filtering
    if (cleanVendor) {
      request.input('vendorInput', sql.VarChar(50), cleanVendor);
      whereClauses.push('RTRIM(LTRIM(a.VendorCode)) = @vendorInput');
    }

    // 7. Price filtering
    if (cleanPrice !== null && !isNaN(cleanPrice)) {
      request.input('priceInput', sql.Decimal(18, 2), cleanPrice);
      whereClauses.push('(b.OutletRetailPrice = @priceInput OR b.OutletSellingPrice = @priceInput OR a.RetailPrice = @priceInput OR a.SellingPrice = @priceInput)');
    }

    const maxLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

    const query = `
      SELECT TOP ${maxLimit}
        RTRIM(LTRIM(a.InventoryCode)) AS InventoryCode,
        RTRIM(LTRIM(a.Description)) AS Description,
        ISNULL(b.QtyOnHand, 0) AS QtyOnHand,
        ISNULL(b.OutletRetailPrice, ISNULL(a.RetailPrice, ISNULL(a.SellingPrice, 0))) AS RetailPrice,
        ISNULL(b.OutletSellingPrice, ISNULL(a.SellingPrice, 0)) AS SellingPrice,
        ISNULL(b.AverageCost, ISNULL(a.AverageCost, 0)) AS AverageCost,
        RTRIM(LTRIM(ISNULL(a.DepartmentCode, ''))) AS DepartmentCode,
        RTRIM(LTRIM(ISNULL(a.CategoryCode, ''))) AS CategoryCode,
        RTRIM(LTRIM(ISNULL(a.BrandCode, ''))) AS BrandCode,
        RTRIM(LTRIM(ISNULL(a.VendorCode, ''))) AS VendorCode,
        ISNULL((
          SELECT TOP 1 RTRIM(LTRIM(BarCode))
          FROM tblInventoryBarcode
          WHERE InventoryCode = a.InventoryCode
          ORDER BY ModifyDate DESC
        ), RTRIM(LTRIM(a.InventoryCode))) AS Barcode,
        RTRIM(LTRIM(ISNULL(a.UOM, 'PCS'))) AS UOM
      FROM tblInventory a
      INNER JOIN tblInventoryStock b ON a.InventoryCode = b.InventoryCode
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY a.Description ASC
    `;

    const result = await request.query(query);

    return res.status(200).json({
      success: true,
      count: result.recordset.length,
      items: result.recordset,
    });
  } catch (err) {
    console.error('❌ [SEARCH ERROR - ITEMS]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------------------
// 4. GET /api/search/stock
// Implements VB.NET fncGetInventoryStock(), fncGetOutletStock(), fncGetOutletStockHQ()
// Returns outlet stock across all locations or current outlet and HQ
// ------------------------------------------------------------------------------
router.get('/stock', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unavailable' });

    const invCode = String(req.query.inventoryCode || '').trim();
    if (!invCode) {
      return res.status(400).json({ success: false, message: 'inventoryCode query parameter is required' });
    }

    const request = pool.request();
    request.input('code', sql.VarChar(50), invCode);

    // 1. Get stock across all locations from tblInventoryStock joined with tblmaLocation
    const stockResult = await request.query(`
      SELECT 
        RTRIM(LTRIM(s.LocationCode)) AS LocationCode,
        RTRIM(LTRIM(ISNULL(l.LocationName, s.LocationCode))) AS LocationName,
        ISNULL(s.QtyOnHand, 0) AS QtyOnHand,
        ISNULL(s.OutletSellingPrice, 0) AS OutletSellingPrice,
        ISNULL(s.OutletRetailPrice, 0) AS OutletRetailPrice,
        ISNULL(s.HQSellingPrice, 0) AS HQSellingPrice,
        ISNULL(s.AverageCost, 0) AS AverageCost,
        ISNULL(s.ReserveQty, 0) AS ReserveQty,
        ISNULL(s.ToOrder, 0) AS ToOrder,
        ISNULL(s.ToTransfer, 0) AS ToTransfer
      FROM tblInventoryStock s
      LEFT JOIN tblmaLocation l ON RTRIM(LTRIM(s.LocationCode)) = RTRIM(LTRIM(l.LocationCode))
      WHERE RTRIM(LTRIM(s.InventoryCode)) = @code
      ORDER BY s.LocationCode ASC
    `);

    // 2. Identify HQ and current location stock
    const companyRes = await pool.request().query(`
      SELECT TOP 1 
        RTRIM(LTRIM(LocationCode)) AS LocationCode,
        RTRIM(LTRIM(MainLocationCode)) AS MainLocationCode
      FROM tblmaCompany
    `);

    const hqCode = (companyRes.recordset[0]?.MainLocationCode || companyRes.recordset[0]?.LocationCode || 'HQ').trim();

    return res.status(200).json({
      success: true,
      inventoryCode: invCode,
      hqLocationCode: hqCode,
      locations: stockResult.recordset || [],
    });
  } catch (err) {
    console.error('❌ [SEARCH ERROR - STOCK]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
