// ==============================================================================
// Author: JAVITH, BAVANI
// Project: Supermarket Retail POS
// Module: POS Item Entry Pipeline Service (Exact VB.NET frmPos1.vb Parity)
// File: services/posItemService.js
// ==============================================================================

const { sql, getPool } = require('../config/db');
const configService = require('../config/configService');

/**
 * 1. Parse SKU code for quantity prefix (e.g. "5*8888001" -> qty: 5, code: "8888001")
 */
function parseQtyPrefix(rawInput, currentQty = 1) {
  if (!rawInput || typeof rawInput !== 'string') return { code: '', qty: currentQty };
  const trimmed = rawInput.trim();
  const starIdx = trimmed.indexOf('*');
  if (starIdx > 0 && starIdx < trimmed.length - 1) {
    const prefixVal = parseFloat(trimmed.slice(0, starIdx));
    const extractedCode = trimmed.slice(starIdx + 1).trim();
    if (!isNaN(prefixVal) && prefixVal !== 0 && extractedCode.length > 0) {
      return {
        code: extractedCode,
        qty: parseFloat((prefixVal * (parseFloat(currentQty) || 1)).toFixed(4)),
      };
    }
  }
  return { code: trimmed, qty: parseFloat(currentQty) || 1 };
}

/**
 * 2. Parse Weighing Scale Barcodes (VB.NET lines 1435-1505)
 * Format 1: 18 digits starting with '20' (20 + 5-digit SKU + 5-digit Price/100 + 5-digit Grams/1000)
 * Format 2: 13 digits starting with '20' (20 + 5-digit SKU + 5-digit Price/100 + 1-digit check)
 * Format 3: 14 digits starting with '20' (20 + 6-digit SKU + 5-digit Price/100 + 1-digit check)
 */
function parseWeighingScaleBarcode(code, allowWeighInScale = true) {
  if (!allowWeighInScale || !code || typeof code !== 'string') {
    return { isScale: false, code };
  }
  const clean = code.trim();
  if (!clean.startsWith('20')) {
    return { isScale: false, code: clean };
  }

  // 18 digits scale format
  if (clean.length === 18) {
    const skuCode = clean.substring(2, 7);
    const price = parseFloat((parseInt(clean.substring(7, 12), 10) / 100).toFixed(2));
    const weightKg = parseFloat((parseInt(clean.substring(12, 17), 10) / 1000).toFixed(3));
    return {
      isScale: true,
      scaleFormat: '18_DIGITS',
      code: skuCode,
      weightKg: isNaN(weightKg) ? 1 : weightKg,
      encodedPrice: isNaN(price) ? 0 : price,
      lockQty: true,
    };
  }

  // 13 digits scale format
  if (clean.length === 13) {
    const skuCode = clean.substring(2, 7);
    const price = parseFloat((parseInt(clean.substring(7, 12), 10) / 100).toFixed(2));
    return {
      isScale: true,
      scaleFormat: '13_DIGITS',
      code: skuCode,
      encodedPrice: isNaN(price) ? 0 : price,
      lockQty: true,
    };
  }

  // 14 digits scale format
  if (clean.length === 14) {
    const skuCode = clean.substring(2, 8);
    const price = parseFloat((parseInt(clean.substring(8, 13), 10) / 100).toFixed(2));
    return {
      isScale: true,
      scaleFormat: '14_DIGITS',
      code: skuCode,
      encodedPrice: isNaN(price) ? 0 : price,
      lockQty: true,
    };
  }

  return { isScale: false, code: clean };
}

/**
 * 3. Multi-level SKU / Barcode / Carton Barcode Resolver
 */
async function resolveInventoryCode(pool, rawCode) {
  const req = pool.request();
  req.input('inputCode', sql.VarChar(50), rawCode.trim());

  // Level A: Direct match in tblInventory
  const directRes = await req.query(`
    SELECT TOP 1 RTRIM(LTRIM(InventoryCode)) AS InventoryCode
    FROM tblInventory
    WHERE UPPER(RTRIM(LTRIM(InventoryCode))) = UPPER(@inputCode)
  `);
  if (directRes.recordset.length > 0) {
    return {
      resolvedCode: directRes.recordset[0].InventoryCode,
      isCarton: false,
    };
  }

  // Level B: Match in tblInventoryBarcode
  const bcRes = await req.query(`
    SELECT TOP 1 RTRIM(LTRIM(InventoryCode)) AS InventoryCode
    FROM tblInventoryBarcode
    WHERE UPPER(RTRIM(LTRIM(BarCode))) = UPPER(@inputCode)
  `);
  if (bcRes.recordset.length > 0) {
    return {
      resolvedCode: bcRes.recordset[0].InventoryCode,
      isCarton: false,
    };
  }

  // Level C: Match in tblInventoryCartonBarcode
  const cartonRes = await req.query(`
    SELECT TOP 1 
      RTRIM(LTRIM(InventoryCode)) AS InventoryCode,
      ISNULL(CartonRetailPrice, 0) AS CartonRetailPrice,
      RTRIM(LTRIM(ISNULL(UOM, 'PCS'))) AS CartonUOM
    FROM tblInventoryCartonBarcode
    WHERE UPPER(RTRIM(LTRIM(CartonBarcode))) = UPPER(@inputCode)
  `);
  if (cartonRes.recordset.length > 0) {
    const row = cartonRes.recordset[0];
    const cartonPrice = Number(row.CartonRetailPrice) || 0;
    return {
      resolvedCode: row.InventoryCode,
      isCarton: true,
      cartonQty: 1,
      cartonPrice: cartonPrice,
      unitPriceFromCarton: cartonPrice,
      cartonUOM: row.CartonUOM,
    };
  }

  return { resolvedCode: null, isCarton: false };
}

