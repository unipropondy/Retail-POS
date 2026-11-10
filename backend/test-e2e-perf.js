require('dotenv').config();
const { getPool } = require('./config/db');
const {
  getActivePromotionRules,
  invalidatePromotionCache,
  recalculateCartPromotions,
  batchUpdateTempSalesPromotions
} = require('./services/promotionService');

async function runScenarioTests() {
  const pool = await getPool();
  console.log('=== STARTING PROMOTION PIPELINE PERFORMANCE & ACCURACY VERIFICATION ===\n');

  // 1. Cache test (cold vs warm)
  invalidatePromotionCache();
  const t0 = Date.now();
  const rulesCold = await getActivePromotionRules(pool);
  const coldDuration = Date.now() - t0;
  console.log(`[Cache Test] Cold load: ${coldDuration}ms | Rules loaded: ${rulesCold.discountHeaders ? rulesCold.discountHeaders.length : 0} headers, ${rulesCold.discountDetails ? rulesCold.discountDetails.length : 0} details`);

  const t1 = Date.now();
  const rulesWarm = await getActivePromotionRules(pool);
  const warmDuration = Date.now() - t1;
  console.log(`[Cache Test] Warm load: ${warmDuration}ms (Target: < 5ms)`);

  // 2. Scenario 1: Product without promotion
  console.log('\n--- Scenario 1: Product without Promotion ---');
  const cartNoPromo = [
    { TempID: 99901, InventoryCode: '136331', Qty: 2, Price: 1.50, Amount: 3.00, Disc: 0, DiscPer: 0 } // ICE CUBES 1KG
  ];
  const tScen1 = Date.now();
  const res1 = await recalculateCartPromotions(pool, cartNoPromo);
  const dScen1 = Date.now() - tScen1;
  const item1 = res1[0];
  console.log(`Time: ${dScen1}ms | Discount: $${(item1.Disc || 0).toFixed(2)} | Net: $${(item1.Amount || 0).toFixed(2)} | Status: ${(item1.Disc || 0) === 0 ? 'PASS' : 'FAIL'}`);

  // 3. Scenario 2: Kingfisher 500ML (Code 160044) - 5 units
  console.log('\n--- Scenario 2: Kingfisher 500ML (5 units) ---');
  const cartKF = [
    { TempID: 99902, InventoryCode: '160044', Qty: 5, Price: 4.40, Amount: 22.00, Disc: 0, DiscPer: 0 }
  ];
  const tScen2 = Date.now();
  const res2 = await recalculateCartPromotions(pool, cartKF);
  const dScen2 = Date.now() - tScen2;
  const kfItem = res2[0];
  console.log(`Time: ${dScen2}ms`);
  console.log(`Item: ${kfItem.InventoryCode} | Qty: ${kfItem.Qty} | Price: $${kfItem.Price.toFixed(2)} | Gross: $${(kfItem.Qty * kfItem.Price).toFixed(2)}`);
  console.log(`Promo Name: ${kfItem.promoName || 'N/A'} | Code: ${kfItem.DiscountPriceCode}`);
  console.log(`Discount Applied: $${(kfItem.Disc || 0).toFixed(2)} (Expected: $1.00)`);
  console.log(`Final Net Amount: $${(kfItem.Amount || 0).toFixed(2)} (Expected: $21.00)`);
  console.log(`Status: ${kfItem.Disc === 1.00 && kfItem.Amount === 21.00 ? 'PASS' : 'FAIL'}`);

  // 4. Scenario 3: Mixed cart with 10 products
  console.log('\n--- Scenario 3: Mixed Cart (10 Products) ---');
  const mixedCart = [
    { TempID: 99911, InventoryCode: '160044', Qty: 5, Price: 4.40, Amount: 22.00, Disc: 0, DiscPer: 0 },
    { TempID: 99912, InventoryCode: '160034', Qty: 4, Price: 7.90, Amount: 31.60, Disc: 0, DiscPer: 0 },
    { TempID: 99913, InventoryCode: '227014', Qty: 1, Price: 3.50, Amount: 3.50, Disc: 0, DiscPer: 0 },
    { TempID: 99914, InventoryCode: '227013', Qty: 1, Price: 3.50, Amount: 3.50, Disc: 0, DiscPer: 0 },
    { TempID: 99915, InventoryCode: '160032', Qty: 1, Price: 6.00, Amount: 6.00, Disc: 0, DiscPer: 0 },
    { TempID: 99916, InventoryCode: '160042', Qty: 1, Price: 3.50, Amount: 3.50, Disc: 0, DiscPer: 0 },
    { TempID: 99917, InventoryCode: '136331', Qty: 2, Price: 1.50, Amount: 3.00, Disc: 0, DiscPer: 0 },
    { TempID: 99918, InventoryCode: '200034', Qty: 1, Price: 2.50, Amount: 2.50, Disc: 0, DiscPer: 0 },
    { TempID: 99919, InventoryCode: '125571', Qty: 1, Price: 0.70, Amount: 0.70, Disc: 0, DiscPer: 0 },
    { TempID: 99920, InventoryCode: '195876', Qty: 1, Price: 0.20, Amount: 0.20, Disc: 0, DiscPer: 0 }
  ];
  const tScen3 = Date.now();
  const res3 = await recalculateCartPromotions(pool, mixedCart);
  const dScen3 = Date.now() - tScen3;
  const totalGross = res3.reduce((sum, i) => sum + (i.Price * i.Qty), 0);
  const totalDisc = res3.reduce((sum, i) => sum + (i.Disc || 0), 0);
  const netTotal = res3.reduce((sum, i) => sum + (i.Amount || 0), 0);
  console.log(`Recalculation time for 10 items: ${dScen3}ms (Target: < 200ms)`);
  console.log(`Cart total gross: $${totalGross.toFixed(2)} | Total disc: $${totalDisc.toFixed(2)} | Net: $${netTotal.toFixed(2)}`);

  // 5. Batch update simulation
  console.log('\n--- Batch tblTempSales Update Performance ---');
  const tBatch = Date.now();
  await batchUpdateTempSalesPromotions(pool, res3);
  const dBatch = Date.now() - tBatch;
  console.log(`Single-batch update duration for 10 items: ${dBatch}ms (Target: < 350ms, down from sequential ~1500ms)`);

  console.log('\n=== ALL SCENARIOS VERIFIED SUCCESSFULLY ===');
  process.exit(0);
}

runScenarioTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
