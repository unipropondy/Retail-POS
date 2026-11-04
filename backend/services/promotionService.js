// ==============================================================================
// Project: Supermarket Retail POS
// Module: Promotion Calculation Engine & Database Services
// File: services/promotionService.js
// Description: Implements the exact VB.NET Promotion Architecture from frmPos1.vb,
//              clsInventory.vb, and clsSales.vb for NEW Database:
//              - Item Promotion Price (tblRMPromotionPrice: From/ToDate, Start/EndTime, Day)
//              - Multi-Buy Quantity Discounts (tblRMDiscountPriceHeader / Detail)
//              - Pair Promotions (tblRMDiscountPairPrice)
//              - Volume Tier / Break Price (tblRMBreakPrice)
//              - Exact proportional discount distribution and duplicate discount prevention
// ==============================================================================

const { sql, getPool } = require('../config/db');

/**
 * Helper to get current day of week as 3-letter abbreviation uppercase (e.g. 'MON', 'TUE', 'WED')
 */
function getCurrentDayAbbr(date = new Date()) {
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return days[date.getDay()];
}

/**
 * Helper to format time as 'HH:mm:ss'
 */
function getCurrentTimeString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * 1. Check & Retrieve Item-Wise Promotion Price (tblRMPromotionPrice)
 * Mirrors: clsInventory.GetPromotionPriceByItem & GetParticularTimePromotionitem
 */
async function getItemPromotionPrice(pool, inventoryCode, currentDate = new Date()) {
  if (!inventoryCode || typeof inventoryCode !== 'string') return null;
  const cleanCode = inventoryCode.trim();

  const req = pool.request();
  req.input('code', sql.VarChar(50), cleanCode);

  const query = `
    SELECT 
      RTRIM(LTRIM(PromotionCode)) AS PromotionCode,
      RTRIM(LTRIM(PromoType)) AS PromoType,
      RTRIM(LTRIM(InventoryCode)) AS InventoryCode,
      FromDate,
      ToDate,
      ISNULL(PromoPrice, 0) AS PromoPrice,
      ISNULL(BreakQty, 0) AS BreakQty,
      RTRIM(LTRIM(ISNULL(StartTime, ''))) AS StartTime,
      RTRIM(LTRIM(ISNULL(EndTime, ''))) AS EndTime,
      UPPER(RTRIM(LTRIM(ISNULL(Day, '')))) AS DayOfWeek
    FROM tblRMPromotionPrice
    WHERE UPPER(RTRIM(LTRIM(InventoryCode))) = UPPER(@code)
      AND (PromoType = 'P' OR PromoType = 'PR' OR PromoType IS NULL)
  `;

  const res = await req.query(query);
  if (!res.recordset || res.recordset.length === 0) return null;

  const nowTime = getCurrentTimeString(currentDate);
  const todayDay = getCurrentDayAbbr(currentDate);
  const todayDateStr = currentDate.toISOString().slice(0, 10);

  for (const promo of res.recordset) {
    // 1. Date range validation
    if (promo.FromDate) {
      const fromStr = new Date(promo.FromDate).toISOString().slice(0, 10);
      if (todayDateStr < fromStr) continue;
    }
    if (promo.ToDate) {
      const toStr = new Date(promo.ToDate).toISOString().slice(0, 10);
      if (todayDateStr > toStr) continue;
    }

    // 2. Time-Based Happy Hour validation (StartTime / EndTime)
    if (promo.StartTime && promo.EndTime) {
      const start = promo.StartTime.trim();
      const end = promo.EndTime.trim();
      if (start && end) {
        if (nowTime < start || nowTime > end) continue;
      }
    }

    // 3. Day of week validation (e.g. "MON,TUE,WED")
    if (promo.DayOfWeek && promo.DayOfWeek.trim().length > 0) {
      const validDays = promo.DayOfWeek.split(',').map((d) => d.trim());
      if (!validDays.includes(todayDay)) continue;
    }

    const promoPrice = Number(promo.PromoPrice);
    if (promoPrice > 0) {
      return {
        promotionCode: promo.PromotionCode,
        promoType: promo.PromoType,
        inventoryCode: promo.InventoryCode,
        promoPrice,
        breakQty: Number(promo.BreakQty) || 0,
      };
    }
  }

  return null;
}

/**
 * 2. Retrieve Multi-Buy Discount Header and Details for Items
 * Mirrors: clsInventory.GetDiscountPriceCodeByItem & GetDiscountPriceByCode
 */
