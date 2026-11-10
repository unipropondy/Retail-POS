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

// ==============================================================================
// IN-MEMORY PROMOTION RULES CACHE (30-Second TTL + Single-Flight Refresh)
// ==============================================================================
const PROMO_CACHE_TTL_MS = 30 * 1000; // 30 seconds

let promoRulesCache = {
  timestamp: 0,
  multiBuyRows: [],
  pairRows: [],
  breakRows: [],
};

let promoRulesRefreshPromise = null;

/**
 * Invalidate the promotion cache immediately (e.g. when promo rules are saved/modified)
 */
function invalidatePromotionCache() {
  promoRulesCache.timestamp = 0;
  promoRulesRefreshPromise = null;
  console.log('🔄 [PROMO CACHE] Promotion rules cache invalidated.');
}

/**
 * Retrieve cached active promotion rules with single-flight refresh
 */
async function getActivePromotionRules(pool) {
  const now = Date.now();
  if (promoRulesCache.timestamp > 0 && now - promoRulesCache.timestamp < PROMO_CACHE_TTL_MS) {
    return {
      cached: true,
      rules: promoRulesCache,
    };
  }

  // Single-flight lock: reuse existing in-progress refresh promise to prevent duplicate SQL requests
  if (promoRulesRefreshPromise) {
    const rules = await promoRulesRefreshPromise;
    return { cached: true, rules };
  }

  promoRulesRefreshPromise = (async () => {
    const t0 = Date.now();
    try {
      const [mbRes, pairRes, breakRes] = await Promise.all([
        pool.request().query(`
          SELECT 
            RTRIM(LTRIM(h.DiscountPriceCode)) AS DiscountPriceCode,
            RTRIM(LTRIM(h.Description)) AS Description,
            ISNULL(h.Qty, 1) AS RequiredQty,
            ISNULL(h.Price, 0) AS BundlePrice,
            ISNULL(h.ActualPrice, 0) AS ActualPrice,
            h.ValidFrom,
            h.ValidTo,
            RTRIM(LTRIM(d.InventoryCode)) AS InventoryCode,
            RTRIM(LTRIM(ISNULL(d.Locationcode, 'HQ'))) AS LocationCode
          FROM tblRMDiscountPriceHeader h
          INNER JOIN tblRMDiscountPriceDetail d ON RTRIM(LTRIM(h.DiscountPriceCode)) = RTRIM(LTRIM(d.DiscountPriceCode))
          WHERE (h.ValidFrom IS NULL OR CONVERT(VARCHAR(10), h.ValidFrom, 120) <= CONVERT(VARCHAR(10), GETDATE(), 120))
            AND (h.ValidTo IS NULL OR CONVERT(VARCHAR(10), h.ValidTo, 120) >= CONVERT(VARCHAR(10), GETDATE(), 120))
        `),
        pool.request().query(`
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
          WHERE (ValidFrom IS NULL OR CONVERT(VARCHAR(10), ValidFrom, 120) <= CONVERT(VARCHAR(10), GETDATE(), 120))
            AND (ValidTo IS NULL OR CONVERT(VARCHAR(10), ValidTo, 120) >= CONVERT(VARCHAR(10), GETDATE(), 120))
        `),
        pool.request().query(`
          SELECT 
            RTRIM(LTRIM(BreakPriceCode)) AS BreakPriceCode,
            RTRIM(LTRIM(InventoryCode)) AS InventoryCode,
            ISNULL(BreakQty, 0) AS BreakQty,
            ISNULL(BreakPrice, 0) AS BreakPrice,
            BreakFromDate,
            BreakToDate,
            RTRIM(LTRIM(ISNULL(LocationCode, 'HQ'))) AS LocationCode
          FROM tblRMBreakPrice
          WHERE (BreakFromDate IS NULL OR CONVERT(VARCHAR(10), BreakFromDate, 120) <= CONVERT(VARCHAR(10), GETDATE(), 120))
            AND (BreakToDate IS NULL OR CONVERT(VARCHAR(10), BreakToDate, 120) >= CONVERT(VARCHAR(10), GETDATE(), 120))
          ORDER BY BreakQty DESC
        `),
      ]);

      promoRulesCache = {
        timestamp: Date.now(),
        multiBuyRows: mbRes.recordset || [],
        pairRows: pairRes.recordset || [],
        breakRows: breakRes.recordset || [],
      };

      console.log(`⚡ [PROMO CACHE REFRESH] Loaded ${promoRulesCache.multiBuyRows.length} MultiBuy, ${promoRulesCache.pairRows.length} Pairs, ${promoRulesCache.breakRows.length} Breaks in ${Date.now() - t0}ms`);
      return promoRulesCache;
    } catch (err) {
      console.error('❌ [PROMO CACHE ERROR] Failed to refresh promotion rules:', err.message);
      // Return stale cache if available, otherwise empty
      return promoRulesCache;
    } finally {
      promoRulesRefreshPromise = null;
    }
  })();

  const rules = await promoRulesRefreshPromise;
  return { cached: false, rules };
}

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
 * 1. Batched Retrieval of Item-Wise Promotion Prices (tblRMPromotionPrice)
 * Mirrors: clsInventory.GetPromotionPriceByItem & GetParticularTimePromotionitem
 * Uses single parameterized SQL query with IN (...) for all distinct items
 */