/**
 * 4. Retrieve complete master inventory record and validate item eligibility
 */
async function getInventoryMaster(pool, inventoryCode) {
  const req = pool.request();
  req.input('code', sql.VarChar(50), inventoryCode.trim());
  const res = await req.query(`
    SELECT TOP 1
      RTRIM(LTRIM(InventoryCode)) AS InventoryCode,
      RTRIM(LTRIM(Description)) AS Description,
      RTRIM(LTRIM(ISNULL(ShortDescription, ''))) AS ShortDescription,
      ISNULL(SellingPrice, 0) AS SellingPrice,
      ISNULL(RetailPrice, 0) AS RetailPrice,
      RTRIM(LTRIM(ISNULL(UOM, 'PCS'))) AS UOM,
      ISNULL(IsVoucherItem, 0) AS IsVoucherItem,
      ISNULL(Discontinued, 0) AS Discontinued,
      ISNULL(InActive, 0) AS InActive,
      ISNULL(OpenItem, 0) AS OpenItem,
      ISNULL(ChangeDescription, 0) AS ChangeDescription,
      ISNULL(IsFixedPrice, 0) AS IsFixedPrice,
      ISNULL(AllowZeroPrice, 0) AS AllowZeroPrice,
      ISNULL(AllowMemberPrice, 0) AS AllowMemberPrice,
      ISNULL(SalesmanRequired, 0) AS SalesmanRequired,
      ISNULL(AllowExpireDate, 0) AS AllowExpireDate,
      ISNULL(AllowBatchStock, 0) AS AllowBatchStock,
      ISNULL(SerialNo, 0) AS SerialNo,
      ISNULL(NonTaxItem, 0) AS NonTaxItem,
      ISNULL(OutputTax, 0) AS OutputTax,
      ISNULL(AllowMultipleBin, 0) AS AllowMultipleBin,
      RTRIM(LTRIM(ISNULL(DepartmentCode, ''))) AS DepartmentCode,
      RTRIM(LTRIM(ISNULL(CategoryCode, ''))) AS CategoryCode,
      RTRIM(LTRIM(ISNULL(BrandCode, ''))) AS BrandCode,
      ISNULL(AverageCost, 0) AS AverageCost,
      ISNULL(AllowNegativeStock, 0) AS AllowNegativeStock,
      ISNULL(ChilledPrice, 0) AS ChilledPrice,
      ISNULL(Chilled, 0) AS Chilled,
      ISNULL(AllowPaymodeCommision, 0) AS AllowPaymodeCommision,
      ISNULL(WebInfo, 0) AS WebInfo
    FROM tblInventory
    WHERE UPPER(RTRIM(LTRIM(InventoryCode))) = UPPER(@code)
  `);

  return res.recordset[0] || null;
}

/**
 * 5. Retrieve stock on hand (QOH) from tblInventoryStock
 */
async function getItemStock(pool, inventoryCode, locationCode = 'HQ') {
  const req = pool.request();
  req.input('code', sql.VarChar(50), inventoryCode.trim());
  req.input('loc', sql.VarChar(10), locationCode.trim());

  const res = await req.query(`
    SELECT ISNULL(SUM(QtyOnHand), 0) AS QtyOnHand
    FROM tblInventoryStock
    WHERE UPPER(RTRIM(LTRIM(InventoryCode))) = UPPER(@code)
      AND UPPER(RTRIM(LTRIM(LocationCode))) = UPPER(@loc)
  `);

  return Number(res.recordset[0]?.QtyOnHand || 0);
}

/**
 * 6. Salesman validation against tblInvSalesMan and tblMaSalesMan
 */
async function validateSalesman(pool, salesmanCode) {
  if (!salesmanCode || !salesmanCode.trim()) return null;
  const code = salesmanCode.trim().toUpperCase();

  const req = pool.request();
  req.input('code', sql.VarChar(20), code);

  const res = await req.query(`
    SELECT TOP 1 
      RTRIM(LTRIM(SalesManCode)) AS SalesManCode,
      RTRIM(LTRIM(SalesManName)) AS SalesManName
    FROM tblInvSalesMan
    WHERE UPPER(RTRIM(LTRIM(SalesManCode))) = @code

    UNION

    SELECT TOP 1
      RTRIM(LTRIM(SalesManId)) AS SalesManCode,
      RTRIM(LTRIM(SalesManName)) AS SalesManName
    FROM tblMaSalesMan
    WHERE UPPER(RTRIM(LTRIM(SalesManId))) = @code
  `);

  return res.recordset[0] || null;
}

module.exports = {
  parseQtyPrefix,
  parseWeighingScaleBarcode,
  resolveInventoryCode,
  getInventoryMaster,
  getItemStock,
  validateSalesman,
};