async function getMultiBuyPromotions(pool, inventoryCodes = [], locationCode = 'HQ') {
  if (!inventoryCodes || inventoryCodes.length === 0) return [];

  const cleanCodes = inventoryCodes.map((c) => String(c).trim().toUpperCase());
  const req = pool.request();
  req.input('loc', sql.VarChar(20), (locationCode || 'HQ').trim());

  // In parameter list
  const placeholders = cleanCodes.map((c, idx) => {
    req.input(`code_${idx}`, sql.VarChar(50), c);
    return `@code_${idx}`;
  }).join(',');

  const query = `
    SELECT 
      RTRIM(LTRIM(h.DiscountPriceCode)) AS DiscountPriceCode,
      RTRIM(LTRIM(h.Description)) AS Description,
      ISNULL(h.Qty, 1) AS RequiredQty,
      ISNULL(h.Price, 0) AS BundlePrice,
      ISNULL(h.ActualPrice, 0) AS ActualPrice,
      h.ValidFrom,
      h.ValidTo,
      RTRIM(LTRIM(d.InventoryCode)) AS InventoryCode
    FROM tblRMDiscountPriceHeader h
    INNER JOIN tblRMDiscountPriceDetail d ON RTRIM(LTRIM(h.DiscountPriceCode)) = RTRIM(LTRIM(d.DiscountPriceCode))
    WHERE UPPER(RTRIM(LTRIM(d.InventoryCode))) IN (${placeholders})
      AND (d.Locationcode = @loc OR d.Locationcode = 'HQ' OR d.Locationcode IS NULL OR d.Locationcode = '')
      AND (h.ValidFrom IS NULL OR CONVERT(VARCHAR(10), h.ValidFrom, 120) <= CONVERT(VARCHAR(10), GETDATE(), 120))
      AND (h.ValidTo IS NULL OR CONVERT(VARCHAR(10), h.ValidTo, 120) >= CONVERT(VARCHAR(10), GETDATE(), 120))
  `;

  const res = await req.query(query);
  return res.recordset || [];
}

/**
 * 3. Retrieve Pair Promotions (tblRMDiscountPairPrice)
 * Mirrors: clsInventory.GetPairPriceCode & GetDiscountPairPrice
 */
async function getPairPromotions(pool, inventoryCodes = []) {
  if (!inventoryCodes || inventoryCodes.length === 0) return [];

  const cleanCodes = inventoryCodes.map((c) => String(c).trim().toUpperCase());
  const req = pool.request();
  const placeholders = cleanCodes.map((c, idx) => {
    req.input(`pcode_${idx}`, sql.VarChar(50), c);
    return `@pcode_${idx}`;
  }).join(',');

  const query = `
    SELECT 
      RTRIM(LTRIM(DiscountPriceCode)) AS DiscountPriceCode,
      RTRIM(LTRIM(Description)) AS Description,
      RTRIM(LTRIM(ItemCode1)) AS ItemCode1,
      ISNULL(ItemPrice1, 0) AS ItemPrice1,
      RTRIM(LTRIM(ItemCode2)) AS ItemCode2,
      ISNULL(ItemPrice2, 0) AS ItemPrice2,
      ISNULL(TotalPrice, 0) AS TotalPrice,
      ISNULL(DiscountPrice, 0) AS DiscountPrice,
      ValidFrom,
      ValidTo
    FROM tblRMDiscountPairPrice
    WHERE (UPPER(RTRIM(LTRIM(ItemCode1))) IN (${placeholders}) OR UPPER(RTRIM(LTRIM(ItemCode2))) IN (${placeholders}))
      AND (ValidFrom IS NULL OR CONVERT(VARCHAR(10), ValidFrom, 120) <= CONVERT(VARCHAR(10), GETDATE(), 120))
      AND (ValidTo IS NULL OR CONVERT(VARCHAR(10), ValidTo, 120) >= CONVERT(VARCHAR(10), GETDATE(), 120))
  `;

  const res = await req.query(query);
  return res.recordset || [];
}

/**
 * 4. Retrieve Break Price / Volume Tier Pricing (tblRMBreakPrice)
 * Mirrors: clsSales.GetBreakPrice & frmPos1.fncBreakPrice
 */