async function getItemPromotionPricesBatch(pool, inventoryCodes = [], currentDate = new Date()) {
  if (!inventoryCodes || inventoryCodes.length === 0) return new Map();

  const distinctCodes = [...new Set(inventoryCodes.map((c) => String(c).trim().toUpperCase()))].filter(Boolean);
  if (distinctCodes.length === 0) return new Map();

  const t0 = Date.now();
  const req = pool.request();
  const placeholders = distinctCodes.map((c, idx) => {
    req.input(`c_${idx}`, sql.VarChar(50), c);
    return `@c_${idx}`;
  }).join(',');

  const query = `
    SELECT 
      RTRIM(LTRIM(PromotionCode)) AS PromotionCode,
      RTRIM(LTRIM(PromoType)) AS PromoType,
      UPPER(RTRIM(LTRIM(InventoryCode))) AS InventoryCode,
      FromDate,
      ToDate,
      ISNULL(PromoPrice, 0) AS PromoPrice,
      ISNULL(BreakQty, 0) AS BreakQty,
      RTRIM(LTRIM(ISNULL(StartTime, ''))) AS StartTime,
      RTRIM(LTRIM(ISNULL(EndTime, ''))) AS EndTime,
      UPPER(RTRIM(LTRIM(ISNULL(Day, '')))) AS DayOfWeek
    FROM tblRMPromotionPrice
    WHERE UPPER(RTRIM(LTRIM(InventoryCode))) IN (${placeholders})
      AND (PromoType = 'P' OR PromoType = 'PR' OR PromoType IS NULL)
  `;

  let recordset = [];
  try {
    const res = await req.query(query);
    recordset = res.recordset || [];
  } catch (err) {
    console.error('❌ [PROMO BATCH ITEM ERROR]:', err.message);
    return new Map();
  }

  const nowTime = getCurrentTimeString(currentDate);
  const todayDay = getCurrentDayAbbr(currentDate);
  const todayDateStr = currentDate.toISOString().slice(0, 10);

  // Group records by InventoryCode
  const resultMap = new Map();
  for (const promo of recordset) {
    const code = promo.InventoryCode;
    if (resultMap.has(code)) continue; // Keep first qualifying promotion

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
      resultMap.set(code, {
        promotionCode: promo.PromotionCode,
        promoType: promo.PromoType,
        inventoryCode: promo.InventoryCode,
        promoPrice,
        breakQty: Number(promo.BreakQty) || 0,
      });
    }
  }

  console.log(`⏱️ [PROMO BATCH] Fetched item promos for ${distinctCodes.length} items in ${Date.now() - t0}ms`);
  return resultMap;
}

/**
 * Backward compatibility: Single item lookup using the batch engine
 */
async function getItemPromotionPrice(pool, inventoryCode, currentDate = new Date()) {
  if (!inventoryCode) return null;
  const map = await getItemPromotionPricesBatch(pool, [inventoryCode], currentDate);
  return map.get(String(inventoryCode).trim().toUpperCase()) || null;
}

/**
 * 2. Retrieve Multi-Buy Discounts from in-memory cache or fallback
 */
async function getMultiBuyPromotions(pool, inventoryCodes = [], locationCode = 'HQ') {
  if (!inventoryCodes || inventoryCodes.length === 0) return [];
  const cleanCodes = new Set(inventoryCodes.map((c) => String(c).trim().toUpperCase()));
  const targetLoc = (locationCode || 'HQ').trim().toUpperCase();

  const { rules } = await getActivePromotionRules(pool);
  return rules.multiBuyRows.filter((r) => {
    if (!cleanCodes.has(r.InventoryCode.toUpperCase())) return false;
    const rLoc = (r.LocationCode || 'HQ').toUpperCase();
    return rLoc === targetLoc || rLoc === 'HQ' || rLoc === '';
  });
}

/**
 * 3. Retrieve Pair Promotions from in-memory cache or fallback
 */
async function getPairPromotions(pool, inventoryCodes = []) {
  if (!inventoryCodes || inventoryCodes.length === 0) return [];
  const cleanCodes = new Set(inventoryCodes.map((c) => String(c).trim().toUpperCase()));

  const { rules } = await getActivePromotionRules(pool);
  return rules.pairRows.filter((p) => {
    return cleanCodes.has(p.ItemCode1.toUpperCase()) || cleanCodes.has(p.ItemCode2.toUpperCase());
  });
}

/**
 * 4. Retrieve Break Price / Volume Tier Pricing from in-memory cache or fallback
 */
