require('dotenv').config();
const { getPool, sql } = require('./config/db');

async function testWithRealItems() {
  const pool = await getPool();
  // Fetch the items that were in the cart in the screenshot
  // In screenshot 4: Total was $16.10: VEG $0.50, VEG $1.20 ($4.00), VEG $2.00 ($2.00), VEG $3.50 ($3.50)
  const items = await pool.request().query(`
    SELECT TOP 10 InventoryCode, Description, DepartmentCode, CategoryCode, BrandCode, RetailPrice 
    FROM tblInventory 
    WHERE Description LIKE '%VEG%' OR InventoryCode LIKE '%VEG%'
  `);
  console.log('Found VEG items:', items.recordset);

  // Check their CategoryCode and DeptCode lengths:
  items.recordset.forEach(it => {
    console.log(it.InventoryCode, 'Dept:', it.DepartmentCode, 'Len:', (it.DepartmentCode || '').length, 'Cat:', it.CategoryCode, 'Len:', (it.CategoryCode || '').length);
  });
  process.exit(0);
}

testWithRealItems();