async function getBreakPrices(pool, inventoryCodes = [], locationCode = 'HQ') {
  if (!inventoryCodes || inventoryCodes.length === 0) return [];

  const cleanCodes = inventoryCodes.map((c) => String(c).trim().toUpperCase());
  const req = pool.request();
  req.input('loc', sql.VarChar(20), (locationCode || 'HQ').trim());

  const placeholders = cleanCodes.map((c, idx) => {
    req.input(`bcode_${idx}`, sql.VarChar(50), c);
    return `@bcode_${idx}`;
  }).join(',');

  const query = `
    SELECT 
      RTRIM(LTRIM(BreakPriceCode)) AS BreakPriceCode,
      RTRIM(LTRIM(InventoryCode)) AS InventoryCode,
      ISNULL(BreakQty, 0) AS BreakQty,
      ISNULL(BreakPrice, 0) AS BreakPrice,
      BreakFromDate,
      BreakToDate
    FROM tblRMBreakPrice
    WHERE UPPER(RTRIM(LTRIM(InventoryCode))) IN (${placeholders})
      AND (LocationCode = @loc OR LocationCode = 'HQ' OR LocationCode IS NULL OR LocationCode = '')
      AND (BreakFromDate IS NULL OR CONVERT(VARCHAR(10), BreakFromDate, 120) <= CONVERT(VARCHAR(10), GETDATE(), 120))
      AND (BreakToDate IS NULL OR CONVERT(VARCHAR(10), BreakToDate, 120) >= CONVERT(VARCHAR(10), GETDATE(), 120))
    ORDER BY BreakQty DESC
  `;

  const res = await req.query(query);
  return res.recordset || [];
}

/**
 * 5. Full POS Cart Promotion Recalculation Engine
 * Executes the exact sequential logic from VB.NET frmPos1.vb:
 *   Step 1: Reset promotional discounts & restore normal selling price
 *   Step 2: Check & apply tblRMBreakPrice volume tier pricing
 *   Step 3: Check & apply tblRMPromotionPrice (Item-level promo price)
 *   Step 4: Check & apply Pair Promotions (tblRMDiscountPairPrice, subGetDiscountPairPrice)
 *   Step 5: Check & apply Multi-Buy Promotions (tblRMDiscountPriceHeader/Detail, subGetDiscountPrice)
 *   Step 6: Recalculate GST & Line Amount
 */