async function getBreakPrices(pool, inventoryCodes = [], locationCode = 'HQ') {
  if (!inventoryCodes || inventoryCodes.length === 0) return [];
  const cleanCodes = new Set(inventoryCodes.map((c) => String(c).trim().toUpperCase()));
  const targetLoc = (locationCode || 'HQ').trim().toUpperCase();

  const { rules } = await getActivePromotionRules(pool);
  return rules.breakRows.filter((b) => {
    if (!cleanCodes.has(b.InventoryCode.toUpperCase())) return false;
    const bLoc = (b.LocationCode || 'HQ').toUpperCase();
    return bLoc === targetLoc || bLoc === 'HQ' || bLoc === '';
  });
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

  const tStartRecalc = Date.now();
  const distinctCodes = [...new Set(cartItems.map((it) => String(it.code || it.InventoryCode || '').trim()))].filter(Boolean);
  if (distinctCodes.length === 0) return cartItems;

  // Pre-fetch active promotions concurrently using in-memory cache and single batch query
  const [multiBuyRows, pairRows, breakRows, itemPromoMap] = await Promise.all([
    getMultiBuyPromotions(pool, distinctCodes, locationCode),
    getPairPromotions(pool, distinctCodes),
    getBreakPrices(pool, distinctCodes, locationCode),
    getItemPromotionPricesBatch(pool, distinctCodes),
  ]);

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
    const rawPrice = it.price !== undefined ? it.price : it.Price;
    const rawNormalPrice = it.normalPrice !== undefined ? it.normalPrice : (it.NormalPrice !== undefined ? it.NormalPrice : rawPrice);
    const normalPrice = Number(rawNormalPrice) || 0;
    const manualDiscount = Number(it.manualDisc !== undefined ? it.manualDisc : (it.ManualDisc || 0)); // Preserves user manual discount
    const currentQty = Number(it.qty !== undefined ? it.qty : (it.Qty !== undefined ? it.Qty : 1)) || 1;
    const cleanCode = String(it.code || it.InventoryCode || it.inventoryCode || '').trim().toUpperCase();

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
  const finalResult = calculatedItems.map((it) => {
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
      Disc: totalLineDiscount,
      amount: safeAmount,
      Amount: safeAmount,
      gst: gstAmount,
      Gst: gstAmount,
      promoName: it.promoName || it.code,
      DiscountPriceCode: it.discountPriceCode,
      DiscPriceQty: it.discPriceQty,
    };
  });

  console.log(`⏱️ [PROMO RECALCULATE] Recalculated ${finalResult.length} cart lines in ${Date.now() - tStartRecalc}ms`);
  return finalResult;
}

/**
 * Helper to update tblTempSales records in a single batched database round-trip
 */
async function batchUpdateTempSalesPromotions(pool, recalculatedItems = []) {
  if (!recalculatedItems || recalculatedItems.length === 0) return;
  const t0 = Date.now();

  const validItems = recalculatedItems.filter((c) => {
    const parsed = parseInt(c.id, 10);
    return !isNaN(parsed) && parsed > 0 && parsed < 2147483647;
  });

  if (validItems.length === 0) return;

  const batchReq = pool.request();
  let sqlBatch = '';

  validItems.forEach((c, idx) => {
    const idParam = `tId_${idx}`;
    const discParam = `d_${idx}`;
    const amtParam = `a_${idx}`;
    const gstParam = `g_${idx}`;
    const dpcParam = `dpc_${idx}`;
    const pnParam = `pn_${idx}`;

    batchReq.input(idParam, sql.Int, parseInt(c.id, 10));
    batchReq.input(discParam, sql.Decimal(18, 2), Number(c.disc) || 0);
    batchReq.input(amtParam, sql.Decimal(18, 2), Number(c.amount) || 0);
    batchReq.input(gstParam, sql.Decimal(18, 2), Number(c.gst) || 0);
    batchReq.input(dpcParam, sql.VarChar(50), String(c.discountPriceCode || '').trim().slice(0, 50));
    batchReq.input(pnParam, sql.VarChar(100), String(c.promoName || c.code || '').trim().slice(0, 100));

    sqlBatch += `
      UPDATE tblTempSales
      SET Discount = @${discParam},
          NetDiscount = @${discParam},
          Amount = @${amtParam},
          GST = @${gstParam},
          DiscountPriceCode = @${dpcParam},
          PromoName = @${pnParam}
      WHERE TempID = @${idParam};
    `;
  });

  try {
    await batchReq.query(sqlBatch);
    console.log(`⏱️ [BATCH UPDATE] Synced ${validItems.length} tblTempSales rows in a single query (${Date.now() - t0}ms)`);
  } catch (err) {
    console.error('❌ [BATCH UPDATE ERROR]:', err.message);
    throw err;
  }
}

module.exports = {
  getItemPromotionPrice,
  getItemPromotionPricesBatch,
  getMultiBuyPromotions,
  getPairPromotions,
  getBreakPrices,
  recalculateCartPromotions,
  batchUpdateTempSalesPromotions,
  invalidatePromotionCache,
  getActivePromotionRules,
};

