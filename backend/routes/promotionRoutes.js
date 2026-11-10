// ==============================================================================
// Project: Supermarket Retail POS
// Module: Promotion Routes
// File: routes/promotionRoutes.js
// Description: API endpoints to evaluate, lookup, and recalculate promotions
// ==============================================================================

const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');
const {
  getItemPromotionPrice,
  getMultiBuyPromotions,
  getPairPromotions,
  getBreakPrices,
  recalculateCartPromotions,
  invalidatePromotionCache,
} = require('../services/promotionService');

/**
 * GET /api/promotions/item-price/:inventoryCode
 * Looks up active promotion price for a single item
 */
router.get('/item-price/:inventoryCode', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const code = req.params.inventoryCode;
    const promo = await getItemPromotionPrice(pool, code);

    return res.status(200).json({
      success: true,
      hasPromotion: !!promo,
      promotion: promo,
    });
  } catch (err) {
    console.error('❌ [PROMOTION ITEM PRICE ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/promotions/recalculate
 * Takes current cart items and returns items with promotions applied
 */
router.post('/recalculate', async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.status(503).json({ success: false, message: 'Database unreachable' });

    const { items = [], locationCode = 'HQ' } = req.body;
    const calculatedItems = await recalculateCartPromotions(pool, items, locationCode);

    return res.status(200).json({
      success: true,
      items: calculatedItems,
    });
  } catch (err) {
    console.error('❌ [PROMOTION RECALCULATE ERROR]:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/promotions/invalidate-cache
 * Flushes active in-memory promotion rules cache (e.g. called after back-office promo edit)
 */
router.post('/invalidate-cache', (req, res) => {
  invalidatePromotionCache();
  return res.status(200).json({
    success: true,
    message: 'Promotion rules cache invalidated successfully',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;