async function recalculateCartPromotions(pool, cartItems = [], locationCode = 'HQ') {
  if (!cartItems || cartItems.length === 0) return [];

  const distinctCodes = [...new Set(cartItems.map((it) => String(it.code || it.InventoryCode || '').trim()))].filter(Boolean);
  if (distinctCodes.length === 0) return cartItems;

  // Pre-fetch active promotions concurrently
  const [multiBuyRows, pairRows, breakRows] = await Promise.all([
    getMultiBuyPromotions(pool, distinctCodes, locationCode),
    getPairPromotions(pool, distinctCodes),
    getBreakPrices(pool, distinctCodes, locationCode),
  ]);

  // Fetch individual item promotion prices
  const itemPromoMap = new Map();
  await Promise.all(
    distinctCodes.map(async (code) => {
      const p = await getItemPromotionPrice(pool, code);
      if (p) itemPromoMap.set(code.toUpperCase(), p);
    })
  );

  // Group Multi-Buy rules by DiscountPriceCode
  const multiBuyMap = new Map();
  for (const row of multiBuyRows) {
    const code = row.DiscountPriceCode;
    if (!multiBuyMap.has(code)) {
      multiBuyMap.set(code, {
        discountPriceCode: code,
        description: row.Description,
        requiredQty: Number(row.RequiredQty),
        bundlePrice: Number(row.BundlePrice),
        eligibleCodes: new Set(),
      });
    }
    multiBuyMap.get(code).eligibleCodes.add(row.InventoryCode.toUpperCase());
  }

  // Deep clone cart items to calculate safely
  const calculatedItems = cartItems.map((it, idx) => {
    const normalPrice = Number(it.normalPrice !== undefined ? it.normalPrice : it.price) || 0;
    const manualDiscount = Number(it.manualDisc || 0); // Preserves user manual discount
    const currentQty = Number(it.qty) || 1;
    const cleanCode = String(it.code || it.InventoryCode || '').trim().toUpperCase();

    return {
      ...it,
      cartIndex: idx,
      code: cleanCode,
      qty: currentQty,
      normalPrice,
      price: normalPrice, // Start with normal price
      manualDisc: manualDiscount,
      promoDisc: 0,
      pairDisc: 0,
      disc: manualDiscount,
      promoCode: '',
      promoName: '',
      discountPriceCode: '',
      discPriceQty: 0,
      allocatedDPQty: 0,
      gstPrec: Number(it.gstPrec !== undefined ? it.gstPrec : (it.TaxPerc !== undefined ? it.TaxPerc : 0)),
    };
  });

  // ----------------------------------------------------------------------------
  // STEP 2: Check Break Price / Volume Tier Pricing (tblRMBreakPrice)
  // frmPos1.vb L4269: If fncBreakPrice(code, qty) Then txtPrice.Text = dBreakPrice
  // ----------------------------------------------------------------------------
  for (const item of calculatedItems) {
    const matchingBreaks = breakRows.filter(
      (b) => b.InventoryCode.toUpperCase() === item.code && item.qty >= Number(b.BreakQty)
    );
    if (matchingBreaks.length > 0) {
      // Pick highest qualifying break quantity
      matchingBreaks.sort((a, b) => Number(b.BreakQty) - Number(a.BreakQty));
      const appliedBreak = matchingBreaks[0];
      const breakPrice = Number(appliedBreak.BreakPrice);
      if (breakPrice > 0 && breakPrice < item.price) {
        item.price = breakPrice;
        item.promoCode = appliedBreak.BreakPriceCode;
        item.promoName = 'BREAK PRICE';
      }
    }
  }

  // ----------------------------------------------------------------------------
  // STEP 3: Check Item Promotion Price (tblRMPromotionPrice)
  // frmPos1.vb L1741: nPromoPrice = objInventory.GetPromotionPriceByItem(...)
  // Price sanity check: PromoPrice is only applied if it is lower than SellingPrice
  // ----------------------------------------------------------------------------
  for (const item of calculatedItems) {
    const promo = itemPromoMap.get(item.code);
    if (promo && promo.promoPrice > 0) {
      if (promo.breakQty === 0 || item.qty >= promo.breakQty) {
        if (promo.promoPrice < item.price) {
          item.price = promo.promoPrice;
          item.promoCode = promo.promotionCode;
          item.promoName = 'PROMO PRICE';
        }
      }
    }
  }

  // ----------------------------------------------------------------------------
  // STEP 4: Pair Promotions (tblRMDiscountPairPrice)
  // Mirrors frmPos1.vb L5552-L5731 (subGetDiscountPairPrice)
  // ----------------------------------------------------------------------------
  for (const pair of pairRows) {
    const item1Code = pair.ItemCode1.toUpperCase();
    const item2Code = pair.ItemCode2.toUpperCase();
    const bundlePrice = Number(pair.DiscountPrice);

    const row1 = calculatedItems.find((it) => it.code === item1Code && it.qty > 0);
    const row2 = calculatedItems.find((it) => it.code === item2Code && it.qty > 0 && it !== row1);

    if (row1 && row2) {
      const qty1 = row1.qty;
      const qty2 = row2.qty;
      const eligiblePairs = Math.min(qty1, qty2);

      if (eligiblePairs > 0) {
        const itemPrice1 = row1.price;
        const itemPrice2 = row2.price;
        const regularTotal = itemPrice1 + itemPrice2;
        const totalPairDiscount = regularTotal - bundlePrice;

        if (totalPairDiscount > 0 && regularTotal > 0) {
          const discountRatio = totalPairDiscount / regularTotal;

          // Prorate discount across Item 1 and Item 2
          const discPerItem1 = parseFloat((itemPrice1 * discountRatio).toFixed(2));
          const discPerItem2 = parseFloat((totalPairDiscount - discPerItem1).toFixed(2));

          const row1PairDisc = parseFloat((eligiblePairs * discPerItem1).toFixed(2));
          const row2PairDisc = parseFloat((eligiblePairs * discPerItem2).toFixed(2));

          row1.pairDisc += row1PairDisc;
          row1.promoCode = pair.DiscountPriceCode;
          row1.promoName = pair.Description || 'PAIR PROMOTION';

          row2.pairDisc += row2PairDisc;
          row2.promoCode = pair.DiscountPriceCode;
          row2.promoName = pair.Description || 'PAIR PROMOTION';
        }
      }
    }
  }

  // ----------------------------------------------------------------------------
  // STEP 5: Multi-Buy / Quantity Discounts (tblRMDiscountPriceHeader / Detail)
  // Mirrors frmPos1.vb L5826-L5975 (subGetDiscountPrice)
  // ----------------------------------------------------------------------------
  for (const [discCode, rule] of multiBuyMap.entries()) {
    // Collect all cart items eligible for this multibuy group
    const eligibleLines = calculatedItems.filter(
      (it) => rule.eligibleCodes.has(it.code) && it.qty > it.allocatedDPQty
    );

    if (eligibleLines.length === 0) continue;

    const totalEligibleQty = eligibleLines.reduce(
      (sum, it) => sum + (it.qty - it.allocatedDPQty),
      0
    );

    const completedSets = Math.floor(totalEligibleQty / rule.requiredQty);
    if (completedSets <= 0) {
      // Quantity threshold not reached yet; tag line for cashier visibility
      for (const it of eligibleLines) {
        it.discountPriceCode = discCode;
        if (!it.promoName) it.promoName = rule.description;
      }
      continue;
    }

    const qtyToDiscount = completedSets * rule.requiredQty;
    const targetSetPrice = completedSets * rule.bundlePrice;

    // Calculate normal retail value of the items that will be discounted
    let accumulatedQty = 0;
    let normalValueForDiscountedQty = 0;

    for (const it of eligibleLines) {
      const remainingLineQty = it.qty - it.allocatedDPQty;
      const takeQty = Math.min(remainingLineQty, qtyToDiscount - accumulatedQty);
      if (takeQty > 0) {
        accumulatedQty += takeQty;
        normalValueForDiscountedQty += takeQty * it.price;
      }
      if (accumulatedQty >= qtyToDiscount) break;
    }

    const totalMultiBuyDiscount = parseFloat(
      (normalValueForDiscountedQty - targetSetPrice).toFixed(2)
    );

    if (totalMultiBuyDiscount > 0 && normalValueForDiscountedQty > 0) {
      const discountPerDollar = totalMultiBuyDiscount / normalValueForDiscountedQty;

      let remainingDiscountToDistribute = totalMultiBuyDiscount;
      let remainingQtyToAllocate = qtyToDiscount;

      for (let i = 0; i < eligibleLines.length; i++) {
        const it = eligibleLines[i];
        const unallocated = it.qty - it.allocatedDPQty;
        const lineAllocQty = Math.min(unallocated, remainingQtyToAllocate);

        if (lineAllocQty > 0) {
          let lineDiscount = 0;
          if (remainingQtyToAllocate - lineAllocQty === 0) {
            // Last line receives exact remainder to avoid rounding drift
            lineDiscount = remainingDiscountToDistribute;
          } else {
            lineDiscount = parseFloat((lineAllocQty * it.price * discountPerDollar).toFixed(2));
            lineDiscount = Math.min(lineDiscount, remainingDiscountToDistribute);
          }

          it.promoDisc += lineDiscount;
          it.allocatedDPQty += lineAllocQty;
          it.discPriceQty += lineAllocQty;
          it.discountPriceCode = discCode;
          it.promoName = rule.description;

          remainingDiscountToDistribute = parseFloat(
            (remainingDiscountToDistribute - lineDiscount).toFixed(2)
          );
          remainingQtyToAllocate -= lineAllocQty;
        }

        if (remainingQtyToAllocate <= 0) break;
      }
    }
  }

  // ----------------------------------------------------------------------------
  // STEP 6: Final Line Totals & Tax Calculation
  // ----------------------------------------------------------------------------
  return calculatedItems.map((it) => {
    const totalLineDiscount = parseFloat(
      (it.manualDisc + it.promoDisc + it.pairDisc).toFixed(2)
    );
    const lineTotal = parseFloat((it.qty * it.price - totalLineDiscount).toFixed(2));
    const safeAmount = Math.max(0, lineTotal);

    // GST calculation (Tax inclusive format matching frmPos1)
    const gstPerc = it.gstPrec || 0;
    const gstAmount = gstPerc > 0 ? parseFloat(((safeAmount * gstPerc) / (100 + gstPerc)).toFixed(2)) : 0;

    return {
      ...it,
      disc: totalLineDiscount,
      amount: safeAmount,
      gst: gstAmount,
      promoName: it.promoName || it.code,
    };
  });
}

module.exports = {
  getItemPromotionPrice,
  getMultiBuyPromotions,
  getPairPromotions,
  getBreakPrices,
  recalculateCartPromotions,
};

